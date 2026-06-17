import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../access-control/attendance-devices/enums/attendance-device-status.enum';
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';
import { mergeMetadata } from './hikvision-utils';

@Injectable()
export class HikvisionHelperService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly identityRepository: Repository<EmployeeDeviceIdentity>,
  ) {}

  async findHikvisionDeviceOrFail(
    companyId: number,
    deviceId: number,
    requireActive = false,
  ): Promise<AttendanceDevice> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId, companyId },
    });

    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === 'hikvision' ||
      (device.vendorName || '').toLowerCase().includes('hikvision');

    if (!isHikvision) {
      throw new BadRequestException(
        'Requested device is not configured as Hikvision',
      );
    }

    if (requireActive && device.status !== AttendanceDeviceStatusEnum.ACTIVE) {
      throw new BadRequestException('Hikvision device is inactive');
    }

    return device;
  }

  async upsertDeviceIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number,
    metadataPatch?: Record<string, unknown> | null,
    manager?: EntityManager | null,
  ): Promise<void> {
    const repo =
      manager?.getRepository(EmployeeDeviceIdentity) ?? this.identityRepository;

    let identity = await repo.findOne({
      where: { companyId, employeeId, deviceId },
    });

    if (!identity) {
      identity = await repo.findOne({
        where: { companyId, deviceId, employeeNo },
      });
    }

    if (!identity) {
      identity = repo.create({
        companyId,
        employeeId,
        employeeNo,
        deviceId,
        isActive: true,
      });
    } else {
      identity.companyId = companyId;
      identity.employeeId = employeeId;
      identity.employeeNo = employeeNo;
      identity.deviceId = deviceId;
      identity.isActive = true;
    }

    if (metadataPatch) {
      identity.metadata = mergeMetadata(identity.metadata, metadataPatch);
    }

    await repo.save(identity);
  }
}
