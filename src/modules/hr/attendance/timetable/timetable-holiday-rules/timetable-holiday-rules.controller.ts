import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { TimetableHolidayRulesService } from './timetable-holiday-rules.service';
import { CreateTimetableHolidayRuleDto } from './dtos/create-timetable-holiday-rule.dto';
import { UpdateTimetableHolidayRuleDto } from './dtos/update-timetable-holiday-rule.dto';
import { TimetableHolidayRuleQueryDto } from './dtos/timetable-holiday-rule-query.dto';

@ApiTags('Timetable Holiday Rules')
@ApiBearerAuth('access-token')
@Controller('timetable/timetable-holiday-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableHolidayRulesController {
  constructor(private readonly timetableHolidayRulesService: TimetableHolidayRulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_holiday_rules:create')
  @ApiCreateOperation('Timetable Holiday Rule', 'Create timetable holiday rule')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateTimetableHolidayRuleDto) {
    return this.timetableHolidayRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_holiday_rules:read')
  @ApiListOperation('Timetable Holiday Rule', 'List timetable holiday rules')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: TimetableHolidayRuleQueryDto) {
    return this.timetableHolidayRulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_holiday_rules:read')
  @ApiGetOneOperation('Timetable Holiday Rule', 'Get timetable holiday rule by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.timetableHolidayRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_holiday_rules:update')
  @ApiUpdateOperation('Timetable Holiday Rule', 'Update timetable holiday rule')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTimetableHolidayRuleDto) {
    return this.timetableHolidayRulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_holiday_rules:delete')
  @ApiDeleteOperation('Timetable Holiday Rule', 'Delete timetable holiday rule')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.timetableHolidayRulesService.remove(req.user.companyId!, id);
  }
}
