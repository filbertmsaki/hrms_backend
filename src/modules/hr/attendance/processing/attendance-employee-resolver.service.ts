import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDeviceIdentity } from './entities/employee-device-identity.entity';

export type EmployeeResolutionResult = {
  employeeId: number | null;
  reason: string;
};

@Injectable()
export class AttendanceEmployeeResolverService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly identityRepository: Repository<EmployeeDeviceIdentity>,
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

    const existingIdentity = await this.identityRepository.findOne({
      where: [
        { companyId, employeeNo: normalized, deviceId: deviceId ?? IsNull(), isActive: true },
        { companyId, employeeNo: normalized, deviceId: IsNull(), isActive: true },
      ],
      order: { updatedAt: 'DESC' },
    });

    if (existingIdentity) {
      return { employeeId: existingIdentity.employeeId, reason: 'IDENTITY_MAP' };
    }

    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('membership.company_id = :companyId', { companyId })
      .andWhere('employee.employee_no = :employeeNo', { employeeNo: normalized })
      .getOne();

    if (!employee) {
      return { employeeId: null, reason: 'EMPLOYEE_NOT_FOUND' };
    }

    await this.upsertIdentity(companyId, employee.id, normalized, deviceId);
    return { employeeId: employee.id, reason: 'EMPLOYEE_NO_MATCH' };
  }

  private async upsertIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number | null,
  ) {
    const current = await this.identityRepository.findOne({
      where: { companyId, employeeId, employeeNo, deviceId: deviceId ?? IsNull() },
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
