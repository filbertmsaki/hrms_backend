import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../../employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../employee-access-credentials/enum/employee-access-credential-type.enum';

@Injectable()
export class DeviceUserFingerprintsService {
  constructor(
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignments: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentials: Repository<EmployeeAccessCredential>,
  ) {}

  async list(companyId: number, deviceId: number, assignmentId: number) {
    const assignment = await this.assignments.findOne({
      where: { id: assignmentId, companyId, deviceId },
      select: [
        'id',
        'companyId',
        'deviceId',
        'employeeId',
        'employeeNo',
        'employeeName',
      ],
    });
    if (!assignment) throw new NotFoundException('Device user not found');
    const rows = await this.credentials.find({
      where: {
        companyId,
        deviceId,
        employeeNo: assignment.employeeNo,
        credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
        credentialStatus: Not(EmployeeAccessCredentialStatusEnum.DELETED),
      },
      select: [
        'id',
        'fingerprintId',
        'cardReaderNo',
        'credentialStatus',
        'source',
        'lastSyncedAt',
      ],
      order: { fingerprintId: 'ASC', id: 'ASC' },
    });
    return {
      assignment_id: assignment.id,
      device_id: deviceId,
      device_employee_no: assignment.employeeNo,
      device_user_name: assignment.employeeName,
      hr_employee_id: assignment.employeeId,
      fingerprints: rows.map((row) => ({
        id: row.id,
        fingerprint_id: row.fingerprintId,
        card_reader_no: row.cardReaderNo,
        status: row.credentialStatus,
        source: row.source,
        last_synced_at: row.lastSyncedAt,
      })),
    };
  }
}
