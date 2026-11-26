import { AchievementService } from './achievement.service';

describe('achievement correction drafts in manager reviews', () => {
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
});
