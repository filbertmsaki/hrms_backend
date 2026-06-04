import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiListOperation } from '../../../../docs/swagger-decorators';
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
