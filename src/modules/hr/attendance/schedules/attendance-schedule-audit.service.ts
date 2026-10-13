import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AttendanceScheduleAuditLog } from './entities/attendance-schedule-audit-log.entity';

@Injectable()
export class AttendanceScheduleAuditService {
  constructor(
    @InjectRepository(AttendanceScheduleAuditLog)
    private readonly logs: Repository<AttendanceScheduleAuditLog>,
  ) {}

  async log(
    input: {
      companyId: number;
      entityType: string;
      entityId: number;
      action: string;
      actorUserId: number | null;
      beforeState?: Record<string, unknown> | null;
      afterState?: Record<string, unknown> | null;
    },
    manager?: EntityManager,
  ) {
    const repo =
      manager?.getRepository(AttendanceScheduleAuditLog) ?? this.logs;
    await repo.save(
      repo.create({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
      }),
    );
  }

  async list(companyId: number, entityType: string, entityId: number) {
    return this.logs.find({
      where: { companyId, entityType, entityId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }
}
