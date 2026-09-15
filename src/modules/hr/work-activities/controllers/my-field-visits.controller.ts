import {
  Body,
  Controller,
  Delete,
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
  AddFieldVisitEvidenceDto,
  CompleteFieldFollowUpDto,
  CreateFieldFollowUpDto,
  UpdateFieldFollowUpDto,
  CreateFieldOpportunityDto,
  CreateFieldVisitExpenseDto,
  CreateFieldVisitPlanDto,
  CreateUnplannedFieldVisitDto,
  FieldVisitCheckInDto,
  FieldVisitCheckOutDto,
  SubmitFieldVisitPlanDto,
  UpdateFieldVisitPlanDto,
} from '../dto/field-visit.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { FieldMobileSyncDto } from '../dto/sync.dto';
import { FieldMobileSyncService } from '../services/field-mobile-sync.service';
import { FieldVisitService } from '../services/field-visit.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('My Field Visits')
@ApiBearerAuth('access-token')
@Controller('me/field-visits')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class MyFieldVisitsController {
  constructor(
    private readonly visitService: FieldVisitService,
    private readonly syncService: FieldMobileSyncService,
  ) {}

  @Get('plans')
  @Permissions('field_visits:self-service:read')
  listPlans(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listMyPlans(req.user, query);
  }

  @Post('plans')
  @Permissions('field_visits:self-service:update')
  createPlan(@Req() req: AuthedRequest, @Body() dto: CreateFieldVisitPlanDto) {
    return this.visitService.createMyPlan(req.user, dto);
  }

  @Get('plans/:id')
  @Permissions('field_visits:self-service:read')
  getPlan(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.getMyPlan(req.user, id);
  }

  @Patch('plans/:id')
  @Permissions('field_visits:self-service:update')
  updatePlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFieldVisitPlanDto,
  ) {
    return this.visitService.updateMyPlan(req.user, id, dto);
  }

  @Post('plans/:id/submit')
  @Permissions('field_visits:self-service:update')
  submitPlan(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitFieldVisitPlanDto,
  ) {
    return this.visitService.submitMyPlan(req.user, id, dto);
  }

  @Post('unplanned')
  @Permissions('field_visits:self-service:update')
  createUnplanned(
    @Req() req: AuthedRequest,
    @Body() dto: CreateUnplannedFieldVisitDto,
  ) {
    return this.visitService.createUnplannedVisit(req.user, dto);
  }

  @Get()
  @Permissions('field_visits:self-service:read')
  listVisits(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listMyVisits(req.user, query);
  }

  @Get(':id')
  @Permissions('field_visits:self-service:read')
  getVisit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.getMyVisit(req.user, id);
  }

  @Post(':id/check-in')
  @Permissions('field_visits:self-service:update')
  checkIn(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FieldVisitCheckInDto,
  ) {
    return this.visitService.checkIn(req.user, id, dto);
  }

  @Post(':id/check-out')
  @Permissions('field_visits:self-service:update')
  checkOut(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FieldVisitCheckOutDto,
  ) {
    return this.visitService.checkOut(req.user, id, dto);
  }

  @Post(':id/evidence')
  @Permissions('field_visits:self-service:update')
  addEvidence(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddFieldVisitEvidenceDto,
  ) {
    return this.visitService.addEvidence(req.user, id, dto);
  }

  @Post(':id/opportunities')
  @Permissions('field_visits:self-service:update')
  addOpportunity(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFieldOpportunityDto,
  ) {
    return this.visitService.addOpportunity(req.user, id, dto);
  }

  @Post(':id/expenses')
  @Permissions('field_visits:self-service:update')
  addExpense(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFieldVisitExpenseDto,
  ) {
    return this.visitService.addExpense(req.user, id, dto);
  }

  @Get('/follow-ups/list')
  @Permissions('field_visits:self-service:read')
  listFollowUps(
    @Req() req: AuthedRequest,
    @Query() query: WorkActivityQueryDto,
  ) {
    return this.visitService.listMyFollowUps(req.user, query);
  }

  @Post('/follow-ups')
  @Permissions('field_visits:self-service:update')
  createFollowUp(
    @Req() req: AuthedRequest,
    @Body() dto: CreateFieldFollowUpDto,
  ) {
    return this.visitService.createMyFollowUp(req.user, dto);
  }

  @Patch('/follow-ups/:id')
  @Permissions('field_visits:self-service:update')
  updateFollowUp(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFieldFollowUpDto,
  ) {
    return this.visitService.updateMyFollowUp(req.user, id, dto);
  }

  @Delete('/follow-ups/:id')
  @Permissions('field_visits:self-service:update')
  cancelFollowUp(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.visitService.cancelMyFollowUp(req.user, id);
  }

  @Post('/follow-ups/:id/complete')
  @Permissions('field_visits:self-service:update')
  completeFollowUp(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteFieldFollowUpDto,
  ) {
    return this.visitService.completeMyFollowUp(req.user, id, dto);
  }

  @Post('/sync')
  @Permissions('field_visits:self-service:update')
  sync(@Req() req: AuthedRequest, @Body() dto: FieldMobileSyncDto) {
    return this.syncService.sync(req.user, dto);
  }

  @Get('/sync/:syncRequestId')
  @Permissions('field_visits:self-service:read')
  getSyncStatus(
    @Req() req: AuthedRequest,
    @Param('syncRequestId') syncRequestId: string,
  ) {
    return this.syncService.getStatus(req.user, syncRequestId);
  }
}
