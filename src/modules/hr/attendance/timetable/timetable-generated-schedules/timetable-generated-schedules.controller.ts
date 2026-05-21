import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../../docs/swagger-decorators';
import { TimetableGeneratedSchedulesService } from './timetable-generated-schedules.service';
import { CreateTimetableGeneratedScheduleDto } from './dtos/create-timetable-generated-schedule.dto';
import { UpdateTimetableGeneratedScheduleDto } from './dtos/update-timetable-generated-schedule.dto';
import { TimetableGeneratedScheduleQueryDto } from './dtos/timetable-generated-schedule-query.dto';

@ApiTags('Timetable Generated Schedules')
@ApiBearerAuth('access-token')
@Controller('timetable/timetable-generated-schedules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableGeneratedSchedulesController {
  constructor(private readonly timetableGeneratedSchedulesService: TimetableGeneratedSchedulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_generated_schedules:create')
  @ApiCreateOperation('Timetable Generated Schedule', 'Create timetable generated schedule')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateTimetableGeneratedScheduleDto) {
    return this.timetableGeneratedSchedulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_generated_schedules:read')
  @ApiListOperation('Timetable Generated Schedule', 'List timetable generated schedules')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: TimetableGeneratedScheduleQueryDto) {
    return this.timetableGeneratedSchedulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_generated_schedules:read')
  @ApiGetOneOperation('Timetable Generated Schedule', 'Get timetable generated schedule by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.timetableGeneratedSchedulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_generated_schedules:update')
  @ApiUpdateOperation('Timetable Generated Schedule', 'Update timetable generated schedule')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTimetableGeneratedScheduleDto) {
    return this.timetableGeneratedSchedulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_generated_schedules:delete')
  @ApiDeleteOperation('Timetable Generated Schedule', 'Delete timetable generated schedule')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.timetableGeneratedSchedulesService.remove(req.user.companyId!, id);
  }
}
