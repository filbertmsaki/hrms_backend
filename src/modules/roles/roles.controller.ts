import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:create')
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(createRoleDto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Get roles visible to the current actor' })
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.rolesService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiOperation({ summary: 'Get role by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rolesService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Update a role' })
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
  @UseGuards(PermissionsGuard)
  @Permissions('roles:delete')
  @ApiOperation({ summary: 'Delete a role' })
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
