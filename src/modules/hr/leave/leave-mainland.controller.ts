import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { LeaveFamily } from './entities/leave-ledger-entry.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveCutoverService } from './services/leave-cutover.service';
import { LeaveEmployeeProfileService } from './services/leave-employee-profile.service';
import { LeaveLifeEventService } from './services/leave-life-event.service';
import { leaveToday } from './services/leave-policy-revision.service';
import { MainlandLeaveService } from './services/mainland-leave.service';
import { MainlandCycleJobService } from './services/mainland-cycle-job.service';
import { MainlandReportService } from './services/mainland-report.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { LeaveDurationTypeEnum } from './enums/leave-duration-type.enum';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
type R = Request & { user: AuthenticatedUser };

class BuildCutoverDto {
  @Type(() => Number) @IsInt() policy_id: number;
  @IsString() @Matches(DATE) cutover_date: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @Type(() => Number) @IsInt({ each: true }) employee_ids?: number[];
}
class ResolveRowDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) override_days?: number | null;
  @IsString() @MaxLength(1000) reason: string;
}
class ApproveCutoverDto {
  @IsString() @MaxLength(1000) reason: string;
  @IsString() @MaxLength(2000) evidence: string;
}
class ConfirmHolidayDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string | null;
  @IsString() @MaxLength(1000) reason: string;
  @IsOptional() @IsString() @MaxLength(2000) evidence?: string | null;
}
class ReasonDto {
  @IsString() @MaxLength(1000) reason: string;
}
class PreviewDto {
  @Type(() => Number) @IsInt() employee_id: number;
  @Type(() => Number) @IsInt() leave_type_id: number;
  @IsString() @Matches(DATE) start_date: string;
  @IsString() @Matches(DATE) end_date: string;
  @IsOptional() @IsIn(Object.values(LeaveDurationTypeEnum)) duration_type?: LeaveDurationTypeEnum;
  @IsOptional() @Type(() => Number) @IsInt() leave_life_event_id?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) included_dates?: string[];
}
class LifeEventDto {
  @IsIn(['birth', 'expected_birth', 'child_death', 'child_sickness', 'spouse_death', 'parent_death', 'grandparent_death', 'grandchild_death', 'sibling_death'])
  event_type: string;
  @IsString() @Matches(DATE) event_date: string;
  @IsOptional() @Type(() => Number) @IsInt() related_event_id?: number;
  @IsOptional() @IsBoolean() multiple_birth?: boolean;
  @IsOptional() @IsBoolean() historical_paid_maternity_term?: boolean;
  @IsOptional() @IsString() @MaxLength(100) nssf_reference?: string;
  @IsOptional() @Type(() => Number) @IsInt() document_id?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class OverrideDto {
  @IsIn(['SICK_CERTIFICATE', 'MATERNITY_EARLY_START', 'RETURN_TO_WORK', 'ANNUAL_ADVANCE'])
  rule_code: string;
  @IsOptional() @Type(() => Number) @IsInt() leave_request_id?: number;
  @IsOptional() @IsString() @Matches(DATE) applies_on?: string;
  @IsString() @MaxLength(1000) reason: string;
  @IsOptional() @Type(() => Number) @IsInt() certificate_document_id?: number;
}

@ApiTags('Leave (Mainland)')
@ApiBearerAuth('access-token')
@Controller('leave/mainland')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveMainlandController {
  constructor(
    private readonly cutover: LeaveCutoverService,
    private readonly mainland: MainlandLeaveService,
    private readonly profiles: LeaveEmployeeProfileService,
    private readonly events: LeaveLifeEventService,
    private readonly cycleJob: MainlandCycleJobService,
    private readonly reports: MainlandReportService,
  ) {}

  // ---------------------------------------------------------------- reports
  private send(res: Response, format: string | undefined, name: string, rows: Record<string, unknown>[], body: unknown) {
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      return res.send(this.reports.toCsv(rows));
    }
    return res.json(body);
  }

  private asOf(v?: string) {
    return v && DATE.test(v) ? v : leaveToday();
  }

  @Get('reports/balances')
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'As-of balances with department and company totals (?format=csv)' })
  async reportBalances(@Req() req: R, @Res() res: Response, @Query('as_of') asOf?: string, @Query('family') family: LeaveFamily = 'annual', @Query('department_id') dept?: string, @Query('format') format?: string) {
    const r = await this.reports.balances(req.user.companyId!, req.user, { asOf: this.asOf(asOf), family, departmentId: dept ? Number(dept) : undefined });
    return this.send(res, format, `leave-balances-${family}-${r.as_of}`, r.rows, r);
  }

  @Get('reports/series/:employeeId/:family')
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'Daily, weekly, monthly or per-cycle as-of balances' })
  async reportSeries(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Param('family') family: LeaveFamily, @Query('from') from: string, @Query('to') to: string, @Query('granularity') g: 'daily' | 'weekly' | 'monthly' | 'cycle' = 'monthly') {
    if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) throw new ForbiddenException('from/to must be ISO dates');
    await this.profiles.asOf(req.user.companyId!, employeeId, req.user, from);
    return this.reports.series(req.user.companyId!, employeeId, family, from, to, g);
  }

  @Get('reports/liability')
  @Permissions('leave-balances.export')
  @ApiOperation({ summary: 'Annual leave liability at effective wage (?format=csv)' })
  async reportLiability(@Req() req: R, @Res() res: Response, @Query('as_of') asOf?: string, @Query('department_id') dept?: string, @Query('format') format?: string) {
    const r = await this.reports.liability(req.user.companyId!, req.user, this.asOf(asOf), dept ? Number(dept) : undefined);
    return this.send(res, format, `leave-liability-${r.as_of}`, r.rows, r);
  }

  @Get('reports/expiring')
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'Carry-over expiring within 30/60/90 days (?format=csv)' })
  async reportExpiring(@Req() req: R, @Res() res: Response, @Query('as_of') asOf?: string, @Query('within') within = '90', @Query('format') format?: string) {
    const days = [30, 60, 90].includes(Number(within)) ? Number(within) : 90;
    const r = await this.reports.expiring(req.user.companyId!, req.user, this.asOf(asOf), days);
    return this.send(res, format, `carry-over-expiring-${days}`, r.rows, r);
  }

  @Get('reports/sick-tiers')
  @Permissions('leave-balances.view')
  async reportSick(@Req() req: R, @Res() res: Response, @Query('as_of') asOf?: string, @Query('format') format?: string) {
    const r = await this.reports.sickTiers(req.user.companyId!, req.user, this.asOf(asOf));
    return this.send(res, format, 'sick-tier-usage', r.rows, r);
  }

  @Get('reports/maternity-terms')
  @Permissions('leave-balances.manage')
  async reportMaternity(@Req() req: R, @Res() res: Response, @Query('as_of') asOf?: string, @Query('format') format?: string) {
    const r = await this.reports.maternityTerms(req.user.companyId!, req.user, this.asOf(asOf));
    return this.send(res, format, 'maternity-terms', r.rows, r);
  }

  @Post('holidays/seed')
  @Permissions('holidays:create')
  @ApiOperation({ summary: 'Seed Mainland statutory holidays (rest of 2026 + 2027); never overwrites HR edits' })
  seedHolidays(@Req() req: R) {
    return this.reports.seedHolidays(req.user.companyId!, req.user);
  }

  @Get('holidays/review')
  @Permissions('holidays:read')
  @ApiOperation({ summary: 'Mainland holidays to check: provisional flags, days until, seeded rows HR deleted' })
  holidayReview(@Req() req: R, @Query('as_of') asOf?: string, @Query('within_days') within?: string) {
    return this.reports.holidayReview(req.user.companyId!, this.asOf(asOf), within ? Number(within) : 60);
  }

  @Post('holidays/:id/confirm')
  @Permissions('holidays:update')
  @ApiOperation({ summary: 'Confirm a Mainland holiday after the government announcement (optionally move it)' })
  confirmHoliday(@Req() req: R, @Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmHolidayDto) {
    return this.reports.confirmHoliday(req.user.companyId!, req.user, id, { date: dto.date ?? null, reason: dto.reason, evidence: dto.evidence ?? null });
  }

  // -------------------------------------------------------------- cycle job
  @Get('cycle-job/runs')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Daily cycle job runs (status, attempts, failures)' })
  runs(@Req() req: R) {
    return this.cycleJob.runs(req.user.companyId!);
  }

  @Post('cycle-job/run')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Run or retry the cycle job for today (idempotent)' })
  runNow(@Req() req: R) {
    return this.cycleJob.runCompany(req.user.companyId!, leaveToday());
  }

  @Post('carry-over/:employeeId/:sourceCycleStart/extend')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Extend a carry-over bucket to the approved extension limit' })
  extend(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Param('sourceCycleStart') src: string, @Body() dto: ReasonDto) {
    if (!DATE.test(src)) throw new ForbiddenException('Invalid bucket');
    return this.cycleJob.extend(req.user.companyId!, employeeId, src, req.user, dto.reason);
  }

  @Post('carry-over/:employeeId/:sourceCycleStart/forfeit')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Explicitly forfeit a carry-over bucket (reason required)' })
  forfeit(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Param('sourceCycleStart') src: string, @Body() dto: ReasonDto) {
    if (!DATE.test(src)) throw new ForbiddenException('Invalid bucket');
    return this.cycleJob.forfeit(req.user.companyId!, employeeId, src, req.user, dto.reason);
  }

  // ---------------------------------------------------------------- cutover
  @Get('cutovers')
  @Permissions('leave-balances.manage')
  listCutovers(@Req() req: R) {
    return this.cutover.list(req.user.companyId!);
  }

  @Post('cutovers')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Build a draft cutover reconciliation from historical records' })
  build(@Req() req: R, @Body() dto: BuildCutoverDto) {
    return this.cutover.build(req.user.companyId!, req.user, { policyId: dto.policy_id, cutoverDate: dto.cutover_date, employeeIds: dto.employee_ids });
  }

  @Get('cutovers/:id/rows')
  @Permissions('leave-balances.manage')
  rows(@Req() req: R, @Param('id', ParseIntPipe) id: number) {
    return this.cutover.rows(req.user.companyId!, id);
  }

  @Get('cutovers/:id/export.csv')
  @Permissions('leave-balances.manage')
  @Header('Content-Type', 'text/csv')
  export(@Req() req: R, @Param('id', ParseIntPipe) id: number) {
    return this.cutover.exportCsv(req.user.companyId!, id);
  }

  @Post('cutover-rows/:rowId/resolve')
  @Permissions('leave-balances.manage')
  resolveRow(@Req() req: R, @Param('rowId', ParseIntPipe) rowId: number, @Body() dto: ResolveRowDto) {
    return this.cutover.resolveRow(req.user.companyId!, rowId, req.user, { overrideDays: dto.override_days, reason: dto.reason });
  }

  @Post('cutovers/:id/approve')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'HR sign-off: seals the reconciliation (four-eyes)' })
  approve(@Req() req: R, @Param('id', ParseIntPipe) id: number, @Body() dto: ApproveCutoverDto) {
    return this.cutover.approve(req.user.companyId!, id, req.user, dto);
  }

  @Post('cutovers/:id/post')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Post OPENING_BALANCE entries once (idempotent, stale-checked)' })
  post(@Req() req: R, @Param('id', ParseIntPipe) id: number) {
    return this.cutover.post(req.user.companyId!, id, req.user);
  }

  @Post('cutovers/:id/void')
  @Permissions('leave-balances.manage')
  void(@Req() req: R, @Param('id', ParseIntPipe) id: number, @Body() dto: ReasonDto) {
    return this.cutover.void(req.user.companyId!, id, req.user, dto.reason);
  }

  @Post('cutovers/:id/reverse')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Recovery: reverse posted opening entries before activation' })
  reverse(@Req() req: R, @Param('id', ParseIntPipe) id: number, @Body() dto: ReasonDto) {
    return this.cutover.reversePosting(req.user.companyId!, id, req.user, dto.reason);
  }

  // --------------------------------------------------------------- balances
  @Get('balances/:employeeId/:family')
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'As-of balance (past, present or future) with buckets and projection' })
  async balance(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Param('family') family: LeaveFamily, @Query('as_of') asOf?: string) {
    if (!['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'unpaid'].includes(family)) throw new ForbiddenException('Unknown leave family');
    const date = asOf && DATE.test(asOf) ? asOf : leaveToday();
    await this.profiles.asOf(req.user.companyId!, employeeId, req.user, date); // employee-scope check
    return this.mainland.getBalance(req.user.companyId!, employeeId, family, date);
  }

  @Post('preview')
  @Permissions('leave_requests:create')
  @ApiOperation({ summary: 'Preview counted dates, buckets, pay tiers, warnings and evidence (no posting)' })
  async preview(@Req() req: R, @Body() dto: PreviewDto) {
    await this.profiles.asOf(req.user.companyId!, dto.employee_id, req.user, dto.start_date);
    const draft = Object.assign(new LeaveRequest(), {
      id: -1,
      company_id: req.user.companyId!,
      employee_id: dto.employee_id,
      leave_type_id: dto.leave_type_id,
      start_date: dto.start_date,
      end_date: dto.end_date,
      duration_type: dto.duration_type ?? LeaveDurationTypeEnum.FULL_DAY,
      leave_life_event_id: dto.leave_life_event_id ?? null,
      total_days: String(dto.included_dates?.length ?? 0),
      calculation_snapshot: { included_dates: dto.included_dates ?? [] },
      approval_cycle: 1,
    });
    return this.mainland.preview(req.user.companyId!, draft);
  }

  // ------------------------------------------------------------ life events
  @Get('life-events/:employeeId')
  @Permissions('leave-balances.view')
  listEvents(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.events.list(req.user.companyId!, employeeId, req.user);
  }

  @Post('life-events/:employeeId')
  @Permissions('leave_requests:create')
  createEvent(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Body() dto: LifeEventDto) {
    return this.events.create(req.user.companyId!, employeeId, req.user, dto);
  }

  @Post('life-events/:employeeId/:eventId/verify')
  @Permissions('leave-balances.manage')
  verifyEvent(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Param('eventId', ParseIntPipe) eventId: number) {
    return this.events.verify(req.user.companyId!, employeeId, eventId, req.user);
  }

  @Post('overrides/:employeeId')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Record a reasoned HR override (certificate where the rule requires it)' })
  override(@Req() req: R, @Param('employeeId', ParseIntPipe) employeeId: number, @Body() dto: OverrideDto) {
    return this.events.override(req.user.companyId!, employeeId, req.user, dto);
  }
}
