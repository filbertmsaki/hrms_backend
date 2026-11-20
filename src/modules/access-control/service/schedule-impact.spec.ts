import { AccessControlSyncService } from './access-control-sync.service';

describe('access schedule impact', () => {
  it('counts distinct active employees and only company-scoped groups', async () => {
    const service = Object.assign(
      Object.create(AccessControlSyncService.prototype),
      {
        accessWeekPlanRepository: {
          findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Week' }),
        },
        accessScheduleTemplateRepository: {
          find: jest
            .fn()
            .mockResolvedValue([
              { id: 2, templateName: 'Office', deviceId: 3 },
            ]),
        },
        accessGroupDoorRepository: {
          find: jest.fn().mockResolvedValue([
            { accessGroupId: 4, deviceId: 3 },
            { accessGroupId: 99, deviceId: 88 },
          ]),
        },
        accessGroupRepository: {
          find: jest
            .fn()
            .mockResolvedValue([{ id: 4, name: 'Staff', status: 'ACTIVE' }]),
        },
        attendanceDeviceRepository: {
          find: jest
            .fn()
            .mockResolvedValue([
              { id: 3, deviceName: 'Main', status: 'ACTIVE' },
            ]),
        },
        accessGroupEmployeeRepository: {
          find: jest
            .fn()
            .mockResolvedValue([
              { employeeId: 5 },
              { employeeId: 5 },
              { employeeId: 6 },
            ]),
        },
        employeeDeviceRightPlanRepository: {
          find: jest.fn().mockResolvedValue([]),
        },
      },
    ) as AccessControlSyncService;
    const result = await service.previewScheduleImpact(7, 'week-plan', 1);
    expect(result.linked_employee_count).toBe(2);
    expect(result.groups).toEqual([{ id: 4, name: 'Staff', status: 'ACTIVE' }]);
    expect(result.devices).toEqual([{ id: 3, name: 'Main', status: 'ACTIVE' }]);
    expect(result.warning).toContain('does not check');
  });
});
