import { UseFilters } from '@nestjs/common';
import { WorkflowDatabaseExceptionFilter } from '../../../../common/filters/workflow-database-exception.filter';
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
import {
  Permissions,
  PermissionsAny,
} from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  CreateManagerActivityTaskDto,
  CreateDailyActivityCommentDto,
  ReviewDailyActivityReportDto,
  UpdateDailyActivityEntryDto,
} from '../dto/activity.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { ActivityPolicyService } from '../services/activity-policy.service';
import { DailyActivityService } from '../services/daily-activity.service';
import { WorkActivityInsightsService } from '../services/work-activity-insights.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Manager Activities')
@ApiBearerAuth('access-token')
@UseFilters(WorkflowDatabaseExceptionFilter)
@Controller('manager/activities')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerActivitiesController {
  constructor(
    private readonly dailyActivityService: DailyActivityService,
    private readonly insightsService: WorkActivityInsightsService,
    private readonly policyService: ActivityPolicyService,
  ) {}

  @Get('dashboard')
  @Permissions('work_activities:manager:read')
  getDashboard(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.insightsService.getManagerSummary(
      req.user,
      query.date_from,
      query.date_to,
    );
  }

  @Get('team')
  @Permissions('work_activities:manager:read')
  listTeamReports(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.dailyActivityService.listForManager(req.user, query);
  }

  @Get('tasks')
  @Permissions('work_activities:manager:read')
  listTasks(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.dailyActivityService.listManagerTasks(req.user, query);
  }

  @Get('assignees')
  @PermissionsAny(
    'work_activities:manager:read',
    'work_activities:manager:review',
  )
  listAssignees(@Req() req: AuthedRequest) {
    return this.dailyActivityService.listManagerAssignees(req.user);
  }

  @Get('pending-reviews')
  @Permissions('work_activities:manager:read')
  pendingReviews(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.dailyActivityService.listPendingReviews(req.user, query);
  }

  @Get('categories')
  @PermissionsAny(
    'work_activities:manager:read',
    'work_activities:manager:review',
    'work_activities:config',
  )
  listCategories(@Req() req: AuthedRequest) {
    return this.policyService.listCategories(req.user);
  }

  @Post('tasks')
  @Permissions('work_activities:manager:review')
  createTask(
    @Req() req: AuthedRequest,
    @Body() dto: CreateManagerActivityTaskDto,
  ) {
    return this.dailyActivityService.createManagerTask(req.user, dto);
  }

  @Post('entries/:entryId/comments')
  @PermissionsAny(
    'work_activities:manager:read',
    'work_activities:manager:review',
  )
  addComment(
    @Req() req: AuthedRequest,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: CreateDailyActivityCommentDto,
  ) {
    return this.dailyActivityService.addManagerComment(req.user, entryId, dto);
  }

  @Patch('entries/:entryId/schedule')
  @Permissions('work_activities:manager:review')
  updateEntrySchedule(
    @Req() req: AuthedRequest,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: UpdateDailyActivityEntryDto,
  ) {
    return this.dailyActivityService.updateManagerEntrySchedule(
      req.user,
      entryId,
      dto,
    );
  }

  @Get('reports/:id')
  @Permissions('work_activities:manager:read')
  getReport(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.dailyActivityService.getForManager(req.user, id);
  }

  @Post('reports/:id/review')
  @Permissions('work_activities:manager:review')
  review(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDailyActivityReportDto,
  ) {
    return this.dailyActivityService.reviewDailyActivity(req.user, id, dto);
  }
}
