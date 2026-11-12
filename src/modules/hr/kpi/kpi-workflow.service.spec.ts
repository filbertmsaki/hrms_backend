import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AchievementService } from './achievement.service';
import { EvaluationService } from './evaluation.service';
import { KpiService } from './kpi.service';
import { ScorecardService } from './scorecard.service';
import { Repository, DataSource } from 'typeorm';
import { KpiPeriod, KpiDefinitionVersion } from './kpi.entities';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { ActionItem } from '../action-inbox/entities/action-item.entity';
import { ActionItemsService } from '../action-inbox/action-items.service';
import {
  KPI_DOMAIN_TRANSITIONS,
  KPI_WORKFLOW_STAGES,
  KpiWorkflowService,
} from './kpi-workflow.service';

const actor = (roles: string[], employeeId?: number): AuthenticatedUser => ({
  id: 4,
  email: 'synthetic@example.test',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 7,
  companyMembershipId: 14,
  employeeId,
  roles,
  permissions: [],
});
function fixture() {
  const kpis = {
    listDefinitions: jest.fn().mockResolvedValue([]),
    listPeriods: jest.fn().mockResolvedValue([]),
    listAssignments: jest.fn().mockResolvedValue([]),
    personalAssignments: jest.fn().mockResolvedValue([]),
  };
  const cards = {
    list: jest.fn().mockResolvedValue([]),
    mine: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({
      currentVersion: { publishedAt: '2026-11-01' },
      overallScore: null,
      entries: [{ required: true, status: 'awaiting_data' }],
    }),
  };
  const achievements = {
    pending: jest.fn().mockResolvedValue([]),
    mine: jest.fn().mockResolvedValue([]),
  };
  const evaluations = {
    cycles: jest.fn().mockResolvedValue([]),
    templates: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([]),
  };
  const periods = { exist: jest.fn().mockResolvedValue(false) };
  const versions = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    }),
  };
  const memberships = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 25 }),
    }),
  };
  const notifications = {
    createAndPush: jest.fn().mockResolvedValue({ id: 90 }),
  };
  const actionItemRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const actionItems = {
    upsertOpen: jest.fn().mockResolvedValue({ id: 80 }),
    completeBySource: jest.fn().mockResolvedValue(undefined),
    cancelBySource: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: { query: jest.Mock }) => Promise<unknown>) =>
        callback({ query: jest.fn() }),
    ),
  };
  const service = new KpiWorkflowService(
    kpis as unknown as KpiService,
    cards as unknown as ScorecardService,
    achievements as unknown as AchievementService,
    evaluations as unknown as EvaluationService,
    periods as unknown as Repository<KpiPeriod>,
    versions as unknown as Repository<KpiDefinitionVersion>,
    memberships as unknown as Repository<CompanyUser>,
    notifications as unknown as NotificationsService,
    dataSource as unknown as DataSource,
    actionItemRepository as unknown as Repository<ActionItem>,
    actionItems as unknown as ActionItemsService,
  );
  return {
    service,
    kpis,
    cards,
    achievements,
    evaluations,
    periods,
    versions,
    memberships,
    notifications,
    actionItemRepository,
    actionItems,
    dataSource,
  };
}

describe('KPI workflow guidance', () => {
  it('shows employee read-only setup without calling HR list endpoints', async () => {
    const { service, kpis } = fixture();
    const result = await service.guidance(actor(['EMPLOYEE'], 31));
    expect(result.waiting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'period',
          status: 'pending',
          owner: 'HR',
          reminderKey: 'period',
        }),
        expect.objectContaining({ id: 'assignment', status: 'unavailable' }),
      ]),
    );
    expect(kpis.listDefinitions).not.toHaveBeenCalled();
    expect(kpis.listAssignments).not.toHaveBeenCalled();
    expect(result.actions.every((action) => action.owner !== 'HR')).toBe(true);
  });
  it('shares a company-wide reminder status across employees', async () => {
    const { service, actionItemRepository } = fixture();
    actionItemRepository.find.mockResolvedValue([
      { sourceKey: 'kpi-workflow:7:company:period', status: 'OPEN' },
    ]);
    for (const employeeId of [31, 32]) {
      const result = await service.guidance(actor(['EMPLOYEE'], employeeId));
      expect(result.waiting.find((step) => step.id === 'period')).toMatchObject(
        {
          reminderStatus: 'active',
          reminderBlockedReason:
            'HR has already been notified about this pending activity.',
        },
      );
    }
  });
  it('creates one company-scoped inbox task and in-app notification for the shared issue', async () => {
    const { service, notifications, actionItems, actionItemRepository } =
      fixture();
    const first = await service.remindHr(actor(['EMPLOYEE'], 31), 'period');
    expect(first).toMatchObject({
      message: 'Reminder sent to HR.',
      reminderStatus: 'active',
      notificationId: 90,
      actionItemId: 80,
    });
    expect(actionItems.upsertOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        assigneeCompanyUserId: 25,
        sourceKey: 'kpi-workflow:7:company:period',
        actionUrl: '/dashboard/kpi/periods',
      }),
      expect.any(Object),
    );
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 7,
        receiver_company_user_id: 25,
        channels: ['IN_APP'],
        dedupe_key: 'kpi-workflow:7:company:period',
        action_url: '/dashboard/kpi/periods',
      }),
    );
    actionItemRepository.findOne.mockResolvedValue({ id: 80, status: 'OPEN' });
    const second = await service.remindHr(actor(['EMPLOYEE'], 32), 'period');
    expect(second).toMatchObject({
      reminderStatus: 'active',
      actionItemId: 80,
    });
    expect(notifications.createAndPush).toHaveBeenCalledTimes(1);
    expect(actionItems.upsertOpen).toHaveBeenCalledTimes(1);
  });
  it('keeps distinct employee assignment issues separate', async () => {
    const { service, periods, versions, actionItems } = fixture();
    periods.exist.mockResolvedValue(true);
    versions.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(true),
    });
    await service.remindHr(actor(['EMPLOYEE'], 31), 'assignment');
    await service.remindHr(actor(['EMPLOYEE'], 32), 'assignment');
    expect(
      actionItems.upsertOpen.mock.calls.map((call) => call[0].sourceKey),
    ).toEqual([
      'kpi-workflow:7:employee:31:assignment',
      'kpi-workflow:7:employee:32:assignment',
    ]);
  });
  it('shares definition setup but scopes HR finalization to an evaluation', async () => {
    const { service, evaluations, actionItems } = fixture();
    evaluations.list.mockResolvedValue([
      {
        id: 77,
        employeeId: 31,
        status: 'approved',
        hrReviewerCompanyUserId: 25,
      },
    ]);
    await service.remindHr(actor(['EMPLOYEE'], 31), 'definition');
    await service.remindHr(actor(['EMPLOYEE'], 31), 'hr_finalization:77');
    expect(
      actionItems.upsertOpen.mock.calls.map((call) => call[0].sourceKey),
    ).toEqual([
      'kpi-workflow:7:company:definition',
      'kpi-workflow:7:evaluation:77:finalization',
    ]);
  });
  it('serializes simultaneous reports of one company issue', async () => {
    const {
      service,
      dataSource,
      actionItemRepository,
      actionItems,
      notifications,
    } = fixture();
    let queue = Promise.resolve();
    dataSource.transaction.mockImplementation(
      (callback: (manager: { query: jest.Mock }) => Promise<unknown>) => {
        const result = queue.then(() => callback({ query: jest.fn() }));
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    );
    let task: { id: number; status: string } | null = null;
    actionItemRepository.findOne.mockImplementation(async () => task);
    actionItems.upsertOpen.mockImplementation(async () => {
      task = { id: 80, status: 'OPEN' };
      return task;
    });
    const results = await Promise.all([
      service.remindHr(actor(['EMPLOYEE'], 31), 'period'),
      service.remindHr(actor(['EMPLOYEE'], 32), 'period'),
    ]);
    expect(results.map((result) => result.reminderStatus)).toEqual([
      'active',
      'active',
    ]);
    expect(notifications.createAndPush).toHaveBeenCalledTimes(1);
    expect(actionItems.upsertOpen).toHaveBeenCalledTimes(1);
  });
  it('resolves only the matching company issue after HR setup', async () => {
    const { service, actionItems, periods } = fixture();
    await service.resolveIssue(7, 'period');
    expect(actionItems.completeBySource).toHaveBeenCalledWith(
      7,
      'kpi-workflow:7:company:period',
    );
    periods.exist.mockResolvedValue(true);
    const result = await service.guidance(actor(['EMPLOYEE'], 31));
    expect(result.waiting.find((step) => step.id === 'period')).toMatchObject({
      status: 'complete',
    });
  });
  it('does not share reminders across company boundaries', async () => {
    const { service, actionItems } = fixture();
    await service.remindHr(actor(['EMPLOYEE'], 31), 'period');
    await service.remindHr(
      { ...actor(['EMPLOYEE'], 31), companyId: 8 },
      'period',
    );
    expect(
      actionItems.upsertOpen.mock.calls.map((call) => call[0].sourceKey),
    ).toEqual([
      'kpi-workflow:7:company:period',
      'kpi-workflow:8:company:period',
    ]);
  });
  it('denies reminders when the step is complete or no HR recipient exists', async () => {
    const { service, periods, memberships, notifications } = fixture();
    const employee = actor(['EMPLOYEE'], 31);
    periods.exist.mockResolvedValue(true);
    await expect(service.remindHr(employee, 'period')).rejects.toThrow(
      'no longer pending',
    );
    periods.exist.mockResolvedValue(false);
    memberships.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });
    await expect(service.remindHr(employee, 'period')).rejects.toThrow(
      'No authorized HR recipient',
    );
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
  it('shows a contact-HR state when no recipient is configured', async () => {
    const { service, memberships } = fixture();
    memberships.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });
    const result = await service.guidance(actor(['EMPLOYEE'], 31));
    expect(result.waiting.find((step) => step.id === 'period')).toMatchObject({
      reminderStatus: 'no_recipient',
      reminderBlockedReason:
        'No authorized HR recipient is configured. Please contact HR directly.',
    });
  });
  it('cancels a task if notification recording fails', async () => {
    const { service, notifications, actionItems } = fixture();
    notifications.createAndPush.mockRejectedValueOnce(
      new Error('synthetic transport failure'),
    );
    await expect(
      service.remindHr(actor(['EMPLOYEE'], 31), 'period'),
    ).rejects.toThrow('could not be recorded');
    expect(actionItems.cancelBySource).toHaveBeenCalledWith(
      7,
      'kpi-workflow:7:company:period',
    );
  });
  it('describes navigation stages and independent lifecycle transitions', () => {
    expect(KPI_WORKFLOW_STAGES.map((stage) => stage.id)).toEqual([
      'setup',
      'define',
      'assign',
      'track',
      'submit',
      'review',
      'approve',
      'close',
    ]);
    expect(KPI_DOMAIN_TRANSITIONS.cycle.open).toContain('in_progress');
    expect(KPI_DOMAIN_TRANSITIONS.achievement.submitted).toContain('returned');
    expect(KPI_DOMAIN_TRANSITIONS.evaluation.finalized).toEqual([]);
    expect(KPI_DOMAIN_TRANSITIONS.acknowledgement.pending).toContain(
      'disputed',
    );
  });
  it('shows HR prerequisites from actual scoped records', async () => {
    const { service, kpis, evaluations } = fixture();
    const result = await service.guidance(actor(['HR_MANAGER']));
    expect(kpis.listDefinitions).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 7 }),
    );
    expect(
      result.actions.find((action) => action.id === 'create-assignment'),
    ).toMatchObject({
      blocked: true,
      reason: 'A published KPI definition is required.',
      resolveHref: '/dashboard/kpi',
    });
    expect(
      result.actions.find((action) => action.id === 'create-cycle'),
    ).toMatchObject({
      blocked: true,
      reason: 'Create a reporting period first.',
    });
    evaluations.templates.mockResolvedValue([
      { versions: [{ publishedAt: '2026-11-10' }] },
    ]);
    kpis.listPeriods.mockResolvedValue([{ id: 1, frequency: 'monthly' }]);
    kpis.listDefinitions.mockResolvedValue([
      {
        id: 2,
        code: 'KPI-2',
        status: 'published',
        currentVersion: { publishedAt: '2026-11-10', frequency: 'monthly' },
      },
    ]);
    const ready = await service.guidance(actor(['HR_MANAGER']));
    expect(
      ready.actions.find((action) => action.id === 'create-assignment')
        ?.blocked,
    ).toBe(false);
    expect(
      ready.actions.find((action) => action.id === 'create-cycle')?.blocked,
    ).toBe(false);
    kpis.listPeriods.mockResolvedValue([{ id: 1, frequency: 'annual' }]);
    const mismatch = await service.guidance(actor(['HR_MANAGER']));
    expect(
      mismatch.actions.find((action) => action.id === 'create-assignment')
        ?.reason,
    ).toBe(
      'Create a KPI reporting period matching a published KPI frequency (monthly). Existing KPI reporting period frequencies: annual. Performance-module periods are separate.',
    );
  });
  it('does not offer managers HR-only prerequisite links', async () => {
    const { service } = fixture();
    const result = await service.guidance(actor(['DEPARTMENT_MANAGER'], 21));
    expect(
      result.actions.find((action) => action.id === 'create-assignment'),
    ).toMatchObject({ blocked: true, owner: 'HR' });
    expect(
      result.actions.find((action) => action.id === 'create-assignment')
        ?.resolveHref,
    ).toBeUndefined();
  });
  it('surfaces a pending draft revision without hiding an existing published version', async () => {
    const { service, kpis } = fixture();
    kpis.listDefinitions.mockResolvedValue([
      {
        id: 7,
        code: 'RETENTION',
        status: 'published',
        currentVersion: { publishedAt: '2026-11-01' },
        draftVersion: { publishedAt: null },
      },
    ]);
    const result = await service.guidance(actor(['HR_MANAGER']));
    expect(
      result.actions.find((action) => action.id === 'publish-7')?.href,
    ).toBe('/dashboard/kpi/definitions/7');
    expect(
      result.records.find(
        (record) => record.kind === 'definition' && record.id === 7,
      )?.status,
    ).toBe('draft_revision');
    expect(
      result.actions.find((action) => action.id === 'create-assignment')
        ?.reason,
    ).toBe('A KPI reporting period is required. Performance-module periods are separate.');
  });
  it('directs HR to open an existing draft cycle instead of inventing a new one', async () => {
    const { service, evaluations } = fixture();
    evaluations.cycles.mockResolvedValue([
      { id: 8, name: 'Quarterly review', status: 'draft' },
    ]);
    const result = await service.guidance(actor(['HR_MANAGER']));
    expect(
      result.actions.find((action) => action.id === 'open-cycle-8')?.href,
    ).toBe('/dashboard/kpi/evaluation-cycles');
    expect(result.actions.some((action) => action.id === 'create-cycle')).toBe(
      false,
    );
  });
  it('shows returned personal work but no other employee records', async () => {
    const { service, kpis, cards, achievements, evaluations } = fixture();
    kpis.personalAssignments.mockResolvedValue([
      { id: 89, status: 'active', currentTarget: { id: 1 } },
    ]);
    achievements.mine.mockResolvedValue([
      { id: 44, assignmentId: 89, current: { status: 'returned' } },
    ]);
    evaluations.list.mockResolvedValue([
      {
        id: 3,
        employeeId: 21,
        managerEmployeeId: 22,
        status: 'finalized',
        ackStatus: null,
        amendedFromId: null,
      },
    ]);
    cards.mine.mockResolvedValue([
      { id: 5, status: 'published', performanceStatus: 'awaiting_data' },
    ]);
    const result = await service.guidance(actor(['EMPLOYEE'], 21));
    expect(result.actions.map((action) => action.id)).toEqual([
      'submit-89',
      'ack-3',
    ]);
    expect(result.records.find((row) => row.id === 89)?.status).toBe(
      'returned',
    );
    expect(
      result.records.find((row) => row.kind === 'scorecard' && row.id === 5)
        ?.href,
    ).toBe('/dashboard/me/scorecards/5');
    expect(kpis.listAssignments).not.toHaveBeenCalled();
  });
  it('keeps MANAGEMENT on aggregate analytics without querying individual records', async () => {
    const { service, kpis, cards, evaluations } = fixture();
    const result = await service.guidance(actor(['MANAGEMENT']));
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].href).toBe('/dashboard/kpi/analytics');
    expect(kpis.listAssignments).not.toHaveBeenCalled();
    expect(cards.list).not.toHaveBeenCalled();
    expect(evaluations.list).not.toHaveBeenCalled();
  });
  it('blocks HR finalization when required scorecard results are missing', async () => {
    const { service, cards, evaluations } = fixture();
    evaluations.list.mockResolvedValue([
      {
        id: 31,
        employeeId: 21,
        managerEmployeeId: 22,
        scorecardId: 5,
        status: 'approved',
        hrReviewerCompanyUserId: 14,
      },
    ]);
    const result = await service.guidance(actor(['HR_MANAGER']));
    expect(
      result.actions.find((action) => action.id === 'hr-31'),
    ).toMatchObject({
      blocked: true,
      resolveHref: '/dashboard/kpi/scorecards/5',
    });
    cards.get.mockResolvedValue({
      currentVersion: { publishedAt: '2026-11-01' },
      overallScore: '88',
      entries: [{ required: true, status: 'scored' }],
    });
    const complete = await service.guidance(actor(['HR_MANAGER']));
    expect(
      complete.actions.find((action) => action.id === 'hr-31')?.blocked,
    ).toBe(false);
  });
});
