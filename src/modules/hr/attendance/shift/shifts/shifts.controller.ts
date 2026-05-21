import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../../docs/swagger-decorators';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dtos/create-shift.dto';
import { UpdateShiftDto } from './dtos/update-shift.dto';
import { ShiftQueryDto } from './dtos/shift-query.dto';

@ApiTags('Shifts')
@ApiBearerAuth('access-token')
@Controller('shift/shifts')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shifts:create')
  @ApiCreateOperation('Shift', 'Create shift')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(req.user.companyId!, req.user.companyMembershipId ?? null, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shifts:read')
  @ApiListOperation('Shift', 'List shifts')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftQueryDto) {
    return this.shiftsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shifts:read')
  @ApiGetOneOperation('Shift', 'Get shift by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shifts:update')
  @ApiUpdateOperation('Shift', 'Update shift')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shifts:delete')
  @ApiDeleteOperation('Shift', 'Delete shift')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.remove(req.user.companyId!, id);
  }
}
