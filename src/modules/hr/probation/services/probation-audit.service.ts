import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ProbationAuditLog } from '../entities/probation-audit-log.entity';
import { ProbationAuditActionEnum } from '../enums/probation-audit-action.enum';

export interface ProbationAuditPayload {
  action: ProbationAuditActionEnum;
  probationCaseId?: number | null;
  reviewCycleId?: number | null;
  actor?: AuthenticatedUser;
  description?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ProbationAuditService {
  constructor(
    @InjectRepository(ProbationAuditLog)
    private readonly repository: Repository<ProbationAuditLog>,
  ) {}

  async log(entry: ProbationAuditPayload, manager?: EntityManager): Promise<void> {
    const repository = manager
      ? manager.getRepository(ProbationAuditLog)
      : this.repository;

    await repository.save(
      repository.create({
        probation_case_id: entry.probationCaseId ?? null,
        review_cycle_id: entry.reviewCycleId ?? null,
        actor_company_user_id: entry.actor?.companyMembershipId ?? null,
        action: entry.action,
        description: entry.description ?? null,
        old_values: entry.oldValues ?? null,
        new_values: entry.newValues ?? null,
        metadata: entry.metadata ?? null,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
      }),
    );
  }
}
