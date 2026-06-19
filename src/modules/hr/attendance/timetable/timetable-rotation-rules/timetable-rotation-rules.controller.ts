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
import { TimetableRotationRulesService } from './timetable-rotation-rules.service';
import { CreateTimetableRotationRuleDto } from './dtos/create-timetable-rotation-rule.dto';
import { UpdateTimetableRotationRuleDto } from './dtos/update-timetable-rotation-rule.dto';
import { TimetableRotationRuleQueryDto } from './dtos/timetable-rotation-rule-query.dto';

@ApiTags('Timetable Rotation Rules')
@ApiBearerAuth('access-token')
@Controller('attendance/schedule-definitions/timetable-rotation-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableRotationRulesController {
  constructor(
    private readonly timetableRotationRulesService: TimetableRotationRulesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotation_rules:create')
  @ApiCreateOperation(
    'Timetable Rotation Rule',
    'Create timetable rotation rule',
  )
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableRotationRuleDto,
  ) {
    return this.timetableRotationRulesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotation_rules:read')
  @ApiListOperation('Timetable Rotation Rule', 'List timetable rotation rules')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableRotationRuleQueryDto,
  ) {
    return this.timetableRotationRulesService.findAll(
      req.user.companyId!,
      query,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotation_rules:read')
  @ApiGetOneOperation(
    'Timetable Rotation Rule',
    'Get timetable rotation rule by ID',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableRotationRulesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotation_rules:update')
  @ApiUpdateOperation(
    'Timetable Rotation Rule',
    'Update timetable rotation rule',
  )
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableRotationRuleDto,
  ) {
    return this.timetableRotationRulesService.update(
      req.user.companyId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotation_rules:delete')
  @ApiDeleteOperation(
    'Timetable Rotation Rule',
    'Delete timetable rotation rule',
  )
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableRotationRulesService.remove(req.user.companyId!, id);
  }
}
