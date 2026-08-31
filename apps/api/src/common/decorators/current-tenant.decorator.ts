import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@sopon/contracts';

export interface ActiveTenantContext {
  organizationId: string;
  role: UserRole;
  membershipId: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveTenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);