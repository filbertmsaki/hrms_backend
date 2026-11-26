import { AchievementService } from './achievement.service';
import { DataSource } from 'typeorm';
import { KpiAchievement, KpiAchievementRevision } from './achievement.entities';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';

describe('achievement correction drafts in manager reviews', () => {
  it('uses a mapped order column in TypeORM pagination', async () => {
    const db = new DataSource({
      type: 'postgres',
      entities: [KpiAchievement, KpiAchievementRevision],
    });
    await (db as any).buildMetadatas();
    const query = db
      .getRepository(KpiAchievementRevision)
      .createQueryBuilder('revision')
      .innerJoin(
        KpiAchievement,
        'root',
        'root.latest_revision_id = revision.id AND root.company_id = revision.company_id',
      )
      .where('revision.company_id = :companyId', { companyId: 17 })
      .andWhere('revision.status = :draftStatus', { draftStatus: 'draft' })
      .andWhere('root.approved_revision_id IS NOT NULL')
      .orderBy('revision.updatedAt', 'DESC')
      .take(200);
    expect(() =>
      (query as any).createOrderByCombinedWithSelectExpression('distinctAlias'),
    ).not.toThrow();
  });

  it('lists a draft opened from an approved result using the approved revision for reviewer scope', async () => {
    const service = Object.create(AchievementService.prototype);
    const actor = { id: 7, employeeId: 30 };
    const draft = {
      id: 12,
      achievementId: 3,
      companyId: 17,
      status: 'draft',
      submittedBy: 7,
    };
    const approved = {
      id: 11,
      achievementId: 3,
      companyId: 17,
      status: 'approved',
      submittedBy: 20,
    };
    const root = {
      id: 3,
      companyId: 17,
      assignmentId: 5,
      latestRevisionId: 12,
      approvedRevisionId: 11,
    };
    const assignment = {
      id: 5,
      subjectType: 'employee',
      subjectId: 20,
      managerEmployeeId: 30,
    };
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([draft]),
    };
    service.isManager = jest.fn().mockReturnValue(true);
    service.company = jest.fn().mockReturnValue(17);
    service.revisions = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      findOneBy: jest.fn().mockResolvedValue(approved),
    };
    service.achievements = { findOneBy: jest.fn().mockResolvedValue(root) };
    service.assignment = jest.fn().mockResolvedValue(assignment);
    service.reviewable = jest.fn().mockResolvedValue(undefined);
    service.detail = jest
      .fn()
      .mockResolvedValue({ id: root.id, current: draft });

    await expect(service.pending(actor, 'correction_draft')).resolves.toEqual([
      { id: root.id, current: draft },
    ]);
    expect(query.andWhere).toHaveBeenCalledWith(
      'root.approved_revision_id IS NOT NULL',
    );
    expect(service.reviewable).toHaveBeenCalledWith(
      actor,
      assignment,
      approved,
    );
  });

  it('notifies the assigned employee after opening a correction draft', async () => {
    const service = Object.create(AchievementService.prototype);
    const actor = { id: 7, employeeId: 30 };
    const root = { id: 3, companyId: 17, latestRevisionId: 11 };
    const revision = { id: 11, revision: 1, status: 'approved' };
    const assignment = { id: 5, subjectType: 'employee', subjectId: 20 };
    const manager = {
      findOne: jest.fn().mockResolvedValue({ ...root }),
      save: jest
        .fn()
        .mockImplementation(async (_entity, value) => value ?? _entity),
      create: jest.fn().mockImplementation((_entity, value) => value),
    };
    service.rootAndRevision = jest
      .fn()
      .mockResolvedValue({ root, revision, assignment });
    service.reviewable = jest.fn().mockResolvedValue(undefined);
    service.db = {
      transaction: async (work: (manager: unknown) => Promise<void>) =>
        work(manager),
    };
    service.carryForwardActivities = jest.fn().mockResolvedValue(undefined);
    service.event = jest.fn().mockResolvedValue(undefined);
    service.achievementNotification = jest.fn().mockResolvedValue(undefined);
    service.get = jest.fn().mockResolvedValue({ id: root.id });

    await service.correction(actor, root.id);

    expect(service.achievementNotification).toHaveBeenCalledWith(
      root,
      assignment,
      'employee',
      NotificationTypeEnum.KPI_ACHIEVEMENT_CORRECTION_DRAFT,
      'correction_draft_created',
      'A KPI correction draft is ready',
      expect.stringContaining('submit it for approval'),
      2,
    );
  });

  it('routes the correction notification to the employee KPI page', async () => {
    const service = Object.create(AchievementService.prototype);
    const createAndPush = jest.fn().mockResolvedValue(undefined);
    service.db = {
      getRepository: jest.fn().mockReturnValue({
        findOneBy: jest.fn().mockResolvedValue({ company_user_id: 42 }),
      }),
    };
    service.notifications = { createAndPush };
    service.logger = { warn: jest.fn() };

    await service.achievementNotification(
      { id: 3, companyId: 17 },
      { id: 5, subjectType: 'employee', subjectId: 20 },
      'employee',
      NotificationTypeEnum.KPI_ACHIEVEMENT_CORRECTION_DRAFT,
      'correction_draft_created',
      'A KPI correction draft is ready',
      'Review and submit your correction.',
      2,
    );

    expect(createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 17,
        receiver_company_user_id: 42,
        type: NotificationTypeEnum.KPI_ACHIEVEMENT_CORRECTION_DRAFT,
        action_url: '/dashboard/me/kpi/5',
        dedupe_key: 'kpi:achievement:3:correction_draft_created:2:42',
        channels: [NotificationChannelEnum.IN_APP],
      }),
    );
  });
});
