import { UserRole } from '../../common/constants';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: UserRole;
}
