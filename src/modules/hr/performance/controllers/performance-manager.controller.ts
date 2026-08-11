import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { SubmitManagerReviewDto } from '../dto/submit-manager-review.dto';
import { ValidateKpiAchievementDto } from '../dto/validate-kpi-achievement.dto';
import { KpiAchievementService } from '../services/kpi-achievement.service';
import { PerformanceInsightsService } from '../services/performance-insights.service';
import { PerformanceReviewService } from '../services/performance-review.service';

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
  ) {}

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
