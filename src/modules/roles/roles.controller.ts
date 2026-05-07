import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

import { RolesService } from './roles.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AuthGuard('jwt')) 
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}


  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('roles:create')
  @ApiOperation({ summary: 'Create a new role (owner only)' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(createRoleDto, req.user);
  }


  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Get all roles' })
  findAll() {
    return this.rolesService.findAll();
  }


  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Get role by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }


  @Patch(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Update a role (owner only)' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - system-generated roles can only be modified by OWNER users',
  })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto, req.user);
  }


  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('roles:delete')
  @ApiOperation({ summary: 'Delete a role (owner only)' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - system-generated roles can only be modified by OWNER users',
  })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rolesService.remove(id, req.user);
  }
}
