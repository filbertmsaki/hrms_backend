import { EmployeeAttendanceReadinessService } from './employee-attendance-readiness.service';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';

describe('EmployeeAttendanceReadinessService', () => {
  function queryBuilder<T>(result: T) {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
      getOne: jest.fn().mockResolvedValue(result),
      getRawMany: jest.fn().mockResolvedValue(result),
    };
  }

  function createService(options: {
    hasCompanyDefaultTimetable: boolean;
    employees?: unknown[];
    oneEmployee?: unknown;
    activeTimetableIds?: number[];
    activeShiftIds?: number[];
    deviceAssignedIds?: number[];
    fingerprintIds?: number[];
    cardOrPinIds?: number[];
  }) {
    const timetableRepo = {
      count: jest
        .fn()
        .mockResolvedValue(options.hasCompanyDefaultTimetable ? 1 : 0),
    };
    const employeeQb = queryBuilder(options.employees ?? []);
    if (Object.prototype.hasOwnProperty.call(options, 'oneEmployee')) {
      employeeQb.getOne.mockResolvedValue(options.oneEmployee);
    }

    const rawRows = (ids: number[] = []) =>
      ids.map((employeeId) => ({ employeeId }));

    const employeeRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(employeeQb),
    };
    const employeeTimetableRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(queryBuilder(rawRows(options.activeTimetableIds))),
    };
    const shiftAssignmentRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(queryBuilder(rawRows(options.activeShiftIds))),
    };
    const deviceAssignmentRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(queryBuilder(rawRows(options.deviceAssignedIds))),
    };
    const credentialRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(queryBuilder(rawRows(options.fingerprintIds)))
        .mockReturnValueOnce(queryBuilder(rawRows(options.cardOrPinIds))),
    };

    const service = new EmployeeAttendanceReadinessService(
      employeeRepo as never,
      timetableRepo as never,
      employeeTimetableRepo as never,
      shiftAssignmentRepo as never,
      deviceAssignmentRepo as never,
      credentialRepo as never,
    );

    return { service, employeeRepo, timetableRepo };
  }

  it('returns an empty report when the company has no employees', async () => {
    const { service, timetableRepo, employeeRepo } = createService({
      hasCompanyDefaultTimetable: false,
      employees: [],
    });

    await expect(service.check(17)).resolves.toEqual({
      companyId: 17,
      hasCompanyDefaultTimetable: false,
      summary: {
        totalEmployees: 0,
        readyCount: 0,
        notReadyCount: 0,
        readinessPercentage: 0,
        missingTimetable: 0,
        missingShift: 0,
        missingDevice: 0,
        missingFingerprint: 0,
        missingCredentials: 0,
        inactiveEmployees: 0,
        inactiveUsers: 0,
        missingBranch: 0,
        missingDepartment: 0,
      },
      ready: [],
      notReady: [],
    });
    expect(timetableRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 17 }),
      }),
    );
    expect(employeeRepo.createQueryBuilder).toHaveBeenCalledWith('emp');
  });

  it('classifies ready and blocked employees with summary counters', async () => {
    const readyEmployee = {
      id: 101,
      employee_no: 'EMP-101',
      employment_status: EmploymentStatusEnum.ACTIVE,
      primary_branch_id: 2,
      primary_department_id: 4,
      company_user: {
        status: 'active',
        user: { first_name: 'Asha', last_name: 'Mrema' },
      },
    };
    const blockedEmployee = {
      id: 102,
      employee_no: 'EMP-102',
      employment_status: EmploymentStatusEnum.INACTIVE,
      primary_branch_id: null,
      primary_department_id: null,
      company_user: {
        status: 'inactive',
        user: { first_name: 'Noel', last_name: 'Kato' },
      },
    };

    const { service } = createService({
      hasCompanyDefaultTimetable: true,
      employees: [readyEmployee, blockedEmployee],
      activeShiftIds: [101],
      deviceAssignedIds: [101],
      fingerprintIds: [101],
      cardOrPinIds: [101],
    });

    const report = await service.check(17);

    expect(report.summary).toEqual(
      expect.objectContaining({
        totalEmployees: 2,
        readyCount: 1,
        notReadyCount: 1,
        readinessPercentage: 50,
        missingDevice: 1,
        missingFingerprint: 1,
        missingCredentials: 1,
        inactiveEmployees: 1,
        inactiveUsers: 1,
        missingBranch: 1,
        missingDepartment: 1,
      }),
    );
    expect(report.ready[0]).toEqual(
      expect.objectContaining({
        employeeId: 101,
        fullName: 'Asha Mrema',
        isReady: true,
        readinessScore: 100,
        issues: [],
      }),
    );
    expect(report.notReady[0]).toEqual(
      expect.objectContaining({
        employeeId: 102,
        fullName: 'Noel Kato',
        isReady: false,
        issues: expect.arrayContaining([
          'Employee is not active',
          'System user account is inactive',
          'No branch assigned',
          'No department assigned',
          'No attendance device assigned',
          'No active fingerprint registered',
        ]),
      }),
    );
  });

  it('returns one employee readiness item or null when scoped employee is absent', async () => {
    const employee = {
      id: 201,
      employee_no: 'EMP-201',
      employment_status: EmploymentStatusEnum.ACTIVE,
      primary_branch_id: 7,
      primary_department_id: 9,
      company_user: {
        status: 'active',
        user: { first_name: 'Juma', last_name: 'Ally' },
      },
    };
    const { service } = createService({
      hasCompanyDefaultTimetable: false,
      oneEmployee: employee,
      activeTimetableIds: [201],
      deviceAssignedIds: [201],
      fingerprintIds: [201],
      cardOrPinIds: [201],
    });

    await expect(service.checkOne(17, 201)).resolves.toEqual(
      expect.objectContaining({
        employeeId: 201,
        fullName: 'Juma Ally',
        isReady: true,
        checks: expect.objectContaining({
          hasTimetable: true,
          hasShift: true,
          hasDeviceAssignment: true,
          hasFingerprint: true,
          hasCardOrPin: true,
        }),
      }),
    );

    const missing = createService({
      hasCompanyDefaultTimetable: false,
      oneEmployee: null,
    });
    await expect(missing.service.checkOne(17, 999)).resolves.toBeNull();
  });
});
