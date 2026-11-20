import type { Repository } from 'typeorm';
import type { AttendanceDevice } from '../entities/attendance-device.entity';
import type { Employee } from '../../../hr/employees/entities/employee.entity';
import type { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import type { Branch } from '../../../hr/branches/entities/branch.entity';
import type { HikvisionService } from '../../../hikvision/hikvision.service';
import { AccessControlAttendanceDevicesService } from './attendance-devices.service';

describe('device employee names', () => {
  it('uses the device name for unlinked users, retains linked HR names, and searches device names', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 1,
            employeeId: null,
            employeeName: '  Device User  ',
            employee: null,
          },
          {
            id: 2,
            employeeId: 12,
            employeeName: 'Device Name',
            employee: { first_name: 'HR', last_name: 'Name' },
          },
          { id: 3, employeeId: null, employeeName: '   ', employee: null },
        ],
        3,
      ]),
    };
    const service = new AccessControlAttendanceDevicesService(
      {
        exists: jest.fn().mockResolvedValue(true),
      } as unknown as Repository<AttendanceDevice>,
      {} as Repository<Employee>,
      {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<EmployeeDeviceAssignment>,
      {} as Repository<Branch>,
      {} as HikvisionService,
    );
    const result = await service.findDeviceEmployees(1, 1, {
      search: 'Device',
    });
    expect(
      result.data.map((row) => [row.employee_name, row.device_user_name]),
    ).toEqual([
      ['Device User', 'Device User'],
      ['HR Name', 'Device Name'],
      [null, null],
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('assignment.employee_name ILIKE :term'),
      { term: '%Device%' },
    );
  });
});
