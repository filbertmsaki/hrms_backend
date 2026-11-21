import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { getRequestAuditContext } from '../../../../common/request-context/request-context';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  PayrollAttendanceDeductionPolicy,
  PayrollAttendanceDeductionPolicyStatusEnum,
} from '../entities/payroll-attendance-deduction-policy.entities';
import { PayrollAuditLog } from '../entities/payroll-run.entities';
import {
  AttendanceDeductionRules,
  validateAttendanceDeductionRules,
} from './payroll-attendance-deductions.util';

export type SaveAttendanceDeductionPolicyInput = {
  name: string;
  effective_from: string;
  effective_to?: string | null;
  rules: AttendanceDeductionRules;
};

@Injectable()
export class PayrollAttendanceDeductionPolicyService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollAttendanceDeductionPolicy)
    private readonly repository: Repository<PayrollAttendanceDeductionPolicy>,
    @InjectRepository(PayrollAuditLog)
    private readonly auditRepository: Repository<PayrollAuditLog>,
  ) {}

  list(actor: AuthenticatedUser) {
    return this.repository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { effectiveFrom: 'DESC', id: 'DESC' },
    });
  }

  /** New policies are always DRAFT: configured, never applied to pay. */
  async create(
    actor: AuthenticatedUser,
    dto: SaveAttendanceDeductionPolicyInput,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!dto.name?.trim()) throw new BadRequestException('A name is required.');
    if (!dto.effective_from) {
      throw new BadRequestException('An effective-from date is required.');
    }
    if (dto.effective_to && dto.effective_to < dto.effective_from) {
      throw new BadRequestException(
        'effective_to cannot be before effective_from.',
      );
    }
    const problems = validateAttendanceDeductionRules(
      dto.rules ?? ({} as never),
    );
    if (problems.length) throw new BadRequestException(problems.join(' '));
    const saved = await this.repository.save(
      this.repository.create({
        companyId,
        name: dto.name.trim(),
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        rules: dto.rules,
        status: PayrollAttendanceDeductionPolicyStatusEnum.DRAFT,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.audit(
      actor,
      companyId,
      'payroll.attendance_deduction_policy.created',
      saved,
    );
    return saved;
  }

  /**
   * Activation applies the policy to pay. It needs an approver other than the
   * author and the reference of the completed HR/legal compliance review.
   * Overlapping active policies are not allowed.
   */
  async activate(
    actor: AuthenticatedUser,
    id: number,
    dto: { legal_review_reference: string },
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const actorId = actor.companyMembershipId ?? actor.id;
    const policy = await this.find(companyId, id);
    if (policy.status !== PayrollAttendanceDeductionPolicyStatusEnum.DRAFT) {
      throw new ConflictException('Only draft policies can be activated.');
    }
    if (policy.createdByCompanyUserId === actorId) {
      throw new ForbiddenException(
        'Activation needs an approver other than the policy author.',
      );
    }
    const reference = dto.legal_review_reference?.trim();
    if (!reference) {
      throw new BadRequestException(
        'Record the HR and legal compliance review reference before activating monetary deductions.',
      );
    }
    const overlapping = await this.repository
      .createQueryBuilder('policy')
      .where('policy.companyId = :companyId', { companyId })
      .andWhere('policy.status = :status', {
        status: PayrollAttendanceDeductionPolicyStatusEnum.ACTIVE,
      })
      .andWhere('policy.effectiveFrom <= :end', {
        end: policy.effectiveTo ?? '9999-12-31',
      })
      .andWhere(
        '(policy.effectiveTo IS NULL OR policy.effectiveTo >= :start)',
        {
          start: policy.effectiveFrom,
        },
      )
      .getCount();
    if (overlapping > 0) {
      throw new ConflictException(
        'Another active policy covers these dates. Retire it first.',
      );
    }
    policy.status = PayrollAttendanceDeductionPolicyStatusEnum.ACTIVE;
    policy.legalReviewReference = reference;
    policy.approvedByCompanyUserId = actorId;
    policy.approvedAt = new Date();
    const saved = await this.repository.save(policy);
    await this.audit(
      actor,
      companyId,
      'payroll.attendance_deduction_policy.activated',
      saved,
    );
    return saved;
  }

  async retire(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const policy = await this.find(companyId, id);
    if (policy.status === PayrollAttendanceDeductionPolicyStatusEnum.RETIRED) {
      return policy;
    }
    policy.status = PayrollAttendanceDeductionPolicyStatusEnum.RETIRED;
    const saved = await this.repository.save(policy);
    await this.audit(
      actor,
      companyId,
      'payroll.attendance_deduction_policy.retired',
      saved,
    );
    return saved;
  }

  /** The ACTIVE policy covering the period end, if any. */
  async activeFor(companyId: number, periodStart: string, periodEnd: string) {
    return this.repository
      .createQueryBuilder('policy')
      .where('policy.companyId = :companyId', { companyId })
      .andWhere('policy.status = :status', {
        status: PayrollAttendanceDeductionPolicyStatusEnum.ACTIVE,
      })
      .andWhere('policy.effectiveFrom <= :periodEnd', { periodEnd })
      .andWhere(
        '(policy.effectiveTo IS NULL OR policy.effectiveTo >= :periodStart)',
        {
          periodStart,
        },
      )
      .orderBy('policy.effectiveFrom', 'DESC')
      .getOne();
  }

  private async find(companyId: number, id: number) {
    const policy = await this.repository.findOne({ where: { id, companyId } });
    if (!policy)
      throw new NotFoundException('Attendance deduction policy not found.');
    return policy;
  }

  private async audit(
    actor: AuthenticatedUser,
    companyId: number,
    action: string,
    policy: PayrollAttendanceDeductionPolicy,
  ) {
    await this.auditRepository.save(
      this.auditRepository.create({
        companyId,
        actorCompanyUserId: actor.companyMembershipId ?? null,
        action,
        entityType: 'PAYROLL_ATTENDANCE_DEDUCTION_POLICY',
        entityId: String(policy.id),
        summary: {
          status: policy.status,
          legal_review_reference: policy.legalReviewReference,
        },
        beforeValues: null,
        afterValues: { status: policy.status, rules: policy.rules },
        ipAddress: getRequestAuditContext().ipAddress?.slice(0, 64) ?? null,
      }),
    );
  }
}
