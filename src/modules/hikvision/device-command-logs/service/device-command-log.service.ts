import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { CreateDeviceCommandLogDto } from '../../../access-control/device-command-logs/dto/create-device-command-log.dto';
import { QueryDeviceCommandLogDto } from '../../../access-control/device-command-logs/dto/query-device-command-log.dto';
import { DeviceCommandLog } from '../entity/device-command-log.entity';
import { DeviceCommandLogStatusEnum } from '../enum/device-command-log-status.enum';

@Injectable()
export class DeviceCommandLogService {
  constructor(
    @InjectRepository(DeviceCommandLog)
    private readonly commandLogRepository: Repository<DeviceCommandLog>,
  ) {}

  async create(dto: CreateDeviceCommandLogDto) {
    const entity = this.commandLogRepository.create({
      companyId: dto.company_id,
      branchId: dto.branch_id ?? null,
      deviceId: dto.device_id,
      commandType: dto.command_type,
      httpMethod: dto.http_method,
      endpoint: dto.endpoint,
      requestBody: this.maskSensitivePayload(dto.request_body ?? null),
      responseBody: this.maskSensitivePayload(dto.response_body ?? null),
      httpStatus: dto.http_status ?? null,
      status: dto.status ?? DeviceCommandLogStatusEnum.PENDING,
      durationMs: dto.duration_ms ?? null,
      errorMessage: dto.error_message ?? null,
      correlationId: dto.correlation_id ?? null,
      createdByCompanyUserId: dto.created_by_company_user_id ?? null,
      startedAt: new Date(),
    });

    return this.map(await this.commandLogRepository.save(entity));
  }

  async findAll(companyId: number, query: QueryDeviceCommandLogDto) {
    const {
      branchId,
      deviceId,
      commandType,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.commandLogRepository
      .createQueryBuilder('cmd')
      .where('cmd.company_id = :companyId', { companyId });

    if (branchId) qb.andWhere('cmd.branch_id = :branchId', { branchId });
    if (deviceId) qb.andWhere('cmd.device_id = :deviceId', { deviceId });
    if (commandType) qb.andWhere('cmd.command_type = :commandType', { commandType });
    if (status) qb.andWhere('cmd.status = :status', { status });
    if (dateFrom) qb.andWhere('cmd.created_at >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo) qb.andWhere('cmd.created_at <= :dateTo', { dateTo: new Date(dateTo) });

    const [items, total] = await qb
      .orderBy('cmd.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const row = await this.commandLogRepository.findOne({
      where: { id, companyId },
    });
    if (!row) {
      throw new NotFoundException('Device command log not found');
    }
    return this.map(row);
  }

  async markSuccess(
    id: number,
    input: {
      httpStatus?: number | null;
      responseBody?: Record<string, unknown> | null;
    },
  ) {
    const row = await this.commandLogRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Device command log not found');
    }

    row.status = DeviceCommandLogStatusEnum.SUCCESS;
    row.httpStatus = input.httpStatus ?? row.httpStatus ?? null;
    row.responseBody = this.maskSensitivePayload(input.responseBody ?? row.responseBody ?? null);
    row.errorMessage = null;
    row.completedAt = new Date();
    if (row.startedAt) {
      row.durationMs = Math.max(0, Date.now() - new Date(row.startedAt).getTime());
    }
    await this.commandLogRepository.save(row);
    return this.map(row);
  }

  async markFailed(
    id: number,
    errorMessage: string,
    input: {
      httpStatus?: number | null;
      responseBody?: Record<string, unknown> | null;
    } | null = null,
  ) {
    const row = await this.commandLogRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Device command log not found');
    }

    row.status = DeviceCommandLogStatusEnum.FAILED;
    row.errorMessage = errorMessage;
    row.httpStatus = input?.httpStatus ?? row.httpStatus ?? null;
    row.responseBody = this.maskSensitivePayload(input?.responseBody ?? row.responseBody ?? null);
    row.completedAt = new Date();
    if (row.startedAt) {
      row.durationMs = Math.max(0, Date.now() - new Date(row.startedAt).getTime());
    }
    await this.commandLogRepository.save(row);
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
      'fingertemplate',
      'capturedfingerprint',
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

  private map(item: DeviceCommandLog) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      device_id: item.deviceId,
      command_type: item.commandType,
      http_method: item.httpMethod,
      endpoint: item.endpoint,
      request_body: this.maskSensitivePayload(item.requestBody),
      response_body: this.maskSensitivePayload(item.responseBody),
      http_status: item.httpStatus,
      status: item.status,
      duration_ms: item.durationMs,
      error_message: item.errorMessage,
      correlation_id: item.correlationId,
      created_by_company_user_id: item.createdByCompanyUserId,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      created_at: item.createdAt,
    };
  }
}

