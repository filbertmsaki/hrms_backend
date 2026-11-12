import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { KpiRoles, KpiRolesGuard } from './kpi-roles.guard';
import { KpiAnalyticsQueryDto } from './dto/kpi-analytics.dto';
import { KpiAnalyticsService } from './kpi-analytics.service';

type SessionRequest = Request & { user: AuthenticatedUser };
const management = [
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'DEPARTMENT_MANAGER',
  'BRANCH_MANAGER',
  'MANAGEMENT',
];

@ApiTags('KPI Phase 5 Analytics')
@ApiBearerAuth('access-token')
@Controller('hr/kpi/analytics')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class KpiAnalyticsController {
  constructor(private readonly analytics: KpiAnalyticsService) {}

  @Get('overview')
  @KpiRoles(...management, 'EMPLOYEE')
  overview(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.overview(req.user, query);
  }
  @Get('coverage')
  @KpiRoles(...management, 'EMPLOYEE')
  coverage(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.coverage(req.user, query);
  }
  @Get('historical-definitions')
  @KpiRoles(...management, 'EMPLOYEE')
  historicalDefinitions(
    @Req() req: SessionRequest,
    @Query() query: KpiAnalyticsQueryDto,
  ) {
    return this.analytics.historicalDefinitions(req.user, query);
  }
  @Get('subjects')
  @KpiRoles(
    'COMPANY_ADMIN',
    'HR_MANAGER',
    'DEPARTMENT_MANAGER',
    'BRANCH_MANAGER',
  )
  subjects(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.subjects(req.user, query);
  }
  @Get('scorecards')
  @KpiRoles(...management, 'EMPLOYEE')
  scorecards(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.scorecards(req.user, query);
  }
  @Get('evaluations')
  @KpiRoles(...management, 'EMPLOYEE')
  evaluations(
    @Req() req: SessionRequest,
    @Query() query: KpiAnalyticsQueryDto,
  ) {
    return this.analytics.evaluations(req.user, query);
  }
  @Get('trends')
  @KpiRoles(...management, 'EMPLOYEE')
  trends(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.trends(req.user, query);
  }

  @Get('scorecard-trends')
  @KpiRoles(...management, 'EMPLOYEE')
  scorecardTrends(
    @Req() req: SessionRequest,
    @Query() query: KpiAnalyticsQueryDto,
  ) {
    return this.analytics.scorecardTrends(req.user, query);
  }

  @Get('comparisons')
  @KpiRoles('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGEMENT')
  comparisons(
    @Req() req: SessionRequest,
    @Query() query: KpiAnalyticsQueryDto,
  ) {
    return this.analytics.comparisons(req.user, query);
  }

  @Get('team')
  @KpiRoles('DEPARTMENT_MANAGER', 'BRANCH_MANAGER')
  team(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.team(req.user, query);
  }

  @Get('ratings')
  @KpiRoles('COMPANY_ADMIN', 'HR_MANAGER')
  ratings(@Req() req: SessionRequest, @Query() query: KpiAnalyticsQueryDto) {
    return this.analytics.ratings(req.user, query);
  }
}
