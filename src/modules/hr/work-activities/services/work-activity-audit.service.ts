import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { WorkActivityAuditLog } from '../entities/analytics.entities';

type AuditInput = {
  action: string;
  actor?: AuthenticatedUser | null;
  companyId?: number | null;
  employeeId?: number | null;
  entityType?: string | null;
  entityId?: string | number | null;
  beforeValues?: Record<string, unknown> | null;
  afterValues?: Record<string, unknown> | null;
  reason?: string | null;
};

@Injectable()
export class WorkActivityAuditService {
  constructor(
    @InjectRepository(WorkActivityAuditLog)
    private readonly repository: Repository<WorkActivityAuditLog>,
  ) {}

  async log(input: AuditInput, manager?: EntityManager): Promise<void> {
    const companyId = input.companyId ?? input.actor?.companyId ?? null;
    if (!companyId) {
      return;
    }

    const target =
      manager?.getRepository(WorkActivityAuditLog) ?? this.repository;
    await target.save(
      target.create({
        companyId,
        action: input.action,
        actorCompanyUserId: input.actor?.companyMembershipId ?? null,
        employeeId: input.employeeId ?? input.actor?.employeeId ?? null,
        entityType: input.entityType ?? null,
        entityId:
          input.entityId === undefined || input.entityId === null
            ? null
            : String(input.entityId),
        beforeValues: input.beforeValues ?? null,
        afterValues: input.afterValues ?? null,
        reason: input.reason ?? null,
      }),
    );
  }
}
