import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import ms from 'ms';
import type { StringValue } from 'ms';

import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import {
  AuthScope,
  AuthenticatedUser,
  UserType,
} from '../../common/interfaces/authenticated-user.interface';
import { AuthSession } from './entities/auth-session.entity';
import { AuthPolicy } from './entities/auth-policy.entity';
import { SessionPolicyDto } from './dtos/session-policy.dto';
import { SecurityEventsService } from '../security/security-events.service';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';

/**
 * Retained for sessions created before multi-device login was enabled, so
 * JwtStrategy can still report their specific revocation reason.
 */
export const SESSION_REPLACED_REASON = 'SESSION_REPLACED';

type BuildSessionDescriptorInput = {
  userAgent?: string | null;
};

type CreateAuthSessionInput = {
  sessionId: string;
  userId: number;
  companyId?: number | null;
  scope: AuthScope;
  userType: UserType;
  refreshExpiresAt: Date;
  refreshTokenId: string;
  policy: SessionPolicyDto;
  context?: AuditRequestContext | null;
};

type TouchAuthSessionInput = {
  companyId?: number | null;
  refreshExpiresAt?: Date;
  refreshTokenId?: string;
  context?: AuditRequestContext | null;
};

@Injectable()
export class AuthSessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly authSessionRepository: Repository<AuthSession>,
    private readonly configService: ConfigService,
    private readonly events: SecurityEventsService,
  ) {}

  private defaults(): SessionPolicyDto {
    const seconds = (key: string, fallback: StringValue) =>
      Math.floor(
        ms(this.configService.get<StringValue>(key) ?? fallback) / 1000,
      );
    return {
      access_seconds: seconds('JWT_ACCESS_EXPIRATION', '15m'),
      refresh_seconds: seconds('JWT_REFRESH_EXPIRATION', '7d'),
      absolute_seconds:
        this.configService.get<number>('AUTH_SESSION_ABSOLUTE_MAX_SECONDS') ??
        604800,
      idle_seconds: 1800,
      max_sessions: 5,
    };
  }

  async getPolicy(sessionId?: string): Promise<SessionPolicyDto> {
    if (sessionId) {
      const row = await this.authSessionRepository.findOneByOrFail({
        id: sessionId,
      });
      return row.policy ?? this.defaults();
    }
    const row = await this.authSessionRepository.manager.findOneBy(AuthPolicy, {
      id: 1,
    });
    return row?.policy ?? this.defaults();
  }

  async setPolicy(
    actor: AuthenticatedUser,
    policy: SessionPolicyDto,
    context: AuditRequestContext,
  ) {
    if (policy.access_seconds > policy.refresh_seconds) {
      throw new BadRequestException(
        'Access token lifetime must fit within the refresh token lifetime.',
      );
    }
    return this.authSessionRepository.manager.transaction(async (manager) => {
      await manager.upsert(AuthPolicy, { id: 1, policy }, ['id']);
      await this.events.log(
        {
          actor,
          context,
          eventType: SecurityEventType.CONFIGURATION_CHANGED,
          outcome: SecurityEventOutcome.SUCCESS,
          resourceType: 'session_policy',
          newValues: { ...policy },
        },
        manager,
      );
      return policy;
    });
  }

  private get activeCondition() {
    return `revoked_at IS NULL AND refresh_expires_at > statement_timestamp()
      AND created_at + COALESCE((policy->>'absolute_seconds')::int, :absolute) * interval '1 second' > statement_timestamp()
      AND last_activity_at + COALESCE((policy->>'idle_seconds')::int, :idle) * interval '1 second' > statement_timestamp()`;
  }

  private get limits() {
    const defaults = this.defaults();
    return { absolute: defaults.absolute_seconds, idle: defaults.idle_seconds };
  }

  async describeSession(actor: AuthenticatedUser, recordActivity = false) {
    if (!actor.sessionId) throw new UnauthorizedException();
    const repository = this.authSessionRepository;
    if (recordActivity) {
      const result = await repository
        .createQueryBuilder()
        .update(AuthSession)
        .set({
          last_activity_at: () =>
            'GREATEST(last_activity_at, statement_timestamp())',
        })
        .where('id = :id AND user_id = :user', {
          id: actor.sessionId,
          user: actor.id,
        })
        .andWhere(this.activeCondition, this.limits)
        .execute();
      if (!result.affected) throw new UnauthorizedException('Session expired');
    }
    const session = await this.findActiveSession(actor.id, actor.sessionId);
    if (!session) throw new UnauthorizedException('Session expired');
    const p = session.policy ?? this.defaults();
    return {
      session_id: session.id,
      ...p,
      access_token_lifetime: `${p.access_seconds}s`,
      refresh_token_lifetime: `${p.refresh_seconds}s`,
      refresh_token_lifetime_is_sliding: true,
      absolute_session_lifetime_seconds: p.absolute_seconds,
      inactivity_timeout: p.idle_seconds,
      concurrent_session_limit: p.max_sessions,
      server_time: Date.now(),
      idle_expires_at:
        session.last_activity_at.getTime() + p.idle_seconds * 1000,
      absolute_expires_at:
        session.created_at.getTime() + p.absolute_seconds * 1000,
      refresh_expires_at: session.refresh_expires_at.getTime(),
    };
  }

  private getRepository(manager?: EntityManager): Repository<AuthSession> {
    return manager?.getRepository(AuthSession) ?? this.authSessionRepository;
  }

  private normalizeUserAgent(userAgent?: string | null): string | null {
    if (typeof userAgent !== 'string') {
      return null;
    }

    const trimmed = userAgent.trim();
    return trimmed.length ? trimmed.slice(0, 2000) : null;
  }

  private inferPlatform(userAgent: string): string | null {
    const value = userAgent.toLowerCase();

    if (value.includes('windows')) {
      return 'Windows';
    }
    if (value.includes('mac os') || value.includes('macintosh')) {
      return 'macOS';
    }
    if (value.includes('android')) {
      return 'Android';
    }
    if (
      value.includes('iphone') ||
      value.includes('ipad') ||
      value.includes('ios')
    ) {
      return 'iOS';
    }
    if (value.includes('linux')) {
      return 'Linux';
    }

    return null;
  }

  private inferBrowser(userAgent: string): string | null {
    const value = userAgent.toLowerCase();

    if (value.includes('edg/')) {
      return 'Edge';
    }
    if (value.includes('chrome/')) {
      return 'Chrome';
    }
    if (value.includes('firefox/')) {
      return 'Firefox';
    }
    if (value.includes('safari/') && !value.includes('chrome/')) {
      return 'Safari';
    }

    return null;
  }

  buildSessionDescriptor(input: BuildSessionDescriptorInput): {
    deviceName: string;
    userAgent: string | null;
  } {
    const userAgent = this.normalizeUserAgent(input.userAgent);
    if (!userAgent) {
      return {
        deviceName: 'Web browser',
        userAgent: null,
      };
    }

    const browser = this.inferBrowser(userAgent);
    const platform = this.inferPlatform(userAgent);
    const deviceName = [browser, platform].filter(Boolean).join(' on ');

    return {
      deviceName: deviceName || 'Web browser',
      userAgent,
    };
  }

  async createSession(
    input: CreateAuthSessionInput,
    manager?: EntityManager,
  ): Promise<AuthSession> {
    if (!manager) {
      return this.authSessionRepository.manager.transaction((tx) =>
        this.createSession(input, tx),
      );
    }
    const repository = this.getRepository(manager);
    // Serialize admission for this account across all workers and devices.
    await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
      input.userId,
    ]);
    const overflow = await repository
      .createQueryBuilder()
      .select('id')
      .where('user_id = :userId', { userId: input.userId })
      .andWhere(this.activeCondition, this.limits)
      .orderBy('created_at', 'DESC')
      .addOrderBy('id', 'DESC')
      .offset(input.policy.max_sessions - 1)
      .getRawMany<{ id: string }>();
    if (overflow.length) {
      const ids = overflow.map((row) => row.id);
      await repository.update(ids, {
        revoked_at: new Date(),
        revocation_reason: SESSION_REPLACED_REASON,
      });
      await this.events.log(
        {
          eventType: SecurityEventType.SESSIONS_REVOKED,
          outcome: SecurityEventOutcome.SUCCESS,
          targetUserId: input.userId,
          companyId: input.companyId,
          reason: 'Concurrent session limit reached',
          metadata: { count: ids.length },
        },
        manager,
      );
    }
    const descriptor = this.buildSessionDescriptor({
      userAgent: input.context?.userAgent ?? null,
    });

    const entity = repository.create({
      id: input.sessionId,
      user_id: input.userId,
      company_id: input.companyId ?? null,
      scope: input.scope,
      user_type: input.userType,
      device_type: 'web',
      device_name: descriptor.deviceName,
      user_agent: descriptor.userAgent,
      ip_address: input.context?.ipAddress ?? null,
      last_activity_at: new Date(),
      last_activity_ip: input.context?.ipAddress ?? null,
      refresh_expires_at: input.refreshExpiresAt,
      current_refresh_jti: input.refreshTokenId,
      policy: input.policy,
      revoked_at: null,
      revocation_reason: null,
    });

    return repository.save(entity);
  }

  /**
   * Legacy helper for an explicit single-session policy. Normal logins now
   * call createSession so users can stay signed in on multiple devices.
   */
  async replaceActiveSession(
    input: CreateAuthSessionInput,
  ): Promise<{ session: AuthSession; replacedCount: number }> {
    return this.authSessionRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AuthSession);

      const result = await repository
        .createQueryBuilder()
        .update(AuthSession)
        .set({
          revoked_at: () => 'CURRENT_TIMESTAMP',
          revocation_reason: SESSION_REPLACED_REASON,
        })
        .where('user_id = :userId', { userId: input.userId })
        .andWhere('revoked_at IS NULL')
        .execute();

      const session = await this.createSession(input, manager);

      return { session, replacedCount: result.affected ?? 0 };
    });
  }

  /**
   * True when this specific session was revoked because a later login
   * replaced it (as opposed to an explicit logout, admin action, or the
   * session simply never having existed) - lets the auth guard surface a
   * SESSION_REPLACED code instead of a generic "revoked" error.
   */
  async wasSessionReplaced(
    userId: number,
    sessionId: string,
  ): Promise<boolean> {
    const session = await this.authSessionRepository.findOne({
      where: { id: sessionId, user_id: userId },
    });

    return session?.revocation_reason === SESSION_REPLACED_REASON;
  }

  async findActiveSession(
    userId: number,
    sessionId: string,
    manager?: EntityManager,
  ): Promise<AuthSession | null> {
    const repository = this.getRepository(manager);

    return repository
      .createQueryBuilder('s')
      .where('s.id = :sessionId AND s.user_id = :userId', { sessionId, userId })
      .andWhere(this.activeCondition, this.limits)
      .getOne();
  }

  async touchSession(
    userId: number,
    sessionId: string,
    input: TouchAuthSessionInput,
    manager?: EntityManager,
  ): Promise<AuthSession | null> {
    const repository = this.getRepository(manager);
    const changes = {
      ...(input.companyId !== undefined && {
        company_id: input.companyId,
        scope: 'company' as const,
      }),
      ...(input.refreshExpiresAt && {
        refresh_expires_at: input.refreshExpiresAt,
      }),
      ...(input.refreshTokenId && {
        current_refresh_jti: input.refreshTokenId,
      }),
      ...(input.context?.ipAddress && {
        last_activity_ip: input.context.ipAddress,
      }),
      last_activity_at: () =>
        'GREATEST(last_activity_at, statement_timestamp())',
    };
    const result = await repository
      .createQueryBuilder()
      .update(AuthSession)
      .set(changes)
      .where('id = :sessionId AND user_id = :userId', { sessionId, userId })
      .andWhere(this.activeCondition, this.limits)
      .execute();
    return result.affected
      ? this.findActiveSession(userId, sessionId, manager)
      : null;
  }

  /** Atomically consume the current refresh identifier and replace it. */
  async rotateRefreshToken(
    userId: number,
    sessionId: string,
    previousId: string | undefined,
    nextId: string,
    expiresAt: Date,
    companyId?: number,
  ): Promise<boolean> {
    const query = this.authSessionRepository
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        current_refresh_jti: nextId,
        refresh_expires_at: expiresAt,
        ...(companyId === undefined ? {} : { company_id: companyId }),
      })
      .where('id = :sessionId AND user_id = :userId AND revoked_at IS NULL', {
        sessionId,
        userId,
      })
      .andWhere(this.activeCondition, this.limits);
    if (previousId) {
      query.andWhere('current_refresh_jti = :previousId', { previousId });
    } else {
      query.andWhere('current_refresh_jti IS NULL');
    }
    const result = await query.execute();
    return (result.affected ?? 0) === 1;
  }

  async listSessionsForUser(
    userId: number,
    currentSessionId?: string,
  ): Promise<
    Array<{
      session_id: string;
      company_id: number | null;
      scope: AuthScope;
      user_type: UserType;
      device_type: string;
      device_name: string;
      ip_address: string | null;
      last_activity_at: Date;
      refresh_expires_at: Date;
      created_at: Date;
      is_current: boolean;
    }>
  > {
    const sessions = await this.authSessionRepository
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere(this.activeCondition, this.limits)
      .orderBy('s.last_activity_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    return sessions.map((session) => ({
      session_id: session.id,
      company_id: session.company_id,
      scope: session.scope,
      user_type: session.user_type,
      device_type: session.device_type,
      device_name: session.device_name,
      ip_address: session.last_activity_ip ?? session.ip_address,
      last_activity_at: session.last_activity_at,
      refresh_expires_at: session.refresh_expires_at,
      created_at: session.created_at,
      is_current: session.id === currentSessionId,
    }));
  }

  async listManagedSessions(actor: AuthenticatedUser, page: number) {
    const query = this.authSessionRepository
      .createQueryBuilder('s')
      .select([
        's.id',
        's.company_id',
        's.user_id',
        's.device_name',
        's.last_activity_at',
        's.created_at',
      ])
      .where(this.activeCondition, this.limits);
    if (actor.scope !== 'platform') {
      query.andWhere(
        "s.scope = 'company' AND s.user_type <> 'OWNER' AND s.company_id = :company",
        { company: actor.companyId },
      );
    }
    const [data, total] = await query
      .orderBy('s.last_activity_at', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .skip((page - 1) * 25)
      .take(25)
      .getManyAndCount();
    return { data, page, total };
  }

  async revokeManagedSession(
    actor: AuthenticatedUser,
    id: string,
    context: AuditRequestContext,
  ) {
    return this.authSessionRepository.manager.transaction(async (manager) => {
      const query = manager
        .createQueryBuilder()
        .update(AuthSession)
        .set({
          revoked_at: () => 'statement_timestamp()',
          revocation_reason: 'administrator_revoked',
        })
        .where('id = :id AND revoked_at IS NULL', { id });
      if (actor.scope !== 'platform') {
        query.andWhere(
          "scope = 'company' AND user_type <> 'OWNER' AND company_id = :company",
          { company: actor.companyId },
        );
      }
      const result = await query.returning(['user_id', 'company_id']).execute();
      if (!result.affected)
        throw new NotFoundException('Active session not found.');
      const [target] = result.raw as Array<{
        user_id: number;
        company_id: number | null;
      }>;
      await this.events.log(
        {
          actor,
          context,
          companyId: target.company_id,
          targetUserId: target.user_id,
          resourceId: id,
          resourceType: 'auth_session',
          eventType: SecurityEventType.SESSION_REVOKED,
          outcome: SecurityEventOutcome.SUCCESS,
        },
        manager,
      );
      return { revoked: true };
    });
  }

  async revokeSession(
    userId: number,
    sessionId: string,
    reason: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repository = this.getRepository(manager);
    const result = await repository
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        revoked_at: () => 'CURRENT_TIMESTAMP',
        revocation_reason: reason,
      })
      .where('id = :sessionId', { sessionId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  /**
   * Returns the number of sessions actually revoked, so callers (e.g. a
   * fresh login enforcing single-session-per-account) can tell whether
   * there was anything to revoke before logging/auditing it.
   */
  async revokeAllSessionsForUser(
    userId: number,
    reason: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = this.getRepository(manager);
    const result = await repository
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        revoked_at: () => 'CURRENT_TIMESTAMP',
        revocation_reason: reason,
      })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }
}
