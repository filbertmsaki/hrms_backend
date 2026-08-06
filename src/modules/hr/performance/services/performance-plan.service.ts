import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { CreatePerformancePlanDto } from '../dto/create-performance-plan.dto';
import { EmployeePerformancePlan } from '../entities/employee-performance-plan.entity';
import { EmployeePerformancePlanItem } from '../entities/employee-performance-plan-item.entity';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { KpiDefinitionVersion } from '../entities/kpi-definition-version.entity';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { PerformancePlanStatusEnum } from '../enums/performance-plan-status.enum';
import { PerformanceAuditService } from './performance-audit.service';

@Injectable()
export class PerformancePlanService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly definitionVersionRepository: Repository<KpiDefinitionVersion>,
    @InjectRepository(EmployeePerformancePlan)
    private readonly planRepository: Repository<EmployeePerformancePlan>,
    @InjectRepository(EmployeePerformancePlanItem)
    private readonly planItemRepository: Repository<EmployeePerformancePlanItem>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(PerformancePeriodAssignment)
    private readonly periodAssignmentRepository: Repository<PerformancePeriodAssignment>,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformancePlanDto,
  ): Promise<EmployeePerformancePlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: {
        id: dto.employee_id,
        company_id: companyId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can receive a performance plan.',
      );
    }

    const financialYear = await this.financialYearRepository.findOne({
      where: {
        id: dto.financial_year_id,
        companyId,
      },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    const totalWeight = dto.items.reduce((sum, item) => sum + item.weight, 0);
    const minimumWeightTotal = this.configService.get<number>(
      'PERFORMANCE_MINIMUM_WEIGHT_TOTAL',
      100,
    );
    const maximumWeightTotal = this.configService.get<number>(
      'PERFORMANCE_MAXIMUM_WEIGHT_TOTAL',
      100,
    );

    if (
      totalWeight < minimumWeightTotal ||
      totalWeight > maximumWeightTotal
    ) {
      throw new BadRequestException(
        `Performance plan KPI weights must total between ${minimumWeightTotal} and ${maximumWeightTotal}. Current total: ${totalWeight}.`,
      );
    }

    const activePlan = await this.planRepository.findOne({
      where: {
        companyId,
        employeeId: employee.id,
        financialYearId: financialYear.id,
        status: PerformancePlanStatusEnum.ACTIVE,
      },
    });

    if (activePlan) {
      throw new ConflictException(
        'An active performance plan already exists for this employee and financial year.',
      );
    }

    const definitionVersions = await this.definitionVersionRepository.find({
      where: {
        id: In(dto.items.map((item) => item.kpi_definition_version_id)),
      },
    });
    const definitionVersionMap = new Map(
      definitionVersions.map((item) => [item.id, item]),
    );

    if (definitionVersions.length !== dto.items.length) {
      throw new NotFoundException(
        'One or more KPI definition versions could not be found.',
      );
    }

    const snapshot = {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      first_name: employee.first_name,
      last_name: employee.last_name,
      branch_id: employee.primary_branch_id,
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      manager_employee_id: dto.manager_employee_id ?? employee.reports_to,
    };
    const snapshotHash = createHash('sha256')
      .update(JSON.stringify({ snapshot, items: dto.items }))
      .digest('hex');

    const plan = await this.planRepository.save(
      this.planRepository.create({
        companyId,
        employeeId: employee.id,
        financialYearId: financialYear.id,
        versionNumber: 1,
        status: PerformancePlanStatusEnum.ACTIVE,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        managerEmployeeId: dto.manager_employee_id ?? employee.reports_to,
        managerCompanyUserId: null,
        employeeSnapshot: snapshot,
        assignmentSnapshotHash: snapshotHash,
        assignedAt: new Date(),
        assignedByCompanyUserId: actor.companyMembershipId ?? null,
        items: dto.items.map((item) => {
          const definitionVersion = definitionVersionMap.get(
            item.kpi_definition_version_id,
          )!;
          return this.planItemRepository.create({
            kpiDefinitionVersionId: definitionVersion.id,
            weight: String(item.weight),
            targetValue:
              item.target_value === undefined ? null : String(item.target_value),
            manualEntryAllowed:
              item.manual_entry_allowed ??
              definitionVersion.manualEntryAllowed,
            evidenceRequired:
              item.evidence_required ?? definitionVersion.evidenceRequired,
            notes: item.notes ?? null,
            kpiSnapshot: {
              kpi_definition_id: definitionVersion.kpiDefinitionId,
              kpi_definition_version_id: definitionVersion.id,
              version_number: definitionVersion.versionNumber,
              measurement_unit: definitionVersion.measurementUnit,
              measurement_direction: definitionVersion.measurementDirection,
              scoring_formula: definitionVersion.scoringFormula,
              formula_configuration: definitionVersion.formulaConfiguration,
              data_source_type: definitionVersion.dataSourceType,
            },
          });
        }),
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PLAN_ASSIGNED,
      actor,
      employeeId: employee.id,
      afterValues: {
        performance_plan_id: plan.id,
        total_weight: totalWeight,
      },
    });

    return this.get(actor, plan.id);
  }

  async createAssignmentsForPeriod(
    actor: AuthenticatedUser,
    performancePeriodId: number,
  ): Promise<PerformancePeriodAssignment[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: performancePeriodId, companyId },
    });

    if (!period) {
      throw new NotFoundException('Performance period not found.');
    }

    const plans = await this.planRepository.find({
      where: {
        companyId,
        financialYearId: period.financialYearId,
        status: PerformancePlanStatusEnum.ACTIVE,
      },
      relations: {
        items: {
          kpiDefinitionVersion: true,
        },
      },
      order: { id: 'ASC' },
    });

    const existingAssignments = await this.periodAssignmentRepository.find({
      where: { performancePeriodId },
    });
    const assignedEmployeeIds = new Set(
      existingAssignments.map((assignment) => assignment.employeeId),
    );

    const createdAssignments: PerformancePeriodAssignment[] = [];

    for (const plan of plans) {
      if (assignedEmployeeIds.has(plan.employeeId)) {
        continue;
      }

      const totalWeight = plan.items.reduce(
        (sum, item) => sum + Number(item.weight),
        0,
      );

      const assignment = await this.periodAssignmentRepository.save(
        this.periodAssignmentRepository.create({
          companyId,
          performancePeriodId: period.id,
          employeeId: plan.employeeId,
          performancePlanId: plan.id,
          managerEmployeeId: plan.managerEmployeeId,
          managerCompanyUserId: plan.managerCompanyUserId,
          status: PerformancePeriodAssignmentStatusEnum.OPEN,
          employeeSnapshot: plan.employeeSnapshot,
          planSnapshot: {
            performance_plan_id: plan.id,
            performance_plan_version_number: plan.versionNumber,
            assignment_snapshot_hash: plan.assignmentSnapshotHash,
          },
          totalWeight: String(totalWeight),
        }),
      );

      const achievements = plan.items.map((item) =>
        this.achievementRepository.create({
          companyId,
          periodAssignmentId: assignment.id,
          planItemId: item.id,
          employeeId: plan.employeeId,
          targetValue: item.targetValue,
          achievementValue: null,
          rawScore: null,
          cappedScore: null,
          weightedScore: null,
          status: KpiAchievementStatusEnum.NOT_STARTED,
          sourceType: item.kpiDefinitionVersion.dataSourceType,
          achievementSnapshot: {
            kpi_snapshot: item.kpiSnapshot,
            weight: item.weight,
            target_value: item.targetValue,
          },
          evidence: null,
        }),
      );

      await this.achievementRepository.save(achievements);
      createdAssignments.push(assignment);
    }

    await this.auditService.log({
      action: PerformanceAuditActionEnum.ASSIGNMENT_CREATED,
      actor,
      afterValues: {
        performance_period_id: period.id,
        created_assignments: createdAssignments.map((assignment) => assignment.id),
      },
    });

    return this.periodAssignmentRepository.find({
      where: { performancePeriodId: period.id },
      order: { id: 'ASC' },
    });
  }

  async list(actor: AuthenticatedUser): Promise<EmployeePerformancePlan[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.planRepository.find({
      where: { companyId },
      relations: { items: true },
      order: { id: 'DESC', items: { id: 'ASC' } },
    });
  }

  async listAssignmentsForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
  ): Promise<PerformancePeriodAssignment[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.periodAssignmentRepository.find({
      where: { companyId, employeeId },
      relations: { performancePeriod: true },
      order: { id: 'DESC' },
    });
  }

  async get(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<EmployeePerformancePlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const plan = await this.planRepository.findOne({
      where: { id, companyId },
      relations: {
        items: {
          kpiDefinitionVersion: true,
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Performance plan not found.');
    }

    return plan;
  }
}
