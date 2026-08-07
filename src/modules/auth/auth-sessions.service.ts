import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Not, Repository } from 'typeorm';

import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import {
  AuthScope,
  UserType,
} from '../../common/interfaces/authenticated-user.interface';
import { AuthSession } from './entities/auth-session.entity';

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
  context?: AuditRequestContext | null;
};

type TouchAuthSessionInput = {
  companyId?: number | null;
  refreshExpiresAt?: Date;
  context?: AuditRequestContext | null;
};

@Injectable()
export class AuthSessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly authSessionRepository: Repository<AuthSession>,
  ) {}

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
    const repository = this.getRepository(manager);
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
      revoked_at: null,
      revocation_reason: null,
    });

    return repository.save(entity);
  }

  async findActiveSession(
    userId: number,
    sessionId: string,
    manager?: EntityManager,
  ): Promise<AuthSession | null> {
    const repository = this.getRepository(manager);

    return repository.findOne({
      where: {
        id: sessionId,
        user_id: userId,
        revoked_at: IsNull(),
      },
    });
  }

  async touchSession(
    userId: number,
    sessionId: string,
    input: TouchAuthSessionInput,
    manager?: EntityManager,
  ): Promise<AuthSession | null> {
    const repository = this.getRepository(manager);
    const session = await this.findActiveSession(userId, sessionId, manager);

    if (!session) {
      return null;
    }

    session.company_id =
      input.companyId === undefined ? session.company_id : input.companyId;
    session.last_activity_at = new Date();
    session.last_activity_ip =
      input.context?.ipAddress ?? session.last_activity_ip ?? null;
    session.user_agent =
      this.normalizeUserAgent(input.context?.userAgent) ?? session.user_agent;

    const descriptor = this.buildSessionDescriptor({
      userAgent: input.context?.userAgent ?? session.user_agent,
    });
    session.device_name = descriptor.deviceName;

    if (input.refreshExpiresAt) {
      session.refresh_expires_at = input.refreshExpiresAt;
    }

    return repository.save(session);
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
    const sessions = await this.authSessionRepository.find({
      where: {
        user_id: userId,
        revoked_at: IsNull(),
        refresh_expires_at: Not(IsNull()),
      },
      order: {
        last_activity_at: 'DESC',
        created_at: 'DESC',
      },
    });

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

  async revokeAllSessionsForUser(
    userId: number,
    reason: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);
    await repository
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        revoked_at: () => 'CURRENT_TIMESTAMP',
        revocation_reason: reason,
      })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
