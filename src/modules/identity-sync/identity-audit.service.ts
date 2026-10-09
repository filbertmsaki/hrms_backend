import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { QueryIdentityAuditDto } from './dto/query-identity-audit.dto';
import { IdentityChangeAudit } from './entities/identity-change-audit.entity';

export interface IdentityAuditRow extends IdentityChangeAudit {
  can_rollback: boolean;
  rolled_back_by_change_set_id: string | null;
}

const CSV_COLUMNS: (keyof IdentityAuditRow)[] = [
  'created_at',
  'change_set_id',
  'subject_name',
  'user_id',
  'employee_id',
  'field',
  'old_value',
  'new_value',
  'source',
  'rollback_of_change_set_id',
  'actor_name',
  'actor_email',
  'reason',
];

@Injectable()
export class IdentityAuditService {
  constructor(
    @InjectRepository(IdentityChangeAudit)
    private readonly repository: Repository<IdentityChangeAudit>,
  ) {}

  async findAll(companyId: number, query: QueryIdentityAuditDto) {
    const [items, total] = await this.buildQuery(companyId, query)
      .orderBy('audit.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: await this.withRollbackState(items),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async exportCsv(companyId: number, query: QueryIdentityAuditDto) {
    const items = await this.buildQuery(companyId, query)
      .orderBy('audit.id', 'DESC')
      .take(10000)
      .getMany();
    const rows = await this.withRollbackState(items);
    const escape = (value: unknown) => {
      const text =
        value instanceof Date
          ? value.toISOString()
          : Array.isArray(value)
            ? value.join(' ')
            : value === null || value === undefined
              ? ''
              : String(value as string | number | boolean);
      // Neutralize spreadsheet formula injection.
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [
      CSV_COLUMNS.join(','),
      ...rows.map((row) =>
        CSV_COLUMNS.map((column) => escape(row[column])).join(','),
      ),
    ].join('\n');
  }

  private buildQuery(
    companyId: number,
    query: QueryIdentityAuditDto,
  ): SelectQueryBuilder<IdentityChangeAudit> {
    const builder = this.repository
      .createQueryBuilder('audit')
      .where(':companyId = ANY(audit.affected_company_ids)', { companyId });
    if (query.user_id) {
      builder.andWhere('audit.user_id = :userId', { userId: query.user_id });
    }
    if (query.employee_id) {
      builder.andWhere(':employeeId = ANY(audit.affected_employee_ids)', {
        employeeId: query.employee_id,
      });
    }
    if (query.actor_user_id) {
      builder.andWhere('audit.actor_user_id = :actorId', {
        actorId: query.actor_user_id,
      });
    }
    if (query.field) {
      builder.andWhere('audit.field = :field', { field: query.field });
    }
    if (query.source) {
      builder.andWhere('audit.source = :source', { source: query.source });
    }
    if (query.from) {
      builder.andWhere('audit.created_at >= :from', { from: query.from });
    }
    if (query.to) {
      builder.andWhere('audit.created_at <= :to', { to: query.to });
    }
    if (query.search?.trim()) {
      const search = `%${query.search.trim().replace(/[%_\\]/g, '\\$&')}%`;
      builder.andWhere(
        new Brackets((qb) =>
          qb
            .where('audit.subject_name ILIKE :search', { search })
            .orWhere('audit.actor_name ILIKE :search', { search })
            .orWhere('audit.old_value ILIKE :search', { search })
            .orWhere('audit.new_value ILIKE :search', { search }),
        ),
      );
    }
    return builder;
  }

  /** A change set can be rolled back when it is the subject's latest and not yet reverted. */
  private async withRollbackState(
    items: IdentityChangeAudit[],
  ): Promise<IdentityAuditRow[]> {
    const changeSetIds = [...new Set(items.map((item) => item.change_set_id))];
    if (!changeSetIds.length) return [];
    const state: {
      change_set_id: string;
      rolled_back_by: string | null;
      is_latest: boolean;
    }[] = await this.repository.query(
      `
        SELECT target.change_set_id,
               (SELECT r.change_set_id FROM identity_change_audits r
                 WHERE r.rollback_of_change_set_id = target.change_set_id
                 LIMIT 1) AS rolled_back_by,
               NOT EXISTS (
                 SELECT 1 FROM identity_change_audits later
                 WHERE later.id > target.max_id
                   AND later.change_set_id <> target.change_set_id
                   AND (
                     (target.user_id IS NOT NULL AND later.user_id = target.user_id)
                     OR (target.user_id IS NULL AND later.user_id IS NULL
                         AND later.employee_id = target.employee_id)
                   )
               ) AS is_latest
        FROM (
          SELECT change_set_id, MAX(id) AS max_id,
                 MAX(user_id) AS user_id, MAX(employee_id) AS employee_id
          FROM identity_change_audits
          WHERE change_set_id = ANY($1::uuid[])
          GROUP BY change_set_id
        ) target
      `,
      [changeSetIds],
    );
    const byId = new Map(state.map((row) => [row.change_set_id, row]));
    return items.map((item) => {
      const row = byId.get(item.change_set_id);
      return {
        ...item,
        rolled_back_by_change_set_id: row?.rolled_back_by ?? null,
        can_rollback: !!row?.is_latest && !row?.rolled_back_by,
      };
    });
  }
}
