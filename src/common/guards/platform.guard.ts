import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    if (
      request.user?.scope !== 'platform' ||
      request.user.userType !== 'OWNER'
    ) {
      throw new ForbiddenException('Platform access is required');
    }

    return true;
  }
}
