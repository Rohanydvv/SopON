import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import { ErrorCodes, MembershipStatus } from '@sopon/contracts';

@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication required to access tenant resource',
      });
    }

    // Extract orgId from route params or fallback header
    const orgId = request.params.orgId || request.headers['x-organization-id'];

    if (!orgId) {
      throw new ForbiddenException({
        code: ErrorCodes.TENANT_MISMATCH,
        message: 'Organization context is required for this route',
      });
    }

    // Validate that user is an ACTIVE member of this organization
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      // Return 403 to ensure complete tenant isolation
      throw new ForbiddenException({
        code: ErrorCodes.TENANT_MISMATCH,
        message: 'Access denied: You are not a member of this organization',
      });
    }

    // Attach verified tenant context to request
    request.tenant = {
      organizationId: membership.organizationId,
      role: membership.role,
      membershipId: membership.id,
      organization: membership.organization,
    };

    return true;
  }
}