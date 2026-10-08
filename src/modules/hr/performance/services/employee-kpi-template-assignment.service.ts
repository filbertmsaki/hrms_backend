import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { ApplyKpiTemplateDto } from '../dto/apply-kpi-template.dto';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { KpiTemplate } from '../entities/kpi-template.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
  EmployeeKpiStatusEnum,
} from '../enums/employee-kpi-status.enum';
import { KpiMeasurementDirectionEnum } from '../enums/kpi-measurement-direction.enum';
import { KpiScoringFormulaEnum } from '../enums/kpi-scoring-formula.enum';
import { KpiTemplateStatusEnum } from '../enums/kpi-template-status.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';
import {
  KPI_DOMAIN_EVENTS,
  type KpiAssignmentEvent,
} from '../events/kpi-domain-events';

@Injectable()
export class EmployeeKpiTemplateAssignmentService {
  constructor(
    private readonly access: HrAccessService,
    private readonly audit: PerformanceAuditService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async apply(
    actor: AuthenticatedUser,
    periodId: number,
    dto: ApplyKpiTemplateDto,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!this.access.hasCompanyScope(actor))
      throw new ForbiddenException(
        'Template assignment requires organization scope.',
      );
    const policy = dto.conflict_policy ?? 'MERGE';
    const result = await this.dataSource.transaction(async (manager) => {
      const period = await manager.getRepository(PerformancePeriod).findOne({
        where: { id: periodId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!period) throw new NotFoundException('KPI cycle not found.');
      if (period.kpiPhase !== 'GOAL_SETTING' && period.kpiPhase !== 'REOPENED')
        throw new ConflictException(
          'Template assignments require an open goal-setting cycle.',
        );
      const template = await manager.getRepository(KpiTemplate).findOne({
        where: { id: dto.template_id, companyId },
        relations: {
          items: { kpiDefinitionVersion: { kpiDefinition: true } },
        },
      });
      if (!template) throw new NotFoundException('KPI template not found.');
      if (template.status !== KpiTemplateStatusEnum.ACTIVE)
        throw new ConflictException('KPI template must be active.');
      if (!template.applicableRoleIds?.length)
        throw new BadRequestException(
          'The template needs at least one applicable role.',
        );
      const templateWeight = template.items.reduce(
        (sum, item) => sum.plus(item.weight),
        new Decimal(0),
      );
      if (!templateWeight.eq(100))
        throw new BadRequestException('Template weights must total 100.');
      if (templateWeight.gt(period.maxWeightage))
        throw new BadRequestException(
          'Template weight exceeds the cycle maximum.',
        );
      const employees = await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .innerJoin(
          'company_user_roles',
          'membership_role',
          'membership_role.company_user_id = employee.company_user_id',
        )
        .where('employee.company_id = :companyId', { companyId })
        .andWhere('employee.employment_status = :active', {
          active: EmploymentStatusEnum.ACTIVE,
        })
        .andWhere('membership_role.role_id IN (:...roleIds)', {
          roleIds: template.applicableRoleIds,
        })
        .distinct(true)
        .getMany();
      const summary = {
        matched: employees.length,
        assigned: 0,
        skipped: 0,
        created: 0,
        replaced: 0,
        affected: [] as Array<{
          employeeId: number;
          companyUserId: number | null;
          kpiId: number;
        }>,
      };
      for (const employee of employees) {
        const repository = manager.getRepository(EmployeeKpi);
        const existing = await repository.find({
          where: {
            companyId,
            performancePeriodId: period.id,
            employeeId: employee.id,
          },
        });
        const active = existing.filter(
          (row) => row.status !== EmployeeKpiStatusEnum.REJECTED,
        );
        if (active.length && policy === 'SKIP') {
          summary.skipped++;
          continue;
        }
        const pending =
          policy === 'REPLACE'
            ? template.items
            : template.items.filter(
                (item) =>
                  !active.some(
                    (row) =>
                      row.kpiDefinitionVersionId ===
                        item.kpiDefinitionVersionId ||
                      row.title.trim().toLocaleLowerCase() ===
                        item.kpiDefinitionVersion.kpiDefinition.name
                          .trim()
                          .toLocaleLowerCase(),
                  ),
              );
        if (!pending.length) {
          summary.skipped++;
          continue;
        }
        const currentWeight =
          policy === 'REPLACE'
            ? new Decimal(0)
            : active.reduce((sum, row) => sum.plus(row.weight), new Decimal(0));
        const addedWeight = pending.reduce(
          (sum, item) => sum.plus(item.weight),
          new Decimal(0),
        );
        if (currentWeight.plus(addedWeight).gt(period.maxWeightage))
          throw new BadRequestException(
            `Template merge exceeds the cycle maximum for employee ${employee.employee_no}. Use skip or replace.`,
          );
        if (policy === 'REPLACE') {
          for (const row of active) {
            row.status = EmployeeKpiStatusEnum.REJECTED;
            row.reviewComment = `Replaced by template ${template.code}`;
            await repository.save(row);
            summary.replaced++;
          }
        }
        for (const item of pending) {
          const version = item.kpiDefinitionVersion;
          const created = await repository.save(
            repository.create({
              companyId,
              performancePeriodId: period.id,
              employeeId: employee.id,
              createdByCompanyUserId: actor.companyMembershipId ?? null,
              title: version.kpiDefinition.name,
              description: version.description,
              measurementType: EmployeeKpiMeasurementTypeEnum.NUMBER,
              targetValue: item.targetValue ?? version.defaultTargetValue,
              actualValue: null,
              unit: version.measurementUnit,
              weight: item.weight,
              startDate: period.startDate,
              dueDate: period.endDate,
              progressSource: EmployeeKpiProgressSourceEnum.MANUAL,
              status: EmployeeKpiStatusEnum.APPROVED,
              reviewerEmployeeId: employee.reports_to,
              submittedAt: new Date(),
              reviewedByCompanyUserId: actor.companyMembershipId ?? null,
              reviewedAt: new Date(),
              reviewComment: `Assigned from template ${template.code}`,
              scoringType:
                version.scoringFormula === KpiScoringFormulaEnum.MANUAL_RATING
                  ? 'RATING_SCALE'
                  : 'NUMERIC_TARGET',
              measurementDirection:
                version.measurementDirection ===
                KpiMeasurementDirectionEnum.LOWER_IS_BETTER
                  ? 'LOWER_IS_BETTER'
                  : version.measurementDirection ===
                      KpiMeasurementDirectionEnum.TARGET_MATCH
                    ? 'TARGET_MATCH'
                    : 'HIGHER_IS_BETTER',
              formulaConfig: version.formulaConfiguration,
              sourceTemplateId: template.id,
              kpiDefinitionVersionId: version.id,
            }),
          );
          summary.affected.push({
            employeeId: employee.id,
            companyUserId: employee.company_user_id,
            kpiId: created.id,
          });
          summary.created++;
        }
        summary.assigned++;
      }
      return summary;
    });
    await this.audit.log({
      action: PerformanceAuditActionEnum.EMPLOYEE_KPI_TEMPLATE_APPLIED,
      actor,
      afterValues: {
        period_id: periodId,
        template_id: dto.template_id,
        policy,
        matched: result.matched,
        assigned: result.assigned,
        created: result.created,
        replaced: result.replaced,
      },
    });
    for (const item of result.affected) {
      const payload: KpiAssignmentEvent = {
        companyId,
        cycleId: periodId,
        employeeId: item.employeeId,
        employeeKpiId: item.kpiId,
        occurredAt: new Date().toISOString(),
      };
      this.events.emit(KPI_DOMAIN_EVENTS.ASSIGNED, payload);
      this.events.emit(KPI_DOMAIN_EVENTS.APPROVED, payload);
      this.events.emit(KPI_DOMAIN_EVENTS.LOCKED, payload);
    }
    const receivers = result.affected.filter((item) => item.companyUserId);
    if (receivers.length)
      await this.notifications.createAndPushMany(
        receivers.map((item) => ({
          company_id: companyId,
          receiver_company_user_id: item.companyUserId!,
          type: NotificationTypeEnum.PERFORMANCE_DEADLINE_REMINDER,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'KPI assigned',
          message: 'A KPI was assigned to you from a role template.',
          related_module: 'performance',
          entity_type: 'employee_kpi',
          entity_id: item.kpiId,
          action_url: '/dashboard/me/performance/kpis',
          dedupe_key: `performance:template-assigned:${item.kpiId}`,
        })),
      );
    return {
      matched: result.matched,
      assigned: result.assigned,
      skipped: result.skipped,
      created: result.created,
      replaced: result.replaced,
    };
  }
}
