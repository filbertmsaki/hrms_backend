import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
  Req,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ReviewFieldVisitDto,
  AssignFieldFollowUpDto,
  AssignFieldVisitPlanDto,
  ReviewFieldCheckoutCorrectionDto,
  UpdateFieldOpportunityCommercialDto,
  UpsertFieldVisitCommercialPolicyDto,
} from '../dto/field-visit.dto';
import {
  FieldLocationMapQueryDto,
  WorkActivityQueryDto,
} from '../dto/queries.dto';
import { FieldVisitService } from '../services/field-visit.service';
import { WorkActivityInsightsService } from '../services/work-activity-insights.service';
import { createDownloadStream } from '../../../files/file-download.util';

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
  @Permissions('field_visits:manager-read')
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

  @Get('commercial-summary')
  @Permissions('field_visits:manager-read')
  getCommercialSummary(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.insightsService.getCommercialSummary(
      req.user,
      query.date_from,
      query.date_to,
    );
  }

  @Get('commercial-policy')
  @Permissions('field_visits:manager-read')
  getCommercialPolicy(@Req() req: AuthedRequest) {
    return this.visitService.getCommercialPolicyForCompany(req.user);
  }

  @Post('commercial-policy')
  @Permissions('field_visits:config')
  saveCommercialPolicy(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertFieldVisitCommercialPolicyDto,
  ) {
    return this.visitService.upsertCommercialPolicy(req.user, dto);
  }

  @Post('opportunities/:id/commercial')
  @Permissions('field_visits:manager-review')
  updateOpportunityCommercial(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFieldOpportunityCommercialDto,
  ) {
    return this.visitService.updateOpportunityCommercial(req.user, id, dto);
  }

  @Get('plans')
  @Permissions('field_visits:manager-read')
  listPlans(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listManagerPlans(req.user, query);
  }

  @Post('plans/assign')
  @Permissions('field_visits:manager-review')
  assignPlan(@Req() req: AuthedRequest, @Body() dto: AssignFieldVisitPlanDto) {
    return this.visitService.assignPlan(req.user, dto);
  }

  @Post('plans/:id/review')
  @Permissions('field_visits:manager-review')
  reviewPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFieldVisitDto,
  ) {
    return this.visitService.reviewPlan(req.user, id, dto);
  }

  @Get()
  @Permissions('field_visits:manager-read')
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
  @Permissions('field_visits:manager-read')
  plannedVsActual(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.visitService.getPlannedVsActual(req.user, query);
  }

  @Get('operations-report')
  @Permissions('field_visits:manager-read')
  operationsReport(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.visitService.getFieldOperationsReport(req.user, query);
  }

  @Get('follow-ups')
  @Permissions('field_visits:manager-read')
  followUps(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listManagerFollowUps(req.user, query);
  }

  @Get('checkout-corrections')
  @Permissions('field_visits:manager-read')
  corrections(@Req() req: AuthedRequest) {
    return this.visitService.listCheckoutCorrections(req.user);
  }

  @Get('parties/:id/history')
  @Permissions('field_visits:manager-read')
  partyHistory(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.visitService.getPartyVisitHistory(req.user, id);
  }

  @Post('checkout-corrections/:id/review')
  @Permissions('field_visits:manager-review')
  reviewCorrection(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFieldCheckoutCorrectionDto,
  ) {
    return this.visitService.reviewCheckoutCorrection(req.user, id, dto);
  }

  @Patch('follow-ups/:id/assign')
  @Permissions('field_visits:manager-review')
  assignFollowUp(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignFieldFollowUpDto,
  ) {
    return this.visitService.assignFollowUp(req.user, id, dto);
  }

  @Get('exceptions')
  @Permissions('field_visits:manager-read')
  exceptions(@Req() req: AuthedRequest) {
    return this.visitService.listExceptions(req.user);
  }

  @Get('exceptions/summary')
  @Permissions('field_visits:manager-read')
  exceptionsSummary(@Req() req: AuthedRequest) {
    return this.exceptions(req);
  }

  @Get(':id')
  @Permissions('field_visits:manager-read')
  getVisit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.getForManager(req.user, id);
  }

  @Get(':id/attachments/:attachmentId/download')
  @Permissions('field_visits:manager-read')
  async downloadAttachment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ): Promise<StreamableFile> {
    return createDownloadStream(
      await this.visitService.downloadAttachment(
        req.user,
        id,
        attachmentId,
        true,
      ),
    );
  }

  @Post(':id/review')
  @Permissions('field_visits:manager-review')
  reviewVisit(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFieldVisitDto,
  ) {
    return this.visitService.reviewVisit(req.user, id, dto);
  }
}
