import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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

@ApiTags('Device Setup Preview')
@ApiBearerAuth('access-token')
@Controller('access-control/device-setup')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class DeviceSetupPreviewController {
  constructor(private readonly service: AccessControlSyncService) {}
  @Get(':deviceId/preview')
  @Permissions(
    'attendance_devices:read',
    'access_groups:read',
    'data_scope:company',
  )
  preview(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.service.previewDeviceSetup(req.user.companyId!, deviceId);
  }
}
