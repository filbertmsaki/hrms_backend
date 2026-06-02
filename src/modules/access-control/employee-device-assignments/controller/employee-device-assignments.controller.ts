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
  ApiDeleteOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { AssignEmployeeDevicesDto } from '../dto/assign-employee-devices.dto';
import { HikvisionUserSearchQueryDto } from '../dto/hikvision-user-search-query.dto';
import { UpdateEmployeeDeviceUserDto } from '../dto/update-employee-device-user.dto';
import { EmployeeDeviceAssignmentsService } from '../service/employee-device-assignments.service';

@ApiTags('Access Control Employee Device Assignments')
@ApiBearerAuth('access-token')
@Controller('access-control/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeDeviceAssignmentsController {
  constructor(private readonly assignmentsService: EmployeeDeviceAssignmentsService) {}

  @Get(':employeeId/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation('Employee Device Assignments', 'List one employee device assignments')
  findAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.assignmentsService.listAssignments(req.user.companyId!, employeeId);
  }

  @Post(':employeeId/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:create')
  @ApiActionOperation(
    'Assign Employee Devices',
    'Register one HR employee on one or many Hikvision devices using one access group as the permission source',
  )
  assignDevices(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignEmployeeDevicesDto,
  ) {
    return this.assignmentsService.assignDevices(req.user.companyId!, employeeId, dto);
  }

  @Post(':employeeId/devices/:deviceId/users/register')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:create')
  @ApiActionOperation(
    'Register Device User',
    'Create/register the linked employee as a Hikvision user on one device using the selected access group',
  )
  registerUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: UpdateEmployeeDeviceUserDto,
  ) {
    return this.assignmentsService.registerUser(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto,
    );
  }

  @Patch(':employeeId/devices/:deviceId/users')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiUpdateOperation(
    'Modify Device User',
    'Modify the Hikvision device user first using the selected access group, then update the linked assignment in the database',
  )
  modifyUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: UpdateEmployeeDeviceUserDto,
  ) {
    return this.assignmentsService.modifyUser(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto,
    );
  }

  @Get('devices/:deviceId/users')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation('Search Device Users', 'Search all users on one Hikvision device')
  searchUsers(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: HikvisionUserSearchQueryDto,
  ) {
    return this.assignmentsService.searchUsers(req.user.companyId!, deviceId, query);
  }

  @Get(':employeeId/devices/:deviceId/users')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiActionOperation(
    'Search One Device User',
    'Search the linked employee user on one Hikvision device',
  )
  getUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.getUser(req.user.companyId!, employeeId, deviceId);
  }

  @Patch(':employeeId/devices/:deviceId/users/disable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Disable Device User Access',
    'Disable a linked employee user on the device first, then persist the change locally',
  )
  disableUserAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.disableUserAccessTemporarily(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/enable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Enable Device User Access',
    'Enable a linked employee user on the device first, then persist the change locally',
  )
  enableUserAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.enableUserAccess(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/remove-door-permission')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Remove Door Permission Only',
    'Remove door rights on the device first, then clear right-plan data locally',
  )
  removeDoorPermissionOnly(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.removeDoorPermissionOnly(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Delete(':employeeId/devices/:deviceId/users')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:delete')
  @ApiDeleteOperation(
    'Delete Device User',
    'Delete the user on the Hikvision device first, then remove the local assignment',
  )
  deleteUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.deleteUserOnly(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Post(':employeeId/devices/:deviceId/users/resync')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Resync Device User',
    'Rebuild the Hikvision user from HR employee data and the stored access group permissions, then sync it to the device',
  )
  resyncUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.resyncUser(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Delete(':employeeId/devices/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:delete')
  @ApiDeleteOperation(
    'Employee Device Assignment',
    'Remove employee assignment from one device after deleting the user on that device',
  )
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.removeAssignment(req.user.companyId!, employeeId, deviceId);
  }
}
