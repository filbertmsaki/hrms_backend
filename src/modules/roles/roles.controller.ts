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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RolesService } from './roles.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AuthGuard('jwt')) 
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}


  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('super_admin')
  @Permissions('roles:create')
  @ApiOperation({ summary: 'Create a new role (admin only)' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
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
  @Roles('super_admin')
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Update a role (admin only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto);
  }


  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('super_admin')
  @Permissions('roles:delete')
  @ApiOperation({ summary: 'Delete a role (admin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}