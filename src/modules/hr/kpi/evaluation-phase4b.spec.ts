import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { HrAccessService } from '../shared/hr-access.service';
import type { ActionItemsService } from '../action-inbox/action-items.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { ScorecardService } from './scorecard.service';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../employees/entities/employee.entity';
import {
  EvaluationCycle,
  EvaluationDeadlineException,
  PerformanceEvaluation,
} from './evaluation.entities';
import {
  EvaluationService,
  evaluationLocalDeadline,
} from './evaluation.service';

describe('Phase 4B review inbox and deadlines', () => {
  const row = {
    id: 42,
    companyId: 7,
    cycleId: 9,
    employeeId: 10,
    managerEmployeeId: 11,
    hrReviewerCompanyUserId: 25,
    rowVersion: 4,
    organizationSnapshot: {},
  } as PerformanceEvaluation;
  const cycle = {
    id: 9,
    companyId: 7,
    status: 'draft',
    selfDeadline: '2026-11-05',
    managerDeadline: '2026-11-06',
    hrDeadline: '2026-11-07',
    ackDeadline: '2026-11-08',
    deadlinePolicy: { mode: 'soft' },
  } as EvaluationCycle;
  const inbox = {
    completeAllOpenForEntity: jest.fn().mockResolvedValue(undefined),
    upsertOpen: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = { createAndPush: jest.fn().mockResolvedValue({}) };
  const db = {
    getRepository: jest.fn((entity: unknown) => ({
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          entity === EvaluationCycle
            ? cycle
            : entity === Company
              ? { metadata: { timezone: 'Africa/Dar_es_Salaam' } }
              : null,
        ),
      findOneByOrFail: jest.fn().mockResolvedValue(cycle),
    })),
  };
  const service = new EvaluationService(
    db as unknown as DataSource,
    {
      hasCompanyScope: () => true,
      ensureActorCompanyId: () => 7,
    } as unknown as HrAccessService,
    {} as ScorecardService,
    inbox as unknown as ActionItemsService,
    notifications as unknown as NotificationsService,
  );
  const internal = service as unknown as {
    refreshInbox(row: PerformanceEvaluation, stage: 'hr' | null): Promise<void>;
    deadlineState(
      row: PerformanceEvaluation,
      stage: 'self',
      at: Date,
    ): Promise<{
      late: boolean;
      exception: EvaluationDeadlineException | null;
    }>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cycle.deadlinePolicy = { mode: 'soft' };
  });

  it('creates one company-scoped HR review task with a secure evaluation link', async () => {
    await internal.refreshInbox(row, 'hr');
    expect(inbox.completeAllOpenForEntity).toHaveBeenCalledWith(
      7,
      'kpi',
      'evaluation',
      42,
    );
    expect(inbox.upsertOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        assigneeCompanyUserId: 25,
        sourceKey: 'kpi:evaluation:42:hr',
        actionUrl: '/dashboard/kpi/evaluations/42',
      }),
    );
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 7,
        receiver_company_user_id: 25,
        dedupe_key: 'kpi:evaluation:42:hr:4',
        event_key: undefined,
      }),
    );
    await internal.refreshInbox(row, null);
    expect(inbox.completeAllOpenForEntity).toHaveBeenCalledTimes(2);
    expect(inbox.upsertOpen).toHaveBeenCalledTimes(1);
  });

  it('uses the organization timezone and accepts the complete deadline day', async () => {
    expect(
      evaluationLocalDeadline(
        '2026-11-05',
        'Africa/Dar_es_Salaam',
      ).toISOString(),
    ).toBe('2026-11-05T20:59:59.999Z');
    const beforeCutoff = await internal.deadlineState(
      row,
      'self',
      new Date('2026-11-05T20:59:59Z'),
    );
    expect(beforeCutoff.late).toBe(false);
    const afterCutoff = await internal.deadlineState(
      row,
      'self',
      new Date('2026-11-05T21:00:00Z'),
    );
    expect(afterCutoff.late).toBe(true);
  });

  it('requires an audited exception after an approved hard cutoff', async () => {
    cycle.deadlinePolicy = { mode: 'hard' };
    await expect(
      internal.deadlineState(row, 'self', new Date('2026-11-05T21:00:00Z')),
    ).rejects.toThrow(ConflictException);
    db.getRepository.mockImplementation((entity: unknown) => ({
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          entity === EvaluationCycle
            ? cycle
            : entity === Company
              ? { metadata: { timezone: 'Africa/Dar_es_Salaam' } }
              : entity === EvaluationDeadlineException
                ? { id: 2 }
                : null,
        ),
      findOneByOrFail: jest.fn().mockResolvedValue(cycle),
    }));
    const result = await internal.deadlineState(
      row,
      'self',
      new Date('2026-11-05T21:00:00Z'),
    );
    expect(result.exception?.id).toBe(2);
  });

  it('does not allow enabling hard deadlines without an approved organization policy', async () => {
    const actor = {
      id: 1,
      companyId: 7,
      roles: ['COMPANY_ADMIN'],
      permissions: ['data_scope:company'],
    } as unknown as AuthenticatedUser;
    await expect(
      service.setDeadlinePolicy(actor, 9, { mode: 'hard', reason: 'Test' }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('requires an explicit HR reviewer when more than one eligible member exists', async () => {
    const query = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      distinct: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue([{ id: 25 }, { id: 26 }]),
    };
    for (const method of [
      'innerJoin',
      'where',
      'andWhere',
      'distinct',
      'orderBy',
    ] as const)
      query[method].mockReturnValue(query);
    const resolver = new EvaluationService(
      {
        getRepository: () => ({ createQueryBuilder: () => query }),
      } as unknown as DataSource,
      {} as HrAccessService,
      {} as ScorecardService,
      inbox as unknown as ActionItemsService,
      notifications as unknown as NotificationsService,
    ) as unknown as {
      hrReviewer(companyId: number, preferredId?: number): Promise<number>;
    };
    await expect(resolver.hrReviewer(7)).rejects.toThrow(BadRequestException);
    await expect(resolver.hrReviewer(7, 26)).resolves.toBe(26);
  });
  it('checks the HR cutoff for an approval that follows review', async () => {
    const deadlineState = jest
      .fn()
      .mockResolvedValue({ late: true, exception: null });
    const subject = { ...row, status: 'hr_reviewed' } as PerformanceEvaluation;
    const review = Object.assign(Object.create(EvaluationService.prototype), {
      admin: jest.fn(),
      row: jest.fn().mockResolvedValue({ row: subject }),
      locked: jest.fn(
        async (
          _actor: unknown,
          _id: number,
          _version: number,
          fn: (
            manager: unknown,
            current: PerformanceEvaluation,
          ) => Promise<void>,
        ) => {
          await fn(
            {
              findOneByOrFail: jest
                .fn()
                .mockResolvedValue({ config: { requireHrReview: true } }),
            },
            subject,
          );
          return subject;
        },
      ),
      deadlineState,
      event: jest.fn().mockResolvedValue(undefined),
      revision: jest.fn().mockResolvedValue(undefined),
      refreshInbox: jest.fn().mockResolvedValue(undefined),
      notifyEmployee: jest.fn().mockResolvedValue(undefined),
    }) as EvaluationService;
    const actor = {
      id: 1,
      employeeId: 99,
      companyMembershipId: 25,
      roles: ['HR_MANAGER'],
    } as unknown as AuthenticatedUser;
    await review.hrAction(actor, 42, 'approve', { rowVersion: 4 });
    expect(deadlineState).toHaveBeenCalledWith(subject, 'hr');
  });
  it('sends a deduplicated, generic reminder to the current company member', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T12:00:00Z'));
    try {
      db.getRepository.mockImplementation((entity: unknown) => ({
        find: jest
          .fn()
          .mockResolvedValue(
            entity === PerformanceEvaluation
              ? [{ ...row, status: 'self_draft' }]
              : [],
          ),
        findOneBy: jest
          .fn()
          .mockResolvedValue(
            entity === EvaluationCycle
              ? cycle
              : entity === Company
                ? { metadata: { timezone: 'Africa/Dar_es_Salaam' } }
                : entity === Employee
                  ? { company_user_id: 30 }
                  : null,
          ),
      }));
      await service.sendDeadlineReminders();
      expect(inbox.upsertOpen).toHaveBeenCalledWith(
        expect.objectContaining({ sourceKey: 'kpi:evaluation:42:self' }),
      );
      expect(notifications.createAndPush).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 7,
          receiver_company_user_id: 30,
          title: 'Evaluation deadline approaching',
          dedupe_key: 'kpi:evaluation:42:self:deadline:2026-11-05',
          action_url: '/dashboard/me/evaluations/42',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
