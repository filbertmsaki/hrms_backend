import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeDeviceIdentity } from '../../../hr/attendance/processing/entities/employee-device-identity.entity';
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
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { CreateBiometricCaptureSessionDto } from '../dto/create-biometric-capture-session.dto';
import { QueryBiometricCaptureSessionDto } from '../dto/query-biometric-capture-session.dto';
import { SaveCapturedFingerprintDto } from '../dto/save-captured-fingerprint.dto';
import { StartFingerprintCaptureDto } from '../dto/start-fingerprint-capture.dto';
import { SyncFingerprintDto } from '../dto/sync-fingerprint.dto';
import { UpdateBiometricCaptureSessionDto } from '../dto/update-biometric-capture-session.dto';
import { EmployeeBiometricCaptureSession } from '../entity/employee-biometric-capture-session.entity';
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';
import { EmployeeBiometricCaptureTypeEnum } from '../enum/employee-biometric-capture-type.enum';
import { DeviceCommandTypeEnum } from '../../../hikvision/device-command-logs/enum/device-command-type.enum';

type FingerprintActor = {
  performedByCompanyUserId?: number;
  performedByUserId?: number;
  ipAddress?: string;
  userAgent?: string;
};

const MAX_FINGERPRINTS_PER_EMPLOYEE = 10;

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
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly identityRepository: Repository<EmployeeDeviceIdentity>,
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

  async captureFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: Omit<StartFingerprintCaptureDto, 'device_id'>,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.captureFingerprintOnly(
      companyId,
      employeeId,
      {
        ...dto,
        device_id: deviceId,
      },
      actor,
    );
  }

  async createFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: Omit<SaveCapturedFingerprintDto, 'device_id'>,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.saveCapturedFingerprint(
      companyId,
      employeeId,
      {
        ...dto,
        device_id: deviceId,
      },
      actor,
    );
  }

  async modifyFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: Omit<SaveCapturedFingerprintDto, 'device_id' | 'fingerprint_id'>,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.saveCapturedFingerprint(
      companyId,
      employeeId,
      {
        ...dto,
        device_id: deviceId,
        fingerprint_id: fingerprintId,
        overwrite: dto.overwrite ?? true,
      },
      actor,
    );
  }

  async syncFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: Omit<SyncFingerprintDto, 'device_id'> = {},
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.syncFingerprintToDevice(
      companyId,
      employeeId,
      fingerprintId,
      {
        ...dto,
        device_id: deviceId,
      },
      actor,
    );
  }

  async enableFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.setFingerprintEnabledState(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      true,
      actor,
    );
  }

  async disableFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.setFingerprintEnabledState(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      false,
      actor,
    );
  }

  async deleteFingerprintForAssignment(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    cardReaderNo = 1,
    actor: FingerprintActor = {},
  ) {
    await this.findAssignmentOrFail(companyId, employeeId, deviceId);
    return this.deleteFingerprint(
      companyId,
      employeeId,
      fingerprintId,
      deviceId,
      true,
      cardReaderNo,
      actor,
    );
  }

  async startFingerprintCapture(
    companyId: number,
    employeeId: number,
    dto: StartFingerprintCaptureDto,
    actor: FingerprintActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, dto.device_id);
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);

    const fingerprintId = (dto.fingerprint_id ?? '1').trim() || '1';
    const fingerprintIdNumber = Number(fingerprintId);
    if (!Number.isInteger(fingerprintIdNumber) || fingerprintIdNumber < 1) {
      throw new BadRequestException('fingerprint_id must be a positive integer value');
    }
    await this.assertFingerprintSlotAvailable(
      companyId,
      employee.id,
      fingerprintId,
      Boolean(dto.overwrite),
    );

    const captureXml = `<?xml version="1.0" encoding="UTF-8"?>
<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <fingerNo>${fingerprintId}</fingerNo>
</CaptureFingerPrintCond>`;

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        companyId,
        branchId: device.branchId ?? null,
        employeeId: employee.id,
        employeeNo: deviceEmployeeNo,
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
      request_body: { CaptureFingerPrintCond: { fingerNo: fingerprintId } },
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

      const capture = this.extractFingerprintCapture(captureResponse.parsed);
      if (!captureResponse.ok || !capture.fingerData) {
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
          employee_no: session.employeeNo,
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
      const capturedFingerData = capture.fingerData;

      this.validateFingerprintQuality(capture.fingerPrintQuality, dto.min_quality);

      await this.saveFingerprintCredential({
        companyId,
        employee,
        deviceEmployeeNo,
        sourceDeviceId: device.id,
        fingerprintId,
        fingerData: capturedFingerData,
        fingerNo: capture.fingerNo,
        fingerPrintQuality: capture.fingerPrintQuality,
        sessionId: session.id,
        overwrite: Boolean(dto.overwrite),
        syncStatus: 'CAPTURED',
      });

      const setupPayload = {
        FingerPrintCfg: {
          employeeNo: deviceEmployeeNo,
          enableCardReader: [dto.card_reader_no ?? 1],
          fingerPrintID: fingerprintIdNumber,
          fingerType: 'normalFP',
          fingerData: capturedFingerData,
          checkEmployeeNo: true,
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

      const setupStatus = this.extractFingerprintSetupStatus(setupResponse.parsed, dto.card_reader_no ?? 1);
      if (!setupResponse.ok || !setupStatus.success) {
        const setupErrorMessage = setupResponse.ok
          ? setupStatus.reason ?? 'Fingerprint upload failed'
          : `Set fingerprint failed with status ${setupResponse.status}`;
        await this.deviceCommandLogService.markFailed(
          setupCommandLog.id,
          setupErrorMessage,
          {
            httpStatus: setupResponse.status,
            responseBody: this.toObject(setupResponse.parsed),
          },
        );

        await this.markFailed(session.id, setupErrorMessage, {
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
          capturedFingerData,
          capture.fingerPrintQuality,
          'SYNCED',
        );

        await this.auditLogService.create({
          company_id: companyId,
          branch_id: device.branchId ?? null,
          employee_id: employee.id,
          employee_no: deviceEmployeeNo,
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

  async captureFingerprintOnly(
    companyId: number,
    employeeId: number,
    dto: StartFingerprintCaptureDto,
    actor: FingerprintActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, dto.device_id);
    const fingerprintId = this.normalizeFingerprintId(dto.fingerprint_id);
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);
    await this.assertFingerprintSlotAvailable(
      companyId,
      employee.id,
      fingerprintId.value,
      Boolean(dto.overwrite),
    );

    const captureXml = `<?xml version="1.0" encoding="UTF-8"?>
<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <fingerNo>${fingerprintId.value}</fingerNo>
</CaptureFingerPrintCond>`;

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        companyId,
        branchId: device.branchId ?? null,
        employeeId: employee.id,
        employeeNo: deviceEmployeeNo,
        employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
        deviceId: device.id,
        captureType: EmployeeBiometricCaptureTypeEnum.FINGERPRINT,
        fingerprintId: fingerprintId.value,
        cardReaderNo: dto.card_reader_no ?? null,
        status: EmployeeBiometricCaptureStatusEnum.CAPTURING,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        captureRequestPayload: { endpoint: '/ISAPI/AccessControl/CaptureFingerPrint', payload: captureXml },
        performedByCompanyUserId: actor.performedByCompanyUserId ?? null,
      }),
    );

    const captureResponse = await this.hikvisionAccessControlService.captureFingerprint(
      companyId,
      device.id,
      captureXml,
    );
    const capture = this.extractFingerprintCapture(captureResponse.parsed);

    if (!captureResponse.ok || !capture.fingerData) {
      const message = captureResponse.ok
        ? 'Fingerprint capture returned no biometric payload'
        : `Capture failed with status ${captureResponse.status}`;
      await this.markFailed(session.id, message, {
        capture_response_payload: this.toObject(captureResponse.parsed),
      });
      throw new BadRequestException(message);
    }
    const capturedFingerData = capture.fingerData;

    this.validateFingerprintQuality(capture.fingerPrintQuality, dto.min_quality);
    await this.saveFingerprintCredential({
      companyId,
      employee,
      deviceEmployeeNo,
      sourceDeviceId: device.id,
      fingerprintId: fingerprintId.value,
      fingerData: capturedFingerData,
      fingerNo: capture.fingerNo,
      fingerPrintQuality: capture.fingerPrintQuality,
      sessionId: session.id,
      overwrite: Boolean(dto.overwrite),
      syncStatus: 'CAPTURED',
    });

    await this.markSuccess(session.id, {
      capture_response_payload: this.toObject(captureResponse.parsed),
      metadata: {
        fingerprint_id: fingerprintId.value,
        finger_no: capture.fingerNo,
        finger_print_quality: capture.fingerPrintQuality,
        sync_status: 'CAPTURED',
      },
    });

    if (dto.sync_to_device) {
      await this.syncFingerprintToDevice(
        companyId,
        employeeId,
        fingerprintId.value,
        {
          device_id: device.id,
          card_reader_no: dto.card_reader_no,
        },
        actor,
      );
    }

    return this.findOne(companyId, session.id);
  }

  async saveCapturedFingerprint(
    companyId: number,
    employeeId: number,
    dto: SaveCapturedFingerprintDto,
    actor: FingerprintActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, dto.device_id);
    const fingerprintId = this.normalizeFingerprintId(dto.fingerprint_id);
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);
    this.validateFingerprintQuality(dto.finger_print_quality, dto.min_quality);

    await this.saveFingerprintCredential({
      companyId,
      employee,
      deviceEmployeeNo,
      sourceDeviceId: device.id,
      fingerprintId: fingerprintId.value,
      fingerData: dto.finger_data,
      fingerNo: dto.finger_no ?? fingerprintId.number,
      fingerPrintQuality: dto.finger_print_quality,
      sessionId: null,
      overwrite: Boolean(dto.overwrite),
      syncStatus: 'SAVED',
    });

    await this.auditLogService.create({
      company_id: companyId,
      branch_id: device.branchId ?? null,
      employee_id: employee.id,
      employee_no: deviceEmployeeNo,
      employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
      device_id: device.id,
      action: EmployeeDeviceAccessActionEnum.CAPTURE_FINGERPRINT,
      status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
      request_payload: {
        fingerprint_id: fingerprintId.value,
        finger_no: dto.finger_no ?? fingerprintId.number,
        finger_print_quality: dto.finger_print_quality,
      },
      performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
      performed_by_user_id: actor.performedByUserId ?? null,
      ip_address: actor.ipAddress ?? null,
      user_agent: actor.userAgent ?? null,
    });

    if (dto.sync_to_device) {
      await this.syncFingerprintToDevice(
        companyId,
        employeeId,
        fingerprintId.value,
        {
          device_id: device.id,
          card_reader_no: dto.card_reader_no,
        },
        actor,
      );
    }

    return this.findEmployeeFingerprints(companyId, employeeId, device.id);
  }

  async syncFingerprintToDevice(
    companyId: number,
    employeeId: number,
    fingerprintIdRaw: string,
    dto: SyncFingerprintDto,
    actor: FingerprintActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, dto.device_id);
    const fingerprintId = this.normalizeFingerprintId(fingerprintIdRaw);
    const credential = await this.findFingerprintCredentialOrFail(
      companyId,
      employee.id,
      fingerprintId.value,
    );
    const metadata = this.toObject(credential.metadata);
    const fingerprint = this.toObject(metadata.fingerprint);
    const fingerData = String(fingerprint.finger_data ?? '').trim();
    if (!fingerData) {
      throw new BadRequestException('Saved fingerprint is missing fingerData');
    }

    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);

    const setupPayload = this.buildFingerprintSetupPayload(
      deviceEmployeeNo,
      fingerprintId.number,
      fingerData,
      dto.card_reader_no ?? 1,
    );

    const setupResponse = await this.hikvisionAccessControlService.setupFingerprint(
      companyId,
      device.id,
      setupPayload,
    );
    const setupStatus = this.extractFingerprintSetupStatus(setupResponse.parsed, dto.card_reader_no ?? 1);
    const syncStatus = setupResponse.ok && setupStatus.success ? 'SYNCED' : 'FAILED';
    const syncErrorMessage = setupResponse.ok
      ? setupStatus.reason ?? 'Fingerprint upload failed'
      : `Set fingerprint failed with status ${setupResponse.status}`;
    const updatedMetadata = {
      ...metadata,
      fingerprint: {
        ...fingerprint,
        sync_status: syncStatus,
        last_sync_at: new Date().toISOString(),
      },
      device_syncs: this.updateFingerprintDeviceSync(
        this.toObject(metadata.device_syncs),
        device.id,
        {
          device_id: device.id,
          employee_no: deviceEmployeeNo,
          card_reader_no: dto.card_reader_no ?? 1,
          enabled: Boolean(
            this.toObject(this.toObject(metadata.device_syncs)[String(device.id)]).enabled ?? true,
          ),
          sync_status: syncStatus,
          last_synced_at: new Date().toISOString(),
          last_error_message: syncStatus === 'SYNCED' ? null : syncErrorMessage,
        },
      ),
      setup_response: this.maskSensitivePayload(this.toObject(setupResponse.parsed)),
    };
    credential.metadata = updatedMetadata;
    credential.lastSyncedAt = new Date();
    const saved = await this.credentialRepository.save(credential);

    await this.auditLogService.create({
      company_id: companyId,
      branch_id: device.branchId ?? null,
      employee_id: employee.id,
      employee_no: deviceEmployeeNo,
      employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
      device_id: device.id,
      action: EmployeeDeviceAccessActionEnum.SET_FINGERPRINT,
      status: syncStatus === 'SYNCED'
        ? EmployeeDeviceAccessAuditStatusEnum.SUCCESS
        : EmployeeDeviceAccessAuditStatusEnum.FAILED,
      request_payload: setupPayload,
      response_payload: this.toObject(setupResponse.parsed),
      error_message: syncStatus === 'SYNCED' ? null : syncErrorMessage,
      performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
      performed_by_user_id: actor.performedByUserId ?? null,
      ip_address: actor.ipAddress ?? null,
      user_agent: actor.userAgent ?? null,
    });

    if (syncStatus !== 'SYNCED') {
      throw new BadRequestException(syncErrorMessage);
    }

    return this.mapFingerprintCredential(saved, device.id);
  }

  async findEmployeeFingerprints(companyId: number, employeeId: number, deviceId?: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const qb = this.credentialRepository
      .createQueryBuilder('credential')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('credential.credential_type = :type', {
        type: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      })
      .andWhere('credential.credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      });

    const rows = await qb.orderBy('credential.created_at', 'DESC').getMany();
    return rows
      .filter((row) => {
        if (!deviceId) {
          return true;
        }

        const metadata = this.toObject(row.metadata);
        const deviceSyncs = this.toObject(metadata.device_syncs);
        return row.deviceId === deviceId || Boolean(deviceSyncs[String(deviceId)]);
      })
      .map((row) => this.mapFingerprintCredential(row, deviceId));
  }

  async deleteFingerprint(
    companyId: number,
    employeeId: number,
    fingerprintIdRaw: string,
    deviceId: number,
    deleteFromDevice: boolean,
    cardReaderNo = 1,
    actor: FingerprintActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, deviceId);
    const fingerprintId = this.normalizeFingerprintId(fingerprintIdRaw);
    const credential = await this.findFingerprintCredentialOrFail(
      companyId,
      employee.id,
      fingerprintId.value,
    );

    let responsePayload: Record<string, unknown> | null = null;
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);
    if (deleteFromDevice) {
      const payload = this.buildFingerprintDeletePayload(
        deviceEmployeeNo,
        fingerprintId.number,
        cardReaderNo,
      );
      const response = await this.hikvisionAccessControlService.deleteFingerprint(companyId, device.id, payload);
      responsePayload = this.toObject(response.parsed);
      const deleteStatus = this.extractFingerprintSetupStatus(response.parsed, cardReaderNo);
      const hasDeviceStatusList = deleteStatus.cardReaderRecvStatus !== null;
      if (!response.ok || (hasDeviceStatusList && !deleteStatus.success)) {
        const reason = response.ok
          ? deleteStatus.reason ?? 'Delete fingerprint failed'
          : this.extractDeviceErrorMessage(response.parsed, `Delete fingerprint failed with status ${response.status}`);
        throw new BadRequestException(reason);
      }
    }

    const metadata = this.toObject(credential.metadata);
    const fingerprint = this.toObject(metadata.fingerprint);
    const deviceSyncs = this.toObject(metadata.device_syncs);
    credential.metadata = {
      ...metadata,
      fingerprint: {
        ...fingerprint,
        sync_status: 'DELETED',
        deleted_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      device_syncs: this.updateFingerprintDeviceSync(deviceSyncs, device.id, {
        device_id: device.id,
        employee_no: deviceEmployeeNo,
        enabled: false,
        sync_status: 'DELETED',
        deleted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        card_reader_no: cardReaderNo,
      }),
      delete_response: responsePayload,
    };
    credential.lastSyncedAt = new Date();
    const saved = await this.credentialRepository.save(credential);

    await this.auditLogService.create({
      company_id: companyId,
      branch_id: device.branchId ?? null,
      employee_id: employee.id,
      employee_no: deviceEmployeeNo,
      employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
      device_id: device.id,
      action: EmployeeDeviceAccessActionEnum.DELETE_FINGERPRINT,
      status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
      request_payload: {
        fingerprint_id: fingerprintId.value,
        delete_from_device: deleteFromDevice,
        card_reader_no: cardReaderNo,
      },
      response_payload: responsePayload,
      performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
      performed_by_user_id: actor.performedByUserId ?? null,
      ip_address: actor.ipAddress ?? null,
      user_agent: actor.userAgent ?? null,
    });

    return this.mapFingerprintCredential(saved, device.id);
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
      'fingerdata',
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
    fingerData: string,
    fingerPrintQuality: number | null,
    syncStatus: string,
  ) {
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, deviceId);
    const credential = await this.saveFingerprintCredential({
      companyId,
      employee,
      deviceEmployeeNo,
      sourceDeviceId: deviceId,
      fingerprintId,
      fingerData,
      fingerNo: Number(fingerprintId),
      fingerPrintQuality,
      sessionId,
      overwrite: true,
      syncStatus,
    });

    credential.metadata = {
      ...this.toObject(credential.metadata),
      device_syncs: this.updateFingerprintDeviceSync(
        this.toObject(this.toObject(credential.metadata).device_syncs),
        deviceId,
        {
          device_id: deviceId,
          employee_no: deviceEmployeeNo,
          enabled: true,
          sync_status: syncStatus,
          card_reader_no: 1,
          last_synced_at: new Date().toISOString(),
        },
      ),
      setup_response: this.maskSensitivePayload(setupResponsePayload),
    };

    await this.credentialRepository.save(credential);
  }

  private async saveFingerprintCredential(input: {
    companyId: number;
    employee: Employee;
    deviceEmployeeNo: string;
    sourceDeviceId: number;
    fingerprintId: string;
    fingerData: string;
    fingerNo: number | null;
    fingerPrintQuality: number | null;
    sessionId: number | null;
    overwrite: boolean;
    syncStatus: string;
  }) {
    const fingerData = input.fingerData.trim();
    if (!fingerData) {
      throw new BadRequestException('fingerData is required');
    }

    await this.assertFingerprintSlotAvailable(
      input.companyId,
      input.employee.id,
      input.fingerprintId,
      input.overwrite,
    );

    let credential = await this.findFingerprintCredential(
      input.companyId,
      input.employee.id,
      input.fingerprintId,
    );

    if (!credential) {
      credential = this.credentialRepository.create({
        companyId: input.companyId,
        employeeId: input.employee.id,
        employeeNo: input.deviceEmployeeNo,
        deviceId: input.sourceDeviceId,
        credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
        credentialNo: input.fingerprintId,
        credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
        source: EmployeeAccessCredentialSourceEnum.DEVICE_SYNC,
      });
    }

    credential.employeeNo = input.deviceEmployeeNo;
    credential.deviceId = credential.deviceId ?? input.sourceDeviceId;
    credential.credentialNo = input.fingerprintId;
    credential.fingerprintId = input.fingerprintId;
    credential.fingerprintCount = 1;
    credential.hasFingerprint = true;
    credential.passwordSet = Boolean(credential.passwordSet);
    credential.lastSyncedAt = new Date();
    credential.credentialStatus = EmployeeAccessCredentialStatusEnum.ACTIVE;
    const existingMetadata = this.toObject(credential.metadata);
    const existingFingerprint = this.toObject(existingMetadata.fingerprint);
    const existingDeviceSyncs = this.toObject(existingMetadata.device_syncs);
    credential.metadata = {
      ...existingMetadata,
      fingerprint: {
        ...existingFingerprint,
        last_capture_session_id: input.sessionId,
        fingerprint_id: input.fingerprintId,
        finger_no: input.fingerNo,
        finger_print_quality: input.fingerPrintQuality,
        finger_data: fingerData,
        is_enabled: true,
        sync_status: input.syncStatus,
        last_updated_at: new Date().toISOString(),
      },
      // One backend fingerprint record can be synchronized to many devices, so
      // device-specific employee numbers and sync states live under device_syncs.
      device_syncs: this.updateFingerprintDeviceSync(
        existingDeviceSyncs,
        input.sourceDeviceId,
        {
          device_id: input.sourceDeviceId,
          employee_no: input.deviceEmployeeNo,
          enabled: true,
          sync_status: input.syncStatus,
          last_updated_at: new Date().toISOString(),
        },
      ),
    };

    return this.credentialRepository.save(credential);
  }

  private async assertFingerprintSlotAvailable(
    companyId: number,
    employeeId: number,
    fingerprintId: string,
    overwrite: boolean,
  ) {
    const existing = await this.findFingerprintCredential(companyId, employeeId, fingerprintId);

    if (existing && !overwrite) {
      throw new BadRequestException(
        `Fingerprint slot ${fingerprintId} already exists for this employee`,
      );
    }

    if (!existing) {
      const count = await this.countActiveEmployeeFingerprints(companyId, employeeId);
      if (count >= MAX_FINGERPRINTS_PER_EMPLOYEE) {
        throw new BadRequestException(
          `An employee can have at most ${MAX_FINGERPRINTS_PER_EMPLOYEE} saved fingerprints`,
        );
      }
    }
  }

  private async findFingerprintCredentialOrFail(
    companyId: number,
    employeeId: number,
    fingerprintId: string,
  ) {
    const credential = await this.findFingerprintCredential(companyId, employeeId, fingerprintId);

    if (!credential) {
      throw new NotFoundException('Fingerprint credential not found');
    }

    return credential;
  }

  private buildFingerprintSetupPayload(
    employeeNo: string,
    fingerprintId: number,
    fingerData: string,
    cardReaderNo: number,
  ) {
    return {
      FingerPrintCfg: {
        employeeNo,
        enableCardReader: [cardReaderNo],
        fingerPrintID: fingerprintId,
        fingerType: 'normalFP',
        fingerData,
        checkEmployeeNo: true,
      },
    };
  }

  private buildFingerprintDeletePayload(
    employeeNo: string,
    fingerprintId: number,
    cardReaderNo: number,
  ) {
    return {
      FingerPrintCfg: {
        employeeNo,
        enableCardReader: [cardReaderNo],
        fingerPrintID: fingerprintId,
        deleteFingerPrint: true,
        fingerType: 'normalFP',
      },
    };
  }

  private async setFingerprintEnabledState(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintIdRaw: string,
    enabled: boolean,
    actor: FingerprintActor,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const device = await this.findDeviceOrFail(companyId, deviceId);
    const fingerprintId = this.normalizeFingerprintId(fingerprintIdRaw);
    const credential = await this.findFingerprintCredentialOrFail(
      companyId,
      employee.id,
      fingerprintId.value,
    );
    const deviceEmployeeNo = await this.resolveDeviceEmployeeNo(companyId, employee.id, device.id);
    const metadata = this.toObject(credential.metadata);
    const fingerprint = this.toObject(metadata.fingerprint);
    const deviceSyncs = this.toObject(metadata.device_syncs);

    credential.metadata = {
      ...metadata,
      fingerprint: {
        ...fingerprint,
        is_enabled: enabled,
        last_updated_at: new Date().toISOString(),
      },
      device_syncs: this.updateFingerprintDeviceSync(deviceSyncs, device.id, {
        device_id: device.id,
        employee_no: deviceEmployeeNo,
        enabled,
        sync_status: String(
          this.toObject(deviceSyncs[String(device.id)]).sync_status ?? fingerprint.sync_status ?? 'SAVED',
        ),
        last_updated_at: new Date().toISOString(),
      }),
    };

    const saved = await this.credentialRepository.save(credential);

    await this.auditLogService.create({
      company_id: companyId,
      branch_id: device.branchId ?? null,
      employee_id: employee.id,
      employee_no: deviceEmployeeNo,
      employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
      device_id: device.id,
      action: EmployeeDeviceAccessActionEnum.SET_FINGERPRINT,
      status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
      request_payload: {
        fingerprint_id: fingerprintId.value,
        enabled,
      },
      response_payload: null,
      performed_by_company_user_id: actor.performedByCompanyUserId ?? null,
      performed_by_user_id: actor.performedByUserId ?? null,
      ip_address: actor.ipAddress ?? null,
      user_agent: actor.userAgent ?? null,
    });

    return this.mapFingerprintCredential(saved, device.id);
  }

  private async findFingerprintCredential(
    companyId: number,
    employeeId: number,
    fingerprintId: string,
  ) {
    return this.credentialRepository
      .createQueryBuilder('credential')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.employee_id = :employeeId', { employeeId })
      .andWhere('credential.credential_type = :type', {
        type: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      })
      .andWhere('credential.credential_no = :fingerprintId', { fingerprintId })
      .andWhere('credential.credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      })
      .orderBy('credential.created_at', 'ASC')
      .getOne();
  }

  private async countActiveEmployeeFingerprints(companyId: number, employeeId: number) {
    const raw = await this.credentialRepository
      .createQueryBuilder('credential')
      .select('COUNT(credential.id)', 'count')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.employee_id = :employeeId', { employeeId })
      .andWhere('credential.credential_type = :type', {
        type: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      })
      .andWhere('credential.credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      })
      .getRawOne<{ count?: string }>();

    return Number(raw?.count ?? 0);
  }

  private updateFingerprintDeviceSync(
    existing: Record<string, unknown>,
    deviceId: number,
    patch: Record<string, unknown>,
  ) {
    const key = String(deviceId);
    return {
      ...existing,
      [key]: {
        ...this.toObject(existing[key]),
        ...patch,
      },
    };
  }

  private async findAssignmentOrFail(companyId: number, employeeId: number, deviceId: number) {
    const assignment = await this.assignmentRepository.findOne({
      where: { companyId, employeeId, deviceId },
      select: ['id', 'employeeNo'],
    });

    if (!assignment) {
      throw new NotFoundException(
        `Employee ${employeeId} is not assigned to device ${deviceId}`,
      );
    }

    return assignment;
  }

  private extractFingerprintSetupStatus(payload: unknown, cardReaderNo: number) {
    const root = this.toObject(payload);
    const status = this.toObject(root.FingerPrintStatus ?? root);
    const statusList = Array.isArray(status.StatusList) ? status.StatusList : [];
    const row = statusList
      .map((item) => this.toObject(item))
      .find((item) => Number(item.id ?? cardReaderNo) === cardReaderNo) ?? this.toObject(statusList[0]);
    const rawStatus = row.cardReaderRecvStatus ?? row.status;
    const cardReaderRecvStatus = rawStatus === undefined || rawStatus === null ? null : Number(rawStatus);
    const success = cardReaderRecvStatus === 1;

    return {
      success,
      cardReaderRecvStatus,
      reason: success
        ? null
        : `Fingerprint upload failed for card reader ${cardReaderNo} with status ${cardReaderRecvStatus || 'unknown'}`,
    };
  }

  private extractDeviceErrorMessage(payload: unknown, fallback: string) {
    const data = this.toObject(payload);
    const candidates = [
      data.errorMsg,
      data.errorMessage,
      data.statusString,
      data.subStatusCode,
      this.toObject(data.ResponseStatus).statusString,
      this.toObject(data.ResponseStatus).subStatusCode,
    ];
    const detail = candidates
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' - ');

    return detail ? `${fallback}: ${detail}` : fallback;
  }

  private normalizeFingerprintId(value?: string | null) {
    const fingerprintId = (value ?? '1').trim() || '1';
    const fingerprintIdNumber = Number(fingerprintId);
    if (!Number.isInteger(fingerprintIdNumber) || fingerprintIdNumber < 1) {
      throw new BadRequestException('fingerprint_id must be a positive integer value');
    }

    return { value: fingerprintId, number: fingerprintIdNumber };
  }

  private validateFingerprintQuality(quality: number | null, minQuality?: number) {
    const threshold = minQuality ?? 60;
    if (quality === null || !Number.isFinite(quality)) {
      throw new BadRequestException('Fingerprint quality is missing from capture response');
    }
    if (quality < threshold) {
      throw new BadRequestException(
        `Poor fingerprint quality: ${quality}. Minimum required quality is ${threshold}`,
      );
    }
  }

  private async findDeviceOrFail(companyId: number, deviceId: number) {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId, companyId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  private mapFingerprintCredential(item: EmployeeAccessCredential, deviceId?: number) {
    const metadata = this.toObject(item.metadata);
    const fingerprint = this.toObject(metadata.fingerprint);
    const deviceSyncs = this.toObject(metadata.device_syncs);
    const scopedDeviceSync = deviceId ? this.toObject(deviceSyncs[String(deviceId)]) : {};
    const activeDeviceSyncs = Object.values(deviceSyncs)
      .map((value) => this.toObject(value))
      .filter((value) => value.sync_status !== 'DELETED');

    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: String(scopedDeviceSync.employee_no ?? item.employeeNo ?? '').trim() || null,
      device_id: deviceId ?? item.deviceId,
      source_device_id: item.deviceId,
      fingerprint_id: item.fingerprintId ?? item.credentialNo,
      finger_no: fingerprint.finger_no ?? null,
      finger_type: 'normalFP',
      finger_print_quality: fingerprint.finger_print_quality ?? null,
      has_fingerprint: item.hasFingerprint,
      enabled: Boolean(scopedDeviceSync.enabled ?? fingerprint.is_enabled ?? true),
      sync_status: scopedDeviceSync.sync_status ?? fingerprint.sync_status ?? null,
      synced_device_ids: activeDeviceSyncs
        .map((value) => Number(value.device_id))
        .filter((value) => Number.isInteger(value) && value > 0),
      last_synced_at: item.lastSyncedAt,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
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

  private async resolveDeviceEmployeeNo(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ): Promise<string> {
    const assignment = await this.assignmentRepository.findOne({
      where: { companyId, employeeId, deviceId },
      select: ['employeeNo'],
    });

    const assignmentEmployeeNo = assignment?.employeeNo?.trim();
    if (assignmentEmployeeNo) {
      return assignmentEmployeeNo;
    }

    const identity = await this.identityRepository.findOne({
      where: { companyId, employeeId, deviceId, isActive: true },
      select: ['employeeNo'],
      order: { updatedAt: 'DESC' },
    });

    const identityEmployeeNo = identity?.employeeNo?.trim();
    if (identityEmployeeNo) {
      return identityEmployeeNo;
    }

    throw new NotFoundException(
      `Employee ${employeeId} does not have a Hikvision employee number for device ${deviceId}`,
    );
  }

  private extractFingerprintCapture(payload: unknown): {
    fingerData: string | null;
    fingerNo: number | null;
    fingerPrintQuality: number | null;
  } {
    const data = this.toObject(payload);
    const cfg = this.toObject(data.CaptureFingerPrint ?? data.CaptureFingerPrintCfg ?? data);
    const direct = cfg.fingerData ?? cfg.fingerprintData ?? cfg.fingerPrintData ?? cfg.template;
    let fingerData: string | null = null;
    if (typeof direct === 'string' && direct.trim()) {
      fingerData = direct.trim();
    }

    const nestedCfg = this.toObject(cfg.FingerPrintInfo ?? cfg.FingerPrintCfg ?? cfg.fingerprintInfo);
    const nested = nestedCfg.fingerData ?? nestedCfg.fingerprintData ?? nestedCfg.fingerPrintData;
    if (!fingerData && typeof nested === 'string' && nested.trim()) {
      fingerData = nested.trim();
    }

    const fingerNoValue = cfg.fingerNo ?? nestedCfg.fingerNo ?? cfg.fingerPrintID ?? nestedCfg.fingerPrintID;
    const qualityValue = cfg.fingerPrintQuality
      ?? nestedCfg.fingerPrintQuality
      ?? cfg.fingerprintQuality
      ?? nestedCfg.fingerprintQuality
      ?? cfg.quality
      ?? nestedCfg.quality;

    return {
      fingerData,
      fingerNo: this.toNullableInteger(fingerNoValue),
      fingerPrintQuality: this.toNullableInteger(qualityValue),
    };
  }

  private toNullableInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
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
