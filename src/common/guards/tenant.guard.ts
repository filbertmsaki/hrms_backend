import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    if (
      request.user?.scope !== 'company' ||
      !request.user.companyId ||
      !request.user.companyMembershipId
    ) {
      throw new ForbiddenException('Active company context is required');
    }

    return true;
  }
}
