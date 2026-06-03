import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { hashPassword } from '../../../../common/utils/hash.util';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import {
  HikvisionDeviceUserInput,
  HikvisionUserSearchOptions,
} from '../../../hikvision/hikvision-user-management.service';
import { HikvisionUserManagementService } from '../../../hikvision/hikvision-user-management.service';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../../hr/attendance/devices/enums/attendance-device-status.enum';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../../hr/employees/enums/employment-status.enum';
import { EmployeeDeviceIdentity } from '../../../hr/attendance/processing/entities/employee-device-identity.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupEmployeeSourceEnum } from '../../access-group-employees/enum/access-group-employee-source.enum';
import { AccessGroupEmployeeStatusEnum } from '../../access-group-employees/enum/access-group-employee-status.enum';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';
import { AccessGroupStatusEnum } from '../../access-groups/enum/access-group-status.enum';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessScheduleTemplateStatusEnum } from '../../access-schedule-templates/enum/access-schedule-template-status.enum';
import { EmployeeAccessCredential } from '../../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialSourceEnum } from '../../employee-access-credentials/enum/employee-access-credential-source.enum';
import { EmployeeAccessCredentialStatusEnum } from '../../employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeBiometricCaptureSessionService } from '../../employee-biometric-capture-sessions/service/employee-biometric-capture-session.service';
import { AssignEmployeeDevicesDto } from '../dto/assign-employee-devices.dto';
import { CaptureEmployeeDeviceFingerprintDto } from '../dto/capture-employee-device-fingerprint.dto';
import { CreateEmployeeDeviceCardDto } from '../dto/create-employee-device-card.dto';
import { DeleteEmployeeDeviceFingerprintDto } from '../dto/delete-employee-device-fingerprint.dto';
import { HikvisionUserSearchQueryDto } from '../dto/hikvision-user-search-query.dto';
import { SaveEmployeeDeviceFingerprintDto } from '../dto/save-employee-device-fingerprint.dto';
import { SyncEmployeeDeviceCardDto } from '../dto/sync-employee-device-card.dto';
import { UpdateEmployeeDeviceUserDto } from '../dto/update-employee-device-user.dto';
import { UpdateEmployeeDeviceCardDto } from '../dto/update-employee-device-card.dto';
import { UpdateEmployeeDeviceFingerprintDto } from '../dto/update-employee-device-fingerprint.dto';
import { SyncEmployeeDeviceFingerprintDto } from '../dto/sync-employee-device-fingerprint.dto';
import { EmployeeDeviceAssignment } from '../entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../../employee-device-right-plans/entity/employee-device-right-plan.entity';

type CredentialBundle = {
  password: string | null;
  hasPassword: boolean;
  hasCard: boolean;
  hasFingerprint: boolean;
  explicitUserVerifyMode: string | null;
  userVerifyMode: string;
};

type AssignmentSettings = {
  accessGroupId: number;
  accessGroupName: string;
  organizationId: number | null;
  userVerifyMode: string | null;
  validEnabled: boolean;
  validBeginTime: Date | null;
  validEndTime: Date | null;
  doorRight: string;
  rightPlan: ResolvedRightPlan[];
  localUiRight: boolean;
  closeDelayEnabled: boolean;
  maxOpenDoorTime: number;
  openDoorTime: number;
  metadata: Record<string, unknown> | null;
};

type ResolvedRightPlan = {
  doorNo: number;
  planTemplateNo: string;
  doorId: number | null;
  scheduleTemplateId: number | null;
  metadata: Record<string, unknown> | null;
};

type AccessGroupContext = {
  group: AccessGroup;
  membership: AccessGroupEmployee | null;
  doorRight: string;
  rightPlan: ResolvedRightPlan[];
};

type PasswordState = {
  password_enabled: boolean;
  password_sync_status: string | null;
  password_last_synced_at: string | null;
  user_verify_mode: string | null;
};

type AssignmentActor = {
  performedByCompanyUserId?: number;
  performedByUserId?: number;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class EmployeeDeviceAssignmentsService {
  private readonly logger = new Logger(EmployeeDeviceAssignmentsService.name);

  constructor(
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly employeeDeviceIdentityRepository: Repository<EmployeeDeviceIdentity>,
    @InjectRepository(EmployeeDeviceRightPlan)
    private readonly rightPlanRepository: Repository<EmployeeDeviceRightPlan>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(AccessGroup)
    private readonly accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(AccessGroupDoor)
    private readonly accessGroupDoorRepository: Repository<AccessGroupDoor>,
    @InjectRepository(AccessGroupEmployee)
    private readonly accessGroupEmployeeRepository: Repository<AccessGroupEmployee>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly accessScheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    private readonly hikvisionUserManagementService: HikvisionUserManagementService,
    private readonly biometricCaptureSessionService: EmployeeBiometricCaptureSessionService,
  ) {}

  async assignDevices(companyId: number, employeeId: number, dto: AssignEmployeeDevicesDto) {
    if (dto.sync_now === false) {
      throw new BadRequestException(
        'Employee device assignment requires immediate Hikvision registration',
      );
    }

    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const devices = await this.findHikvisionDevicesOrFail(companyId, dto.device_ids);
    const continueOnError = dto.continue_on_error ?? true;
    const results: Array<Record<string, unknown>> = [];
    let created = 0;

    for (const device of devices) {
      const existing = await this.assignmentRepository.findOne({
        where: { companyId, employeeId: employee.id, deviceId: device.id },
      });

      if (existing) {
        const error = new ConflictException(
          `Employee ${employee.id} is already assigned to device ${device.id}`,
        );

        results.push({
          device_id: device.id,
          employee_id: employee.id,
          status: 'FAILED',
          reason: error.message,
        });

        if (!continueOnError) {
          throw error;
        }
        continue;
      }

      try {
        const settings = await this.resolveSettingsFromInput(
          companyId,
          employee,
          device,
          dto,
        );
        const deviceEmployeeNo = await this.resolveAvailableDeviceEmployeeNo(companyId, device.id);
        const payload = await this.buildDeviceUserPayload(
          companyId,
          employee,
          device.id,
          deviceEmployeeNo,
          settings,
        );
        settings.userVerifyMode = payload.user_verify_mode ?? settings.userVerifyMode;

        // Device registration must succeed first so the assignment table remains a pure
        // reflection of successful employee-device links.
        const deviceResult = await this.hikvisionUserManagementService.createUserOnDevice(
          companyId,
          device.id,
          payload,
        );
        const assignment = await this.persistSuccessfulAssignment(
          companyId,
          employee,
          device.id,
          deviceEmployeeNo,
          settings,
        );

        created += 1;
        results.push({
          device_id: device.id,
          employee_id: employee.id,
          status: 'SYNCED',
          device_employee_no: assignment.employeeNo,
          device_result: deviceResult,
          assignment: await this.findAssignmentDetailsOrFail(assignment.id),
        });
      } catch (error) {
        results.push({
          device_id: device.id,
          employee_id: employee.id,
          status: 'FAILED',
          reason: (error as Error).message,
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    return {
      message: 'Employee device assignment processing completed',
      employee: this.mapEmployeeSummary(employee),
      created,
      success_count: results.filter((item) => item.status === 'SYNCED').length,
      failure_count: results.filter((item) => item.status === 'FAILED').length,
      results,
    };
  }

  async registerUser(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: UpdateEmployeeDeviceUserDto,
  ) {
    const result = await this.assignDevices(companyId, employeeId, {
      ...dto,
      device_ids: [deviceId],
      sync_now: true,
      continue_on_error: false,
    });

    return {
      message: 'Employee registered on Hikvision device successfully',
      employee: result.employee,
      device_id: deviceId,
      result: result.results[0] ?? null,
    };
  }

  async modifyUser(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: UpdateEmployeeDeviceUserDto,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);
    const deviceState = await this.hikvisionUserManagementService.getUserByEmployeeNumber(
      companyId,
      deviceId,
      assignment.employeeNo,
    );

    if (!deviceState.exists) {
      throw new NotFoundException(
        'Device user was not found on Hikvision. Use resync to recreate it.',
      );
    }

    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const settings = await this.resolveSettingsForUpdate(companyId, employee, device, assignment, dto);
    const payload = await this.buildDeviceUserPayload(
      companyId,
      employee,
      deviceId,
      assignment.employeeNo,
      settings,
    );
    settings.userVerifyMode = payload.user_verify_mode ?? settings.userVerifyMode;

    await this.hikvisionUserManagementService.updateUserOnDevice(companyId, deviceId, payload);

    this.applySettingsToAssignment(assignment, settings);
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        last_device_modify_at: new Date().toISOString(),
      },
    });

    const saved = await this.assignmentRepository.save(assignment);
    await this.replaceRightPlans(deviceId, saved, settings.rightPlan);
    await this.upsertAccessGroupEmployeeMembership(
      settings.accessGroupId,
      employee,
      deviceId,
      saved.employeeNo,
      settings.organizationId,
    );

    return {
      message: 'Employee device user modified successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
    };
  }

  async getUser(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, false);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);
    const employeeNo = assignment.employeeNo.trim();

    return this.hikvisionUserManagementService.getUserByEmployeeNumber(
      companyId,
      deviceId,
      employeeNo,
    );
  }

  async searchUsers(companyId: number, deviceId: number, query: HikvisionUserSearchQueryDto) {
    const options: HikvisionUserSearchOptions = {
      search_id: query.search_id,
      search_result_position: query.search_result_position,
      max_results: query.max_results,
      employee_nos: query.employee_no ? [query.employee_no] : undefined,
    };

    return this.hikvisionUserManagementService.searchUsersOnDevice(companyId, deviceId, options);
  }

  async disableUserAccessTemporarily(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ) {
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);

    await this.hikvisionUserManagementService.updateUserOnDevice(companyId, deviceId, {
      employee_no: assignment.employeeNo,
      valid: { enable: false },
    });

    assignment.validEnabled = false;
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        access_disabled: true,
        disabled_at: new Date().toISOString(),
      },
    });
    const saved = await this.assignmentRepository.save(assignment);

    return {
      message: 'Employee access disabled on device successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
    };
  }

  async enableUserAccess(companyId: number, employeeId: number, deviceId: number) {
    await this.findEmployeeOrFail(companyId, employeeId, true);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);

    await this.hikvisionUserManagementService.updateUserOnDevice(companyId, deviceId, {
      employee_no: assignment.employeeNo,
      valid: { enable: true },
    });

    assignment.validEnabled = true;
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        access_enabled: true,
        enabled_at: new Date().toISOString(),
      },
    });
    const saved = await this.assignmentRepository.save(assignment);

    return {
      message: 'Employee access enabled on device successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
    };
  }

  async createUserPassword(
    companyId: number,
    employeeId: number,
    deviceId: number,
    password: string,
    userVerifyMode?: string,
  ) {
    return this.syncUserPassword(
      companyId,
      employeeId,
      deviceId,
      password,
      userVerifyMode,
      'CREATE',
    );
  }

  async modifyUserPassword(
    companyId: number,
    employeeId: number,
    deviceId: number,
    password: string,
    userVerifyMode?: string,
  ) {
    return this.syncUserPassword(
      companyId,
      employeeId,
      deviceId,
      password,
      userVerifyMode,
      'MODIFY',
    );
  }

  async deleteUserPassword(
    companyId: number,
    employeeId: number,
    deviceId: number,
    userVerifyMode?: string,
  ) {
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);
    const result = await this.hikvisionUserManagementService.deleteUserPassword(
      companyId,
      deviceId,
      employeeId,
      userVerifyMode,
    );

    assignment.userVerifyMode = result.user_verify_mode;
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        device_password_hash: null,
        password_enabled: false,
        password_sync_status: 'SYNCED',
        password_last_synced_at: new Date().toISOString(),
        user_verify_mode: result.user_verify_mode,
      },
    });

    const saved = await this.assignmentRepository.save(assignment);

    return {
      message: 'Employee device password deleted successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
      device_result: result.device_response,
    };
  }

  async listCards(companyId: number, employeeId: number, deviceId: number) {
    await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);
    return this.findEmployeeCards(companyId, employeeId, deviceId);
  }

  async createCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: CreateEmployeeDeviceCardDto,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, device.id);
    const cardNo = this.normalizeCardNo(dto.card_no);
    const cardType = this.normalizeCardType(dto.card_type);
    const syncToDevice = dto.sync_to_device ?? true;

    await this.assertCardNumberAvailable(companyId, employee.id, cardNo);

    let credential = await this.findReusableCardByNo(companyId, employee.id, cardNo);
    if (!credential) {
      credential = this.credentialRepository.create({
        companyId,
        employeeId: employee.id,
        employeeNo: assignment.employeeNo,
        deviceId: null,
        credentialType: EmployeeAccessCredentialTypeEnum.CARD,
        credentialNo: cardNo,
        cardNo,
        credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
        source: EmployeeAccessCredentialSourceEnum.MANUAL,
      });
    }

    credential = await this.saveCardCredentialState(credential, {
      employee,
      assignment,
      cardNo,
      cardType,
      enabled: true,
      syncStatus: syncToDevice ? 'PENDING' : 'SAVED',
      syncError: null,
      userVerifyMode: dto.user_verify_mode ?? null,
    });

    const syncResult = syncToDevice
      ? await this.syncStoredCardCredential(
          companyId,
          employee,
          device,
          assignment,
          credential,
          {
            card_type: cardType,
            user_verify_mode: dto.user_verify_mode,
          },
          actor,
          'CREATE',
        )
      : { card: this.mapCardCredential(credential, device.id), device_result: null, synced: false };

    return {
      message: 'Employee card processed successfully',
      card: syncResult.card,
      device_result: syncResult.device_result,
    };
  }

  async modifyCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    cardId: number,
    dto: UpdateEmployeeDeviceCardDto,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, device.id);
    const credential = await this.findCardCredentialOrFail(companyId, employee.id, cardId);
    const nextCardNo = dto.card_no !== undefined ? this.normalizeCardNo(dto.card_no) : this.normalizeCardNo(credential.cardNo);
    const nextCardType = this.normalizeCardType(dto.card_type ?? this.readCardType(credential));
    const syncToDevice = dto.sync_to_device ?? true;
    const previousCardNo = this.normalizeCardNo(credential.cardNo);

    await this.assertCardNumberAvailable(companyId, employee.id, nextCardNo, credential.id);

    const updated = await this.saveCardCredentialState(credential, {
      employee,
      assignment,
      cardNo: nextCardNo,
      cardType: nextCardType,
      enabled: credential.credentialStatus !== EmployeeAccessCredentialStatusEnum.INACTIVE,
      syncStatus: syncToDevice ? 'PENDING' : 'SAVED',
      syncError: null,
      userVerifyMode:
        dto.user_verify_mode
        ?? this.extractCredentialUserVerifyMode(credential),
    });

    const syncResult = syncToDevice
      ? await this.syncStoredCardCredential(
          companyId,
          employee,
          device,
          assignment,
          updated,
          {
            card_type: nextCardType,
            user_verify_mode: dto.user_verify_mode,
          },
          actor,
          'MODIFY',
          previousCardNo !== nextCardNo ? previousCardNo : null,
        )
      : { card: this.mapCardCredential(updated, device.id), device_result: null, synced: false };

    return {
      message: 'Employee card updated successfully',
      card: syncResult.card,
      device_result: syncResult.device_result,
    };
  }

  async syncCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    cardId: number,
    dto: SyncEmployeeDeviceCardDto,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, device.id);
    const credential = await this.findCardCredentialOrFail(companyId, employee.id, cardId);

    const updated = await this.saveCardCredentialState(credential, {
      employee,
      assignment,
      cardNo: this.normalizeCardNo(credential.cardNo),
      cardType: this.normalizeCardType(dto.card_type ?? this.readCardType(credential)),
      enabled: credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE,
      syncStatus: 'PENDING',
      syncError: null,
      userVerifyMode: dto.user_verify_mode ?? this.extractCredentialUserVerifyMode(credential),
    });

    const syncResult = await this.syncStoredCardCredential(
      companyId,
      employee,
      device,
      assignment,
      updated,
      dto,
      actor,
      'SYNC',
    );

    return {
      message: 'Employee card synchronization completed',
      card: syncResult.card,
      device_result: syncResult.device_result,
    };
  }

  async disableCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    cardId: number,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);
    const credential = await this.findCardCredentialOrFail(companyId, employee.id, cardId);

    const updated = await this.saveCardCredentialState(credential, {
      employee,
      assignment,
      cardNo: this.normalizeCardNo(credential.cardNo),
      cardType: this.readCardType(credential),
      enabled: false,
      syncStatus: 'DISABLED_LOCAL_ONLY',
      syncError: null,
      userVerifyMode: this.extractCredentialUserVerifyMode(credential),
      deviceSyncStatus: 'DISABLED_LOCAL_ONLY',
    });

    await this.logCardAudit(companyId, employee, deviceId, assignment.employeeNo, {
      action: 'DISABLE',
      cardNo: this.normalizeCardNo(credential.cardNo),
      cardType: this.readCardType(credential),
      status: 'SUCCESS',
      actor,
    });

    return {
      message: 'Employee card disabled locally. The card remains on the device until it is deleted.',
      card: this.mapCardCredential(updated, deviceId),
    };
  }

  async enableCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    cardId: number,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, device.id);
    const credential = await this.findCardCredentialOrFail(companyId, employee.id, cardId);

    const updated = await this.saveCardCredentialState(credential, {
      employee,
      assignment,
      cardNo: this.normalizeCardNo(credential.cardNo),
      cardType: this.readCardType(credential),
      enabled: true,
      syncStatus: 'PENDING',
      syncError: null,
      userVerifyMode: this.extractCredentialUserVerifyMode(credential),
    });

    const syncResult = await this.syncStoredCardCredential(
      companyId,
      employee,
      device,
      assignment,
      updated,
      {
        card_type: this.readCardType(updated),
        user_verify_mode: this.extractCredentialUserVerifyMode(updated) ?? undefined,
      },
      actor,
      'ENABLE',
    );

    return {
      message: 'Employee card enabled successfully',
      card: syncResult.card,
      device_result: syncResult.device_result,
    };
  }

  async deleteCard(
    companyId: number,
    employeeId: number,
    deviceId: number,
    cardId: number,
    actor: AssignmentActor = {},
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);
    const credential = await this.findCardCredentialOrFail(companyId, employee.id, cardId);
    const cardNo = this.normalizeCardNo(credential.cardNo);
    const deviceResult = await this.hikvisionUserManagementService.deleteCard(
      companyId,
      deviceId,
      employee.id,
      cardNo,
    );

    credential.credentialStatus = EmployeeAccessCredentialStatusEnum.DELETED;
    credential.lastSyncedAt = new Date();
    credential.metadata = this.mergeCardMetadata(credential.metadata, {
      card: {
        card_no: cardNo,
        card_type: this.readCardType(credential),
        is_enabled: false,
        sync_status: 'DELETED',
        sync_error: null,
        deleted_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      device_syncs: {
        [String(deviceId)]: {
          device_id: deviceId,
          employee_no: assignment.employeeNo,
          card_no: cardNo,
          card_type: this.readCardType(credential),
          enabled: false,
          sync_status: 'DELETED',
          sync_error: null,
          last_synced_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        },
      },
    });

    const saved = await this.credentialRepository.save(credential);
    await this.logCardAudit(companyId, employee, deviceId, assignment.employeeNo, {
      action: 'DELETE',
      cardNo,
      cardType: this.readCardType(saved),
      status: 'SUCCESS',
      actor,
    });

    return {
      message: 'Employee card deleted successfully',
      card: this.mapCardCredential(saved, deviceId),
      device_result: deviceResult.device_response,
    };
  }

  async listFingerprints(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ) {
    await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);
    return this.biometricCaptureSessionService.findEmployeeFingerprints(
      companyId,
      employeeId,
      deviceId,
    );
  }

  async captureFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: CaptureEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.captureFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      dto,
      actor,
    );
  }

  async createFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    dto: SaveEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.createFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      dto,
      actor,
    );
  }

  async modifyFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: UpdateEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.modifyFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      actor,
    );
  }

  async syncFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: SyncEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.syncFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      actor,
    );
  }

  async resyncFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: SyncEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.syncFingerprint(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      dto,
      actor,
    );
  }

  async enableFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.enableFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      actor,
    );
  }

  async disableFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.disableFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      actor,
    );
  }

  async deleteFingerprint(
    companyId: number,
    employeeId: number,
    deviceId: number,
    fingerprintId: string,
    dto: DeleteEmployeeDeviceFingerprintDto,
    actor: AssignmentActor = {},
  ) {
    return this.biometricCaptureSessionService.deleteFingerprintForAssignment(
      companyId,
      employeeId,
      deviceId,
      fingerprintId,
      dto.card_reader_no ?? 1,
      actor,
    );
  }

  async removeDoorPermissionOnly(companyId: number, employeeId: number, deviceId: number) {
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);

    await this.hikvisionUserManagementService.updateUserOnDevice(companyId, deviceId, {
      employee_no: assignment.employeeNo,
      door_right: '',
      right_plan: [],
    });

    assignment.doorRight = '';
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        door_permission_removed_at: new Date().toISOString(),
      },
    });
    const saved = await this.assignmentRepository.save(assignment);
    await this.rightPlanRepository.delete({
      employeeDeviceAssignmentId: saved.id,
    });

    return {
      message: 'Employee door permissions removed on device successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
    };
  }

  async deleteUserOnly(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, false);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);

    const deviceDelete = await this.hikvisionUserManagementService.deleteUserFromDevice(
      companyId,
      deviceId,
      assignment.employeeNo,
    );

    await this.assignmentRepository.remove(assignment);
    await this.deactivateDeviceIdentity(companyId, employee.id, deviceId);

    return {
      message: 'Employee user deleted from device and local assignment removed successfully',
      employee_id: employee.id,
      device_id: deviceId,
      employee_no: assignment.employeeNo,
      device_delete: deviceDelete,
    };
  }

  async resyncUser(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId, true);
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);
    const settings = await this.resolveSettingsFromAssignment(companyId, employee, device, assignment);
    const payload = await this.buildDeviceUserPayload(
      companyId,
      employee,
      deviceId,
      assignment.employeeNo,
      settings,
    );
    settings.userVerifyMode = payload.user_verify_mode ?? settings.userVerifyMode;
    const deviceState = await this.hikvisionUserManagementService.getUserByEmployeeNumber(
      companyId,
      deviceId,
      assignment.employeeNo,
    );

    if (deviceState.exists) {
      await this.hikvisionUserManagementService.updateUserOnDevice(companyId, deviceId, payload);
    } else {
      await this.hikvisionUserManagementService.createUserOnDevice(companyId, deviceId, payload);
    }

    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        last_resync_at: new Date().toISOString(),
        access_group_id: settings.accessGroupId,
        access_group_name: settings.accessGroupName,
        resync_operation: deviceState.exists ? 'UPDATE' : 'CREATE',
      },
    });
    const saved = await this.assignmentRepository.save(assignment);
    await this.replaceRightPlans(deviceId, saved, settings.rightPlan);
    await this.upsertAccessGroupEmployeeMembership(
      settings.accessGroupId,
      employee,
      deviceId,
      saved.employeeNo,
      settings.organizationId,
    );

    return {
      message: 'Employee device user resynced successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
    };
  }

  async removeAssignment(companyId: number, employeeId: number, deviceId: number) {
    return this.deleteUserOnly(companyId, employeeId, deviceId);
  }

  async listAssignments(companyId: number, employeeId: number) {
    await this.findEmployeeOrFail(companyId, employeeId, false);
    const rows = await this.assignmentRepository.find({
      where: { companyId, employeeId },
      relations: {
        employee: true,
        device: true,
        rightPlans: true,
      },
      order: { createdAt: 'DESC' },
    });

    return {
      employee_id: employeeId,
      data: rows.map((row) => this.mapAssignment(row)),
    };
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    requireActive: boolean,
  ): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    if (requireActive && employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException('Only ACTIVE employees can be assigned or synced to devices');
    }

    return employee;
  }

  private async findHikvisionDevicesOrFail(companyId: number, deviceIds: number[]) {
    const uniqueDeviceIds = [...new Set(deviceIds)];
    const devices = await this.attendanceDeviceRepository.find({
      where: {
        id: In(uniqueDeviceIds),
        companyId,
      },
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

    const inactive = devices.find((device) => device.status !== AttendanceDeviceStatusEnum.ACTIVE);
    if (inactive) {
      throw new BadRequestException(`Device ${inactive.id} is inactive`);
    }

    return devices;
  }

  private async findHikvisionDeviceOrFail(companyId: number, deviceId: number) {
    const [device] = await this.findHikvisionDevicesOrFail(companyId, [deviceId]);
    return device;
  }

  private async findAssignmentByEmployeeOrFail(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ) {
    const assignment = await this.assignmentRepository.findOne({
      where: { companyId, employeeId, deviceId },
    });

    if (!assignment) {
      throw new NotFoundException('Employee device assignment not found');
    }

    return assignment;
  }

  private async findAssignmentDetailsOrFail(id: number) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: {
        employee: true,
        device: true,
        rightPlans: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Employee device assignment not found');
    }

    return this.mapAssignment(assignment);
  }

  private async resolveSettingsFromInput(
    companyId: number,
    employee: Employee,
    device: AttendanceDevice,
    input: UpdateEmployeeDeviceUserDto,
  ): Promise<AssignmentSettings> {
    const groupContext = await this.resolveAccessGroupContext(
      companyId,
      employee.id,
      device,
      input.access_group_id,
    );

    return {
      accessGroupId: groupContext.group.id,
      accessGroupName: groupContext.group.name,
      organizationId: groupContext.membership?.organizationId ?? null,
      userVerifyMode: this.toNullableString(input.user_verify_mode),
      validEnabled: input.valid_enabled ?? true,
      validBeginTime: this.toNullableDate(input.valid_begin_time),
      validEndTime: this.toNullableDate(input.valid_end_time),
      doorRight: groupContext.doorRight,
      rightPlan: groupContext.rightPlan,
      localUiRight: input.local_ui_right ?? false,
      closeDelayEnabled: input.close_delay_enabled ?? false,
      maxOpenDoorTime: input.max_open_door_time ?? 0,
      openDoorTime: input.open_door_time ?? 0,
      metadata: input.metadata ?? null,
    };
  }

  private async resolveSettingsForUpdate(
    companyId: number,
    employee: Employee,
    device: AttendanceDevice,
    assignment: EmployeeDeviceAssignment,
    input: UpdateEmployeeDeviceUserDto,
  ): Promise<AssignmentSettings> {
    const groupContext = await this.resolveAccessGroupContext(
      companyId,
      employee.id,
      device,
      input.access_group_id,
    );

    return {
      accessGroupId: groupContext.group.id,
      accessGroupName: groupContext.group.name,
      organizationId: groupContext.membership?.organizationId ?? assignment.organizationId ?? null,
      userVerifyMode:
        this.toNullableString(input.user_verify_mode) ?? assignment.userVerifyMode ?? null,
      validEnabled: input.valid_enabled ?? assignment.validEnabled ?? true,
      validBeginTime:
        input.valid_begin_time !== undefined
          ? this.toNullableDate(input.valid_begin_time)
          : assignment.validBeginTime,
      validEndTime:
        input.valid_end_time !== undefined
          ? this.toNullableDate(input.valid_end_time)
          : assignment.validEndTime,
      doorRight: groupContext.doorRight,
      rightPlan: groupContext.rightPlan,
      localUiRight: input.local_ui_right ?? assignment.localUiRight ?? false,
      closeDelayEnabled:
        input.close_delay_enabled ?? assignment.closeDelayEnabled ?? false,
      maxOpenDoorTime: input.max_open_door_time ?? assignment.maxOpenDoorTime ?? 0,
      openDoorTime: input.open_door_time ?? assignment.openDoorTime ?? 0,
      metadata:
        input.metadata !== undefined
          ? this.mergeMetadata(assignment.metadata, input.metadata)
          : assignment.metadata,
    };
  }

  private async persistSuccessfulAssignment(
    companyId: number,
    employee: Employee,
    deviceId: number,
    deviceEmployeeNo: string,
    settings: AssignmentSettings,
  ): Promise<EmployeeDeviceAssignment> {
    const now = new Date();
    const assignment = await this.assignmentRepository.save(
      this.assignmentRepository.create({
        companyId,
        employeeId: employee.id,
        employeeNo: deviceEmployeeNo,
        deviceId,
        organizationId: settings.organizationId,
        userVerifyMode: settings.userVerifyMode,
        validEnabled: settings.validEnabled,
        validBeginTime: settings.validBeginTime,
        validEndTime: settings.validEndTime,
        doorRight: settings.doorRight,
        localUiRight: settings.localUiRight,
        closeDelayEnabled: settings.closeDelayEnabled,
        maxOpenDoorTime: settings.maxOpenDoorTime,
        openDoorTime: settings.openDoorTime,
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
        lastSyncedAt: now,
        metadata: this.mergeMetadata(settings.metadata, {
          hikvision: {
            hikvision_employee_no: deviceEmployeeNo,
            access_group_id: settings.accessGroupId,
            access_group_name: settings.accessGroupName,
            user_verify_mode: settings.userVerifyMode,
            last_device_registration_at: now.toISOString(),
          },
        }),
      }),
    );

    try {
      await this.replaceRightPlans(deviceId, assignment, settings.rightPlan);
      await this.upsertDeviceIdentity(companyId, employee.id, assignment.employeeNo, deviceId);
      await this.upsertAccessGroupEmployeeMembership(
        settings.accessGroupId,
        employee,
        deviceId,
        assignment.employeeNo,
        settings.organizationId,
      );
      return assignment;
    } catch (error) {
      await this.assignmentRepository.delete({ id: assignment.id });
      await this.rollbackDeviceUserRegistration(companyId, deviceId, assignment.employeeNo);
      throw error;
    }
  }

  private async resolveSettingsFromAssignment(
    companyId: number,
    employee: Employee,
    device: AttendanceDevice,
    assignment: EmployeeDeviceAssignment,
  ): Promise<AssignmentSettings> {
    const accessGroupId = await this.resolveStoredAccessGroupId(companyId, employee.id, device.id, assignment);
    const groupContext = await this.resolveAccessGroupContext(
      companyId,
      employee.id,
      device,
      accessGroupId,
    );

    return {
      accessGroupId: groupContext.group.id,
      accessGroupName: groupContext.group.name,
      organizationId: groupContext.membership?.organizationId ?? assignment.organizationId ?? null,
      userVerifyMode: assignment.userVerifyMode ?? null,
      validEnabled: assignment.validEnabled ?? true,
      validBeginTime: assignment.validBeginTime,
      validEndTime: assignment.validEndTime,
      doorRight: groupContext.doorRight,
      rightPlan: groupContext.rightPlan,
      localUiRight: assignment.localUiRight ?? false,
      closeDelayEnabled: assignment.closeDelayEnabled ?? false,
      maxOpenDoorTime: assignment.maxOpenDoorTime ?? 0,
      openDoorTime: assignment.openDoorTime ?? 0,
      metadata: assignment.metadata,
    };
  }

  private async buildDeviceUserPayload(
    companyId: number,
    employee: Employee,
    deviceId: number,
    deviceEmployeeNo: string,
    settings: AssignmentSettings,
  ): Promise<HikvisionDeviceUserInput> {
    const credentials = await this.buildCredentialBundle(companyId, employee.id, deviceId);
    const resolvedUserVerifyMode = await this.hikvisionUserManagementService.resolveSupportedUserVerifyMode(
      companyId,
      deviceId,
      settings.userVerifyMode ?? credentials.explicitUserVerifyMode,
      this.buildUserVerifyModeCandidates(
        credentials.hasPassword,
        credentials.hasFingerprint,
        credentials.hasCard,
      ),
      'employee device assignment',
    );

    return {
      employee_no: deviceEmployeeNo,
      name: this.buildEmployeeDisplayName(employee),
      user_type: 'normal',
      valid: {
        enable: settings.validEnabled,
        begin_time:
          this.toIsoLikeString(settings.validBeginTime) ??
          this.formatHikvisionDateTime(this.startOfToday()),
        end_time:
          this.toIsoLikeString(settings.validEndTime) ??
          this.formatHikvisionDateTime(this.endOfDate(this.addYears(new Date(), 10))),
        time_type: 'local',
      },
      door_right: settings.doorRight,
      right_plan: settings.rightPlan.map((plan) => ({
        door_no: plan.doorNo,
        plan_template_no: plan.planTemplateNo,
      })),
      ...(credentials.password ? { password: credentials.password } : {}),
      user_verify_mode: resolvedUserVerifyMode,
      local_ui_right: settings.localUiRight,
      close_delay_enabled: settings.closeDelayEnabled,
      max_open_door_time: settings.maxOpenDoorTime,
      open_door_time: settings.openDoorTime,
      metadata: settings.metadata,
    };
  }

  private async buildCredentialBundle(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ): Promise<CredentialBundle> {
    const credentials = await this.credentialRepository.find({
      where: [
        { companyId, employeeId, deviceId },
        { companyId, employeeId, deviceId: IsNull() },
      ],
    });
    const active = credentials.filter(
      (credential) =>
        credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE,
    );

    const passwordCredential = active.find(
      (credential) =>
        (credential.credentialType === EmployeeAccessCredentialTypeEnum.PASSWORD ||
          credential.credentialType === EmployeeAccessCredentialTypeEnum.PIN) &&
        Boolean(credential.pinPassword?.trim()),
    );
    const cardCredential = active.find(
      (credential) =>
        credential.credentialType === EmployeeAccessCredentialTypeEnum.CARD &&
        Boolean(credential.cardNo?.trim()),
    );
    const fingerprintCredential = active.find(
      (credential) =>
        credential.credentialType === EmployeeAccessCredentialTypeEnum.FINGERPRINT ||
        credential.hasFingerprint,
    );

    const hasPassword = Boolean(passwordCredential?.pinPassword?.trim());
    const hasCard = Boolean(cardCredential?.cardNo?.trim());
    const hasFingerprint = Boolean(
      fingerprintCredential?.hasFingerprint || fingerprintCredential,
    );
    const explicitUserVerifyMode =
      this.extractCredentialUserVerifyMode(passwordCredential)
      ?? this.extractCredentialUserVerifyMode(cardCredential)
      ?? this.extractCredentialUserVerifyMode(fingerprintCredential);

    return {
      password: passwordCredential?.pinPassword?.trim() || null,
      hasPassword,
      hasCard,
      hasFingerprint,
      explicitUserVerifyMode,
      userVerifyMode: this.resolveUserVerifyMode(hasPassword, hasFingerprint, hasCard),
    };
  }

  private resolveUserVerifyMode(
    hasPassword: boolean,
    hasFingerprint: boolean,
    hasCard: boolean,
  ): string {
    return this.buildUserVerifyModeCandidates(hasPassword, hasFingerprint, hasCard)[0] ?? 'cardOrFpOrPw';
  }

  private buildUserVerifyModeCandidates(
    hasPassword: boolean,
    hasFingerprint: boolean,
    hasCard: boolean,
  ): string[] {
    if (hasFingerprint && hasCard && hasPassword) {
      return ['fpAndCardAndPw', 'cardOrFpOrPw'];
    }
    if (hasFingerprint && hasPassword) {
      return ['fpAndPw', 'cardOrFpOrPw', 'fpAndCardAndPw'];
    }
    if (hasCard && hasPassword) {
      return ['cardAndPw', 'cardOrFpOrPw', 'fpAndCardAndPw'];
    }
    if (hasFingerprint && hasCard) {
      return ['fpAndCard', 'fpOrCard', 'cardOrFpOrPw'];
    }
    if (hasFingerprint) {
      return ['fp', 'fpOrCard', 'cardOrFpOrPw'];
    }
    if (hasCard) {
      return ['card', 'fpOrCard', 'cardOrFpOrPw'];
    }
    if (hasPassword) {
      return ['cardOrFpOrPw', 'cardAndPw', 'fpAndPw', 'fpAndCardAndPw'];
    }
    return ['cardOrFpOrPw'];
  }

  private extractCredentialUserVerifyMode(
    credential: EmployeeAccessCredential | null | undefined,
  ): string | null {
    if (!credential) {
      return null;
    }

    return this.toNullableString(this.toObject(this.toObject(credential.metadata).hikvision).user_verify_mode);
  }

  private async resolveAvailableDeviceEmployeeNo(companyId: number, deviceId: number): Promise<string> {
    const nextBase = await this.resolveNextDeviceEmployeeNumber(companyId);

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = this.formatDeviceEmployeeNo(nextBase + attempt);
      const existsOnDevice = await this.hikvisionUserManagementService.validateUserExistsOnDevice(
        companyId,
        deviceId,
        candidate,
      );
      if (existsOnDevice.exists) {
        continue;
      }

      const assignmentExists = await this.assignmentRepository.exists({
        where: { companyId, employeeNo: candidate },
      });
      if (assignmentExists) {
        continue;
      }

      const identityExists = await this.employeeDeviceIdentityRepository.exists({
        where: { companyId, employeeNo: candidate, isActive: true },
      });
      if (identityExists) {
        continue;
      }

      return candidate;
    }

    throw new ConflictException(
      `Unable to generate a unique employee number for device ${deviceId}`,
    );
  }

  private async resolveNextDeviceEmployeeNumber(companyId: number): Promise<number> {
    const assignments = await this.assignmentRepository.find({
      where: { companyId },
      select: ['employeeNo'],
      withDeleted: true,
    });

    const identities = await this.employeeDeviceIdentityRepository.find({
      where: { companyId },
      select: ['employeeNo'],
    });

    const usedNumbers = [...assignments, ...identities]
      .map((item) => String(item.employeeNo ?? '').trim())
      .filter((value) => /^\d{8}$/.test(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));

    const next = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    if (next > 99_999_999) {
      throw new ConflictException('No 8-digit Hikvision employee numbers are available');
    }

    return next;
  }

  private formatDeviceEmployeeNo(sequence: number): string {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99_999_999) {
      throw new ConflictException('Invalid Hikvision employee number sequence');
    }

    return String(sequence).padStart(8, '0');
  }

  private async resolveAccessGroupContext(
    companyId: number,
    employeeId: number,
    device: AttendanceDevice,
    accessGroupId: number,
  ): Promise<AccessGroupContext> {
    const group = await this.accessGroupRepository.findOne({
      where: { id: accessGroupId, companyId },
    });

    if (!group) {
      throw new NotFoundException('Access group not found');
    }

    if (!group.isActive || group.status !== AccessGroupStatusEnum.ACTIVE) {
      throw new BadRequestException('Selected access group is inactive');
    }

    if (group.deviceId !== null && group.deviceId !== device.id) {
      throw new BadRequestException(
        `Access group ${group.id} is not assigned to device ${device.id}`,
      );
    }

    if (
      group.branchId !== null &&
      device.branchId !== null &&
      group.branchId !== device.branchId
    ) {
      throw new BadRequestException(
        `Access group ${group.id} does not belong to device branch ${device.branchId}`,
      );
    }

    const groupDoors = await this.accessGroupDoorRepository.find({
      where: [
        { accessGroupId: group.id, deviceId: device.id },
        { accessGroupId: group.id, deviceId: IsNull() },
      ],
      order: { doorNo: 'ASC', id: 'ASC' },
    });

    if (!groupDoors.length) {
      throw new BadRequestException(
        `Access group ${group.id} has no doors configured for device ${device.id}`,
      );
    }

    const templateIds = [...new Set(groupDoors.map((item) => item.scheduleTemplateId))];
    if (!templateIds.length) {
      throw new BadRequestException(
        `Access group ${group.id} has no schedule template configured`,
      );
    }

    const templates = await this.accessScheduleTemplateRepository.find({
      where: {
        id: In(templateIds),
        companyId,
        status: AccessScheduleTemplateStatusEnum.ACTIVE,
      },
    });
    const templateById = new Map(templates.map((item) => [item.id, item]));

    const rightPlanMap = new Map<string, ResolvedRightPlan>();
    for (const groupDoor of groupDoors) {
      const template = templateById.get(groupDoor.scheduleTemplateId);
      if (!template) {
        throw new BadRequestException(
          `Access group ${group.id} contains a door assignment without an active schedule template`,
        );
      }

      if (template.deviceId !== null && template.deviceId !== device.id) {
        throw new BadRequestException(
          `Schedule template ${template.id} is not assigned to device ${device.id}`,
        );
      }

      const plan: ResolvedRightPlan = {
        doorNo: groupDoor.doorNo,
        planTemplateNo: template.hikvisionTemplateNo.trim(),
        doorId: groupDoor.doorId,
        scheduleTemplateId: template.id,
        metadata: {
          source: 'ACCESS_GROUP',
          access_group_id: group.id,
          access_group_door_id: groupDoor.id,
          schedule_template_id: template.id,
        },
      };
      rightPlanMap.set(`${plan.doorNo}:${plan.planTemplateNo}`, plan);
    }

    const rightPlan = [...rightPlanMap.values()];

    const doorRight = [...new Set(rightPlan.map((item) => item.doorNo))]
      .sort((left, right) => left - right)
      .join(',');

    if (!doorRight) {
      throw new BadRequestException(`Access group ${group.id} produced no valid Hikvision doors`);
    }

    const membership = await this.findActiveAccessGroupMembership(companyId, employeeId, device.id);

    return {
      group,
      membership: membership?.accessGroupId === group.id ? membership : null,
      doorRight,
      rightPlan,
    };
  }

  private async resolveStoredAccessGroupId(
    companyId: number,
    employeeId: number,
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
  ): Promise<number> {
    const hikvisionMetadata = this.toObject(this.toObject(assignment.metadata).hikvision);
    const fromMetadata = Number(hikvisionMetadata.access_group_id);
    if (Number.isInteger(fromMetadata) && fromMetadata > 0) {
      return fromMetadata;
    }

    const membership = await this.findActiveAccessGroupMembership(companyId, employeeId, deviceId);
    if (membership) {
      return membership.accessGroupId;
    }

    throw new BadRequestException(
      `Employee ${employeeId} does not have an assigned access group for device ${deviceId}`,
    );
  }

  private async findActiveAccessGroupMembership(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ): Promise<AccessGroupEmployee | null> {
    return this.accessGroupEmployeeRepository
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.accessGroup', 'accessGroup')
      .where('membership.employee_id = :employeeId', { employeeId })
      .andWhere('membership.device_id = :deviceId', { deviceId })
      .andWhere('membership.status = :status', {
        status: AccessGroupEmployeeStatusEnum.ACTIVE,
      })
      .andWhere('accessGroup.company_id = :companyId', { companyId })
      .orderBy('membership.updated_at', 'DESC')
      .getOne();
  }

  private async upsertAccessGroupEmployeeMembership(
    accessGroupId: number,
    employee: Employee,
    deviceId: number,
    deviceEmployeeNo: string,
    organizationId: number | null,
  ) {
    const now = new Date();
    const existingRows = await this.accessGroupEmployeeRepository.find({
      where: { employeeId: employee.id, deviceId },
    });

    for (const row of existingRows) {
      if (row.accessGroupId === accessGroupId) {
        continue;
      }

      row.status = AccessGroupEmployeeStatusEnum.REMOVED;
      row.removedAt = now;
      await this.accessGroupEmployeeRepository.save(row);
    }

    let membership = existingRows.find((row) => row.accessGroupId === accessGroupId) ?? null;
    if (!membership) {
      membership = this.accessGroupEmployeeRepository.create({
        accessGroupId,
        employeeId: employee.id,
        employeeNo: deviceEmployeeNo,
        employeeName: this.buildEmployeeDisplayName(employee),
        organizationId,
        deviceId,
        assignedAt: now,
        status: AccessGroupEmployeeStatusEnum.ACTIVE,
        source: AccessGroupEmployeeSourceEnum.MANUAL,
        metadata: null,
      });
    } else {
      membership.employeeNo = deviceEmployeeNo;
      membership.employeeName = this.buildEmployeeDisplayName(employee);
      membership.organizationId = organizationId;
      membership.deviceId = deviceId;
      membership.status = AccessGroupEmployeeStatusEnum.ACTIVE;
      membership.source = AccessGroupEmployeeSourceEnum.MANUAL;
      membership.assignedAt = membership.assignedAt ?? now;
      membership.removedAt = null;
    }

    membership.metadata = this.mergeMetadata(membership.metadata, {
      hikvision: {
        device_employee_no: deviceEmployeeNo,
        last_assignment_sync_at: now.toISOString(),
      },
    });

    await this.accessGroupEmployeeRepository.save(membership);
  }

  private async replaceRightPlans(
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
    rightPlans: ResolvedRightPlan[],
  ) {
    await this.rightPlanRepository.delete({
      employeeDeviceAssignmentId: assignment.id,
    });

    for (const plan of rightPlans) {
      await this.rightPlanRepository.save(
        this.rightPlanRepository.create({
          employeeDeviceAssignmentId: assignment.id,
          employeeNo: assignment.employeeNo,
          deviceId,
          doorId: plan.doorId,
          doorNo: plan.doorNo,
          scheduleTemplateId: plan.scheduleTemplateId,
          hikvisionTemplateNo: plan.planTemplateNo.trim(),
          metadata: plan.metadata,
        }),
      );
    }
  }

  private applySettingsToAssignment(
    assignment: EmployeeDeviceAssignment,
    settings: AssignmentSettings,
  ) {
    assignment.organizationId = settings.organizationId;
    assignment.userVerifyMode = settings.userVerifyMode;
    assignment.validEnabled = settings.validEnabled;
    assignment.validBeginTime = settings.validBeginTime;
    assignment.validEndTime = settings.validEndTime;
    assignment.doorRight = settings.doorRight;
    assignment.localUiRight = settings.localUiRight;
    assignment.closeDelayEnabled = settings.closeDelayEnabled;
    assignment.maxOpenDoorTime = settings.maxOpenDoorTime;
    assignment.openDoorTime = settings.openDoorTime;
    assignment.metadata = this.mergeMetadata(settings.metadata, {
      hikvision: {
        access_group_id: settings.accessGroupId,
        access_group_name: settings.accessGroupName,
        user_verify_mode: settings.userVerifyMode,
      },
    });
  }

  private async upsertDeviceIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number,
  ) {
    let identity = await this.employeeDeviceIdentityRepository.findOne({
      where: { companyId, employeeId, deviceId },
    });

    if (!identity) {
      identity = await this.employeeDeviceIdentityRepository.findOne({
        where: { companyId, deviceId, employeeNo },
      });
    }

    if (!identity) {
      identity = this.employeeDeviceIdentityRepository.create({
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

    identity.metadata = this.mergeMetadata(identity.metadata, {
      hikvision: {
        last_synced_at: new Date().toISOString(),
      },
    });

    await this.employeeDeviceIdentityRepository.save(identity);
  }

  private async deactivateDeviceIdentity(companyId: number, employeeId: number, deviceId: number) {
    const identity = await this.employeeDeviceIdentityRepository.findOne({
      where: { companyId, employeeId, deviceId, isActive: true },
    });

    if (!identity) {
      return;
    }

    identity.isActive = false;
    await this.employeeDeviceIdentityRepository.save(identity);
  }

  private async rollbackDeviceUserRegistration(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ) {
    try {
      await this.hikvisionUserManagementService.deleteUserFromDevice(
        companyId,
        deviceId,
        employeeNo,
      );
    } catch (error) {
      this.logger.error(
        `Failed to rollback Hikvision user registration for device ${deviceId} and employeeNo ${employeeNo}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async syncUserPassword(
    companyId: number,
    employeeId: number,
    deviceId: number,
    password: string,
    userVerifyMode: string | undefined,
    operation: 'CREATE' | 'MODIFY',
  ) {
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employeeId, deviceId);
    // Password sync is device-first: we only persist the hashed local state after Hikvision
    // confirms the password update, so local metadata never gets ahead of the device.
    const result =
      operation === 'CREATE'
        ? await this.hikvisionUserManagementService.createUserPassword(
            companyId,
            deviceId,
            employeeId,
            password,
            userVerifyMode,
          )
        : await this.hikvisionUserManagementService.modifyUserPassword(
            companyId,
            deviceId,
            employeeId,
            password,
            userVerifyMode,
          );

    assignment.userVerifyMode = result.user_verify_mode;
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = this.mergeMetadata(assignment.metadata, {
      hikvision: {
        device_password_hash: await hashPassword(password),
        password_enabled: true,
        password_sync_status: 'SYNCED',
        password_last_synced_at: new Date().toISOString(),
        user_verify_mode: result.user_verify_mode,
      },
    });

    const saved = await this.assignmentRepository.save(assignment);

    return {
      message:
        operation === 'CREATE'
          ? 'Employee device password created successfully'
          : 'Employee device password modified successfully',
      assignment: await this.findAssignmentDetailsOrFail(saved.id),
      device_result: result.device_response,
    };
  }

  private async findEmployeeCards(companyId: number, employeeId: number, deviceId?: number) {
    const cards = await this.credentialRepository.find({
      where: { companyId, employeeId, credentialType: EmployeeAccessCredentialTypeEnum.CARD },
      order: { createdAt: 'ASC' },
    });

    return cards
      .filter((item) => item.credentialStatus !== EmployeeAccessCredentialStatusEnum.DELETED)
      .map((item) => this.mapCardCredential(item, deviceId));
  }

  private async findReusableCardByNo(
    companyId: number,
    employeeId: number,
    cardNo: string,
  ): Promise<EmployeeAccessCredential | null> {
    return this.credentialRepository
      .createQueryBuilder('credential')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.employee_id = :employeeId', { employeeId })
      .andWhere('credential.credential_type = :credentialType', {
        credentialType: EmployeeAccessCredentialTypeEnum.CARD,
      })
      .andWhere('credential.card_no = :cardNo', { cardNo })
      .andWhere('credential.credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      })
      .orderBy('credential.created_at', 'ASC')
      .getOne();
  }

  private async findCardCredentialOrFail(
    companyId: number,
    employeeId: number,
    cardId: number,
  ): Promise<EmployeeAccessCredential> {
    const credential = await this.credentialRepository.findOne({
      where: {
        id: cardId,
        companyId,
        employeeId,
        credentialType: EmployeeAccessCredentialTypeEnum.CARD,
      },
    });

    if (!credential || credential.credentialStatus === EmployeeAccessCredentialStatusEnum.DELETED) {
      throw new NotFoundException('Employee card not found');
    }

    return credential;
  }

  private async assertCardNumberAvailable(
    companyId: number,
    employeeId: number,
    cardNo: string,
    excludeCardId?: number,
  ) {
    const existing = await this.credentialRepository
      .createQueryBuilder('credential')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.credential_type = :credentialType', {
        credentialType: EmployeeAccessCredentialTypeEnum.CARD,
      })
      .andWhere('credential.card_no = :cardNo', { cardNo })
      .andWhere('credential.credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      })
      .orderBy('credential.created_at', 'ASC')
      .getOne();

    if (!existing) {
      return;
    }

    if (excludeCardId && existing.id === excludeCardId) {
      return;
    }

    if (existing.employeeId === employeeId) {
      return;
    }

    throw new ConflictException(`Card number ${this.maskCardNo(cardNo)} is already assigned`);
  }

  private async saveCardCredentialState(
    credential: EmployeeAccessCredential,
    input: {
      employee: Employee;
      assignment: EmployeeDeviceAssignment;
      cardNo: string;
      cardType: string;
      enabled: boolean;
      syncStatus: string;
      syncError: string | null;
      userVerifyMode: string | null;
      deviceSyncStatus?: string;
    },
  ) {
    credential.companyId = input.assignment.companyId;
    credential.employeeId = input.employee.id;
    credential.employeeNo = credential.employeeNo?.trim() || input.assignment.employeeNo;
    credential.deviceId = null;
    credential.credentialType = EmployeeAccessCredentialTypeEnum.CARD;
    credential.credentialNo = input.cardNo;
    credential.cardNo = input.cardNo;
    credential.credentialStatus = input.enabled
      ? EmployeeAccessCredentialStatusEnum.ACTIVE
      : EmployeeAccessCredentialStatusEnum.INACTIVE;
    credential.source = credential.source ?? EmployeeAccessCredentialSourceEnum.MANUAL;

    const existingDeviceSyncs = this.toObject(this.toObject(credential.metadata).device_syncs);
    credential.metadata = this.mergeCardMetadata(credential.metadata, {
      card: {
        card_no: input.cardNo,
        card_type: input.cardType,
        is_enabled: input.enabled,
        sync_status: input.syncStatus,
        sync_error: input.syncError,
        last_updated_at: new Date().toISOString(),
      },
      hikvision: {
        user_verify_mode: input.userVerifyMode,
      },
      device_syncs: {
        [String(input.assignment.deviceId)]: {
          ...this.toObject(existingDeviceSyncs[String(input.assignment.deviceId)]),
          device_id: input.assignment.deviceId,
          employee_no: input.assignment.employeeNo,
          card_no: input.cardNo,
          card_type: input.cardType,
          enabled: input.enabled,
          sync_status: input.deviceSyncStatus ?? input.syncStatus,
          sync_error: input.syncError,
          last_updated_at: new Date().toISOString(),
        },
      },
    });

    return this.credentialRepository.save(credential);
  }

  private async syncStoredCardCredential(
    companyId: number,
    employee: Employee,
    device: AttendanceDevice,
    assignment: EmployeeDeviceAssignment,
    credential: EmployeeAccessCredential,
    input: {
      card_type?: string;
      user_verify_mode?: string;
    },
    actor: AssignmentActor,
    mode: 'CREATE' | 'MODIFY' | 'SYNC' | 'ENABLE',
    previousCardNo?: string | null,
  ): Promise<{
    card: Record<string, unknown>;
    device_result: Record<string, unknown> | null;
    synced: boolean;
  }> {
    const cardNo = this.normalizeCardNo(credential.cardNo);
    const cardType = this.normalizeCardType(input.card_type ?? this.readCardType(credential));
    const scopedDeviceSync = this.toObject(this.toObject(credential.metadata).device_syncs)[String(device.id)];
    const currentDeviceSync = this.toObject(scopedDeviceSync);
    const useModifyOnly =
      mode === 'MODIFY'
      && this.toNullableString(currentDeviceSync.sync_status) === 'SYNCED'
      && (!previousCardNo || previousCardNo === cardNo);

    try {
      const result =
        useModifyOnly
          ? await this.hikvisionUserManagementService.modifyCard(companyId, device.id, employee.id, {
              card_no: cardNo,
              card_type: cardType,
              user_verify_mode: input.user_verify_mode,
            })
          : await this.hikvisionUserManagementService.syncCard(companyId, device.id, employee.id, {
              card_no: cardNo,
              card_type: cardType,
              user_verify_mode: input.user_verify_mode,
            });

      if (previousCardNo && previousCardNo !== cardNo) {
        try {
          await this.hikvisionUserManagementService.deleteCard(
            companyId,
            device.id,
            employee.id,
            previousCardNo,
          );
        } catch (cleanupError) {
          this.logger.warn(
            `New card ${this.maskCardNo(cardNo)} synced to device ${device.id}, but old card ${this.maskCardNo(previousCardNo)} could not be removed: ${(cleanupError as Error).message}`,
          );
        }
      }

      credential.lastSyncedAt = new Date();
      credential.metadata = this.mergeCardMetadata(credential.metadata, {
        card: {
          card_no: cardNo,
          card_type: cardType,
          is_enabled: true,
          sync_status: 'SYNCED',
          sync_error: null,
          last_synced_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        },
        hikvision: {
          user_verify_mode: result.user_verify_mode,
        },
        device_syncs: {
          [String(device.id)]: {
            device_id: device.id,
            employee_no: assignment.employeeNo,
            card_no: cardNo,
            card_type: cardType,
            enabled: true,
            sync_status: 'SYNCED',
            sync_error: null,
            user_verify_mode: result.user_verify_mode,
            last_synced_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          },
        },
      });
      const saved = await this.credentialRepository.save(credential);

      await this.logCardAudit(companyId, employee, device.id, assignment.employeeNo, {
        action: mode,
        cardNo,
        cardType,
        status: 'SUCCESS',
        actor,
      });

      return {
        card: this.mapCardCredential(saved, device.id),
        device_result: result.device_response,
        synced: true,
      };
    } catch (error) {
      credential.metadata = this.mergeCardMetadata(credential.metadata, {
        card: {
          card_no: cardNo,
          card_type: cardType,
          is_enabled: credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE,
          sync_status: 'FAILED',
          sync_error: (error as Error).message,
          last_updated_at: new Date().toISOString(),
        },
        device_syncs: {
          [String(device.id)]: {
            device_id: device.id,
            employee_no: assignment.employeeNo,
            card_no: cardNo,
            card_type: cardType,
            enabled: credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE,
            sync_status: 'FAILED',
            sync_error: (error as Error).message,
            last_updated_at: new Date().toISOString(),
          },
        },
      });
      const saved = await this.credentialRepository.save(credential);

      await this.logCardAudit(companyId, employee, device.id, assignment.employeeNo, {
        action: mode,
        cardNo,
        cardType,
        status: 'FAILED',
        actor,
        errorMessage: (error as Error).message,
      });

      return {
        card: this.mapCardCredential(saved, device.id),
        device_result: null,
        synced: false,
      };
    }
  }

  private async logCardAudit(
    companyId: number,
    employee: Employee,
    deviceId: number,
    deviceEmployeeNo: string,
    input: {
      action: 'CREATE' | 'MODIFY' | 'SYNC' | 'ENABLE' | 'DISABLE' | 'DELETE';
      cardNo: string;
      cardType: string;
      status: 'SUCCESS' | 'FAILED';
      actor: AssignmentActor;
      errorMessage?: string;
    },
  ) {
    const action =
      input.action === 'DELETE'
        ? 'DELETE_CARD'
        : 'SET_CARD';

    await this.logger.log(
      `${input.status} ${action} for employee ${employee.id} on device ${deviceId} using card ${this.maskCardNo(input.cardNo)}`,
    );
  }

  private readCardType(credential: EmployeeAccessCredential): string {
    return (
      this.toNullableString(this.toObject(this.toObject(credential.metadata).card).card_type)
      ?? 'normalCard'
    );
  }

  private mapCardCredential(item: EmployeeAccessCredential, deviceId?: number) {
    const metadata = this.toObject(item.metadata);
    const card = this.toObject(metadata.card);
    const deviceSyncs = this.toObject(metadata.device_syncs);
    const scopedDeviceSync = deviceId ? this.toObject(deviceSyncs[String(deviceId)]) : {};
    const activeDeviceSyncs = Object.values(deviceSyncs)
      .map((value) => this.toObject(value))
      .filter((value) => value.sync_status !== 'DELETED');

    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: this.toNullableString(scopedDeviceSync.employee_no) ?? null,
      device_id: deviceId ?? null,
      card_no: item.cardNo,
      card_type: this.toNullableString(scopedDeviceSync.card_type) ?? this.toNullableString(card.card_type) ?? 'normalCard',
      enabled:
        typeof scopedDeviceSync.enabled === 'boolean'
          ? Boolean(scopedDeviceSync.enabled)
          : item.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE,
      sync_status:
        this.toNullableString(scopedDeviceSync.sync_status)
        ?? this.toNullableString(card.sync_status),
      sync_error:
        this.toNullableString(scopedDeviceSync.sync_error)
        ?? this.toNullableString(card.sync_error),
      user_verify_mode:
        this.toNullableString(scopedDeviceSync.user_verify_mode)
        ?? this.extractCredentialUserVerifyMode(item),
      synced_device_ids: activeDeviceSyncs
        .filter((value) => this.toNullableString(value.sync_status) === 'SYNCED')
        .map((value) => Number(value.device_id))
        .filter((value) => Number.isInteger(value) && value > 0),
      last_synced_at:
        this.toNullableString(scopedDeviceSync.last_synced_at)
        ?? card.last_synced_at
        ?? item.lastSyncedAt,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private mergeCardMetadata(
    existing: Record<string, unknown> | null,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const safeExisting = this.toObject(existing);
    const safePatch = this.toObject(patch);
    const existingCard = this.toObject(safeExisting.card);
    const patchCard = this.toObject(safePatch.card);
    const existingHikvision = this.toObject(safeExisting.hikvision);
    const patchHikvision = this.toObject(safePatch.hikvision);
    const existingDeviceSyncs = this.toObject(safeExisting.device_syncs);
    const patchDeviceSyncs = this.toObject(safePatch.device_syncs);

    const mergedDeviceSyncs: Record<string, unknown> = { ...existingDeviceSyncs };
    for (const [key, value] of Object.entries(patchDeviceSyncs)) {
      mergedDeviceSyncs[key] = {
        ...this.toObject(existingDeviceSyncs[key]),
        ...this.toObject(value),
      };
    }

    return {
      ...safeExisting,
      ...safePatch,
      card: {
        ...existingCard,
        ...patchCard,
      },
      hikvision: {
        ...existingHikvision,
        ...patchHikvision,
      },
      device_syncs: mergedDeviceSyncs,
    };
  }

  private normalizeCardNo(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('card_no is required');
    }

    return normalized;
  }

  private normalizeCardType(value: unknown): string {
    const normalized = String(value ?? 'normalCard').trim();
    return normalized || 'normalCard';
  }

  private maskCardNo(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    if (normalized.length <= 4) {
      return '*'.repeat(normalized.length);
    }

    return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
  }

  private buildEmployeeDisplayName(employee: Employee): string {
    const preferred = employee.preferred_name?.trim();
    if (preferred) {
      return preferred;
    }

    const displayName = [employee.first_name, employee.middle_name, employee.last_name]
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item))
      .join(' ')
      .trim();

    return displayName || employee.employee_no;
  }

  private mapEmployeeSummary(employee: Employee) {
    return {
      id: employee.id,
      employee_no: employee.employee_no,
      first_name: employee.first_name,
      middle_name: employee.middle_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name,
      employment_status: employee.employment_status,
      primary_branch_id: employee.primary_branch_id,
      primary_department_id: employee.primary_department_id,
      primary_position_id: employee.primary_position_id,
      primary_designation_id: employee.primary_designation_id,
    };
  }

  private mapAssignment(item: EmployeeDeviceAssignment) {
    const hikvisionMetadata = this.toObject(this.toObject(item.metadata).hikvision);
    const passwordState = this.extractPasswordState(item);
    const deviceHikvisionMetadata = this.toObject(this.toObject(item.device?.metadata).hikvision);

    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      hikvision_employee_no: item.employeeNo,
      access_group_id: Number(hikvisionMetadata.access_group_id) || null,
      access_group_name:
        typeof hikvisionMetadata.access_group_name === 'string'
          ? hikvisionMetadata.access_group_name
          : null,
      device_id: item.deviceId,
      organization_id: item.organizationId,
      valid_begin_time: item.validBeginTime,
      valid_end_time: item.validEndTime,
      valid_enabled: item.validEnabled,
      door_right: item.doorRight,
      local_ui_right: item.localUiRight,
      close_delay_enabled: item.closeDelayEnabled,
      max_open_door_time: item.maxOpenDoorTime,
      open_door_time: item.openDoorTime,
      sync_status: item.syncStatus,
      last_synced_at: item.lastSyncedAt,
      password_enabled: passwordState.password_enabled,
      password_sync_status: passwordState.password_sync_status,
      password_last_synced_at: passwordState.password_last_synced_at,
      user_verify_mode: passwordState.user_verify_mode ?? item.userVerifyMode,
      supported_user_verify_modes: Array.isArray(deviceHikvisionMetadata.supported_user_verify_modes)
        ? deviceHikvisionMetadata.supported_user_verify_modes
        : [],
      metadata: this.maskSensitivePayload(item.metadata),
      right_plan:
        item.rightPlans?.map((plan) => ({
          id: plan.id,
          door_no: plan.doorNo,
          plan_template_no: plan.hikvisionTemplateNo,
          metadata: plan.metadata,
        })) ?? [],
      employee: item.employee ? this.mapEmployeeSummary(item.employee) : null,
      device: item.device
        ? {
            id: item.device.id,
            branch_id: item.device.branchId,
            device_name: item.device.deviceName,
            device_code: item.device.deviceCode,
            device_serial_number: item.device.deviceSerialNumber,
            status: item.device.status,
          }
        : null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private extractPasswordState(item: EmployeeDeviceAssignment): PasswordState {
    const hikvisionMetadata = this.toObject(this.toObject(item.metadata).hikvision);
    return {
      password_enabled: Boolean(hikvisionMetadata.password_enabled),
      password_sync_status: this.toNullableString(hikvisionMetadata.password_sync_status),
      password_last_synced_at: this.toNullableString(hikvisionMetadata.password_last_synced_at),
      user_verify_mode: this.toNullableString(hikvisionMetadata.user_verify_mode),
    };
  }

  private mergeMetadata(
    existing: Record<string, unknown> | null,
    patch: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!existing && !patch) {
      return null;
    }

    const safeExisting = this.toObject(existing);
    const safePatch = this.toObject(patch);
    const existingHikvision = this.toObject(safeExisting.hikvision);
    const patchHikvision = this.toObject(safePatch.hikvision);

    return {
      ...safeExisting,
      ...safePatch,
      hikvision: {
        ...existingHikvision,
        ...patchHikvision,
      },
    };
  }

  private maskSensitivePayload<T>(payload: T): T {
    if (payload === null || payload === undefined) {
      return payload;
    }

    const sensitiveKeys = new Set([
      'password',
      'pin_password',
      'device_password_hash',
      'password_hash',
    ]);

    const recurse = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => recurse(item));
      }

      if (!value || typeof value !== 'object') {
        return value;
      }

      const output: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          output[key] = '***MASKED***';
          continue;
        }
        output[key] = recurse(raw);
      }
      return output;
    };

    return recurse(payload) as T;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  private toNullableDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toIsoLikeString(value: Date | null): string | undefined {
    if (!value) {
      return undefined;
    }

    return this.formatHikvisionDateTime(value);
  }

  private startOfToday(): Date {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private endOfDate(value: Date): Date {
    const copy = new Date(value);
    copy.setHours(23, 59, 59, 0);
    return copy;
  }

  private addYears(value: Date, years: number): Date {
    const copy = new Date(value);
    copy.setFullYear(copy.getFullYear() + years);
    return copy;
  }

  private formatHikvisionDateTime(value: Date): string {
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
      value.getHours(),
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
}
