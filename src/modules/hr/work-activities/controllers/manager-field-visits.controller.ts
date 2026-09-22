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
import { ReviewFieldVisitDto } from '../dto/field-visit.dto';
import {
  FieldLocationMapQueryDto,
  WorkActivityQueryDto,
} from '../dto/queries.dto';
import { FieldVisitService } from '../services/field-visit.service';
import { WorkActivityInsightsService } from '../services/work-activity-insights.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Manager Field Visits')
@ApiBearerAuth('access-token')
@Controller('manager/field-visits')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerFieldVisitsController {
  constructor(
    private readonly visitService: FieldVisitService,
    private readonly insightsService: WorkActivityInsightsService,
  ) {}

  @Get('dashboard')
  @Permissions('field_visits:manager:read')
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

  @Get('plans')
  @Permissions('field_visits:manager:read')
  listPlans(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listManagerPlans(req.user, query);
  }

  @Post('plans/:id/review')
  @Permissions('field_visits:manager:review')
  reviewPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFieldVisitDto,
  ) {
    return this.visitService.reviewPlan(req.user, id, dto);
  }

  @Get()
  @Permissions('field_visits:manager:read')
  listVisits(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listManagerVisits(req.user, query);
  }

  @Get('map')
  @Permissions('field_locations:read')
  getMap(@Req() req: AuthedRequest, @Query() query: FieldLocationMapQueryDto) {
    return this.visitService.getMapPoints(req.user, query);
  }

  @Get('map/view')
  @Permissions('field_locations:read')
  getMapView(
    @Req() req: AuthedRequest,
    @Query() query: FieldLocationMapQueryDto,
  ) {
    return this.getMap(req, query);
  }

  @Get('planned-vs-actual')
  @Permissions('field_visits:manager:read')
  plannedVsActual(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.visitService.getPlannedVsActual(req.user, query);
  }

  @Get('follow-ups')
  @Permissions('field_visits:manager:read')
  followUps(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listManagerFollowUps(req.user, query);
  }

  @Get('exceptions')
  @Permissions('field_visits:manager:read')
  exceptions(@Req() req: AuthedRequest) {
    return this.visitService.listExceptions(req.user);
  }

  @Get('exceptions/summary')
  @Permissions('field_visits:manager:read')
  exceptionsSummary(@Req() req: AuthedRequest) {
    return this.exceptions(req);
  }

  @Get(':id')
  @Permissions('field_visits:manager:read')
  getVisit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.getForManager(req.user, id);
  }

  @Post(':id/review')
  @Permissions('field_visits:manager:review')
  reviewVisit(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFieldVisitDto,
  ) {
    return this.visitService.reviewVisit(req.user, id, dto);
  }
}
