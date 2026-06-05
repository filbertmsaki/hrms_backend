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
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceDeviceEmployeesQueryDto } from '../dtos/attendance-device-employees-query.dto';
import { AttendanceDeviceQueryDto } from '../dtos/attendance-device-query.dto';
import { CreateAttendanceDeviceDto } from '../dtos/create-attendance-device.dto';
import { UpdateAttendanceDeviceDto } from '../dtos/update-attendance-device.dto';
import { AccessControlAttendanceDevicesService } from '../service/attendance-devices.service';

@ApiTags('Attendance Devices')
@ApiBearerAuth('access-token')
@Controller('attendance/devices')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceDevicesController {
  constructor(
    private readonly attendanceDevicesService: AccessControlAttendanceDevicesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:create')
  @ApiCreateOperation('Attendance Device', 'Create attendance device')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceDeviceDto,
  ) {
    return this.attendanceDevicesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiListOperation('Attendance Device', 'List attendance devices')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceDeviceQueryDto,
  ) {
    return this.attendanceDevicesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiGetOneOperation('Attendance Device', 'Get attendance device by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceDevicesService.findOne(req.user.companyId!, id);
  }

  @Get(':id/employees')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiListOperation(
    'Attendance Device Employees',
    'List employees currently assigned/synced for one attendance device',
  )
  findDeviceEmployees(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AttendanceDeviceEmployeesQueryDto,
  ) {
    return this.attendanceDevicesService.findDeviceEmployees(
      req.user.companyId!,
      id,
      query,
    );
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiUpdateOperation('Attendance Device', 'Update attendance device')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDeviceDto,
  ) {
    return this.attendanceDevicesService.update(req.user.companyId!, id, dto);
  }

  @Post(':id/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation(
    'Sync Attendance Device Data',
    'Manually sync device information and capabilities into the attendance device record',
  )
  syncDeviceData(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceDevicesService.syncDeviceData(req.user.companyId!, id);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:delete')
  @ApiDeleteOperation('Attendance Device', 'Delete attendance device')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceDevicesService.remove(req.user.companyId!, id);
  }
}
