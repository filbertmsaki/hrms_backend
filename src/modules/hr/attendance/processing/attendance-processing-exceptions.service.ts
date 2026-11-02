import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { QueryAttendanceExceptionsDto } from './dtos/query-attendance-exceptions.dto';
import { UpdateAttendanceExceptionStatusDto } from './dtos/update-attendance-exception-status.dto';
import { AttendanceProcessingException } from './entities/attendance-processing-exception.entity';
import { AttendanceExceptionStatusEnum } from './enums/attendance-exception-status.enum';
import { AttendanceExceptionTypeEnum } from './enums/attendance-exception-type.enum';

type ExceptionDraft = {
  companyId: number;
  branchId: number | null;
  employeeId: number | null;
  rawLogId?: number | null;
  processedEventId?: number | null;
  summaryId?: number | null;
  deviceId?: number | null;
  employeeNo?: string;
  attendanceDate?: string | null;
  exceptionType: AttendanceExceptionTypeEnum;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  isSystemGenerated?: boolean;
};

@Injectable()
export class AttendanceProcessingExceptionsService {
  constructor(
    @InjectRepository(AttendanceProcessingException)
    private readonly exceptionRepository: Repository<AttendanceProcessingException>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
  ) {}

  async replaceForRawLog(rawLogId: number, drafts: ExceptionDraft[]) {
    await this.exceptionRepository.delete({
      rawLogId,
      isSystemGenerated: true,
    });

    if (!drafts.length) {
      return [];
    }

    const items = drafts.map((draft) =>
      this.exceptionRepository.create({
        companyId: draft.companyId,
        branchId: draft.branchId,
        employeeId: draft.employeeId,
        rawLogId: draft.rawLogId ?? rawLogId,
        processedEventId: draft.processedEventId ?? null,
        summaryId: draft.summaryId ?? null,
        deviceId: draft.deviceId ?? null,
        employeeNo: draft.employeeNo?.trim() || '',
        attendanceDate: draft.attendanceDate ?? null,
        exceptionType: draft.exceptionType,
        status: AttendanceExceptionStatusEnum.OPEN,
        message: draft.message?.trim() || null,
        metadata: draft.metadata ?? null,
        isSystemGenerated: draft.isSystemGenerated ?? true,
      }),
    );

    return this.exceptionRepository.save(items);
  }

  async replaceForEmployeeDate(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    drafts: ExceptionDraft[],
  ) {
    await this.exceptionRepository
      .createQueryBuilder()
      .delete()
      .from(AttendanceProcessingException)
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('attendance_date = :attendanceDate', { attendanceDate })
      .andWhere('raw_log_id IS NULL')
      .andWhere('is_system_generated = :isSystemGenerated', {
        isSystemGenerated: true,
      })
      .execute();

    if (!drafts.length) {
      return [];
    }

    const items = drafts.map((draft) =>
      this.exceptionRepository.create({
        companyId: draft.companyId,
        branchId: draft.branchId,
        employeeId: draft.employeeId,
        rawLogId: draft.rawLogId ?? null,
        processedEventId: draft.processedEventId ?? null,
        summaryId: draft.summaryId ?? null,
        deviceId: draft.deviceId ?? null,
        employeeNo: draft.employeeNo?.trim() || '',
        attendanceDate,
        exceptionType: draft.exceptionType,
        status: AttendanceExceptionStatusEnum.OPEN,
        message: draft.message?.trim() || null,
        metadata: draft.metadata ?? null,
        isSystemGenerated: draft.isSystemGenerated ?? true,
      }),
    );

    return this.exceptionRepository.save(items);
  }

  async findAll(companyId: number, query: QueryAttendanceExceptionsDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      employee_id,
      device_id,
      from_date,
      to_date,
      status,
      exception_type,
    } = query;

    const qb = this.exceptionRepository
      .createQueryBuilder('exception')
      .leftJoin('exception.employee', 'employee')
      .addSelect([
        'employee.id',
        'employee.employee_no',
        'employee.first_name',
        'employee.middle_name',
        'employee.last_name',
        'employee.preferred_name',
      ])
      .leftJoin('exception.device', 'device')
      .addSelect(['device.id', 'device.deviceName'])
      .leftJoin('exception.rawLog', 'rawLog')
      .addSelect(['rawLog.id', 'rawLog.employeeName'])
      .where('exception.company_id = :companyId', { companyId });

    if (employee_id) {
      qb.andWhere('exception.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }
    if (device_id) {
      qb.andWhere('exception.device_id = :deviceId', { deviceId: device_id });
    }
    if (from_date) {
      qb.andWhere('exception.attendance_date >= :fromDate', {
        fromDate: from_date,
      });
    }
    if (to_date) {
      qb.andWhere('exception.attendance_date <= :toDate', { toDate: to_date });
    }
    if (status?.trim()) {
      qb.andWhere('exception.status = :status', {
        status: status.trim().toUpperCase(),
      });
    }
    if (exception_type?.trim()) {
      qb.andWhere('exception.exception_type = :exceptionType', {
        exceptionType: exception_type.trim().toUpperCase(),
      });
    }

    const sortableColumns = new Set([
      'created_at',
      'updated_at',
      'attendance_date',
      'exception_type',
      'status',
    ]);
    const columnPropertyMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      attendance_date: 'attendanceDate',
      exception_type: 'exceptionType',
      status: 'status',
    };
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';
    const safeSortProperty = columnPropertyMap[safeSortBy] ?? safeSortBy;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`exception.${safeSortProperty}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const employeeNos = [
      ...new Set(rows.map((row) => row.employeeNo).filter(Boolean)),
    ];
    const deviceIds = [
      ...new Set(
        rows
          .map((row) => row.deviceId)
          .filter((deviceId): deviceId is number => deviceId !== null),
      ),
    ];
    const assignments =
      employeeNos.length && deviceIds.length
        ? await this.assignmentRepository.find({
            where: {
              companyId,
              employeeNo: In(employeeNos),
              deviceId: In(deviceIds),
            },
          })
        : [];
    const assignmentNames = new Map(
      assignments
        .filter((assignment) => assignment.employeeName?.trim())
        .map((assignment) => [
          `${assignment.deviceId}:${assignment.employeeNo}`,
          assignment.employeeName!.trim(),
        ]),
    );

    return {
      data: rows.map(({ employee, device, rawLog, ...row }) => ({
        ...row,
        employeeName: employee
          ? [
              employee.preferred_name || employee.first_name,
              employee.middle_name,
              employee.last_name,
            ]
              .filter(Boolean)
              .join(' ')
          : (assignmentNames.get(`${row.deviceId}:${row.employeeNo}`) ??
            rawLog?.employeeName ??
            null),
        deviceName: device?.deviceName ?? null,
      })),
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  async updateStatus(
    companyId: number,
    exceptionId: number,
    dto: UpdateAttendanceExceptionStatusDto,
    resolvedByCompanyUserId: number | null,
  ) {
    const item = await this.exceptionRepository.findOne({
      where: { id: exceptionId, companyId },
    });
    if (!item) {
      throw new NotFoundException('Attendance exception not found');
    }

    item.status = dto.status.toUpperCase() as AttendanceExceptionStatusEnum;
    item.resolutionNote = dto.resolution_note?.trim() || null;
    item.resolvedByCompanyUserId =
      item.status === AttendanceExceptionStatusEnum.OPEN
        ? null
        : resolvedByCompanyUserId;
    item.resolvedAt =
      item.status === AttendanceExceptionStatusEnum.OPEN ? null : new Date();

    return this.exceptionRepository.save(item);
  }
}
