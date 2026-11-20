import { AccessControlSyncService } from './access-control-sync.service';

describe('device setup preview', () => {
  it('summarizes linked groups without making device calls or returning credentials', async () => {
    const service = Object.assign(
      Object.create(AccessControlSyncService.prototype),
      {
        attendanceDeviceRepository: {
          findOne: jest.fn().mockResolvedValue({
            id: 2,
            companyId: 7,
            deviceName: 'Main',
            status: 'ACTIVE',
            metadata: null,
          }),
        },
        accessGroupDeviceRepository: {
          find: jest.fn().mockResolvedValue([{ accessGroupId: 4 }]),
        },
        accessGroupRepository: {
          find: jest.fn().mockResolvedValue([{ id: 4, name: 'Staff' }]),
        },
        previewGroup: jest.fn().mockResolvedValue({
          ready: true,
          issues: [],
          access: [
            { employee_id: 8, device_id: 2, included: true },
            { employee_id: 8, device_id: 2, included: true },
            { employee_id: 9, device_id: 3, included: true },
          ],
        }),
      },
    ) as AccessControlSyncService;
    const result = await service.previewDeviceSetup(7, 2);
    expect(result.included_employee_count).toBe(1);
    expect(result.groups[0].included_employee_count).toBe(1);
    expect(result.notes.join(' ')).toContain('does not verify');
    expect(JSON.stringify(result)).not.toContain('apiPassword');
  });
});
