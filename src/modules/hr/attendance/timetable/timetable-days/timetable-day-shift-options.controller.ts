import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { TimetableDayShiftOptionsService } from './timetable-day-shift-options.service';
import { CreateTimetableDayShiftOptionDto } from './dtos/create-timetable-day-shift-option.dto';
import { UpdateTimetableDayShiftOptionDto } from './dtos/update-timetable-day-shift-option.dto';

@ApiTags('Timetable Day Shift Options')
@ApiBearerAuth('access-token')
@Controller('attendance/schedule-definitions/timetable-day-shift-options')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableDayShiftOptionsController {
  constructor(private readonly service: TimetableDayShiftOptionsService) {}
  @Get() @UseGuards(PermissionsGuard) @Permissions('timetable_days:read') list(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query('timetable_day_id') dayId?: string,
  ) {
    return this.service.list(
      req.user.companyId!,
      dayId ? Number(dayId) : undefined,
    );
  }
  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:read')
  findOne(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(req.user.companyId!, id);
  }
  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:create')
  create(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableDayShiftOptionDto,
  ) {
    return this.service.create(req.user.companyId!, req.user.id, dto);
  }
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:update')
  update(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableDayShiftOptionDto,
  ) {
    return this.service.update(req.user.companyId!, req.user.id, id, dto);
  }
  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:delete')
  remove(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(req.user.companyId!, req.user.id, id);
  }
}
