import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
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

  async log(input: LogPerformanceAuditInput): Promise<void> {
    if (!input.actor.companyId) {
      return;
    }

    await this.auditRepository.save(
      this.auditRepository.create({
        companyId: input.actor.companyId,
        action: input.action,
        actorCompanyUserId: input.actor.companyMembershipId ?? null,
        employeeId: input.employeeId ?? null,
        performanceReviewId: input.performanceReviewId ?? null,
        kpiAchievementId: input.kpiAchievementId ?? null,
        beforeValues: input.beforeValues ?? null,
        afterValues: input.afterValues ?? null,
        reason: input.reason ?? null,
      }),
    );
  }
}
