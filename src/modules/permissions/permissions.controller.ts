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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { CompanyModule } from '../../common/decorators/company-module.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyModuleGuard } from '../../common/guards/company-module.guard';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
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
@UseGuards(CompanyModuleGuard)
@CompanyModule('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('permissions:create')
  @ApiCreateOperation('Permission', 'Create a new permission in platform scope')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() createPermissionDto: CreatePermissionDto,
  ) {
    return this.permissionsService.create(
      createPermissionDto,
      req.user,
      context,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('permissions:read')
  @ApiListOperation(
    'Permission',
    'Get all permissions visible to the current actor',
  )
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
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('permissions:update')
  @ApiUpdateOperation('Permission', 'Update a permission in platform scope')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(
      id,
      updatePermissionDto,
      req.user,
      context,
    );
  }

  @Delete(':id')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('permissions:delete')
  @ApiDeleteOperation('Permission', 'Delete a permission in platform scope')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.permissionsService.remove(id, req.user, context);
  }
}
