import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeaveAuditLog } from '../entities/leave-audit-log.entity';

type LeaveAuditPayload = {
  company_id: number;
  action: string;
  entity_name: string;
  entity_id?: number | null;
  leave_request_id?: number | null;
  actor?: AuthenticatedUser;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class LeaveAuditService {
  constructor(
    @InjectRepository(LeaveAuditLog)
    private readonly leaveAuditLogRepository: Repository<LeaveAuditLog>,
  ) {}

  private getRepository(manager?: EntityManager): Repository<LeaveAuditLog> {
    return (
      manager?.getRepository(LeaveAuditLog) ?? this.leaveAuditLogRepository
    );
  }

  async log(entry: LeaveAuditPayload, manager?: EntityManager): Promise<void> {
    const repository = this.getRepository(manager);

    await repository.save(
      repository.create({
        company_id: entry.company_id,
        leave_request_id: entry.leave_request_id ?? null,
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
