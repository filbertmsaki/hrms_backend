import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { ReviewDailyActivityReportDto } from '../dto/activity.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { DailyActivityService } from '../services/daily-activity.service';
import { WorkActivityInsightsService } from '../services/work-activity-insights.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Manager Activities')
@ApiBearerAuth('access-token')
@Controller('manager/activities')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerActivitiesController {
  constructor(
    private readonly dailyActivityService: DailyActivityService,
    private readonly insightsService: WorkActivityInsightsService,
  ) {}

  @Get('dashboard')
  @Permissions('work_activities:manager:read')
  getDashboard(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.insightsService.getManagerSummary(
      req.user,
      query.date_from,
      query.date_to,
    );
  }

  @Get('team')
  @Permissions('work_activities:manager:read')
  listTeamReports(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.dailyActivityService.listForManager(req.user, query);
  }

  @Get('pending-reviews')
  @Permissions('work_activities:manager:read')
  pendingReviews(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.dailyActivityService.listPendingReviews(req.user, query);
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
