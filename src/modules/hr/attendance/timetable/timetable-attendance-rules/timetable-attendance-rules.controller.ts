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
import { TimetableAttendanceRulesService } from './timetable-attendance-rules.service';
import { CreateTimetableAttendanceRuleDto } from './dtos/create-timetable-attendance-rule.dto';
import { UpdateTimetableAttendanceRuleDto } from './dtos/update-timetable-attendance-rule.dto';
import { TimetableAttendanceRuleQueryDto } from './dtos/timetable-attendance-rule-query.dto';

@ApiTags('Timetable Attendance Rules')
@ApiBearerAuth('access-token')
@Controller('timetable/timetable-attendance-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableAttendanceRulesController {
  constructor(
    private readonly timetableAttendanceRulesService: TimetableAttendanceRulesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_attendance_rules:create')
  @ApiCreateOperation(
    'Timetable Attendance Rule',
    'Create timetable attendance rule',
  )
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableAttendanceRuleDto,
  ) {
    return this.timetableAttendanceRulesService.create(
      req.user.companyId!,
      dto,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_attendance_rules:read')
  @ApiListOperation(
    'Timetable Attendance Rule',
    'List timetable attendance rules',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableAttendanceRuleQueryDto,
  ) {
    return this.timetableAttendanceRulesService.findAll(
      req.user.companyId!,
      query,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_attendance_rules:read')
  @ApiGetOneOperation(
    'Timetable Attendance Rule',
    'Get timetable attendance rule by ID',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableAttendanceRulesService.findOne(
      req.user.companyId!,
      id,
    );
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_attendance_rules:update')
  @ApiUpdateOperation(
    'Timetable Attendance Rule',
    'Update timetable attendance rule',
  )
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableAttendanceRuleDto,
  ) {
    return this.timetableAttendanceRulesService.update(
      req.user.companyId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_attendance_rules:delete')
  @ApiDeleteOperation(
    'Timetable Attendance Rule',
    'Delete timetable attendance rule',
  )
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableAttendanceRulesService.remove(req.user.companyId!, id);
  }
}
