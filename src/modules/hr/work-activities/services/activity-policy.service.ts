import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { ActivityCategory, ActivityPolicy } from '../entities/activity-config.entities';

@Injectable()
export class ActivityPolicyService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(ActivityCategory)
    private readonly categoryRepository: Repository<ActivityCategory>,
    @InjectRepository(ActivityPolicy)
    private readonly policyRepository: Repository<ActivityPolicy>,
  ) {}

  private ensureCompanyId(actor: AuthenticatedUser): number {
    return this.hrAccessService.ensureActorCompanyId(actor);
  }

  async createCategory(actor: AuthenticatedUser, dto: Record<string, unknown>) {
    const companyId = this.ensureCompanyId(actor);
    const category = this.categoryRepository.create({
      companyId,
      code: String(dto.code).trim().toUpperCase(),
      name: String(dto.name).trim(),
      description: (dto.description as string | undefined)?.trim() ?? null,
      departmentId: (dto.department_id as number | undefined) ?? null,
      positionId: (dto.position_id as number | undefined) ?? null,
      gradeId: (dto.grade_id as number | undefined) ?? null,
      requiresTime: Boolean(dto.requires_time ?? false),
      requiresOutcome: dto.requires_outcome !== false,
      requiresEvidence: Boolean(dto.requires_evidence ?? false),
      requiresLocation: Boolean(dto.requires_location ?? false),
      isFieldActivity: Boolean(dto.is_field_activity ?? false),
      defaultKpiCode:
        typeof dto.default_kpi_code === 'string'
          ? dto.default_kpi_code.trim()
          : null,
      displayOrder: Number(dto.display_order ?? 0),
      status: 'ACTIVE',
    });

    return this.categoryRepository.save(category);
  }

  async listCategories(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    return this.categoryRepository.find({
      where: { companyId },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  async updateCategory(
    actor: AuthenticatedUser,
    id: number,
    dto: Record<string, unknown>,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId },
    });

    if (!category) {
      throw new NotFoundException('Activity category not found.');
    }

    if (typeof dto.code === 'string') {
      category.code = dto.code.trim().toUpperCase();
    }
    if (typeof dto.name === 'string') {
      category.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      category.description = (dto.description as string | null)?.trim() ?? null;
    }
    if (dto.department_id !== undefined) {
      category.departmentId = (dto.department_id as number | null) ?? null;
    }
    if (dto.position_id !== undefined) {
      category.positionId = (dto.position_id as number | null) ?? null;
    }
    if (dto.grade_id !== undefined) {
      category.gradeId = (dto.grade_id as number | null) ?? null;
    }
    if (dto.requires_time !== undefined) {
      category.requiresTime = Boolean(dto.requires_time);
    }
    if (dto.requires_outcome !== undefined) {
      category.requiresOutcome = Boolean(dto.requires_outcome);
    }
    if (dto.requires_evidence !== undefined) {
      category.requiresEvidence = Boolean(dto.requires_evidence);
    }
    if (dto.requires_location !== undefined) {
      category.requiresLocation = Boolean(dto.requires_location);
    }
    if (dto.is_field_activity !== undefined) {
      category.isFieldActivity = Boolean(dto.is_field_activity);
    }
    if (dto.default_kpi_code !== undefined) {
      category.defaultKpiCode =
        typeof dto.default_kpi_code === 'string'
          ? dto.default_kpi_code.trim()
          : null;
    }
    if (dto.display_order !== undefined) {
      category.displayOrder = Number(dto.display_order ?? 0);
    }

    return this.categoryRepository.save(category);
  }

  async deactivateCategory(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId },
    });

    if (!category) {
      throw new NotFoundException('Activity category not found.');
    }

    category.status = 'INACTIVE';
    return this.categoryRepository.save(category);
  }

  async createPolicy(actor: AuthenticatedUser, dto: Record<string, unknown>) {
    const companyId = this.ensureCompanyId(actor);
    this.assertCutoff(String(dto.submission_cutoff_time ?? '20:00'));

    const policy = this.policyRepository.create({
      companyId,
      branchId: (dto.branch_id as number | undefined) ?? null,
      departmentId: (dto.department_id as number | undefined) ?? null,
      positionId: (dto.position_id as number | undefined) ?? null,
      gradeId: (dto.grade_id as number | undefined) ?? null,
      employmentType:
        typeof dto.employment_type === 'string'
          ? dto.employment_type.trim()
          : null,
      dailySubmissionRequired: dto.daily_submission_required !== false,
      submissionCutoffTime: String(dto.submission_cutoff_time ?? '20:00'),
      managerReviewRequired: dto.manager_review_required !== false,
      minimumActivityCount: Number(dto.minimum_activity_count ?? 1),
      minimumCompletedActivityCount: Number(
        dto.minimum_completed_activity_count ?? 1,
      ),
      fieldVisitPlanRequired: Boolean(dto.field_visit_plan_required ?? false),
      allowUnplannedVisits: dto.allow_unplanned_visits !== false,
      requireVisitSelfie: Boolean(dto.require_visit_selfie ?? false),
      requireDeviceBinding: dto.require_device_binding !== false,
      maximumBackdateDays: Number(
        dto.maximum_backdate_days ??
          this.configService.get<number>('ACTIVITY_MAX_BACKDATE_DAYS', 3),
      ),
      priority: Number(dto.priority ?? 0),
      effectiveFrom: String(dto.effective_from),
      effectiveTo:
        typeof dto.effective_to === 'string' ? dto.effective_to : null,
      status: 'ACTIVE',
    });

    return this.policyRepository.save(policy);
  }

  async listPolicies(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    return this.policyRepository.find({
      where: { companyId },
      order: { priority: 'DESC', effectiveFrom: 'DESC', id: 'DESC' },
    });
  }

  async updatePolicy(
    actor: AuthenticatedUser,
    id: number,
    dto: Record<string, unknown>,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const policy = await this.policyRepository.findOne({
      where: { id, companyId },
    });

    if (!policy) {
      throw new NotFoundException('Activity policy not found.');
    }

    if (dto.submission_cutoff_time !== undefined) {
      this.assertCutoff(String(dto.submission_cutoff_time));
      policy.submissionCutoffTime = String(dto.submission_cutoff_time);
    }

    if (dto.branch_id !== undefined) policy.branchId = dto.branch_id as number | null;
    if (dto.department_id !== undefined)
      policy.departmentId = dto.department_id as number | null;
    if (dto.position_id !== undefined)
      policy.positionId = dto.position_id as number | null;
    if (dto.grade_id !== undefined) policy.gradeId = dto.grade_id as number | null;
    if (dto.employment_type !== undefined) {
      policy.employmentType =
        typeof dto.employment_type === 'string'
          ? dto.employment_type.trim()
          : null;
    }
    if (dto.daily_submission_required !== undefined) {
      policy.dailySubmissionRequired = Boolean(dto.daily_submission_required);
    }
    if (dto.manager_review_required !== undefined) {
      policy.managerReviewRequired = Boolean(dto.manager_review_required);
    }
    if (dto.minimum_activity_count !== undefined) {
      policy.minimumActivityCount = Number(dto.minimum_activity_count);
    }
    if (dto.minimum_completed_activity_count !== undefined) {
      policy.minimumCompletedActivityCount = Number(
        dto.minimum_completed_activity_count,
      );
    }
    if (dto.field_visit_plan_required !== undefined) {
      policy.fieldVisitPlanRequired = Boolean(dto.field_visit_plan_required);
    }
    if (dto.allow_unplanned_visits !== undefined) {
      policy.allowUnplannedVisits = Boolean(dto.allow_unplanned_visits);
    }
    if (dto.require_visit_selfie !== undefined) {
      policy.requireVisitSelfie = Boolean(dto.require_visit_selfie);
    }
    if (dto.require_device_binding !== undefined) {
      policy.requireDeviceBinding = Boolean(dto.require_device_binding);
    }
    if (dto.maximum_backdate_days !== undefined) {
      policy.maximumBackdateDays = Number(dto.maximum_backdate_days);
    }
    if (dto.priority !== undefined) {
      policy.priority = Number(dto.priority);
    }
    if (dto.effective_from !== undefined) {
      policy.effectiveFrom = String(dto.effective_from);
    }
    if (dto.effective_to !== undefined) {
      policy.effectiveTo =
        typeof dto.effective_to === 'string' ? dto.effective_to : null;
    }

    return this.policyRepository.save(policy);
  }

  private assertCutoff(value: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new BadRequestException(
        'submission_cutoff_time must use HH:mm format.',
      );
    }
  }

  async getCategoryOrFail(companyId: number, id: number) {
    const category = await this.categoryRepository.findOne({
      where: { id, companyId },
    });

    if (!category || category.status !== 'ACTIVE') {
      throw new NotFoundException('Activity category not found.');
    }

    return category;
  }

  async resolveForEmployee(
    companyId: number,
    employee: Employee,
    targetDate: string,
  ): Promise<ActivityPolicy | Record<string, unknown>> {
    const policies = await this.policyRepository.find({
      where: { companyId, status: 'ACTIVE' },
      order: { priority: 'DESC', effectiveFrom: 'DESC', id: 'DESC' },
    });

    const activePolicies = policies.filter(
      (policy) =>
        policy.effectiveFrom <= targetDate &&
        (!policy.effectiveTo || policy.effectiveTo >= targetDate) &&
        (policy.branchId === null || policy.branchId === employee.primary_branch_id) &&
        (policy.departmentId === null ||
          policy.departmentId === employee.primary_department_id) &&
        (policy.positionId === null ||
          policy.positionId === employee.primary_position_id) &&
        (policy.gradeId === null || policy.gradeId === employee.grade_id) &&
        (policy.employmentType === null ||
          policy.employmentType === employee.employment_type),
    );

    if (activePolicies.length > 0) {
      return activePolicies
        .map((policy) => ({
          policy,
          score: [
            policy.positionId,
            policy.gradeId,
            policy.departmentId,
            policy.branchId,
            policy.employmentType,
          ].filter((value) => value !== null).length,
        }))
        .sort((a, b) => b.score - a.score || b.policy.priority - a.policy.priority)[0]
        .policy;
    }

    return {
      id: null,
      companyId,
      branchId: null,
      departmentId: null,
      positionId: null,
      gradeId: null,
      employmentType: employee.employment_type,
      dailySubmissionRequired: this.configService.get<boolean>(
        'ACTIVITY_REQUIRE_DAILY_SUBMISSION',
        true,
      ),
      submissionCutoffTime: this.configService.get<string>(
        'ACTIVITY_DEFAULT_CUTOFF_TIME',
        '20:00',
      ),
      managerReviewRequired: this.configService.get<boolean>(
        'ACTIVITY_REQUIRE_MANAGER_REVIEW',
        true,
      ),
      minimumActivityCount: 1,
      minimumCompletedActivityCount: 1,
      fieldVisitPlanRequired: this.configService.get<boolean>(
        'FIELD_VISIT_REQUIRE_PLAN',
        true,
      ),
      allowUnplannedVisits: this.configService.get<boolean>(
        'FIELD_VISIT_ALLOW_UNPLANNED',
        true,
      ),
      requireVisitSelfie: this.configService.get<boolean>(
        'FIELD_VISIT_REQUIRE_SELFIE',
        false,
      ),
      requireDeviceBinding: this.configService.get<boolean>(
        'FIELD_VISIT_REQUIRE_DEVICE_BINDING',
        true,
      ),
      maximumBackdateDays: this.configService.get<number>(
        'ACTIVITY_MAX_BACKDATE_DAYS',
        3,
      ),
      priority: -1,
      effectiveFrom: targetDate,
      effectiveTo: null,
      status: 'ACTIVE',
    };
  }
}
