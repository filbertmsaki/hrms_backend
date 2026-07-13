import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { TimetableStatusEnum } from '../attendance/timetable/timetables/enums/timetable-status.enum';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../access-control/employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeAccessCredentialStatusEnum } from '../../access-control/employee-access-credentials/enum/employee-access-credential-status.enum';

export interface EmployeeReadinessChecks {
  isActiveEmployee: boolean;
  hasActiveUser: boolean;
  hasBranch: boolean;
  hasDepartment: boolean;
  hasTimetable: boolean;
  hasShift: boolean;
  hasDeviceAssignment: boolean;
  hasFingerprint: boolean;
  hasCardOrPin: boolean;
}

export interface EmployeeAttendanceReadinessItem {
  employeeId: number;
  employeeNo: string;
  fullName: string;
  branchId: number | null;
  departmentId: number | null;
  employmentStatus: string;
  isReady: boolean;
  readinessScore: number;
  checks: EmployeeReadinessChecks;
  issues: string[];
}

export interface EmployeeAttendanceReadinessSummary {
  totalEmployees: number;
  readyCount: number;
  notReadyCount: number;
  readinessPercentage: number;
  missingTimetable: number;
  missingShift: number;
  missingDevice: number;
  missingFingerprint: number;
  missingCredentials: number;
  inactiveEmployees: number;
  inactiveUsers: number;
  missingBranch: number;
  missingDepartment: number;
}

export interface EmployeeAttendanceReadinessReport {
  companyId: number;
  hasCompanyDefaultTimetable: boolean;
  summary: EmployeeAttendanceReadinessSummary;
  ready: EmployeeAttendanceReadinessItem[];
  notReady: EmployeeAttendanceReadinessItem[];
}

const REQUIRED_CHECKS: (keyof EmployeeReadinessChecks)[] = [
  'isActiveEmployee',
  'hasActiveUser',
  'hasBranch',
  'hasDepartment',
  'hasTimetable',
  'hasDeviceAssignment',
  'hasFingerprint',
];

@Injectable()
export class EmployeeAttendanceReadinessService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Timetable)
    private readonly timetableRepo: Repository<Timetable>,

    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepo: Repository<EmployeeTimetable>,

    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepo: Repository<ShiftAssignment>,

    @InjectRepository(EmployeeDeviceAssignment)
    private readonly deviceAssignmentRepo: Repository<EmployeeDeviceAssignment>,

    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepo: Repository<EmployeeAccessCredential>,
  ) {}

  async checkOne(
    companyId: number,
    employeeId: number,
  ): Promise<EmployeeAttendanceReadinessItem | null> {
    const hasCompanyDefaultTimetable = await this.timetableRepo
      .count({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
      })
      .then((n) => n > 0);

    const emp = await this.employeeRepo
      .createQueryBuilder('emp')
      .innerJoin('emp.company_user', 'cu')
      .innerJoin('cu.user', 'u')
      .select([
        'emp.id',
        'emp.employee_no',
        'emp.employment_status',
        'emp.primary_branch_id',
        'emp.primary_department_id',
        'cu.status',
        'u.first_name',
        'u.last_name',
      ])
      .where('emp.id = :employeeId', { employeeId })
      .andWhere('cu.company_id = :companyId', { companyId })
      .getOne();

    if (!emp) return null;

    const ids = [employeeId];
    const [
      activeTimetable,
      activeShift,
      deviceAssigned,
      fingerprint,
      cardOrPin,
    ] = await Promise.all([
      this.getEmployeesWithActiveTimetable(companyId, ids),
      this.getEmployeesWithActiveShift(companyId, ids),
      this.getEmployeesWithDeviceAssignment(companyId, ids),
      this.getEmployeesWithFingerprint(companyId, ids),
      this.getEmployeesWithCardOrPin(companyId, ids),
    ]);

    const cu = emp.company_user as CompanyUser & { user: User };
    const user = cu?.user;
    const fullName = user
      ? `${user.first_name} ${user.last_name}`.trim()
      : emp.employee_no;

    const checks: EmployeeReadinessChecks = {
      isActiveEmployee: emp.employment_status === EmploymentStatusEnum.ACTIVE,
      hasActiveUser: cu?.status === 'active',
      hasBranch: emp.primary_branch_id != null,
      hasDepartment: emp.primary_department_id != null,
      hasTimetable:
        activeTimetable.has(employeeId) || hasCompanyDefaultTimetable,
      hasShift:
        activeShift.has(employeeId) ||
        activeTimetable.has(employeeId) ||
        hasCompanyDefaultTimetable,
      hasDeviceAssignment: deviceAssigned.has(employeeId),
      hasFingerprint: fingerprint.has(employeeId),
      hasCardOrPin: cardOrPin.has(employeeId),
    };

    const issues = this.buildIssues(checks);
    const requiredPassed = REQUIRED_CHECKS.filter((k) => checks[k]).length;
    const readinessScore = Math.round(
      (requiredPassed / REQUIRED_CHECKS.length) * 100,
    );

    return {
      employeeId: emp.id,
      employeeNo: emp.employee_no,
      fullName,
      branchId: emp.primary_branch_id,
      departmentId: emp.primary_department_id,
      employmentStatus: emp.employment_status,
      isReady: issues.length === 0,
      readinessScore,
      checks,
      issues,
    };
  }

  async check(companyId: number): Promise<EmployeeAttendanceReadinessReport> {
    const hasCompanyDefaultTimetable = await this.timetableRepo
      .count({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
      })
      .then((n) => n > 0);

    // Load all employees with their company_user and user
    const employees = await this.employeeRepo
      .createQueryBuilder('emp')
      .innerJoin('emp.company_user', 'cu')
      .innerJoin('cu.user', 'u')
      .leftJoin('emp.primary_branch', 'branch')
      .leftJoin('emp.primary_department', 'dept')
      .select([
        'emp.id',
        'emp.employee_no',
        'emp.employment_status',
        'emp.primary_branch_id',
        'emp.primary_department_id',
        'cu.status',
        'u.first_name',
        'u.last_name',
      ])
      .where('cu.company_id = :companyId', { companyId })
      .getMany();

    if (employees.length === 0) {
      return this.emptyReport(companyId, hasCompanyDefaultTimetable);
    }

    const employeeIds = employees.map((e) => e.id);

    // Bulk-load all relevant data for all employees at once
    const [
      activeTimetableEmpIds,
      activeShiftEmpIds,
      deviceAssignedEmpIds,
      fingerprintEmpIds,
      cardOrPinEmpIds,
    ] = await Promise.all([
      this.getEmployeesWithActiveTimetable(companyId, employeeIds),
      this.getEmployeesWithActiveShift(companyId, employeeIds),
      this.getEmployeesWithDeviceAssignment(companyId, employeeIds),
      this.getEmployeesWithFingerprint(companyId, employeeIds),
      this.getEmployeesWithCardOrPin(companyId, employeeIds),
    ]);

    const items: EmployeeAttendanceReadinessItem[] = employees.map((emp) => {
      const cu = emp.company_user as CompanyUser & { user: User };
      const user = cu?.user;
      const fullName = user
        ? `${user.first_name} ${user.last_name}`.trim()
        : emp.employee_no;

      const checks: EmployeeReadinessChecks = {
        isActiveEmployee: emp.employment_status === EmploymentStatusEnum.ACTIVE,
        hasActiveUser: cu?.status === 'active',
        hasBranch: emp.primary_branch_id != null,
        hasDepartment: emp.primary_department_id != null,
        hasTimetable:
          activeTimetableEmpIds.has(emp.id) || hasCompanyDefaultTimetable,
        hasShift:
          activeShiftEmpIds.has(emp.id) ||
          activeTimetableEmpIds.has(emp.id) ||
          hasCompanyDefaultTimetable,
        hasDeviceAssignment: deviceAssignedEmpIds.has(emp.id),
        hasFingerprint: fingerprintEmpIds.has(emp.id),
        hasCardOrPin: cardOrPinEmpIds.has(emp.id),
      };

      const issues = this.buildIssues(checks);
      const requiredPassed = REQUIRED_CHECKS.filter((k) => checks[k]).length;
      const readinessScore = Math.round(
        (requiredPassed / REQUIRED_CHECKS.length) * 100,
      );
      const isReady = issues.length === 0;

      return {
        employeeId: emp.id,
        employeeNo: emp.employee_no,
        fullName,
        branchId: emp.primary_branch_id,
        departmentId: emp.primary_department_id,
        employmentStatus: emp.employment_status,
        isReady,
        readinessScore,
        checks,
        issues,
      };
    });

    const ready = items.filter((i) => i.isReady);
    const notReady = items.filter((i) => !i.isReady);

    const summary: EmployeeAttendanceReadinessSummary = {
      totalEmployees: items.length,
      readyCount: ready.length,
      notReadyCount: notReady.length,
      readinessPercentage:
        items.length > 0 ? Math.round((ready.length / items.length) * 100) : 0,
      missingTimetable: items.filter((i) => !i.checks.hasTimetable).length,
      missingShift: items.filter((i) => !i.checks.hasShift).length,
      missingDevice: items.filter((i) => !i.checks.hasDeviceAssignment).length,
      missingFingerprint: items.filter((i) => !i.checks.hasFingerprint).length,
      missingCredentials: items.filter((i) => !i.checks.hasCardOrPin).length,
      inactiveEmployees: items.filter((i) => !i.checks.isActiveEmployee).length,
      inactiveUsers: items.filter((i) => !i.checks.hasActiveUser).length,
      missingBranch: items.filter((i) => !i.checks.hasBranch).length,
      missingDepartment: items.filter((i) => !i.checks.hasDepartment).length,
    };

    return { companyId, hasCompanyDefaultTimetable, summary, ready, notReady };
  }

  private async getEmployeesWithActiveTimetable(
    companyId: number,
    employeeIds: number[],
  ): Promise<Set<number>> {
    const rows = await this.employeeTimetableRepo
      .createQueryBuilder('et')
      .select('et.employeeId', 'employeeId')
      .where('et.companyId = :companyId', { companyId })
      .andWhere('et.employeeId IN (:...ids)', { ids: employeeIds })
      .andWhere('et.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('(et.effectiveTo IS NULL OR et.effectiveTo >= CURRENT_DATE)')
      .getRawMany<{ employeeId: number }>();

    return new Set(rows.map((r) => Number(r.employeeId)));
  }

  private async getEmployeesWithActiveShift(
    companyId: number,
    employeeIds: number[],
  ): Promise<Set<number>> {
    const rows = await this.shiftAssignmentRepo
      .createQueryBuilder('sa')
      .select('sa.employeeId', 'employeeId')
      .where('sa.companyId = :companyId', { companyId })
      .andWhere('sa.employeeId IN (:...ids)', { ids: employeeIds })
      .andWhere('sa.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      })
      .andWhere('(sa.effectiveTo IS NULL OR sa.effectiveTo >= CURRENT_DATE)')
      .getRawMany<{ employeeId: number }>();

    return new Set(rows.map((r) => Number(r.employeeId)));
  }

  private async getEmployeesWithDeviceAssignment(
    companyId: number,
    employeeIds: number[],
  ): Promise<Set<number>> {
    const rows = await this.deviceAssignmentRepo
      .createQueryBuilder('da')
      .select('da.employeeId', 'employeeId')
      .where('da.companyId = :companyId', { companyId })
      .andWhere('da.employeeId IN (:...ids)', { ids: employeeIds })
      .andWhere('da.deletedAt IS NULL')
      .andWhere('(da.validEndTime IS NULL OR da.validEndTime >= CURRENT_DATE)')
      .getRawMany<{ employeeId: number }>();

    return new Set(rows.map((r) => Number(r.employeeId)));
  }

  private async getEmployeesWithFingerprint(
    companyId: number,
    employeeIds: number[],
  ): Promise<Set<number>> {
    const rows = await this.credentialRepo
      .createQueryBuilder('cred')
      .select('cred.employeeId', 'employeeId')
      .where('cred.companyId = :companyId', { companyId })
      .andWhere('cred.employeeId IN (:...ids)', { ids: employeeIds })
      .andWhere('cred.credentialType = :type', {
        type: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      })
      .andWhere('cred.hasFingerprint = true')
      .andWhere('cred.credentialStatus = :status', {
        status: EmployeeAccessCredentialStatusEnum.ACTIVE,
      })
      .andWhere('cred.deletedAt IS NULL')
      .getRawMany<{ employeeId: number }>();

    return new Set(rows.map((r) => Number(r.employeeId)));
  }

  private async getEmployeesWithCardOrPin(
    companyId: number,
    employeeIds: number[],
  ): Promise<Set<number>> {
    const rows = await this.credentialRepo
      .createQueryBuilder('cred')
      .select('cred.employeeId', 'employeeId')
      .where('cred.companyId = :companyId', { companyId })
      .andWhere('cred.employeeId IN (:...ids)', { ids: employeeIds })
      .andWhere('cred.credentialType IN (:...types)', {
        types: [
          EmployeeAccessCredentialTypeEnum.CARD,
          EmployeeAccessCredentialTypeEnum.PIN,
          EmployeeAccessCredentialTypeEnum.PASSWORD,
        ],
      })
      .andWhere('cred.credentialStatus = :status', {
        status: EmployeeAccessCredentialStatusEnum.ACTIVE,
      })
      .andWhere('cred.deletedAt IS NULL')
      .getRawMany<{ employeeId: number }>();

    return new Set(rows.map((r) => Number(r.employeeId)));
  }

  private buildIssues(checks: EmployeeReadinessChecks): string[] {
    const issues: string[] = [];
    if (!checks.isActiveEmployee) issues.push('Employee is not active');
    if (!checks.hasActiveUser) issues.push('System user account is inactive');
    if (!checks.hasBranch) issues.push('No branch assigned');
    if (!checks.hasDepartment) issues.push('No department assigned');
    if (!checks.hasTimetable) issues.push('No timetable assigned or available');
    if (!checks.hasShift) issues.push('No shift resolved for this employee');
    if (!checks.hasDeviceAssignment)
      issues.push('No attendance device assigned');
    if (!checks.hasFingerprint) issues.push('No active fingerprint registered');
    return issues;
  }

  private emptyReport(
    companyId: number,
    hasCompanyDefaultTimetable: boolean,
  ): EmployeeAttendanceReadinessReport {
    return {
      companyId,
      hasCompanyDefaultTimetable,
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
    };
  }
}
