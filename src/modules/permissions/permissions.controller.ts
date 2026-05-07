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

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(AuthGuard('jwt')) 
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}


  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('permissions:create')
  @ApiOperation({ summary: 'Create a new permission (owner only)' })
  @ApiResponse({ status: 201, description: 'Permission created' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createPermissionDto: CreatePermissionDto,
  ) {
    return this.permissionsService.create(createPermissionDto, req.user);
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
  @Roles('OWNER')
  @Permissions('permissions:update')
  @ApiOperation({ summary: 'Update a permission (owner only)' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - system-generated permissions can only be modified by OWNER users',
  })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto, req.user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('permissions:delete')
  @ApiOperation({ summary: 'Delete a permission (owner only)' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - system-generated permissions can only be modified by OWNER users',
  })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.permissionsService.remove(id, req.user);
  }
}
