import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AccessControlSyncService } from '../../service/access-control-sync.service';
import { HrAccessService } from '../../../hr/shared/hr-access.service';

@ApiTags('Access Control Effective Rights')
@ApiBearerAuth('access-token')
@Controller('access-control/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EffectiveAccessController {
  constructor(
    private readonly service: AccessControlSyncService,
    private readonly hrAccess: HrAccessService,
  ) {}

  @Get(':employeeId/devices/:deviceId/effective-access')
  @Permissions('access_groups:read')
  async preview(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query('exclude_group_id', new ParseIntPipe({ optional: true }))
    excludedGroupId?: number,
  ) {
    const accessibleEmployees = await this.hrAccess.getAccessibleEmployeeIds(
      req.user,
    );
    if (accessibleEmployees && !accessibleEmployees.includes(employeeId))
      throw new ForbiddenException(
        'You do not have access to the requested employee',
      );
    const result = await this.service.previewEffectiveAccess(
      req.user.companyId!,
      employeeId,
      deviceId,
      excludedGroupId,
    );
    if (!result.device_branch_id && !this.hrAccess.hasCompanyScope(req.user))
      throw new ForbiddenException(
        'Company scope is required for a device without a branch',
      );
    await this.hrAccess.assertCanAccessBranch(
      req.user,
      result.device_branch_id,
    );
    return result;
  }
}
