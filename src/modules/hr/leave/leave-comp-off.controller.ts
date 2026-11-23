import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitLeaveLifecycle } from './utils/leave-lifecycle-notify.util';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { DataSource, In } from 'typeorm';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import {
  LeaveCompOffCredit,
  LeaveCompOffPolicy,
} from './entities/leave-comp-off.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveCompOffService } from './services/leave-comp-off.service';

class EarnCompOffDto {
  @Type(() => Number) @IsInt() leave_type_id: number;
  @Type(() => Number) @IsInt() overtime_request_id: number;
  /** HR/manager submitting for someone else; defaults to the caller. */
  @IsOptional() @Type(() => Number) @IsInt() employee_id?: number;
}
class DecideCompOffDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(500) cap_override_reason?: string;
}
class ReverseCompOffDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
class CompOffPolicyDto {
  @Type(() => Number) @IsInt() leave_type_id: number;
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(24) hours_per_day: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimum_hours?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  max_days_per_credit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  expiry_days?: number;
  @IsBoolean() requires_approval: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligible_employment_types?: string[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class CreditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() employee_id?: number;
  @IsOptional()
  @IsIn(['pending_approval', 'credited', 'expired', 'reversed', 'rejected'])
  status?: string;
  @IsOptional() @IsString() leave_year?: string;
}

type Req = ExpressRequest & { user: AuthenticatedUser };

/**
 * Compensatory off (FRS-11.1.09). Employees see and request their own
 * credits; approvers act on employees they may access; HR manages the
 * policy. Earning stays blocked until a policy row is HR-approved.
 */
@ApiTags('Leave comp-off')
@Controller('leave/comp-off')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveCompOffController {
  constructor(
    private readonly compOff: LeaveCompOffService,
    private readonly dataSource: DataSource,
    private readonly hrAccess: HrAccessService,
    private readonly audit: LeaveAuditService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private notifyCredit(
    companyId: number,
    credit: {
      id: number;
      employee_id: number;
      days: string;
      status: string;
      closed_reason?: string | null;
    },
    stage: 'requested' | 'approved' | 'rejected' | 'credited',
    senderCompanyUserId: number | null,
  ) {
    const text = {
      requested: [
        'Compensatory off requested',
        `${credit.days} day(s) of compensatory off are waiting for approval.`,
        true,
      ],
      approved: [
        'Compensatory off approved',
        `Your compensatory off of ${credit.days} day(s) was approved.`,
        false,
      ],
      rejected: [
        'Compensatory off rejected',
        `Your compensatory off request was rejected${credit.closed_reason ? `: ${credit.closed_reason}` : '.'}`,
        false,
      ],
      credited: [
        'Compensatory off credited',
        `${credit.days} day(s) of compensatory off were added to your leave balance.`,
        false,
      ],
    } as const;
    const [title, message, notifyHr] = text[stage];
    emitLeaveLifecycle(this.eventEmitter, {
      companyId,
      eventKey: `leave.comp_off.${stage}`,
      title,
      message,
      employeeId: credit.employee_id,
      notifyHr,
      senderCompanyUserId,
      entityType: 'LEAVE_COMP_OFF_CREDIT',
      entityId: credit.id,
      actionUrl: notifyHr
        ? '/dashboard/leave-management'
        : '/dashboard/self-service',
      dedupeKey: `leave-comp-off:${credit.id}:${stage}`,
    });
  }

  private async assertEmployee(actor: AuthenticatedUser, employeeId: number) {
    if (actor.employeeId === employeeId) return;
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: actor.companyId! },
      relations: {
        department_assignments: true,
        primary_department: true,
        primary_position: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.hrAccess.assertCanAccessEmployee(actor, employee);
  }

  @Get('eligibility')
  @PermissionsAny('leave_requests:read', 'leave_requests:create')
  @ApiOperation({
    summary:
      'Comp-off types, policy state and the caller’s convertible overtime',
  })
  async eligibility(@Req() req: Req) {
    const companyId = req.user.companyId!;
    const types = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT t.id, t.code, t.name, t.comp_off_enabled,
              p.id AS policy_id, p.status AS policy_status, p.hours_per_day, p.expiry_days,
              p.requires_approval, p.eligible_employment_types
         FROM leave_types t
         LEFT JOIN leave_comp_off_policies p ON p.leave_type_id = t.id AND p.company_id = t.company_id
        WHERE t.company_id=$1 AND (t.comp_off_enabled OR p.id IS NOT NULL)
        ORDER BY t.code`,
      [companyId],
    );
    const overtime = req.user.employeeId
      ? await this.dataSource.query<Array<Record<string, unknown>>>(
          `SELECT o.id, o.work_date::text AS work_date, o.requested_minutes
             FROM payroll_overtime_requests o
            WHERE o.company_id=$1 AND o.employee_id=$2 AND o.status='APPROVED'
              AND NOT EXISTS (SELECT 1 FROM leave_comp_off_credits c
                               WHERE c.company_id=o.company_id AND c.source_type='OVERTIME_REQUEST'
                                 AND c.source_reference=o.id::text AND c.status NOT IN ('rejected'))
            ORDER BY o.work_date DESC LIMIT 50`,
          [companyId, req.user.employeeId],
        )
      : [];
    return {
      types: types.map((t) => ({
        ...t,
        earning_enabled:
          t.comp_off_enabled === true && t.policy_status === 'approved',
        disabled_reason: !t.comp_off_enabled
          ? 'Compensatory off is switched off for this leave type.'
          : t.policy_status !== 'approved'
            ? 'Waiting for HR to approve the compensatory-off policy.'
            : null,
      })),
      convertible_overtime: overtime,
    };
  }

  @Get('credits')
  @PermissionsAny('leave_requests:read', 'leave_requests:approve')
  @ApiOperation({
    summary: 'Comp-off credits (own, or employees the caller may access)',
  })
  async credits(@Req() req: Req, @Query() q: CreditQueryDto) {
    const companyId = req.user.companyId!;
    const qb = this.dataSource
      .getRepository(LeaveCompOffCredit)
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .orderBy('c.work_date', 'DESC')
      .take(200);
    if (q.employee_id) {
      await this.assertEmployee(req.user, q.employee_id);
      qb.andWhere('c.employee_id = :e', { e: q.employee_id });
    } else {
      const allowed = await this.hrAccess.getAccessibleEmployeeIds(req.user);
      if (allowed)
        qb.andWhere('c.employee_id IN (:...ids)', {
          ids: allowed.length ? allowed : [0],
        });
    }
    if (q.status) qb.andWhere('c.status = :s', { s: q.status });
    if (q.leave_year) qb.andWhere('c.leave_year = :y', { y: q.leave_year });
    return qb.getMany();
  }

  @Get('pending')
  @Permissions('leave_requests:approve')
  @ApiOperation({
    summary: 'Comp-off credits waiting for the caller’s decision',
  })
  async pending(@Req() req: Req) {
    const allowed = await this.hrAccess.getAccessibleEmployeeIds(req.user);
    return this.dataSource.getRepository(LeaveCompOffCredit).find({
      where: {
        company_id: req.user.companyId!,
        status: 'pending_approval',
        ...(allowed
          ? {
              employee_id: In(
                allowed.filter((id) => id !== req.user.employeeId),
              ),
            }
          : {}),
      },
      order: { work_date: 'ASC' },
    });
  }

  @Post('credits')
  @PermissionsAny('leave_requests:create', 'leave_requests:approve')
  @ApiOperation({
    summary: 'Request comp-off for an approved overtime request',
  })
  async earn(@Req() req: Req, @Body() dto: EarnCompOffDto) {
    const employeeId = dto.employee_id ?? req.user.employeeId;
    if (!employeeId) throw new BadRequestException('employee_id is required.');
    if (employeeId !== req.user.employeeId) {
      if (!hasPermission(req.user.permissions, 'leave_requests:approve'))
        throw new ForbiddenException(
          'You can request compensatory off only for yourself.',
        );
      await this.assertEmployee(req.user, employeeId);
    }
    const result = await this.compOff.earn(
      req.user.companyId!,
      {
        employeeId,
        leaveTypeId: dto.leave_type_id,
        sourceType: 'OVERTIME_REQUEST',
        sourceReference: String(dto.overtime_request_id),
      },
      req.user,
    );
    if (result.created)
      await this.audit.log({
        company_id: req.user.companyId!,
        action: 'leave_comp_off.requested',
        entity_name: 'leave_comp_off_credit',
        entity_id: result.credit.id,
        actor: req.user,
        payload: {
          days: result.credit.days,
          source: result.credit.source_reference,
        },
      });
    if (result.created)
      this.notifyCredit(
        req.user.companyId!,
        result.credit,
        result.credit.status === 'credited' ? 'credited' : 'requested',
        req.user.companyMembershipId ?? null,
      );
    return result;
  }

  @Post('credits/:id/decision')
  @Permissions('leave_requests:approve')
  async decide(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideCompOffDto,
  ) {
    const credit = await this.findCredit(req.user.companyId!, id);
    await this.assertEmployee(req.user, credit.employee_id);
    if (!dto.approve && !dto.reason?.trim())
      throw new BadRequestException('A rejection reason is required.');
    if (
      dto.cap_override_reason?.trim() &&
      !hasPermission(req.user.permissions, 'leave_balances:override_cap')
    )
      throw new ForbiddenException(
        'Crediting above the maximum accumulation needs the leave_balances:override_cap permission.',
      );
    const saved = await this.compOff.decide(
      req.user.companyId!,
      id,
      dto.approve,
      req.user,
      dto.reason,
      dto.cap_override_reason,
    );
    await this.audit.log({
      company_id: req.user.companyId!,
      action: dto.approve
        ? 'leave_comp_off.approved'
        : 'leave_comp_off.rejected',
      entity_name: 'leave_comp_off_credit',
      entity_id: id,
      actor: req.user,
      payload: {
        reason: dto.reason ?? null,
        days: saved.days,
        cap_override_reason: dto.cap_override_reason?.trim() || null,
      },
    });
    if (saved.status === 'credited') {
      this.notifyCredit(
        req.user.companyId!,
        saved,
        'approved',
        req.user.companyMembershipId ?? null,
      );
      this.notifyCredit(
        req.user.companyId!,
        saved,
        'credited',
        req.user.companyMembershipId ?? null,
      );
    } else if (saved.status === 'rejected') {
      this.notifyCredit(
        req.user.companyId!,
        saved,
        'rejected',
        req.user.companyMembershipId ?? null,
      );
    }
    return saved;
  }

  @Post('credits/:id/reverse')
  @PermissionsAny('leave_balances:manage', 'leave_balances:adjust-manually')
  async reverse(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseCompOffDto,
  ) {
    const credit = await this.findCredit(req.user.companyId!, id);
    await this.assertEmployee(req.user, credit.employee_id);
    const saved = await this.compOff.reverse(
      req.user.companyId!,
      id,
      req.user,
      dto.reason,
    );
    await this.audit.log({
      company_id: req.user.companyId!,
      action: 'leave_comp_off.reversed',
      entity_name: 'leave_comp_off_credit',
      entity_id: id,
      actor: req.user,
      payload: { reason: dto.reason, days: saved.days },
    });
    return saved;
  }

  @Get('credits/:id/history')
  @PermissionsAny('leave_requests:read', 'leave_requests:approve')
  async history(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    const credit = await this.findCredit(req.user.companyId!, id);
    await this.assertEmployee(req.user, credit.employee_id);
    const ledger = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id, transaction_type, amount_days, effective_date::text, reason, created_at
         FROM leave_balance_transactions WHERE company_id=$1 AND id = ANY($2) ORDER BY id`,
      [
        req.user.companyId,
        [credit.credit_transaction_id, credit.closing_transaction_id].filter(
          Boolean,
        ),
      ],
    );
    const audit = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT action, payload, created_at FROM leave_audit_logs
        WHERE company_id=$1 AND entity_name='leave_comp_off_credit' AND entity_id=$2 ORDER BY id`,
      [req.user.companyId, id],
    );
    return { credit, ledger, audit };
  }

  @Get('utilization')
  @PermissionsAny('leave_balances:list', 'leave_balances:manage')
  async utilization(@Req() req: Req, @Query('leave_year') year?: string) {
    const rows: Array<{ employee_id: number }> = await this.compOff.utilization(
      req.user.companyId!,
      year ?? String(new Date().getUTCFullYear()),
    );
    const allowed = await this.hrAccess.getAccessibleEmployeeIds(req.user);
    return allowed
      ? rows.filter((r) => allowed.includes(Number(r.employee_id)))
      : rows;
  }

  // ------------------------------------------------------------- policy

  @Get('policies')
  @PermissionsAny('leave_policies:read', 'leave_requests:read')
  policies(@Req() req: Req) {
    return this.dataSource.getRepository(LeaveCompOffPolicy).find({
      where: { company_id: req.user.companyId! },
      order: { leave_type_id: 'ASC' },
    });
  }

  /** Saves a draft. Any change to an approved policy returns it to draft. */
  @Put('policies')
  @Permissions('leave_policies:update')
  async savePolicy(@Req() req: Req, @Body() dto: CompOffPolicyDto) {
    const repo = this.dataSource.getRepository(LeaveCompOffPolicy);
    const companyId = req.user.companyId!;
    const [type] = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT id FROM leave_types WHERE id=$1 AND company_id=$2`,
      [dto.leave_type_id, companyId],
    );
    if (!type) throw new NotFoundException('Leave type not found');
    const existing = await repo.findOne({
      where: { company_id: companyId, leave_type_id: dto.leave_type_id },
    });
    const saved = await repo.save(
      repo.create({
        ...(existing ?? {}),
        company_id: companyId,
        leave_type_id: dto.leave_type_id,
        status: 'draft',
        hours_per_day: dto.hours_per_day.toFixed(2),
        minimum_hours: dto.minimum_hours?.toFixed(2) ?? null,
        max_days_per_credit: dto.max_days_per_credit?.toFixed(2) ?? null,
        expiry_days: dto.expiry_days ?? null,
        requires_approval: dto.requires_approval,
        eligible_employment_types: dto.eligible_employment_types ?? null,
        allowed_sources: ['OVERTIME_REQUEST'],
        notes: dto.notes ?? null,
        approved_at: null,
        approved_by_company_user_id: null,
      }),
    );
    await this.audit.log({
      company_id: companyId,
      action: 'leave_comp_off.policy_saved',
      entity_name: 'leave_comp_off_policy',
      entity_id: saved.id,
      actor: req.user,
      payload: { ...dto },
    });
    return saved;
  }

  /** HR approval (four-eyes: the approver must not be the last editor). */
  @Post('policies/:id/approve')
  @Permissions('leave_policies:approve')
  async approvePolicy(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    const repo = this.dataSource.getRepository(LeaveCompOffPolicy);
    const policy = await repo.findOne({
      where: { id, company_id: req.user.companyId! },
    });
    if (!policy) throw new NotFoundException('Comp-off policy not found');
    const [lastEdit] = await this.dataSource.query<
      Array<{ actor_company_user_id: number | null }>
    >(
      `SELECT actor_company_user_id FROM leave_audit_logs
        WHERE company_id=$1 AND entity_name='leave_comp_off_policy' AND entity_id=$2 AND action='leave_comp_off.policy_saved'
        ORDER BY id DESC LIMIT 1`,
      [req.user.companyId, id],
    );
    if (
      lastEdit?.actor_company_user_id &&
      lastEdit.actor_company_user_id === req.user.companyMembershipId
    )
      throw new ForbiddenException(
        'Another HR user must approve the policy you edited.',
      );
    policy.status = 'approved';
    policy.approved_at = new Date();
    policy.approved_by_company_user_id = req.user.companyMembershipId ?? null;
    const saved = await repo.save(policy);
    await this.audit.log({
      company_id: req.user.companyId!,
      action: 'leave_comp_off.policy_approved',
      entity_name: 'leave_comp_off_policy',
      entity_id: id,
      actor: req.user,
      payload: {},
    });
    return saved;
  }

  private async findCredit(companyId: number, id: number) {
    const credit = await this.dataSource
      .getRepository(LeaveCompOffCredit)
      .findOne({ where: { id, company_id: companyId } });
    if (!credit)
      throw new NotFoundException('Compensatory-off credit not found');
    return credit;
  }
}
