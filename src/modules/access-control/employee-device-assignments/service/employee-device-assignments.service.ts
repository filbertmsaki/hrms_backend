import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeDeviceIdentity } from '../../../hr/attendance/processing/entities/employee-device-identity.entity';
import { AssignEmployeeDevicesDto } from '../dto/assign-employee-devices.dto';
import { EmployeeDeviceAssignment } from '../entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../enum/employee-device-assignment-sync-status.enum';

@Injectable()
export class EmployeeDeviceAssignmentsService {
  constructor(
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly employeeDeviceIdentityRepository: Repository<EmployeeDeviceIdentity>,
  ) {}

  async assignDevices(companyId: number, employeeId: number, dto: AssignEmployeeDevicesDto) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);

    const uniqueDeviceIds = [...new Set(dto.device_ids)];
    const devices = await this.attendanceDeviceRepository.find({
      where: {
        id: In(uniqueDeviceIds),
        companyId,
      },
      select: ['id', 'integrationType', 'vendorName'],
    });

    if (devices.length !== uniqueDeviceIds.length) {
      throw new BadRequestException('One or more device_ids do not belong to the active company');
    }

    const nonHikvision = devices.find(
      (device) =>
        (device.integrationType || '').toLowerCase() !== 'hikvision' &&
        !(device.vendorName || '').toLowerCase().includes('hikvision'),
    );

    if (nonHikvision) {
      throw new BadRequestException(`Device ${nonHikvision.id} is not a Hikvision integration`);
    }

    let created = 0;
    let updated = 0;

    for (const deviceId of uniqueDeviceIds) {
      const existing = await this.assignmentRepository.findOne({
        where: { employeeId, deviceId },
      });

      if (existing) {
        existing.companyId = companyId;
        existing.employeeNo = employee.employee_no;
        existing.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.PENDING;
        await this.assignmentRepository.save(existing);
        await this.upsertDeviceIdentity(companyId, employee.id, employee.employee_no, deviceId);
        updated += 1;
        continue;
      }

      const entity = this.assignmentRepository.create({
        companyId,
        employeeId,
        employeeNo: employee.employee_no,
        deviceId,
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.PENDING,
        metadata: null,
        lastSyncedAt: null,
      });
      await this.assignmentRepository.save(entity);
      await this.upsertDeviceIdentity(companyId, employee.id, employee.employee_no, deviceId);
      created += 1;
    }

    return {
      message: 'Employee device assignments saved successfully',
      employee_id: employeeId,
      created,
      updated,
    };
  }

  async removeAssignment(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);

    const assignment = await this.assignmentRepository.findOne({
      where: { employeeId, deviceId },
    });

    if (!assignment) {
      throw new NotFoundException('Employee device assignment not found');
    }

    await this.assignmentRepository.remove(assignment);
    await this.deactivateDeviceIdentity(companyId, employee.id, deviceId);

    return {
      message: 'Employee device assignment removed successfully',
      employee_id: employeeId,
      device_id: deviceId,
    };
  }

  async listAssignments(employeeId: number): Promise<EmployeeDeviceAssignment[]> {
    return this.assignmentRepository.find({ where: { employeeId } });
  }

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .select(['employee.id', 'employee.employee_no'])
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private async upsertDeviceIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number,
  ) {
    const normalizedEmployeeNo = employeeNo.trim();
    if (!normalizedEmployeeNo) return;

    let identity = await this.employeeDeviceIdentityRepository.findOne({
      where: { companyId, employeeId, deviceId },
    });

    if (!identity) {
      identity = await this.employeeDeviceIdentityRepository.findOne({
        where: { companyId, deviceId, employeeNo: normalizedEmployeeNo },
      });
    }

    if (!identity) {
      identity = this.employeeDeviceIdentityRepository.create({
        companyId,
        employeeId,
        employeeNo: normalizedEmployeeNo,
        deviceId,
        isActive: true,
      });
    } else {
      identity.companyId = companyId;
      identity.employeeId = employeeId;
      identity.employeeNo = normalizedEmployeeNo;
      identity.deviceId = deviceId;
      identity.isActive = true;
    }

    await this.employeeDeviceIdentityRepository.save(identity);
  }

  private async deactivateDeviceIdentity(companyId: number, employeeId: number, deviceId: number) {
    const identity = await this.employeeDeviceIdentityRepository.findOne({
      where: { companyId, employeeId, deviceId, isActive: true },
    });

    if (!identity) return;
    identity.isActive = false;
    await this.employeeDeviceIdentityRepository.save(identity);
  }
}
