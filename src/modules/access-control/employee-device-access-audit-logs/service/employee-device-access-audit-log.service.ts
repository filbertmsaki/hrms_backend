import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { CreateEmployeeDeviceAccessAuditLogDto } from '../dto/create-employee-device-access-audit-log.dto';
import { QueryEmployeeDeviceAccessAuditLogDto } from '../dto/query-employee-device-access-audit-log.dto';
import { EmployeeDeviceAccessAuditLog } from '../entity/employee-device-access-audit-log.entity';
import { EmployeeDeviceAccessAuditStatusEnum } from '../enum/employee-device-access-audit-status.enum';

@Injectable()
export class EmployeeDeviceAccessAuditLogService {
  constructor(
    @InjectRepository(EmployeeDeviceAccessAuditLog)
    private readonly auditLogRepository: Repository<EmployeeDeviceAccessAuditLog>,
  ) {}

  async create(dto: CreateEmployeeDeviceAccessAuditLogDto) {
    const entity = this.auditLogRepository.create({
      companyId: dto.company_id,
      branchId: dto.branch_id ?? null,
      employeeId: dto.employee_id ?? null,
      employeeNo: dto.employee_no,
      employeeName: dto.employee_name ?? null,
      deviceId: dto.device_id,
      action: dto.action,
      status: dto.status ?? EmployeeDeviceAccessAuditStatusEnum.PENDING,
      requestPayload: this.maskSensitivePayload(dto.request_payload ?? null),
      responsePayload: this.maskSensitivePayload(dto.response_payload ?? null),
      oldValues: this.maskSensitivePayload(dto.old_values ?? null),
      newValues: this.maskSensitivePayload(dto.new_values ?? null),
      errorMessage: dto.error_message ?? null,
      performedByCompanyUserId: dto.performed_by_company_user_id ?? null,
      performedByUserId: dto.performed_by_user_id ?? null,
      ipAddress: dto.ip_address ?? null,
      userAgent: dto.user_agent ?? null,
    });

    return this.map(await this.auditLogRepository.save(entity));
  }

  async findAll(
    companyId: number,
    query: QueryEmployeeDeviceAccessAuditLogDto,
  ) {
    const {
      branchId,
      deviceId,
      employeeId,
      employeeNo,
      action,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.company_id = :companyId', { companyId });

    if (branchId) qb.andWhere('audit.branch_id = :branchId', { branchId });
    if (deviceId) qb.andWhere('audit.device_id = :deviceId', { deviceId });
    if (employeeId)
      qb.andWhere('audit.employee_id = :employeeId', { employeeId });
    if (employeeNo?.trim())
      qb.andWhere('audit.employee_no = :employeeNo', {
        employeeNo: employeeNo.trim(),
      });
    if (action) qb.andWhere('audit.action = :action', { action });
    if (status) qb.andWhere('audit.status = :status', { status });
    if (dateFrom)
      qb.andWhere('audit.created_at >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    if (dateTo)
      qb.andWhere('audit.created_at <= :dateTo', { dateTo: new Date(dateTo) });

    const [items, total] = await qb
      .orderBy('audit.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const row = await this.auditLogRepository.findOne({
      where: { id, companyId },
    });
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }

    return this.map(row);
  }

  async markSuccess(
    id: number,
    responsePayload?: Record<string, unknown> | null,
  ) {
    const row = await this.auditLogRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }

    row.status = EmployeeDeviceAccessAuditStatusEnum.SUCCESS;
    row.responsePayload = this.maskSensitivePayload(
      responsePayload ?? row.responsePayload ?? null,
    );
    row.errorMessage = null;
    await this.auditLogRepository.save(row);
    return this.map(row);
  }

  async markFailed(
    id: number,
    errorMessage: string,
    responsePayload?: Record<string, unknown> | null,
  ) {
    const row = await this.auditLogRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }

    row.status = EmployeeDeviceAccessAuditStatusEnum.FAILED;
    row.errorMessage = errorMessage;
    row.responsePayload = this.maskSensitivePayload(
      responsePayload ?? row.responsePayload ?? null,
    );
    await this.auditLogRepository.save(row);
    return this.map(row);
  }

  maskSensitivePayload<T>(payload: T): T {
    if (payload === null || payload === undefined) {
      return payload;
    }

    const sensitiveKeys = new Set([
      'api_password',
      'password',
      'pin_password',
      'fingerprint',
      'fingerprintdata',
      'biometricdata',
      'face_data',
      'raw_biometric_data',
      'two_factor_secret',
    ]);

    const recurse = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => recurse(item));
      }

      if (!value || typeof value !== 'object') {
        return value;
      }

      const input = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(input)) {
        const normalized = key.toLowerCase();
        if (sensitiveKeys.has(normalized)) {
          output[key] = '***MASKED***';
          continue;
        }
        output[key] = recurse(raw);
      }
      return output;
    };

    return recurse(payload) as T;
  }

  private map(item: EmployeeDeviceAccessAuditLog) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      employee_name: item.employeeName,
      device_id: item.deviceId,
      action: item.action,
      status: item.status,
      request_payload: this.maskSensitivePayload(item.requestPayload),
      response_payload: this.maskSensitivePayload(item.responsePayload),
      old_values: this.maskSensitivePayload(item.oldValues),
      new_values: this.maskSensitivePayload(item.newValues),
      error_message: item.errorMessage,
      performed_by_company_user_id: item.performedByCompanyUserId,
      performed_by_user_id: item.performedByUserId,
      ip_address: item.ipAddress,
      user_agent: item.userAgent,
      created_at: item.createdAt,
    };
  }
}
