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
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { PermissionsService } from './permissions.service';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(AuthGuard('jwt'))
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:create')
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({ status: 201, description: 'Permission created' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createPermissionDto: CreatePermissionDto,
  ) {
    return this.permissionsService.create(createPermissionDto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiOperation({ summary: 'Get permissions visible to the current actor' })
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.permissionsService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiOperation({ summary: 'Get permission by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.permissionsService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:update')
  @ApiOperation({ summary: 'Update a permission' })
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
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:delete')
  @ApiOperation({ summary: 'Delete a permission' })
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
