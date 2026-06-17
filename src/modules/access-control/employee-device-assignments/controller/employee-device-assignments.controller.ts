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
import { CaptureEmployeeDeviceFingerprintDto } from '../dto/capture-employee-device-fingerprint.dto';
import { CreateEmployeeDeviceFingerprintFromRecordDto } from '../dto/create-employee-device-fingerprint-from-record.dto';
import { CreateEmployeeDeviceCardDto } from '../dto/create-employee-device-card.dto';
import { DeleteEmployeeDeviceFingerprintDto } from '../dto/delete-employee-device-fingerprint.dto';
import { DeleteEmployeeDevicePasswordDto } from '../dto/delete-employee-device-password.dto';
import { HikvisionUserSearchQueryDto } from '../dto/hikvision-user-search-query.dto';
import { SetEmployeeDevicePasswordDto } from '../dto/set-employee-device-password.dto';
import { SyncEmployeeDeviceCardDto } from '../dto/sync-employee-device-card.dto';
import { SyncEmployeeDeviceFingerprintDto } from '../dto/sync-employee-device-fingerprint.dto';
import { UpdateEmployeeDeviceCardDto } from '../dto/update-employee-device-card.dto';
import { UpdateEmployeeDeviceFingerprintDto } from '../dto/update-employee-device-fingerprint.dto';
import { UpdateEmployeeDeviceUserDto } from '../dto/update-employee-device-user.dto';
import { EmployeeDeviceAssignmentsService } from '../service/employee-device-assignments.service';

@ApiTags('Access Control Employee Device Assignments')
@ApiBearerAuth('access-token')
@Controller('access-control/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeDeviceAssignmentsController {
  constructor(
    private readonly assignmentsService: EmployeeDeviceAssignmentsService,
  ) {}

  @Get(':employeeId/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation(
    'Employee Device Assignments',
    'List one employee device assignments',
  )
  findAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.assignmentsService.listAssignments(
      req.user.companyId!,
      employeeId,
    );
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
    return this.assignmentsService.assignDevices(
      req.user.companyId!,
      employeeId,
      dto,
    );
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
  @ApiListOperation(
    'Search Device Users',
    'Search all users on one Hikvision device',
  )
  searchUsers(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: HikvisionUserSearchQueryDto,
  ) {
    return this.assignmentsService.searchUsers(
      req.user.companyId!,
      deviceId,
      query,
    );
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
    return this.assignmentsService.getUser(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Get(':employeeId/devices/:deviceId/users/fingerprints')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation(
    'List Device Fingerprints',
    'List backend-managed fingerprints for one employee-device assignment',
  )
  listFingerprints(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.listFingerprints(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Get(':employeeId/devices/:deviceId/users/cards')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:read')
  @ApiListOperation(
    'List Device Cards',
    'List backend-managed cards for one employee-device assignment',
  )
  listCards(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.assignmentsService.listCards(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }

  @Post(':employeeId/devices/:deviceId/users/cards')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Create Device Card',
    'Create or reuse one backend card for the employee and optionally synchronize it to the assigned Hikvision device',
  )
  createCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: CreateEmployeeDeviceCardDto,
  ) {
    return this.assignmentsService.createCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/cards/:cardId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiUpdateOperation(
    'Modify Device Card',
    'Modify one backend card and optionally resynchronize it to the assigned Hikvision device',
  )
  modifyCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() dto: UpdateEmployeeDeviceCardDto,
  ) {
    return this.assignmentsService.modifyCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      cardId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Post(':employeeId/devices/:deviceId/users/cards/:cardId/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Sync Device Card',
    'Synchronize one saved backend card to the assigned Hikvision device so the same employee card can be reused across devices',
  )
  syncCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() dto: SyncEmployeeDeviceCardDto,
  ) {
    return this.assignmentsService.syncCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      cardId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/cards/:cardId/disable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Disable Device Card',
    'Disable one backend card for this assignment without deleting it from the backend source of truth',
  )
  disableCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    return this.assignmentsService.disableCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      cardId,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/cards/:cardId/enable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Enable Device Card',
    'Re-enable one backend card and synchronize it to the assigned Hikvision device',
  )
  enableCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    return this.assignmentsService.enableCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      cardId,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Delete(':employeeId/devices/:deviceId/users/cards/:cardId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:delete')
  @ApiDeleteOperation(
    'Delete Device Card',
    'Delete one saved card from the assigned Hikvision device first, then deactivate it locally',
  )
  deleteCard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    return this.assignmentsService.deleteCard(
      req.user.companyId!,
      employeeId,
      deviceId,
      cardId,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Post(':employeeId/devices/:deviceId/users/fingerprints/capture')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Capture Device Fingerprint',
    'Capture one fingerprint from the assigned Hikvision device and save it in the backend source of truth',
  )
  captureFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: CaptureEmployeeDeviceFingerprintDto,
  ) {
    return this.assignmentsService.captureFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Post(':employeeId/devices/:deviceId/users/fingerprints')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Create Device Fingerprint',
    'Create a fingerprint on the assigned Hikvision device using an existing backend capture record',
  )
  createFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: CreateEmployeeDeviceFingerprintFromRecordDto,
  ) {
    return this.assignmentsService.createFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiUpdateOperation(
    'Modify Device Fingerprint',
    'Update the backend fingerprint template and optionally resynchronize it to the assigned device',
  )
  modifyFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Body() dto: UpdateEmployeeDeviceFingerprintDto,
  ) {
    return this.assignmentsService.modifyFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Post(':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Sync Device Fingerprint',
    'Synchronize a saved backend fingerprint to the assigned Hikvision device',
  )
  syncFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Body() dto: SyncEmployeeDeviceFingerprintDto = {},
  ) {
    return this.assignmentsService.syncFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Post(
    ':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId/resync',
  )
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Resync Device Fingerprint',
    'Resynchronize one saved backend fingerprint to the assigned Hikvision device',
  )
  resyncFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Body() dto: SyncEmployeeDeviceFingerprintDto = {},
  ) {
    return this.assignmentsService.resyncFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(
    ':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId/disable',
  )
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Disable Device Fingerprint',
    'Disable one assignment fingerprint locally without deleting it from the backend source of truth',
  )
  disableFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
  ) {
    return this.assignmentsService.disableFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Patch(
    ':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId/enable',
  )
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Enable Device Fingerprint',
    'Re-enable one saved fingerprint for the employee-device assignment',
  )
  enableFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
  ) {
    return this.assignmentsService.enableFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Delete(':employeeId/devices/:deviceId/users/fingerprints/:fingerprintId')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:delete')
  @ApiDeleteOperation(
    'Delete Device Fingerprint',
    'Delete one fingerprint from the assigned device first, then update the backend sync state',
  )
  deleteFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Body() dto: DeleteEmployeeDeviceFingerprintDto,
  ) {
    return this.assignmentsService.deleteFingerprint(
      req.user.companyId!,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
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

  @Post(':employeeId/devices/:deviceId/users/password')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Create Device Password',
    'Create a Hikvision password or PIN for the linked employee-device assignment',
  )
  createUserPassword(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SetEmployeeDevicePasswordDto,
  ) {
    return this.assignmentsService.createUserPassword(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto.password,
      dto.user_verify_mode,
    );
  }

  @Patch(':employeeId/devices/:deviceId/users/password')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiActionOperation(
    'Modify Device Password',
    'Modify a Hikvision password or PIN for the linked employee-device assignment',
  )
  modifyUserPassword(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SetEmployeeDevicePasswordDto,
  ) {
    return this.assignmentsService.modifyUserPassword(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto.password,
      dto.user_verify_mode,
    );
  }

  @Delete(':employeeId/devices/:deviceId/users/password')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_device_assignments:update')
  @ApiDeleteOperation(
    'Delete Device Password',
    'Delete the Hikvision password or PIN on the device first, then update the local assignment state',
  )
  deleteUserPassword(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: DeleteEmployeeDevicePasswordDto,
  ) {
    return this.assignmentsService.deleteUserPassword(
      req.user.companyId!,
      employeeId,
      deviceId,
      dto.user_verify_mode,
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
    return this.assignmentsService.removeAssignment(
      req.user.companyId!,
      employeeId,
      deviceId,
    );
  }
}
