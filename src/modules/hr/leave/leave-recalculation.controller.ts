import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request as ExpressRequest, Response } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  LeaveRecalculationService,
  RECALC_PERMISSIONS,
} from './services/leave-recalculation.service';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { LeaveService } from './leave.service';
import type { AccrualFrequency } from './utils/leave-accrual-engine.util';
import {
  computeAccrual,
  resolveAccrualStart,
} from './utils/leave-accrual-engine.util';

type Req = ExpressRequest & { user: AuthenticatedUser };

export class CreateLeaveRecalculationDto {
  @ApiProperty({ enum: ['employee', 'department', 'branch', 'company'] })
  @IsIn(['employee', 'department', 'branch', 'company'])
  scope_type: 'employee' | 'department' | 'branch' | 'company';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  scope_id?: number;

  @ApiPropertyOptional({ description: 'Only this leave type (default: all)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leave_type_id?: number;

  @ApiPropertyOptional({
    description: 'Cutoff date (default: today, never future)',
  })
  @IsOptional()
  @IsDateString()
  as_of_date?: string;
}

export class SubmitLeaveRecalculationDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class SimulateAccrualDto {
  @ApiProperty({ enum: ['daily', 'weekly', 'monthly', 'yearly', 'manual'] })
  @IsIn(['daily', 'weekly', 'monthly', 'yearly', 'manual'])
  frequency: AccrualFrequency;

  @ApiProperty()
  @Type(() => Number)
  @Min(0)
  entitlement_days: number;

  @ApiPropertyOptional({ enum: ['hire_date', 'probation_completion'] })
  @IsOptional()
  @IsIn(['hire_date', 'probation_completion'])
  accrual_start_basis?: 'hire_date' | 'probation_completion';

  @ApiPropertyOptional({ enum: ['in_advance', 'in_arrears'] })
  @IsOptional()
  @IsIn(['in_advance', 'in_arrears'])
  accrual_timing?: 'in_advance' | 'in_arrears';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  prorate?: boolean;

  @ApiPropertyOptional({ description: 'Fixed days per month (monthly only)' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  monthly_rate?: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  cycle_start: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  hire_date: string;

  @ApiPropertyOptional({ description: 'Months of probation (0 = none)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  probation_months?: number;
}

/**
 * Accrual explanation for an employee, and a policy simulator for HR
 * (expected balance month by month before saving a policy).
 */
@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/accrual')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveAccrualController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly hrAccess: HrAccessService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('employees/:employeeId')
  @PermissionsAny('leave-balances.view', 'leave-balances.manage')
  @ApiOperation({ summary: "How an employee's balances are earned" })
  async employee(
    @Req() req: Req,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: req.user.companyId! },
      relations: { primary_department: true, primary_position: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.hrAccess.assertCanAccessEmployee(req.user, employee);
    return this.leaveService.getAccrualSummary(req.user.companyId!, employeeId);
  }

  @Post('simulate')
  @PermissionsAny(
    'leave_policies:read',
    'leave_policies:update',
    'leave_policies:create',
  )
  @ApiOperation({
    summary: 'Simulate accrual for a policy setting (no data used or changed)',
  })
  simulate(@Body() dto: SimulateAccrualDto) {
    const cycleStart = dto.cycle_start.slice(0, 10);
    const startMs = Date.parse(`${cycleStart}T00:00:00Z`);
    const cycleEndDate = new Date(startMs);
    cycleEndDate.setUTCFullYear(cycleEndDate.getUTCFullYear() + 1);
    const cycleEnd = new Date(cycleEndDate.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const hire = dto.hire_date.slice(0, 10);
    const probationEnd = dto.probation_months
      ? (() => {
          const d = new Date(`${hire}T00:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() + dto.probation_months);
          return new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
        })()
      : null;
    // Simulation assumes probation is confirmed on its scheduled end date.
    const start = resolveAccrualStart(
      {
        hire_date: hire,
        probation_end_date: probationEnd,
        confirmation_status: probationEnd ? 'CONFIRMED' : 'NOT_APPLICABLE',
        confirmation_date: probationEnd,
      },
      dto.accrual_start_basis ?? 'hire_date',
    );
    const months: Array<{ as_of: string; accrued: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const d = new Date(startMs);
      d.setUTCMonth(d.getUTCMonth() + m);
      const asOf = new Date(d.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const r = computeAccrual({
        frequency: dto.frequency,
        entitlementDays: dto.entitlement_days,
        cycleStart,
        cycleEnd,
        accrualStart: start.date,
        asOf,
        timing: dto.accrual_timing ?? 'in_advance',
        prorate: dto.prorate ?? false,
        monthlyRate: dto.monthly_rate ?? null,
      });
      months.push({ as_of: asOf, accrued: Math.round(r.accrued * 100) / 100 });
    }
    return {
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      accrual_start_date: start.date,
      explanation: start.reason,
      months,
    };
  }
}

/** Recalculate Leave Balance: preview (dry run) → apply → approve → history. */
@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/balance-recalculations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveRecalculationController {
  constructor(private readonly recalc: LeaveRecalculationService) {}

  @Get()
  @PermissionsAny(RECALC_PERMISSIONS.history, RECALC_PERMISSIONS.preview)
  @ApiOperation({ summary: 'Recalculation history' })
  list(
    @Req() req: Req,
    @Query('employee_id') employeeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recalc.list(req.user.companyId!, req.user, {
      employee_id: employeeId ? Number(employeeId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  @PermissionsAny(RECALC_PERMISSIONS.preview)
  @ApiOperation({ summary: 'Start a preview (dry run; changes nothing)' })
  create(@Req() req: Req, @Body() dto: CreateLeaveRecalculationDto) {
    return this.recalc.create(req.user.companyId!, dto, req.user);
  }

  @Get(':id')
  @PermissionsAny(RECALC_PERMISSIONS.history, RECALC_PERMISSIONS.preview)
  @ApiOperation({ summary: 'Run with its lines (current vs recalculated)' })
  detail(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Query('only_changed') onlyChanged?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recalc.detail(req.user.companyId!, id, req.user, {
      only_changed: onlyChanged === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/report.csv')
  @PermissionsAny(RECALC_PERMISSIONS.history, RECALC_PERMISSIONS.preview)
  @ApiOperation({ summary: 'Download the preview / reconciliation report' })
  async csv(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { filename, body } = await this.recalc.csv(
      req.user.companyId!,
      id,
      req.user,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // UTF-8 byte-order mark so Excel opens the report with the right encoding.
    res.send(`${String.fromCharCode(0xfeff)}${body}`);
  }

  @Post(':id/apply')
  @PermissionsAny(RECALC_PERMISSIONS.employee, RECALC_PERMISSIONS.bulk)
  @ApiOperation({
    summary: 'Apply the previewed corrections (bulk: submits for approval)',
  })
  apply(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitLeaveRecalculationDto,
  ) {
    return this.recalc.submit(req.user.companyId!, id, dto.reason, req.user);
  }

  @Post(':id/approve')
  @PermissionsAny(RECALC_PERMISSIONS.approve)
  @ApiOperation({
    summary: 'Approve a bulk recalculation (independent approver)',
  })
  approve(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.recalc.approve(req.user.companyId!, id, req.user);
  }

  @Post(':id/retry')
  @PermissionsAny(RECALC_PERMISSIONS.employee, RECALC_PERMISSIONS.bulk)
  @ApiOperation({ summary: 'Retry failed lines' })
  retry(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.recalc.retry(req.user.companyId!, id, req.user);
  }

  @Post(':id/cancel')
  @PermissionsAny(RECALC_PERMISSIONS.preview, RECALC_PERMISSIONS.bulk)
  @ApiOperation({ summary: 'Cancel a run that has not been applied' })
  cancel(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.recalc.cancel(req.user.companyId!, id, req.user);
  }
}
