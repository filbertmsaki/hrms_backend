import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiGetOneOperation, ApiListOperation } from '../../../../docs/swagger-decorators';
import { QueryDeviceCommandLogDto } from '../dto/query-device-command-log.dto';
import { DeviceCommandLogService } from '../../../hikvision/device-command-logs/service/device-command-log.service';

@ApiTags('Access Control Device Command Logs')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class DeviceCommandLogsController {
  constructor(private readonly deviceCommandLogService: DeviceCommandLogService) {}

  @Get('device-command-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Device Command Logs', 'List Hikvision ISAPI command logs')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryDeviceCommandLogDto,
  ) {
    return this.deviceCommandLogService.findAll(req.user.companyId!, query);
  }

  @Get('device-command-logs/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiGetOneOperation('Device Command Log', 'Get one Hikvision ISAPI command log')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.deviceCommandLogService.findOne(req.user.companyId!, id);
  }

  @Get('devices/:deviceId/command-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Device Command Logs by Device', 'List Hikvision command logs for one device')
  findByDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: QueryDeviceCommandLogDto,
  ) {
    return this.deviceCommandLogService.findAll(req.user.companyId!, {
      ...query,
      deviceId,
    });
  }
}

