import { AccessReconciliationOperationsController } from './access-reconciliation-operations.controller';

describe('reconciliation device inspection', () => {
  it('reads the device without modifying the operation or exposing the raw user', async () => {
    const operations = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 3, employeeId: 4, deviceId: 5 }),
    };
    const sync = {
      previewEffectiveAccess: jest
        .fn()
        .mockResolvedValue({
          employee_no: '99',
          desired_rights: [],
          issues: [],
        }),
    };
    const device = {
      getUserByEmployeeNumber: jest
        .fn()
        .mockResolvedValue({
          exists: true,
          employee_no: '99',
          user: {
            door_right: '1',
            right_plan: [{ door_no: 1, plan_template_no: '2' }],
            raw: { password: 'secret' },
          },
        }),
    };
    const controller = new AccessReconciliationOperationsController(
      operations as never,
      sync as never,
      device as never,
    );
    const result = await controller.inspectDevice(
      { user: { companyId: 7 } } as never,
      3,
    );
    expect(operations.findOne).toHaveBeenCalledWith({
      where: { id: 3, companyId: 7 },
    });
    expect(result.observed).toEqual({
      exists: true,
      employee_no: '99',
      door_right: '1',
      right_plan: [{ door_no: 1, plan_template_no: '2' }],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('does not contact a device for an operation outside the company', async () => {
    const operations = { findOne: jest.fn().mockResolvedValue(null) };
    const device = { getUserByEmployeeNumber: jest.fn() };
    const controller = new AccessReconciliationOperationsController(
      operations as never,
      {} as never,
      device as never,
    );
    await expect(
      controller.inspectDevice({ user: { companyId: 7 } } as never, 3),
    ).rejects.toThrow('not found');
    expect(device.getUserByEmployeeNumber).not.toHaveBeenCalled();
  });
});
