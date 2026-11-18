import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Request as ExpressRequest, Response } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  ConfirmLeaveEncashmentFinanceDto,
  ReverseLeaveEncashmentDto,
} from './dtos/record-leave-encashment-payroll-handoff.dto';
import { UpdateLeavePolicyDto } from './dtos/update-leave-policy.dto';
import type { LeaveStatutoryRuleType } from './entities/leave-statutory-rule.entity';
import { LeaveService } from './leave.service';
import { LeaveEncashmentPaymentSyncService } from './services/leave-encashment-payment-sync.service';
import { LeaveRolloverService } from './services/leave-rollover.service';
import {
  LeaveStatutoryService,
  STATUTORY_RULE_TYPES,
} from './services/leave-statutory.service';

type Req = ExpressRequest & { user: AuthenticatedUser };

class ApprovePolicyVersionDto {
  @IsOptional()
  @IsDateString()
  effective_from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  change_reason?: string;

  /** Required to back-date a version (retroactive correction). */
  @IsOptional()
  @IsBoolean()
  allow_retroactive?: boolean;
}

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

class CreateRolloverRunDto {
  @Matches(/^\d{4}$/)
  from_leave_year: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leave_type_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class LegalReferenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  citation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

class StatutoryRuleDto {
  @IsIn(STATUTORY_RULE_TYPES)
  rule_type: LeaveStatutoryRuleType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leave_type_id?: number | null;

  @IsObject()
  settings: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  legal_reference?: string;
}

class StatutoryRuleSetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  jurisdiction_code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  legal_authority?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalReferenceDto)
  legal_references?: LegalReferenceDto[];

  @IsOptional()
  @IsBoolean()
  is_test_configuration?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  change_reason?: string;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => StatutoryRuleDto)
  rules: StatutoryRuleDto[];
}

class UpdateStatutoryRuleSetDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  legal_authority?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalReferenceDto)
  legal_references?: LegalReferenceDto[];

  @IsOptional()
  @IsBoolean()
  is_test_configuration?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  change_reason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => StatutoryRuleDto)
  rules?: StatutoryRuleDto[];
}

class VerifyStatutoryRuleSetDto {
  @IsBoolean()
  verified: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  notes: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalReferenceDto)
  legal_references?: LegalReferenceDto[];
}

class ActivateStatutoryRuleSetDto {
  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  change_reason?: string;
}

class BranchJurisdictionDto {
  @Type(() => Number)
  @IsInt()
  branch_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  jurisdiction_code: string | null;
}

class StatutorySettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  default_jurisdiction_code?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchJurisdictionDto)
  branches?: BranchJurisdictionDto[];
}

class PublicHolidayCompensationDto {
  @IsDateString()
  from_date: string;

  @IsDateString()
  to_date: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payroll_period_code?: string;

  @IsOptional()
  @IsBoolean()
  post?: boolean;
}

/**
 * Leave policy engine: policy versions, year-end rollover runs, statutory
 * rules and the leave ↔ payroll money integration.
 */
@ApiTags('Leave engine')
@ApiBearerAuth('access-token')
@Controller('leave')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveEngineController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly rollover: LeaveRolloverService,
    private readonly statutory: LeaveStatutoryService,
    private readonly paymentSync: LeaveEncashmentPaymentSyncService,
  ) {}

  // ---------------------------------------------------------- versions
  @Get('policies/:id/versions')
  @Permissions('leave_policies:read')
  @ApiOperation({ summary: 'All versions of a leave policy, newest first' })
  listVersions(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.leaveService.listPolicyVersions(req.user.companyId!, id);
  }

  @Post('policies/:id/versions')
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Create the next version of an approved policy' })
  revise(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.leaveService.revisePolicy(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('policies/:id/submit')
  @Permissions('leave_policies:update')
  submitVersion(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.leaveService.submitPolicyVersion(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('policies/:id/approve')
  @Permissions('leave_policies:approve')
  @ApiOperation({
    summary: 'Approve a policy version and set its effective date',
  })
  approveVersion(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovePolicyVersionDto,
  ) {
    return this.leaveService.approvePolicyVersion(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('policies/:id/return')
  @Permissions('leave_policies:approve')
  returnVersion(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
  ) {
    return this.leaveService.returnPolicyVersion(
      req.user.companyId!,
      id,
      dto.reason,
      req.user,
    );
  }

  @Post('policies/:id/discard')
  @Permissions('leave_policies:update')
  discardVersion(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.leaveService.discardPolicyVersion(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('policies/:id/compare/:otherId')
  @Permissions('leave_policies:read')
  compare(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Param('otherId', ParseIntPipe) otherId: number,
  ) {
    return this.leaveService.comparePolicyVersionsById(
      req.user.companyId!,
      otherId,
      id,
    );
  }

  @Get('policies/:id/impact')
  @Permissions('leave_policies:read')
  @ApiOperation({
    summary: 'Employees affected by a policy version, before approval',
  })
  impact(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.leaveService.policyImpactPreview(req.user.companyId!, id);
  }

  // ---------------------------------------------------------- rollover
  @Get('rollover/cycles')
  @Permissions('leave_rollover:read')
  @ApiOperation({
    summary:
      'Leave-cycle schedule per balance: current cycle, next rollover date, last rollover status and errors',
  })
  cycleSchedule(
    @Req() req: Req,
    @Query('employee_id') employeeId?: string,
    @Query('leave_type_id') leaveTypeId?: string,
    @Query('status') status?: 'open' | 'due' | 'closed' | 'failed',
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rollover.listCycleSchedule(req.user.companyId!, {
      employeeId: employeeId ? Number(employeeId) : undefined,
      leaveTypeId: leaveTypeId ? Number(leaveTypeId) : undefined,
      status: ['open', 'due', 'closed', 'failed'].includes(status ?? '')
        ? status
        : undefined,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('rollover/runs')
  @Permissions('leave_rollover:read')
  listRuns(@Req() req: Req) {
    return this.rollover.listRuns(req.user.companyId!);
  }

  @Get('rollover/runs/:id')
  @Permissions('leave_rollover:read')
  getRun(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.rollover.getRunWithLines(req.user.companyId!, id);
  }

  @Get('rollover/runs/:id/report.csv')
  @Permissions('leave_rollover:read')
  async report(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const csv = await this.rollover.exportRunCsv(req.user.companyId!, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="leave-rollover-run-${id}.csv"`,
    );
    res.send(csv);
  }

  @Post('rollover/runs')
  @Permissions('leave_rollover:manage')
  @ApiOperation({ summary: 'Prepare a year-end rollover preview' })
  createRun(@Req() req: Req, @Body() dto: CreateRolloverRunDto) {
    return this.rollover.createPreview(req.user.companyId!, dto, req.user);
  }

  @Post('rollover/runs/:id/refresh')
  @Permissions('leave_rollover:manage')
  refreshRun(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.rollover.refreshPreview(req.user.companyId!, id, req.user);
  }

  @Post('rollover/runs/:id/submit')
  @Permissions('leave_rollover:manage')
  submitRun(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.rollover.submit(req.user.companyId!, id, req.user);
  }

  @Post('rollover/runs/:id/approve')
  @Permissions('leave_rollover:approve')
  @ApiOperation({ summary: 'Approve and post a rollover (retry-safe)' })
  approveRun(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.rollover.approveAndPost(req.user.companyId!, id, req.user);
  }

  @Post('rollover/runs/:id/cancel')
  @Permissions('leave_rollover:manage')
  cancelRun(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
  ) {
    return this.rollover.cancel(req.user.companyId!, id, dto.reason, req.user);
  }

  // --------------------------------------------------------- statutory
  @Get('statutory/rule-sets')
  @Permissions('leave_statutory:read')
  listRuleSets(@Req() req: Req, @Query('jurisdiction') jurisdiction?: string) {
    return this.statutory.listRuleSets(req.user.companyId!, jurisdiction);
  }

  @Get('statutory/rule-sets/:id')
  @Permissions('leave_statutory:read')
  getRuleSet(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.statutory.getRuleSet(req.user.companyId!, id);
  }

  @Post('statutory/rule-sets')
  @Permissions('leave_statutory:manage')
  createRuleSet(@Req() req: Req, @Body() dto: StatutoryRuleSetDto) {
    return this.statutory.createRuleSet(req.user.companyId!, dto, req.user);
  }

  @Patch('statutory/rule-sets/:id')
  @Permissions('leave_statutory:manage')
  updateRuleSet(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatutoryRuleSetDto,
  ) {
    return this.statutory.updateRuleSet(req.user.companyId!, id, dto, req.user);
  }

  @Post('statutory/rule-sets/:id/revise')
  @Permissions('leave_statutory:manage')
  reviseRuleSet(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.statutory.reviseRuleSet(req.user.companyId!, id, req.user);
  }

  @Post('statutory/rule-sets/:id/submit')
  @Permissions('leave_statutory:manage')
  submitRuleSet(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.statutory.submitRuleSet(req.user.companyId!, id, req.user);
  }

  @Post('statutory/rule-sets/:id/verify')
  @Permissions('leave_statutory:approve')
  @ApiOperation({ summary: 'Record the legal verification of a rule set' })
  verifyRuleSet(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyStatutoryRuleSetDto,
  ) {
    return this.statutory.verifyRuleSet(req.user.companyId!, id, dto, req.user);
  }

  @Post('statutory/rule-sets/:id/activate')
  @Permissions('leave_statutory:approve')
  activateRuleSet(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivateStatutoryRuleSetDto,
  ) {
    return this.statutory.activateRuleSet(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('statutory/rule-sets/:id/discard')
  @Permissions('leave_statutory:manage')
  discardRuleSet(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.statutory.discardRuleSet(req.user.companyId!, id, req.user);
  }

  @Get('statutory/settings')
  @Permissions('leave_statutory:read')
  getStatutorySettings(@Req() req: Req) {
    return this.statutory.getCompanySettings(req.user.companyId!);
  }

  @Put('statutory/settings')
  @Permissions('leave_statutory:manage')
  updateStatutorySettings(@Req() req: Req, @Body() dto: StatutorySettingsDto) {
    return this.statutory.updateCompanySettings(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Post('statutory/public-holiday-compensation')
  @Permissions('leave_statutory:manage')
  @ApiOperation({
    summary:
      'Calculate statutory public-holiday work pay from attendance; post=true creates draft payroll inputs',
  })
  publicHolidayCompensation(
    @Req() req: Req,
    @Body() dto: PublicHolidayCompensationDto,
  ) {
    return this.statutory.publicHolidayCompensation(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  // ------------------------------------------------ encashment ↔ payroll
  @Post('encashments/:id/reverse')
  @PermissionsAny('leave-balances.manage', 'leave-balances.adjust')
  @ApiOperation({
    summary: 'Reverse an approved, unpaid encashment (days returned)',
  })
  reverseEncashment(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseLeaveEncashmentDto,
  ) {
    return this.leaveService.reverseLeaveEncashment(
      req.user.companyId!,
      id,
      dto.reason,
      req.user,
    );
  }

  @Post('encashments/sync-payments')
  @PermissionsAny('leave-balances.manage', 'leave-balances.adjust')
  @ApiOperation({
    summary: 'Check payroll now for paid or reversed encashments',
  })
  syncPayments(@Req() req: Req) {
    return this.paymentSync.syncAll(req.user.companyId);
  }

  @Get('payroll-components/status')
  @PermissionsAny(
    'leave-balances.manage',
    'leave-balances.adjust',
    'leave_encashment:finance_confirm',
  )
  componentStatus(@Req() req: Req) {
    return this.leaveService.leavePayrollComponentStatus(req.user.companyId!);
  }

  @Post('payroll-components/confirm')
  @Permissions('leave_encashment:finance_confirm')
  @ApiOperation({
    summary:
      'Finance confirms GL, tax and pension treatment of a leave payroll component',
  })
  confirmComponent(
    @Req() req: Req,
    @Body() dto: ConfirmLeaveEncashmentFinanceDto,
  ) {
    return this.leaveService.confirmLeavePayrollComponent(
      req.user.companyId!,
      dto,
      req.user,
    );
  }
}
