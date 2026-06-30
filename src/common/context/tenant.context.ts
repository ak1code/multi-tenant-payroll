import { Injectable, Scope } from '@nestjs/common';
import { UserRole } from '../constants';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  tenantId!: string;
  userId!: string;
  role!: UserRole;

  set(tenantId: string, userId: string, role: UserRole): void {
    this.tenantId = tenantId;
    this.userId = userId;
    this.role = role;
  }
}
