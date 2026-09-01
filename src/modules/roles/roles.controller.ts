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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { CompanyModule } from '../../common/decorators/company-module.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyModuleGuard } from '../../common/guards/company-module.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AssignRolePermissionDto } from './dtos/assign-role-permission.dto';
import { AssignRoleUserDto } from './dtos/assign-role-user.dto';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RolesService } from './roles.service';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../docs/swagger-decorators';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('roles')
@UseGuards(AuthGuard('jwt'))
@UseGuards(CompanyModuleGuard)
@CompanyModule('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:create')
  @ApiCreateOperation('Role', 'Create a new role with optional permissions')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(createRoleDto, req.user, context);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiListOperation('Role', 'Get all roles visible to the current actor')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.rolesService.findAll(req.user);
  }

  @Get(':roleId/users')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:read')
  @ApiListOperation(
    'Role Users',
    'List active company users assigned to a role',
  )
  listUsersAssignedToRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('roleId', ParseIntPipe) roleId: number,
    @Query() query: PaginationDto,
  ) {
    return this.rolesService.listUsersAssignedToRole(roleId, req.user, query);
  }

  @Post(':roleId/users')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiActionOperation(
    'Assign User to Role',
    'Assign an active company user to a company-scoped role.',
  )
  assignUserToRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: AssignRoleUserDto,
  ) {
    return this.rolesService.assignUserToRole(
      roleId,
      dto.user_id,
      req.user,
      context,
    );
  }

  @Delete(':roleId/users/:userId')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiDeleteOperation(
    'Role User Assignment',
    'Revoke a user assignment from a role',
  )
  revokeUserFromRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.rolesService.revokeUserFromRole(
      roleId,
      userId,
      req.user,
      context,
    );
  }

  @Get(':roleId/permissions')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('roles:read')
  @ApiListOperation(
    'Role Permissions',
    'List permissions assigned to a company-scoped role',
  )
  listRolePermissions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.rolesService.listRolePermissions(roleId, req.user);
  }

  @Post(':roleId/permissions')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('roles:assign-permission')
  @ApiActionOperation(
    'Assign Permission to Role',
    'Assign a permission to a custom company-scoped role.',
  )
  assignPermissionToRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: AssignRolePermissionDto,
  ) {
    return this.rolesService.assignPermissionToRole(
      roleId,
      dto.permission_id,
      req.user,
      context,
    );
  }

  @Delete(':roleId/permissions/:permissionId')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('roles:revoke-permission')
  @ApiDeleteOperation(
    'Role Permission Assignment',
    'Revoke a permission assignment from a role',
  )
  revokePermissionFromRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) {
    return this.rolesService.revokePermissionFromRole(
      roleId,
      permissionId,
      req.user,
      context,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiGetOneOperation('Role', 'Get a role by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rolesService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:update')
  @ApiUpdateOperation('Role', 'Update a role and its permission assignments')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto, req.user, context);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:delete')
  @ApiDeleteOperation('Role', 'Delete a role')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rolesService.remove(id, req.user, context);
  }
}
