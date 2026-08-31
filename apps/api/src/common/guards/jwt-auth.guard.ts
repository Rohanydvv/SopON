import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { getEnvConfig } from '@sopon/config';
import { ErrorCodes } from '@sopon/contracts';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7);
    const config = getEnvConfig();

    try {
      const decoded = jwt.verify(token, config.AUTH_SECRET) as JwtPayload;
      request.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
      };
      return true;
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException({
          code: ErrorCodes.TOKEN_EXPIRED,
          message: 'Access token has expired',
        });
      }
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_TOKEN,
        message: 'Invalid access token',
      });
    }
  }
}