import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes, UserRole } from '@sopon/contracts';
import { ROLES_KEY } from '../decorators/roles.decorator';

const RoleHierarchy: Record<UserRole, number> = {
  [UserRole.OWNER]: 5,
  [UserRole.ADMIN]: 4,
  [UserRole.MANAGER]: 3,
  [UserRole.ENGINEER]: 2,
  [UserRole.VIEWER]: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;

    if (!tenant || !tenant.role) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Tenant role context missing',
      });
    }

    const userRoleLevel = RoleHierarchy[tenant.role as UserRole] ?? 0;
    const hasPermission = requiredRoles.some((role) => {
      const requiredLevel = RoleHierarchy[role] ?? 0;
      return userRoleLevel >= requiredLevel;
    });

    if (!hasPermission) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: `Insufficient permissions: Required role in [${requiredRoles.join(', ')}]`,
      });
    }

    return true;
  }
}