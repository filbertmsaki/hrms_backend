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
import { AttendanceHolidaysService } from './attendance-holidays.service';
import { AttendanceHolidayQueryDto } from './dtos/attendance-holiday-query.dto';
import { CreateAttendanceHolidayDto } from './dtos/create-attendance-holiday.dto';
import { UpdateAttendanceHolidayDto } from './dtos/update-attendance-holiday.dto';

@ApiTags('Attendance Holidays')
@ApiBearerAuth('access-token')
@Controller('attendance/holidays')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceHolidaysController {
  constructor(private readonly attendanceHolidaysService: AttendanceHolidaysService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holidays:create')
  @ApiCreateOperation('Attendance Holiday', 'Create attendance holiday')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceHolidayDto,
  ) {
    return this.attendanceHolidaysService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holidays:read')
  @ApiListOperation('Attendance Holiday', 'List attendance holidays')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceHolidayQueryDto,
  ) {
    return this.attendanceHolidaysService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holidays:read')
  @ApiGetOneOperation('Attendance Holiday', 'Get attendance holiday by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceHolidaysService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holidays:update')
  @ApiUpdateOperation('Attendance Holiday', 'Update attendance holiday')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceHolidayDto,
  ) {
    return this.attendanceHolidaysService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_holidays:delete')
  @ApiDeleteOperation('Attendance Holiday', 'Delete attendance holiday')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceHolidaysService.remove(req.user.companyId!, id);
  }
}




