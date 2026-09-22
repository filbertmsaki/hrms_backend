import { HrLaunchReadinessService } from './hr-launch-readiness.service';

describe('HrLaunchReadinessService', () => {
  const requiredPermissions = [
    'companies:read',
    'companies:update',
    'company_users:read',
    'company_users:create',
    'company_users:update',
    'company_users:delete',
    'attendance_policies:read',
    'attendance_policies:create',
    'attendance_policies:update',
    'attendance_policies:delete',
    'attendance_devices:read',
    'attendance_devices:create',
    'attendance_devices:update',
    'attendance_devices:delete',
    'attendance_processing:read',
    'attendance_recalculation:execute',
    'attendance_summaries:read',
    'employee_access_credentials:read',
    'employee_access_credentials:update',
    'self_service_requests:approve',
    'hrms_launch_readiness:read',
  ];

  function createService(options: {
    activeUsers: number;
    activeBranches: number;
    activeDepartments: number;
    employees: number;
    activeAttendancePolicies: number;
    activeShifts: number;
    defaultTimetables: number;
    activeDevices: number;
    attendanceSummaries: number;
    existingPermissions: string[];
  }) {
    const countRepository = (value: number) => ({
      count: jest.fn().mockResolvedValue(value),
    });
    const employeeQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(options.employees),
    };
    const permissionQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue(
          options.existingPermissions.map((name) => ({ name })),
        ),
    };
    const employeeRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(employeeQueryBuilder),
    };
    const permissionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(permissionQueryBuilder),
    };

    const service = new HrLaunchReadinessService(
      countRepository(options.activeUsers) as never,
      countRepository(options.activeBranches) as never,
      countRepository(options.activeDepartments) as never,
      employeeRepository as never,
      countRepository(options.activeAttendancePolicies) as never,
      countRepository(options.activeShifts) as never,
      countRepository(options.defaultTimetables) as never,
      countRepository(options.attendanceSummaries) as never,
      countRepository(options.activeDevices) as never,
      permissionRepository as never,
    );

    return { service, employeeRepository, permissionQueryBuilder };
  }

  it('marks launch ready when every required setup check and permission is present', async () => {
    const { service, employeeRepository, permissionQueryBuilder } =
      createService({
        activeUsers: 2,
        activeBranches: 1,
        activeDepartments: 3,
        employees: 14,
        activeAttendancePolicies: 1,
        activeShifts: 4,
        defaultTimetables: 1,
        activeDevices: 0,
        attendanceSummaries: 0,
        existingPermissions: requiredPermissions,
      });

    const report = await service.check(42);

    expect(report).toEqual(
      expect.objectContaining({
        is_ready_for_launch: true,
        readiness_percentage: 100,
        blockers: [],
        missing_permissions: [],
        warnings: [
          'Active attendance device configured',
          'Attendance summaries have been generated/tested',
        ],
      }),
    );
    expect(report.counts).toEqual(
      expect.objectContaining({
        active_users: 2,
        branches: 1,
        departments: 3,
        employees: 14,
        active_attendance_policies: 1,
        shifts: 4,
        default_timetables: 1,
      }),
    );
    expect(employeeRepository.createQueryBuilder).toHaveBeenCalledWith('e');
    expect(permissionQueryBuilder.where).toHaveBeenCalledWith(
      'p.name IN (:...names)',
      { names: requiredPermissions },
    );
  });

  it('returns blockers, missing permissions, and actionable next steps for incomplete setup', async () => {
    const { service } = createService({
      activeUsers: 1,
      activeBranches: 0,
      activeDepartments: 0,
      employees: 0,
      activeAttendancePolicies: 0,
      activeShifts: 1,
      defaultTimetables: 0,
      activeDevices: 0,
      attendanceSummaries: 2,
      existingPermissions: ['companies:read', 'company_users:read'],
    });

    const report = await service.check(42);

    expect(report.is_ready_for_launch).toBe(false);
    expect(report.readiness_percentage).toBe(25);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        'Company has active branches',
        'Company has active departments',
        'Company has registered employees',
        'Active attendance policy configured',
        'Default active timetable configured',
        'Required HRMS permissions are seeded',
      ]),
    );
    expect(report.missing_permissions).toEqual(
      expect.arrayContaining([
        'companies:update',
        'attendance_processing:read',
        'hrms_launch_readiness:read',
      ]),
    );
    expect(report.next_steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BRANCHES',
          required: true,
          action: 'Create at least one active branch.',
        }),
        expect.objectContaining({
          code: 'MISSING_PERMISSIONS',
          required: true,
        }),
      ]),
    );
  });
});
