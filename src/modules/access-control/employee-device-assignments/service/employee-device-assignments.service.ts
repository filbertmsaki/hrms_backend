import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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
import { EmployeeAccessCredential } from '../../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../../employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../employee-access-credentials/enum/employee-access-credential-type.enum';
import { AssignEmployeeDevicesDto } from '../dto/assign-employee-devices.dto';
import { EmployeeDeviceUserRightPlanDto } from '../dto/employee-device-user-right-plan.dto';
import { HikvisionUserSearchQueryDto } from '../dto/hikvision-user-search-query.dto';
import { UpdateEmployeeDeviceUserDto } from '../dto/update-employee-device-user.dto';
import { EmployeeDeviceAssignment } from '../entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../../employee-device-right-plans/entity/employee-device-right-plan.entity';

type CredentialBundle = {
  password: string | null;
  userVerifyMode: string;
};

type AssignmentSettings = {
  validEnabled: boolean;
  validBeginTime: Date | null;
  validEndTime: Date | null;
  doorRight: string;
  rightPlan: EmployeeDeviceUserRightPlanDto[];
  localUiRight: boolean;
  closeDelayEnabled: boolean;
  maxOpenDoorTime: number;
  openDoorTime: number;
  metadata: Record<string, unknown> | null;
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
    private readonly hikvisionUserManagementService: HikvisionUserManagementService,
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
        const settings = this.resolveSettingsFromInput(dto);
        const deviceEmployeeNo = await this.resolveAvailableDeviceEmployeeNo(companyId, device.id);
        const payload = await this.buildDeviceUserPayload(
          companyId,
          employee,
          device.id,
          deviceEmployeeNo,
          settings,
        );

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

    const currentRightPlan = await this.loadRightPlanRows(assignment.id);
    const settings = this.resolveSettingsForUpdate(assignment, currentRightPlan, dto);
    const payload = await this.buildDeviceUserPayload(
      companyId,
      employee,
      deviceId,
      assignment.employeeNo,
      settings,
    );

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
    await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const assignment = await this.findAssignmentByEmployeeOrFail(companyId, employee.id, deviceId);
    const settings = this.resolveSettingsFromAssignment(assignment, await this.loadRightPlanRows(assignment.id));
    const payload = await this.buildDeviceUserPayload(
      companyId,
      employee,
      deviceId,
      assignment.employeeNo,
      settings,
    );
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
        resync_operation: deviceState.exists ? 'UPDATE' : 'CREATE',
      },
    });
    const saved = await this.assignmentRepository.save(assignment);

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

  private resolveSettingsFromInput(input: UpdateEmployeeDeviceUserDto): AssignmentSettings {
    return {
      validEnabled: input.valid_enabled ?? true,
      validBeginTime: this.toNullableDate(input.valid_begin_time),
      validEndTime: this.toNullableDate(input.valid_end_time),
      doorRight: input.door_right?.trim() || '',
      rightPlan: input.right_plan ?? [],
      localUiRight: input.local_ui_right ?? false,
      closeDelayEnabled: input.close_delay_enabled ?? false,
      maxOpenDoorTime: input.max_open_door_time ?? 0,
      openDoorTime: input.open_door_time ?? 0,
      metadata: input.metadata ?? null,
    };
  }

  private resolveSettingsForUpdate(
    assignment: EmployeeDeviceAssignment,
    currentRightPlan: EmployeeDeviceUserRightPlanDto[],
    input: UpdateEmployeeDeviceUserDto,
  ): AssignmentSettings {
    return {
      validEnabled: input.valid_enabled ?? assignment.validEnabled ?? true,
      validBeginTime:
        input.valid_begin_time !== undefined
          ? this.toNullableDate(input.valid_begin_time)
          : assignment.validBeginTime,
      validEndTime:
        input.valid_end_time !== undefined
          ? this.toNullableDate(input.valid_end_time)
          : assignment.validEndTime,
      doorRight:
        input.door_right !== undefined
          ? input.door_right?.trim() || ''
          : assignment.doorRight?.trim() || '',
      rightPlan: input.right_plan ?? currentRightPlan,
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
            last_device_registration_at: now.toISOString(),
          },
        }),
      }),
    );

    try {
      await this.replaceRightPlans(deviceId, assignment, settings.rightPlan);
      await this.upsertDeviceIdentity(companyId, employee.id, assignment.employeeNo, deviceId);
      return assignment;
    } catch (error) {
      await this.assignmentRepository.delete({ id: assignment.id });
      await this.rollbackDeviceUserRegistration(companyId, deviceId, assignment.employeeNo);
      throw error;
    }
  }

  private resolveSettingsFromAssignment(
    assignment: EmployeeDeviceAssignment,
    rightPlan: EmployeeDeviceUserRightPlanDto[],
  ): AssignmentSettings {
    return {
      validEnabled: assignment.validEnabled ?? true,
      validBeginTime: assignment.validBeginTime,
      validEndTime: assignment.validEndTime,
      doorRight: assignment.doorRight?.trim() || '',
      rightPlan,
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
      right_plan: settings.rightPlan,
      ...(credentials.password ? { password: credentials.password } : {}),
      user_verify_mode: credentials.userVerifyMode,
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

    return {
      password: passwordCredential?.pinPassword?.trim() || null,
      userVerifyMode: this.resolveUserVerifyMode(hasPassword, hasFingerprint, hasCard),
    };
  }

  private resolveUserVerifyMode(
    hasPassword: boolean,
    hasFingerprint: boolean,
    hasCard: boolean,
  ): string {
    if (hasFingerprint && hasCard && hasPassword) return 'fpAndCardAndPw';
    if (hasFingerprint && hasPassword) return 'fpAndPw';
    if (hasCard && hasPassword) return 'cardAndPw';
    if (hasFingerprint && hasCard) return 'fpAndCard';
    if (hasFingerprint) return 'fp';
    if (hasCard) return 'card';
    if (hasPassword) return 'pw';
    return 'cardOrFpOrPw';
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

  private async replaceRightPlans(
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
    rightPlans: EmployeeDeviceUserRightPlanDto[],
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
          doorId: null,
          doorNo: plan.door_no,
          scheduleTemplateId: null,
          hikvisionTemplateNo: plan.plan_template_no.trim(),
          metadata: {
            source: 'EMPLOYEE_DEVICE_ASSIGNMENT',
          },
        }),
      );
    }
  }

  private async loadRightPlanRows(assignmentId: number): Promise<EmployeeDeviceUserRightPlanDto[]> {
    const rows = await this.rightPlanRepository.find({
      where: { employeeDeviceAssignmentId: assignmentId },
      order: { doorNo: 'ASC', id: 'ASC' },
    });

    return rows.map((row) => ({
      door_no: row.doorNo,
      plan_template_no: row.hikvisionTemplateNo,
    }));
  }

  private applySettingsToAssignment(
    assignment: EmployeeDeviceAssignment,
    settings: AssignmentSettings,
  ) {
    assignment.validEnabled = settings.validEnabled;
    assignment.validBeginTime = settings.validBeginTime;
    assignment.validEndTime = settings.validEndTime;
    assignment.doorRight = settings.doorRight;
    assignment.localUiRight = settings.localUiRight;
    assignment.closeDelayEnabled = settings.closeDelayEnabled;
    assignment.maxOpenDoorTime = settings.maxOpenDoorTime;
    assignment.openDoorTime = settings.openDoorTime;
    assignment.metadata = settings.metadata;
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
    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      hikvision_employee_no: item.employeeNo,
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
      metadata: item.metadata,
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

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
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
