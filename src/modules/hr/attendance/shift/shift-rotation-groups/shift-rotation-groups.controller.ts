import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { ShiftRotationGroupsService } from './shift-rotation-groups.service';
import { CreateShiftRotationGroupDto } from './dtos/create-shift-rotation-group.dto';
import { UpdateShiftRotationGroupDto } from './dtos/update-shift-rotation-group.dto';
import { ShiftRotationGroupQueryDto } from './dtos/shift-rotation-group-query.dto';

@ApiTags('Shift Rotation Groups')
@ApiBearerAuth('access-token')
@Controller('shift/shift-rotation-groups')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftRotationGroupsController {
  constructor(private readonly shiftRotationGroupsService: ShiftRotationGroupsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_groups:create')
  @ApiCreateOperation('Shift Rotation Group', 'Create shift rotation group')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftRotationGroupDto) {
    return this.shiftRotationGroupsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_groups:read')
  @ApiListOperation('Shift Rotation Group', 'List shift rotation groups')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftRotationGroupQueryDto) {
    return this.shiftRotationGroupsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_groups:read')
  @ApiGetOneOperation('Shift Rotation Group', 'Get shift rotation group by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftRotationGroupsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_groups:update')
  @ApiUpdateOperation('Shift Rotation Group', 'Update shift rotation group')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftRotationGroupDto) {
    return this.shiftRotationGroupsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_groups:delete')
  @ApiDeleteOperation('Shift Rotation Group', 'Delete shift rotation group')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftRotationGroupsService.remove(req.user.companyId!, id);
  }
}
