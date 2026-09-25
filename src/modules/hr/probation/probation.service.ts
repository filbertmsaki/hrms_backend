import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { EmployeeConfirmationStatusEnum } from '../employees/enums/employee-confirmation-status.enum';
import { HrAccessService } from '../shared/hr-access.service';
import {
  ActionItemsService,
  UpsertActionItemInput,
} from '../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import { addDaysToDateOnly, formatDateOnly } from '../shared/hr.utils';
import { ProbationPolicy } from './entities/probation-policy.entity';
import { ProbationNumberSequence } from './entities/probation-number-sequence.entity';
import { ProbationCase } from './entities/probation-case.entity';
import { ProbationReviewCycle } from './entities/probation-review-cycle.entity';
import { ProbationReviewRating } from './entities/probation-review-rating.entity';
import { ProbationObjective } from './entities/probation-objective.entity';
import { ProbationExtension } from './entities/probation-extension.entity';
import {
  OPEN_PROBATION_CASE_STATUSES,
  ProbationCaseStatusEnum,
} from './enums/probation-case-status.enum';
import { ProbationReviewCycleStatusEnum } from './enums/probation-review-cycle-status.enum';
import { ProbationManagerRecommendationEnum } from './enums/probation-manager-recommendation.enum';
import { ProbationFinalDecisionEnum } from './enums/probation-final-decision.enum';
import { ProbationObjectiveStatusEnum } from './enums/probation-objective-status.enum';
import { ProbationPolicyResolverService } from './services/probation-policy-resolver.service';
import { ProbationAuditService } from './services/probation-audit.service';
import { ProbationLetterService } from './services/probation-letter.service';
import { ProbationLetterTypeEnum } from './enums/probation-letter-type.enum';
import { ProbationAuditActionEnum } from './enums/probation-audit-action.enum';
import { CreateProbationCaseDto } from './dtos/create-probation-case.dto';
import { UpdateProbationCaseDto } from './dtos/update-probation-case.dto';
import { CreateProbationObjectiveDto } from './dtos/create-probation-objective.dto';
import { SubmitProbationSelfAssessmentDto } from './dtos/submit-probation-self-assessment.dto';
import { SubmitProbationManagerReviewDto } from './dtos/submit-probation-manager-review.dto';
import { SubmitProbationHrDecisionDto } from './dtos/submit-probation-hr-decision.dto';
import { OffboardingService } from '../offboarding/offboarding.service';
import { OffboardingTypeEnum } from '../offboarding/enums/offboarding-type.enum';
import { CreateOffboardingRequestDto } from '../offboarding/dtos/create-offboarding-request.dto';

const PROBATION_EXCLUDED_EMPLOYMENT_TYPES: EmploymentTypeEnum[] = [];
const DEFAULT_MAX_TOTAL_PROBATION_DAYS = 365;

@Injectable()
export class ProbationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly policyResolver: ProbationPolicyResolverService,
    private readonly hrAccessService: HrAccessService,
    private readonly actionItemsService: ActionItemsService,
    private readonly auditService: ProbationAuditService,
    private readonly letterService: ProbationLetterService,
    private readonly offboardingService: OffboardingService,
    private readonly employmentHistoryService: EmploymentHistoryService,
    @InjectRepository(ProbationCase)
    private readonly caseRepository: Repository<ProbationCase>,
    @InjectRepository(ProbationPolicy)
    private readonly policyRepository: Repository<ProbationPolicy>,
  ) {}

  // ---------------------------------------------------------------------
  // Policy management
  // ---------------------------------------------------------------------

  async createPolicy(
    companyId: number,
    dto: {
      code: string;
      name: string;
      description?: string;
      employment_type?: EmploymentTypeEnum;
      branch_id?: number;
      department_id?: number;
      position_id?: number;
      grade_id?: number;
      probation_period_days: number;
      self_assessment_required?: boolean;
      objectives_required?: boolean;
      minimum_confirmation_score?: number;
      maximum_extensions?: number;
      default_extension_days?: number;
      maximum_extension_days?: number;
      manager_review_required?: boolean;
      hr_approval_required?: boolean;
      confirmation_letter_required?: boolean;
      priority?: number;
      effective_from: string;
      effective_to?: string;
      is_default?: boolean;
      criteria?: Array<{
        code: string;
        name: string;
        description?: string;
        weight: number;
        maximum_rating?: number;
        self_rating_enabled?: boolean;
        is_required?: boolean;
      }>;
    },
    actor: AuthenticatedUser,
  ): Promise<ProbationPolicy> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    if (dto.criteria && dto.criteria.length > 0) {
      this.validateCriterionWeight(dto.criteria);
    }

    const policy = this.policyRepository.create({
      companyId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      employmentType: dto.employment_type ?? null,
      branchId: dto.branch_id ?? null,
      departmentId: dto.department_id ?? null,
      positionId: dto.position_id ?? null,
      gradeId: dto.grade_id ?? null,
      probationPeriodDays: dto.probation_period_days,
      selfAssessmentRequired: dto.self_assessment_required ?? false,
      objectivesRequired: dto.objectives_required ?? true,
      minimumConfirmationScore: String(dto.minimum_confirmation_score ?? 60),
      maximumExtensions: dto.maximum_extensions ?? 2,
      defaultExtensionDays: dto.default_extension_days ?? 90,
      maximumExtensionDays: dto.maximum_extension_days ?? 180,
      managerReviewRequired: dto.manager_review_required ?? true,
      hrApprovalRequired: dto.hr_approval_required ?? true,
      confirmationLetterRequired: dto.confirmation_letter_required ?? true,
      priority: dto.priority ?? 0,
      status: 'ACTIVE',
      effectiveFrom: dto.effective_from,
      effectiveTo: dto.effective_to ?? null,
      isDefault: dto.is_default ?? false,
      criteria: (dto.criteria ?? []).map((criterion, index) => ({
        code: criterion.code,
        name: criterion.name,
        description: criterion.description ?? null,
        weight: String(criterion.weight),
        maximumRating: String(criterion.maximum_rating ?? 5),
        selfRatingEnabled: criterion.self_rating_enabled ?? false,
        isRequired: criterion.is_required ?? true,
        sortOrder: index,
      })),
    });

    return this.policyRepository.save(policy);
  }

  async listPolicies(
    companyId: number,
    query: { status?: string },
  ): Promise<ProbationPolicy[]> {
    return this.policyRepository.find({
      where: {
        companyId,
        ...(query.status ? { status: query.status } : {}),
      },
      relations: { criteria: true },
      order: { priority: 'DESC', id: 'DESC' },
    });
  }

  async updatePolicy(
    companyId: number,
    id: number,
    dto: Partial<{
      name: string;
      description: string;
      status: string;
      employment_type: EmploymentTypeEnum;
      branch_id: number | null;
      department_id: number | null;
      position_id: number | null;
      grade_id: number | null;
      probation_period_days: number;
      self_assessment_required: boolean;
      objectives_required: boolean;
      minimum_confirmation_score: number;
      maximum_extensions: number;
      default_extension_days: number;
      maximum_extension_days: number;
      manager_review_required: boolean;
      hr_approval_required: boolean;
      confirmation_letter_required: boolean;
      priority: number;
      effective_to: string;
      is_default: boolean;
      criteria: Array<{
        code: string;
        name: string;
        description?: string;
        weight: number;
        maximum_rating?: number;
        self_rating_enabled?: boolean;
        is_required?: boolean;
      }>;
    }>,
    actor: AuthenticatedUser,
  ): Promise<ProbationPolicy> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const policy = await this.policyRepository.findOne({
      where: { id, companyId },
      relations: { criteria: true },
    });

    if (!policy) {
      throw new NotFoundException('Probation policy not found.');
    }

    if (dto.name !== undefined) policy.name = dto.name;
    if (dto.description !== undefined) policy.description = dto.description;
    if (dto.status !== undefined) policy.status = dto.status;
    if (dto.employment_type !== undefined)
      policy.employmentType = dto.employment_type;
    if (dto.branch_id !== undefined) policy.branchId = dto.branch_id;
    if (dto.department_id !== undefined)
      policy.departmentId = dto.department_id;
    if (dto.position_id !== undefined) policy.positionId = dto.position_id;
    if (dto.grade_id !== undefined) policy.gradeId = dto.grade_id;
    if (dto.probation_period_days !== undefined)
      policy.probationPeriodDays = dto.probation_period_days;
    if (dto.self_assessment_required !== undefined)
      policy.selfAssessmentRequired = dto.self_assessment_required;
    if (dto.objectives_required !== undefined)
      policy.objectivesRequired = dto.objectives_required;
    if (dto.minimum_confirmation_score !== undefined)
      policy.minimumConfirmationScore = String(dto.minimum_confirmation_score);
    if (dto.maximum_extensions !== undefined)
      policy.maximumExtensions = dto.maximum_extensions;
    if (dto.default_extension_days !== undefined)
      policy.defaultExtensionDays = dto.default_extension_days;
    if (dto.maximum_extension_days !== undefined)
      policy.maximumExtensionDays = dto.maximum_extension_days;
    if (dto.manager_review_required !== undefined)
      policy.managerReviewRequired = dto.manager_review_required;
    if (dto.hr_approval_required !== undefined)
      policy.hrApprovalRequired = dto.hr_approval_required;
    if (dto.confirmation_letter_required !== undefined)
      policy.confirmationLetterRequired = dto.confirmation_letter_required;
    if (dto.priority !== undefined) policy.priority = dto.priority;
    if (dto.effective_to !== undefined) policy.effectiveTo = dto.effective_to;
    if (dto.is_default !== undefined) policy.isDefault = dto.is_default;

    if (dto.criteria !== undefined) {
      if (dto.criteria.length > 0) {
        this.validateCriterionWeight(dto.criteria);
      }
      policy.criteria = dto.criteria.map((criterion, index) => ({
        ...(policy.criteria.find(
          (existing) => existing.code === criterion.code,
        ) ?? {}),
        policyId: policy.id,
        code: criterion.code,
        name: criterion.name,
        description: criterion.description ?? null,
        weight: String(criterion.weight),
        maximumRating: String(criterion.maximum_rating ?? 5),
        selfRatingEnabled: criterion.self_rating_enabled ?? false,
        isRequired: criterion.is_required ?? true,
        sortOrder: index,
      })) as ProbationPolicy['criteria'];
    }

    return this.policyRepository.save(policy);
  }

  async deletePolicy(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const policy = await this.policyRepository.findOne({
      where: { id, companyId },
    });

    if (!policy) {
      throw new NotFoundException('Probation policy not found.');
    }

    await this.policyRepository.remove(policy);
  }

  private validateCriterionWeight(criteria: Array<{ weight: number }>): void {
    const total = criteria.reduce((sum, c) => sum + c.weight, 0);

    if (Math.abs(total - 100) > 0.001) {
      throw new BadRequestException(
        `Probation criterion weights must total 100. Current total: ${total}.`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Case creation
  // ---------------------------------------------------------------------

  private isProbationApplicable(employee: Employee): boolean {
    return !PROBATION_EXCLUDED_EMPLOYMENT_TYPES.includes(
      employee.employment_type,
    );
  }

  async ensureCaseForEmployee(
    companyId: number,
    employee: Employee,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<ProbationCase | null> {
    const caseRepository = manager.getRepository(ProbationCase);

    const current = await caseRepository
      .createQueryBuilder('probationCase')
      .setLock('pessimistic_write')
      .where('probationCase.company_id = :companyId', { companyId })
      .andWhere('probationCase.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('probationCase.status IN (:...statuses)', {
        statuses: OPEN_PROBATION_CASE_STATUSES,
      })
      .getOne();

    if (current) {
      return current;
    }

    if (!this.isProbationApplicable(employee)) {
      await manager.getRepository(Employee).update(employee.id, {
        confirmation_status: EmployeeConfirmationStatusEnum.NOT_APPLICABLE,
        probation_start_date: null,
        probation_end_date: null,
      });

      return null;
    }

    const startDate = employee.hire_date ?? formatDateOnly(new Date());

    const policy = await this.policyResolver.resolve(
      companyId,
      employee,
      startDate,
    );

    return this.buildAndPersistCase(
      companyId,
      employee,
      policy,
      startDate,
      actor,
      manager,
      `Probation case created`,
    );
  }

  private async buildAndPersistCase(
    companyId: number,
    employee: Employee,
    policy: ProbationPolicy | null,
    startDate: string,
    actor: AuthenticatedUser,
    manager: EntityManager,
    auditDescription: string,
  ): Promise<ProbationCase> {
    const caseRepository = manager.getRepository(ProbationCase);

    const periodDays =
      policy?.probationPeriodDays ??
      this.configService.get<number>('PROBATION_DEFAULT_PERIOD_DAYS') ??
      180;

    const dueDate = addDaysToDateOnly(startDate, periodDays);
    this.assertWithinTotalProbationLimit(startDate, dueDate);
    const caseNo = await this.allocateCaseNo(companyId, manager);

    const objectivesRequired = policy?.objectivesRequired ?? true;
    const managerCompanyUserId = await this.resolveManagerCompanyUserId(
      companyId,
      employee.reports_to,
      manager,
    );

    const probationCase = await caseRepository.save(
      caseRepository.create({
        companyId,
        employeeId: employee.id,
        policyId: policy?.id ?? null,
        caseNo,
        status: objectivesRequired
          ? ProbationCaseStatusEnum.OBJECTIVES_PENDING
          : ProbationCaseStatusEnum.ACTIVE,
        originalStartDate: startDate,
        originalDueDate: dueDate,
        currentStartDate: startDate,
        currentDueDate: dueDate,
        currentCycleNumber: 1,
        extensionCount: 0,
        managerEmployeeId: employee.reports_to,
        managerCompanyUserId,
        policySnapshot: policy
          ? this.buildPolicySnapshot(policy)
          : { default: true, probation_period_days: periodDays },
        employeeSnapshot: this.buildEmployeeSnapshot(employee),
        finalDecision: null,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );

    const cycle = await this.createReviewCycle(probationCase, policy, manager);

    if (policy?.criteria?.length) {
      await this.createReviewRatings(cycle, policy.criteria, manager);
    }

    await manager.getRepository(Employee).update(employee.id, {
      probation_start_date: startDate,
      probation_end_date: dueDate,
      confirmation_due_date: dueDate,
      confirmation_date: null,
      confirmation_status: EmployeeConfirmationStatusEnum.PROBATION,
    });

    await this.auditService.log(
      {
        action: ProbationAuditActionEnum.CASE_CREATED,
        probationCaseId: probationCase.id,
        actor,
        description: `${auditDescription} (${probationCase.caseNo})`,
      },
      manager,
    );

    return probationCase;
  }

  async createCaseManually(
    actor: AuthenticatedUser,
    dto: CreateProbationCaseDto,
  ): Promise<ProbationCase> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const employee = await manager.getRepository(Employee).findOne({
        where: { id: dto.employee_id, company_id: companyId },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      await this.hrAccessService.assertCanAccessEmployee(actor, employee);

      const existing = await manager
        .getRepository(ProbationCase)
        .createQueryBuilder('probationCase')
        .setLock('pessimistic_write')
        .where('probationCase.company_id = :companyId', { companyId })
        .andWhere('probationCase.employee_id = :employeeId', {
          employeeId: employee.id,
        })
        .andWhere('probationCase.status IN (:...statuses)', {
          statuses: OPEN_PROBATION_CASE_STATUSES,
        })
        .getOne();

      if (existing) {
        throw new ConflictException(
          `Employee already has an open probation case (${existing.caseNo}).`,
        );
      }

      const policy = dto.policy_id
        ? await manager.getRepository(ProbationPolicy).findOne({
            where: { id: dto.policy_id, companyId },
            relations: { criteria: true },
          })
        : await this.policyResolver.resolve(
            companyId,
            employee,
            dto.start_date,
          );

      if (dto.policy_id && !policy) {
        throw new NotFoundException('Probation policy not found.');
      }

      return this.buildAndPersistCase(
        companyId,
        employee,
        policy,
        dto.start_date,
        actor,
        manager,
        'Probation case created manually',
      );
    });
  }

  async updateCaseManually(
    actor: AuthenticatedUser,
    caseId: number,
    dto: UpdateProbationCaseDto,
  ): Promise<ProbationCase> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const probationCase = await this.lockCase(companyId, caseId, manager);

      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        probationCase.employee,
      );

      const editableStatuses = [
        ProbationCaseStatusEnum.OBJECTIVES_PENDING,
        ProbationCaseStatusEnum.ACTIVE,
      ];

      if (!editableStatuses.includes(probationCase.status)) {
        throw new ConflictException(
          `Probation case ${probationCase.caseNo} can no longer be edited (status: ${probationCase.status}).`,
        );
      }

      const cycle = await this.getCurrentCycle(probationCase, manager);

      if (cycle.managerReviewedAt) {
        throw new ConflictException(
          'Probation case cannot be edited after the manager review has been submitted.',
        );
      }

      const oldValues = {
        current_start_date: probationCase.currentStartDate,
        current_due_date: probationCase.currentDueDate,
        policy_id: probationCase.policyId,
      };

      let policy: ProbationPolicy | null = null;
      let policyChanged = false;

      if (dto.policy_id !== undefined) {
        policy = await manager.getRepository(ProbationPolicy).findOne({
          where: { id: dto.policy_id, companyId },
          relations: { criteria: true },
        });

        if (!policy) {
          throw new NotFoundException('Probation policy not found.');
        }

        policyChanged = true;
      }

      if (dto.start_date !== undefined) {
        probationCase.originalStartDate = dto.start_date;
        probationCase.currentStartDate = dto.start_date;
      }

      if (dto.current_due_date !== undefined) {
        probationCase.originalDueDate = dto.current_due_date;
        probationCase.currentDueDate = dto.current_due_date;
      }

      this.assertWithinTotalProbationLimit(
        probationCase.originalStartDate,
        probationCase.currentDueDate,
      );

      if (policyChanged && policy) {
        probationCase.policyId = policy.id;
        probationCase.policySnapshot = this.buildPolicySnapshot(policy);
      }

      await manager.getRepository(ProbationCase).save(probationCase);

      cycle.periodStartDate = probationCase.currentStartDate;
      cycle.periodEndDate = probationCase.currentDueDate;
      await manager.getRepository(ProbationReviewCycle).save(cycle);

      await manager.getRepository(Employee).update(probationCase.employeeId, {
        probation_start_date: probationCase.currentStartDate,
        probation_end_date: probationCase.currentDueDate,
        confirmation_due_date: probationCase.currentDueDate,
      });

      await this.auditService.log(
        {
          action: ProbationAuditActionEnum.CASE_UPDATED,
          probationCaseId: probationCase.id,
          reviewCycleId: cycle.id,
          actor,
          description: `Probation case ${probationCase.caseNo} updated manually`,
          oldValues,
          newValues: {
            current_start_date: probationCase.currentStartDate,
            current_due_date: probationCase.currentDueDate,
            policy_id: probationCase.policyId,
          },
        },
        manager,
      );

      return probationCase;
    });
  }

  private buildPolicySnapshot(
    policy: ProbationPolicy,
  ): Record<string, unknown> {
    return {
      policy_id: policy.id,
      code: policy.code,
      name: policy.name,
      probation_period_days: policy.probationPeriodDays,
      self_assessment_required: policy.selfAssessmentRequired,
      objectives_required: policy.objectivesRequired,
      minimum_confirmation_score: Number(policy.minimumConfirmationScore),
      maximum_extensions: policy.maximumExtensions,
      default_extension_days: policy.defaultExtensionDays,
      maximum_extension_days: policy.maximumExtensionDays,
      manager_review_required: policy.managerReviewRequired,
      hr_approval_required: policy.hrApprovalRequired,
      confirmation_letter_required: policy.confirmationLetterRequired,
      criteria: (policy.criteria ?? []).map((criterion) => ({
        code: criterion.code,
        name: criterion.name,
        weight: Number(criterion.weight),
        maximum_rating: Number(criterion.maximumRating),
      })),
    };
  }

  private buildEmployeeSnapshot(employee: Employee): Record<string, unknown> {
    return {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      first_name: employee.first_name,
      last_name: employee.last_name,
      employment_type: employee.employment_type,
      position_id: employee.primary_position_id,
      department_id: employee.primary_department_id,
      branch_id: employee.primary_branch_id,
      manager_employee_id: employee.reports_to,
      hire_date: employee.hire_date,
    };
  }

  private async allocateCaseNo(
    companyId: number,
    manager: EntityManager,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const repository = manager.getRepository(ProbationNumberSequence);

    let sequence = await repository
      .createQueryBuilder('sequence')
      .setLock('pessimistic_write')
      .where('sequence.company_id = :companyId', { companyId })
      .andWhere('sequence.sequence_year = :year', { year })
      .getOne();

    if (!sequence) {
      try {
        sequence = await repository.save(
          repository.create({ companyId, sequenceYear: year, nextNumber: 1 }),
        );
      } catch {
        sequence = await repository
          .createQueryBuilder('sequence')
          .setLock('pessimistic_write')
          .where('sequence.company_id = :companyId', { companyId })
          .andWhere('sequence.sequence_year = :year', { year })
          .getOneOrFail();
      }
    }

    const allocated = sequence.nextNumber;
    sequence.nextNumber = allocated + 1;
    await repository.save(sequence);

    return `PRB-${year}-${String(allocated).padStart(6, '0')}`;
  }

  private async createReviewCycle(
    probationCase: ProbationCase,
    policy: ProbationPolicy | null,
    manager: EntityManager,
  ): Promise<ProbationReviewCycle> {
    const selfAssessmentRequired =
      policy?.selfAssessmentRequired ??
      this.configService.get<boolean>('PROBATION_SELF_ASSESSMENT_REQUIRED') ??
      false;

    const cycle = manager.getRepository(ProbationReviewCycle).create({
      probationCaseId: probationCase.id,
      cycleNumber: probationCase.currentCycleNumber,
      periodStartDate: probationCase.currentStartDate,
      periodEndDate: probationCase.currentDueDate,
      status: ProbationReviewCycleStatusEnum.ACTIVE,
      selfAssessmentRequired,
      managerEmployeeId: probationCase.managerEmployeeId,
      managerCompanyUserId: probationCase.managerCompanyUserId,
    });

    return manager.getRepository(ProbationReviewCycle).save(cycle);
  }

  private async createReviewRatings(
    cycle: ProbationReviewCycle,
    criteria: Array<{
      code: string;
      name: string;
      weight: string;
      maximumRating: string;
    }>,
    manager: EntityManager,
  ): Promise<void> {
    if (!criteria.length) {
      return;
    }

    const ratings = criteria.map((criterion) =>
      manager.getRepository(ProbationReviewRating).create({
        reviewCycleId: cycle.id,
        criterionCode: criterion.code,
        criterionName: criterion.name,
        weight: criterion.weight,
        maximumRating: criterion.maximumRating,
      }),
    );

    await manager.getRepository(ProbationReviewRating).save(ratings);
  }

  // ---------------------------------------------------------------------
  // Case retrieval
  // ---------------------------------------------------------------------

  async getCase(actor: AuthenticatedUser, id: number): Promise<ProbationCase> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const probationCase = await this.caseRepository.findOne({
      where: { id, companyId },
      relations: {
        employee: true,
        policy: true,
        reviewCycles: true,
        objectives: true,
      },
    });

    if (!probationCase) {
      throw new NotFoundException('Probation case not found.');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      probationCase.employee,
    );

    return probationCase;
  }

  async deleteCase(actor: AuthenticatedUser, id: number): Promise<void> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const probationCase = await this.caseRepository.findOne({
      where: { id, companyId },
      relations: { employee: true },
    });

    if (!probationCase) {
      throw new NotFoundException('Probation case not found.');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      probationCase.employee,
    );

    await this.auditService.log({
      action: ProbationAuditActionEnum.CASE_DELETED,
      probationCaseId: probationCase.id,
      actor,
      description: `Probation case ${probationCase.caseNo} deleted.`,
      oldValues: { status: probationCase.status },
    });

    await this.caseRepository.remove(probationCase);
  }

  async createObjective(
    actor: AuthenticatedUser,
    caseId: number,
    dto: CreateProbationObjectiveDto,
  ): Promise<ProbationObjective> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const probationCase = await this.lockCase(companyId, caseId, manager);

      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        probationCase.employee,
      );

      const editableStatuses = [
        ProbationCaseStatusEnum.OBJECTIVES_PENDING,
        ProbationCaseStatusEnum.ACTIVE,
      ];

      if (!editableStatuses.includes(probationCase.status)) {
        throw new ConflictException(
          `Objectives cannot be added while the case is ${probationCase.status}.`,
        );
      }

      const cycle = await this.getCurrentCycle(probationCase, manager);
      const objective = await manager.getRepository(ProbationObjective).save(
        manager.getRepository(ProbationObjective).create({
          companyId,
          probationCaseId: probationCase.id,
          reviewCycleId: cycle.id,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          expectedResult: dto.expected_result?.trim() || null,
          weight: String(dto.weight ?? 0),
          dueDate: dto.due_date ?? null,
          status: ProbationObjectiveStatusEnum.NOT_STARTED,
          employeeProgressComment: null,
          employeeCompletionPercent: '0',
          managerRating: null,
          managerComment: null,
          evidenceDocumentId: null,
          createdByCompanyUserId: actor.companyMembershipId ?? null,
        }),
      );

      if (probationCase.status === ProbationCaseStatusEnum.OBJECTIVES_PENDING) {
        probationCase.status = ProbationCaseStatusEnum.ACTIVE;
        await manager.getRepository(ProbationCase).save(probationCase);
      }

      await this.auditService.log(
        {
          action: ProbationAuditActionEnum.CASE_UPDATED,
          probationCaseId: probationCase.id,
          reviewCycleId: cycle.id,
          actor,
          description: `Objective "${objective.title}" added to ${probationCase.caseNo}`,
          newValues: {
            objective_id: objective.id,
            title: objective.title,
            due_date: objective.dueDate,
            weight: objective.weight,
          },
        },
        manager,
      );

      return objective;
    });
  }

  async listCases(
    actor: AuthenticatedUser,
    query: { status?: string },
  ): Promise<ProbationCase[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (accessibleEmployeeIds !== null && accessibleEmployeeIds.length === 0) {
      return [];
    }

    return this.caseRepository.find({
      where: {
        companyId,
        ...(query.status
          ? { status: query.status as ProbationCaseStatusEnum }
          : {}),
        ...(accessibleEmployeeIds
          ? { employeeId: In(accessibleEmployeeIds) }
          : {}),
      },
      relations: { employee: true, policy: true },
      order: { createdAt: 'DESC' },
    });
  }

  async listMyTeamCases(
    actor: AuthenticatedUser,
    query: { status?: string },
  ): Promise<ProbationCase[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const teamEmployeeIds = (accessibleEmployeeIds ?? []).filter(
      (employeeId) => employeeId !== actor.employeeId,
    );
    const statusWhere = query.status
      ? { status: query.status as ProbationCaseStatusEnum }
      : {};
    const where: Array<FindOptionsWhere<ProbationCase>> = [];

    if (actor.companyMembershipId) {
      where.push({
        companyId,
        managerCompanyUserId: actor.companyMembershipId,
        ...statusWhere,
      });
    }

    if (teamEmployeeIds.length > 0) {
      where.push({
        companyId,
        employeeId: In(teamEmployeeIds),
        ...statusWhere,
      });
    }

    if (where.length === 0) {
      return [];
    }

    return this.caseRepository.find({
      where,
      relations: { employee: true, policy: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getMyProbation(
    actor: AuthenticatedUser,
  ): Promise<ProbationCase | null> {
    if (!actor.employeeId) {
      throw new ForbiddenException('No employee record linked to this user.');
    }

    return this.caseRepository.findOne({
      where: { employeeId: actor.employeeId },
      relations: { reviewCycles: true, objectives: true, policy: true },
      order: { createdAt: 'DESC' },
    });
  }

  private async lockCase(
    companyId: number,
    caseId: number,
    manager: EntityManager,
  ): Promise<ProbationCase> {
    const probationCase = await manager
      .getRepository(ProbationCase)
      .createQueryBuilder('probationCase')
      .setLock('pessimistic_write')
      .leftJoinAndSelect('probationCase.employee', 'employee')
      .where('probationCase.id = :caseId', { caseId })
      .andWhere('probationCase.company_id = :companyId', { companyId })
      .getOne();

    if (!probationCase) {
      throw new NotFoundException('Probation case not found.');
    }

    return probationCase;
  }

  private async getCurrentCycle(
    probationCase: ProbationCase,
    manager: EntityManager,
  ): Promise<ProbationReviewCycle> {
    const cycle = await manager.getRepository(ProbationReviewCycle).findOne({
      where: {
        probationCaseId: probationCase.id,
        cycleNumber: probationCase.currentCycleNumber,
      },
    });

    if (!cycle) {
      throw new NotFoundException('Active probation review cycle not found.');
    }

    return cycle;
  }

  // ---------------------------------------------------------------------
  // Employee self-assessment
  // ---------------------------------------------------------------------

  async submitSelfAssessment(
    companyId: number,
    caseId: number,
    actor: AuthenticatedUser,
    dto: SubmitProbationSelfAssessmentDto,
  ): Promise<ProbationCase> {
    return this.dataSource.transaction(async (manager) => {
      const probationCase = await this.lockCase(companyId, caseId, manager);

      if (probationCase.employeeId !== actor.employeeId) {
        throw new ForbiddenException(
          'You can only submit your own probation self-assessment.',
        );
      }

      const cycle = await this.getCurrentCycle(probationCase, manager);

      if (!cycle.selfAssessmentRequired) {
        throw new BadRequestException(
          'Self-assessment is not required for this probation cycle.',
        );
      }

      if (cycle.selfAssessmentSubmittedAt) {
        throw new ConflictException(
          'Self-assessment has already been submitted.',
        );
      }

      await this.applySelfRatings(cycle.id, dto.ratings ?? [], manager);
      await this.applyObjectiveProgress(
        probationCase.id,
        cycle.id,
        dto.objectives ?? [],
        manager,
      );

      cycle.selfAssessment = {
        overall_comment: dto.overall_comment,
        submitted_by_employee_id: actor.employeeId,
        submitted_at: new Date().toISOString(),
      };
      cycle.selfAssessmentSubmittedAt = new Date();
      cycle.status = ProbationReviewCycleStatusEnum.MANAGER_REVIEW_PENDING;

      probationCase.status = ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING;

      await manager.getRepository(ProbationReviewCycle).save(cycle);
      await manager.getRepository(ProbationCase).save(probationCase);

      if (probationCase.managerCompanyUserId) {
        await this.actionItemsService.upsertOpen(
          this.buildManagerReviewActionItem(probationCase, cycle),
        );
      }

      await this.auditService.log(
        {
          action: ProbationAuditActionEnum.SELF_ASSESSMENT_SUBMITTED,
          probationCaseId: probationCase.id,
          reviewCycleId: cycle.id,
          actor,
          description: dto.overall_comment,
        },
        manager,
      );

      return probationCase;
    });
  }

  private async applySelfRatings(
    cycleId: number,
    ratings: Array<{
      criterion_code: string;
      rating: number;
      comment?: string;
    }>,
    manager: EntityManager,
  ): Promise<void> {
    for (const rating of ratings) {
      const record = await manager
        .getRepository(ProbationReviewRating)
        .findOne({
          where: {
            reviewCycleId: cycleId,
            criterionCode: rating.criterion_code,
          },
        });

      if (!record) {
        continue;
      }

      if (rating.rating > Number(record.maximumRating)) {
        throw new BadRequestException(
          `Rating for ${rating.criterion_code} cannot exceed ${record.maximumRating}.`,
        );
      }

      record.selfRating = String(rating.rating);
      record.selfComment = rating.comment ?? null;
      await manager.getRepository(ProbationReviewRating).save(record);
    }
  }

  private async applyObjectiveProgress(
    probationCaseId: number,
    reviewCycleId: number,
    progress: Array<{
      objective_id: number;
      completion_percent: number;
      comment?: string;
    }>,
    manager: EntityManager,
  ): Promise<void> {
    for (const item of progress) {
      const objective = await manager
        .getRepository(ProbationObjective)
        .findOne({
          where: { id: item.objective_id, probationCaseId, reviewCycleId },
        });

      if (!objective) {
        continue;
      }

      if (item.completion_percent > 100 || item.completion_percent < 0) {
        throw new BadRequestException(
          'Objective progress must be between 0 and 100 percent.',
        );
      }

      objective.employeeCompletionPercent = String(item.completion_percent);
      objective.employeeProgressComment = item.comment ?? null;
      objective.status =
        item.completion_percent >= 100
          ? ProbationObjectiveStatusEnum.COMPLETED
          : ProbationObjectiveStatusEnum.IN_PROGRESS;

      await manager.getRepository(ProbationObjective).save(objective);
    }
  }

  // ---------------------------------------------------------------------
  // Manager review
  // ---------------------------------------------------------------------

  private async assertManagerReviewer(
    actor: AuthenticatedUser,
    probationCase: ProbationCase,
  ): Promise<void> {
    if (
      probationCase.managerCompanyUserId &&
      probationCase.managerCompanyUserId === actor.companyMembershipId
    ) {
      return;
    }

    if (actor.permissions.includes('probation_reviews:manager-review-any')) {
      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        probationCase.employee,
      );

      return;
    }

    throw new ForbiddenException(
      'You are not the assigned probation reviewer.',
    );
  }

  async submitManagerReview(
    actor: AuthenticatedUser,
    caseId: number,
    dto: SubmitProbationManagerReviewDto,
  ): Promise<ProbationCase> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const probationCase = await this.lockCase(companyId, caseId, manager);

      if (probationCase.employeeId === actor.employeeId) {
        throw new ForbiddenException(
          'You cannot review your own probation case.',
        );
      }

      await this.assertManagerReviewer(actor, probationCase);

      const cycle = await this.getCurrentCycle(probationCase, manager);

      const score = await this.applyManagerRatings(cycle, dto.ratings, manager);

      if (dto.objectives?.length) {
        await this.applyManagerObjectiveReview(
          probationCase.id,
          cycle.id,
          dto.objectives,
          manager,
        );
      }

      const minimumScore = Number(
        (
          probationCase.policySnapshot as {
            minimum_confirmation_score?: number;
          }
        )?.minimum_confirmation_score ??
          this.configService.get<number>(
            'PROBATION_MINIMUM_CONFIRMATION_SCORE',
          ) ??
          60,
      );

      if (
        dto.recommendation === ProbationManagerRecommendationEnum.CONFIRM &&
        score < minimumScore
      ) {
        throw new BadRequestException(
          `Confirmation cannot be recommended because the score ${score} is below the required score ${minimumScore}.`,
        );
      }

      cycle.managerRecommendation = dto.recommendation;
      cycle.managerScore = score.toFixed(2);
      cycle.managerComments = dto.comments.trim();
      cycle.managerReviewedAt = new Date();
      cycle.status = ProbationReviewCycleStatusEnum.HR_REVIEW_PENDING;

      probationCase.status = ProbationCaseStatusEnum.HR_REVIEW_PENDING;
      probationCase.managerCompanyUserId =
        probationCase.managerCompanyUserId ?? actor.companyMembershipId ?? null;

      await manager.getRepository(ProbationReviewCycle).save(cycle);
      await manager.getRepository(ProbationCase).save(probationCase);

      if (probationCase.managerCompanyUserId) {
        await this.actionItemsService.completeBySource(
          companyId,
          `probation:manager-review:${probationCase.id}:${cycle.id}:${probationCase.managerCompanyUserId}`,
        );
      }

      await this.auditService.log(
        {
          action: ProbationAuditActionEnum.MANAGER_REVIEW_SUBMITTED,
          probationCaseId: probationCase.id,
          reviewCycleId: cycle.id,
          actor,
          description: dto.comments,
          newValues: {
            recommendation: dto.recommendation,
            score,
          },
        },
        manager,
      );

      return probationCase;
    });
  }

  private buildManagerReviewActionItem(
    probationCase: ProbationCase,
    cycle: ProbationReviewCycle,
  ): UpsertActionItemInput {
    return {
      companyId: probationCase.companyId,
      assigneeCompanyUserId: probationCase.managerCompanyUserId as number,
      actionType: ActionItemTypeEnum.APPROVAL,
      sourceModule: 'probation',
      sourceEntityType: 'PROBATION_CASE',
      sourceEntityId: probationCase.id,
      sourceKey: `probation:manager-review:${probationCase.id}:${cycle.id}:${probationCase.managerCompanyUserId}`,
      title: 'Probation manager review required',
      actionUrl: `/probation/cases/${probationCase.id}`,
    };
  }

  private async applyManagerRatings(
    cycle: ProbationReviewCycle,
    ratings: Array<{
      criterion_code: string;
      rating: number;
      comment?: string;
    }>,
    manager: EntityManager,
  ): Promise<number> {
    const records = await manager.getRepository(ProbationReviewRating).find({
      where: { reviewCycleId: cycle.id },
    });

    if (records.length > 0) {
      const requiredCodes = new Set(records.map((r) => r.criterionCode));
      const providedCodes = new Set(ratings.map((r) => r.criterion_code));

      for (const code of requiredCodes) {
        if (!providedCodes.has(code)) {
          throw new BadRequestException(
            `Manager rating for criterion ${code} is required.`,
          );
        }
      }
    }

    for (const rating of ratings) {
      const record = records.find(
        (r) => r.criterionCode === rating.criterion_code,
      );

      if (!record) {
        continue;
      }

      if (rating.rating > Number(record.maximumRating)) {
        throw new BadRequestException(
          `Rating for ${rating.criterion_code} cannot exceed ${record.maximumRating}.`,
        );
      }

      record.managerRating = String(rating.rating);
      record.managerComment = rating.comment ?? null;
      record.weightedScore = (
        (rating.rating / Number(record.maximumRating)) *
        Number(record.weight)
      ).toFixed(2);

      await manager.getRepository(ProbationReviewRating).save(record);
    }

    const finalRecords = await manager
      .getRepository(ProbationReviewRating)
      .find({
        where: { reviewCycleId: cycle.id },
      });

    return Number(
      finalRecords
        .reduce((total, record) => total + Number(record.weightedScore ?? 0), 0)
        .toFixed(2),
    );
  }

  private async applyManagerObjectiveReview(
    probationCaseId: number,
    reviewCycleId: number,
    reviews: Array<{ objective_id: number; rating: number; comment?: string }>,
    manager: EntityManager,
  ): Promise<void> {
    for (const review of reviews) {
      const objective = await manager
        .getRepository(ProbationObjective)
        .findOne({
          where: {
            id: review.objective_id,
            probationCaseId,
            reviewCycleId,
          },
        });

      if (!objective) {
        continue;
      }

      objective.managerRating = String(review.rating);
      objective.managerComment = review.comment ?? null;
      await manager.getRepository(ProbationObjective).save(objective);
    }
  }

  // ---------------------------------------------------------------------
  // HR final decision
  // ---------------------------------------------------------------------

  async submitHrDecision(
    actor: AuthenticatedUser,
    caseId: number,
    dto: SubmitProbationHrDecisionDto,
  ): Promise<ProbationCase> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const probationCase = await this.dataSource.transaction(async (manager) => {
      const probationCase = await this.lockCase(companyId, caseId, manager);
      const alreadyConfirmed =
        probationCase.status === ProbationCaseStatusEnum.CONFIRMED;

      if (probationCase.employeeId === actor.employeeId) {
        throw new ForbiddenException(
          'You cannot decide on your own probation case.',
        );
      }

      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        probationCase.employee,
      );

      const requireManagerRecommendation =
        (probationCase.policySnapshot as { hr_approval_required?: boolean })
          ?.hr_approval_required !== false;

      const cycle = await this.getCurrentCycle(probationCase, manager);

      if (
        requireManagerRecommendation &&
        !cycle.managerRecommendation &&
        probationCase.status !== ProbationCaseStatusEnum.HR_REVIEW_PENDING
      ) {
        throw new BadRequestException(
          'Manager review must be completed before an HR decision can be made.',
        );
      }

      switch (dto.decision) {
        case ProbationFinalDecisionEnum.CONFIRMED:
          await this.confirmEmployee(probationCase, cycle, dto, actor, manager);
          if (!alreadyConfirmed) {
            await this.employmentHistoryService.record(
              {
                companyId,
                employeeId: probationCase.employeeId,
                eventType: EmploymentEventTypeEnum.CONFIRMED,
                title: 'Employment confirmed',
                effectiveDate: probationCase.confirmationDate,
                description: dto.comments.trim(),
                sourceModule: 'probation',
                sourceEntityType: 'PROBATION_CASE',
                sourceEntityId: probationCase.id,
                dedupeKey: `probation:confirmed:${probationCase.id}`,
                actorCompanyUserId: actor.companyMembershipId ?? null,
              },
              manager,
            );
            if (probationCase.employee.company_user_id) {
              const notifications = manager.getRepository(AppNotification);
              await notifications.save(
                notifications.create({
                  company_id: companyId,
                  sender_company_user_id: actor.companyMembershipId ?? null,
                  receiver_company_user_id:
                    probationCase.employee.company_user_id,
                  title: 'Employment confirmed',
                  message: `Your employment was confirmed effective ${probationCase.confirmationDate}.`,
                  related_module: 'probation',
                  entity_type: 'PROBATION_CASE',
                  entity_id: String(probationCase.id),
                  action_url: '/me/probation',
                  dedupe_key: `probation:confirmed:${probationCase.id}:${probationCase.employee.company_user_id}`,
                }),
              );
            }
          }
          break;
        case ProbationFinalDecisionEnum.EXTENDED:
          await this.extendProbation(probationCase, cycle, dto, actor, manager);
          break;
        case ProbationFinalDecisionEnum.NOT_CONFIRMED:
          await this.finalizeNonConfirmation(
            probationCase,
            cycle,
            dto,
            actor,
            manager,
            EmployeeConfirmationStatusEnum.NOT_CONFIRMED,
            ProbationCaseStatusEnum.NOT_CONFIRMED,
          );
          break;
        case ProbationFinalDecisionEnum.TERMINATION_RECOMMENDED:
          await this.finalizeNonConfirmation(
            probationCase,
            cycle,
            dto,
            actor,
            manager,
            EmployeeConfirmationStatusEnum.TERMINATION_RECOMMENDED,
            ProbationCaseStatusEnum.TERMINATION_RECOMMENDED,
          );
          break;
        default:
          throw new BadRequestException('Unsupported probation decision.');
      }

      if (probationCase.managerCompanyUserId) {
        await this.actionItemsService.completeBySource(
          companyId,
          `probation:hr-review:${probationCase.id}:${cycle.id}`,
        );
      }

      return probationCase;
    });

    await this.runPostDecisionSideEffects(companyId, probationCase, dto, actor);

    return probationCase;
  }

  private async runPostDecisionSideEffects(
    companyId: number,
    probationCase: ProbationCase,
    dto: SubmitProbationHrDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const requireLetter =
      (
        probationCase.policySnapshot as {
          confirmation_letter_required?: boolean;
        }
      )?.confirmation_letter_required !== false;

    if (
      probationCase.status === ProbationCaseStatusEnum.CONFIRMED &&
      requireLetter
    ) {
      try {
        const alreadyGenerated = await this.letterService.isLetterGenerated(
          probationCase.id,
          ProbationLetterTypeEnum.CONFIRMATION,
        );

        if (!alreadyGenerated) {
          const document = await this.letterService.generateAndStore(
            companyId,
            probationCase.id,
            ProbationLetterTypeEnum.CONFIRMATION,
          );

          await this.caseRepository.update(probationCase.id, {
            confirmationDocumentId: document.id,
          });

          await this.auditService.log({
            action: ProbationAuditActionEnum.LETTER_GENERATED,
            probationCaseId: probationCase.id,
            actor,
            description: 'Confirmation letter generated',
          });
        }
      } catch {
        // Letter generation failure must not roll back the confirmation
        // decision itself; HR can regenerate the letter separately.
      }

      await this.auditService.log({
        action: ProbationAuditActionEnum.EMPLOYEE_CONFIRMED,
        probationCaseId: probationCase.id,
        actor,
        description: dto.comments,
      });
    }

    if (probationCase.status === ProbationCaseStatusEnum.EXTENDED) {
      try {
        const document = await this.letterService.generateAndStore(
          companyId,
          probationCase.id,
          ProbationLetterTypeEnum.EXTENSION,
        );
        void document;
      } catch {
        // Extension letter generation is best-effort; HR can regenerate later.
      }

      await this.auditService.log({
        action: ProbationAuditActionEnum.EXTENDED,
        probationCaseId: probationCase.id,
        actor,
        description: dto.comments,
      });
    }

    if (probationCase.status === ProbationCaseStatusEnum.NOT_CONFIRMED) {
      await this.auditService.log({
        action: ProbationAuditActionEnum.EMPLOYEE_NOT_CONFIRMED,
        probationCaseId: probationCase.id,
        actor,
        description: dto.comments,
      });
    }

    if (
      probationCase.status === ProbationCaseStatusEnum.TERMINATION_RECOMMENDED
    ) {
      await this.auditService.log({
        action: ProbationAuditActionEnum.TERMINATION_RECOMMENDED,
        probationCaseId: probationCase.id,
        actor,
        description: dto.comments,
      });

      await this.createOffboardingDraftForTermination(
        companyId,
        probationCase,
        dto,
        actor,
      );
    }
  }

  private async createOffboardingDraftForTermination(
    companyId: number,
    probationCase: ProbationCase,
    dto: SubmitProbationHrDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const employeeSnapshot = probationCase.employeeSnapshot as {
      employee_no?: string;
    };

    const createDto: CreateOffboardingRequestDto = {
      employee_id: probationCase.employeeId,
      title: `Probation termination recommendation - ${employeeSnapshot.employee_no ?? probationCase.employeeId}`,
      offboarding_type: OffboardingTypeEnum.TERMINATION,
      reason: dto.comments,
      last_working_date: formatDateOnly(new Date()),
      submit: false,
      metadata: {
        source: 'PROBATION_CASE',
        probation_case_id: probationCase.id,
      },
    };

    try {
      await this.offboardingService.createOffboardingRequest(
        companyId,
        createDto,
        actor,
      );
    } catch {
      // Offboarding draft creation is best-effort here; HR retains the
      // ability to start an offboarding request manually if this fails
      // (e.g. an open request already exists for this employee).
    }
  }

  async generateLetter(
    actor: AuthenticatedUser,
    caseId: number,
    letterType?: ProbationLetterTypeEnum,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const probationCase = await this.caseRepository.findOne({
      where: { id: caseId, companyId },
      relations: { employee: true },
    });

    if (!probationCase) {
      throw new NotFoundException('Probation case not found.');
    }

    const resolvedLetterType =
      letterType ?? this.resolveLetterTypeForCase(probationCase);

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      probationCase.employee,
    );

    const document = await this.letterService.generateAndStore(
      companyId,
      caseId,
      resolvedLetterType,
    );

    await this.auditService.log({
      action: ProbationAuditActionEnum.LETTER_GENERATED,
      probationCaseId: caseId,
      actor,
      description: `${resolvedLetterType} letter generated on request`,
    });

    return document;
  }

  private async confirmEmployee(
    probationCase: ProbationCase,
    cycle: ProbationReviewCycle,
    dto: SubmitProbationHrDecisionDto,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const employeeRepository = manager.getRepository(Employee);

    const employee = await employeeRepository
      .createQueryBuilder('employee')
      .setLock('pessimistic_write')
      .where('employee.id = :employeeId', {
        employeeId: probationCase.employeeId,
      })
      .getOneOrFail();

    if (probationCase.status === ProbationCaseStatusEnum.CONFIRMED) {
      return;
    }

    const confirmationDate =
      dto.confirmation_date ?? formatDateOnly(new Date());

    if (employee.hire_date && confirmationDate < employee.hire_date) {
      throw new BadRequestException(
        'Confirmation date cannot be before the hire date.',
      );
    }

    employee.confirmation_status = EmployeeConfirmationStatusEnum.CONFIRMED;
    employee.confirmation_date = confirmationDate;
    employee.confirmed_by_company_user_id = actor.companyMembershipId ?? null;

    await employeeRepository.save(employee);

    cycle.hrDecision = ProbationFinalDecisionEnum.CONFIRMED;
    cycle.hrComments = dto.comments.trim();
    cycle.hrCompanyUserId = actor.companyMembershipId ?? null;
    cycle.hrReviewedAt = new Date();
    cycle.status = ProbationReviewCycleStatusEnum.COMPLETED;

    probationCase.finalDecision = ProbationFinalDecisionEnum.CONFIRMED;
    probationCase.finalDecisionReason = dto.comments.trim();
    probationCase.confirmationDate = confirmationDate;
    probationCase.finalizedByCompanyUserId = actor.companyMembershipId ?? null;
    probationCase.finalizedAt = new Date();
    probationCase.status = ProbationCaseStatusEnum.CONFIRMED;

    await manager.getRepository(ProbationReviewCycle).save(cycle);
    await manager.getRepository(ProbationCase).save(probationCase);
  }

  private async extendProbation(
    probationCase: ProbationCase,
    currentCycle: ProbationReviewCycle,
    dto: SubmitProbationHrDecisionDto,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const policySnapshot = (probationCase.policySnapshot ?? {}) as {
      maximum_extensions?: number;
      maximum_extension_days?: number;
    };

    const maximumExtensions =
      policySnapshot.maximum_extensions ??
      this.configService.get<number>('PROBATION_MAX_EXTENSIONS') ??
      2;

    if (probationCase.extensionCount >= maximumExtensions) {
      throw new BadRequestException(
        `Maximum probation extensions reached: ${maximumExtensions}.`,
      );
    }

    const maximumExtensionDays =
      policySnapshot.maximum_extension_days ??
      this.configService.get<number>('PROBATION_MAX_EXTENSION_DAYS') ??
      180;

    const extensionDays =
      dto.extension_days ??
      this.configService.get<number>('PROBATION_DEFAULT_EXTENSION_DAYS') ??
      90;

    if (extensionDays > maximumExtensionDays) {
      throw new BadRequestException(
        `Probation extension cannot exceed ${maximumExtensionDays} days.`,
      );
    }

    const newStartDate = addDaysToDateOnly(probationCase.currentDueDate, 1);
    const newEndDate =
      dto.extension_end_date ??
      addDaysToDateOnly(newStartDate, extensionDays - 1);
    this.assertWithinTotalProbationLimit(
      probationCase.originalStartDate,
      newEndDate,
    );

    currentCycle.hrDecision = ProbationFinalDecisionEnum.EXTENDED;
    currentCycle.hrComments = dto.comments.trim();
    currentCycle.hrCompanyUserId = actor.companyMembershipId ?? null;
    currentCycle.hrReviewedAt = new Date();
    currentCycle.status = ProbationReviewCycleStatusEnum.SUPERSEDED;

    await manager.getRepository(ProbationReviewCycle).save(currentCycle);

    const extension = await manager.getRepository(ProbationExtension).save(
      manager.getRepository(ProbationExtension).create({
        companyId: probationCase.companyId,
        probationCaseId: probationCase.id,
        reviewCycleId: currentCycle.id,
        extensionNumber: probationCase.extensionCount + 1,
        previousEndDate: probationCase.currentDueDate,
        newStartDate,
        newEndDate,
        extensionDays,
        reason: dto.comments.trim(),
        improvementPlan: dto.comments.trim(),
        approvedByCompanyUserId: actor.companyMembershipId as number,
        approvedAt: new Date(),
      }),
    );

    probationCase.extensionCount += 1;
    probationCase.currentCycleNumber += 1;
    probationCase.currentStartDate = newStartDate;
    probationCase.currentDueDate = newEndDate;
    probationCase.status = ProbationCaseStatusEnum.EXTENDED;
    probationCase.finalDecision = null;
    probationCase.finalDecisionReason = null;
    probationCase.finalizedAt = null;
    probationCase.finalizedByCompanyUserId = null;

    await manager.getRepository(ProbationCase).save(probationCase);

    const policy = probationCase.policyId
      ? await manager.getRepository(ProbationPolicy).findOne({
          where: { id: probationCase.policyId },
          relations: { criteria: true },
        })
      : null;

    const nextCycle = await this.createReviewCycle(
      probationCase,
      policy,
      manager,
    );

    if (policy?.criteria?.length) {
      await this.createReviewRatings(nextCycle, policy.criteria, manager);
    }

    void extension;

    await manager.getRepository(Employee).update(probationCase.employeeId, {
      confirmation_status: EmployeeConfirmationStatusEnum.PROBATION_EXTENDED,
      probation_end_date: newEndDate,
      confirmation_due_date: newEndDate,
      confirmation_date: null,
    });
  }

  private async resolveManagerCompanyUserId(
    companyId: number,
    managerEmployeeId: number | null,
    manager: EntityManager,
  ): Promise<number | null> {
    if (!managerEmployeeId) {
      return null;
    }

    const managerEmployee = await manager.getRepository(Employee).findOne({
      where: { id: managerEmployeeId, company_id: companyId },
    });

    return managerEmployee?.company_user_id ?? null;
  }

  private probationDurationDays(startDate: string, endDate: string): number {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new BadRequestException('Invalid probation date range.');
    }
    return Math.floor((end - start) / 86400000) + 1;
  }

  private assertWithinTotalProbationLimit(
    startDate: string,
    endDate: string,
  ): void {
    const maximumTotalDays =
      this.configService.get<number>('PROBATION_MAX_TOTAL_DAYS') ??
      DEFAULT_MAX_TOTAL_PROBATION_DAYS;
    const totalDays = this.probationDurationDays(startDate, endDate);

    if (totalDays > maximumTotalDays) {
      throw new BadRequestException(
        `Total probation period cannot exceed ${maximumTotalDays} days.`,
      );
    }
  }

  private resolveLetterTypeForCase(
    probationCase: ProbationCase,
  ): ProbationLetterTypeEnum {
    if (probationCase.status === ProbationCaseStatusEnum.EXTENDED) {
      return ProbationLetterTypeEnum.EXTENSION;
    }
    if (probationCase.status === ProbationCaseStatusEnum.NOT_CONFIRMED) {
      return ProbationLetterTypeEnum.NOT_CONFIRMED;
    }
    return ProbationLetterTypeEnum.CONFIRMATION;
  }

  private async finalizeNonConfirmation(
    probationCase: ProbationCase,
    cycle: ProbationReviewCycle,
    dto: SubmitProbationHrDecisionDto,
    actor: AuthenticatedUser,
    manager: EntityManager,
    employeeStatus: EmployeeConfirmationStatusEnum,
    caseStatus: ProbationCaseStatusEnum,
  ): Promise<void> {
    cycle.hrDecision =
      caseStatus === ProbationCaseStatusEnum.NOT_CONFIRMED
        ? ProbationFinalDecisionEnum.NOT_CONFIRMED
        : ProbationFinalDecisionEnum.TERMINATION_RECOMMENDED;
    cycle.hrComments = dto.comments.trim();
    cycle.hrCompanyUserId = actor.companyMembershipId ?? null;
    cycle.hrReviewedAt = new Date();
    cycle.status = ProbationReviewCycleStatusEnum.COMPLETED;

    probationCase.finalDecision =
      caseStatus === ProbationCaseStatusEnum.NOT_CONFIRMED
        ? ProbationFinalDecisionEnum.NOT_CONFIRMED
        : ProbationFinalDecisionEnum.TERMINATION_RECOMMENDED;
    probationCase.finalDecisionReason = dto.comments.trim();
    probationCase.finalizedByCompanyUserId = actor.companyMembershipId ?? null;
    probationCase.finalizedAt = new Date();
    probationCase.status = caseStatus;

    await manager.getRepository(ProbationReviewCycle).save(cycle);
    await manager.getRepository(ProbationCase).save(probationCase);

    // Do NOT touch employment_status here — HR must run the offboarding
    // workflow separately for terminations. Probation-side decisions only
    // record the confirmation outcome on the employee record.
    await manager.getRepository(Employee).update(probationCase.employeeId, {
      confirmation_status: employeeStatus,
    });
  }

  // ---------------------------------------------------------------------
  // Dashboard summary
  // ---------------------------------------------------------------------

  async getDashboardSummary(actor: AuthenticatedUser): Promise<{
    total_on_probation: number;
    confirmation_due_30_days: number;
    overdue: number;
    pending_manager_review: number;
    pending_hr_review: number;
    extended_cases: number;
  }> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (accessibleEmployeeIds !== null && accessibleEmployeeIds.length === 0) {
      return {
        total_on_probation: 0,
        confirmation_due_30_days: 0,
        overdue: 0,
        pending_manager_review: 0,
        pending_hr_review: 0,
        extended_cases: 0,
      };
    }

    const today = formatDateOnly(new Date());
    const nextThirtyDays = addDaysToDateOnly(today, 30);

    const baseQuery = () => {
      const queryBuilder = this.caseRepository
        .createQueryBuilder('probationCase')
        .where('probationCase.company_id = :companyId', { companyId });

      if (accessibleEmployeeIds !== null) {
        queryBuilder.andWhere(
          'probationCase.employee_id IN (:...accessibleEmployeeIds)',
          { accessibleEmployeeIds },
        );
      }

      return queryBuilder;
    };

    const [
      totalOnProbation,
      dueWithinThirtyDays,
      overdue,
      pendingManagerReview,
      pendingHrReview,
      extensions,
    ] = await Promise.all([
      baseQuery()
        .andWhere('probationCase.status IN (:...statuses)', {
          statuses: [
            ProbationCaseStatusEnum.ACTIVE,
            ProbationCaseStatusEnum.EXTENDED,
            ProbationCaseStatusEnum.OBJECTIVES_PENDING,
          ],
        })
        .getCount(),
      baseQuery()
        .andWhere('probationCase.current_due_date >= :today', { today })
        .andWhere('probationCase.current_due_date <= :nextThirtyDays', {
          nextThirtyDays,
        })
        .getCount(),
      baseQuery()
        .andWhere('probationCase.current_due_date < :today', { today })
        .andWhere('probationCase.status NOT IN (:...closedStatuses)', {
          closedStatuses: [
            ProbationCaseStatusEnum.CONFIRMED,
            ProbationCaseStatusEnum.NOT_CONFIRMED,
            ProbationCaseStatusEnum.TERMINATION_RECOMMENDED,
            ProbationCaseStatusEnum.CANCELLED,
          ],
        })
        .getCount(),
      baseQuery()
        .andWhere('probationCase.status = :status', {
          status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
        })
        .getCount(),
      baseQuery()
        .andWhere('probationCase.status = :status', {
          status: ProbationCaseStatusEnum.HR_REVIEW_PENDING,
        })
        .getCount(),
      baseQuery().andWhere('probationCase.extension_count > 0').getCount(),
    ]);

    return {
      total_on_probation: totalOnProbation,
      confirmation_due_30_days: dueWithinThirtyDays,
      overdue,
      pending_manager_review: pendingManagerReview,
      pending_hr_review: pendingHrReview,
      extended_cases: extensions,
    };
  }
}
