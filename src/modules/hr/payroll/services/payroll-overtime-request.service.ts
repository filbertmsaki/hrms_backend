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
