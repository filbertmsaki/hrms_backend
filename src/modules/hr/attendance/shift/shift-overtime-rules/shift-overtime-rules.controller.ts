import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { ShiftOvertimeRulesService } from './shift-overtime-rules.service';
import { CreateShiftOvertimeRuleDto } from './dtos/create-shift-overtime-rule.dto';
import { UpdateShiftOvertimeRuleDto } from './dtos/update-shift-overtime-rule.dto';
import { ShiftOvertimeRuleQueryDto } from './dtos/shift-overtime-rule-query.dto';

@ApiTags('Shift Overtime Rules')
@ApiBearerAuth('access-token')
@Controller('shift/shift-overtime-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftOvertimeRulesController {
  constructor(private readonly shiftOvertimeRulesService: ShiftOvertimeRulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_overtime_rules:create')
  @ApiCreateOperation('Shift Overtime Rule', 'Create shift overtime rule')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftOvertimeRuleDto) {
    return this.shiftOvertimeRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_overtime_rules:read')
  @ApiListOperation('Shift Overtime Rule', 'List shift overtime rules')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftOvertimeRuleQueryDto) {
    return this.shiftOvertimeRulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_overtime_rules:read')
  @ApiGetOneOperation('Shift Overtime Rule', 'Get shift overtime rule by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftOvertimeRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_overtime_rules:update')
  @ApiUpdateOperation('Shift Overtime Rule', 'Update shift overtime rule')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftOvertimeRuleDto) {
    return this.shiftOvertimeRulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_overtime_rules:delete')
  @ApiDeleteOperation('Shift Overtime Rule', 'Delete shift overtime rule')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftOvertimeRulesService.remove(req.user.companyId!, id);
  }
}
