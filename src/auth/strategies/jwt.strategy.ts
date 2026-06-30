import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? 'dev-secret',
    });
  }

  validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
