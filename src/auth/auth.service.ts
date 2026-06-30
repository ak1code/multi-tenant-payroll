import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { BCRYPT_SALT_ROUNDS, UserRole } from '../common/constants';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface RefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user._id.toString(), user.tenantId.toString(), user.role);
  }

  async refresh(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenValid = this.hashRefreshToken(refreshToken) === user.refreshToken;
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user._id.toString(), user.tenantId.toString(), user.role);
  }

  async logout(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      return { message: 'Logged out' };
    }

    const tokenValid = this.hashRefreshToken(refreshToken) === user.refreshToken;
    if (tokenValid) {
      await this.usersService.updateRefreshToken(userId, null);
    }

    return { message: 'Logged out' };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private async issueTokens(userId: string, tenantId: string, role: UserRole) {
    const payload: JwtPayload = { sub: userId, tenantId, role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret') ?? 'dev-secret',
      expiresIn: (this.configService.get<string>('jwt.expiresIn') ?? '15m') as `${number}m`,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh', jti: randomUUID() } satisfies RefreshPayload,
      {
        secret: this.configService.get<string>('jwt.refreshSecret') ?? 'dev-refresh-secret',
        expiresIn: (this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d') as `${number}d`,
      },
    );

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    await this.usersService.updateRefreshToken(userId, refreshTokenHash);

    return { accessToken, refreshToken };
  }
}
