import {
  Body,
  Controller,
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
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation, ApiCreateOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { CreateHikvisionDeviceDto } from './dto/create-hikvision-device.dto';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import { HikvisionService } from './hikvision.service';

class UpdateHikvisionDeviceDto extends PartialType(CreateHikvisionDeviceDto) {}

class HikvisionDeviceFilterDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

@ApiTags('Hikvision Attendance')
@ApiBearerAuth('access-token')
@Controller('hikvision')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionController {
  constructor(private readonly hikvisionService: HikvisionService) {}

  @Post('devices')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:create')
  @ApiCreateOperation('Hikvision Device', 'Create Hikvision device')
  createDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateHikvisionDeviceDto,
  ) {
    return this.hikvisionService.createDevice(req.user.companyId!, dto);
  }

  @Patch('devices/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiUpdateOperation('Hikvision Device', 'Update Hikvision device')
  updateDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHikvisionDeviceDto,
  ) {
    return this.hikvisionService.updateDevice(req.user.companyId!, id, dto);
  }

  @Get('devices')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiListOperation('Hikvision Device', 'List Hikvision devices')
  getDevices(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: HikvisionDeviceFilterDto,
  ) {
    return this.hikvisionService.getDevices(req.user.companyId!, {
      branch_id: query.branch_id,
      is_active: query.is_active,
    });
  }

  @Post('devices/:id/test')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiActionOperation('Test Hikvision Device', 'Test Hikvision device connection and auth')
  testDeviceConnection(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.testDeviceConnection(req.user.companyId!, id);
  }

  @Post('devices/:id/sync-attendance')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation('Sync Hikvision Attendance', 'Pull historical attendance from Hikvision device')
  syncAttendance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncAttendanceDto,
  ) {
    return this.hikvisionService.syncAttendance(req.user.companyId!, id, dto);
  }

  @Get('attendance-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiListOperation('Hikvision Attendance Log', 'List Hikvision attendance logs')
  getAttendanceLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceFilterDto,
  ) {
    return this.hikvisionService.getAttendanceLogs(req.user.companyId!, query);
  }

  @Post('devices/:id/start-listener')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation('Start Hikvision Listener', 'Start real-time alert stream listener')
  startListener(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.startAlertStream(req.user.companyId!, id);
  }

  @Post('devices/:id/stop-listener')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation('Stop Hikvision Listener', 'Stop real-time alert stream listener')
  stopListener(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hikvisionService.stopAlertStream(req.user.companyId!, id);
  }
}
