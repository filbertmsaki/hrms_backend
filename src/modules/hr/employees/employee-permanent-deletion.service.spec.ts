import { EmployeePermanentDeletionService } from './employee-permanent-deletion.service';

describe('EmployeePermanentDeletionService', () => {
  it('permanently deletes an onboarding employee after safety checks pass', async () => {
    const employee = {
      id: 42,
      company_id: 7,
      company_user_id: 11,
      employee_no: 'EMP-0042',
      first_name: 'Asha',
      last_name: 'Juma',
      employment_status: 'onboarding',
    };
    const query = jest.fn(async () => []);
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () => employee),
        })),
      })),
      query,
    };
    const dataSource = {
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    const hrAccessService = { assertCanAccessEmployee: jest.fn() };
    const filesService = { removeManagedFile: jest.fn() };
    const securityEventsService = { logBestEffort: jest.fn() };
    const service = new EmployeePermanentDeletionService(
      dataSource as never,
      hrAccessService as never,
      filesService as never,
      securityEventsService as never,
    );

    jest
      .spyOn(service as never, 'assertNoBlockers')
      .mockResolvedValue(undefined);
    jest.spyOn(service as never, 'collectFilePaths').mockResolvedValue([]);
    jest
      .spyOn(service as never, 'deleteDocuments')
      .mockResolvedValue(undefined);
    jest.spyOn(service as never, 'deleteWhere').mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'releaseInvitation')
      .mockResolvedValue(undefined);
    jest.spyOn(service as never, 'removeAccount').mockResolvedValue({
      userId: 5,
      companyUserRemoved: true,
      userRemoved: true,
    });

    await expect(
      service.deleteEmployee(7, 42, {
        id: 1,
        userId: 1,
        companyId: 7,
      } as never),
    ).resolves.toMatchObject({
      message: 'Employee permanently deleted',
      employee_id: 42,
      company_user_removed: true,
      user_account_removed: true,
    });
    expect(hrAccessService.assertCanAccessEmployee).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "employees" WHERE "id" = $1',
      [42],
    );
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'employee_permanently_deleted',
        }),
      }),
    );
  });
});
