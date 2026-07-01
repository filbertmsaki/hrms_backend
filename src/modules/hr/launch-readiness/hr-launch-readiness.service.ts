import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AttendancePolicy } from '../attendance/policies/entities/attendance-policy.entity';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../attendance/timetable/timetables/enums/timetable-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../access-control/attendance-devices/enums/attendance-device-status.enum';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Permission } from '../../permissions/entities/permission.entity';

export interface ReadinessCheck {
  code: string;
  label: string;
  required: boolean;
  complete: boolean;
  count: number;
}

@Injectable()
export class HrLaunchReadinessService {
  constructor(
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,

    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,

    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,

    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,

    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,

    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,

    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async check(companyId: number) {
    const requiredPermissions = this.getRequiredPermissions();

    const [
      activeUsers,
      activeBranches,
      activeDepartments,
      employees,
      activeAttendancePolicies,
      activeShifts,
      defaultTimetables,
      activeDevices,
      attendanceSummaries,
      existingPermissions,
    ] = await Promise.all([
      this.companyUserRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),

      this.branchRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),

      this.departmentRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),

      this.employeeRepository
        .createQueryBuilder('e')
        .innerJoin('e.company_user', 'cu')
        .where('cu.company_id = :companyId', { companyId })
        .getCount(),

      this.attendancePolicyRepository.count({
        where: { company_id: companyId, is_active: true },
      }),

      this.shiftRepository.count({ where: { companyId } }),

      this.timetableRepository.count({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
      }),

      this.attendanceDeviceRepository.count({
        where: { companyId, status: AttendanceDeviceStatusEnum.ACTIVE },
      }),

      this.attendanceDailySummaryRepository.count({ where: { companyId } }),

      this.permissionRepository
        .createQueryBuilder('p')
        .where('p.name IN (:...names)', { names: requiredPermissions })
        .getMany(),
    ]);

    const existingNames = new Set(existingPermissions.map((p) => p.name));
    const missingPermissions = requiredPermissions.filter(
      (p) => !existingNames.has(p),
    );

    const checks: ReadinessCheck[] = [
      {
        code: 'ACTIVE_COMPANY_USERS',
        label: 'Company has active users',
        required: true,
        complete: activeUsers > 0,
        count: activeUsers,
      },
      {
        code: 'BRANCHES',
        label: 'Company has active branches',
        required: true,
        complete: activeBranches > 0,
        count: activeBranches,
      },
      {
        code: 'DEPARTMENTS',
        label: 'Company has active departments',
        required: true,
        complete: activeDepartments > 0,
        count: activeDepartments,
      },
      {
        code: 'EMPLOYEES',
        label: 'Company has registered employees',
        required: true,
        complete: employees > 0,
        count: employees,
      },
      {
        code: 'ATTENDANCE_POLICY',
        label: 'Active attendance policy configured',
        required: true,
        complete: activeAttendancePolicies > 0,
        count: activeAttendancePolicies,
      },
      {
        code: 'SHIFTS',
        label: 'At least one shift configured',
        required: true,
        complete: activeShifts > 0,
        count: activeShifts,
      },
      {
        code: 'DEFAULT_TIMETABLE',
        label: 'Default active timetable configured',
        required: true,
        complete: defaultTimetables > 0,
        count: defaultTimetables,
      },
      {
        code: 'ATTENDANCE_DEVICE',
        label: 'Active attendance device configured',
        required: false,
        complete: activeDevices > 0,
        count: activeDevices,
      },
      {
        code: 'ATTENDANCE_SUMMARIES',
        label: 'Attendance summaries have been generated/tested',
        required: false,
        complete: attendanceSummaries > 0,
        count: attendanceSummaries,
      },
      {
        code: 'PERMISSIONS',
        label: 'Required HRMS permissions are seeded',
        required: true,
        complete: missingPermissions.length === 0,
        count: existingPermissions.length,
      },
    ];

    const blockers = checks
      .filter((c) => c.required && !c.complete)
      .map((c) => c.label);

    const warnings = checks
      .filter((c) => !c.required && !c.complete)
      .map((c) => c.label);

    const requiredChecks = checks.filter((c) => c.required);
    const completedRequired = requiredChecks.filter((c) => c.complete);
    const readinessPercentage = Math.round(
      (completedRequired.length / requiredChecks.length) * 100,
    );

    return {
      is_ready_for_launch: blockers.length === 0,
      readiness_percentage: readinessPercentage,
      blockers,
      warnings,
      missing_permissions: missingPermissions,
      counts: {
        active_users: activeUsers,
        branches: activeBranches,
        departments: activeDepartments,
        employees,
        active_attendance_policies: activeAttendancePolicies,
        shifts: activeShifts,
        default_timetables: defaultTimetables,
        active_attendance_devices: activeDevices,
        attendance_summaries: attendanceSummaries,
      },
      checks,
      next_steps: this.buildNextSteps(checks, missingPermissions),
    };
  }

  private getRequiredPermissions(): string[] {
    return [
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
  }

  private buildNextSteps(
    checks: ReadinessCheck[],
    missingPermissions: string[],
  ) {
    const actions: Record<string, string> = {
      ACTIVE_COMPANY_USERS: 'Add at least one active company user.',
      BRANCHES: 'Create at least one active branch.',
      DEPARTMENTS: 'Create at least one active department.',
      EMPLOYEES: 'Register employees and link them to company users.',
      ATTENDANCE_POLICY: 'Create and activate an attendance policy.',
      SHIFTS: 'Create at least one shift.',
      DEFAULT_TIMETABLE: 'Create one active default timetable.',
      ATTENDANCE_DEVICE:
        'Add an attendance device if biometric/device attendance is required.',
      ATTENDANCE_SUMMARIES:
        'Run attendance processing for a test employee and confirm daily summary output.',
      PERMISSIONS: 'Seed missing HRMS permissions.',
    };

    const steps = checks
      .filter((c) => !c.complete)
      .map((c) => ({
        code: c.code,
        label: c.label,
        required: c.required,
        action: actions[c.code] ?? 'Complete this setup item.',
      }));

    if (missingPermissions.length > 0) {
      steps.push({
        code: 'MISSING_PERMISSIONS',
        label: 'Missing permissions must be seeded',
        required: true,
        action: `Seed these permissions: ${missingPermissions.join(', ')}`,
      });
    }

    return steps;
  }
}
