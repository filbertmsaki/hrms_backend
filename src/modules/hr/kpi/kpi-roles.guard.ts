import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAnyPermission } from '../../../common/utils/permission.util';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

export const KpiRoles = (...roles: string[]) => SetMetadata('kpi_roles', roles);
export const KpiPermissions = (...permissions: string[]) =>
  SetMetadata('kpi_permissions', permissions);
@Injectable()
export class KpiRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles =
      this.reflector.getAllAndOverride<string[]>('kpi_roles', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    const permissions =
      this.reflector.getAllAndOverride<string[]>('kpi_permissions', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (
      !user?.companyId ||
      !(
        roles.some((role) => user.roles.includes(role)) ||
        hasAnyPermission(user.permissions, permissions)
      )
    )
      throw new ForbiddenException('KPI role and active company are required');
    return true;
  }
}
