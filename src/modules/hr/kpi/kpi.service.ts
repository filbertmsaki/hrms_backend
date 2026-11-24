import { hasPermission } from '../../../common/utils/permission.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { User } from '../../users/entities/user.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { KpiPeriodNotificationService } from './kpi-period-notification.service';
import { KpiAssignmentNotificationService } from './kpi-assignment-notification.service';
import { ScorecardTemplate } from './scorecard.entities';
import {
  AssignmentDto,
  AssignmentUpdateDto,
  DefinitionDto,
  PeriodDto,
  PeriodTimezoneDto,
  TargetRevisionDto,
  TemplateDto,
} from './dto/kpi.dto';
import {
  KpiAssignment,
  KpiDefinition,
  KpiDefinitionVersion,
  KpiPeriod,
  KpiTargetRevision,
  KpiTemplate,
  KpiSubject,
} from './kpi.entities';
import {
  validateMeasurement,
  validatePeriod,
  validateTarget,
} from './kpi-policy';

const administrators = ['COMPANY_ADMIN', 'HR_MANAGER'];
const assigners = [...administrators, 'DEPARTMENT_MANAGER', 'BRANCH_MANAGER'];
const readers = [...assigners, 'MANAGEMENT'];

@Injectable()
export class KpiService {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(KpiDefinition)
    private readonly definitions: Repository<KpiDefinition>,
    @InjectRepository(KpiDefinitionVersion)
    private readonly versions: Repository<KpiDefinitionVersion>,
    @InjectRepository(KpiTemplate)
    private readonly templates: Repository<KpiTemplate>,
    @InjectRepository(KpiPeriod)
    private readonly periods: Repository<KpiPeriod>,
    @InjectRepository(KpiAssignment)
    private readonly assignments: Repository<KpiAssignment>,
    @InjectRepository(KpiTargetRevision)
    private readonly targets: Repository<KpiTargetRevision>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly access: HrAccessService,
    private readonly periodNotifications: KpiPeriodNotificationService,
    private readonly assignmentNotifications: KpiAssignmentNotificationService,
  ) {}

  private company(actor: AuthenticatedUser): number {
    return this.access.ensureActorCompanyId(actor);
  }
  private requireRole(actor: AuthenticatedUser, roles: string[]): void {
    if (!roles.some((role) => actor.roles.includes(role)))
      throw new ForbiddenException('KPI access denied');
    if (
      actor.roles.includes('MANAGEMENT') &&
      !actor.roles.some((role) => assigners.includes(role)) &&
      !this.access.hasCompanyScope(actor)
    )
      throw new ForbiddenException('Company KPI scope is required');
  }
  private requireAssignmentPermission(
    actor: AuthenticatedUser,
    permission: string,
  ): void {
    if (actor.roles.some((role) => assigners.includes(role))) return;
    if (
      hasPermission(actor.permissions, permission) &&
      (this.access.hasCompanyScope(actor) ||
        this.access.hasBranchScope(actor) ||
        this.access.hasDepartmentScope(actor) ||
        this.access.hasTeamScope(actor))
    )
      return;
    throw new ForbiddenException('KPI assignment permission required');
  }
  private requireAssignmentRead(actor: AuthenticatedUser): void {
    if (
      actor.roles.some((role) => readers.includes(role)) ||
      [
        'kpi_assignments:read',
        'kpi_assignments:create',
        'kpi_assignments:update',
        'kpi_targets:revise',
      ].some((permission) => hasPermission(actor.permissions, permission))
    )
      return;
    throw new ForbiddenException('KPI assignment read permission required');
  }
  private requireCompanyWrite(actor: AuthenticatedUser): void {
    this.requireRole(actor, administrators);
    if (!this.access.hasCompanyScope(actor))
      throw new ForbiddenException('Company KPI scope is required');
  }
  private canManageDefinitions(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.some((role) => assigners.includes(role)) ||
      hasPermission(actor.permissions, 'kpi_definitions:create')
    );
  }
  private requireDefinitionWrite(actor: AuthenticatedUser): void {
    this.company(actor);
    if (!this.canManageDefinitions(actor))
      throw new ForbiddenException('KPI creation access is required');
  }
  private requireDefinitionRead(actor: AuthenticatedUser): void {
    if (this.canManageDefinitions(actor)) return;
    this.requireAssignmentRead(actor);
  }
  private async owner(
    companyId: number,
    employeeId?: number,
  ): Promise<number | null> {
    if (!employeeId) return null;
    const employee = await this.employees.findOneBy({
      id: employeeId,
      company_id: companyId,
    });
    if (!employee)
      throw new BadRequestException('Owner does not belong to active company');
    return employeeId;
  }
  private normalizeCode(code: string): string {
    const normalized = code?.trim().toUpperCase();
    if (!normalized || !/^[A-Z][A-Z0-9_-]{1,79}$/.test(normalized))
      throw new BadRequestException(
        'KPI identifier must use 2–80 letters, digits, _ or -',
      );
    return normalized;
  }
  private versionPayload(
    dto: DefinitionDto,
    ownerEmployeeId: number | null,
    includePreferredPeriod = true,
  ) {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      category: dto.category.trim(),
      strategicObjective: dto.strategicObjective?.trim() || null,
      measurementType: dto.measurementType,
      measurementUnit: dto.measurementUnit?.trim() || null,
      direction: dto.direction,
      frequency: dto.frequency,
      ...(includePreferredPeriod
        ? { preferredPeriodId: dto.preferredPeriodId ?? null }
        : {}),
      ownerEmployeeId,
    };
  }
  private async validatePreferredPeriod(
    companyId: number,
    dto: Pick<DefinitionDto, 'frequency' | 'preferredPeriodId'>,
  ) {
    if (!dto.preferredPeriodId) return;
    const period = await this.periods.findOneBy({
      id: dto.preferredPeriodId,
      companyId,
    });
    if (!period || period.frequency !== dto.frequency)
      throw new BadRequestException(
        'Select a reporting period matching the KPI frequency',
      );
  }
  async createDefinition(actor: AuthenticatedUser, dto: DefinitionDto) {
    this.requireDefinitionWrite(actor);
    const companyId = this.company(actor);
    await this.validatePreferredPeriod(companyId, dto);
    validateMeasurement(
      dto.measurementType,
      dto.measurementUnit,
      dto.direction,
    );
    const ownerEmployeeId = await this.owner(companyId, dto.ownerEmployeeId);
    const code = this.normalizeCode(dto.code);
    try {
      return await this.db.transaction(async (manager) => {
        const definition = await manager.save(
          KpiDefinition,
          manager.create(KpiDefinition, {
            companyId,
            code,
            status: 'draft',
            createdBy: actor.id,
          }),
        );
        const version = await manager.save(
          KpiDefinitionVersion,
          manager.create(KpiDefinitionVersion, {
            ...this.versionPayload(dto, ownerEmployeeId),
            companyId,
            definitionId: definition.id,
            version: 1,
            createdBy: actor.id,
          }),
        );
        return { ...definition, currentVersion: version };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('KPI identifier already exists');
      throw error;
    }
  }
  async listDefinitions(
    actor: AuthenticatedUser,
    search?: string,
    scope?: string,
  ) {
    this.requireDefinitionRead(actor);
    const companyId = this.company(actor);
    const qb = this.definitions
      .createQueryBuilder('d')
      .where('d.companyId = :companyId', { companyId })
      .orderBy('d.updatedAt', 'DESC')
      .take(100);
    const canSeeAll =
      actor.roles.some((role) =>
        ['COMPANY_ADMIN', 'MANAGEMENT'].includes(role),
      ) && this.access.hasCompanyScope(actor);
    if (
      scope === 'assignment' &&
      actor.roles.some((role) => assigners.includes(role))
    ) {
      qb.andWhere("d.status = 'published'");
    } else if (!canSeeAll) {
      qb.andWhere('d.createdBy = :creatorId', { creatorId: actor.id });
    }
    if (
      !actor.roles.some((role) => readers.includes(role)) &&
      !this.canManageDefinitions(actor)
    )
      qb.andWhere("d.status = 'published'");
    if (search)
      qb.andWhere(
        '(d.code ILIKE :term OR EXISTS (SELECT 1 FROM phase1a_kpi_definition_versions v WHERE v.definition_id = d.id AND v.name ILIKE :term))',
        { term: `%${search.slice(0, 80)}%` },
      );
    const rows = await qb.getMany();
    return Promise.all(
      rows.map(async (row) => {
        const history = await this.versions.find({
          where: { companyId, definitionId: row.id },
          order: { version: 'DESC' },
        });
        return {
          ...row,
          currentVersion:
            history.find((version) => version.publishedAt) ??
            history[0] ??
            null,
          draftVersion:
            (canSeeAll || row.createdBy === actor.id) &&
            (actor.roles.some((role) => readers.includes(role)) ||
              this.canManageDefinitions(actor))
              ? (history.find((version) => !version.publishedAt) ?? null)
              : null,
        };
      }),
    );
  }
  async getDefinition(actor: AuthenticatedUser, id: number) {
    this.requireDefinitionRead(actor);
    const companyId = this.company(actor);
    const definition = await this.definitions.findOneBy({ id, companyId });
    const canSeeAll =
      actor.roles.some((role) =>
        ['COMPANY_ADMIN', 'MANAGEMENT'].includes(role),
      ) && this.access.hasCompanyScope(actor);
    if (definition && !canSeeAll && definition.createdBy !== actor.id)
      throw new ForbiddenException('KPI definition belongs to another creator');
    if (
      definition &&
      !actor.roles.some((role) => readers.includes(role)) &&
      !this.canManageDefinitions(actor) &&
      definition.status !== 'published'
    )
      throw new ForbiddenException('Published KPI required');
    if (!definition) throw new NotFoundException('KPI definition not found');
    return {
      ...definition,
      versions: (
        await this.versions.find({
          where: { companyId, definitionId: id },
          order: { version: 'DESC' },
        })
      ).filter(
        (version) =>
          actor.roles.some((role) => readers.includes(role)) ||
          this.canManageDefinitions(actor) ||
          !!version.publishedAt,
      ),
    };
  }
  async updateDraft(actor: AuthenticatedUser, id: number, dto: DefinitionDto) {
    this.requireDefinitionWrite(actor);
    const definition = await this.getDefinition(actor, id);
    await this.validatePreferredPeriod(definition.companyId, dto);
    if (definition.status === 'archived')
      throw new ConflictException('Archived KPI cannot be edited');
    const draft = definition.versions[0];
    if (!draft || draft.publishedAt)
      throw new ConflictException(
        'Published version is immutable; create a new draft revision',
      );
    validateMeasurement(
      dto.measurementType,
      dto.measurementUnit,
      dto.direction,
    );
    const ownerEmployeeId = await this.owner(
      this.company(actor),
      dto.ownerEmployeeId,
    );
    const code = this.normalizeCode(dto.code);
    if (code !== definition.code)
      throw new ConflictException(
        'KPI identifier cannot change after creation',
      );
    const result = await this.versions.update(
      { id: draft.id, companyId: definition.companyId, publishedAt: IsNull() },
      this.versionPayload(dto, ownerEmployeeId),
    );
    if (!result.affected)
      throw new ConflictException('Draft was published while being edited');
    return this.getDefinition(actor, id);
  }
  async createRevision(actor: AuthenticatedUser, id: number) {
    this.requireDefinitionWrite(actor);
    const definition = await this.getDefinition(actor, id);
    if (definition.status === 'archived')
      throw new ConflictException('Archived KPI cannot be revised');
    const latest = definition.versions[0];
    if (!latest?.publishedAt)
      throw new ConflictException('Current version is already a draft');
    const revision = await this.versions.save(
      this.versions.create({
        companyId: latest.companyId,
        definitionId: latest.definitionId,
        version: latest.version + 1,
        name: latest.name,
        description: latest.description,
        category: latest.category,
        strategicObjective: latest.strategicObjective,
        measurementType: latest.measurementType,
        measurementUnit: latest.measurementUnit,
        direction: latest.direction,
        frequency: latest.frequency,
        preferredPeriodId: latest.preferredPeriodId,
        ownerEmployeeId: latest.ownerEmployeeId,
        publishedAt: null,
        createdBy: actor.id,
      }),
    );
    return revision;
  }
  async publishDefinition(actor: AuthenticatedUser, id: number) {
    this.requireDefinitionWrite(actor);
    const definition = await this.getDefinition(actor, id);
    if (definition.status === 'archived')
      throw new ConflictException('Archived KPI cannot be published');
    const draft = definition.versions[0];
    if (!draft || draft.publishedAt)
      throw new ConflictException('No draft version to publish');
    if (!draft.preferredPeriodId)
      throw new BadRequestException(
        'Select a reporting period in the draft before publishing',
      );
    await this.validatePreferredPeriod(definition.companyId, {
      frequency: draft.frequency,
      preferredPeriodId: draft.preferredPeriodId,
    });
    const result = await this.versions.update(
      { id: draft.id, publishedAt: IsNull() },
      { publishedAt: new Date() },
    );
    if (!result.affected)
      throw new ConflictException('Draft was already published');
    await this.definitions.update(
      { id, companyId: definition.companyId },
      { status: 'published' },
    );
    return this.getDefinition(actor, id);
  }
  async archiveDefinition(actor: AuthenticatedUser, id: number) {
    this.requireCompanyWrite(actor);
    const definition = await this.getDefinition(actor, id);
    if (definition.status === 'archived') return definition;
    await this.definitions.update(
      { id, companyId: definition.companyId },
      { status: 'archived' },
    );
    return this.getDefinition(actor, id);
  }
  async deleteUnassignedDefinition(actor: AuthenticatedUser, id: number) {
    this.requireDefinitionWrite(actor);
    const definition = await this.getDefinition(actor, id);
    const versionIds = definition.versions.map((version) => version.id);
    if (
      versionIds.length &&
      (await this.assignments.count({
        where: {
          companyId: definition.companyId,
          definitionVersionId: In(versionIds),
        },
      }))
    )
      throw new ConflictException(
        'Assigned KPIs cannot be deleted; archive this definition instead',
      );
    const templateReference = await this.db
      .getRepository(ScorecardTemplate)
      .createQueryBuilder('template')
      .where('template.companyId = :companyId', {
        companyId: definition.companyId,
      })
      .andWhere('template.items @> :item::jsonb', {
        item: JSON.stringify([{ definitionId: id }]),
      })
      .getExists();
    if (templateReference)
      throw new ConflictException(
        'This KPI is used by a scorecard template; remove it from the template before deleting',
      );
    await this.db.transaction(async (manager) => {
      await manager.delete(KpiDefinitionVersion, {
        companyId: definition.companyId,
        definitionId: id,
      });
      await manager.delete(KpiDefinition, {
        companyId: definition.companyId,
        id,
      });
    });
    return { deleted: true, id };
  }
  async createTemplate(actor: AuthenticatedUser, dto: TemplateDto) {
    this.requireCompanyWrite(actor);
    validateMeasurement(
      dto.measurementType,
      dto.measurementUnit,
      dto.direction,
    );
    try {
      return await this.templates.save(
        this.templates.create({
          ...this.versionPayload(dto, null, false),
          companyId: this.company(actor),
          code: this.normalizeCode(dto.code),
          departmentClassification:
            dto.departmentClassification?.trim() || null,
          status: 'draft',
          createdBy: actor.id,
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Template identifier already exists');
      throw error;
    }
  }
  async listTemplates(
    actor: AuthenticatedUser,
    search?: string,
    status?: 'draft' | 'published',
  ) {
    this.requireRole(actor, readers);
    const qb = this.templates
      .createQueryBuilder('t')
      .where('t.companyId = :companyId', { companyId: this.company(actor) })
      .orderBy('t.updatedAt', 'DESC')
      .take(100);
    if (search)
      qb.andWhere('(t.code ILIKE :term OR t.name ILIKE :term)', {
        term: `%${search.slice(0, 80)}%`,
      });
    if (status) qb.andWhere('t.status = :status', { status });
    return qb.getMany();
  }
  async updateTemplate(actor: AuthenticatedUser, id: number, dto: TemplateDto) {
    this.requireCompanyWrite(actor);
    const template = await this.templates.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!template) throw new NotFoundException('KPI template not found');
    if (template.status !== 'draft')
      throw new ConflictException('Published template is immutable');
    validateMeasurement(
      dto.measurementType,
      dto.measurementUnit,
      dto.direction,
    );
    try {
      const result = await this.templates.update(
        { id, companyId: template.companyId, status: 'draft' },
        {
          ...this.versionPayload(dto, null, false),
          code: this.normalizeCode(dto.code),
          departmentClassification:
            dto.departmentClassification?.trim() || null,
        },
      );
      if (!result.affected)
        throw new ConflictException(
          'Template was published while being edited',
        );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Template identifier already exists');
      throw error;
    }
    return this.templates.findOneBy({ id, companyId: template.companyId });
  }
  async publishTemplate(actor: AuthenticatedUser, id: number) {
    this.requireCompanyWrite(actor);
    const result = await this.templates.update(
      { id, companyId: this.company(actor), status: 'draft' },
      { status: 'published' },
    );
    if (!result.affected)
      throw new ConflictException('Draft template not found');
    return this.templates.findOneBy({ id, companyId: this.company(actor) });
  }
  async createFromTemplate(
    actor: AuthenticatedUser,
    id: number,
    code: string,
    preferredPeriodId?: number,
  ) {
    this.requireCompanyWrite(actor);
    const template = await this.templates.findOneBy({
      id,
      companyId: this.company(actor),
      status: 'published',
    });
    if (!template) throw new NotFoundException('Published template not found');
    return this.createDefinition(actor, {
      code,
      name: template.name,
      description: template.description ?? undefined,
      category: template.category,
      strategicObjective: template.strategicObjective ?? undefined,
      measurementType: template.measurementType,
      measurementUnit: template.measurementUnit ?? undefined,
      direction: template.direction,
      frequency: template.frequency,
      preferredPeriodId,
    });
  }
  async createPeriod(actor: AuthenticatedUser, dto: PeriodDto) {
    this.requireCompanyWrite(actor);
    validatePeriod(dto.startDate, dto.endDate);
    const company = await this.companies.findOneBy({ id: this.company(actor) });
    const timezone = this.validateTimezone(
      dto.timezone ??
        (typeof company?.metadata?.timezone === 'string'
          ? company.metadata.timezone
          : process.env.APP_TIMEZONE || 'Africa/Dar_es_Salaam'),
    );
    try {
      const period = await this.periods.save(
        this.periods.create({
          ...dto,
          timezone,
          companyId: this.company(actor),
          createdBy: actor.id,
        }),
      );
      // The period is committed; do not hold the create response while every
      // employee notification is queued.
      void this.periodNotifications.broadcast(period).catch(() => undefined);
      return period;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Reporting period already exists');
      throw error;
    }
  }
  async setPeriodTimezone(
    actor: AuthenticatedUser,
    id: number,
    dto: PeriodTimezoneDto,
  ) {
    this.requireCompanyWrite(actor);
    const period = await this.periods.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!period) throw new NotFoundException('Reporting period not found');
    period.timezone = this.validateTimezone(dto.timezone);
    return this.periods.save(period);
  }
  private validateTimezone(value: string | undefined): string {
    const timezone = value?.trim();
    if (!timezone) throw new BadRequestException('Time zone is required');
    try {
      return new Intl.DateTimeFormat('en', {
        timeZone: timezone,
      }).resolvedOptions().timeZone;
    } catch {
      throw new BadRequestException('Enter a valid IANA time zone');
    }
  }
  async listPeriods(actor: AuthenticatedUser) {
    this.requireDefinitionRead(actor);
    return this.periods.find({
      where: { companyId: this.company(actor) },
      order: { startDate: 'DESC' },
      take: 100,
    });
  }
  private async subject(
    actor: AuthenticatedUser,
    type: KpiSubject,
    id: number,
  ) {
    const companyId = this.company(actor);
    const companyWriter = actor.roles.some((role) =>
      administrators.includes(role),
    );
    const departmentManager =
      actor.roles.includes('DEPARTMENT_MANAGER') && !companyWriter;
    const branchManager =
      actor.roles.includes('BRANCH_MANAGER') && !companyWriter;
    if (type === 'employee' || type === 'manager_group') {
      const employee = await this.employees.findOneBy({
        id,
        company_id: companyId,
      });
      if (!employee)
        throw new BadRequestException(
          'Employee does not belong to active company',
        );
      if (type === 'manager_group' && !companyWriter && id !== actor.employeeId)
        throw new ForbiddenException(
          'Only your reporting group can be assigned',
        );
      if (type === 'employee') {
        const accessible = await this.access.getAccessibleEmployeeIds(actor);
        if (accessible !== null && !accessible.includes(id))
          throw new ForbiddenException('Employee outside authorized scope');
        if (departmentManager) {
          const departments =
            await this.access.getAccessibleDepartmentIds(actor);
          if (
            !employee.primary_department_id ||
            !departments?.includes(employee.primary_department_id)
          )
            throw new ForbiddenException(
              'Employee outside authorized department',
            );
        }
        if (branchManager) {
          const branches = await this.access.getAccessibleBranchIds(actor);
          if (
            !employee.primary_branch_id ||
            !branches?.includes(employee.primary_branch_id)
          )
            throw new ForbiddenException('Employee outside authorized branch');
        }
      }
      const reportingRows: Array<{ id: number | string }> =
        type === 'manager_group'
          ? await this.employees.manager.query(
              `WITH RECURSIVE reports(id) AS (
              SELECT id FROM employees WHERE company_id = $1 AND reports_to = $2
              UNION
              SELECT child.id FROM employees child JOIN reports parent ON child.reports_to = parent.id WHERE child.company_id = $1
            ) SELECT id FROM reports WHERE id <> $2`,
              [companyId, id],
            )
          : [];
      const reportingGroup =
        type === 'manager_group'
          ? reportingRows.map((row) => Number(row.id))
          : undefined;
      if (reportingGroup && !companyWriter) {
        const accessible = await this.access.getAccessibleEmployeeIds(actor);
        if (
          !accessible ||
          reportingGroup.some((reportId) => !accessible.includes(reportId))
        )
          throw new ForbiddenException(
            'Reporting group exceeds authorized scope',
          );
      }
      return {
        employeeId: employee.id,
        departmentId: employee.primary_department_id,
        branchId: employee.primary_branch_id,
        managerEmployeeId: employee.reports_to,
        ...(reportingGroup ? { reportingEmployeeIds: reportingGroup } : {}),
      };
    }
    if (type === 'department') {
      if (branchManager)
        throw new ForbiddenException(
          'Branch manager cannot manage department KPI',
        );
      const department = await this.departments.findOneBy({
        id,
        company_id: companyId,
      });
      if (!department)
        throw new BadRequestException(
          'Department does not belong to active company',
        );
      const allowed = await this.access.getAccessibleDepartmentIds(actor);
      if (!companyWriter && !allowed?.includes(id))
        throw new ForbiddenException('Department outside authorized scope');
      return {
        departmentId: id,
        branchId: department.branch_id,
        managerEmployeeId: department.manager_employee_id,
      };
    }
    if (departmentManager)
      throw new ForbiddenException(
        'Department manager cannot manage branch KPI',
      );
    const branch = await this.branches.findOneBy({ id, company_id: companyId });
    if (!branch)
      throw new BadRequestException('Branch does not belong to active company');
    const allowed = await this.access.getAccessibleBranchIds(actor);
    if (!companyWriter && !allowed?.includes(id))
      throw new ForbiddenException('Branch outside authorized scope');
    return { branchId: id };
  }
  // Reuse the Phase 1A organization and manager scope checks for scorecards.
  async scorecardSubject(
    actor: AuthenticatedUser,
    type: KpiSubject,
    id: number,
  ) {
    return this.subject(actor, type, id);
  }
  private async assertAssignmentScope(
    actor: AuthenticatedUser,
    assignment: KpiAssignment,
  ): Promise<void> {
    if (assignment.companyId !== this.company(actor))
      throw new NotFoundException('KPI assignment not found');
    if (
      actor.roles.some((role) =>
        [...administrators, 'MANAGEMENT'].includes(role),
      ) &&
      this.access.hasCompanyScope(actor)
    )
      return;
    const responsibleManagerId =
      assignment.managerEmployeeId ??
      Number(assignment.organizationSnapshot?.managerEmployeeId);
    if (
      assignment.subjectType === 'employee' &&
      actor.employeeId &&
      actor.employeeId === responsibleManagerId &&
      actor.roles.some((role) =>
        ['DEPARTMENT_MANAGER', 'BRANCH_MANAGER'].includes(role),
      )
    )
      return;
    await this.subject(actor, assignment.subjectType, assignment.subjectId);
  }
  async createAssignment(actor: AuthenticatedUser, dto: AssignmentDto) {
    this.requireAssignmentPermission(actor, 'kpi_assignments:create');
    const companyId = this.company(actor);
    if (
      actor.roles.some((role) => administrators.includes(role)) &&
      !this.access.hasCompanyScope(actor)
    )
      throw new ForbiddenException('Company KPI scope is required');
    if (
      actor.roles.includes('DEPARTMENT_MANAGER') &&
      !actor.roles.some((r) => administrators.includes(r)) &&
      dto.subjectType === 'branch'
    )
      throw new ForbiddenException(
        'Department manager cannot assign branch KPI',
      );
    if (
      actor.roles.includes('BRANCH_MANAGER') &&
      !actor.roles.some((r) => administrators.includes(r)) &&
      dto.subjectType === 'department'
    )
      throw new ForbiddenException(
        'Branch manager cannot assign department KPI',
      );
    const definition = await this.definitions.findOneBy({
      id: dto.definitionId,
      companyId,
      status: 'published',
    });
    if (!definition)
      throw new BadRequestException('Published KPI definition required');
    const published = await this.versions
      .createQueryBuilder('v')
      .where(
        'v.companyId = :companyId AND v.definitionId = :definitionId AND v.publishedAt IS NOT NULL',
        { companyId, definitionId: definition.id },
      )
      .orderBy('v.version', 'DESC')
      .getOne();
    if (!published)
      throw new BadRequestException('Published KPI version required');
    const period = await this.periods.findOneBy({
      id: dto.periodId,
      companyId,
    });
    if (!period || period.frequency !== published.frequency)
      throw new BadRequestException(
        'Reporting period does not match KPI frequency',
      );
    if (
      !actor.roles.some((role) => assigners.includes(role)) &&
      dto.subjectType === 'employee' &&
      dto.subjectId === actor.employeeId
    )
      throw new ForbiddenException('Cannot assign a KPI to yourself');
    const snapshot = await this.subject(actor, dto.subjectType, dto.subjectId);
    const reportingManagerId = (
      snapshot as { managerEmployeeId?: number | null }
    ).managerEmployeeId;
    const responsibleManagerId =
      dto.managerEmployeeId ??
      reportingManagerId ??
      (actor.roles.some((role) => administrators.includes(role))
        ? null
        : actor.employeeId);
    if (dto.subjectType === 'employee' && !responsibleManagerId)
      throw new BadRequestException(
        'Choose a responsible manager for this employee KPI',
      );
    if (responsibleManagerId) await this.owner(companyId, responsibleManagerId);
    validateTarget(published.measurementType, published.direction, dto.target);
    const result = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `kpi:${companyId}:${definition.id}:${dto.subjectType}:${dto.subjectId}`,
      ]);
      const overlap = await manager
        .getRepository(KpiAssignment)
        .createQueryBuilder('a')
        .innerJoin(KpiPeriod, 'p', 'p.id = a.periodId')
        .innerJoin(KpiDefinitionVersion, 'v', 'v.id = a.definitionVersionId')
        .where(
          'a.companyId = :companyId AND v.definition_id = :definitionId AND a.subjectType = :subjectType AND a.subjectId = :subjectId AND a.status = :status',
          {
            companyId,
            definitionId: definition.id,
            subjectType: dto.subjectType,
            subjectId: dto.subjectId,
            status: 'active',
          },
        )
        .andWhere('p.start_date <= :endDate AND p.end_date >= :startDate', {
          startDate: period.startDate,
          endDate: period.endDate,
        })
        .getOne();
      if (overlap)
        throw new ConflictException(
          'Active KPI assignment overlaps this period',
        );
      const assignment = await manager.save(
        KpiAssignment,
        manager.create(KpiAssignment, {
          companyId,
          definitionVersionId: published.id,
          periodId: period.id,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          managerEmployeeId: responsibleManagerId ?? null,
          organizationSnapshot: snapshot,
          status: 'active',
          createdBy: actor.id,
        }),
      );
      const target = await manager.save(
        KpiTargetRevision,
        manager.create(KpiTargetRevision, {
          companyId,
          assignmentId: assignment.id,
          revision: 1,
          target: dto.target,
          reason: 'Initial target',
          changedBy: actor.id,
        }),
      );
      return {
        ...assignment,
        definitionVersion: published,
        period,
        currentTarget: target,
      };
    });
    if (dto.subjectType === 'employee')
      void this.assignmentNotifications.notify(result);
    return result;
  }
  async listAssignments(actor: AuthenticatedUser) {
    this.requireAssignmentRead(actor);
    const companyId = this.company(actor);
    const all = await this.assignments.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const visible: KpiAssignment[] = [];
    for (const row of all) {
      try {
        await this.assertAssignmentScope(actor, row);
        visible.push(row);
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    const creators = await this.creatorNames(
      visible.map((row) => row.createdBy),
    );
    return Promise.all(
      visible.map(async (row) => ({
        ...(await this.decorateAssignment(row)),
        creatorName: creators.get(row.createdBy) ?? `User #${row.createdBy}`,
      })),
    );
  }
  private async creatorNames(ids: number[]) {
    const uniqueIds = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ];
    if (!uniqueIds.length) return new Map<number, string>();
    try {
      const users = await this.db.getRepository(User).find({
        where: { id: In(uniqueIds) },
        select: { id: true, first_name: true, last_name: true },
      });
      return new Map(
        users.map((user) => [
          user.id,
          `${user.first_name} ${user.last_name}`.trim(),
        ]),
      );
    } catch {
      return new Map<number, string>();
    }
  }
  private async decorateAssignment(row: KpiAssignment) {
    const [definitionVersion, period, currentTarget] = await Promise.all([
      this.versions.findOneBy({
        id: row.definitionVersionId,
        companyId: row.companyId,
      }),
      this.periods.findOneBy({ id: row.periodId, companyId: row.companyId }),
      this.targets.findOne({
        where: { assignmentId: row.id, companyId: row.companyId },
        order: { revision: 'DESC' },
      }),
    ]);
    return { ...row, definitionVersion, period, currentTarget };
  }
  async getAssignment(actor: AuthenticatedUser, id: number) {
    this.requireAssignmentRead(actor);
    const row = await this.assignments.findOneBy({
      id,
      companyId: this.company(actor),
    });
    if (!row) throw new NotFoundException('KPI assignment not found');
    await this.assertAssignmentScope(actor, row);
    const creators = await this.creatorNames([row.createdBy]);
    return {
      ...(await this.decorateAssignment(row)),
      creatorName: creators.get(row.createdBy) ?? `User #${row.createdBy}`,
      targetHistory: await this.targets.find({
        where: { assignmentId: id, companyId: row.companyId },
        order: { revision: 'DESC' },
      }),
    };
  }
  async updateAssignment(
    actor: AuthenticatedUser,
    id: number,
    dto: AssignmentUpdateDto,
  ) {
    this.requireAssignmentPermission(actor, 'kpi_assignments:update');
    const assignment = await this.getAssignment(actor, id);
    if (dto.managerEmployeeId)
      await this.owner(this.company(actor), dto.managerEmployeeId);
    if (dto.status === 'active' && assignment.status === 'inactive')
      throw new ConflictException('Inactive assignments cannot be reactivated');
    await this.assignments.update(
      { id, companyId: this.company(actor) },
      {
        ...(dto.managerEmployeeId !== undefined
          ? { managerEmployeeId: dto.managerEmployeeId }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    );
    return this.getAssignment(actor, id);
  }
  async reviseTarget(
    actor: AuthenticatedUser,
    id: number,
    dto: TargetRevisionDto,
  ) {
    this.requireAssignmentPermission(actor, 'kpi_targets:revise');
    const assignment = await this.getAssignment(actor, id);
    if (assignment.status !== 'active' || !assignment.definitionVersion)
      throw new ConflictException('Active KPI assignment required');
    validateTarget(
      assignment.definitionVersion.measurementType,
      assignment.definitionVersion.direction,
      dto.target,
    );
    const revision = (assignment.currentTarget?.revision ?? 0) + 1;
    try {
      const saved = await this.targets.save(
        this.targets.create({
          companyId: this.company(actor),
          assignmentId: id,
          revision,
          target: dto.target,
          reason: dto.reason.trim(),
          changedBy: actor.id,
        }),
      );
      void this.assignmentNotifications.notifyTargetRevision(assignment, saved);
      return saved;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Concurrent target revision; reload and retry',
        );
      throw error;
    }
  }
  async personalAssignments(actor: AuthenticatedUser) {
    this.requireRole(actor, ['EMPLOYEE', ...readers]);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee identity required');
    const rows = await this.assignments.find({
      where: {
        companyId: this.company(actor),
        subjectType: 'employee',
        subjectId: actor.employeeId,
      },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.decorateAssignment(row)));
  }
}
