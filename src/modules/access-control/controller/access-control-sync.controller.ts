import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation } from '../../../docs/swagger-decorators';
import { AccessControlSyncService } from '../service/access-control-sync.service';

@ApiTags('Access Control Synchronization')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessControlSyncController {
  constructor(private readonly accessControlSyncService: AccessControlSyncService) {}

  @Post('employees/:employeeId/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Employee Access', 'Sync one employee access rights to relevant devices')
  syncEmployee(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.accessControlSyncService.syncEmployee(req.user.companyId!, employeeId);
  }

  @Post('sync/full-device/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Full Device Sync', 'Sync all access groups that affect one device')
  fullDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.accessControlSyncService.syncFullDevice(req.user.companyId!, deviceId);
  }

  @Post('sync/full-company/:companyId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Full Company Sync', 'Sync all active access groups for the active company')
  fullCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.accessControlSyncService.syncFullCompany(req.user.companyId!, companyId);
  }
}
