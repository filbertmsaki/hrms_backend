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
import { SubmitSelfReviewDto } from '../dto/submit-self-review.dto';
import { SubmitPerformanceAppealDto } from '../dto/submit-performance-appeal.dto';
import { UpsertKpiAchievementDto } from '../dto/upsert-kpi-achievement.dto';
import { KpiAchievementService } from '../services/kpi-achievement.service';
import { PerformanceImprovementPlanService } from '../services/performance-improvement-plan.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformancePlanService } from '../services/performance-plan.service';
import { PerformanceReviewService } from '../services/performance-review.service';
import {
  CreateEmployeeKpiDto,
  EmployeeKpiQueryDto,
  UpdateEmployeeKpiActualDto,
  UpdateEmployeeKpiDto,
} from '../dto/employee-kpi.dto';
import { EmployeeKpiService } from '../services/employee-kpi.service';

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
    private readonly employeeKpiService: EmployeeKpiService,
  ) {}

  @Get('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:read')
  listKpis(@Req() req: AuthedRequest, @Query() query: EmployeeKpiQueryDto) {
    return this.employeeKpiService.listOwn(req.user, query);
  }

  @Post('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:create')
  createKpi(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeKpiDto) {
    return this.employeeKpiService.create(req.user, dto);
  }

  @Get('kpis/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:read')
  getKpi(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.employeeKpiService.getOwn(req.user, id);
  }

  @Patch('kpis/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:update')
  updateKpi(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeKpiDto,
  ) {
    return this.employeeKpiService.update(req.user, id, dto);
  }

  @Post('kpis/periods/:periodId/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:submit')
  submitKpis(
    @Req() req: AuthedRequest,
    @Param('periodId', ParseIntPipe) periodId: number,
  ) {
    return this.employeeKpiService.submitPeriod(req.user, periodId);
  }

  @Patch('kpis/:id/actual')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:self:update')
  updateKpiActual(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeKpiActualDto,
  ) {
    return this.employeeKpiService.updateActual(req.user, id, dto);
  }

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
