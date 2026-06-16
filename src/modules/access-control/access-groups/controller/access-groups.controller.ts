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
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { SortDirection } from '../../../../common/dto/pagination.dto';
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
import { AssignAccessGroupDevicesDto } from '../dto/assign-access-group-devices.dto';
import { AssignAccessGroupDoorsDto } from '../dto/assign-access-group-doors.dto';
import { AssignAccessGroupEmployeesDto } from '../dto/assign-access-group-employees.dto';
import { CreateAccessGroupDto } from '../dto/create-access-group.dto';
import { UpdateAccessGroupDto } from '../dto/update-access-group.dto';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';
import { AccessGroupsService } from '../service/access-groups.service';

class AccessGroupQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsEnum(SortDirection)
  @IsOptional()
  sortOrder?: SortDirection;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  organization_id?: number;

  @ApiPropertyOptional({ enum: AccessGroupStatusEnum })
  @IsEnum(AccessGroupStatusEnum)
  @IsOptional()
  status?: AccessGroupStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

@ApiTags('Access Control Groups')
@ApiBearerAuth('access-token')
@Controller('access-control/groups')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessGroupsController {
  constructor(private readonly groupsService: AccessGroupsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:create')
  @ApiCreateOperation('Access Group', 'Create access group')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAccessGroupDto,
  ) {
    return this.groupsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:read')
  @ApiListOperation('Access Group', 'List access groups')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AccessGroupQueryDto,
  ) {
    return this.groupsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:read')
  @ApiGetOneOperation('Access Group', 'Get access group by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiUpdateOperation('Access Group', 'Update access group')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessGroupDto,
  ) {
    return this.groupsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:delete')
  @ApiDeleteOperation('Access Group', 'Delete access group')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.remove(req.user.companyId!, id);
  }

  @Post(':id/doors')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Assign Group Doors', 'Assign doors to access group')
  assignDoors(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignAccessGroupDoorsDto,
  ) {
    return this.groupsService.assignDoors(req.user.companyId!, id, dto);
  }

  @Post(':id/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Assign Group Devices', 'Assign devices to access group')
  assignDevices(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignAccessGroupDevicesDto,
  ) {
    return this.groupsService.assignDevices(req.user.companyId!, id, dto);
  }

  @Delete(':id/devices/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Remove Group Device', 'Remove a device from access group')
  removeDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.groupsService.removeDevice(req.user.companyId!, id, deviceId);
  }

  @Delete(':id/doors/:doorId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Remove Group Door', 'Remove a door from access group')
  removeDoor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('doorId', ParseIntPipe) doorId: number,
  ) {
    return this.groupsService.removeDoor(req.user.companyId!, id, doorId);
  }

  @Post(':id/employees')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Assign Group Employees', 'Assign employees to access group')
  assignEmployees(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignAccessGroupEmployeesDto,
  ) {
    return this.groupsService.assignEmployees(req.user.companyId!, id, dto);
  }

  @Delete(':id/employees/:employeeId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Remove Group Employee', 'Remove an employee from access group')
  removeEmployee(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.groupsService.removeEmployee(req.user.companyId!, id, employeeId);
  }

  @Post(':id/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:update')
  @ApiActionOperation('Sync Group', 'Sync one access group to all relevant Hikvision devices')
  syncGroup(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.syncGroup(req.user.companyId!, id);
  }

  @Get(':id/employees')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:read')
  @ApiActionOperation('Group Employees', 'List employees assigned to one access group')
  listEmployees(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.listGroupEmployees(req.user.companyId!, id);
  }

  @Get(':id/devices')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:read')
  @ApiActionOperation('Group Devices', 'List devices assigned to one access group')
  listDevices(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.listGroupDevices(req.user.companyId!, id);
  }

  @Get(':id/doors')
  @UseGuards(PermissionsGuard)
  @Permissions('access_groups:read')
  @ApiActionOperation('Group Doors', 'List doors and templates assigned to one access group')
  listDoors(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groupsService.listGroupDoors(req.user.companyId!, id);
  }
}
