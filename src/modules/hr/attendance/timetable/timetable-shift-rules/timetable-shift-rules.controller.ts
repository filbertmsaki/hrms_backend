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
import { TimetableShiftRulesService } from './timetable-shift-rules.service';
import { CreateTimetableShiftRuleDto } from './dtos/create-timetable-shift-rule.dto';
import { UpdateTimetableShiftRuleDto } from './dtos/update-timetable-shift-rule.dto';
import { TimetableShiftRuleQueryDto } from './dtos/timetable-shift-rule-query.dto';

@ApiTags('Timetable Shift Rules')
@ApiBearerAuth('access-token')
@Controller('timetable/timetable-shift-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableShiftRulesController {
  constructor(
    private readonly timetableShiftRulesService: TimetableShiftRulesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_shift_rules:create')
  @ApiCreateOperation('Timetable Shift Rule', 'Create timetable shift rule')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableShiftRuleDto,
  ) {
    return this.timetableShiftRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_shift_rules:read')
  @ApiListOperation('Timetable Shift Rule', 'List timetable shift rules')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableShiftRuleQueryDto,
  ) {
    return this.timetableShiftRulesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_shift_rules:read')
  @ApiGetOneOperation('Timetable Shift Rule', 'Get timetable shift rule by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableShiftRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_shift_rules:update')
  @ApiUpdateOperation('Timetable Shift Rule', 'Update timetable shift rule')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableShiftRuleDto,
  ) {
    return this.timetableShiftRulesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_shift_rules:delete')
  @ApiDeleteOperation('Timetable Shift Rule', 'Delete timetable shift rule')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableShiftRulesService.remove(req.user.companyId!, id);
  }
}
