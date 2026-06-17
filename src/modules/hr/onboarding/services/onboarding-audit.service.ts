import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { OnboardingAuditLog } from '../entities/onboarding-audit-log.entity';

type OnboardingAuditPayload = {
  company_id: number;
  action: string;
  entity_name: string;
  entity_id?: number | null;
  onboarding_request_id?: number | null;
  actor?: AuthenticatedUser;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class OnboardingAuditService {
  constructor(
    @InjectRepository(OnboardingAuditLog)
    private readonly onboardingAuditLogRepository: Repository<OnboardingAuditLog>,
  ) {}

  private getRepository(
    manager?: EntityManager,
  ): Repository<OnboardingAuditLog> {
    return (
      manager?.getRepository(OnboardingAuditLog) ??
      this.onboardingAuditLogRepository
    );
  }

  async log(
    entry: OnboardingAuditPayload,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);

    await repository.save(
      repository.create({
        company_id: entry.company_id,
        onboarding_request_id: entry.onboarding_request_id ?? null,
        action: entry.action,
        entity_name: entry.entity_name,
        entity_id: entry.entity_id ?? null,
        actor_company_user_id: entry.actor?.companyMembershipId ?? null,
        actor_user_id: entry.actor?.id ?? null,
        payload: entry.payload ?? null,
      }),
    );
  }
}
