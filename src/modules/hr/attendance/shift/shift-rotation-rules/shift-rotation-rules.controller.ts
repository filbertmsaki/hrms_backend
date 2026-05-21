import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../../docs/swagger-decorators';
import { ShiftRotationRulesService } from './shift-rotation-rules.service';
import { CreateShiftRotationRuleDto } from './dtos/create-shift-rotation-rule.dto';
import { UpdateShiftRotationRuleDto } from './dtos/update-shift-rotation-rule.dto';
import { ShiftRotationRuleQueryDto } from './dtos/shift-rotation-rule-query.dto';

@ApiTags('Shift Rotation Rules')
@ApiBearerAuth('access-token')
@Controller('shift/shift-rotation-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftRotationRulesController {
  constructor(private readonly shiftRotationRulesService: ShiftRotationRulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_rules:create')
  @ApiCreateOperation('Shift Rotation Rule', 'Create shift rotation rule')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftRotationRuleDto) {
    return this.shiftRotationRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_rules:read')
  @ApiListOperation('Shift Rotation Rule', 'List shift rotation rules')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftRotationRuleQueryDto) {
    return this.shiftRotationRulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_rules:read')
  @ApiGetOneOperation('Shift Rotation Rule', 'Get shift rotation rule by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftRotationRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_rules:update')
  @ApiUpdateOperation('Shift Rotation Rule', 'Update shift rotation rule')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftRotationRuleDto) {
    return this.shiftRotationRulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_rotation_rules:delete')
  @ApiDeleteOperation('Shift Rotation Rule', 'Delete shift rotation rule')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftRotationRulesService.remove(req.user.companyId!, id);
  }
}
