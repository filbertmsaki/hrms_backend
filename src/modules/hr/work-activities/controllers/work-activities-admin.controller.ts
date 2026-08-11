import {
  Body,
  Controller,
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
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  CreateActivityCategoryDto,
  CreateActivityPolicyDto,
  CreateFieldPartyDto,
  UpdateActivityCategoryDto,
  UpdateActivityPolicyDto,
  UpdateFieldPartyDto,
} from '../dto/activity.dto';
import {
  FieldLocationMapQueryDto,
  WorkActivityQueryDto,
} from '../dto/queries.dto';
import { ActivityPolicyService } from '../services/activity-policy.service';
import { DailyActivityService } from '../services/daily-activity.service';
import { FieldPartyService } from '../services/field-party.service';
import { FieldVisitService } from '../services/field-visit.service';
import { WorkActivityExceptionService } from '../services/work-activity-exception.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Work Activities Administration')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class WorkActivitiesAdminController {
  constructor(
    private readonly policyService: ActivityPolicyService,
    private readonly dailyActivityService: DailyActivityService,
    private readonly fieldPartyService: FieldPartyService,
    private readonly visitService: FieldVisitService,
    private readonly exceptionService: WorkActivityExceptionService,
  ) {}

  @Post('activity-categories')
  @Permissions('work_activities:config')
  createCategory(
    @Req() req: AuthedRequest,
    @Body() dto: CreateActivityCategoryDto,
  ) {
    return this.policyService.createCategory(req.user, dto as never);
  }

  @Get('activity-categories')
  @Permissions('work_activities:config')
  listCategories(@Req() req: AuthedRequest) {
    return this.policyService.listCategories(req.user);
  }

  @Patch('activity-categories/:id')
  @Permissions('work_activities:config')
  updateCategory(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityCategoryDto,
  ) {
    return this.policyService.updateCategory(req.user, id, dto as never);
  }

  @Post('activity-categories/:id/deactivate')
  @Permissions('work_activities:config')
  deactivateCategory(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.policyService.deactivateCategory(req.user, id);
  }

  @Post('activity-policies')
  @Permissions('work_activities:config')
  createPolicy(
    @Req() req: AuthedRequest,
    @Body() dto: CreateActivityPolicyDto,
  ) {
    return this.policyService.createPolicy(req.user, dto as never);
  }

  @Get('activity-policies')
  @Permissions('work_activities:config')
  listPolicies(@Req() req: AuthedRequest) {
    return this.policyService.listPolicies(req.user);
  }

  @Patch('activity-policies/:id')
  @Permissions('work_activities:config')
  updatePolicy(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityPolicyDto,
  ) {
    return this.policyService.updatePolicy(req.user, id, dto as never);
  }

  @Post('field-parties')
  @Permissions('field_visits:config')
  createFieldParty(
    @Req() req: AuthedRequest,
    @Body() dto: CreateFieldPartyDto,
  ) {
    return this.fieldPartyService.create(req.user, dto as never);
  }

  @Get('field-parties')
  @Permissions('field_visits:config')
  listFieldParties(@Req() req: AuthedRequest) {
    return this.fieldPartyService.list(req.user);
  }

  @Get('field-parties/:id')
  @Permissions('field_visits:config')
  getFieldParty(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.fieldPartyService.get(req.user, id);
  }

  @Patch('field-parties/:id')
  @Permissions('field_visits:config')
  updateFieldParty(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFieldPartyDto,
  ) {
    return this.fieldPartyService.update(req.user, id, dto as never);
  }

  @Get('hr/activities')
  @Permissions('work_activities:hr:read')
  getActivitySummary(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.dailyActivityService.listForHr(req.user, query);
  }

  @Get('hr/field-visits')
  @Permissions('field_visits:hr:read')
  getVisitSummary(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.visitService.listForHr(req.user, query);
  }

  @Get('hr/field-visits/map')
  @Permissions('field_locations:export')
  getVisitMap(
    @Req() req: AuthedRequest,
    @Query() query: FieldLocationMapQueryDto,
  ) {
    return this.visitService.getMapPoints(req.user, query);
  }

  @Get('hr/field-locations/access-logs')
  @Permissions('field_locations:read')
  getLocationAccessLog(@Req() req: AuthedRequest) {
    return this.visitService.listLocationAccessLogs(req.user);
  }

  @Get('hr/activity-exceptions')
  @Permissions('work_activities:hr:read')
  getActivityExceptions(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.exceptionService.list(req.user.companyId!, {
      employeeId: (query as WorkActivityQueryDto & { employee_id?: number })
        .employee_id,
      status: query.status,
    });
  }
}
