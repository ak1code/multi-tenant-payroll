import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from '../context/tenant.context';
import { AuthUser } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (user) {
      this.tenantContext.set(user.tenantId, user.userId, user.role);
    }

    return next.handle();
  }
}
