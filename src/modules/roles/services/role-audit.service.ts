import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { RoleAuditActionEnum } from '../enums/role-audit-action.enum';
import { RoleAuditLog } from '../entities/role-audit-log.entity';

type RoleAuditPayload = {
  action: RoleAuditActionEnum;
  role_id?: number | null;
  permission_id?: number | null;
  actor?: AuthenticatedUser;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class RoleAuditService {
  constructor(
    @InjectRepository(RoleAuditLog)
    private readonly roleAuditLogRepository: Repository<RoleAuditLog>,
  ) {}

  private getRepository(manager?: EntityManager): Repository<RoleAuditLog> {
    return manager?.getRepository(RoleAuditLog) ?? this.roleAuditLogRepository;
  }

  async log(entry: RoleAuditPayload, manager?: EntityManager): Promise<void> {
    const repository = this.getRepository(manager);
    await repository.save(
      repository.create({
        action: entry.action,
        role_id: entry.role_id ?? null,
        permission_id: entry.permission_id ?? null,
        actor_company_user_id: entry.actor?.companyMembershipId ?? null,
        description: entry.description ?? null,
        old_values: entry.old_values ?? null,
        new_values: entry.new_values ?? null,
        metadata: entry.metadata ?? null,
      }),
    );
  }
}
