import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EmployeeDeviceIdentity } from './entities/employee-device-identity.entity';

export type EmployeeResolutionResult = {
  employeeId: number | null;
  reason: string;
};

@Injectable()
export class AttendanceEmployeeResolverService {
  constructor(
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

    return { employeeId: null, reason: 'IDENTITY_NOT_FOUND' };
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
