import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean } from 'class-validator';
import { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { DeviceReconciliationService } from './device-reconciliation.service';
class ReaderPolicyDto {
  @IsBoolean() enabled: boolean;
}

@Controller('access-control/reconciliation-devices')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
@Permissions(
  'access_control_sync:execute',
  'access_groups:update',
  'employee_device_assignments:update',
  'data_scope:company',
)
export class DeviceReconciliationController {
  constructor(private readonly service: DeviceReconciliationService) {}
  @Get(':id')
  state(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.state(req.user, id);
  }
  @Put(':id')
  configure(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReaderPolicyDto,
  ) {
    return this.service.configure(req.user, id, dto.enabled);
  }
}
