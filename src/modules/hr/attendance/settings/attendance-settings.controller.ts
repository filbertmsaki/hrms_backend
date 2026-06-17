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
import { AttendanceSettingsService } from './attendance-settings.service';
import { AttendanceSettingQueryDto } from './dtos/attendance-setting-query.dto';
import { CreateAttendanceSettingDto } from './dtos/create-attendance-setting.dto';
import { UpdateAttendanceSettingDto } from './dtos/update-attendance-setting.dto';

@ApiTags('Attendance Settings')
@ApiBearerAuth('access-token')
@Controller('attendance/settings')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceSettingsController {
  constructor(
    private readonly attendanceSettingsService: AttendanceSettingsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_settings:create')
  @ApiCreateOperation('Attendance Setting', 'Create attendance setting')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceSettingDto,
  ) {
    return this.attendanceSettingsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_settings:read')
  @ApiListOperation('Attendance Setting', 'List attendance settings')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceSettingQueryDto,
  ) {
    return this.attendanceSettingsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_settings:read')
  @ApiGetOneOperation('Attendance Setting', 'Get attendance setting by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceSettingsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_settings:update')
  @ApiUpdateOperation('Attendance Setting', 'Update attendance setting')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceSettingDto,
  ) {
    return this.attendanceSettingsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_settings:delete')
  @ApiDeleteOperation('Attendance Setting', 'Delete attendance setting')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceSettingsService.remove(req.user.companyId!, id);
  }
}
