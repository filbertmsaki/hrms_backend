import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { OffboardingAuditActionEnum } from '../enums/offboarding-audit-action.enum';
import { OffboardingAuditLog } from '../entities/offboarding-audit-log.entity';

type OffboardingAuditPayload = {
  action: OffboardingAuditActionEnum;
  offboarding_request_id?: number | null;
  actor?: AuthenticatedUser;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

@Injectable()
export class OffboardingAuditService {
  constructor(
    @InjectRepository(OffboardingAuditLog)
    private readonly offboardingAuditLogRepository: Repository<OffboardingAuditLog>,
  ) {}

  private getRepository(
    manager?: EntityManager,
  ): Repository<OffboardingAuditLog> {
    return (
      manager?.getRepository(OffboardingAuditLog) ??
      this.offboardingAuditLogRepository
    );
  }

  async log(
    entry: OffboardingAuditPayload,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);
    await repository.save(
      repository.create({
        action: entry.action,
        offboarding_request_id: entry.offboarding_request_id ?? null,
        actor_company_user_id: entry.actor?.companyMembershipId ?? null,
        description: entry.description ?? null,
        old_values: entry.old_values ?? null,
        new_values: entry.new_values ?? null,
        metadata: entry.metadata ?? null,
        ip_address: entry.ip_address ?? null,
        user_agent: entry.user_agent ?? null,
      }),
    );
  }
}
