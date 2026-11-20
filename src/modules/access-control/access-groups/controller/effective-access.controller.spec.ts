import { EffectiveAccessController } from './effective-access.controller';

describe('effective access scope', () => {
  it('rejects an employee outside the actor scope before loading the preview', async () => {
    const service = { previewEffectiveAccess: jest.fn() };
    const access = {
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue([1]),
    };
    const controller = new EffectiveAccessController(
      service as never,
      access as never,
    );
    await expect(
      controller.preview({ user: { companyId: 7 } } as never, 2, 3),
    ).rejects.toThrow('requested employee');
    expect(service.previewEffectiveAccess).not.toHaveBeenCalled();
  });
  it('requires company scope for an unassigned device and checks branch scope otherwise', async () => {
    const service = {
      previewEffectiveAccess: jest
        .fn()
        .mockResolvedValue({ device_branch_id: null }),
    };
    const access = {
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue([2]),
      hasCompanyScope: jest.fn().mockReturnValue(false),
      assertCanAccessBranch: jest.fn(),
    };
    const controller = new EffectiveAccessController(
      service as never,
      access as never,
    );
    await expect(
      controller.preview({ user: { companyId: 7 } } as never, 2, 3),
    ).rejects.toThrow('Company scope');
    service.previewEffectiveAccess.mockResolvedValue({ device_branch_id: 4 });
    await controller.preview({ user: { companyId: 7 } } as never, 2, 3);
    expect(access.assertCanAccessBranch).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 7 }),
      4,
    );
  });
});
