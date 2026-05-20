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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { PermissionsService } from './permissions.service';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../docs/swagger-decorators';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller('permissions')
@UseGuards(AuthGuard('jwt'))
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiCreateOperation('Permission', 'Create a new permission (OWNER only)')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createPermissionDto: CreatePermissionDto,
  ) {
    return this.permissionsService.create(createPermissionDto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiListOperation('Permission', 'Get all permissions visible to the current actor')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.permissionsService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiGetOneOperation('Permission', 'Get a permission by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.permissionsService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiUpdateOperation('Permission', 'Update a permission (OWNER only)')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto, req.user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiDeleteOperation('Permission', 'Delete a permission (OWNER only)')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.permissionsService.remove(id, req.user);
  }
}
