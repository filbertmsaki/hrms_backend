import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { UpsertKpiAchievementDto } from '../dto/upsert-kpi-achievement.dto';
import { ValidateKpiAchievementDto } from '../dto/validate-kpi-achievement.dto';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceScoringService } from './performance-scoring.service';

@Injectable()
export class KpiAchievementService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly scoringService: PerformanceScoringService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(PerformancePeriodAssignment)
    private readonly assignmentRepository: Repository<PerformancePeriodAssignment>,
  ) {}

  async listForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
  ): Promise<KpiAchievement[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.achievementRepository.find({
      where: { companyId, employeeId },
      relations: {
        planItem: {
          kpiDefinitionVersion: true,
        },
        periodAssignment: {
          performancePeriod: true,
        },
      },
      order: { id: 'DESC' },
    });
  }

  async listForManager(actor: AuthenticatedUser): Promise<KpiAchievement[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      return [];
    }

    return this.achievementRepository
      .createQueryBuilder('achievement')
      .leftJoinAndSelect('achievement.planItem', 'planItem')
      .leftJoinAndSelect(
        'planItem.kpiDefinitionVersion',
        'kpiDefinitionVersion',
      )
      .leftJoinAndSelect('achievement.periodAssignment', 'periodAssignment')
      .leftJoinAndSelect(
        'periodAssignment.performancePeriod',
        'performancePeriod',
      )
      .where('achievement.company_id = :companyId', { companyId })
      .andWhere('periodAssignment.manager_employee_id = :managerEmployeeId', {
        managerEmployeeId: actor.employeeId,
      })
      .orderBy('achievement.id', 'DESC')
      .getMany();
  }

  async employeeUpsert(
    actor: AuthenticatedUser,
    id: number,
    dto: UpsertKpiAchievementDto,
  ): Promise<KpiAchievement> {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee context is required.');
    }

    const achievement = await this.getAchievement(actor.companyId!, id);

    if (achievement.employeeId !== actor.employeeId) {
      throw new ForbiddenException(
        'You can update only your own KPI achievements.',
      );
    }

    const sourceType = achievement.planItem.kpiDefinitionVersion.dataSourceType;
    if (sourceType !== KpiDataSourceTypeEnum.MANUAL_EMPLOYEE) {
      throw new BadRequestException(
        'This KPI achievement is system-derived and cannot be changed by the employee.',
      );
    }

    if (!achievement.planItem.manualEntryAllowed) {
      throw new BadRequestException(
        'Manual entry is not allowed for this KPI achievement.',
      );
    }

    return this.applyAchievementUpdate(achievement, dto, actor, false);
  }

  async managerValidate(
    actor: AuthenticatedUser,
    id: number,
    dto: ValidateKpiAchievementDto,
  ): Promise<KpiAchievement> {
    const achievement = await this.getAchievement(actor.companyId!, id);
    const assignment = achievement.periodAssignment;

    if (actor.employeeId && actor.employeeId === achievement.employeeId) {
      throw new ForbiddenException(
        'Employees cannot validate their own KPI achievements.',
      );
    }

    const managerHasAccess =
      actor.employeeId === assignment.managerEmployeeId ||
      this.hrAccessService.hasCompanyScope(actor);

    if (!managerHasAccess) {
      throw new ForbiddenException(
        'Only the assigned manager or an HR actor with company scope can validate this KPI achievement.',
      );
    }

    if (
      dto.achievement_value !== undefined &&
      !this.configService.get<boolean>(
        'PERFORMANCE_ALLOW_MANAGER_SCORE_OVERRIDE',
        true,
      )
    ) {
      throw new BadRequestException(
        'Manager score overrides are disabled by configuration.',
      );
    }

    if (
      dto.achievement_value !== undefined &&
      this.configService.get<boolean>(
        'PERFORMANCE_REQUIRE_OVERRIDE_REASON',
        true,
      ) &&
      !dto.override_reason?.trim()
    ) {
      throw new BadRequestException(
        'An override reason is required when changing a KPI achievement value.',
      );
    }

    const beforeValues = {
      achievement_value: achievement.achievementValue,
      status: achievement.status,
      weighted_score: achievement.weightedScore,
    };

    if (dto.achievement_value !== undefined) {
      const score = this.scoringService.score({
        formula: achievement.planItem.kpiDefinitionVersion.scoringFormula,
        targetValue:
          achievement.targetValue ??
          achievement.planItem.kpiDefinitionVersion.defaultTargetValue,
        achievementValue: dto.achievement_value,
        weight: achievement.planItem.weight,
        formulaConfiguration:
          achievement.planItem.kpiDefinitionVersion.formulaConfiguration,
      });
      achievement.achievementValue = String(dto.achievement_value);
      achievement.rawScore = score.rawScore;
      achievement.cappedScore = score.cappedScore;
      achievement.weightedScore = score.weightedScore;
      achievement.overrideReason = dto.override_reason?.trim() ?? null;
    }

    achievement.managerComment = dto.manager_comment?.trim() ?? null;
    achievement.managerValidatedAt = new Date();
    achievement.status = dto.submit_for_hr
      ? KpiAchievementStatusEnum.MANAGER_VALIDATED
      : KpiAchievementStatusEnum.DRAFT;

    const saved = await this.achievementRepository.save(achievement);

    if (dto.submit_for_hr) {
      assignment.status = PerformancePeriodAssignmentStatusEnum.HR_REVIEW;
      await this.assignmentRepository.save(assignment);
    }

    await this.auditService.log({
      action: PerformanceAuditActionEnum.ACHIEVEMENT_MANAGER_VALIDATED,
      actor,
      employeeId: saved.employeeId,
      kpiAchievementId: saved.id,
      beforeValues,
      afterValues: {
        achievement_value: saved.achievementValue,
        status: saved.status,
        weighted_score: saved.weightedScore,
      },
      reason: saved.overrideReason,
    });

    return this.getAchievement(actor.companyId!, saved.id);
  }

  private async applyAchievementUpdate(
    achievement: KpiAchievement,
    dto: UpsertKpiAchievementDto,
    actor: AuthenticatedUser,
    systemCalculated: boolean,
  ): Promise<KpiAchievement> {
    if (
      achievement.planItem.evidenceRequired &&
      dto.submit &&
      (!dto.evidence || dto.evidence.length === 0)
    ) {
      throw new BadRequestException(
        'Evidence is required before this KPI achievement can be submitted.',
      );
    }

    const beforeValues = {
      achievement_value: achievement.achievementValue,
      status: achievement.status,
      weighted_score: achievement.weightedScore,
    };

    if (dto.achievement_value !== undefined) {
      const score = this.scoringService.score({
        formula: achievement.planItem.kpiDefinitionVersion.scoringFormula,
        targetValue:
          achievement.targetValue ??
          achievement.planItem.kpiDefinitionVersion.defaultTargetValue,
        achievementValue: dto.achievement_value,
        weight: achievement.planItem.weight,
        formulaConfiguration:
          achievement.planItem.kpiDefinitionVersion.formulaConfiguration,
      });
      achievement.achievementValue = String(dto.achievement_value);
      achievement.rawScore = score.rawScore;
      achievement.cappedScore = score.cappedScore;
      achievement.weightedScore = score.weightedScore;
    }

    achievement.evidence = dto.evidence ?? achievement.evidence;
    achievement.achievementSnapshot = {
      ...(achievement.achievementSnapshot ?? {}),
      metadata: dto.metadata ?? null,
    };
    achievement.submittedAt = dto.submit ? new Date() : achievement.submittedAt;
    achievement.status = systemCalculated
      ? KpiAchievementStatusEnum.SYSTEM_CALCULATED
      : dto.submit
        ? KpiAchievementStatusEnum.EMPLOYEE_SUBMITTED
        : KpiAchievementStatusEnum.DRAFT;

    const saved = await this.achievementRepository.save(achievement);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.ACHIEVEMENT_UPDATED,
      actor,
      employeeId: saved.employeeId,
      kpiAchievementId: saved.id,
      beforeValues,
      afterValues: {
        achievement_value: saved.achievementValue,
        status: saved.status,
        weighted_score: saved.weightedScore,
      },
    });

    return this.getAchievement(actor.companyId!, saved.id);
  }

  private async getAchievement(
    companyId: number,
    id: number,
  ): Promise<KpiAchievement> {
    const achievement = await this.achievementRepository.findOne({
      where: { id, companyId },
      relations: {
        planItem: {
          kpiDefinitionVersion: true,
        },
        periodAssignment: {
          performancePeriod: true,
        },
      },
    });

    if (!achievement) {
      throw new NotFoundException('KPI achievement not found.');
    }

    if (
      achievement.periodAssignment.status ===
        PerformancePeriodAssignmentStatusEnum.PUBLISHED ||
      achievement.periodAssignment.status ===
        PerformancePeriodAssignmentStatusEnum.LOCKED
    ) {
      throw new BadRequestException(
        'Published KPI achievements cannot be edited.',
      );
    }

    return achievement;
  }
}
