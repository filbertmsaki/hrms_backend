import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { UserTwoFactorAuditLog } from '../entities/user-two-factor-audit-log.entity';

type UserTwoFactorAuditPayload = {
  company_id: number;
  target_user_id: number;
  target_user_email: string;
  previous_status: boolean;
  new_status: boolean;
  action: string;
  actor?: AuthenticatedUser;
  ip_address?: string | null;
  user_agent?: string | null;
  disable_reason?: string | null;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class UserTwoFactorAuditService {
  constructor(
    @InjectRepository(UserTwoFactorAuditLog)
    private readonly auditLogRepository: Repository<UserTwoFactorAuditLog>,
  ) {}

  private getRepository(
    manager?: EntityManager,
  ): Repository<UserTwoFactorAuditLog> {
    return (
      manager?.getRepository(UserTwoFactorAuditLog) ?? this.auditLogRepository
    );
  }

  async log(
    entry: UserTwoFactorAuditPayload,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);

    await repository.save(
      repository.create({
        company_id: entry.company_id,
        target_user_id: entry.target_user_id,
        target_user_email: entry.target_user_email,
        previous_status: entry.previous_status,
        new_status: entry.new_status,
        action: entry.action,
        actor_company_user_id: entry.actor?.companyMembershipId ?? null,
        actor_user_id: entry.actor?.id ?? null,
        ip_address: entry.ip_address ?? null,
        user_agent: entry.user_agent ?? null,
        disable_reason: entry.disable_reason ?? null,
        payload: entry.payload ?? null,
      }),
    );
  }
}
