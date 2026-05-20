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
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceHolidayGroupsService } from './attendance-holiday-groups.service';
import { CreateHolidayGroupDto } from './dtos/create-holiday-group.dto';
import { HolidayGroupQueryDto } from './dtos/holiday-group-query.dto';
import { UpdateHolidayGroupDto } from './dtos/update-holiday-group.dto';

@ApiTags('Attendance Holiday Groups')
@ApiBearerAuth('access-token')
@Controller('attendance/holiday-groups')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceHolidayGroupsController {
  constructor(private readonly holidayGroupsService: AttendanceHolidayGroupsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holiday_groups:create')
  @ApiCreateOperation('Attendance Holiday Group', 'Create attendance holiday group')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateHolidayGroupDto,
  ) {
    return this.holidayGroupsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holiday_groups:read')
  @ApiListOperation('Attendance Holiday Group', 'List attendance holiday groups')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: HolidayGroupQueryDto,
  ) {
    return this.holidayGroupsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holiday_groups:read')
  @ApiGetOneOperation('Attendance Holiday Group', 'Get attendance holiday group by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.holidayGroupsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holiday_groups:update')
  @ApiUpdateOperation('Attendance Holiday Group', 'Update attendance holiday group')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHolidayGroupDto,
  ) {
    return this.holidayGroupsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holiday_groups:delete')
  @ApiDeleteOperation('Attendance Holiday Group', 'Delete attendance holiday group')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.holidayGroupsService.remove(req.user.companyId!, id);
  }
}




