import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { UsersService } from '../../src/users/users.service';

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    _id: { toString: () => 'user123' },
    tenantId: { toString: () => 'tenant123' },
    role: 'ADMIN',
    passwordHash: '',
    refreshToken: null as string | null,
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('Admin@123', 12);
    mockUser.refreshToken = null;

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateRefreshToken: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          'jwt.secret': 'secret',
          'jwt.expiresIn': '15m',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiresIn': '7d',
        };
        return map[key];
      }),
    } as unknown as ConfigService;

    authService = new AuthService(usersService, jwtService, configService);
  });

  it('valid credentials → returns tokens', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser as never);
    usersService.updateRefreshToken.mockResolvedValue(undefined);

    const result = await authService.login('admin@alpha.com', 'Admin@123');

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
      'user123',
      hashRefreshToken('signed-token'),
    );
  });

  it('invalid password → throws UnauthorizedException', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser as never);

    await expect(authService.login('admin@alpha.com', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('reusing old refresh token → throws UnauthorizedException', async () => {
    const oldRefreshToken = 'old-refresh-token';
    mockUser.refreshToken = hashRefreshToken(oldRefreshToken);

    jwtService.verify.mockReturnValue({ sub: 'user123', type: 'refresh' });
    usersService.findById.mockResolvedValue(mockUser as never);

    await expect(authService.refresh('new-invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
