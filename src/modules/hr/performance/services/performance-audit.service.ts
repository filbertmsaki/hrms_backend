import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { getRequestAuditContext } from '../../../../common/request-context/request-context';
import { PerformanceAuditLog } from '../entities/performance-audit-log.entity';

type LogPerformanceAuditInput = {
  action: string;
  actor: AuthenticatedUser;
  employeeId?: number | null;
  performanceReviewId?: number | null;
  kpiAchievementId?: number | null;
  beforeValues?: Record<string, unknown> | null;
  afterValues?: Record<string, unknown> | null;
  reason?: string | null;
};

@Injectable()
export class PerformanceAuditService {
  constructor(
    @InjectRepository(PerformanceAuditLog)
    private readonly auditRepository: Repository<PerformanceAuditLog>,
  ) {}

  async log(
    input: LogPerformanceAuditInput,
    manager?: EntityManager,
  ): Promise<void> {
    if (!input.actor.companyId) {
      return;
    }
    const context = getRequestAuditContext();

    const target =
      manager?.getRepository(PerformanceAuditLog) ?? this.auditRepository;
    await target.save(
      target.create({
        companyId: input.actor.companyId,
        action: input.action,
        actorCompanyUserId: input.actor.companyMembershipId ?? null,
        actorRoles: input.actor.roles ?? [],
        employeeId: input.employeeId ?? null,
        performanceReviewId: input.performanceReviewId ?? null,
        kpiAchievementId: input.kpiAchievementId ?? null,
        beforeValues: input.beforeValues ?? null,
        afterValues: input.afterValues ?? null,
        reason: input.reason ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
    );
  }
}
