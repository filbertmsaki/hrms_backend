import { KpiCategoryService } from './kpi-category.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreateKpiDefinitionDto } from '../dto/create-kpi-definition.dto';
import { KpiDefinition } from '../entities/kpi-definition.entity';
import { KpiDefinitionVersion } from '../entities/kpi-definition-version.entity';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceScoringService } from './performance-scoring.service';
import { configuredProviderKey } from './kpi-provider-catalog';

@Injectable()
export class KpiDefinitionService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly scoringService: PerformanceScoringService,
    private readonly auditService: PerformanceAuditService,
    private readonly categoryService: KpiCategoryService,
    @InjectRepository(KpiDefinition)
    private readonly definitionRepository: Repository<KpiDefinition>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly versionRepository: Repository<KpiDefinitionVersion>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreateKpiDefinitionDto,
  ): Promise<KpiDefinition> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.assertSourceExecutable(
      dto.data_source_type,
      dto.data_source_configuration,
    );
    this.scoringService.validateFormulaConfiguration(
      dto.scoring_formula,
      dto.formula_configuration,
    );

    const existing = await this.definitionRepository.findOne({
      where: {
        companyId,
        code: dto.code.trim().toUpperCase(),
      },
    });

    if (existing) {
      throw new ConflictException('KPI code already exists for this company.');
    }

    const definition = await this.definitionRepository.save(
      this.definitionRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        category: await this.categoryService.resolve(actor, dto.category),
        status: 'ACTIVE',
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        kpiDefinitionId: definition.id,
        versionNumber: 1,
        description: dto.description.trim(),
        measurementUnit: dto.measurement_unit.trim(),
        measurementDirection: dto.measurement_direction,
        scoringFormula: dto.scoring_formula,
        formulaConfiguration: dto.formula_configuration ?? null,
        dataSourceType: dto.data_source_type,
        dataSourceConfiguration: dto.data_source_configuration ?? null,
        defaultTargetValue:
          dto.default_target_value === undefined
            ? null
            : String(dto.default_target_value),
        frequency: dto.frequency,
        approvalAuthority: dto.approval_authority ?? 'HR',
        manualEntryAllowed: dto.manual_entry_allowed ?? true,
        evidenceRequired: dto.evidence_required ?? false,
        applicabilitySnapshot: dto.applicability_snapshot ?? null,
      }),
    );

    definition.currentVersionId = version.id;
    await this.definitionRepository.save(definition);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.KPI_CREATED,
      actor,
      afterValues: {
        kpi_definition_id: definition.id,
        kpi_definition_version_id: version.id,
      },
    });

    return this.get(actor, definition.id);
  }

  async createVersion(
    actor: AuthenticatedUser,
    definitionId: number,
    dto: CreateKpiDefinitionDto,
  ): Promise<KpiDefinition> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.assertSourceExecutable(
      dto.data_source_type,
      dto.data_source_configuration,
    );
    this.scoringService.validateFormulaConfiguration(
      dto.scoring_formula,
      dto.formula_configuration,
    );

    const definition = await this.definitionRepository.findOne({
      where: { id: definitionId, companyId },
    });

    if (!definition) {
      throw new NotFoundException('KPI definition not found.');
    }

    const latestVersion = await this.versionRepository.findOne({
      where: { kpiDefinitionId: definition.id },
      order: { versionNumber: 'DESC' },
    });

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        kpiDefinitionId: definition.id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        description: dto.description.trim(),
        measurementUnit: dto.measurement_unit.trim(),
        measurementDirection: dto.measurement_direction,
        scoringFormula: dto.scoring_formula,
        formulaConfiguration: dto.formula_configuration ?? null,
        dataSourceType: dto.data_source_type,
        dataSourceConfiguration: dto.data_source_configuration ?? null,
        defaultTargetValue:
          dto.default_target_value === undefined
            ? null
            : String(dto.default_target_value),
        frequency: dto.frequency,
        approvalAuthority: dto.approval_authority ?? 'HR',
        manualEntryAllowed: dto.manual_entry_allowed ?? true,
        evidenceRequired: dto.evidence_required ?? false,
        applicabilitySnapshot: dto.applicability_snapshot ?? null,
      }),
    );

    definition.currentVersionId = version.id;
    if (dto.name?.trim()) {
      definition.name = dto.name.trim();
    }
    if (dto.category !== undefined) {
      definition.category = await this.categoryService.resolve(
        actor,
        dto.category,
      );
    }
    await this.definitionRepository.save(definition);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.KPI_VERSION_CREATED,
      actor,
      afterValues: {
        kpi_definition_id: definition.id,
        kpi_definition_version_id: version.id,
        version_number: version.versionNumber,
      },
    });

    return this.get(actor, definition.id);
  }

  private assertSourceExecutable(
    sourceType: KpiDataSourceTypeEnum,
    configuration?: Record<string, unknown>,
  ): void {
    if (sourceType === KpiDataSourceTypeEnum.EXTERNAL_API) {
      throw new ConflictException(
        `KPI data source ${sourceType} is not available until its provider and validation workflow are configured.`,
      );
    }

    if (
      sourceType === KpiDataSourceTypeEnum.SYSTEM_CALCULATION &&
      !configuredProviderKey(sourceType, configuration)
    ) {
      throw new ConflictException(
        'SYSTEM_CALCULATION requires a configured, supported internal provider_key.',
      );
    }

    if (
      [
        KpiDataSourceTypeEnum.ATTENDANCE,
        KpiDataSourceTypeEnum.LEAVE,
        KpiDataSourceTypeEnum.DAILY_ACTIVITY,
        KpiDataSourceTypeEnum.FIELD_VISIT,
      ].includes(sourceType) &&
      configuration?.provider_key !== undefined &&
      !configuredProviderKey(sourceType, configuration)
    ) {
      throw new ConflictException(
        `KPI data source ${sourceType} does not support the configured provider_key.`,
      );
    }
  }

  async get(actor: AuthenticatedUser, id: number): Promise<KpiDefinition> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const definition = await this.definitionRepository.findOne({
      where: { id, companyId },
      relations: { versions: true },
      order: { versions: { versionNumber: 'DESC' } },
    });

    if (!definition) {
      throw new NotFoundException('KPI definition not found.');
    }

    return definition;
  }

  async list(actor: AuthenticatedUser): Promise<KpiDefinition[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.definitionRepository.find({
      where: { companyId, status: 'ACTIVE' },
      relations: { versions: true },
      order: { id: 'DESC', versions: { versionNumber: 'DESC' } },
    });
  }

  /**
   * KPI definitions are referenced by templates and performance plans, so a
   * hard delete would break historical records. DELETE therefore archives the
   * definition and leaves its versions intact for audit/history purposes.
   */
  async archive(actor: AuthenticatedUser, id: number): Promise<KpiDefinition> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const definition = await this.definitionRepository.findOne({
      where: { id, companyId },
      relations: { versions: true },
    });

    if (!definition) {
      throw new NotFoundException('KPI definition not found.');
    }
    if (definition.status !== 'ACTIVE') {
      return definition;
    }

    definition.status = 'INACTIVE';
    const saved = await this.definitionRepository.save(definition);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.KPI_ARCHIVED,
      actor,
      beforeValues: { kpi_definition_id: definition.id, status: 'ACTIVE' },
      afterValues: { kpi_definition_id: saved.id, status: saved.status },
    });
    return saved;
  }
}
