import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { HrAccessService } from '../shared/hr-access.service';
import { ContractSignatory } from './entities/contract-signatory.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

@Injectable()
export class ContractSignatoriesService {
  constructor(
    @InjectRepository(ContractSignatory)
    private readonly signatories: Repository<ContractSignatory>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(EmploymentContract)
    private readonly contracts: Repository<EmploymentContract>,
    private readonly access: HrAccessService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async list(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const rows = await this.signatories.find({
      where: { companyId },
      order: { isActive: 'DESC', displayName: 'ASC' },
    });
    const pending = rows.length
      ? await this.contracts
          .createQueryBuilder('c')
          .select('c.assignedSignatoryId', 'id')
          .addSelect('COUNT(*)', 'count')
          .where('c.companyId = :companyId', { companyId })
          .andWhere('c.status = :status', {
            status: EmploymentContractStatus.PENDING_HR_SIGNATURE,
          })
          .andWhere('c.assignedSignatoryId IN (:...ids)', {
            ids: rows.map((row) => row.id),
          })
          .groupBy('c.assignedSignatoryId')
          .getRawMany<{ id: number; count: string }>()
      : [];
    const employees = rows.length
      ? await this.employees.findBy({
          id: In(rows.map((row) => row.employeeId)),
          company_id: companyId,
        })
      : [];
    return rows.map((row) => {
      const employee = employees.find((item) => item.id === row.employeeId);
      return {
        ...row,
        employeeName: employee
          ? `${employee.first_name} ${employee.last_name}`.trim()
          : null,
        employeeNo: employee?.employee_no ?? null,
        pendingCount: Number(
          pending.find((item) => Number(item.id) === row.id)?.count ?? 0,
        ),
      };
    });
  }

  async create(
    actor: AuthenticatedUser,
    input: {
      employee_id: number;
      display_name?: string;
      job_title?: string;
      scope_note?: string;
    },
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: input.employee_id, company_id: companyId },
      relations: { primary_position: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!employee.company_user_id)
      throw new BadRequestException(
        'A signatory must be an employee with a login account',
      );
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE)
      throw new BadRequestException('A signatory must be an active employee');
    const existing = await this.signatories.findOneBy({
      companyId,
      employeeId: employee.id,
    });
    if (existing)
      throw new ConflictException(
        existing.isActive
          ? 'This employee is already an authorized signatory'
          : 'This employee was a signatory before; reactivate them instead',
      );
    const jobTitle =
      input.job_title?.trim() ||
      employee.primary_position?.name ||
      'Authorized signatory';
    const saved = await this.signatories.save(
      this.signatories.create({
        companyId,
        employeeId: employee.id,
        displayName:
          input.display_name?.trim() ||
          `${employee.first_name} ${employee.last_name}`.trim(),
        jobTitle,
        scopeNote: input.scope_note?.trim() || null,
        isActive: true,
        designatedByCompanyUserId: actor.companyMembershipId!,
      }),
    );
    await this.audit(actor, companyId, saved.id, 'designate', {
      employee_id: employee.id,
    });
    return saved;
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    input: { display_name?: string; job_title?: string; scope_note?: string },
  ) {
    const signatory = await this.load(actor, id);
    const before = {
      display_name: signatory.displayName,
      job_title: signatory.jobTitle,
      scope_note: signatory.scopeNote,
    };
    if (input.display_name?.trim())
      signatory.displayName = input.display_name.trim();
    if (input.job_title?.trim()) signatory.jobTitle = input.job_title.trim();
    if (input.scope_note !== undefined)
      signatory.scopeNote = input.scope_note?.trim() || null;
    const saved = await this.signatories.save(signatory);
    await this.audit(actor, signatory.companyId, id, 'update', {
      before,
      after: {
        display_name: saved.displayName,
        job_title: saved.jobTitle,
        scope_note: saved.scopeNote,
      },
    });
    return saved;
  }

  async revoke(actor: AuthenticatedUser, id: number, reason: string) {
    const signatory = await this.load(actor, id);
    if (!signatory.isActive) return signatory;
    signatory.isActive = false;
    signatory.revokedAt = new Date();
    signatory.revokedByCompanyUserId = actor.companyMembershipId ?? null;
    signatory.revokeReason = reason.trim();
    const saved = await this.signatories.save(signatory);
    await this.audit(actor, signatory.companyId, id, 'revoke', { reason });
    return saved;
  }

  async reactivate(actor: AuthenticatedUser, id: number) {
    const signatory = await this.load(actor, id);
    signatory.isActive = true;
    signatory.revokedAt = null;
    signatory.revokedByCompanyUserId = null;
    signatory.revokeReason = null;
    const saved = await this.signatories.save(signatory);
    await this.audit(actor, signatory.companyId, id, 'reactivate', {});
    return saved;
  }

  /** "Am I a signatory?" plus my pending contracts (any signed-in user). */
  async mine(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!actor.employeeId) return { signatory: null, pending: 0 };
    const signatory = await this.signatories.findOneBy({
      companyId,
      employeeId: actor.employeeId,
      isActive: true,
    });
    if (!signatory) return { signatory: null, pending: 0 };
    const pending = await this.contracts.count({
      where: {
        companyId,
        assignedSignatoryId: signatory.id,
        status: EmploymentContractStatus.PENDING_HR_SIGNATURE,
      },
    });
    return { signatory, pending };
  }

  private async load(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const signatory = await this.signatories.findOneBy({ id, companyId });
    if (!signatory) throw new NotFoundException('Signatory not found');
    return signatory;
  }

  private async audit(
    actor: AuthenticatedUser,
    companyId: number,
    id: number,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      resourceType: 'contract_signatory',
      resourceId: id,
      metadata: { action, ...metadata },
      context: resolveAuditContext(),
    });
  }
}
