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
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiOperationSummary,
  ApiUpdateOperation,
  ApiAuthRequired,
  ApiSuccessResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:create')
  @ApiCreateOperation('Role', 'Create a new role with optional permissions')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(createRoleDto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:read')
  @ApiListOperation('Role', 'Get all roles visible to the current actor')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.rolesService.findAll(req.user);
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
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto, req.user);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:delete')
  @ApiDeleteOperation('Role', 'Delete a role')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rolesService.remove(id, req.user);
  }
}