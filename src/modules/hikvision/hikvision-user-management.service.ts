import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { AccessScheduleTemplate } from '../access-control/access-schedule-templates/entity/access-schedule-template.entity';
import { EmployeeAccessCredential } from '../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../access-control/employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../access-control/employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../access-control/employee-device-right-plans/entity/employee-device-right-plan.entity';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-type.enum';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { EmployeeDeviceIdentity } from '../hr/attendance/processing/entities/employee-device-identity.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { normalizeHikvisionError } from './helpers/hikvision-error.helper';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';
import {
  mergeMetadata,
  sleep,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toObject,
} from './helpers/hikvision-utils';
import { HikvisionAccessControlService } from './hikvision-access-control.service';

export type HikvisionUserRightPlanInput = {
  door_no: number;
  plan_template_no: string;
};

export type HikvisionDeviceUserInput = {
  employee_no: string;
  name?: string | null;
  user_type?: string | null;
  valid?: {
    enable?: boolean;
    begin_time?: string | null;
    end_time?: string | null;
    time_type?: string | null;
  } | null;
  door_right?: string | null;
  right_plan?: HikvisionUserRightPlanInput[] | null;
  password?: string | null;
  user_verify_mode?: string | null;
  local_ui_right?: boolean | null;
  close_delay_enabled?: boolean | null;
  max_open_door_time?: number | null;
  open_door_time?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type HikvisionDeviceCardInput = {
  card_no: string;
  card_type?: string | null;
  user_verify_mode?: string | null;
  check_employee_no?: boolean | null;
};

export type HikvisionUserSearchOptions = {
  search_id?: string;
  search_result_position?: number;
  max_results?: number;
  employee_nos?: string[];
};

export type HikvisionBackendToDeviceSyncOptions = {
  device_id?: number;
  device_ids?: number[];
  branch_id?: number;
  employee_id?: number;
  employee_ids?: number[];
  continue_on_error?: boolean;
  include_inactive_devices?: boolean;
};

export type HikvisionDeviceToBackendSyncOptions = {
  max_results?: number;
  search_id?: string;
  employee_nos?: string[];
  continue_on_error?: boolean;
  max_pages?: number;
};

export type HikvisionBulkUserSyncOptions = {
  direction: 'PUSH' | 'PULL';
  device_id?: number;
  device_ids?: number[];
  branch_id?: number;
  employee_id?: number;
  employee_ids?: number[];
  continue_on_error?: boolean;
  include_inactive_devices?: boolean;
  max_results?: number;
  search_id?: string;
  employee_nos?: string[];
  max_pages?: number;
};

type HikvisionHttpResult = {
  status: number;
  ok: boolean;
  raw: string;
  parsed: Record<string, unknown> | string;
};

type HikvisionNormalizedUser = {
  employee_no: string;
  name: string | null;
  user_type: string | null;
  valid: {
    enable: boolean | null;
    begin_time: string | null;
    end_time: string | null;
    time_type: string | null;
  };
  door_right: string | null;
  right_plan: HikvisionUserRightPlanInput[];
  password_configured: boolean;
  user_verify_mode: string | null;
  local_ui_right: boolean | null;
  close_delay_enabled: boolean | null;
  max_open_door_time: number | null;
  open_door_time: number | null;
  device_id: number;
  matched_employee_id: number | null;
  raw: Record<string, unknown>;
};

type HikvisionNormalizedUserSearch = {
  device_id: number;
  search_id: string;
  search_result_position: number;
  max_results: number;
  total_matches: number;
  num_of_matches: number;
  response_status: string;
  users: HikvisionNormalizedUser[];
};

type PersistedPullUserResult = {
  employee_no: string;
  matched_employee_id: number | null;
  assignment_id: number;
  status: 'SYNCED' | 'PARTIAL' | 'FAILED';
  reason?: string;
};

type SyncCounters = {
  received: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
};

type BackendUserBundle = {
  employee: Employee;
  device: AttendanceDevice;
  assignment: EmployeeDeviceAssignment;
  rightPlans: EmployeeDeviceRightPlan[];
  credentials: EmployeeAccessCredential[];
};

@Injectable()
export class HikvisionUserManagementService {
  private readonly logger = new Logger(HikvisionUserManagementService.name);

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeDeviceRightPlan)
    private readonly employeeDeviceRightPlanRepository: Repository<EmployeeDeviceRightPlan>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly employeeDeviceIdentityRepository: Repository<EmployeeDeviceIdentity>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly employeeAccessCredentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly accessScheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    @InjectRepository(HikvisionSyncLog)
    private readonly hikvisionSyncLogRepository: Repository<HikvisionSyncLog>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
    private readonly hikvisionHelper: HikvisionHelperService,
  ) {}

  async createUserOnDevice(
    companyId: number,
    deviceId: number,
    input: HikvisionDeviceUserInput,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const resolvedUserVerifyMode =
      input.user_verify_mode !== undefined
        ? await this.resolveSupportedUserVerifyMode(
            companyId,
            device.id,
            input.user_verify_mode,
            this.buildUserVerifyModeCandidates(
              Boolean(toNullableString(input.password)),
              false,
              false,
            ),
            'manual device user creation',
          )
        : undefined;
    const payload = this.buildManualUserPayload(input);
    if (resolvedUserVerifyMode) {
      payload.UserInfo.userVerifyMode = resolvedUserVerifyMode;
    }

    const response = await this.requestWithRetry(
      `create-user:${device.id}:${String(payload.UserInfo.employeeNo)}`,
      () =>
        this.hikvisionAccessControlService.setupUserInfo(
          companyId,
          device.id,
          payload,
        ),
    );
    this.ensureHikvisionSuccess('CreateUserOnDevice', response);

    return {
      message: 'User created on Hikvision device successfully',
      device_id: device.id,
      user: this.mapNormalizedUser(toObject(payload.UserInfo), device.id, null),
      device_response: toObject(response.parsed),
    };
  }

  async updateUserOnDevice(
    companyId: number,
    deviceId: number,
    input: HikvisionDeviceUserInput,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const resolvedUserVerifyMode =
      input.user_verify_mode !== undefined
        ? await this.resolveSupportedUserVerifyMode(
            companyId,
            device.id,
            input.user_verify_mode,
            this.buildUserVerifyModeCandidates(
              input.password !== undefined && input.password !== '',
              false,
              false,
            ),
            'manual device user update',
          )
        : undefined;
    const payload = this.buildManualUserUpdatePayload(input);
    if (resolvedUserVerifyMode !== undefined) {
      payload.UserInfo.userVerifyMode = resolvedUserVerifyMode;
    }

    const response = await this.requestWithRetry(
      `update-user:${device.id}:${String(payload.UserInfo.employeeNo)}`,
      () =>
        this.hikvisionAccessControlService.modifyUserInfo(
          companyId,
          device.id,
          payload,
        ),
    );
    this.ensureHikvisionSuccess('UpdateUserOnDevice', response);

    return {
      message: 'User updated on Hikvision device successfully',
      device_id: device.id,
      user: this.mapNormalizedUser(toObject(payload.UserInfo), device.id, null),
      device_response: toObject(response.parsed),
    };
  }

  async createUserPassword(
    companyId: number,
    deviceId: number,
    employeeId: number,
    password: string,
    userVerifyMode?: string,
  ) {
    return this.syncUserPassword(
      companyId,
      deviceId,
      employeeId,
      password,
      userVerifyMode,
      'CREATE',
    );
  }

  async modifyUserPassword(
    companyId: number,
    deviceId: number,
    employeeId: number,
    password: string,
    userVerifyMode?: string,
  ) {
    return this.syncUserPassword(
      companyId,
      deviceId,
      employeeId,
      password,
      userVerifyMode,
      'MODIFY',
    );
  }

  async deleteUserPassword(
    companyId: number,
    deviceId: number,
    employeeId: number,
    userVerifyMode?: string,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const assignment = await this.findAssignmentOrFail(
      companyId,
      device.id,
      employeeId,
    );
    const resolvedUserVerifyMode = await this.resolvePasswordUserVerifyMode(
      companyId,
      employeeId,
      device.id,
      false,
      userVerifyMode,
    );
    const payload = this.buildManualUserUpdatePayload({
      employee_no: assignment.employeeNo,
      password: '',
      user_verify_mode: resolvedUserVerifyMode,
    });

    try {
      const response = await this.requestWithRetry(
        `delete-user-password:${device.id}:${assignment.employeeNo}`,
        () =>
          this.hikvisionAccessControlService.modifyUserInfo(
            companyId,
            device.id,
            payload,
          ),
      );
      this.ensureHikvisionSuccess('DeleteUserPassword', response);
      this.logger.log(
        `Deleted Hikvision password for assignment employee ${employeeId} on device ${device.id}`,
      );

      return {
        message: 'User password deleted on Hikvision device successfully',
        device_id: device.id,
        employee_id: employeeId,
        employee_no: assignment.employeeNo,
        password_enabled: false,
        user_verify_mode: resolvedUserVerifyMode,
        device_response: toObject(response.parsed),
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete Hikvision password for assignment employee ${employeeId} on device ${device.id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async createCard(
    companyId: number,
    deviceId: number,
    employeeId: number,
    input: HikvisionDeviceCardInput,
  ) {
    return this.syncCardInternal(
      companyId,
      deviceId,
      employeeId,
      input,
      'CREATE',
    );
  }

  async modifyCard(
    companyId: number,
    deviceId: number,
    employeeId: number,
    input: HikvisionDeviceCardInput,
  ) {
    return this.syncCardInternal(
      companyId,
      deviceId,
      employeeId,
      input,
      'MODIFY',
    );
  }

  async syncCard(
    companyId: number,
    deviceId: number,
    employeeId: number,
    input: HikvisionDeviceCardInput,
  ) {
    return this.syncCardInternal(
      companyId,
      deviceId,
      employeeId,
      input,
      'UPSERT',
    );
  }

  async deleteCard(
    companyId: number,
    deviceId: number,
    employeeId: number,
    cardNo: string,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const assignment = await this.findAssignmentOrFail(
      companyId,
      device.id,
      employeeId,
    );
    const normalizedCardNo = this.normalizeCardNo(cardNo);
    const payload = {
      CardInfoDelCond: {
        CardNoList: [{ cardNo: normalizedCardNo }],
      },
    };

    try {
      const response = await this.requestWithRetry(
        `delete-card:${device.id}:${assignment.employeeNo}:${normalizedCardNo}`,
        () =>
          this.hikvisionAccessControlService.deleteCardInfo(
            companyId,
            device.id,
            payload,
          ),
      );
      this.ensureHikvisionSuccess('DeleteCard', response);
      this.logger.log(
        `Deleted Hikvision card ${this.maskCardNo(normalizedCardNo)} for assignment employee ${employeeId} on device ${device.id}`,
      );

      return {
        message: 'Card deleted on Hikvision device successfully',
        device_id: device.id,
        employee_id: employeeId,
        employee_no: assignment.employeeNo,
        card_no: normalizedCardNo,
        device_response: toObject(response.parsed),
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete Hikvision card ${this.maskCardNo(normalizedCardNo)} for assignment employee ${employeeId} on device ${device.id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async deleteUserFromDevice(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);

    const payload = {
      UserInfoDelCond: {
        EmployeeNoList: [{ employeeNo: normalizedEmployeeNo }],
      },
    };

    const response = await this.requestWithRetry(
      `delete-user:${device.id}:${normalizedEmployeeNo}`,
      () =>
        this.hikvisionAccessControlService.deleteUserInfo(
          companyId,
          device.id,
          payload,
        ),
    );
    this.ensureHikvisionSuccess('DeleteUserFromDevice', response);

    return {
      message: 'User deleted from Hikvision device successfully',
      device_id: device.id,
      employee_no: normalizedEmployeeNo,
      device_response: toObject(response.parsed),
    };
  }

  async getUserByEmployeeNumber(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ) {
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);
    const searchResult = await this.searchUsersOnDevice(companyId, deviceId, {
      search_id: `search_${normalizedEmployeeNo}`,
      search_result_position: 0,
      max_results: 1,
      employee_nos: [normalizedEmployeeNo],
    });

    const user =
      searchResult.users.find(
        (item) => item.employee_no === normalizedEmployeeNo,
      ) ?? null;
    return {
      device_id: deviceId,
      employee_no: normalizedEmployeeNo,
      exists: Boolean(user),
      user,
    };
  }

  async searchUsersOnDevice(
    companyId: number,
    deviceId: number,
    options: HikvisionUserSearchOptions = {},
  ): Promise<HikvisionNormalizedUserSearch> {
    await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const payload = this.buildSearchPayload(options);

    const response = await this.requestWithRetry(
      `search-users:${deviceId}:${payload.UserInfoSearchCond.searchID}`,
      () =>
        this.hikvisionAccessControlService.searchUserInfo(
          companyId,
          deviceId,
          payload,
        ),
    );
    this.ensureHikvisionSuccess('SearchUsersOnDevice', response);

    return this.normalizeSearchResponse(
      deviceId,
      response.parsed,
      payload.UserInfoSearchCond.searchResultPosition,
      payload.UserInfoSearchCond.maxResults,
    );
  }

  async validateUserExistsOnDevice(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ) {
    const result = await this.getUserByEmployeeNumber(
      companyId,
      deviceId,
      employeeNo,
    );
    return {
      device_id: deviceId,
      employee_no: result.employee_no,
      exists: result.exists,
    };
  }

  async getSupportedUserVerifyModes(
    companyId: number,
    deviceId: number,
  ): Promise<string[]> {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      false,
    );
    const storedModes = this.extractSupportedUserVerifyModesFromDeviceMetadata(
      device.metadata,
    );
    if (storedModes.length > 0) {
      return storedModes;
    }

    try {
      const response =
        await this.hikvisionAccessControlService.getAccessControlCapabilities(
          companyId,
          device.id,
        );
      const capabilitiesRoot = toObject(
        toObject(response.parsed).AccessControl ??
          toObject(response.parsed).AccessControlCapability ??
          response.parsed,
      );
      const supportedModes =
        this.extractSupportedUserVerifyModesFromCapabilities(capabilitiesRoot);
      if (supportedModes.length > 0) {
        device.metadata = mergeMetadata(device.metadata, {
          hikvision: {
            supported_user_verify_modes: supportedModes,
            last_capabilities_refresh_at: new Date().toISOString(),
          },
        });
        await this.attendanceDeviceRepository.save(device);
      }
      return supportedModes;
    } catch (error) {
      this.logger.warn(
        `Unable to refresh supported Hikvision userVerifyMode values for device ${device.id}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  async resolveSupportedUserVerifyMode(
    companyId: number,
    deviceId: number,
    explicitUserVerifyMode: string | null | undefined,
    candidateModes: string[],
    context: string,
  ): Promise<string> {
    const normalizedExplicit = toNullableString(explicitUserVerifyMode);
    const supportedModes = await this.getSupportedUserVerifyModes(
      companyId,
      deviceId,
    );

    if (normalizedExplicit) {
      if (
        supportedModes.length > 0 &&
        !supportedModes.includes(normalizedExplicit)
      ) {
        throw new BadRequestException(
          `Selected user_verify_mode "${normalizedExplicit}" is not supported by device ${deviceId} for ${context}. Supported modes: ${supportedModes.join(', ')}`,
        );
      }
      return normalizedExplicit;
    }

    const normalizedCandidates = [
      ...new Set(
        candidateModes.map((item) => String(item).trim()).filter(Boolean),
      ),
    ];
    if (supportedModes.length === 0) {
      return normalizedCandidates[0] ?? 'cardOrFpOrPw';
    }

    const matchedMode = normalizedCandidates.find((item) =>
      supportedModes.includes(item),
    );
    if (matchedMode) {
      return matchedMode;
    }

    throw new BadRequestException(
      `Device ${deviceId} does not support any valid user_verify_mode for ${context}. Supported modes: ${supportedModes.join(', ')}`,
    );
  }

  async syncUserFromBackendToDevice(
    companyId: number,
    deviceId: number,
    employeeId: number,
  ) {
    const startedAt = new Date();
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );

    try {
      // The device employeeNo is the stable foreign key on Hikvision, so we resolve it
      // first and then build the rest of the payload around that identifier.
      const bundle = await this.buildBackendUserBundle(
        companyId,
        device.id,
        employeeId,
      );
      const payload = await this.buildBackendUserPayload(bundle);
      const userInfo = toObject(payload.UserInfo);
      const validInfo = toObject(userInfo.Valid);
      const syncedEmployeeNo = this.normalizeEmployeeNo(
        userInfo.employeeNo ?? bundle.assignment.employeeNo,
      );
      const exists = await this.validateUserExistsOnDevice(
        companyId,
        device.id,
        bundle.assignment.employeeNo,
      );

      const response = exists.exists
        ? await this.requestWithRetry(
            `sync-backend-update:${device.id}:${bundle.assignment.employeeNo}`,
            () =>
              this.hikvisionAccessControlService.modifyUserInfo(
                companyId,
                device.id,
                payload,
              ),
          )
        : await this.requestWithRetry(
            `sync-backend-create:${device.id}:${bundle.assignment.employeeNo}`,
            () =>
              this.hikvisionAccessControlService.setupUserInfo(
                companyId,
                device.id,
                payload,
              ),
          );

      this.ensureHikvisionSuccess(
        exists.exists ? 'SyncUserModifyOnDevice' : 'SyncUserCreateOnDevice',
        response,
      );

      bundle.assignment.syncStatus =
        EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
      bundle.assignment.lastSyncedAt = new Date();
      bundle.assignment.employeeNo = syncedEmployeeNo;
      bundle.assignment.hikvisionUserType =
        toNullableString(userInfo.userType) ??
        bundle.assignment.hikvisionUserType;
      bundle.assignment.userVerifyMode =
        toNullableString(userInfo.userVerifyMode) ??
        bundle.assignment.userVerifyMode;
      bundle.assignment.validEnabled =
        this.toNullableBoolean(validInfo.enable) ??
        bundle.assignment.validEnabled;
      bundle.assignment.validBeginTime = toNullableDate(validInfo.beginTime);
      bundle.assignment.validEndTime = toNullableDate(validInfo.endTime);
      bundle.assignment.doorRight =
        toNullableString(userInfo.doorRight) ?? bundle.assignment.doorRight;
      bundle.assignment.localUiRight =
        this.toNullableBoolean(userInfo.localUIRight) ??
        bundle.assignment.localUiRight;
      bundle.assignment.closeDelayEnabled =
        this.toNullableBoolean(userInfo.closeDelayEnabled) ??
        bundle.assignment.closeDelayEnabled;
      bundle.assignment.maxOpenDoorTime =
        toNullableNumber(userInfo.maxOpenDoorTime) ??
        bundle.assignment.maxOpenDoorTime;
      bundle.assignment.openDoorTime =
        toNullableNumber(userInfo.openDoorTime) ??
        bundle.assignment.openDoorTime;
      bundle.assignment.metadata = mergeMetadata(bundle.assignment.metadata, {
        hikvision: {
          last_push_at: new Date().toISOString(),
          last_push_status: response.status,
          last_push_operation: exists.exists ? 'MODIFY' : 'SETUP',
          last_device_payload: payload,
          last_device_response: toObject(response.parsed),
        },
      });

      const savedAssignment =
        await this.employeeDeviceAssignmentRepository.save(bundle.assignment);
      await this.hikvisionHelper.upsertDeviceIdentity(
        companyId,
        bundle.employee.id,
        syncedEmployeeNo,
        device.id,
        { hikvision: { last_synced_at: new Date().toISOString() } },
      );

      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        direction: HikvisionSyncLogDirectionEnum.PUSH,
        status: HikvisionSyncLogStatusEnum.SUCCESS,
        startedAt,
        completedAt: new Date(),
        counters: {
          received: 1,
          processed: 1,
          created: exists.exists ? 0 : 1,
          updated: exists.exists ? 1 : 0,
          failed: 0,
        },
        errorMessage: null,
        metadata: {
          employee_id: bundle.employee.id,
          employee_no: syncedEmployeeNo,
          assignment_id: savedAssignment.id,
        },
      });

      return {
        message: 'Backend user synced to Hikvision device successfully',
        device_id: device.id,
        employee_id: bundle.employee.id,
        employee_no: syncedEmployeeNo,
        operation: exists.exists ? 'MODIFY' : 'SETUP',
        user: this.mapNormalizedUser(userInfo, device.id, bundle.employee.id),
      };
    } catch (error) {
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        direction: HikvisionSyncLogDirectionEnum.PUSH,
        status: HikvisionSyncLogStatusEnum.FAILED,
        startedAt,
        completedAt: new Date(),
        counters: {
          received: 1,
          processed: 0,
          created: 0,
          updated: 0,
          failed: 1,
        },
        errorMessage: (error as Error).message,
        metadata: {
          employee_id: employeeId,
        },
      });
      throw normalizeHikvisionError(error);
    }
  }

  async syncUsersFromBackendToDevice(
    companyId: number,
    options: HikvisionBackendToDeviceSyncOptions = {},
  ) {
    const continueOnError = options.continue_on_error ?? true;
    const targets = await this.resolveBackendSyncTargets(companyId, options);
    const results: Array<Record<string, unknown>> = [];

    for (const target of targets) {
      try {
        const result = await this.syncUserFromBackendToDevice(
          companyId,
          target.deviceId,
          target.employeeId,
        );
        results.push({
          device_id: target.deviceId,
          employee_id: target.employeeId,
          status: 'SYNCED',
          result,
        });
      } catch (error) {
        const normalized = normalizeHikvisionError(error);
        results.push({
          device_id: target.deviceId,
          employee_id: target.employeeId,
          status: 'FAILED',
          reason: normalized.message,
        });

        if (!continueOnError) {
          throw normalized;
        }
      }
    }

    return {
      message: 'Backend to Hikvision user sync completed',
      direction: 'PUSH',
      total_targets: results.length,
      success_count: results.filter((item) => item.status === 'SYNCED').length,
      failure_count: results.filter((item) => item.status === 'FAILED').length,
      results,
    };
  }

  async syncUsersFromDeviceToBackend(
    companyId: number,
    deviceId: number,
    options: HikvisionDeviceToBackendSyncOptions = {},
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const startedAt = new Date();
    const maxPages = this.ensurePositiveInteger(
      options.max_pages ?? 100,
      'max_pages',
    );
    const pageSize = this.ensurePositiveInteger(
      options.max_results ?? 100,
      'max_results',
    );
    const continueOnError = options.continue_on_error ?? true;

    const counters: SyncCounters = {
      received: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
    };
    const userResults: PersistedPullUserResult[] = [];

    let cursor = 0;
    let page = 0;
    let totalMatches = 0;
    let responseStatus = 'OK';

    try {
      // Pull sync intentionally pages through device users so a partial failure does not
      // block the rest of the device population from being imported into backend state.
      while (page < maxPages) {
        const searchResponse = await this.searchUsersOnDevice(
          companyId,
          device.id,
          {
            search_id: options.search_id ?? `${Date.now()}`,
            search_result_position: cursor,
            max_results: pageSize,
            employee_nos: options.employee_nos,
          },
        );

        responseStatus = searchResponse.response_status;
        totalMatches = Math.max(totalMatches, searchResponse.total_matches);
        counters.received += searchResponse.users.length;

        for (const user of searchResponse.users) {
          try {
            const persistResult = await this.persistPulledUser(
              companyId,
              device,
              user,
            );
            userResults.push(persistResult);
            counters.processed += 1;
            if (persistResult.status === 'FAILED') {
              counters.failed += 1;
            } else if (persistResult.reason === 'CREATED') {
              counters.created += 1;
            } else {
              counters.updated += 1;
            }
          } catch (error) {
            counters.failed += 1;
            userResults.push({
              employee_no: user.employee_no,
              matched_employee_id: user.matched_employee_id,
              assignment_id: 0,
              status: 'FAILED',
              reason: (error as Error).message,
            });

            if (!continueOnError) {
              throw error;
            }
          }
        }

        const nextCursor = cursor + searchResponse.num_of_matches;
        const hasMoreByStatus =
          searchResponse.response_status.toUpperCase() === 'MORE';
        const hasMoreByCount =
          searchResponse.total_matches > 0 &&
          nextCursor < searchResponse.total_matches;

        if (!hasMoreByStatus && !hasMoreByCount) {
          break;
        }

        if (searchResponse.num_of_matches <= 0) {
          throw new BadRequestException(
            'Hikvision returned more user pages but num_of_matches was 0',
          );
        }

        cursor = nextCursor;
        page += 1;
      }

      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        direction: HikvisionSyncLogDirectionEnum.PULL,
        status:
          counters.failed > 0
            ? HikvisionSyncLogStatusEnum.PARTIAL
            : HikvisionSyncLogStatusEnum.SUCCESS,
        startedAt,
        completedAt: new Date(),
        counters,
        errorMessage: null,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatus,
          max_pages: maxPages,
        },
      });

      return {
        message: 'Hikvision device users synced into backend successfully',
        direction: 'PULL',
        device_id: device.id,
        total_matches: totalMatches,
        response_status: responseStatus,
        received_count: counters.received,
        processed_count: counters.processed,
        created_count: counters.created,
        updated_count: counters.updated,
        failed_count: counters.failed,
        results: userResults,
      };
    } catch (error) {
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        direction: HikvisionSyncLogDirectionEnum.PULL,
        status:
          counters.processed > 0 || counters.failed > 0
            ? HikvisionSyncLogStatusEnum.PARTIAL
            : HikvisionSyncLogStatusEnum.FAILED,
        startedAt,
        completedAt: new Date(),
        counters,
        errorMessage: (error as Error).message,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatus,
          max_pages: maxPages,
        },
      });
      throw normalizeHikvisionError(error);
    }
  }

  async bulkSynchronizeUsers(
    companyId: number,
    options: HikvisionBulkUserSyncOptions,
  ) {
    if (options.direction === 'PUSH') {
      return this.syncUsersFromBackendToDevice(companyId, {
        device_id: options.device_id,
        device_ids: options.device_ids,
        branch_id: options.branch_id,
        employee_id: options.employee_id,
        employee_ids: options.employee_ids,
        continue_on_error: options.continue_on_error,
        include_inactive_devices: options.include_inactive_devices,
      });
    }

    const devices = await this.resolveTargetDevices(companyId, {
      deviceId: options.device_id,
      deviceIds: options.device_ids,
      branchId: options.branch_id,
      includeInactive: options.include_inactive_devices,
    });
    const continueOnError = options.continue_on_error ?? true;
    const results: Array<Record<string, unknown>> = [];

    for (const device of devices) {
      try {
        const result = await this.syncUsersFromDeviceToBackend(
          companyId,
          device.id,
          {
            max_results: options.max_results,
            search_id: options.search_id,
            employee_nos: options.employee_nos,
            continue_on_error: continueOnError,
            max_pages: options.max_pages,
          },
        );
        results.push({
          device_id: device.id,
          status: 'SYNCED',
          result,
        });
      } catch (error) {
        const normalized = normalizeHikvisionError(error);
        results.push({
          device_id: device.id,
          status: 'FAILED',
          reason: normalized.message,
        });

        if (!continueOnError) {
          throw normalized;
        }
      }
    }

    return {
      message: 'Bulk Hikvision user synchronization completed',
      direction: 'PULL',
      total_devices: results.length,
      success_count: results.filter((item) => item.status === 'SYNCED').length,
      failure_count: results.filter((item) => item.status === 'FAILED').length,
      results,
    };
  }

  private async persistPulledUser(
    companyId: number,
    device: AttendanceDevice,
    user: HikvisionNormalizedUser,
  ): Promise<PersistedPullUserResult> {
    const matchedEmployee = await this.findEmployeeByDeviceEmployeeNo(
      companyId,
      device.id,
      user.employee_no,
    );
    const assignment = await this.upsertAssignmentFromDevice(
      companyId,
      device.id,
      matchedEmployee,
      user,
    );

    await this.syncAssignmentRightPlansFromDevice(
      companyId,
      device.id,
      assignment,
      user.raw,
    );
    if (matchedEmployee) {
      await this.hikvisionHelper.upsertDeviceIdentity(
        companyId,
        matchedEmployee.id,
        user.employee_no,
        device.id,
        { hikvision: { last_synced_at: new Date().toISOString() } },
      );
    }

    return {
      employee_no: user.employee_no,
      matched_employee_id: matchedEmployee?.id ?? null,
      assignment_id: assignment.id,
      status: matchedEmployee ? 'SYNCED' : 'PARTIAL',
      reason: assignment.metadata?.hikvision ? 'UPDATED' : 'CREATED',
    };
  }

  private async upsertAssignmentFromDevice(
    companyId: number,
    deviceId: number,
    employee: Employee | null,
    user: HikvisionNormalizedUser,
  ): Promise<EmployeeDeviceAssignment> {
    let assignment: EmployeeDeviceAssignment | null = null;
    let created = false;

    if (employee) {
      assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { employeeId: employee.id, deviceId },
      });
    }

    if (!assignment) {
      assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { companyId, deviceId, employeeNo: user.employee_no },
      });
    }

    if (!assignment) {
      created = true;
      assignment = this.employeeDeviceAssignmentRepository.create({
        companyId,
        employeeId: employee?.id ?? null,
        employeeNo: user.employee_no,
        employeeName: user.name,
        deviceId,
      });
    }

    assignment.companyId = companyId;
    assignment.employeeId = employee?.id ?? assignment.employeeId ?? null;
    assignment.employeeNo = user.employee_no;
    assignment.employeeName = user.name ?? assignment.employeeName ?? null;
    assignment.deviceId = deviceId;
    assignment.hikvisionUserType = user.user_type;
    assignment.userVerifyMode = user.user_verify_mode;
    assignment.validEnabled = user.valid.enable ?? assignment.validEnabled;
    assignment.validBeginTime = toNullableDate(user.valid.begin_time);
    assignment.validEndTime = toNullableDate(user.valid.end_time);
    assignment.doorRight = user.door_right;
    assignment.localUiRight = user.local_ui_right ?? assignment.localUiRight;
    assignment.closeDelayEnabled =
      user.close_delay_enabled ?? assignment.closeDelayEnabled;
    assignment.maxOpenDoorTime =
      user.max_open_door_time ?? assignment.maxOpenDoorTime;
    assignment.openDoorTime = user.open_door_time ?? assignment.openDoorTime;
    assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    assignment.lastSyncedAt = new Date();
    assignment.metadata = mergeMetadata(assignment.metadata, {
      hikvision: {
        last_pull_at: new Date().toISOString(),
        matched_employee_id: employee?.id ?? null,
        source: 'DEVICE_PULL',
        created_from_device_pull: created,
        raw_user: user.raw,
      },
    });

    return this.employeeDeviceAssignmentRepository.save(assignment);
  }

  private async syncAssignmentRightPlansFromDevice(
    companyId: number,
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
    rawUser: Record<string, unknown>,
  ) {
    const rightPlans = this.extractRightPlanRows(rawUser);
    await this.employeeDeviceRightPlanRepository.delete({
      employeeDeviceAssignmentId: assignment.id,
    });

    for (const plan of rightPlans) {
      const door = await this.accessDoorRepository.findOne({
        where: { companyId, deviceId, doorNo: plan.door_no },
      });
      const template = await this.accessScheduleTemplateRepository.findOne({
        where: {
          companyId,
          deviceId,
          hikvisionTemplateNo: plan.plan_template_no,
        },
      });

      await this.employeeDeviceRightPlanRepository.save(
        this.employeeDeviceRightPlanRepository.create({
          employeeDeviceAssignmentId: assignment.id,
          employeeNo: assignment.employeeNo,
          deviceId,
          doorId: door?.id ?? null,
          doorNo: plan.door_no,
          scheduleTemplateId: template?.id ?? null,
          hikvisionTemplateNo: plan.plan_template_no,
          metadata: {
            source: 'DEVICE_PULL',
            raw: rawUser,
          },
        }),
      );
    }
  }

  private async buildBackendUserBundle(
    companyId: number,
    deviceId: number,
    employeeId: number,
  ): Promise<BackendUserBundle> {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: { employeeId: employee.id, deviceId },
    });

    if (!assignment) {
      throw new BadRequestException(
        `Employee ${employee.id} is not assigned to device ${deviceId}. Create the employee-device assignment first.`,
      );
    }

    const rightPlans = await this.employeeDeviceRightPlanRepository.find({
      where: { employeeDeviceAssignmentId: assignment.id },
      order: { doorNo: 'ASC', id: 'ASC' },
    });
    const credentials = await this.employeeAccessCredentialRepository.find({
      where: [
        { companyId, employeeId: employee.id, deviceId },
        { companyId, employeeId: employee.id, deviceId: IsNull() },
      ],
    });
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );

    return {
      employee,
      device,
      assignment,
      rightPlans,
      credentials,
    };
  }

  private async buildBackendUserPayload(
    bundle: BackendUserBundle,
  ): Promise<{ UserInfo: Record<string, unknown> }> {
    const employeeNo = this.resolveDeviceEmployeeNo(bundle.assignment);
    const credentialBundle = this.buildCredentialBundle(bundle.credentials);
    const rightPlan = this.buildRightPlanPayload(
      bundle.assignment,
      bundle.rightPlans,
    );
    const doorRight =
      bundle.assignment.doorRight?.trim() ||
      rightPlan.map((item) => item.doorNo).join(',');
    const metadataRoot = toObject(bundle.assignment.metadata?.hikvision);
    const metadataUserType =
      toNullableString(metadataRoot.user_type) ||
      toNullableString(metadataRoot.userType);
    const userType =
      bundle.assignment.hikvisionUserType || metadataUserType || 'normal';
    const resolvedUserVerifyMode = await this.resolveSupportedUserVerifyMode(
      bundle.device.companyId,
      bundle.device.id,
      bundle.assignment.userVerifyMode ??
        credentialBundle.explicitUserVerifyMode,
      this.buildUserVerifyModeCandidates(
        credentialBundle.hasPassword,
        credentialBundle.hasFingerprint,
        credentialBundle.hasCard,
      ),
      'backend-to-device user synchronization',
    );

    return {
      UserInfo: {
        employeeNo,
        name: this.buildEmployeeDisplayName(bundle.employee),
        userType,
        Valid: {
          enable: bundle.assignment.validEnabled ?? true,
          beginTime: this.formatHikvisionDateTime(
            bundle.assignment.validBeginTime ?? this.startOfToday(),
          ),
          endTime: this.formatHikvisionDateTime(
            bundle.assignment.validEndTime ??
              this.endOfDate(this.addYears(new Date(), 10)),
          ),
          timeType: 'local',
        },
        ...(doorRight ? { doorRight } : {}),
        ...(rightPlan.length ? { RightPlan: rightPlan } : {}),
        ...(credentialBundle.password
          ? { password: credentialBundle.password }
          : {}),
        userVerifyMode: resolvedUserVerifyMode,
        localUIRight: bundle.assignment.localUiRight ?? false,
        closeDelayEnabled: bundle.assignment.closeDelayEnabled ?? false,
        maxOpenDoorTime: bundle.assignment.maxOpenDoorTime ?? 0,
        openDoorTime: bundle.assignment.openDoorTime ?? 0,
      },
    };
  }

  private buildManualUserPayload(input: HikvisionDeviceUserInput): {
    UserInfo: Record<string, unknown>;
  } {
    const employeeNo = this.normalizeEmployeeNo(input.employee_no);
    const name = toNullableString(input.name);
    const userType = toNullableString(input.user_type) || 'normal';
    const doorRight = toNullableString(input.door_right);
    const valid = input.valid ?? {};
    const rightPlan = (input.right_plan ?? []).map((item) => ({
      doorNo: this.ensurePositiveInteger(item.door_no, 'right_plan.door_no'),
      planTemplateNo: this.normalizeTemplateNo(item.plan_template_no),
    }));

    return {
      UserInfo: {
        employeeNo,
        ...(name ? { name } : {}),
        userType,
        Valid: {
          enable: valid.enable ?? true,
          beginTime:
            toNullableString(valid.begin_time) ||
            this.formatHikvisionDateTime(this.startOfToday()),
          endTime:
            toNullableString(valid.end_time) ||
            this.formatHikvisionDateTime(
              this.endOfDate(this.addYears(new Date(), 10)),
            ),
          timeType: toNullableString(valid.time_type) || 'local',
        },
        ...(doorRight ? { doorRight } : {}),
        ...(rightPlan.length ? { RightPlan: rightPlan } : {}),
        ...(toNullableString(input.password)
          ? { password: toNullableString(input.password) }
          : {}),
        ...(toNullableString(input.user_verify_mode)
          ? { userVerifyMode: toNullableString(input.user_verify_mode) }
          : {}),
        localUIRight: input.local_ui_right ?? false,
        closeDelayEnabled: input.close_delay_enabled ?? false,
        maxOpenDoorTime: toNullableNumber(input.max_open_door_time) ?? 0,
        openDoorTime: toNullableNumber(input.open_door_time) ?? 0,
      },
    };
  }

  private buildManualUserUpdatePayload(input: HikvisionDeviceUserInput): {
    UserInfo: Record<string, unknown>;
  } {
    const employeeNo = this.normalizeEmployeeNo(input.employee_no);
    const payload: Record<string, unknown> = {
      employeeNo,
    };

    if (input.name !== undefined) {
      payload.name = toNullableString(input.name);
    }
    if (input.user_type !== undefined) {
      payload.userType = toNullableString(input.user_type) || 'normal';
    }
    if (input.valid !== undefined) {
      const validPayload: Record<string, unknown> = {};
      if (input.valid?.enable !== undefined) {
        validPayload.enable = input.valid.enable;
      }
      if (input.valid?.begin_time !== undefined) {
        validPayload.beginTime = toNullableString(input.valid.begin_time);
      }
      if (input.valid?.end_time !== undefined) {
        validPayload.endTime = toNullableString(input.valid.end_time);
      }
      if (input.valid?.time_type !== undefined) {
        validPayload.timeType =
          toNullableString(input.valid.time_type) || 'local';
      }
      payload.Valid = validPayload;
    }
    if (input.door_right !== undefined) {
      payload.doorRight = input.door_right ?? '';
    }
    if (input.right_plan !== undefined) {
      payload.RightPlan = (input.right_plan ?? []).map((item) => ({
        doorNo: this.ensurePositiveInteger(item.door_no, 'right_plan.door_no'),
        planTemplateNo: this.normalizeTemplateNo(item.plan_template_no),
      }));
    }
    if (input.password !== undefined) {
      payload.password =
        input.password === '' ? '' : toNullableString(input.password);
    }
    if (input.user_verify_mode !== undefined) {
      payload.userVerifyMode = toNullableString(input.user_verify_mode);
    }
    if (input.local_ui_right !== undefined) {
      payload.localUIRight = input.local_ui_right;
    }
    if (input.close_delay_enabled !== undefined) {
      payload.closeDelayEnabled = input.close_delay_enabled;
    }
    if (input.max_open_door_time !== undefined) {
      payload.maxOpenDoorTime = toNullableNumber(input.max_open_door_time) ?? 0;
    }
    if (input.open_door_time !== undefined) {
      payload.openDoorTime = toNullableNumber(input.open_door_time) ?? 0;
    }

    return {
      UserInfo: payload,
    };
  }

  private buildSearchPayload(options: HikvisionUserSearchOptions) {
    const employeeNos = [
      ...new Set(
        (options.employee_nos ?? []).map((item) =>
          this.normalizeEmployeeNo(item),
        ),
      ),
    ];

    return {
      UserInfoSearchCond: {
        searchID: buildAttendanceDeviceSearchId(
          options.search_id?.trim() || 'sync_users',
          employeeNos[0] ?? 'all',
        ),
        searchResultPosition: this.ensureNonNegativeInteger(
          options.search_result_position ?? 0,
          'search_result_position',
        ),
        maxResults: this.ensurePositiveInteger(
          options.max_results ?? 100,
          'max_results',
        ),
        ...(employeeNos.length
          ? {
              EmployeeNoList: employeeNos.map((employeeNo) => ({ employeeNo })),
            }
          : {}),
      },
    };
  }

  private normalizeSearchResponse(
    deviceId: number,
    payload: Record<string, unknown> | string,
    fallbackPosition: number,
    fallbackMaxResults: number,
  ): HikvisionNormalizedUserSearch {
    const root = this.extractSearchRoot(payload);
    const users = this.extractUsersFromSearch(root).map((user) =>
      this.mapNormalizedUser(user, deviceId, null),
    );

    return {
      device_id: deviceId,
      search_id: toNullableString(root.searchID) || `${Date.now()}`,
      search_result_position:
        toNullableNumber(root.searchResultPosition) ?? fallbackPosition,
      max_results: toNullableNumber(root.maxResults) ?? fallbackMaxResults,
      total_matches: toNullableNumber(root.totalMatches) ?? users.length,
      num_of_matches: toNullableNumber(root.numOfMatches) ?? users.length,
      response_status:
        toNullableString(root.responseStatusStrg) ||
        toNullableString(root.responseStatus) ||
        'OK',
      users,
    };
  }

  private extractSearchRoot(
    payload: Record<string, unknown> | string,
  ): Record<string, unknown> {
    const data = toObject(payload);
    return toObject(data.UserInfoSearch ?? data.UserInfoSearchResult ?? data);
  }

  private extractUsersFromSearch(
    payload: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const list =
      payload.UserInfo ?? payload.UserInfoList ?? payload.userInfoList ?? [];
    if (Array.isArray(list)) {
      return list.map((item) => toObject(item));
    }
    if (list && typeof list === 'object') {
      return [toObject(list)];
    }
    return [];
  }

  private mapNormalizedUser(
    user: Record<string, unknown>,
    deviceId: number,
    matchedEmployeeId: number | null,
  ): HikvisionNormalizedUser {
    const valid = toObject(user.Valid ?? user.valid);
    return {
      employee_no: this.normalizeEmployeeNo(user.employeeNo),
      name: toNullableString(user.name),
      user_type: toNullableString(user.userType),
      valid: {
        enable: this.toNullableBoolean(valid.enable),
        begin_time: toNullableString(valid.beginTime),
        end_time: toNullableString(valid.endTime),
        time_type: toNullableString(valid.timeType),
      },
      door_right: toNullableString(user.doorRight),
      right_plan: this.extractRightPlanRows(user),
      password_configured: Boolean(toNullableString(user.password)),
      user_verify_mode: toNullableString(user.userVerifyMode),
      local_ui_right: this.toNullableBoolean(user.localUIRight),
      close_delay_enabled: this.toNullableBoolean(user.closeDelayEnabled),
      max_open_door_time: toNullableNumber(user.maxOpenDoorTime),
      open_door_time: toNullableNumber(user.openDoorTime),
      device_id: deviceId,
      matched_employee_id: matchedEmployeeId,
      raw: user,
    };
  }

  private extractRightPlanRows(
    user: Record<string, unknown>,
  ): HikvisionUserRightPlanInput[] {
    const rawRightPlan = user.RightPlan ?? user.rightPlan ?? [];
    const items = Array.isArray(rawRightPlan) ? rawRightPlan : [rawRightPlan];

    return items
      .map((item) => toObject(item))
      .map((item) => {
        const doorNo = toNullableNumber(item.doorNo ?? item.doorID);
        const planTemplateNo = toNullableString(
          item.planTemplateNo ?? item.templateNo,
        );
        if (!doorNo || !planTemplateNo) {
          return null;
        }

        return {
          door_no: doorNo,
          plan_template_no: planTemplateNo,
        };
      })
      .filter((item): item is HikvisionUserRightPlanInput => Boolean(item));
  }

  private buildRightPlanPayload(
    assignment: EmployeeDeviceAssignment,
    rightPlans: EmployeeDeviceRightPlan[],
  ): Array<{ doorNo: number; planTemplateNo: string }> {
    if (rightPlans.length > 0) {
      return rightPlans.map((item) => ({
        doorNo: item.doorNo,
        planTemplateNo: item.hikvisionTemplateNo,
      }));
    }

    const metadataRoot = toObject(assignment.metadata?.hikvision);
    const rawPlans = metadataRoot.right_plan ?? metadataRoot.rightPlan ?? [];
    if (!Array.isArray(rawPlans)) {
      return [];
    }

    return rawPlans
      .map((item) => toObject(item))
      .map((item) => {
        const doorNo = toNullableNumber(item.door_no ?? item.doorNo);
        const planTemplateNo = toNullableString(
          item.plan_template_no ?? item.planTemplateNo,
        );
        if (!doorNo || !planTemplateNo) {
          return null;
        }

        return { doorNo, planTemplateNo };
      })
      .filter((item): item is { doorNo: number; planTemplateNo: string } =>
        Boolean(item),
      );
  }

  private buildCredentialBundle(credentials: EmployeeAccessCredential[]) {
    const activeCredentials = credentials.filter(
      (credential) =>
        credential.credentialStatus ===
        EmployeeAccessCredentialStatusEnum.ACTIVE,
    );
    const passwordCredential = activeCredentials.find(
      (credential) =>
        (credential.credentialType ===
          EmployeeAccessCredentialTypeEnum.PASSWORD ||
          credential.credentialType === EmployeeAccessCredentialTypeEnum.PIN) &&
        Boolean(credential.pinPassword?.trim()),
    );
    const cardCredential = activeCredentials.find(
      (credential) =>
        credential.credentialType === EmployeeAccessCredentialTypeEnum.CARD &&
        Boolean(credential.cardNo?.trim()),
    );
    const fingerprintCredential = activeCredentials.find(
      (credential) =>
        credential.credentialType ===
          EmployeeAccessCredentialTypeEnum.FINGERPRINT ||
        credential.hasFingerprint,
    );

    const hasPassword = Boolean(passwordCredential?.pinPassword?.trim());
    const hasCard = Boolean(cardCredential?.cardNo?.trim());
    const hasFingerprint = Boolean(
      fingerprintCredential?.hasFingerprint || fingerprintCredential,
    );
    const explicitUserVerifyMode =
      this.extractCredentialUserVerifyMode(passwordCredential) ??
      this.extractCredentialUserVerifyMode(cardCredential) ??
      this.extractCredentialUserVerifyMode(fingerprintCredential);

    return {
      password: passwordCredential?.pinPassword?.trim() || null,
      hasPassword,
      hasCard,
      hasFingerprint,
      explicitUserVerifyMode,
      userVerifyMode: this.resolveUserVerifyMode(
        hasPassword,
        hasFingerprint,
        hasCard,
      ),
    };
  }

  private async syncCardInternal(
    companyId: number,
    deviceId: number,
    employeeId: number,
    input: HikvisionDeviceCardInput,
    operation: 'CREATE' | 'MODIFY' | 'UPSERT',
  ) {
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const assignment = await this.findAssignmentOrFail(
      companyId,
      device.id,
      employeeId,
    );
    const normalizedCardNo = this.normalizeCardNo(input.card_no);
    const cardType = this.normalizeCardType(input.card_type);
    const resolvedUserVerifyMode = await this.resolveCardUserVerifyMode(
      companyId,
      employeeId,
      device.id,
      input.user_verify_mode,
    );
    const payload = this.buildCardPayload(
      assignment.employeeNo,
      normalizedCardNo,
      cardType,
      input,
    );
    const setUserModePayload = this.buildManualUserUpdatePayload({
      employee_no: assignment.employeeNo,
      user_verify_mode: resolvedUserVerifyMode,
    });

    const execute = async (
      mode: 'CREATE' | 'MODIFY',
    ): Promise<HikvisionHttpResult> => {
      const response = await this.requestWithRetry(
        `${mode.toLowerCase()}-card:${device.id}:${assignment.employeeNo}:${normalizedCardNo}`,
        () =>
          mode === 'CREATE'
            ? this.hikvisionAccessControlService.setupCardInfo(
                companyId,
                device.id,
                payload,
              )
            : this.hikvisionAccessControlService.modifyCardInfo(
                companyId,
                device.id,
                payload,
              ),
      );
      this.ensureHikvisionSuccess(
        mode === 'CREATE' ? 'CreateCard' : 'ModifyCard',
        response,
      );
      return response;
    };

    try {
      await this.requestWithRetry(
        `set-card-user-mode:${device.id}:${assignment.employeeNo}`,
        () =>
          this.hikvisionAccessControlService.modifyUserInfo(
            companyId,
            device.id,
            setUserModePayload,
          ),
      ).then((response) =>
        this.ensureHikvisionSuccess('SetCardUserVerifyMode', response),
      );

      let response: HikvisionHttpResult;
      let actualOperation: 'CREATE' | 'MODIFY' =
        operation === 'MODIFY' ? 'MODIFY' : 'CREATE';

      if (operation === 'UPSERT') {
        try {
          response = await execute('CREATE');
          actualOperation = 'CREATE';
        } catch {
          response = await execute('MODIFY');
          actualOperation = 'MODIFY';
        }
      } else {
        response = await execute(actualOperation);
      }

      this.logger.log(
        `${actualOperation === 'CREATE' ? 'Created' : 'Modified'} Hikvision card ${this.maskCardNo(normalizedCardNo)} for assignment employee ${employeeId} on device ${device.id}`,
      );

      return {
        message:
          actualOperation === 'CREATE'
            ? 'Card created on Hikvision device successfully'
            : 'Card modified on Hikvision device successfully',
        device_id: device.id,
        employee_id: employeeId,
        employee_no: assignment.employeeNo,
        card_no: normalizedCardNo,
        card_type: cardType,
        user_verify_mode: resolvedUserVerifyMode,
        device_response: toObject(response.parsed),
      };
    } catch (error) {
      this.logger.error(
        `Failed to ${operation.toLowerCase()} Hikvision card ${this.maskCardNo(normalizedCardNo)} for assignment employee ${employeeId} on device ${device.id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async syncUserPassword(
    companyId: number,
    deviceId: number,
    employeeId: number,
    password: string,
    userVerifyMode: string | undefined,
    operation: 'CREATE' | 'MODIFY',
  ) {
    const normalizedPassword = String(password ?? '').trim();
    if (!normalizedPassword) {
      throw new BadRequestException('password is required');
    }

    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );
    const assignment = await this.findAssignmentOrFail(
      companyId,
      device.id,
      employeeId,
    );
    const resolvedUserVerifyMode = await this.resolvePasswordUserVerifyMode(
      companyId,
      employeeId,
      device.id,
      true,
      userVerifyMode,
    );
    const payload = this.buildManualUserUpdatePayload({
      employee_no: assignment.employeeNo,
      password: normalizedPassword,
      user_verify_mode: resolvedUserVerifyMode,
    });

    try {
      const response = await this.requestWithRetry(
        `${operation.toLowerCase()}-user-password:${device.id}:${assignment.employeeNo}`,
        () =>
          this.hikvisionAccessControlService.modifyUserInfo(
            companyId,
            device.id,
            payload,
          ),
      );
      this.ensureHikvisionSuccess(
        operation === 'CREATE' ? 'CreateUserPassword' : 'ModifyUserPassword',
        response,
      );
      this.logger.log(
        `${operation === 'CREATE' ? 'Created' : 'Modified'} Hikvision password for assignment employee ${employeeId} on device ${device.id}`,
      );

      return {
        message:
          operation === 'CREATE'
            ? 'User password created on Hikvision device successfully'
            : 'User password modified on Hikvision device successfully',
        device_id: device.id,
        employee_id: employeeId,
        employee_no: assignment.employeeNo,
        password_enabled: true,
        user_verify_mode: resolvedUserVerifyMode,
        device_response: toObject(response.parsed),
      };
    } catch (error) {
      this.logger.error(
        `Failed to ${operation.toLowerCase()} Hikvision password for assignment employee ${employeeId} on device ${device.id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private resolveUserVerifyMode(
    hasPassword: boolean,
    hasFingerprint: boolean,
    hasCard: boolean,
  ): string {
    return (
      this.buildUserVerifyModeCandidates(
        hasPassword,
        hasFingerprint,
        hasCard,
      )[0] ?? 'cardOrFpOrPw'
    );
  }

  private async resolvePasswordUserVerifyMode(
    companyId: number,
    employeeId: number,
    deviceId: number,
    hasPassword: boolean,
    explicitUserVerifyMode?: string,
  ): Promise<string> {
    const credentials = await this.employeeAccessCredentialRepository.find({
      where: [
        { companyId, employeeId, deviceId },
        { companyId, employeeId, deviceId: IsNull() },
      ],
    });
    const activeCredentials = credentials.filter(
      (credential) =>
        credential.credentialStatus ===
        EmployeeAccessCredentialStatusEnum.ACTIVE,
    );
    const hasCard = activeCredentials.some(
      (credential) =>
        credential.credentialType === EmployeeAccessCredentialTypeEnum.CARD &&
        Boolean(credential.cardNo?.trim()),
    );
    const hasFingerprint = activeCredentials.some(
      (credential) =>
        credential.credentialType ===
          EmployeeAccessCredentialTypeEnum.FINGERPRINT ||
        credential.hasFingerprint,
    );
    const candidateModes = hasPassword
      ? this.buildUserVerifyModeCandidates(true, hasFingerprint, hasCard)
      : this.buildUserVerifyModeCandidates(false, hasFingerprint, hasCard);

    return this.resolveSupportedUserVerifyMode(
      companyId,
      deviceId,
      explicitUserVerifyMode,
      candidateModes,
      hasPassword ? 'password synchronization' : 'password removal',
    );
  }

  private async resolveCardUserVerifyMode(
    companyId: number,
    employeeId: number,
    deviceId: number,
    explicitUserVerifyMode?: string | null,
  ): Promise<string> {
    const credentials = await this.employeeAccessCredentialRepository.find({
      where: [
        { companyId, employeeId, deviceId },
        { companyId, employeeId, deviceId: IsNull() },
      ],
    });
    const activeCredentials = credentials.filter(
      (credential) =>
        credential.credentialStatus ===
        EmployeeAccessCredentialStatusEnum.ACTIVE,
    );
    const hasPassword = activeCredentials.some(
      (credential) =>
        (credential.credentialType ===
          EmployeeAccessCredentialTypeEnum.PASSWORD ||
          credential.credentialType === EmployeeAccessCredentialTypeEnum.PIN) &&
        Boolean(credential.pinPassword?.trim()),
    );
    const hasFingerprint = activeCredentials.some(
      (credential) =>
        credential.credentialType ===
          EmployeeAccessCredentialTypeEnum.FINGERPRINT ||
        credential.hasFingerprint,
    );

    return this.resolveSupportedUserVerifyMode(
      companyId,
      deviceId,
      explicitUserVerifyMode,
      this.buildUserVerifyModeCandidates(hasPassword, hasFingerprint, true),
      'card synchronization',
    );
  }

  private buildCardPayload(
    employeeNo: string,
    cardNo: string,
    cardType: string,
    input: HikvisionDeviceCardInput,
  ) {
    return {
      CardInfo: {
        employeeNo,
        cardNo,
        cardType,
        checkEmployeeNo: input.check_employee_no ?? true,
      },
    };
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

    return toNullableString(
      toObject(toObject(credential.metadata).hikvision).user_verify_mode,
    );
  }

  private async resolveBackendSyncTargets(
    companyId: number,
    options: HikvisionBackendToDeviceSyncOptions,
  ): Promise<Array<{ deviceId: number; employeeId: number }>> {
    const resolvedTargets = new Map<
      string,
      { deviceId: number; employeeId: number }
    >();
    const resolvedDevices = await this.resolveTargetDevices(companyId, {
      deviceId: options.device_id,
      deviceIds: options.device_ids,
      branchId: options.branch_id,
      includeInactive: options.include_inactive_devices,
    });
    const resolvedDeviceIds = resolvedDevices.map((item) => item.id);

    if (options.employee_id || options.employee_ids?.length) {
      const employeeIds = [
        ...(options.employee_id ? [options.employee_id] : []),
        ...(options.employee_ids ?? []),
      ];
      const uniqueEmployeeIds = [...new Set(employeeIds)];

      if (resolvedDeviceIds.length > 0) {
        for (const deviceId of resolvedDeviceIds) {
          for (const employeeId of uniqueEmployeeIds) {
            resolvedTargets.set(`${deviceId}:${employeeId}`, {
              deviceId,
              employeeId,
            });
          }
        }
      } else {
        const assignments = await this.employeeDeviceAssignmentRepository.find({
          where: {
            employeeId: In(uniqueEmployeeIds),
          },
          select: ['deviceId', 'employeeId'],
        });

        for (const assignment of assignments) {
          if (!assignment.deviceId || !assignment.employeeId) continue;
          resolvedTargets.set(
            `${assignment.deviceId}:${assignment.employeeId}`,
            {
              deviceId: assignment.deviceId,
              employeeId: assignment.employeeId,
            },
          );
        }
      }
    }

    if (resolvedTargets.size === 0) {
      const assignments = await this.employeeDeviceAssignmentRepository.find({
        where: resolvedDeviceIds.length
          ? { deviceId: In(resolvedDeviceIds) }
          : undefined,
        select: ['deviceId', 'employeeId'],
      });

      for (const assignment of assignments) {
        if (!assignment.deviceId || !assignment.employeeId) continue;
        resolvedTargets.set(`${assignment.deviceId}:${assignment.employeeId}`, {
          deviceId: assignment.deviceId,
          employeeId: assignment.employeeId,
        });
      }
    }

    return [...resolvedTargets.values()];
  }

  private async resolveTargetDevices(
    companyId: number,
    input: {
      deviceId?: number;
      deviceIds?: number[];
      branchId?: number;
      includeInactive?: boolean;
    },
  ): Promise<AttendanceDevice[]> {
    const requestedIds = [
      ...new Set([
        ...(input.deviceId ? [input.deviceId] : []),
        ...(input.deviceIds ?? []),
      ]),
    ];

    const qb = this.attendanceDeviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere(
        "(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, '')) LIKE :vendor)",
        {
          integrationType: 'hikvision',
          vendor: '%hikvision%',
        },
      );

    if (requestedIds.length > 0) {
      qb.andWhere('device.id IN (:...deviceIds)', { deviceIds: requestedIds });
    }

    if (typeof input.branchId === 'number') {
      qb.andWhere('device.branch_id = :branchId', { branchId: input.branchId });
    }

    if (!input.includeInactive) {
      qb.andWhere('device.status = :status', {
        status: AttendanceDeviceStatusEnum.ACTIVE,
      });
    }

    return qb.getMany();
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
  ): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        CompanyUser,
        'companyUser',
        'companyUser.id = employee.company_user_id',
      )
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private async findEmployeeByDeviceEmployeeNo(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ): Promise<Employee | null> {
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);
    const identity = await this.employeeDeviceIdentityRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeNo: normalizedEmployeeNo,
        isActive: true,
      },
      relations: {
        employee: true,
      },
    });

    if (identity?.employee) {
      return identity.employee;
    }

    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeNo: normalizedEmployeeNo,
      },
      relations: {
        employee: true,
      },
    });

    return assignment?.employee ?? null;
  }

  private async findAssignmentOrFail(
    companyId: number,
    deviceId: number,
    employeeId: number,
  ): Promise<EmployeeDeviceAssignment> {
    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeId,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Employee device assignment not found');
    }

    if (!toNullableString(assignment.employeeNo)) {
      throw new BadRequestException(
        `Employee device assignment ${assignment.id} is missing a Hikvision employee number`,
      );
    }

    return assignment;
  }

  private resolveDeviceEmployeeNo(
    assignment: EmployeeDeviceAssignment,
  ): string {
    const fromAssignment = assignment.employeeNo?.trim();
    if (fromAssignment) {
      return fromAssignment;
    }

    throw new BadRequestException(
      `Employee-device assignment ${assignment.id} is missing a Hikvision employee number`,
    );
  }

  private buildEmployeeDisplayName(employee: Employee): string {
    const preferredName = toNullableString(employee.preferred_name);
    if (preferredName) {
      return preferredName;
    }

    const displayName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ]
      .map((value) => toNullableString(value))
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    return displayName || this.normalizeEmployeeNo(employee.employee_no);
  }

  private async requestWithRetry(
    operation: string,
    runner: () => Promise<HikvisionHttpResult>,
    retries = 2,
  ): Promise<HikvisionHttpResult> {
    let attempt = 0;
    let lastError: unknown;
    let lastResponse: HikvisionHttpResult | null = null;

    while (attempt <= retries) {
      try {
        const response = await runner();
        lastResponse = response;

        if (!this.shouldRetryResponse(response.status) || attempt >= retries) {
          return response;
        }

        this.logger.warn(
          `Retrying Hikvision operation ${operation} after HTTP ${response.status} (attempt ${attempt + 1}/${retries + 1})`,
        );
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryError(error) || attempt >= retries) {
          throw normalizeHikvisionError(error);
        }

        this.logger.warn(
          `Retrying Hikvision operation ${operation} after error: ${(error as Error).message}`,
        );
      }

      await sleep((attempt + 1) * 250);
      attempt += 1;
    }

    if (lastResponse) {
      return lastResponse;
    }

    throw normalizeHikvisionError(lastError);
  }

  private shouldRetryResponse(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  private shouldRetryError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const lowered = error.message.toLowerCase();
    return (
      lowered.includes('timeout') ||
      lowered.includes('offline') ||
      lowered.includes('unreachable') ||
      lowered.includes('connection reset') ||
      lowered.includes('service unavailable')
    );
  }

  private ensureHikvisionSuccess(
    operation: string,
    response: HikvisionHttpResult,
  ) {
    if (!response.ok) {
      const detail =
        this.extractHikvisionFailureReason(response.parsed) ??
        this.formatHikvisionErrorDetail(response.parsed || response.raw);
      throw new BadRequestException(
        `${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const failureReason = this.extractHikvisionFailureReason(response.parsed);
    if (failureReason) {
      throw new BadRequestException(`${operation} failed: ${failureReason}`);
    }
  }

  private extractHikvisionFailureReason(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const root = payload as Record<string, unknown>;
    const statusString = this.findFirstStringDeep(root, [
      'statusString',
      'statusStrg',
      'status',
    ]);
    const statusCode = this.findFirstStringDeep(root, ['statusCode']);
    const subStatusCode = this.findFirstStringDeep(root, ['subStatusCode']);
    const errorCode = this.findFirstStringDeep(root, ['errorCode']);
    const errorMessage = this.findFirstStringDeep(root, [
      'errorMsg',
      'errorMessage',
      'message',
    ]);

    const hasEnvelope =
      Boolean(statusString) ||
      Boolean(statusCode) ||
      Boolean(subStatusCode) ||
      Boolean(errorCode);
    if (!hasEnvelope) {
      return null;
    }

    const successSubStatus = new Set(['ok', 'success', 'none']);
    const successStatusString = new Set([
      'ok',
      'success',
      'successful',
      'enabled',
      'completed',
    ]);
    const successStatusCode = new Set(['1', '200']);
    const normalizedSubStatus = subStatusCode.toLowerCase();
    const normalizedStatusString = statusString.toLowerCase();
    const normalizedErrorCode = errorCode.toLowerCase();
    const normalizedStatusCode = statusCode.toLowerCase();

    if (normalizedSubStatus && !successSubStatus.has(normalizedSubStatus)) {
      return `${subStatusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (
      normalizedStatusString &&
      !successStatusString.has(normalizedStatusString)
    ) {
      return `${statusString}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (
      normalizedErrorCode &&
      normalizedErrorCode !== '0' &&
      normalizedErrorCode !== '1'
    ) {
      return `${errorCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (normalizedStatusCode && !successStatusCode.has(normalizedStatusCode)) {
      return `${statusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    return null;
  }

  private safeString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private findFirstStringDeep(
    source: Record<string, unknown>,
    candidateKeys: string[],
  ): string {
    const keySet = new Set(candidateKeys.map((item) => item.toLowerCase()));
    const queue: unknown[] = [source];

    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...(node as unknown[]));
        continue;
      }

      if (!node || typeof node !== 'object') {
        continue;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (!keySet.has(key.toLowerCase())) {
          continue;
        }

        const normalized = this.safeString(value).trim();
        if (normalized) {
          return normalized;
        }
      }

      queue.push(...Object.values(record));
    }

    return '';
  }

  private formatHikvisionErrorDetail(payload: unknown): string | null {
    if (!payload) {
      return null;
    }

    const text =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    return normalized.length > 500
      ? `${normalized.slice(0, 500)}...`
      : normalized;
  }

  private async persistSyncLogSafe(input: {
    companyId: number;
    deviceId: number;
    direction: HikvisionSyncLogDirectionEnum;
    status: HikvisionSyncLogStatusEnum;
    startedAt: Date;
    completedAt: Date;
    counters: SyncCounters;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.hikvisionSyncLogRepository.save(
        this.hikvisionSyncLogRepository.create({
          companyId: input.companyId,
          deviceId: input.deviceId,
          syncType: HikvisionSyncLogTypeEnum.USERS,
          direction: input.direction,
          status: input.status,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          recordsReceived: input.counters.received,
          recordsProcessed: input.counters.processed,
          recordsCreated: input.counters.created,
          recordsUpdated: input.counters.updated,
          recordsFailed: input.counters.failed,
          errorMessage: input.errorMessage,
          metadata: input.metadata,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Skipping hikvision users sync log insert: ${(error as Error).message}`,
      );
    }
  }

  private normalizeEmployeeNo(value: unknown): string {
    const normalized = this.safeString(value).trim();
    if (!normalized) {
      throw new BadRequestException('employee_no is required');
    }
    return normalized;
  }

  private normalizeCardNo(value: unknown): string {
    const normalized = this.safeString(value).trim();
    if (!normalized) {
      throw new BadRequestException('card_no is required');
    }
    return normalized;
  }

  private normalizeCardType(value: unknown): string {
    const normalized = this.safeString(value).trim() || 'normalCard';
    return normalized || 'normalCard';
  }

  private normalizeTemplateNo(value: unknown): string {
    const normalized = this.safeString(value).trim();
    if (!normalized) {
      throw new BadRequestException('plan_template_no is required');
    }
    return normalized;
  }

  private extractSupportedUserVerifyModesFromDeviceMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): string[] {
    const hikvisionMetadata = toObject(toObject(metadata).hikvision);
    const rawModes = hikvisionMetadata.supported_user_verify_modes;
    if (!Array.isArray(rawModes)) {
      return [];
    }

    return [
      ...new Set(
        rawModes.map((item) => String(item ?? '').trim()).filter(Boolean),
      ),
    ];
  }

  private extractSupportedUserVerifyModesFromCapabilities(
    capabilities: Record<string, unknown>,
  ): string[] {
    const modes: string[] = [];

    const visit = (node: unknown): void => {
      if (!node) return;

      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item);
        }
        return;
      }

      if (typeof node !== 'object') {
        return;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (key.toLowerCase() === 'userverifymode') {
          const root =
            value && typeof value === 'object' && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const raw = [root['@opt'], root.opt, root.options, root.option]
            .map((item) => this.safeString(item).trim())
            .find((item) => item.length > 0);

          if (raw) {
            modes.push(...raw.split(',').map((item) => item.trim()));
          }
        }

        visit(value);
      }
    };

    visit(capabilities);

    return [...new Set(modes.filter(Boolean))];
  }

  private ensurePositiveInteger(value: unknown, fieldName: string): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return num;
  }

  private ensureNonNegativeInteger(value: unknown, fieldName: string): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }
    return num;
  }

  private toNullableBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value;

    const normalized = this.safeString(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return null;
  }

  private maskCardNo(value: string): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length <= 4) {
      return normalized ? '*'.repeat(normalized.length) : '';
    }

    return `${'*'.repeat(Math.max(normalized.length - 4, 0))}${normalized.slice(-4)}`;
  }

  private startOfToday(): Date {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private endOfDate(value: Date): Date {
    const date = new Date(value);
    date.setHours(23, 59, 59, 0);
    return date;
  }

  private addYears(value: Date, years: number): Date {
    const date = new Date(value);
    date.setFullYear(date.getFullYear() + years);
    return date;
  }

  private formatHikvisionDateTime(value: Date): string {
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
      value.getHours(),
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
}
