import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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

    const assignmentWhere =
      typeof deviceId === 'number'
        ? [
            {
              companyId,
              employeeNo: normalized,
              deviceId,
              employeeId: Not(IsNull()),
            },
            {
              companyId,
              employeeNo: normalized,
              deviceId: IsNull(),
              employeeId: Not(IsNull()),
            },
          ]
        : [
            {
              companyId,
              employeeNo: normalized,
              deviceId: IsNull(),
              employeeId: Not(IsNull()),
            },
          ];
    const existingAssignment = await this.assignmentRepository.findOne({
      where: assignmentWhere,
      order: { updatedAt: 'DESC' },
    });

    if (existingAssignment?.employeeId) {
      return {
        employeeId: existingAssignment.employeeId,
        reason: 'ASSIGNMENT_MAP',
      };
    }

    const existingIdentity = await this.identityRepository.findOne({
      where:
        typeof deviceId === 'number'
          ? [
              { companyId, employeeNo: normalized, deviceId, isActive: true },
              {
                companyId,
                employeeNo: normalized,
                deviceId: IsNull(),
                isActive: true,
              },
            ]
          : [
              {
                companyId,
                employeeNo: normalized,
                deviceId: IsNull(),
                isActive: true,
              },
            ],
      order: { updatedAt: 'DESC' },
    });

    if (existingIdentity) {
      return {
        employeeId: existingIdentity.employeeId,
        reason: 'IDENTITY_MAP',
      };
    }

    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('companyUser.company_id = :companyId', { companyId })
      .andWhere('employee.employee_no = :employeeNo', {
        employeeNo: normalized,
      })
      .orderBy('employee.id', 'ASC')
      .getOne();

    if (employee) {
      return {
        employeeId: employee.id,
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
