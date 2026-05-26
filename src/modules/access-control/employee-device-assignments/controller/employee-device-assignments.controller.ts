import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
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
  ApiDeleteOperation,
} from '../../../../docs/swagger-decorators';
import { AssignEmployeeDevicesDto } from '../dto/assign-employee-devices.dto';
import { EmployeeDeviceAssignmentsService } from '../service/employee-device-assignments.service';

@ApiTags('Access Control Employee Device Assignments')
@ApiBearerAuth('access-token')
@Controller('access-control/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeDeviceAssignmentsController {
  constructor(private readonly assignmentsService: EmployeeDeviceAssignmentsService) {}

  @Post(':employeeId/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:create')
  @ApiActionOperation('Assign Employee Devices', 'Assign one employee to multiple devices')
  assignDevices(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignEmployeeDevicesDto,
  ) {
    return this.assignmentsService.assignDevices(req.user.companyId!, employeeId, dto);
  }

  @Delete(':employeeId/devices/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:delete')
  @ApiDeleteOperation('Employee Device Assignment', 'Remove employee assignment from one device')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.removeAssignment(req.user.companyId!, employeeId, deviceId);
  }
}
