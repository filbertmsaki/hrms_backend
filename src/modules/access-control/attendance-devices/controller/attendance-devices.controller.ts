import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  ApiGetOneOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { EmployeeDeviceAssignmentMatchQueryDto } from '../dto/employee-device-assignment-match-query.dto';
import { AccessControlAttendanceDevicesService } from '../service/attendance-devices.service';

@ApiTags('Access Control Attendance Devices')
@ApiBearerAuth('access-token')
@Controller('access-control/attendance-devices')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessControlAttendanceDevicesController {
  constructor(
    private readonly attendanceDevicesService: AccessControlAttendanceDevicesService,
  ) {}

  @Post(':id/test-connection')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:update')
  @ApiActionOperation(
    'Test Attendance Device Connection',
    'Test whether the access-control attendance device is reachable',
  )
  testConnection(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceDevicesService.testConnection(
      req.user.companyId!,
      id,
    );
  }

  @Get(':id/sync-status')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_devices:read')
  @ApiGetOneOperation(
    'Attendance Device Sync Status',
    'Get attendance device connection and sync status',
  )
  getSyncStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceDevicesService.getSyncStatus(
      req.user.companyId!,
      id,
    );
  }

  @Get('employee-device-assignment-matches')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation(
    'Employee Device Assignment Matches',
    'Search unassigned device users that look like one employee based on name variations',
  )
  searchEmployeeDeviceAssignmentMatches(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeeDeviceAssignmentMatchQueryDto,
  ) {
    return this.attendanceDevicesService.searchEmployeeDeviceAssignmentMatches(
      req.user.companyId!,
      query,
    );
  }
}
