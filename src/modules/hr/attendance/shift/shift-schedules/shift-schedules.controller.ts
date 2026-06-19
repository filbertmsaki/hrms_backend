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
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../../docs/swagger-decorators';
import { ShiftSchedulesService } from './shift-schedules.service';
import { CreateShiftScheduleDto } from './dtos/create-shift-schedule.dto';
import { UpdateShiftScheduleDto } from './dtos/update-shift-schedule.dto';
import { ShiftScheduleQueryDto } from './dtos/shift-schedule-query.dto';

@ApiTags('Shift Schedules')
@ApiBearerAuth('access-token')
@Controller('attendance/schedules/manual-overrides')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftSchedulesController {
  constructor(private readonly shiftSchedulesService: ShiftSchedulesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:create')
  @ApiCreateOperation('Shift Schedule', 'Create shift schedule')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateShiftScheduleDto,
  ) {
    return this.shiftSchedulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:read')
  @ApiListOperation('Shift Schedule', 'List shift schedules')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ShiftScheduleQueryDto,
  ) {
    return this.shiftSchedulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:read')
  @ApiGetOneOperation('Shift Schedule', 'Get shift schedule by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftSchedulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:update')
  @ApiUpdateOperation('Shift Schedule', 'Update shift schedule')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShiftScheduleDto,
  ) {
    return this.shiftSchedulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:delete')
  @ApiDeleteOperation('Shift Schedule', 'Delete shift schedule')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftSchedulesService.remove(req.user.companyId!, id);
  }
}
