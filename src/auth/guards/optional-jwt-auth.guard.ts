import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    // If error or no user, do not throw 401; simply return undefined or null as guest
    if (err || !user) {
      return undefined as unknown as TUser;
    }
    return user;
  }
}
