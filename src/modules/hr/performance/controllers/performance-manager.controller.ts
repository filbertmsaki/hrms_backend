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
import { SubmitManagerReviewDto } from '../dto/submit-manager-review.dto';
import { ValidateKpiAchievementDto } from '../dto/validate-kpi-achievement.dto';
import { KpiAchievementService } from '../services/kpi-achievement.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformanceReviewService } from '../services/performance-review.service';
import {
  CreateAssignedEmployeeKpiDto,
  EmployeeKpiQueryDto,
  ReviewEmployeeKpiDto,
} from '../dto/employee-kpi.dto';
import { EmployeeKpiService } from '../services/employee-kpi.service';
import { EmployeeKpiCycleReviewService } from '../services/employee-kpi-cycle-review.service';
import {
  FinalizeKpiReviewDto,
  SubmitKpiManagerReviewDto,
} from '../dto/employee-kpi-cycle-review.dto';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Performance Manager')
@ApiBearerAuth('access-token')
@Controller('performance/manager')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PerformanceManagerController {
  constructor(
    private readonly insightsService: PerformanceInsightsService,
    private readonly achievementService: KpiAchievementService,
    private readonly reviewService: PerformanceReviewService,
    private readonly employeeKpiService: EmployeeKpiService,
    private readonly cycleReviewService: EmployeeKpiCycleReviewService,
  ) {}

  @Get('kpi-reviews')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:team:read')
  listKpiReviews(
    @Req() req: AuthedRequest,
    @Query('period_id') periodId?: string,
  ) {
    return this.cycleReviewService.listTeam(
      req.user,
      periodId ? Number(periodId) : undefined,
    );
  }

  @Post('kpis/:id/reviews/:kind/manager')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:review')
  submitKpiManagerReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('kind') kind: 'MID' | 'FINAL',
    @Body() dto: SubmitKpiManagerReviewDto,
  ) {
    return this.cycleReviewService.submitManager(req.user, id, kind, dto);
  }

  @Post('kpis/:id/reviews/final/finalize')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:review')
  finalizeKpiReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizeKpiReviewDto,
  ) {
    return this.cycleReviewService.finalize(req.user, id, dto);
  }

  @Get('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:team:read')
  listTeamKpis(@Req() req: AuthedRequest, @Query() query: EmployeeKpiQueryDto) {
    return this.employeeKpiService.listTeam(req.user, query);
  }

  @Get('kpi-assignees')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:assign')
  listKpiAssignees(@Req() req: AuthedRequest) {
    return this.employeeKpiService.listAssignableEmployees(req.user);
  }

  @Post('kpis')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:assign')
  assignKpi(
    @Req() req: AuthedRequest,
    @Body() dto: CreateAssignedEmployeeKpiDto,
  ) {
    return this.employeeKpiService.assignToEmployee(req.user, dto);
  }

  @Get('kpis/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:team:read')
  getTeamKpi(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.employeeKpiService.getTeamOne(req.user, id);
  }

  @Post('kpis/:id/begin-review')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:review')
  beginKpiReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeKpiService.markPendingReview(req.user, id);
  }

  @Post('kpis/:id/review')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_kpis:review')
  reviewKpi(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewEmployeeKpiDto,
  ) {
    return this.employeeKpiService.review(req.user, id, dto);
  }

  @Get('summary')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_manager:read')
  getSummary(@Req() req: AuthedRequest) {
    return this.insightsService.getManagerSummary(req.user);
  }

  @Get('team-achievements')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_manager:read')
  listTeamAchievements(@Req() req: AuthedRequest) {
    return this.achievementService.listForManager(req.user);
  }

  @Post('achievements/:id/validate')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_manager:validate')
  validateAchievement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateKpiAchievementDto,
  ) {
    return this.achievementService.managerValidate(req.user, id, dto);
  }

  @Post('reviews/:periodAssignmentId/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('performance_manager:review')
  submitReview(
    @Req() req: AuthedRequest,
    @Param('periodAssignmentId', ParseIntPipe) periodAssignmentId: number,
    @Body() dto: SubmitManagerReviewDto,
  ) {
    return this.reviewService.submitManagerReview(
      req.user,
      periodAssignmentId,
      dto,
    );
  }
}
