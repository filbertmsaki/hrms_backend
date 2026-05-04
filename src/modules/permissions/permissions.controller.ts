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

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(AuthGuard('jwt')) 
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}


  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('admin')                        // Only users with 'admin' role
  @Permissions('permissions:create')     // And explicit permission
  @ApiOperation({ summary: 'Create a new permission (admin only)' })
  @ApiResponse({ status: 201, description: 'Permission created' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }


  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiOperation({ summary: 'Get all permissions' })
  findAll() {
    return this.permissionsService.findAll();
  }


  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiOperation({ summary: 'Get permission by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.findOne(id);
  }


  @Patch(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('admin')
  @Permissions('permissions:update')
  @ApiOperation({ summary: 'Update a permission (admin only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('admin')
  @Permissions('permissions:delete')
  @ApiOperation({ summary: 'Delete a permission (admin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.remove(id);
  }
}