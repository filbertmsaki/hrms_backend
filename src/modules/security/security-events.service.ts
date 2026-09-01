import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { User } from '../users/entities/user.entity';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityEventOutcome } from './enums/security-event-outcome.enum';
import { SecurityEventType } from './enums/security-event-type.enum';

const SENSITIVE_METADATA_KEYS = new Set([
  'password',
  'old_password',
  'new_password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'two_factor_secret',
  'backup_codes',
  'code',
]);

export interface CreateSecurityEvent {
  eventType: SecurityEventType;
  outcome: SecurityEventOutcome;
  actor?: AuthenticatedUser | null;
  companyId?: number | null;
  targetUserId?: number | null;
  targetCompanyUserId?: number | null;
  roleId?: number | null;
  permissionId?: number | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  sessionId?: string | null;
  reason?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  context?: AuditRequestContext | null;
}

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly repository: Repository<SecurityEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private getRepository(manager?: EntityManager): Repository<SecurityEvent> {
    return manager?.getRepository(SecurityEvent) ?? this.repository;
  }

  private sanitizeValue(value: unknown, key?: string): unknown {
    if (key && SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
      return '[REDACTED]';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(
          ([nestedKey, nestedValue]) => [
            nestedKey,
            this.sanitizeValue(nestedValue, nestedKey),
          ],
        ),
      );
    }

    return value;
  }

  private sanitizeRecord(
    value: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    return this.sanitizeValue(value) as Record<string, unknown>;
  }

  async log(
    entry: CreateSecurityEvent,
    manager?: EntityManager,
  ): Promise<SecurityEvent> {
    const repository = this.getRepository(manager);
    const event = repository.create({
      event_type: entry.eventType,
      outcome: entry.outcome,
      company_id: entry.companyId ?? entry.actor?.companyId ?? null,
      actor_user_id: entry.actor?.id ?? null,
      actor_company_user_id: entry.actor?.companyMembershipId ?? null,
      target_user_id: entry.targetUserId ?? null,
      target_company_user_id: entry.targetCompanyUserId ?? null,
      role_id: entry.roleId ?? null,
      permission_id: entry.permissionId ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id:
        entry.resourceId === undefined || entry.resourceId === null
          ? null
          : String(entry.resourceId),
      request_id: entry.context?.requestId ?? null,
      session_id: entry.sessionId ?? entry.actor?.sessionId ?? null,
      ip_address: entry.context?.ipAddress ?? null,
      user_agent: entry.context?.userAgent ?? null,
      reason: entry.reason ?? null,
      old_values: this.sanitizeRecord(entry.oldValues),
      new_values: this.sanitizeRecord(entry.newValues),
      metadata: this.sanitizeRecord({
        ...(entry.metadata ?? {}),
        ...(entry.actor?.email ? { actor_email: entry.actor.email } : {}),
      }),
    });

    return repository.save(event);
  }

  async logBestEffort(entry: CreateSecurityEvent): Promise<void> {
    try {
      await this.log(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write security event ${entry.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  applyActorScope(
    qb: SelectQueryBuilder<SecurityEvent>,
    actor: AuthenticatedUser,
  ): void {
    if (actor.scope === 'platform') {
      return;
    }

    if (!actor.companyId) {
      qb.andWhere('1 = 0');
      return;
    }

    qb.andWhere('securityEvent.company_id = :securityCompanyId', {
      securityCompanyId: actor.companyId,
    });
  }

  async findAll(actor: AuthenticatedUser, query: QuerySecurityEventsDto) {
    const {
      page = 1,
      limit = 20,
      event_type,
      outcome,
      target_user_id,
      request_id,
      date_from,
      date_to,
    } = query;

    const qb = this.repository.createQueryBuilder('securityEvent');
    this.applyActorScope(qb, actor);

    if (event_type) {
      qb.andWhere('securityEvent.event_type = :eventType', {
        eventType: event_type,
      });
    }

    if (outcome) {
      qb.andWhere('securityEvent.outcome = :outcome', {
        outcome,
      });
    }

    if (target_user_id) {
      qb.andWhere('securityEvent.target_user_id = :targetUserId', {
        targetUserId: target_user_id,
      });
    }

    if (request_id?.trim()) {
      qb.andWhere('securityEvent.request_id = :requestId', {
        requestId: request_id.trim(),
      });
    }

    if (date_from) {
      qb.andWhere('securityEvent.occurred_at >= :dateFrom', {
        dateFrom: new Date(date_from),
      });
    }

    if (date_to) {
      qb.andWhere('securityEvent.occurred_at <= :dateTo', {
        dateTo: new Date(date_to),
      });
    }

    const [data, total] = await qb
      .orderBy('securityEvent.occurred_at', 'DESC')
      .addOrderBy('securityEvent.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const actorUserIds = [
      ...new Set(
        data
          .map((event) => event.actor_user_id)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const actors = actorUserIds.length
      ? await this.userRepository.find({
          where: { id: In(actorUserIds) },
          select: ['id', 'first_name', 'last_name', 'email'],
        })
      : [];
    const actorById = new Map(actors.map((user) => [user.id, user]));

    return {
      data: data.map((event) => {
        const actor = event.actor_user_id
          ? actorById.get(event.actor_user_id)
          : undefined;
        const actorName = [actor?.first_name, actor?.last_name]
          .filter((part) => typeof part === 'string' && part.trim())
          .join(' ')
          .trim();
        return {
          ...event,
          actor_name: actorName || actor?.email || null,
          actor_email: actor?.email ?? null,
        };
      }),
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
}
