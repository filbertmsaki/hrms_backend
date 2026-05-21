import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { ShiftAttendanceRulesService } from './shift-attendance-rules.service';
import { CreateShiftAttendanceRuleDto } from './dtos/create-shift-attendance-rule.dto';
import { UpdateShiftAttendanceRuleDto } from './dtos/update-shift-attendance-rule.dto';
import { ShiftAttendanceRuleQueryDto } from './dtos/shift-attendance-rule-query.dto';

@ApiTags('Shift Attendance Rules')
@ApiBearerAuth('access-token')
@Controller('shift/shift-attendance-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftAttendanceRulesController {
  constructor(private readonly shiftAttendanceRulesService: ShiftAttendanceRulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_attendance_rules:create')
  @ApiCreateOperation('Shift Attendance Rule', 'Create shift attendance rule')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftAttendanceRuleDto) {
    return this.shiftAttendanceRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_attendance_rules:read')
  @ApiListOperation('Shift Attendance Rule', 'List shift attendance rules')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftAttendanceRuleQueryDto) {
    return this.shiftAttendanceRulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_attendance_rules:read')
  @ApiGetOneOperation('Shift Attendance Rule', 'Get shift attendance rule by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftAttendanceRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_attendance_rules:update')
  @ApiUpdateOperation('Shift Attendance Rule', 'Update shift attendance rule')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftAttendanceRuleDto) {
    return this.shiftAttendanceRulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_attendance_rules:delete')
  @ApiDeleteOperation('Shift Attendance Rule', 'Delete shift attendance rule')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftAttendanceRulesService.remove(req.user.companyId!, id);
  }
}
