import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreateKpiApplicabilityRuleDto } from '../dto/create-kpi-applicability-rule.dto';
import { CreateKpiTemplateDto } from '../dto/create-kpi-template.dto';
import { GeneratePerformancePlanFromRulesDto } from '../dto/generate-performance-plan-from-rules.dto';
import { EmployeePerformancePlan } from '../entities/employee-performance-plan.entity';
import { KpiApplicabilityRule } from '../entities/kpi-applicability-rule.entity';
import { KpiDefinitionVersion } from '../entities/kpi-definition-version.entity';
import { KpiTemplate } from '../entities/kpi-template.entity';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { KpiApplicabilityRuleStatusEnum } from '../enums/kpi-applicability-rule-status.enum';
import { KpiTemplateStatusEnum } from '../enums/kpi-template-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformancePlanService } from './performance-plan.service';

type ResolvedPlanItem = {
  kpi_definition_version_id: number;
  weight: number;
  target_value?: number;
  manual_entry_allowed?: boolean;
  evidence_required?: boolean;
  notes?: string;
};

type ResolvedRuleContext = {
  employee: Employee;
  financialYearId: number;
  reviewCycle?: string;
};

@Injectable()
export class KpiApplicabilityService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly planService: PerformancePlanService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(KpiApplicabilityRule)
    private readonly ruleRepository: Repository<KpiApplicabilityRule>,
    @InjectRepository(KpiTemplate)
    private readonly templateRepository: Repository<KpiTemplate>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly versionRepository: Repository<KpiDefinitionVersion>,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
  ) {}

  async createRule(
    actor: AuthenticatedUser,
    dto: CreateKpiApplicabilityRuleDto,
  ): Promise<KpiApplicabilityRule> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const version = await this.versionRepository.findOne({
      where: { id: dto.kpi_definition_version_id },
    });

    if (!version) {
      throw new NotFoundException('KPI definition version not found.');
    }

    const rule = await this.ruleRepository.save(
      this.ruleRepository.create({
        companyId,
        kpiDefinitionVersionId: dto.kpi_definition_version_id,
        name: dto.name?.trim() ?? null,
        status: KpiApplicabilityRuleStatusEnum.ACTIVE,
        priority: dto.priority ?? 0,
        financialYearId: dto.financial_year_id ?? null,
        branchId: dto.branch_id ?? null,
        departmentId: dto.department_id ?? null,
        positionId: dto.position_id ?? null,
        gradeId: dto.grade_id ?? null,
        employmentType: dto.employment_type?.trim() ?? null,
        employeeId: dto.employee_id ?? null,
        reviewCycle: dto.review_cycle?.trim() ?? null,
        templateCode: dto.template_code?.trim().toUpperCase() ?? null,
        weightOverride:
          dto.weight_override === undefined ? null : String(dto.weight_override),
        targetOverride:
          dto.target_override === undefined ? null : String(dto.target_override),
        metadata: dto.metadata ?? null,
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.APPLICABILITY_RULE_CREATED,
      actor,
      afterValues: {
        kpi_applicability_rule_id: rule.id,
        kpi_definition_version_id: rule.kpiDefinitionVersionId,
      },
    });

    return rule;
  }

  async listRules(actor: AuthenticatedUser): Promise<KpiApplicabilityRule[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.ruleRepository.find({
      where: { companyId },
      order: { priority: 'DESC', id: 'DESC' },
    });
  }

  async createTemplate(
    actor: AuthenticatedUser,
    dto: CreateKpiTemplateDto,
  ): Promise<KpiTemplate> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const versions = await this.versionRepository.find({
      where: {
        id: In(dto.items.map((item) => item.kpi_definition_version_id)),
      },
    });

    if (versions.length !== dto.items.length) {
      throw new NotFoundException(
        'One or more KPI definition versions could not be found.',
      );
    }

    const totalWeight = dto.items.reduce((sum, item) => sum + item.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.001) {
      throw new BadRequestException(
        `Template KPI weights must total 100. Current total: ${totalWeight}.`,
      );
    }

    const template = await this.templateRepository.save(
      this.templateRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        status: KpiTemplateStatusEnum.ACTIVE,
        reviewCycle: dto.review_cycle?.trim() ?? null,
        metadata: dto.metadata ?? null,
        items: dto.items.map((item) => ({
          kpiDefinitionVersionId: item.kpi_definition_version_id,
          weight: String(item.weight),
          targetValue:
            item.target_value === undefined ? null : String(item.target_value),
          manualEntryAllowed: item.manual_entry_allowed ?? true,
          evidenceRequired: item.evidence_required ?? false,
          notes: item.notes ?? null,
        })),
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.TEMPLATE_CREATED,
      actor,
      afterValues: {
        kpi_template_id: template.id,
        code: template.code,
      },
    });

    return this.getTemplate(actor, template.id);
  }

  async listTemplates(actor: AuthenticatedUser): Promise<KpiTemplate[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.templateRepository.find({
      where: { companyId },
      relations: { items: true },
      order: { id: 'DESC', items: { id: 'ASC' } },
    });
  }

  async generatePlanFromRules(
    actor: AuthenticatedUser,
    dto: GeneratePerformancePlanFromRulesDto,
  ): Promise<EmployeePerformancePlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: { id: dto.employee_id, company_id: companyId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const financialYear = await this.financialYearRepository.findOne({
      where: { id: dto.financial_year_id, companyId },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    const items = await this.resolvePlanItems(actor, {
      employee,
      financialYearId: financialYear.id,
      reviewCycle: dto.review_cycle,
    });

    if (items.length === 0) {
      throw new BadRequestException(
        'No KPI applicability rules or templates matched this employee.',
      );
    }

    return this.planService.create(actor, {
      employee_id: employee.id,
      financial_year_id: financialYear.id,
      effective_from: dto.effective_from,
      effective_to: dto.effective_to,
      manager_employee_id: employee.reports_to ?? undefined,
      items,
    });
  }

  private async resolvePlanItems(
    actor: AuthenticatedUser,
    context: ResolvedRuleContext,
  ): Promise<ResolvedPlanItem[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const rules = await this.ruleRepository.find({
      where: {
        companyId,
        status: KpiApplicabilityRuleStatusEnum.ACTIVE,
      },
      order: { priority: 'DESC', id: 'DESC' },
    });

    const matchingRules = rules
      .filter((rule) => this.matches(rule, context))
      .sort((left, right) => {
        const specificityDiff =
          this.specificity(right) - this.specificity(left);
        if (specificityDiff !== 0) {
          return specificityDiff;
        }

        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return right.id - left.id;
      });

    const templateCodes = Array.from(
      new Set(
        matchingRules
          .map((rule) => rule.templateCode)
          .filter((code): code is string => Boolean(code)),
      ),
    );

    const templates = templateCodes.length
      ? await this.templateRepository.find({
          where: {
            companyId,
            code: In(templateCodes),
            status: KpiTemplateStatusEnum.ACTIVE,
          },
          relations: { items: true },
        })
      : [];

    const templateMap = new Map(templates.map((template) => [template.code, template]));
    const resolved = new Map<number, ResolvedPlanItem>();

    for (const rule of matchingRules) {
      if (rule.templateCode) {
        const template = templateMap.get(rule.templateCode);
        for (const item of template?.items ?? []) {
          if (!resolved.has(item.kpiDefinitionVersionId)) {
            resolved.set(item.kpiDefinitionVersionId, {
              kpi_definition_version_id: item.kpiDefinitionVersionId,
              weight: Number(item.weight),
              target_value:
                item.targetValue === null ? undefined : Number(item.targetValue),
              manual_entry_allowed: item.manualEntryAllowed,
              evidence_required: item.evidenceRequired,
              notes: item.notes ?? undefined,
            });
          }
        }
      }

      const existing = resolved.get(rule.kpiDefinitionVersionId);
      const nextItem = existing ?? {
        kpi_definition_version_id: rule.kpiDefinitionVersionId,
        weight: 0,
      };

      if (rule.weightOverride !== null) {
        nextItem.weight = Number(rule.weightOverride);
      }

      if (rule.targetOverride !== null) {
        nextItem.target_value = Number(rule.targetOverride);
      }

      resolved.set(rule.kpiDefinitionVersionId, nextItem);
    }

    const unresolvedItems = Array.from(resolved.values()).filter(
      (item) => item.weight > 0,
    );

    if (unresolvedItems.length === 0 && matchingRules.length > 0) {
      const versions = await this.versionRepository.find({
        where: {
          id: In(matchingRules.map((rule) => rule.kpiDefinitionVersionId)),
        },
      });
      for (const version of versions) {
        resolved.set(version.id, {
          kpi_definition_version_id: version.id,
          weight: 100 / versions.length,
          target_value:
            version.defaultTargetValue === null
              ? undefined
              : Number(version.defaultTargetValue),
          manual_entry_allowed: version.manualEntryAllowed,
          evidence_required: version.evidenceRequired,
        });
      }
    }

    const planItems = Array.from(resolved.values()).filter(
      (item) => item.weight > 0,
    );
    const totalWeight = planItems.reduce((sum, item) => sum + item.weight, 0);
    if (planItems.length > 0 && Math.abs(totalWeight - 100) > 0.001) {
      throw new BadRequestException(
        `Resolved KPI items must total 100. Current total: ${totalWeight}.`,
      );
    }

    return planItems;
  }

  private matches(
    rule: KpiApplicabilityRule,
    context: ResolvedRuleContext,
  ): boolean {
    const employee = context.employee;

    return (
      (rule.financialYearId === null ||
        rule.financialYearId === context.financialYearId) &&
      (rule.branchId === null || rule.branchId === employee.primary_branch_id) &&
      (rule.departmentId === null ||
        rule.departmentId === employee.primary_department_id) &&
      (rule.positionId === null ||
        rule.positionId === employee.primary_position_id) &&
      (rule.gradeId === null || rule.gradeId === employee.grade_id) &&
      (rule.employmentType === null ||
        rule.employmentType === employee.employment_type) &&
      (rule.employeeId === null || rule.employeeId === employee.id) &&
      (rule.reviewCycle === null ||
        rule.reviewCycle === context.reviewCycle)
    );
  }

  private specificity(rule: KpiApplicabilityRule): number {
    return [
      rule.financialYearId,
      rule.branchId,
      rule.departmentId,
      rule.positionId,
      rule.gradeId,
      rule.employmentType,
      rule.employeeId,
      rule.reviewCycle,
      rule.templateCode,
      rule.weightOverride,
      rule.targetOverride,
    ].filter((value) => value !== null).length;
  }

  private async getTemplate(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<KpiTemplate> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const template = await this.templateRepository.findOne({
      where: { id, companyId },
      relations: { items: true },
    });

    if (!template) {
      throw new NotFoundException('KPI template not found.');
    }

    return template;
  }
}
