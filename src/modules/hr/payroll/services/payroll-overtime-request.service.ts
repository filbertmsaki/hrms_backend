import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { requiresOvertimeApproval } from '../../attendance/processing/overtime-reconciliation.util';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  CreatePayrollOvertimeRequestDto,
  DecidePayrollOvertimeRequestDto,
} from '../dto/payroll-overtime-request.dto';
import {
  PayrollOvertimeRequest,
  PayrollOvertimeRequestStatus,
} from '../entities/payroll-overtime-request.entity';
import { PayrollAuditService } from './payroll-core.services';
import {
  PayrollOvertimePolicy,
  PayrollPeriod,
} from '../entities/payroll-configuration.entities';
import { PayrollPeriodStatusEnum } from '../payroll.enums';

const HR_ROLES = new Set(['HR_MANAGER', 'HR_OFFICER', 'COMPANY_ADMIN']);

@Injectable()
export class PayrollOvertimeRequestService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(PayrollOvertimeRequest)
    private readonly requestRepository: Repository<PayrollOvertimeRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(PayrollPeriod)
    private readonly payrollPeriodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollOvertimePolicy)
    private readonly overtimePolicyRepository: Repository<PayrollOvertimePolicy>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreatePayrollOvertimeRequestDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      throw new ForbiddenException('An employee account is required.');
    }
    const employee = await this.employeeRepository.findOne({
      where: { id: actor.employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (!employee.reports_to || employee.reports_to === employee.id) {
      throw new BadRequestException(
        'A line manager must be assigned before requesting overtime.',
      );
    }
    const manager = await this.employeeRepository.findOne({
      where: { id: employee.reports_to, company_id: companyId },
    });
    if (!manager?.company_user_id) {
      throw new BadRequestException(
        'The line manager needs an active user account.',
      );
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required.');
    const workDate = dto.work_date.slice(0, 10);
    const summary = await this.attendanceRepository.findOne({
      where: { companyId, employeeId: employee.id, attendanceDate: workDate },
    });
    const actualMinutes = Math.max(0, Number(summary?.overtimeMinutes ?? 0));
    if (!summary || actualMinutes <= 0) {
      throw new BadRequestException(
        'Overtime can only be requested for a date with calculated overtime.',
      );
    }
    if (!(await this.isApprovalRequired(companyId, workDate, summary))) {
      throw new BadRequestException(
        'Approval is not required for this overtime under the effective attendance policy.',
      );
    }
    if (dto.requested_minutes > actualMinutes) {
      throw new BadRequestException({
        message: 'Requested overtime cannot exceed calculated overtime.',
        calculated_minutes: actualMinutes,
        requested_minutes: dto.requested_minutes,
      });
    }
    const period = await this.payrollPeriodRepository
      .createQueryBuilder('period')
      .where('period.companyId = :companyId', { companyId })
      .andWhere(':workDate BETWEEN period.startDate AND period.endDate', {
        workDate,
      })
      .andWhere('period.status IN (:...statuses)', {
        statuses: [
          PayrollPeriodStatusEnum.INPUT_CLOSED,
          PayrollPeriodStatusEnum.PROCESSING,
          PayrollPeriodStatusEnum.REVIEW,
          PayrollPeriodStatusEnum.APPROVED,
          PayrollPeriodStatusEnum.LOCKED,
          PayrollPeriodStatusEnum.PAID,
          PayrollPeriodStatusEnum.CLOSED,
        ],
      })
      .getOne();
    if (period) {
      throw new ConflictException(
        'Overtime requests cannot be changed after payroll input has closed for this date.',
      );
    }
    const existing = await this.requestRepository.findOne({
      where: {
        companyId,
        employeeId: employee.id,
        workDate,
        status: In(['PENDING_MANAGER', 'PENDING_HR', 'APPROVED']),
      },
    });
    if (existing) {
      throw new ConflictException(
        'An active overtime request already exists for this date.',
      );
    }
    let request: PayrollOvertimeRequest;
    try {
      request = await this.requestRepository.save(
        this.requestRepository.create({
          companyId,
          employeeId: employee.id,
          managerEmployeeId: manager.id,
          workDate,
          requestedMinutes: dto.requested_minutes,
          reason,
          status: 'PENDING_MANAGER',
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'An active overtime request already exists for this date.',
        );
      }
      throw error;
    }
    await this.auditService.log({
      actor,
      action: 'payroll.overtime.requested',
      entityType: 'PAYROLL_OVERTIME_REQUEST',
      entityId: request.id,
      summary: {
        employee_id: employee.id,
        work_date: workDate,
        requested_minutes: dto.requested_minutes,
      },
    });
    return request;
  }

  async listMine(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId)
      throw new ForbiddenException('An employee account is required.');
    const rows = await this.requestRepository.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return this.decorate(companyId, rows);
  }

  async listManager(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) return [];
    const rows = await this.requestRepository.find({
      where: {
        companyId,
        managerEmployeeId: actor.employeeId,
        status: 'PENDING_MANAGER',
      },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return this.decorate(companyId, rows);
  }

  async listHr(actor: AuthenticatedUser) {
    this.ensureHrActor(actor);
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const rows = await this.requestRepository.find({
      where: { companyId, status: 'PENDING_HR' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return this.decorate(companyId, rows);
  }

  async listPayroll(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const rows = await this.requestRepository.find({
      where: { companyId, status: 'APPROVED' },
      order: { workDate: 'DESC' },
      take: 100,
    });
    return this.decorate(companyId, rows);
  }

  async decideManager(
    actor: AuthenticatedUser,
    id: number,
    approve: boolean,
    dto: DecidePayrollOvertimeRequestDto,
  ) {
    if (!approve && !dto.comments?.trim()) {
      throw new BadRequestException('A reason is required to reject overtime.');
    }
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequest(companyId, id);
    if (
      !actor.employeeId ||
      actor.employeeId !== request.managerEmployeeId ||
      actor.employeeId === request.employeeId
    ) {
      throw new ForbiddenException(
        'Only the assigned line manager can review this request.',
      );
    }
    return this.transition(
      actor,
      request,
      'PENDING_MANAGER',
      approve ? 'PENDING_HR' : 'REJECTED',
      {
        managerComments: dto.comments?.trim() || null,
        managerDecidedByCompanyUserId: actor.companyMembershipId ?? null,
        managerDecidedAt: new Date(),
      },
    );
  }

  async decideHr(
    actor: AuthenticatedUser,
    id: number,
    approve: boolean,
    dto: DecidePayrollOvertimeRequestDto,
  ) {
    if (!approve && !dto.comments?.trim()) {
      throw new BadRequestException('A reason is required to reject overtime.');
    }
    this.ensureHrActor(actor);
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequest(companyId, id);
    if (
      actor.employeeId === request.employeeId ||
      (actor.companyMembershipId &&
        actor.companyMembershipId === request.managerDecidedByCompanyUserId)
    ) {
      throw new ForbiddenException(
        'The requester and line manager cannot perform the HR review.',
      );
    }
    return this.transition(
      actor,
      request,
      'PENDING_HR',
      approve ? 'APPROVED' : 'REJECTED',
      {
        hrComments: dto.comments?.trim() || null,
        hrDecidedByCompanyUserId: actor.companyMembershipId ?? null,
        hrDecidedAt: new Date(),
      },
    );
  }

  private async findRequest(companyId: number, id: number) {
    const request = await this.requestRepository.findOne({
      where: { companyId, id },
    });
    if (!request) throw new NotFoundException('Overtime request not found.');
    return request;
  }

  private async isApprovalRequired(
    companyId: number,
    workDate: string,
    summary: AttendanceDailySummary,
  ) {
    const payrollPolicy = await this.overtimePolicyRepository
      .createQueryBuilder('policy')
      .where('policy.companyId = :companyId', { companyId })
      .andWhere('policy.status = :status', { status: 'ACTIVE' })
      .andWhere('policy.effectiveFrom <= :workDate', { workDate })
      .andWhere(
        '(policy.effectiveTo IS NULL OR policy.effectiveTo >= :workDate)',
        {
          workDate,
        },
      )
      .orderBy('policy.effectiveFrom', 'DESC')
      .addOrderBy('policy.id', 'DESC')
      .getOne();
    return requiresOvertimeApproval(
      summary.flags?.overtimeRequiresApproval,
      payrollPolicy?.approvalRequired,
    );
  }

  private ensureHrActor(actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => HR_ROLES.has(role.toUpperCase()))) {
      throw new ForbiddenException(
        'An HR role is required to review overtime.',
      );
    }
  }

  private async transition(
    actor: AuthenticatedUser,
    request: PayrollOvertimeRequest,
    expected: PayrollOvertimeRequestStatus,
    next: PayrollOvertimeRequestStatus,
    fields: Partial<PayrollOvertimeRequest>,
  ) {
    if (next === 'APPROVED') {
      const currentSummary = await this.attendanceRepository.findOne({
        where: {
          companyId: request.companyId,
          employeeId: request.employeeId,
          attendanceDate: request.workDate,
        },
      });
      const currentCalculatedMinutes = Math.max(
        0,
        Number(currentSummary?.overtimeMinutes ?? 0),
      );
      if (
        !currentSummary ||
        currentCalculatedMinutes < request.requestedMinutes
      ) {
        throw new ConflictException(
          'Calculated overtime changed after this request was submitted. Recalculate attendance and submit a request for the current payable amount.',
        );
      }
      if (
        !(await this.isApprovalRequired(
          request.companyId,
          request.workDate,
          currentSummary,
        ))
      ) {
        throw new ConflictException(
          'The effective attendance policy no longer requires approval for this overtime request.',
        );
      }
      const closedPeriod = await this.payrollPeriodRepository
        .createQueryBuilder('period')
        .where('period.companyId = :companyId', {
          companyId: request.companyId,
        })
        .andWhere(':workDate BETWEEN period.startDate AND period.endDate', {
          workDate: request.workDate,
        })
        .andWhere('period.status IN (:...statuses)', {
          statuses: [
            PayrollPeriodStatusEnum.INPUT_CLOSED,
            PayrollPeriodStatusEnum.PROCESSING,
            PayrollPeriodStatusEnum.REVIEW,
            PayrollPeriodStatusEnum.APPROVED,
            PayrollPeriodStatusEnum.LOCKED,
            PayrollPeriodStatusEnum.PAID,
            PayrollPeriodStatusEnum.CLOSED,
          ],
        })
        .getOne();
      if (closedPeriod) {
        throw new ConflictException(
          'Overtime cannot be approved after payroll input has closed for this date.',
        );
      }
    }
    const result = await this.requestRepository.update(
      { id: request.id, companyId: request.companyId, status: expected },
      { ...fields, status: next },
    );
    if (!result.affected) {
      throw new ConflictException(
        'This request has already moved to another stage.',
      );
    }
    await this.auditService.log({
      actor,
      action: `payroll.overtime.${next === 'REJECTED' ? 'rejected' : next === 'APPROVED' ? 'approved' : 'manager_approved'}`,
      entityType: 'PAYROLL_OVERTIME_REQUEST',
      entityId: request.id,
      summary: {
        employee_id: request.employeeId,
        work_date: request.workDate,
        requested_minutes: request.requestedMinutes,
      },
    });
    return this.findRequest(request.companyId, request.id);
  }

  private async decorate(companyId: number, rows: PayrollOvertimeRequest[]) {
    if (!rows.length) return [];
    const employees = await this.employeeRepository.find({
      where: {
        company_id: companyId,
        id: In([...new Set(rows.map((row) => row.employeeId))]),
      },
    });
    const names = new Map(
      employees.map((employee) => [
        employee.id,
        [employee.first_name, employee.last_name].filter(Boolean).join(' '),
      ]),
    );
    const dates = [...new Set(rows.map((row) => row.workDate))];
    const summaries = await this.attendanceRepository.find({
      where: {
        companyId,
        employeeId: In([...names.keys()]),
        attendanceDate: In(dates),
      },
    });
    const actual = new Map(
      summaries.map((summary) => [
        `${summary.employeeId}:${summary.attendanceDate}`,
        summary.overtimeMinutes,
      ]),
    );
    return rows.map((row) => ({
      ...row,
      employee_name: names.get(row.employeeId) ?? `Employee #${row.employeeId}`,
      actual_minutes: actual.get(`${row.employeeId}:${row.workDate}`) ?? 0,
    }));
  }
}
