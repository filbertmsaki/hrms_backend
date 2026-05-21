import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../../docs/swagger-decorators';
import { ShiftChangeRequestsService } from './shift-change-requests.service';
import { CreateShiftChangeRequestDto } from './dtos/create-shift-change-request.dto';
import { UpdateShiftChangeRequestDto } from './dtos/update-shift-change-request.dto';
import { ShiftChangeRequestQueryDto } from './dtos/shift-change-request-query.dto';

@ApiTags('Shift Change Requests')
@ApiBearerAuth('access-token')
@Controller('shift/shift-change-requests')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftChangeRequestsController {
  constructor(private readonly shiftChangeRequestsService: ShiftChangeRequestsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_change_requests:create')
  @ApiCreateOperation('Shift Change Request', 'Create shift change request')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftChangeRequestDto) {
    return this.shiftChangeRequestsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_change_requests:read')
  @ApiListOperation('Shift Change Request', 'List shift change requests')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftChangeRequestQueryDto) {
    return this.shiftChangeRequestsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_change_requests:read')
  @ApiGetOneOperation('Shift Change Request', 'Get shift change request by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftChangeRequestsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_change_requests:update')
  @ApiUpdateOperation('Shift Change Request', 'Update shift change request')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftChangeRequestDto) {
    return this.shiftChangeRequestsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_change_requests:delete')
  @ApiDeleteOperation('Shift Change Request', 'Delete shift change request')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftChangeRequestsService.remove(req.user.companyId!, id);
  }
}
