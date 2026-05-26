import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../docs/swagger-decorators';
import { CreateHikvisionDeviceDto } from './dto/create-hikvision-device.dto';
import { HikvisionDeviceQueryDto } from './dto/hikvision-device-query.dto';
import { SyncAllHikvisionDevicesDto } from './dto/sync-all-hikvision-devices.dto';
import { UpdateHikvisionDeviceDto } from './dto/update-hikvision-device.dto';
import { HikvisionService } from './hikvision.service';

@ApiTags('Hikvision Device Management')
@ApiBearerAuth('access-token')
@Controller('hikvision/devices-admin')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionController {
  constructor(private readonly hikvisionService: HikvisionService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:create')
  @ApiCreateOperation('Hikvision Device', 'Create and sync Hikvision device')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateHikvisionDeviceDto,
  ) {
    return this.hikvisionService.createDevice(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiListOperation('Hikvision Device', 'List Hikvision devices')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: HikvisionDeviceQueryDto,
  ) {
    return this.hikvisionService.listDevices(req.user.companyId!, query);
  }

  @Post('sync-all')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation('Sync all Hikvision devices', 'Sync all Hikvision devices safely')
  syncAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SyncAllHikvisionDevicesDto,
  ) {
    return this.hikvisionService.syncAllDevices(req.user.companyId!, dto);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiGetOneOperation('Hikvision Device', 'Get Hikvision device by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.getDevice(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiUpdateOperation('Hikvision Device', 'Update Hikvision device')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHikvisionDeviceDto,
  ) {
    return this.hikvisionService.updateDevice(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:delete')
  @ApiDeleteOperation('Hikvision Device', 'Delete Hikvision device')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.deleteDevice(req.user.companyId!, id);
  }

  @Post(':id/test-connection')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiActionOperation('Test Hikvision device connection', 'Validate digest auth and ISAPI reachability')
  testConnection(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.testDeviceConnection(req.user.companyId!, id);
  }

  @Post(':id/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation('Sync Hikvision device', 'Sync one Hikvision device using safe overwrite rules')
  syncOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.syncDevice(req.user.companyId!, id);
  }
}
