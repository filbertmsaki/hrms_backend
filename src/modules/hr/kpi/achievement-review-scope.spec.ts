import { ForbiddenException } from '@nestjs/common';
import { AchievementService } from './achievement.service';

describe('achievement reviewer scope', () => {
  const service = Object.create(AchievementService.prototype);
  service.kpi = { getAssignment: jest.fn().mockResolvedValue({}) };
  service.access = {
    hasCompanyScope: (actor: any) =>
      actor.permissions.includes('data_scope:company'),
  };
  const assignment = {
    id: 1,
    subjectType: 'employee',
    subjectId: 20,
    managerEmployeeId: 30,
  };
  const revision = { submittedBy: 20 };
  const actor = (
    roles: string[],
    employeeId: number,
    permissions: string[] = [],
  ) => ({ id: employeeId, employeeId, roles, permissions });

  it('allows the assigned manager and rejects another manager or an unassigned KPI', async () => {
    await expect(
      service.reviewable(
        actor(['DEPARTMENT_MANAGER'], 30),
        assignment,
        revision,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.reviewable(
        actor(['DEPARTMENT_MANAGER'], 31),
        assignment,
        revision,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.reviewable(
        actor(['DEPARTMENT_MANAGER'], 31),
        { ...assignment, managerEmployeeId: null },
        revision,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows company-scoped HR but prevents self-approval', async () => {
    await expect(
      service.reviewable(
        actor(['HR_MANAGER'], 31, ['data_scope:company']),
        assignment,
        revision,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.reviewable(
        actor(['HR_MANAGER'], 20, ['data_scope:company']),
        assignment,
        revision,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
