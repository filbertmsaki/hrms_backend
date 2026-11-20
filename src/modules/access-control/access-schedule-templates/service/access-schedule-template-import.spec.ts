import type { Repository } from 'typeorm';
import type { AttendanceDevice } from '../../attendance-devices/entities/attendance-device.entity';
import type { AccessWeekPlan } from '../../access-week-plans/entity/access-week-plan.entity';
import type { AccessScheduleTemplate } from '../entity/access-schedule-template.entity';
import type { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { AccessScheduleTemplatesService } from './access-schedule-templates.service';

describe('schedule template import feedback', () => {
  it('reports the device status and description without silently treating bad parameters as an empty template', async () => {
    const device = {
      findOne: jest.fn().mockResolvedValue({ id: 1, branchId: null }),
    };
    const hikvision = {
      getUserRightPlanTemplate: jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        raw: 'badParameters',
        parsed: {
          statusString: 'Invalid Content',
          subStatusCode: 'badParameters',
        },
      }),
    };
    const service = new AccessScheduleTemplatesService(
      {} as Repository<AccessScheduleTemplate>,
      {} as Repository<AccessWeekPlan>,
      device as unknown as Repository<AttendanceDevice>,
      hikvision as unknown as HikvisionAccessControlService,
    );
    const result = await service.syncTemplatesFromDevice(1, 1);
    expect(result.failed).toBe(64);
    expect(result.results[0]).toEqual({
      template_no: '1',
      status: 'FAILED',
      reason: 'Device returned HTTP 404: Invalid Content / badParameters',
    });
  });
});
