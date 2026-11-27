import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { ContractSignatory } from '../contracts/entities/contract-signatory.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { DEFAULT_LETTER_TEMPLATES } from './default-letter-templates';
import {
  CreateLetterTemplateDto,
  LetterTemplateQueryDto,
  UpdateLetterTemplateDto,
} from './dto/letters.dto';
import { LetterTemplate } from './entities/letter-template.entity';
import {
  LetterTemplateSnapshot,
  LetterTemplateVersion,
} from './entities/letter-template-version.entity';
import { LetterTypeEnum, unknownPlaceholders } from './letter-catalogue';
import { companyUserNames } from './letter-names';

export function templateSnapshot(t: LetterTemplate): LetterTemplateSnapshot {
  return {
    name: t.name,
    subject: t.subject,
    salutation: t.salutation,
    body: t.body,
    closing: t.closing,
    signatory_id: t.signatory_id,
    signatory_name: t.signatory_name,
    signatory_title: t.signatory_title,
    requires_approval: t.requires_approval,
    include_acknowledgement: t.include_acknowledgement,
  };
}

/** 400 naming the first unknown key, e.g. "Unknown placeholder: {{password}}". */
export function assertKnownPlaceholders(
  ...texts: Array<string | null | undefined>
): void {
  const unknown = unknownPlaceholders(...texts);
  if (unknown.length) {
    throw new BadRequestException({
      message: `Unknown placeholder: {{${unknown[0]}}}`,
      unknown_placeholders: unknown,
    });
  }
}

@Injectable()
export class LetterTemplatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hrAccess: HrAccessService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  /** Creates one default template per letter type the company has none for. */
  async ensureDefaults(
    companyId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (em: EntityManager) => {
      const existing = await em.query<Array<{ letter_type: string }>>(
        `SELECT DISTINCT letter_type FROM letter_templates WHERE company_id = $1 AND deleted_at IS NULL`,
        [companyId],
      );
      const have = new Set(existing.map((row) => row.letter_type));
      const missing = DEFAULT_LETTER_TEMPLATES.filter(
        (item) => !have.has(item.letter_type),
      );
      if (!missing.length) return;
      await em.query('SELECT pg_advisory_xact_lock($1, $2)', [
        81_024_001,
        companyId,
      ]);
      const recheck = await em.query<Array<{ letter_type: string }>>(
        `SELECT DISTINCT letter_type FROM letter_templates WHERE company_id = $1 AND deleted_at IS NULL`,
        [companyId],
      );
      const now = new Set(recheck.map((row) => row.letter_type));
      for (const item of missing) {
        if (now.has(item.letter_type)) continue;
        const saved = await em.getRepository(LetterTemplate).save(
          em.getRepository(LetterTemplate).create({
            company_id: companyId,
            letter_type: item.letter_type,
            name: item.name,
            subject: item.subject,
            salutation: item.salutation,
            body: item.body,
            closing: item.closing,
            signatory_id: null,
            signatory_name: null,
            signatory_title: null,
            requires_approval: item.requires_approval,
            include_acknowledgement: item.include_acknowledgement,
            is_active: true,
            is_default: true,
            current_version: 1,
          }),
        );
        await em.getRepository(LetterTemplateVersion).save({
          template_id: saved.id,
          version: 1,
          snapshot: templateSnapshot(saved),
          created_by_company_user_id: null,
        });
      }
    };
    if (manager) {
      // Fast path outside a lock when nothing is missing.
      await run(manager);
      return;
    }
    const count = await this.dataSource.query<Array<{ n: number }>>(
      `SELECT COUNT(DISTINCT letter_type)::int AS n FROM letter_templates WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId],
    );
    if (Number(count[0]?.n) >= DEFAULT_LETTER_TEMPLATES.length) return;
    await this.dataSource.transaction(run);
  }

  async list(actor: AuthenticatedUser, query: LetterTemplateQueryDto) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    await this.ensureDefaults(companyId);
    const qb = this.dataSource
      .getRepository(LetterTemplate)
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .orderBy('t.letter_type', 'ASC')
      .addOrderBy('t.is_default', 'DESC')
      .addOrderBy('t.name', 'ASC');
    if (query.letter_type)
      qb.andWhere('t.letter_type = :type', { type: query.letter_type });
    if (!query.include_inactive) qb.andWhere('t.is_active = true');
    const rows = await qb.getMany();
    return this.toJsonMany(rows);
  }

  async get(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const template = await this.find(companyId, id);
    const [json] = await this.toJsonMany([template]);
    return { ...json, versions: await this.versionSummaries(template.id) };
  }

  async versions(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const template = await this.find(companyId, id);
    const rows = await this.dataSource
      .getRepository(LetterTemplateVersion)
      .find({
        where: { template_id: template.id },
        order: { version: 'DESC' },
      });
    const names = await companyUserNames(
      this.dataSource.manager,
      rows.map((row) => row.created_by_company_user_id),
    );
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      snapshot: row.snapshot,
      created_at: row.created_at,
      created_by_name: row.created_by_company_user_id
        ? (names.get(row.created_by_company_user_id) ?? null)
        : null,
    }));
  }

  async create(actor: AuthenticatedUser, dto: CreateLetterTemplateDto) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    assertKnownPlaceholders(dto.subject, dto.salutation, dto.body, dto.closing);
    await this.ensureDefaults(companyId);
    const signatory = await this.resolveSignatory(companyId, dto);
    const saved = await this.dataSource.transaction(async (em) => {
      const isDefault = dto.is_default === true && dto.is_active !== false;
      if (isDefault) await this.unsetDefaults(em, companyId, dto.letter_type);
      const template = await em.getRepository(LetterTemplate).save(
        em.getRepository(LetterTemplate).create({
          company_id: companyId,
          letter_type: dto.letter_type,
          name: dto.name,
          subject: dto.subject,
          salutation: dto.salutation ?? 'Dear {{employee_first_name}},',
          body: dto.body.trim(),
          closing: dto.closing ?? 'Yours sincerely,',
          ...signatory,
          requires_approval: dto.requires_approval ?? false,
          include_acknowledgement: dto.include_acknowledgement ?? false,
          is_active: dto.is_active ?? true,
          is_default: isDefault,
          current_version: 1,
          created_by_company_user_id: membershipId,
          updated_by_company_user_id: membershipId,
        }),
      );
      await em.getRepository(LetterTemplateVersion).save({
        template_id: template.id,
        version: 1,
        snapshot: templateSnapshot(template),
        created_by_company_user_id: membershipId,
      });
      return template;
    });
    await this.audit(actor, SecurityEventType.LETTER_TEMPLATE_CREATED, saved);
    return this.get(actor, saved.id);
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateLetterTemplateDto,
  ) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    assertKnownPlaceholders(dto.subject, dto.salutation, dto.body, dto.closing);
    const signatoryTouched =
      dto.signatory_id !== undefined ||
      dto.signatory_name !== undefined ||
      dto.signatory_title !== undefined;
    const signatory = signatoryTouched
      ? await this.resolveSignatory(companyId, dto)
      : null;
    const saved = await this.dataSource.transaction(async (em) => {
      const template = await em
        .getRepository(LetterTemplate)
        .createQueryBuilder('t')
        .where('t.id = :id AND t.company_id = :companyId', { id, companyId })
        .setLock('pessimistic_write')
        .getOne();
      if (!template) throw new NotFoundException('Letter template not found');
      if (dto.name !== undefined) template.name = dto.name;
      if (dto.subject !== undefined) template.subject = dto.subject;
      if (dto.salutation !== undefined) template.salutation = dto.salutation;
      if (dto.body !== undefined) template.body = dto.body.trim();
      if (dto.closing !== undefined) template.closing = dto.closing;
      if (signatory) Object.assign(template, signatory);
      if (dto.requires_approval !== undefined)
        template.requires_approval = dto.requires_approval;
      if (dto.include_acknowledgement !== undefined)
        template.include_acknowledgement = dto.include_acknowledgement;
      if (dto.is_active !== undefined) template.is_active = dto.is_active;
      if (dto.is_default === true && template.is_active) {
        await this.unsetDefaults(
          em,
          companyId,
          template.letter_type,
          template.id,
        );
        template.is_default = true;
      } else if (dto.is_default === false) {
        template.is_default = false;
      }
      if (template.is_active && template.is_default) {
        await this.unsetDefaults(
          em,
          companyId,
          template.letter_type,
          template.id,
        );
      }
      template.current_version += 1;
      await em.getRepository(LetterTemplateVersion).save({
        template_id: template.id,
        version: template.current_version,
        snapshot: templateSnapshot(template),
        created_by_company_user_id: membershipId,
      });
      template.updated_by_company_user_id = membershipId;
      return em.getRepository(LetterTemplate).save(template);
    });
    await this.audit(actor, SecurityEventType.LETTER_TEMPLATE_UPDATED, saved);
    return this.get(actor, saved.id);
  }

  async duplicate(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const source = await this.find(companyId, id);
    return this.create(actor, {
      letter_type: source.letter_type as LetterTypeEnum,
      name: `Copy of ${source.name}`.slice(0, 160),
      subject: source.subject,
      salutation: source.salutation,
      body: source.body,
      closing: source.closing,
      signatory_id: source.signatory_id,
      signatory_name: source.signatory_name,
      signatory_title: source.signatory_title,
      requires_approval: source.requires_approval,
      include_acknowledgement: source.include_acknowledgement,
      is_active: true,
      is_default: false,
    });
  }

  async setActive(actor: AuthenticatedUser, id: number, active: boolean) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const saved = await this.dataSource.transaction(async (em) => {
      const template = await em
        .getRepository(LetterTemplate)
        .findOneBy({ id, company_id: companyId });
      if (!template) throw new NotFoundException('Letter template not found');
      template.is_active = active;
      if (active && template.is_default) {
        const other = await em.getRepository(LetterTemplate).findOne({
          where: {
            company_id: companyId,
            letter_type: template.letter_type,
            is_default: true,
            is_active: true,
            deleted_at: IsNull(),
          },
        });
        if (other && other.id !== template.id) template.is_default = false;
      }
      template.updated_by_company_user_id = membershipId;
      return em.getRepository(LetterTemplate).save(template);
    });
    await this.audit(
      actor,
      SecurityEventType.LETTER_TEMPLATE_UPDATED,
      saved,
      active ? 'activated' : 'deactivated',
    );
    return this.get(actor, saved.id);
  }

  async setDefault(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccess.ensureActorCompanyId(actor);
    const membershipId = this.hrAccess.ensureActorMembershipId(actor);
    const saved = await this.dataSource.transaction(async (em) => {
      const template = await em
        .getRepository(LetterTemplate)
        .findOneBy({ id, company_id: companyId });
      if (!template) throw new NotFoundException('Letter template not found');
      if (!template.is_active)
        throw new ConflictException(
          'Activate the template before making it the default.',
        );
      await this.unsetDefaults(
        em,
        companyId,
        template.letter_type,
        template.id,
      );
      template.is_default = true;
      template.updated_by_company_user_id = membershipId;
      return em.getRepository(LetterTemplate).save(template);
    });
    await this.audit(
      actor,
      SecurityEventType.LETTER_TEMPLATE_UPDATED,
      saved,
      'set as default',
    );
    return this.get(actor, saved.id);
  }

  async find(
    companyId: number,
    id: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<LetterTemplate> {
    const template = await manager
      .getRepository(LetterTemplate)
      .findOneBy({ id, company_id: companyId });
    if (!template) throw new NotFoundException('Letter template not found');
    return template;
  }

  async defaultFor(
    companyId: number,
    letterType: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<LetterTemplate | null> {
    return (
      (await manager.getRepository(LetterTemplate).findOne({
        where: {
          company_id: companyId,
          letter_type: letterType,
          is_active: true,
          is_default: true,
        },
      })) ??
      (await manager.getRepository(LetterTemplate).findOne({
        where: {
          company_id: companyId,
          letter_type: letterType,
          is_active: true,
        },
        order: { updated_at: 'DESC' },
      }))
    );
  }

  async toJsonMany(rows: LetterTemplate[]) {
    const names = await companyUserNames(
      this.dataSource.manager,
      rows.map((row) => row.updated_by_company_user_id),
    );
    return rows.map((t) => ({
      id: t.id,
      letter_type: t.letter_type,
      name: t.name,
      subject: t.subject,
      salutation: t.salutation,
      body: t.body,
      closing: t.closing,
      signatory_id: t.signatory_id,
      signatory_name: t.signatory_name,
      signatory_title: t.signatory_title,
      requires_approval: t.requires_approval,
      include_acknowledgement: t.include_acknowledgement,
      is_active: t.is_active,
      is_default: t.is_default,
      current_version: t.current_version,
      updated_at: t.updated_at,
      updated_by_name: t.updated_by_company_user_id
        ? (names.get(t.updated_by_company_user_id) ?? null)
        : null,
    }));
  }

  private async versionSummaries(templateId: number) {
    const rows = await this.dataSource
      .getRepository(LetterTemplateVersion)
      .find({
        where: { template_id: templateId },
        order: { version: 'DESC' },
      });
    const names = await companyUserNames(
      this.dataSource.manager,
      rows.map((row) => row.created_by_company_user_id),
    );
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      created_at: row.created_at,
      created_by_name: row.created_by_company_user_id
        ? (names.get(row.created_by_company_user_id) ?? null)
        : null,
    }));
  }

  private async unsetDefaults(
    em: EntityManager,
    companyId: number,
    letterType: string,
    exceptId?: number,
  ) {
    await em.query(
      `UPDATE letter_templates SET is_default = false, updated_at = now()
        WHERE company_id = $1 AND letter_type = $2 AND is_default AND ($3::int IS NULL OR id <> $3)`,
      [companyId, letterType, exceptId ?? null],
    );
  }

  private async resolveSignatory(
    companyId: number,
    dto: {
      signatory_id?: number | null;
      signatory_name?: string | null;
      signatory_title?: string | null;
    },
  ) {
    if (dto.signatory_id) {
      const signatory = await this.dataSource
        .getRepository(ContractSignatory)
        .findOneBy({ id: dto.signatory_id, companyId });
      if (!signatory || !signatory.isActive)
        throw new BadRequestException('Signatory not found or not active');
      return {
        signatory_id: signatory.id,
        signatory_name: dto.signatory_name?.trim() || signatory.displayName,
        signatory_title: dto.signatory_title?.trim() || signatory.jobTitle,
      };
    }
    return {
      signatory_id: null,
      signatory_name: dto.signatory_name?.trim() || null,
      signatory_title: dto.signatory_title?.trim() || null,
    };
  }

  private async audit(
    actor: AuthenticatedUser,
    eventType: SecurityEventType,
    template: LetterTemplate,
    note?: string,
  ) {
    await this.securityEvents.logBestEffort({
      eventType,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId: template.company_id,
      resourceType: 'LETTER_TEMPLATE',
      resourceId: template.id,
      reason: note ?? null,
      metadata: {
        letter_type: template.letter_type,
        version: template.current_version,
        is_default: template.is_default,
        is_active: template.is_active,
      },
    });
  }
}
