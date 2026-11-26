import {
  Injectable,
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from '../hr/employees/entities/employee.entity';
import { AttendanceEmployeeResolverService } from '../hr/attendance/processing/attendance-employee-resolver.service';
import { compareAttendanceDeviceName } from '../hr/attendance/processing/attendance-device-name-match';
import { HikvisionUserManagementService } from './hikvision-user-management.service';
import { EmployeeDeviceAccessAuditLogService } from '../access-control/employee-device-access-audit-logs/service/employee-device-access-audit-log.service';
import { EmployeeDeviceAccessActionEnum } from '../access-control/employee-device-access-audit-logs/enum/employee-device-access-action.enum';
import { CorrectDeviceUserNameDto } from './dto/correct-device-user-name.dto';
import { UnlinkDeviceUserDto } from './dto/unlink-device-user.dto';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceIdentity } from '../hr/attendance/processing/entities/employee-device-identity.entity';
import { EmployeeDeviceAccessAuditLog } from '../access-control/employee-device-access-audit-logs/entity/employee-device-access-audit-log.entity';
import { EmployeeDeviceAccessAuditStatusEnum } from '../access-control/employee-device-access-audit-logs/enum/employee-device-access-audit-status.enum';

@Injectable()
export class AttendanceDeviceIdentityReviewService {
  constructor(
    private readonly users: HikvisionUserManagementService,
    private readonly resolver: AttendanceEmployeeResolverService,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly audit: EmployeeDeviceAccessAuditLogService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async unlinkDeviceUser(
    companyId: number,
    deviceId: number,
    dto: UnlinkDeviceUserDto,
    userId: number,
    membershipId: number | null,
  ) {
    const employeeNo = dto.employee_no.trim();
    const reason = dto.reason.trim();
    if (!employeeNo || !reason)
      throw new BadRequestException('Device number and reason are required.');
    return this.dataSource.transaction(async (manager) => {
      const assignments = manager.getRepository(EmployeeDeviceAssignment);
      const assignment = await assignments.findOne({
        where: { companyId, deviceId, employeeNo },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment || assignment.employeeId !== dto.expected_employee_id) {
        throw new ConflictException(
          'The device assignment changed. Refresh the identity review before continuing.',
        );
      }
      const previousEmployeeId = assignment.employeeId;
      assignment.employeeId = null;
      assignment.metadata = {
        ...assignment.metadata,
        attendance_identity_unlinked: true,
        attendance_identity_unlinked_at: new Date().toISOString(),
      };
      await assignments.save(assignment);
      await manager
        .getRepository(EmployeeDeviceIdentity)
        .update(
          { companyId, deviceId, employeeNo, isActive: true },
          { isActive: false },
        );
      const logs = manager.getRepository(EmployeeDeviceAccessAuditLog);
      await logs.save(
        logs.create({
          companyId,
          deviceId,
          employeeId: previousEmployeeId,
          employeeNo,
          employeeName: assignment.employeeName,
          action: EmployeeDeviceAccessActionEnum.UPDATE_USER,
          status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
          oldValues: { employee_id: previousEmployeeId },
          newValues: { employee_id: null },
          requestPayload: { operation: 'unlink_hrms_only', reason },
          performedByUserId: userId,
          performedByCompanyUserId: membershipId,
        }),
      );
      return {
        device_id: deviceId,
        employee_no: employeeNo,
        previous_employee_id: previousEmployeeId,
      };
    });
  }

  async correctDeviceName(
    companyId: number,
    deviceId: number,
    dto: CorrectDeviceUserNameDto,
    userId: number,
    membershipId: number | null,
  ) {
    const employeeNo = dto.employee_no.trim();
    const reason = dto.reason.trim();
    if (!employeeNo || !reason || !dto.expected_device_name.trim())
      throw new BadRequestException(
        'Device number, current device name and reason are required.',
      );
    const resolution = await this.resolver.resolveEmployeeId(
      companyId,
      employeeNo,
      deviceId,
    );
    if (resolution.employeeId !== dto.expected_employee_id)
      throw new ConflictException(
        'The HRMS link changed. Refresh the identity review before continuing.',
      );
    const employee = await this.employees.findOne({
      where: { id: dto.expected_employee_id, company_id: companyId },
    });
    if (!employee)
      throw new ConflictException(
        'The linked employee is no longer available.',
      );
    const desiredName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (desiredName !== dto.expected_hrms_name) {
      throw new ConflictException(
        'The HRMS employee name changed. Refresh the identity review before continuing.',
      );
    }
    if (
      !employee.first_name?.trim() ||
      !employee.last_name?.trim() ||
      desiredName.length > 200
    )
      throw new BadRequestException(
        'The HRMS employee must have a valid first and last name.',
      );
    const before = await this.users.getUserByEmployeeNumber(
      companyId,
      deviceId,
      employeeNo,
    );
    if (!before.exists || before.user?.name !== dto.expected_device_name)
      throw new ConflictException(
        'The device user changed or is unavailable. Refresh the identity review before continuing.',
      );
    const record = await this.audit.create({
      company_id: companyId,
      device_id: deviceId,
      employee_id: employee.id,
      employee_no: employeeNo,
      employee_name: desiredName,
      action: EmployeeDeviceAccessActionEnum.UPDATE_USER,
      old_values: { device_name: before.user.name },
      new_values: { device_name: desiredName },
      request_payload: { reason, operation: 'correct_device_name' },
      performed_by_user_id: userId,
      performed_by_company_user_id: membershipId,
    });
    try {
      await this.users.updateUserOnDevice(companyId, deviceId, {
        employee_no: employeeNo,
        name: desiredName,
      });
      const after = await this.users.getUserByEmployeeNumber(
        companyId,
        deviceId,
        employeeNo,
      );
      if (!after.exists || after.user?.name !== desiredName)
        throw new BadGatewayException(
          'Device update could not be verified. Refresh the device user and inspect it before retrying.',
        );
      await this.audit.markSuccess(record.id, {
        verified_device_name: after.user.name,
      });
      return {
        device_id: deviceId,
        employee_no: employeeNo,
        device_name: after.user.name,
        audit_id: record.id,
      };
    } catch (error) {
      await this.audit.markFailed(
        record.id,
        error instanceof Error ? error.message : 'Device name update failed',
      );
      throw error;
    }
  }

  async review(companyId: number, deviceId: number) {
    const deviceUsers: Array<{ employee_no: string; name: string | null }> = [];
    const seenNumbers = new Set<string>();
    let total = 0;
    for (let page = 0; page < 10000; page++) {
      const result = await this.users.searchUsersOnDevice(companyId, deviceId, {
        search_id: 'identity_review',
        search_result_position: deviceUsers.length,
        max_results: 30,
      });
      total = result.total_matches;
      for (const user of result.users) {
        const number = user.employee_no.trim();
        if (!number || seenNumbers.has(number)) {
          throw new BadGatewayException(
            'The device returned a repeated or missing user number; the identity review may be incomplete. Retry the check.',
          );
        }
        seenNumbers.add(number);
      }
      deviceUsers.push(...result.users);
      if (deviceUsers.length >= total && result.response_status !== 'MORE')
        break;
      if (!result.users.length || page === 9999) {
        throw new BadGatewayException(
          'Device user list is incomplete; retry the identity review.',
        );
      }
    }

    const rows: Array<{
      device_employee_no: string;
      device_name: string | null;
      employee_id: number | null;
      employee_no: string | null;
      employee_name: string | null;
      status: string;
      resolution_reason: string;
    }> = [];
    for (const user of deviceUsers) {
      const resolved = await this.resolver.resolveEmployeeId(
        companyId,
        user.employee_no,
        deviceId,
      );
      const employee = resolved.employeeId
        ? await this.employees.findOne({
            where: { id: resolved.employeeId, company_id: companyId },
          })
        : null;
      const status = !employee
        ? resolved.reason
        : compareAttendanceDeviceName(user.name, employee);
      rows.push({
        device_employee_no: user.employee_no,
        device_name: user.name,
        employee_id: employee?.id ?? null,
        employee_no: employee?.employee_no ?? null,
        employee_name: employee
          ? [employee.first_name, employee.middle_name, employee.last_name]
              .filter(Boolean)
              .join(' ')
          : null,
        status,
        resolution_reason: resolved.reason,
      });
    }
    return {
      device_id: deviceId,
      checked_at: new Date().toISOString(),
      total,
      rows,
    };
  }
}
