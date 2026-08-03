import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PERMISSION_MATCH_MODE_KEY,
  PERMISSIONS_KEY,
  PermissionMatchMode,
} from '../decorators/permissions.decorator';
import { hasPermission } from '../utils/permission.util';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { SecurityEventsService } from '../../modules/security/security-events.service';
import { SecurityEventType } from '../../modules/security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../modules/security/enums/security-event-outcome.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndMerge<string[]>(
      PERMISSIONS_KEY,
      [context.getClass(), context.getHandler()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const matchMode =
      this.reflector.getAllAndOverride<PermissionMatchMode>(
        PERMISSION_MATCH_MODE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? PermissionMatchMode.ALL;

    const request = context.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
      }
    >();
    const user = request.user;

    if (!user) {
      await this.securityEventsService.logBestEffort({
        eventType: SecurityEventType.ACCESS_DENIED,
        outcome: SecurityEventOutcome.DENIED,
        reason: 'No authenticated user resolved before permission check',
        metadata: {
          required_permissions: requiredPermissions,
          match_mode: matchMode,
          method: request.method,
          path: request.originalUrl ?? request.url,
        },
      });

      throw new UnauthorizedException('Authentication is required');
    }

    const missingPermissions = requiredPermissions.filter(
      (permission) => !hasPermission(user.permissions, permission),
    );

    const allowed =
      matchMode === PermissionMatchMode.ANY
        ? missingPermissions.length < requiredPermissions.length
        : missingPermissions.length === 0;

    if (!allowed) {
      await this.securityEventsService.logBestEffort({
        eventType: SecurityEventType.ACCESS_DENIED,
        outcome: SecurityEventOutcome.DENIED,
        actor: user,
        reason: 'Required permission check failed',
        metadata: {
          required_permissions: requiredPermissions,
          missing_permissions: missingPermissions,
          match_mode: matchMode,
          method: request.method,
          path: request.originalUrl ?? request.url,
        },
      });

      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
