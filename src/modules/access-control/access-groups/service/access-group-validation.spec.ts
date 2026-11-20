import { AccessGroupsService } from './access-groups.service';

describe('group door validation', () => {
  it('rejects a mixed batch before saving when a door is linked to another device', async () => {
    const save = jest.fn();
    const service = Object.assign(
      Object.create(AccessGroupsService.prototype),
      {
        groupRepository: {
          findOne: jest.fn().mockResolvedValue({ id: 10, companyId: 1 }),
        },
        accessDoorRepository: {
          find: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
          findOne: jest
            .fn()
            .mockImplementation(({ where }) =>
              Promise.resolve({ id: where.id, deviceId: where.id, doorNo: 1 }),
            ),
        },
        scheduleTemplateRepository: {
          findOne: jest
            .fn()
            .mockImplementation(({ where }) =>
              Promise.resolve({ id: where.id, deviceId: null }),
            ),
        },
        attendanceDeviceRepository: {
          findOne: jest.fn().mockResolvedValue({ id: 1 }),
        },
        accessGroupDoorRepository: { save },
      },
    ) as AccessGroupsService;
    await expect(
      service.assignDoors(1, 10, {
        items: [
          { door_id: 1, schedule_template_id: 1 },
          { door_id: 2, schedule_template_id: 1, device_id: 99 },
        ],
      }),
    ).rejects.toThrow('different device');
    expect(save).not.toHaveBeenCalled();
  });
});
