import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthSessionUser } from '@sopon/contracts';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthSessionUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);