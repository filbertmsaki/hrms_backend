import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDeviceIdentity } from './entities/employee-device-identity.entity';

export type EmployeeResolutionResult = {
  employeeId: number | null;
  reason: string;
};

@Injectable()
export class AttendanceEmployeeResolverService {
  constructor(
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly identityRepository: Repository<EmployeeDeviceIdentity>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async resolveEmployeeId(
    companyId: number,
    employeeNo: string,
    deviceId: number | null,
  ): Promise<EmployeeResolutionResult> {
    const normalized = employeeNo.trim();
    if (!normalized) {
      return { employeeId: null, reason: 'EMPTY_EMPLOYEE_NO' };
    }

    // Some Hikvision events omit the leading zeroes returned by UserInfo.
    // A deliberate unlink must block both representations of the same number.
    if (typeof deviceId === 'number' && /^\d+$/.test(normalized)) {
      const unlinked = await this.assignmentRepository.find({
        where: { companyId, deviceId, employeeId: IsNull() },
        select: ['employeeNo', 'deviceId', 'metadata'],
      });
      const canonical = normalized.replace(/^0+(?=\d)/, '');
      if (
        unlinked.some(
          (row) =>
            row.deviceId === deviceId &&
            row.metadata?.attendance_identity_unlinked === true &&
            /^\d+$/.test(row.employeeNo ?? '') &&
            row.employeeNo.replace(/^0+(?=\d)/, '') === canonical,
        )
      ) {
        return { employeeId: null, reason: 'EXPLICITLY_UNLINKED' };
      }
    }

    // A device-specific mapping takes priority over a global fallback, even
    // when the latter was edited more recently. Conflicting mappings are not
    // guessed: they remain unmatched for operator review.
    const scopes = typeof deviceId === 'number' ? [deviceId, null] : [null];
    const [allAssignments, allIdentities] = await Promise.all([
      this.assignmentRepository.find({
        where: scopes.map((scope) => ({
          companyId,
          employeeNo: normalized,
          deviceId: scope === null ? IsNull() : scope,
        })),
      }),
      this.identityRepository.find({
        where: scopes.map((scope) => ({
          companyId,
          employeeNo: normalized,
          deviceId: scope === null ? IsNull() : scope,
          isActive: true,
        })),
      }),
    ]);
    for (const scope of scopes) {
      const assignments = allAssignments.filter(
        (row) => row.deviceId === scope,
      );
      // An operator-requested unlink must not be undone by a global identity
      // or by the employee-number fallback. Ordinary unlinked imports are not
      // blockers: only the explicit marker has this meaning.
      if (
        assignments.some(
          (row) => row.metadata?.attendance_identity_unlinked === true,
        )
      ) {
        return { employeeId: null, reason: 'EXPLICITLY_UNLINKED' };
      }
      const identities = allIdentities.filter((row) => row.deviceId === scope);
      const employeeIds = [
        ...new Set(
          [
            ...assignments.map((row) => row.employeeId),
            ...identities.map((row) => row.employeeId),
          ].filter((id): id is number => id !== null),
        ),
      ];
      if (employeeIds.length > 1)
        return { employeeId: null, reason: 'AMBIGUOUS_IDENTITY' };
      if (employeeIds.length === 1)
        return {
          employeeId: employeeIds[0],
          reason: assignments.some((row) => row.employeeId === employeeIds[0])
            ? 'ASSIGNMENT_MAP'
            : 'IDENTITY_MAP',
        };
    }

    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('companyUser.company_id = :companyId', { companyId })
      .andWhere('employee.employee_no = :employeeNo', {
        employeeNo: normalized,
      })
      .orderBy('employee.id', 'ASC')
      .take(2)
      .getMany();

    if (employees.length > 1)
      return { employeeId: null, reason: 'AMBIGUOUS_EMPLOYEE_NO' };
    if (employees.length === 1) {
      return {
        employeeId: employees[0].id,
        reason: 'EMPLOYEE_NO_MATCH',
      };
    }

    return { employeeId: null, reason: 'IDENTITY_NOT_FOUND' };
  }

  private async upsertIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number | null,
  ) {
    const current = await this.identityRepository.findOne({
      where: {
        companyId,
        employeeId,
        employeeNo,
        deviceId: deviceId ?? IsNull(),
      },
    });

    if (current) {
      if (!current.isActive) {
        current.isActive = true;
        await this.identityRepository.save(current);
      }
      return;
    }

    await this.identityRepository.save(
      this.identityRepository.create({
        companyId,
        employeeId,
        employeeNo,
        deviceId,
        isActive: true,
      }),
    );
  }
}
