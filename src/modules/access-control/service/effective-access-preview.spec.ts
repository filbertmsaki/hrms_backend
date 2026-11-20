import { AccessControlSyncService } from './access-control-sync.service';

function createService() {
  return Object.assign(Object.create(AccessControlSyncService.prototype), {
    findEmployeeOrFail: jest
      .fn()
      .mockResolvedValue({ id: 1, employment_status: 'active' }),
    attendanceDeviceRepository: {
      findOne: jest.fn().mockResolvedValue({
        id: 2,
        companyId: 7,
        deviceName: 'Main',
        status: 'ACTIVE',
      }),
    },
    accessGroupEmployeeRepository: {
      find: jest
        .fn()
        .mockResolvedValue([{ accessGroupId: 10 }, { accessGroupId: 11 }]),
    },
    accessGroupRepository: {
      find: jest.fn().mockResolvedValue([
        { id: 10, name: 'Staff', organizationId: 8 },
        { id: 11, name: 'Managers', organizationId: 8 },
      ]),
    },
    accessGroupDoorRepository: {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          accessGroupId: 10,
          doorId: 3,
          doorNo: 1,
          scheduleTemplateId: 4,
          hikvisionTemplateNo: '1',
        },
        {
          id: 2,
          accessGroupId: 11,
          doorId: 3,
          doorNo: 1,
          scheduleTemplateId: 4,
          hikvisionTemplateNo: '1',
        },
      ]),
    },
    accessGroupDeviceRepository: {
      find: jest
        .fn()
        .mockResolvedValue([{ accessGroupId: 10 }, { accessGroupId: 11 }]),
    },
    employeeDeviceAssignmentRepository: {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 9, employeeNo: '99', syncStatus: 'SYNCED' }),
    },
    accessDoorRepository: {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 3, deviceId: 2, doorNo: 1, doorName: 'Entry', isActive: true },
        ]),
    },
    accessScheduleTemplateRepository: {
      find: jest.fn().mockResolvedValue([
        {
          id: 4,
          deviceId: 2,
          weekPlanId: 5,
          enable: true,
          status: 'ACTIVE',
          hikvisionTemplateNo: '1',
          templateName: 'Weekday',
        },
      ]),
    },
    accessOrganizationEmployeeRepository: {
      find: jest.fn().mockResolvedValue([{ organizationId: 8 }]),
    },
    employeeDeviceRightPlanRepository: {
      find: jest
        .fn()
        .mockResolvedValue([{ doorNo: 1, hikvisionTemplateNo: '1' }]),
    },
    accessWeekPlanRepository: {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 5, deviceId: 2, enable: true, hikvisionPlanNo: '1' },
        ]),
    },
  }) as AccessControlSyncService;
}

describe('effective access preview', () => {
  it('scopes the employee and device to the company and labels local state as unverified', async () => {
    const service = createService();
    const preview = await service.previewEffectiveAccess(7, 1, 2);
    expect(preview.ready).toBe(true);
    expect(preview.device_state).toBe('NOT_VERIFIED');
    expect(preview.desired_rights[0].groups).toEqual([
      { id: 10, name: 'Staff' },
      { id: 11, name: 'Managers' },
    ]);
    const deviceRepo = (
      service as unknown as {
        attendanceDeviceRepository: { findOne: jest.Mock };
      }
    ).attendanceDeviceRepository;
    expect(deviceRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2, companyId: 7 } }),
    );
  });

  it('fails closed when the device is outside the tenant', async () => {
    const service = createService();
    const deviceRepo = (
      service as unknown as {
        attendanceDeviceRepository: { findOne: jest.Mock };
      }
    ).attendanceDeviceRepository;
    deviceRepo.findOne.mockResolvedValue(null);
    await expect(service.previewEffectiveAccess(7, 1, 2)).rejects.toThrow(
      'Attendance device not found',
    );
  });

  it('previews removal while retaining rights provided by the other group', async () => {
    const service = createService();
    const groupDoors = (
      service as unknown as { accessGroupDoorRepository: { find: jest.Mock } }
    ).accessGroupDoorRepository;
    groupDoors.find.mockResolvedValue([
      {
        id: 2,
        accessGroupId: 11,
        doorId: 3,
        doorNo: 1,
        scheduleTemplateId: 4,
        hikvisionTemplateNo: '1',
      },
    ]);
    const preview = await service.previewEffectiveAccess(7, 1, 2, 10);
    expect(preview.excluded_group_id).toBe(10);
    expect(preview.desired_rights[0].groups).toEqual([
      { id: 11, name: 'Managers' },
    ]);
    expect(preview.device_state).toBe('NOT_VERIFIED');
    await expect(service.previewEffectiveAccess(7, 1, 2, 999)).rejects.toThrow(
      'Active group membership not found',
    );
  });
});
