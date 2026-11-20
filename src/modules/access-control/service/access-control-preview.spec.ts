import { AccessControlSyncService } from './access-control-sync.service';

function setup(
  options: {
    missingAssignment?: boolean;
    overlap?: boolean;
    multipleTemplates?: boolean;
  } = {},
) {
  const group = { id: 10, companyId: 1, organizationId: 7, status: 'ACTIVE' };
  const member = {
    employeeId: 3,
    employeeName: 'Asha',
    accessGroupId: 10,
    employee: { employment_status: 'active' },
  };
  const door = {
    id: 21,
    doorId: 2,
    deviceId: 1,
    doorNo: 1,
    scheduleTemplateId: 4,
    hikvisionTemplateNo: '1',
  };
  const rows = options.multipleTemplates
    ? [
        door,
        { ...door, id: 22, scheduleTemplateId: 5, hikvisionTemplateNo: '2' },
      ]
    : [door];
  const service = Object.assign(
    Object.create(AccessControlSyncService.prototype),
    {
      accessGroupRepository: {
        findOne: jest.fn().mockResolvedValue(group),
        find: jest.fn().mockResolvedValue(options.overlap ? [{ id: 11 }] : []),
      },
      accessGroupDoorRepository: {
        find: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.accessGroupId === 10
                ? rows
                : [{ accessGroupId: 11, deviceId: 1 }],
            ),
          ),
      },
      accessGroupDeviceRepository: {
        find: jest.fn().mockResolvedValue([{ deviceId: 1 }]),
      },
      accessGroupEmployeeRepository: {
        find: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.accessGroupId === 10
                ? [member]
                : [
                    member,
                    ...(options.overlap
                      ? [{ ...member, accessGroupId: 11 }]
                      : []),
                  ],
            ),
          ),
      },
      accessDoorRepository: {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 2, deviceId: 1, doorNo: 1, doorName: 'Main', isActive: true },
          ]),
      },
      accessScheduleTemplateRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 4,
            deviceId: 1,
            weekPlanId: 6,
            hikvisionTemplateNo: '1',
            enable: true,
            status: 'ACTIVE',
            templateName: 'Day',
          },
          ...(options.multipleTemplates
            ? [
                {
                  id: 5,
                  deviceId: 1,
                  weekPlanId: 6,
                  hikvisionTemplateNo: '2',
                  enable: true,
                  status: 'ACTIVE',
                  templateName: 'Evening',
                },
              ]
            : []),
        ]),
      },
      attendanceDeviceRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 1,
            deviceName: 'Front',
            integrationType: 'hikvision',
            status: 'ACTIVE',
          },
        ]),
      },
      employeeDeviceAssignmentRepository: {
        find: jest
          .fn()
          .mockResolvedValue(
            options.missingAssignment
              ? []
              : [{ employeeId: 3, deviceId: 1, employeeNo: '123' }],
          ),
      },
      accessOrganizationEmployeeRepository: {
        find: jest.fn().mockResolvedValue([{ employeeId: 3 }]),
      },
      employeeAccessCredentialRepository: {
        find: jest.fn().mockResolvedValue([]),
      },
      accessWeekPlanRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 6,
            deviceId: 1,
            hikvisionPlanNo: '1',
            enable: true,
            name: 'Week',
          },
        ]),
      },
    },
  ) as AccessControlSyncService;
  return service;
}

describe('access group preview', () => {
  it('shows the applicable employee, device, door and schedule without syncing', async () => {
    const preview = await setup().previewGroup(1, 10);
    expect(preview.ready).toBe(true);
    expect(preview.access).toEqual([
      expect.objectContaining({
        employee_id: 3,
        employee_no: '123',
        device_id: 1,
        door_id: 2,
        included: true,
      }),
    ]);
  });
  it.each([
    { missingAssignment: true },
    { overlap: true },
    { multipleTemplates: true },
  ])('blocks unsafe sync for %p', async (options) => {
    const service = setup(options);
    expect((await service.previewGroup(1, 10)).ready).toBe(false);
    await expect(service.syncGroup(1, 10)).rejects.toThrow(
      'Access group is not ready to sync',
    );
  });
});
