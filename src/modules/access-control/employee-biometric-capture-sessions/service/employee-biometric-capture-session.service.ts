import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { DeviceCommandLogService } from '../../../hikvision/device-command-logs/service/device-command-log.service';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { EmployeeAccessCredential } from '../../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialSourceEnum } from '../../employee-access-credentials/enum/employee-access-credential-source.enum';
import { EmployeeAccessCredentialStatusEnum } from '../../employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeDeviceAccessActionEnum } from '../../employee-device-access-audit-logs/enum/employee-device-access-action.enum';
import { EmployeeDeviceAccessAuditStatusEnum } from '../../employee-device-access-audit-logs/enum/employee-device-access-audit-status.enum';
import { EmployeeDeviceAccessAuditLogService } from '../../employee-device-access-audit-logs/service/employee-device-access-audit-log.service';
import { CreateBiometricCaptureSessionDto } from '../dto/create-biometric-capture-session.dto';
import { QueryBiometricCaptureSessionDto } from '../dto/query-biometric-capture-session.dto';
import { StartFingerprintCaptureDto } from '../dto/start-fingerprint-capture.dto';
import { UpdateBiometricCaptureSessionDto } from '../dto/update-biometric-capture-session.dto';
import { EmployeeBiometricCaptureSession } from '../entity/employee-biometric-capture-session.entity';
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';
import { EmployeeBiometricCaptureTypeEnum } from '../enum/employee-biometric-capture-type.enum';
import { DeviceCommandTypeEnum } from '../../../hikvision/device-command-logs/enum/device-command-type.enum';

@Injectable()
export class EmployeeBiometricCaptureSessionService {
  constructor(
    @InjectRepository(EmployeeBiometricCaptureSession)
    private readonly sessionRepository: Repository<EmployeeBiometricCaptureSession>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepository: Repository<EmployeeAccessCredential>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
    private readonly deviceCommandLogService: DeviceCommandLogService,
    private readonly auditLogService: EmployeeDeviceAccessAuditLogService,
  ) {}

  async create(dto: CreateBiometricCaptureSessionDto) {
    const entity = this.sessionRepository.create({
      companyId: dto.company_id,
      branchId: dto.branch_id ?? null,
      employeeId: dto.employee_id ?? null,
      employeeNo: dto.employee_no,
      employeeName: dto.employee_name ?? null,
      deviceId: dto.device_id,
      captureType: dto.capture_type,
      fingerprintId: dto.fingerprint_id ?? null,
      faceId: dto.face_id ?? null,
      cardReaderNo: dto.card_reader_no ?? null,
      status: dto.status ?? EmployeeBiometricCaptureStatusEnum.PENDING,
      expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
      captureRequestPayload: this.maskSensitivePayload(dto.capture_request_payload ?? null),
      setupRequestPayload: this.maskSensitivePayload(dto.setup_request_payload ?? null),
      performedByCompanyUserId: dto.performed_by_company_user_id ?? null,
      metadata: this.maskSensitivePayload(dto.metadata ?? null),
    });

    return this.map(await this.sessionRepository.save(entity));
  }

  async startFingerprintCapture(
    companyId: number,
    employeeId: number,
    dto: StartFingerprintCaptureDto,
    actor: {
      performedByCompanyUserId?: number;
      performedByUserId?: number;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.deviceRepository.findOne({
      where: { id: dto.device_id, companyId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const fingerprintId = (dto.fingerprint_id ?? '1').trim() || '1';
    const captureXml = `<?xml version="1.0" encoding="UTF-8"?>
<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <fingerNo>${fingerprintId}</fingerNo>
  <employeeNo>${employee.employee_no}</employeeNo>
  <cardReaderNo>${dto.card_reader_no ?? 1}</cardReaderNo>
</CaptureFingerPrintCond>`;

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        companyId,
        branchId: device.branchId ?? null,
        employeeId: employee.id,
        employeeNo: employee.employee_no,
        employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
        deviceId: device.id,
        captureType: EmployeeBiometricCaptureTypeEnum.FINGERPRINT,
        fingerprintId,
        cardReaderNo: dto.card_reader_no ?? null,
        status: EmployeeBiometricCaptureStatusEnum.CAPTURING,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        captureRequestPayload: this.maskSensitivePayload({
          endpoint: '/ISAPI/AccessControl/CaptureFingerPrint',
          payload: captureXml,
        }),
        performedByCompanyUserId: actor.performedByCompanyUserId ?? null,
      }),
    );

    const correlationId = `capture-fingerprint-${session.id}-${Date.now()}`;

    const captureCommandLog = await this.deviceCommandLogService.create({
      company_id: companyId,
      branch_id: device.branchId ?? null,
      device_id: device.id,
      command_type: DeviceCommandTypeEnum.CAPTURE_FINGERPRINT,
      http_method: 'POST' as any,
      endpoint: '/ISAPI/AccessControl/CaptureFingerPrint',
      request_body: { CaptureFingerPrintCond: { employeeNo: employee.employee_no, fingerNo: fingerprintId } },
      correlation_id: correlationId,
      created_by_company_user_id: actor.performedByCompanyUserId ?? null,
    });

    try {
      const captureResponse = await this.hikvisionAccessControlService.captureFingerprint(
        companyId,
        device.id,
        captureXml,
      );

      await this.deviceCommandLogService.markSuccess(captureCommandLog.id, {
        httpStatus: captureResponse.status,
        responseBody: this.toObject(captureResponse.parsed),
      });

      const fingerprintData = this.extractFingerprintData(captureResponse.parsed);
      if (!captureResponse.ok || !fingerprintData) {
        const errorMessage = captureResponse.ok
          ? 'Fingerprint capture returned no biometric payload'
          : `Capture failed with status ${captureResponse.status}`;
        await this.markFailed(session.id, errorMessage, {
          capture_response_payload: this.toObject(captureResponse.parsed),
        });

        await this.auditLogService.create({
          company_id: companyId,
          branch_id: device.branchId ?? null,
          employee_id: employee.id,
          employee_no: employee.employee_no,
          employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
          device_id: device.id,
          action: EmployeeDeviceAccessActionEnum.CAPTURE_FINGERPRINT,
          status: EmployeeDeviceAccessAuditStatusEnum.FAILED,
          request_payload: { capture_xml: captureXml },
          response_payload: this.toObject(captureResponse.parsed),
          error_message: errorMessage,
          performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
          performed_by_user_id: actor.performedByUserId ?? null,
          ip_address: actor.ipAddress ?? null,
          user_agent: actor.userAgent ?? null,
        });

        throw new NotFoundException(errorMessage);
      }

      const setupPayload = {
        FingerPrintCfg: {
          employeeNo: employee.employee_no,
          fingerPrintID: fingerprintId,
          fingerType: 'normalFP',
          fingerData: fingerprintData,
          cardReaderNo: dto.card_reader_no ?? 1,
        },
      };

      const setupCommandLog = await this.deviceCommandLogService.create({
        company_id: companyId,
        branch_id: device.branchId ?? null,
        device_id: device.id,
        command_type: DeviceCommandTypeEnum.SET_FINGERPRINT,
        http_method: 'PUT' as any,
        endpoint: '/ISAPI/AccessControl/FingerPrint/SetUp?format=json',
        request_body: setupPayload,
        correlation_id: correlationId,
        created_by_company_user_id: actor.performedByCompanyUserId ?? null,
      });

      const setupResponse = await this.hikvisionAccessControlService.setupFingerprint(
        companyId,
        device.id,
        setupPayload,
      );

      if (!setupResponse.ok) {
        await this.deviceCommandLogService.markFailed(
          setupCommandLog.id,
          `Set fingerprint failed with status ${setupResponse.status}`,
          {
            httpStatus: setupResponse.status,
            responseBody: this.toObject(setupResponse.parsed),
          },
        );

        await this.markFailed(session.id, `Set fingerprint failed with status ${setupResponse.status}`, {
          capture_response_payload: this.toObject(captureResponse.parsed),
          setup_request_payload: setupPayload,
          setup_response_payload: this.toObject(setupResponse.parsed),
        });
      } else {
        await this.deviceCommandLogService.markSuccess(setupCommandLog.id, {
          httpStatus: setupResponse.status,
          responseBody: this.toObject(setupResponse.parsed),
        });

        await this.markSuccess(session.id, {
          capture_response_payload: this.toObject(captureResponse.parsed),
          setup_request_payload: setupPayload,
          setup_response_payload: this.toObject(setupResponse.parsed),
        });

        await this.linkSuccessfulFingerprintToCredential(
          companyId,
          employee,
          device.id,
          fingerprintId,
          session.id,
          this.toObject(setupResponse.parsed),
        );

        await this.auditLogService.create({
          company_id: companyId,
          branch_id: device.branchId ?? null,
          employee_id: employee.id,
          employee_no: employee.employee_no,
          employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
          device_id: device.id,
          action: EmployeeDeviceAccessActionEnum.SET_FINGERPRINT,
          status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
          request_payload: setupPayload,
          response_payload: this.toObject(setupResponse.parsed),
          old_values: null,
          new_values: {
            has_fingerprint: true,
            fingerprint_id: fingerprintId,
            fingerprint_count_delta: 1,
          },
          performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
          performed_by_user_id: actor.performedByUserId ?? null,
          ip_address: actor.ipAddress ?? null,
          user_agent: actor.userAgent ?? null,
        });
      }
    } catch (error) {
      await this.markFailed(session.id, (error as Error).message);
      if (captureCommandLog?.id) {
        await this.deviceCommandLogService.markFailed(
          captureCommandLog.id,
          (error as Error).message,
          null,
        );
      }
      throw error;
    }

    return this.findOne(companyId, session.id);
  }

  async findAll(companyId: number, query: QueryBiometricCaptureSessionDto) {
    const {
      branchId,
      deviceId,
      employeeId,
      employeeNo,
      captureType,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.sessionRepository
      .createQueryBuilder('session')
      .where('session.company_id = :companyId', { companyId });

    if (branchId) qb.andWhere('session.branch_id = :branchId', { branchId });
    if (deviceId) qb.andWhere('session.device_id = :deviceId', { deviceId });
    if (employeeId) qb.andWhere('session.employee_id = :employeeId', { employeeId });
    if (employeeNo?.trim()) qb.andWhere('session.employee_no = :employeeNo', { employeeNo: employeeNo.trim() });
    if (captureType) qb.andWhere('session.capture_type = :captureType', { captureType });
    if (status) qb.andWhere('session.status = :status', { status });
    if (dateFrom) qb.andWhere('session.created_at >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo) qb.andWhere('session.created_at <= :dateTo', { dateTo: new Date(dateTo) });

    const [items, total] = await qb
      .orderBy('session.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const row = await this.sessionRepository.findOne({
      where: { id, companyId },
    });
    if (!row) {
      throw new NotFoundException('Biometric capture session not found');
    }

    return this.map(row);
  }

  async cancel(companyId: number, id: number) {
    const row = await this.sessionRepository.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException('Biometric capture session not found');
    }

    if (
      row.status === EmployeeBiometricCaptureStatusEnum.SUCCESS ||
      row.status === EmployeeBiometricCaptureStatusEnum.FAILED
    ) {
      return this.map(row);
    }

    row.status = EmployeeBiometricCaptureStatusEnum.CANCELLED;
    row.completedAt = new Date();
    await this.sessionRepository.save(row);
    return this.map(row);
  }

  async markSuccess(
    id: number,
    input: {
      capture_response_payload?: Record<string, unknown> | null;
      setup_request_payload?: Record<string, unknown> | null;
      setup_response_payload?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ) {
    const row = await this.sessionRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Biometric capture session not found');
    }

    row.status = EmployeeBiometricCaptureStatusEnum.SUCCESS;
    row.completedAt = new Date();
    row.captureResponsePayload = this.maskSensitivePayload(
      input.capture_response_payload ?? row.captureResponsePayload ?? null,
    );
    row.setupRequestPayload = this.maskSensitivePayload(
      input.setup_request_payload ?? row.setupRequestPayload ?? null,
    );
    row.setupResponsePayload = this.maskSensitivePayload(
      input.setup_response_payload ?? row.setupResponsePayload ?? null,
    );
    row.metadata = this.maskSensitivePayload({
      ...(row.metadata ?? {}),
      ...(input.metadata ?? {}),
    });
    row.errorMessage = null;
    await this.sessionRepository.save(row);
    return this.map(row);
  }

  async markFailed(
    id: number,
    errorMessage: string,
    input: {
      capture_response_payload?: Record<string, unknown> | null;
      setup_request_payload?: Record<string, unknown> | null;
      setup_response_payload?: Record<string, unknown> | null;
    } = {},
  ) {
    const row = await this.sessionRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Biometric capture session not found');
    }

    row.status = EmployeeBiometricCaptureStatusEnum.FAILED;
    row.completedAt = new Date();
    row.errorMessage = errorMessage;
    row.captureResponsePayload = this.maskSensitivePayload(
      input.capture_response_payload ?? row.captureResponsePayload ?? null,
    );
    row.setupRequestPayload = this.maskSensitivePayload(
      input.setup_request_payload ?? row.setupRequestPayload ?? null,
    );
    row.setupResponsePayload = this.maskSensitivePayload(
      input.setup_response_payload ?? row.setupResponsePayload ?? null,
    );
    await this.sessionRepository.save(row);
    return this.map(row);
  }

  async update(id: number, dto: UpdateBiometricCaptureSessionDto) {
    const row = await this.sessionRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Biometric capture session not found');
    }

    if (dto.status !== undefined) row.status = dto.status;
    if (dto.capture_response_payload !== undefined) {
      row.captureResponsePayload = this.maskSensitivePayload(dto.capture_response_payload ?? null);
    }
    if (dto.setup_response_payload !== undefined) {
      row.setupResponsePayload = this.maskSensitivePayload(dto.setup_response_payload ?? null);
    }
    if (dto.error_message !== undefined) row.errorMessage = dto.error_message ?? null;
    if (dto.metadata !== undefined) {
      row.metadata = this.maskSensitivePayload({
        ...(row.metadata ?? {}),
        ...(dto.metadata ?? {}),
      });
    }
    await this.sessionRepository.save(row);
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
      'capturedfingerprint',
      'fingertemplate',
    ]);

    const recurse = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map((item) => recurse(item));
      if (!value || typeof value !== 'object') return value;

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

  private async linkSuccessfulFingerprintToCredential(
    companyId: number,
    employee: Employee,
    deviceId: number,
    fingerprintId: string,
    sessionId: number,
    setupResponsePayload: Record<string, unknown>,
  ) {
    let credential = await this.credentialRepository.findOne({
      where: {
        companyId,
        employeeId: employee.id,
        deviceId,
        credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      },
    });

    if (!credential) {
      credential = this.credentialRepository.create({
        companyId,
        employeeId: employee.id,
        employeeNo: employee.employee_no,
        deviceId,
        credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
        credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
        source: EmployeeAccessCredentialSourceEnum.DEVICE_SYNC,
      });
    }

    credential.employeeNo = employee.employee_no;
    credential.fingerprintId = fingerprintId;
    credential.fingerprintCount = Math.max(1, (credential.fingerprintCount ?? 0) + 1);
    credential.hasFingerprint = true;
    credential.passwordSet = Boolean(credential.passwordSet);
    credential.lastSyncedAt = new Date();
    credential.credentialStatus = EmployeeAccessCredentialStatusEnum.ACTIVE;
    credential.metadata = {
      ...(credential.metadata ?? {}),
      fingerprint: {
        last_capture_session_id: sessionId,
        fingerprint_id: fingerprintId,
        last_updated_at: new Date().toISOString(),
      },
      setup_response: this.maskSensitivePayload(setupResponsePayload),
    };

    await this.credentialRepository.save(credential);
  }

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private extractFingerprintData(payload: unknown): string | null {
    const data = this.toObject(payload);
    const cfg = this.toObject(data.CaptureFingerPrint ?? data.CaptureFingerPrintCfg ?? data);
    const direct = cfg.fingerData ?? cfg.fingerprintData ?? cfg.fingerPrintData ?? cfg.template;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const nestedCfg = this.toObject(cfg.FingerPrintInfo ?? cfg.FingerPrintCfg ?? cfg.fingerprintInfo);
    const nested = nestedCfg.fingerData ?? nestedCfg.fingerprintData ?? nestedCfg.fingerPrintData;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }

    return null;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private map(item: EmployeeBiometricCaptureSession) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      employee_name: item.employeeName,
      device_id: item.deviceId,
      capture_type: item.captureType,
      fingerprint_id: item.fingerprintId,
      face_id: item.faceId,
      card_reader_no: item.cardReaderNo,
      status: item.status,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      expires_at: item.expiresAt,
      capture_request_payload: this.maskSensitivePayload(item.captureRequestPayload),
      capture_response_payload: this.maskSensitivePayload(item.captureResponsePayload),
      setup_request_payload: this.maskSensitivePayload(item.setupRequestPayload),
      setup_response_payload: this.maskSensitivePayload(item.setupResponsePayload),
      error_message: item.errorMessage,
      performed_by_company_user_id: item.performedByCompanyUserId,
      metadata: this.maskSensitivePayload(item.metadata),
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }
}

