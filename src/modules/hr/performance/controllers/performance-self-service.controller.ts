import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { SubmitSelfReviewDto } from '../dto/submit-self-review.dto';
import { SubmitPerformanceAppealDto } from '../dto/submit-performance-appeal.dto';
import { UpsertKpiAchievementDto } from '../dto/upsert-kpi-achievement.dto';
import { KpiAchievementService } from '../services/kpi-achievement.service';
import { PerformanceImprovementPlanService } from '../services/performance-improvement-plan.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformancePlanService } from '../services/performance-plan.service';
import { PerformanceReviewService } from '../services/performance-review.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Performance Self Service')
@ApiBearerAuth('access-token')
@Controller('performance/me')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PerformanceSelfServiceController {
  constructor(
    private readonly insightsService: PerformanceInsightsService,
    private readonly achievementService: KpiAchievementService,
    private readonly planService: PerformancePlanService,
    private readonly reviewService: PerformanceReviewService,
    private readonly improvementPlanService: PerformanceImprovementPlanService,
  ) {}

  @Get('summary')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:read')
  getSummary(@Req() req: AuthedRequest) {
    return this.insightsService.getEmployeeSummary(req.user);
  }

  @Get('assignments')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:read')
  async listAssignments(@Req() req: AuthedRequest) {
    return this.planService.listAssignmentsForEmployee(
      req.user,
      req.user.employeeId!,
    );
  }

  @Get('achievements')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:read')
  listAchievements(@Req() req: AuthedRequest) {
    return this.achievementService.listForEmployee(
      req.user,
      req.user.employeeId!,
    );
  }

  @Patch('achievements/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:update')
  updateAchievement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertKpiAchievementDto,
  ) {
    return this.achievementService.employeeUpsert(req.user, id, dto);
  }

  @Post('reviews/:periodAssignmentId/self-review')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:self-review')
  submitSelfReview(
    @Req() req: AuthedRequest,
    @Param('periodAssignmentId', ParseIntPipe) periodAssignmentId: number,
    @Body() dto: SubmitSelfReviewDto,
  ) {
    return this.reviewService.submitSelfReview(
      req.user,
      periodAssignmentId,
      dto,
    );
  }

  @Get('reviews')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:read')
  listReviews(@Req() req: AuthedRequest) {
    return this.reviewService.listForEmployee(req.user, req.user.employeeId!);
  }

  @Post('reviews/:id/appeal')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_reviews:appeal')
  submitAppeal(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitPerformanceAppealDto,
  ) {
    return this.reviewService.submitAppeal(req.user, id, dto);
  }

  @Get('improvement-plans')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:read')
  listImprovementPlans(@Req() req: AuthedRequest) {
    return this.improvementPlanService.list(req.user);
  }

  @Post('improvement-plans/:id/acknowledge')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_self_service:update')
  acknowledgeImprovementPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.improvementPlanService.acknowledge(req.user, id);
  }
}
