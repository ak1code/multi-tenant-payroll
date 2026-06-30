import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { UserRole } from '../../src/common/constants';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createContext = (role: UserRole): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'u1', tenantId: 't1', role },
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('ADMIN can access upload endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
  });

  it('HR cannot access upload endpoint → false', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(createContext(UserRole.HR))).toBe(false);
  });

  it('SUPERVISOR cannot access upload endpoint → false', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(createContext(UserRole.SUPERVISOR))).toBe(false);
  });

  it('SUPERVISOR can access search when allowed', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN, UserRole.HR, UserRole.SUPERVISOR]);
    expect(guard.canActivate(createContext(UserRole.SUPERVISOR))).toBe(true);
  });

  it('returns true when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext(UserRole.HR))).toBe(true);
  });
});

describe('ROLES_KEY', () => {
  it('is defined', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
