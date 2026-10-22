import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { AttendanceMobilePunchRepository } from './repositories/attendance-mobile-punch.repository';
import { CreateAttendanceMobilePunchDto } from './dtos/create-attendance-mobile-punch.dto';
import { AttendanceMobilePunchQueryDto } from './dtos/attendance-mobile-punch-query.dto';
import { ApproveMobilePunchOverrideDto } from './dtos/approve-mobile-punch-override.dto';
import { AttendancePunchTypeEnum } from './enums/attendance-punch-type.enum';
import { AttendancePunchSourceEnum } from './enums/attendance-punch-source.enum';
import { AttendancePunchValidationStatusEnum } from './enums/attendance-punch-validation-status.enum';
import { AttendanceGeofenceRepository } from '../geofences/repositories/attendance-geofence.repository';
import { AttendanceWifiNetworkRepository } from '../wifi-networks/repositories/attendance-wifi-network.repository';
import { AttendanceGeofenceStatusEnum } from '../geofences/enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../geofences/enums/attendance-geofence-type.enum';
import { GeofenceDistanceService } from '../geofences/geofence-distance.service';
import { WifiNetworkValidatorService } from '../wifi-networks/validators/wifi-network-validator.service';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceCheckpoint } from '../checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceCheckpointStatusEnum } from '../checkpoints/enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../checkpoints/enums/attendance-checkpoint-type.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { addDaysToDateOnly, formatDateOnly } from '../../shared/hr.utils';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceProcessedEvent } from '../processing/entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from '../processing/entities/attendance-daily-summary.entity';
import { AttendanceMobilePunch } from './entities/attendance-mobile-punch.entity';
import { AttendanceMobileDeviceRegistration } from './entities/attendance-mobile-device-registration.entity';
import { AttendanceMobileDeviceRegistrationAudit } from './entities/attendance-mobile-device-registration-audit.entity';
import { ReleaseAttendanceMobileDeviceDto } from './dtos/release-attendance-mobile-device.dto';
import { AttendanceEventIngestionService } from '../processing/attendance-event-ingestion.service';
import { AttendanceScheduleResolverService } from '../processing/attendance-schedule-resolver.service';
import { ResolvedAttendanceSchedule } from '../processing/entities/resolved-attendance-schedule.type';
import { AttendanceProcessedEventDirectionEnum } from '../processing/enums/attendance-processed-event-direction.enum';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceCompanyConfigService } from '../shared/attendance-company-config.service';
import { createAttendanceHash } from '../shared/attendance-hash.util';
import { FilesService } from '../../../files/files.service';
import type { StoredFile } from '../../../files/interfaces/stored-file.interface';
import { AttendanceCheckpointQrService } from '../checkpoints/attendance-checkpoint-qr.service';
import { AttendanceWorkFromHomeService } from '../work-from-home/attendance-work-from-home.service';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AttendanceRetentionGovernanceService } from '../processing/attendance-retention-governance.service';
import { AttendanceLocationAccessLog } from './entities/attendance-location-access-log.entity';
import { LocationPrivacyService } from '../../location-privacy/location-privacy.service';

@Injectable()
export class AttendanceMobilePunchesService {
  private readonly logger = new Logger(AttendanceMobilePunchesService.name);
  // Keep mobile duplicate detection aligned with daily summary grouping.
  private readonly preShiftWindowHours = 12;
  private readonly postShiftWindowHours = 12;

  constructor(
    private readonly punchRepo: AttendanceMobilePunchRepository,
    private readonly geofenceRepo: AttendanceGeofenceRepository,
    private readonly wifiRepo: AttendanceWifiNetworkRepository,
    private readonly geofenceDistanceService: GeofenceDistanceService,
    private readonly wifiValidator: WifiNetworkValidatorService,
    private readonly scheduleResolver: AttendanceScheduleResolverService,
    private readonly attendanceCompanyConfigService: AttendanceCompanyConfigService,
    private readonly eventIngestionService: AttendanceEventIngestionService,
    private readonly configService: ConfigService,
    @InjectRepository(AttendanceCheckpoint)
    private readonly checkpointRepository: Repository<AttendanceCheckpoint>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceProcessedEvent)
    private readonly processedEventRepository: Repository<AttendanceProcessedEvent>,
    @InjectRepository(AttendanceDailySummary)
    private readonly dailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(HikvisionAttendanceLog)
    private readonly rawLogRepository: Repository<HikvisionAttendanceLog>,
    private readonly workFromHomeService: AttendanceWorkFromHomeService,
    @Optional()
    private readonly filesService?: FilesService,
    @Optional()
    private readonly checkpointQrService?: AttendanceCheckpointQrService,
    @Optional()
    private readonly advisoryLockService?: PostgresAdvisoryLockService,
    @Optional()
    @InjectRepository(AttendanceMobileDeviceRegistration)
    private readonly deviceRegistrationRepository?: Repository<AttendanceMobileDeviceRegistration>,
    @Optional()
    private readonly retentionGovernance?: AttendanceRetentionGovernanceService,
    @Optional()
    @InjectRepository(AttendanceLocationAccessLog)
    private readonly locationAccessRepository?: Repository<AttendanceLocationAccessLog>,
    @Optional()
    private readonly locationPrivacyService?: LocationPrivacyService,
  ) {}

  async checkIn(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    dto: CreateAttendanceMobilePunchDto;
    channel?: 'WEB' | 'MOBILE';
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    return this.createPunch({
      ...params,
      punchType: AttendancePunchTypeEnum.CHECK_IN,
      channel: params.channel ?? 'MOBILE',
    });
  }

  async checkOut(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    dto: CreateAttendanceMobilePunchDto;
    channel?: 'WEB' | 'MOBILE';
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    return this.createPunch({
      ...params,
      punchType: AttendancePunchTypeEnum.CHECK_OUT,
      channel: params.channel ?? 'MOBILE',
    });
  }

  async getMyPunchPolicy(companyId: number) {
    const policy = await this.resolvePolicy(companyId, null);
    return {
      require_selfie_for_check_in: policy?.require_selfie_for_check_in ?? false,
      require_selfie_for_check_out:
        policy?.require_selfie_for_check_out ?? false,
      allow_location_exception_override:
        policy?.allow_location_exception_override ?? false,
      prevent_mobile_device_sharing:
        policy?.prevent_mobile_device_sharing ?? false,
      allow_offline_punches: policy?.allow_offline_punches ?? false,
      offline_max_age_hours: policy?.offline_max_age_hours ?? 24,
      require_geo_fencing: policy?.require_geo_fencing ?? false,
    };
  }

  async createPunch(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    punchType: AttendancePunchTypeEnum;
    channel?: 'WEB' | 'MOBILE';
    dto: CreateAttendanceMobilePunchDto;
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    const employee = await this.resolveEmployeeContext({
      companyId: params.companyId,
      requestedEmployeeId: params.employeeId ?? null,
      authenticatedEmployeeId: params.authenticatedEmployeeId ?? null,
    });
    const existingRequest = await this.punchRepo.findByClientRequest(
      params.companyId,
      employee.id,
      params.dto.clientRequestId,
    );
    if (existingRequest) {
      return {
        message: 'Attendance punch was already received.',
        idempotent_replay: true,
        punch: existingRequest,
      };
    }
    await this.locationPrivacyService?.assertAcknowledged(
      params.companyId,
      employee.id,
    );

    const policy = await this.resolvePolicy(
      params.companyId,
      params.policySetId ?? null,
    );

    const channel = params.channel ?? 'MOBILE';
    this.ensurePolicyAllowsPunchChannel(policy, channel);

    const selfieRequired =
      params.punchType === AttendancePunchTypeEnum.CHECK_IN
        ? policy?.require_selfie_for_check_in === true
        : policy?.require_selfie_for_check_out === true;
    if (selfieRequired && !params.dto.selfie) {
      throw new BadRequestException(
        `A selfie is required for attendance ${params.punchType === AttendancePunchTypeEnum.CHECK_IN ? 'check-in' : 'check-out'} by the active attendance policy.`,
      );
    }

    const requiredCheckpoints = await this.findRequiredCheckpoints(
      policy?.id ?? null,
    );
    const isOfflineQueued = params.dto.offlineQueued === true;
    if (isOfflineQueued && !policy?.allow_offline_punches) {
      throw new BadRequestException(
        'Offline attendance submissions are not enabled by the active company policy.',
      );
    }
    if (
      isOfflineQueued &&
      requiredCheckpoints.some(
        (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.QR,
      )
    ) {
      throw new BadRequestException(
        'This attendance policy requires a live QR checkpoint and cannot accept an offline queued punch.',
      );
    }
    this.assertEmployeeCanPunch(employee);

    const wifiSsid = this.normalizeOptionalString(params.dto.wifiSsid);
    const wifiBssid = this.normalizeOptionalString(params.dto.wifiBssid);
    const deviceIdentifier = this.normalizeOptionalString(
      params.dto.deviceIdentifier,
    );
    const requireDeviceIdentifier =
      this.configService.get<boolean>(
        'ATTENDANCE_MOBILE_REQUIRE_DEVICE_IDENTIFIER',
      ) ?? true;
    if (requireDeviceIdentifier && !deviceIdentifier) {
      throw new BadRequestException(
        'deviceIdentifier is required for mobile attendance',
      );
    }

    const clientCapturedAt = params.dto.clientCapturedAt
      ? new Date(params.dto.clientCapturedAt)
      : null;
    if (clientCapturedAt && Number.isNaN(clientCapturedAt.getTime())) {
      throw new BadRequestException('clientCapturedAt is invalid');
    }
    if (isOfflineQueued && !clientCapturedAt) {
      throw new BadRequestException(
        'clientCapturedAt is required for offline queued attendance.',
      );
    }

    const maximumClockSkewSeconds =
      this.configService.get<number>(
        'ATTENDANCE_MOBILE_MAX_CLOCK_SKEW_SECONDS',
      ) ?? 300;
    const punchTime =
      isOfflineQueued && clientCapturedAt ? clientCapturedAt : new Date();
    if (clientCapturedAt) {
      const clockSkewSeconds =
        Math.abs(Date.now() - clientCapturedAt.getTime()) / 1000;
      if (isOfflineQueued) {
        const maxOfflineAgeHours = policy?.offline_max_age_hours ?? 24;
        if (
          clientCapturedAt.getTime() >
            Date.now() + maximumClockSkewSeconds * 1000 ||
          clockSkewSeconds > maxOfflineAgeHours * 60 * 60
        ) {
          throw new BadRequestException({
            message:
              'Queued attendance punch is outside the allowed offline submission window.',
            maximum_offline_age_hours: maxOfflineAgeHours,
          });
        }
      } else if (clockSkewSeconds > maximumClockSkewSeconds) {
        throw new BadRequestException({
          message: 'Mobile device time differs too much from server time.',
          maximum_clock_skew_seconds: maximumClockSkewSeconds,
          actual_clock_skew_seconds: Math.round(clockSkewSeconds),
        });
      }
    }

    const submittedOverrideReason = this.normalizeOptionalString(
      params.dto.overrideReason,
    );
    const overrideReason = isOfflineQueued
      ? 'Offline punch submitted from the encrypted device queue; manager review is required.'
      : submittedOverrideReason;
    const submittedIpAddress = this.normalizeOptionalString(
      params.dto.ipAddress,
    );
    const ipAddress =
      submittedIpAddress ??
      this.normalizeOptionalString(params.requestIp) ??
      null;
    const punchAvailability = await this.validateEmployeePunchAvailability({
      companyId: params.companyId,
      employee,
      punchType: params.punchType,
      punchTime,
      includePendingOfflinePunches: isOfflineQueued,
    });
    const attendanceDate = punchAvailability.attendanceDate;
    if (
      channel === 'MOBILE' &&
      punchAvailability.schedule.shiftId !== null &&
      !punchAvailability.schedule.allowMobileAttendance
    ) {
      throw new BadRequestException(
        'The assigned shift does not allow mobile attendance.',
      );
    }
    const isRemoteAttendance = params.dto.remoteAttendance === true;
    if (
      isRemoteAttendance &&
      !punchAvailability.schedule.allowRemoteAttendance
    ) {
      throw new BadRequestException(
        'The assigned shift does not allow remote attendance.',
      );
    }
    if (isRemoteAttendance) {
      await this.workFromHomeService.assertApprovedForDate(
        params.companyId,
        employee.id,
        attendanceDate,
      );
    }

    const geofenceMatch = await this.matchGeofence({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      requiredCheckpoints,
      geofenceRequired: this.isGeofenceRequired(policy, requiredCheckpoints),
      latitude: params.dto.latitude,
      longitude: params.dto.longitude,
      accuracyMeters: params.dto.accuracyMeters,
    });

    const locationValidationErrors = [...geofenceMatch.errors];
    if (
      locationValidationErrors.length > 0 &&
      !(policy?.allow_location_exception_override && overrideReason)
    ) {
      throw new BadRequestException({
        message: locationValidationErrors[0],
      });
    }

    const wifiMatch = await this.matchWifiNetwork({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      requiredCheckpoints,
      wifiSsid,
      wifiBssid,
      submittedIpAddress,
      fallbackIpAddress: ipAddress,
    });

    locationValidationErrors.push(...wifiMatch.errors);
    if (
      wifiMatch.errors.length > 0 &&
      !(policy?.allow_location_exception_override && overrideReason)
    ) {
      throw new BadRequestException({
        message: wifiMatch.errors[0],
      });
    }

    if (policy?.prevent_mobile_device_sharing && deviceIdentifier) {
      await this.registerOrValidateMobileDevice({
        companyId: params.companyId,
        employeeId: employee.id,
        deviceIdentifier,
        deviceInfo: params.dto.deviceInfo ? { ...params.dto.deviceInfo } : null,
      });
    }

    await this.validateTrustedMobileDevice({
      policy,
      companyId: params.companyId,
      employeeId: employee.id,
      window: punchAvailability.window,
      deviceIdentifier,
    });

    const validationErrors = [
      ...locationValidationErrors,
      ...this.collectUnsupportedCheckpointValidationErrors(requiredCheckpoints),
    ];

    const validationPassed = validationErrors.length === 0;

    const hasOverrideReason = Boolean(overrideReason);

    if (!validationPassed && !hasOverrideReason) {
      throw new BadRequestException({
        message: 'Attendance punch rejected.',
        errors: validationErrors,
      });
    }

    const qrValidationResult = requiredCheckpoints.some(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.QR,
    )
      ? await this.checkpointQrService?.validateAndConsume({
          companyId: params.companyId,
          employeeId: employee.id,
          policySetId: policy!.id,
          requiredCheckpoints,
          token: params.dto.qrToken,
        })
      : { required: false, valid: true, checkpointId: null };

    if (!qrValidationResult) {
      throw new ServiceUnavailableException(
        'Attendance QR checkpoint validation is unavailable.',
      );
    }

    const status = isOfflineQueued
      ? AttendancePunchValidationStatusEnum.PENDING_OVERRIDE
      : validationPassed
        ? AttendancePunchValidationStatusEnum.APPROVED
        : AttendancePunchValidationStatusEnum.PENDING_OVERRIDE;

    let storedSelfie: StoredFile | null = null;
    if (params.dto.selfie) {
      if (!this.filesService) {
        throw new ServiceUnavailableException(
          'Attendance selfie storage is unavailable.',
        );
      }

      storedSelfie = await this.filesService.savePrivateBase64File(
        params.dto.selfie,
        {
          directorySegments: [
            'attendance-selfies',
            `company-${params.companyId}`,
            `employee-${employee.id}`,
          ],
          fileNamePrefix: `punch-${params.dto.clientRequestId}`,
          allowedMimeTypes: ['image/jpeg'],
          maxFileSizeBytes: 64 * 1024,
          validateFileSignature: true,
        },
      );
    }

    const rawPayload = {
      clientRequestId: params.dto.clientRequestId,
      clientCapturedAt: params.dto.clientCapturedAt ?? null,
      offlineQueued: isOfflineQueued,
      latitude: params.dto.latitude,
      longitude: params.dto.longitude,
      accuracyMeters: params.dto.accuracyMeters ?? null,
      wifiSsid: wifiSsid ?? null,
      wifiBssid: wifiBssid ?? null,
      ipAddress,
      deviceIdentifier: deviceIdentifier ?? null,
      deviceInfo: params.dto.deviceInfo ?? null,
      overrideReason: overrideReason ?? null,
      remoteAttendance: isRemoteAttendance,
      qrTokenHash: params.dto.qrToken
        ? createAttendanceHash(params.dto.qrToken)
        : null,
      selfiePath: storedSelfie?.publicPath ?? null,
    };
    const payloadHash = createAttendanceHash(rawPayload);

    const punch = this.punchRepo.createEntity({
      companyId: params.companyId,
      branchId: employee.primary_branch_id ?? null,
      employeeId: employee.id,
      policySetId: policy?.id ?? null,
      geofenceId: geofenceMatch.matchedGeofence?.id ?? null,
      wifiNetworkId: wifiMatch.matchedWifiNetwork?.id ?? null,
      punchType: params.punchType,
      source:
        channel === 'WEB'
          ? AttendancePunchSourceEnum.WEB
          : AttendancePunchSourceEnum.MOBILE,
      punchTime,
      attendanceDate,
      clientRequestId: params.dto.clientRequestId,
      clientCapturedAt,
      receivedAt: punchTime,
      latitude: String(params.dto.latitude),
      longitude: String(params.dto.longitude),
      accuracyMeters:
        params.dto.accuracyMeters !== undefined
          ? String(params.dto.accuracyMeters)
          : null,
      distanceFromGeofenceMeters:
        geofenceMatch.validation?.distanceMeters !== undefined
          ? String(geofenceMatch.validation.distanceMeters)
          : null,
      wifiSsid: wifiSsid ?? null,
      wifiBssid: wifiBssid ?? null,
      ipAddress,
      userAgent: params.userAgent ?? null,
      deviceIdentifier: deviceIdentifier ?? null,
      validationStatus: status,
      validationMessage: isOfflineQueued
        ? 'Offline punch received and held for manager review.'
        : validationPassed
          ? 'Mobile punch validation passed.'
          : validationErrors.join(' | '),
      geofenceValidationResult: geofenceMatch.validationResult,
      wifiValidationResult: wifiMatch.validationResult,
      qrValidationResult,
      isOverrideRequested:
        isOfflineQueued || (!validationPassed && hasOverrideReason),
      overrideReason: overrideReason ?? null,
      deviceInfo: params.dto.deviceInfo ?? null,
      rawPayload,
      payloadHash,
      isProcessed: false,
      processedEventId: null,
      processingAttempts: 0,
      lastProcessingError: null,
    });

    let saved: AttendanceMobilePunch;
    try {
      saved = await this.punchRepo.save(punch);
    } catch (error) {
      if (storedSelfie) {
        await this.filesService
          ?.removeManagedFile(storedSelfie.publicPath)
          .catch(() => undefined);
      }
      if (this.isUniqueViolation(error)) {
        const duplicate = await this.punchRepo.findByClientRequest(
          params.companyId,
          employee.id,
          params.dto.clientRequestId,
        );
        if (duplicate) {
          return {
            message: 'Attendance punch was already received.',
            idempotent_replay: true,
            punch: duplicate,
          };
        }
      }

      throw error;
    }

    if (
      saved.validationStatus === AttendancePunchValidationStatusEnum.APPROVED
    ) {
      await this.eventIngestionService.ingestMobilePunch(
        saved.companyId,
        saved.id,
      );
      saved = await this.findOne(saved.companyId, saved.id);
    }

    return {
      message: isOfflineQueued
        ? 'Offline punch received and queued for manager review.'
        : validationPassed
          ? 'Attendance punch saved and processed successfully.'
          : 'Attendance punch saved as pending override.',
      idempotent_replay: false,
      punch: saved,
    };
  }

  async findAll(
    companyId: number,
    query: AttendanceMobilePunchQueryDto,
    access?: {
      actorId: number;
      employeeId: number | null;
      canViewLocation: boolean;
      requestId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    const result = await this.punchRepo.findPaginated(companyId, query);
    const locationRows = result.items.filter((punch) =>
      this.hasLocationData(punch),
    );
    if (access && access.canViewLocation && locationRows.length) {
      await this.logLocationAccess({
        companyId,
        actorId: access.actorId,
        employeeId: query.employeeId ?? null,
        accessType: access.employeeId ? 'SELF_PUNCH_LIST' : 'PUNCH_LIST',
        recordId: null,
        recordCount: locationRows.length,
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        purpose: access.employeeId
          ? 'Employee viewing own attendance location data'
          : 'Authorized attendance location review',
        requestId: access.requestId,
        ipAddress: access.ipAddress,
        userAgent: access.userAgent,
      });
    }
    return {
      ...result,
      items: result.items.map((punch) =>
        access?.canViewLocation ? punch : this.redactLocation(punch),
      ),
    };
  }

  async findOneWithLocationPrivacy(
    companyId: number,
    id: number,
    access: {
      actorId: number;
      employeeId: number | null;
      canViewLocation: boolean;
      requestId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    const punch = await this.findOne(companyId, id);
    const canViewLocation =
      access.canViewLocation || access.employeeId === punch.employeeId;
    if (canViewLocation && this.hasLocationData(punch)) {
      await this.logLocationAccess({
        companyId,
        actorId: access.actorId,
        employeeId: punch.employeeId,
        accessType: access.employeeId ? 'SELF_PUNCH_DETAIL' : 'PUNCH_DETAIL',
        recordId: punch.id,
        recordCount: 1,
        dateFrom: null,
        dateTo: null,
        purpose: access.employeeId
          ? 'Employee viewing own attendance location data'
          : 'Authorized attendance location review',
        requestId: access.requestId,
        ipAddress: access.ipAddress,
        userAgent: access.userAgent,
      });
    }
    return canViewLocation ? punch : this.redactLocation(punch);
  }

  async applyLocationPrivacyToPunchResponse<T extends Record<string, unknown>>(
    companyId: number,
    response: T,
    access: {
      actorId: number;
      employeeId: number | null;
      canViewLocation: boolean;
      requestId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<T> {
    const punch = response.punch as AttendanceMobilePunch | undefined;
    if (!punch || typeof punch !== 'object') return response;
    const canViewLocation =
      access.canViewLocation || access.employeeId === punch.employeeId;
    if (canViewLocation && this.hasLocationData(punch)) {
      await this.logLocationAccess({
        companyId,
        actorId: access.actorId,
        employeeId: punch.employeeId,
        accessType: access.employeeId
          ? 'SELF_PUNCH_RESPONSE'
          : 'PUNCH_RESPONSE',
        recordId: punch.id,
        recordCount: 1,
        dateFrom: null,
        dateTo: null,
        purpose: access.employeeId
          ? 'Employee viewing own attendance punch response'
          : 'Authorized attendance location review',
        requestId: access.requestId,
        ipAddress: access.ipAddress,
        userAgent: access.userAgent,
      });
    }
    return {
      ...response,
      punch: canViewLocation ? punch : this.redactLocation(punch),
    };
  }

  listLocationAccessLogs(companyId: number) {
    if (!this.locationAccessRepository) return Promise.resolve([]);
    return this.locationAccessRepository.find({
      where: { companyId },
      order: { accessedAt: 'DESC', id: 'DESC' },
      take: 500,
    });
  }

  private hasLocationData(punch: AttendanceMobilePunch): boolean {
    return Boolean(
      punch.latitude ||
      punch.longitude ||
      punch.accuracyMeters ||
      punch.distanceFromGeofenceMeters ||
      punch.wifiSsid ||
      punch.wifiBssid ||
      punch.ipAddress ||
      punch.deviceInfo ||
      punch.geofenceValidationResult ||
      punch.wifiValidationResult ||
      punch.qrValidationResult,
    );
  }

  private redactLocation(punch: AttendanceMobilePunch): AttendanceMobilePunch {
    const copy = { ...punch };
    copy.latitude = null;
    copy.longitude = null;
    copy.accuracyMeters = null;
    copy.distanceFromGeofenceMeters = null;
    copy.wifiSsid = null;
    copy.wifiBssid = null;
    copy.ipAddress = null;
    copy.deviceInfo = null;
    copy.geofenceValidationResult = null;
    copy.wifiValidationResult = null;
    copy.qrValidationResult = null;
    copy.geofence = null;
    copy.wifiNetwork = null;
    const payload =
      copy.rawPayload && typeof copy.rawPayload === 'object'
        ? { ...copy.rawPayload }
        : null;
    if (payload) this.removeLocationFields(payload);
    copy.rawPayload = payload;
    return copy;
  }

  private removeLocationFields(value: Record<string, any>) {
    const locationKeys = new Set([
      'latitude',
      'longitude',
      'accuracyMeters',
      'accuracy_meters',
      'lat',
      'lng',
      'lon',
      'coords',
      'gps',
      'distanceFromGeofenceMeters',
      'distance_from_geofence_meters',
      'wifiSsid',
      'wifi_ssid',
      'wifiBssid',
      'wifi_bssid',
      'ipAddress',
      'ip_address',
      'deviceInfo',
      'device_info',
      'location',
      'coordinates',
    ]);
    for (const key of Object.keys(value)) {
      if (locationKeys.has(key)) delete value[key];
      else if (
        value[key] &&
        typeof value[key] === 'object' &&
        !Array.isArray(value[key])
      ) {
        this.removeLocationFields(value[key] as Record<string, any>);
      }
    }
  }

  private async logLocationAccess(input: {
    companyId: number;
    actorId: number;
    employeeId: number | null;
    accessType: string;
    recordId: number | null;
    recordCount: number;
    dateFrom: string | null;
    dateTo: string | null;
    purpose: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    if (!this.locationAccessRepository) {
      this.logger.error(
        'Attendance location data was read but the location access audit repository is unavailable.',
      );
      throw new ServiceUnavailableException(
        'Location access auditing is unavailable.',
      );
    }
    await this.locationAccessRepository.save(
      this.locationAccessRepository.create({
        companyId: input.companyId,
        actorCompanyUserId: input.actorId,
        employeeId: input.employeeId,
        accessType: input.accessType,
        recordId: input.recordId,
        recordCount: input.recordCount,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        purpose: input.purpose,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      }),
    );
  }

  async listMobileDeviceRegistrations(companyId: number) {
    const repository = this.requireDeviceRegistrationRepository();
    const registrations = await repository.find({
      where: { companyId },
      order: { lastSeenAt: 'DESC', id: 'DESC' },
      take: 500,
    });
    const employeeIds = Array.from(
      new Set(
        registrations.flatMap((item) =>
          [item.employeeId, item.lastEmployeeId].filter(
            (id): id is number => typeof id === 'number',
          ),
        ),
      ),
    );
    const employees = employeeIds.length
      ? await this.employeeRepository.find({
          where: { id: In(employeeIds), company_id: companyId },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            employee_no: true,
          },
        })
      : [];
    const employeeNames = new Map(
      employees.map((employee) => [
        employee.id,
        `${employee.first_name} ${employee.last_name} (${employee.employee_no})`,
      ]),
    );
    return registrations.map((item) => ({
      ...this.mapDeviceRegistration(item),
      employee_name: item.employeeId
        ? (employeeNames.get(item.employeeId) ?? null)
        : null,
      last_employee_name: item.lastEmployeeId
        ? (employeeNames.get(item.lastEmployeeId) ?? null)
        : null,
    }));
  }

  async listMobileDeviceRegistrationAudit(companyId: number, id: number) {
    const repository = this.requireDeviceRegistrationRepository();
    const registration = await repository.findOne({ where: { companyId, id } });
    if (!registration) {
      throw new NotFoundException('Attendance mobile device not found.');
    }
    const auditRepository = repository.manager.getRepository(
      AttendanceMobileDeviceRegistrationAudit,
    );
    const entries = await auditRepository.find({
      where: { companyId, registrationId: id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      previous_employee_id: entry.previousEmployeeId,
      employee_id: entry.employeeId,
      actor_company_user_id: entry.actorCompanyUserId,
      reason: entry.reason,
      created_at: entry.createdAt,
    }));
  }

  async releaseMobileDeviceRegistration(params: {
    companyId: number;
    id: number;
    releasedByCompanyUserId: number;
    dto: ReleaseAttendanceMobileDeviceDto;
  }) {
    const repository = this.requireDeviceRegistrationRepository();
    const reason = this.normalizeOptionalString(params.dto.reason);
    if (!reason || reason.length < 5) {
      throw new BadRequestException(
        'A device release reason of at least 5 characters is required.',
      );
    }

    return repository.manager.transaction(async (manager) => {
      const registrationRepository = manager.getRepository(
        AttendanceMobileDeviceRegistration,
      );
      const registration = await registrationRepository.findOne({
        where: { companyId: params.companyId, id: params.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registration) {
        throw new NotFoundException('Attendance mobile device not found.');
      }
      if (
        registration.status === 'UNBOUND' ||
        registration.employeeId === null
      ) {
        throw new BadRequestException(
          'This mobile device is already released and available for enrollment.',
        );
      }

      const previousEmployeeId = registration.employeeId;
      registration.employeeId = null;
      registration.lastEmployeeId = previousEmployeeId;
      registration.status = 'UNBOUND';
      registration.releasedByCompanyUserId = params.releasedByCompanyUserId;
      registration.releasedAt = new Date();
      registration.releaseReason = reason;
      await registrationRepository.save(registration);

      await manager.getRepository(AttendanceMobileDeviceRegistrationAudit).save(
        manager.getRepository(AttendanceMobileDeviceRegistrationAudit).create({
          companyId: params.companyId,
          registrationId: registration.id,
          deviceIdentifier: registration.deviceIdentifier,
          action: 'RELEASED',
          previousEmployeeId,
          employeeId: null,
          actorCompanyUserId: params.releasedByCompanyUserId,
          reason,
          deviceInfo: registration.deviceInfo,
        }),
      );

      return this.mapDeviceRegistration(registration);
    });
  }

  async findOne(companyId: number, id: number) {
    const punch = await this.punchRepo.findOneById(companyId, id);

    if (!punch) {
      throw new NotFoundException('Attendance mobile punch not found.');
    }

    return punch;
  }

  async getSelfie(companyId: number, id: number): Promise<Buffer> {
    const punch = await this.findOne(companyId, id);
    const selfiePath =
      typeof punch.rawPayload?.selfiePath === 'string'
        ? punch.rawPayload.selfiePath
        : null;

    if (!selfiePath || !this.filesService) {
      throw new NotFoundException('Attendance selfie not found.');
    }

    const image = await this.filesService.readManagedFile(selfiePath);
    if (!image) {
      throw new NotFoundException('Attendance selfie not found.');
    }

    return image;
  }

  @Cron('0 30 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async runSelfieRetention(): Promise<void> {
    const days = this.configService.get<number>(
      'ATTENDANCE_SELFIE_RETENTION_DAYS',
      0,
    );
    if (!days || days < 1) return;
    const purgeEnabled = this.configService.get<boolean>(
      'ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED',
      false,
    );
    if (!this.advisoryLockService) {
      this.logger.error(
        'Attendance selfie retention skipped because the cross-instance advisory lock service is unavailable.',
      );
      return;
    }
    if (!purgeEnabled) {
      const candidates = await this.countSelfieRetentionCandidates(days);
      this.logger.warn(
        `Attendance selfie retention is in dry-run mode: ${candidates} unheld private selfie(s) exceed ${days} days.`,
      );
      return;
    }
    const approvals =
      (await this.retentionGovernance?.getApprovedPurgeTargets(
        'MOBILE_SELFIE',
        days,
      )) ?? [];
    if (!approvals.length) {
      this.logger.warn(
        'Attendance selfie purge is enabled but no company has a matching one-time purge approval; no selfies were deleted.',
      );
      return;
    }
    const execution = await this.advisoryLockService.runWithLock(
      'attendance:selfie-retention',
      async () => {
        for (const approval of approvals) {
          const completed = await this.applySelfieRetention(
            days,
            approval.companyId,
          );
          if (completed) {
            await this.retentionGovernance!.markPurgeExecuted(approval.id);
          }
        }
      },
    );
    if (!execution.acquired) {
      this.logger.debug(
        'Attendance selfie retention is already running on another application instance.',
      );
    }
  }

  private async countSelfieRetentionCandidates(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const repository = this.punchRepo.getNativeRepository();
    return repository
      .createQueryBuilder('punch')
      .where('punch.created_at < :cutoff', { cutoff })
      .andWhere("punch.raw_payload->>'selfiePath' IS NOT NULL")
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM attendance_data_retention_holds hold
          WHERE hold.company_id = punch.company_id
            AND hold.category = 'MOBILE_SELFIE'
            AND hold.record_id = punch.id
            AND hold.active = true
        )`,
      )
      .getCount();
  }

  private async applySelfieRetention(
    days: number,
    companyId: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const repository = this.punchRepo.getNativeRepository();
    const query = () =>
      repository
        .createQueryBuilder('punch')
        .where('punch.company_id = :companyId', { companyId })
        .andWhere('punch.created_at < :cutoff', { cutoff })
        .andWhere("punch.raw_payload->>'selfiePath' IS NOT NULL")
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM attendance_data_retention_holds hold
            WHERE hold.company_id = punch.company_id
              AND hold.category = 'MOBILE_SELFIE'
              AND hold.record_id = punch.id
              AND hold.active = true
          )`,
        )
        .orderBy('punch.id', 'ASC')
        .take(250);
    if (!this.filesService) {
      this.logger.error(
        'Attendance selfie purge is enabled but private file storage is unavailable; no selfies were purged.',
      );
      return false;
    }

    let purged = 0;
    let failed = false;
    while (true) {
      const punches = await query().getMany();
      if (!punches.length) break;
      for (const punch of punches) {
        const rawPayload = punch.rawPayload as Record<string, unknown> | null;
        const path = rawPayload?.selfiePath;
        if (typeof path !== 'string' || !path.trim()) continue;
        try {
          await this.filesService.removeManagedFile(path);
          punch.rawPayload = {
            ...rawPayload,
            selfiePath: null,
            selfiePurgedAt: new Date().toISOString(),
          };
          await repository.save(punch);
          purged += 1;
        } catch (error) {
          failed = true;
          this.logger.error(
            `Could not purge an attendance selfie for punch ${punch.id}: ${(error as Error).message}`,
          );
        }
      }
      if (punches.length < 250) break;
      if (
        punches.every((punch) => {
          const payload = punch.rawPayload as Record<string, unknown> | null;
          return (
            typeof payload?.selfiePath !== 'string' ||
            !payload.selfiePath.trim()
          );
        })
      )
        break;
      if (failed) break;
    }
    this.logger.warn(
      `Attendance selfie retention purged ${purged} unheld private selfie(s) for company ${companyId} older than ${days} days.`,
    );
    return !failed;
  }

  private requireDeviceRegistrationRepository() {
    if (!this.deviceRegistrationRepository) {
      throw new ServiceUnavailableException(
        'Attendance mobile device registration storage is unavailable.',
      );
    }
    return this.deviceRegistrationRepository;
  }

  private mapDeviceRegistration(
    registration: AttendanceMobileDeviceRegistration,
  ) {
    return {
      id: registration.id,
      company_id: registration.companyId,
      employee_id: registration.employeeId,
      last_employee_id: registration.lastEmployeeId,
      device_identifier: registration.deviceIdentifier,
      device_info: registration.deviceInfo,
      status: registration.status,
      first_seen_at: registration.firstSeenAt,
      last_seen_at: registration.lastSeenAt,
      released_by_company_user_id: registration.releasedByCompanyUserId,
      released_at: registration.releasedAt,
      release_reason: registration.releaseReason,
      created_at: registration.createdAt,
      updated_at: registration.updatedAt,
    };
  }

  private async registerOrValidateMobileDevice(params: {
    companyId: number;
    employeeId: number;
    deviceIdentifier: string;
    deviceInfo: Record<string, unknown> | null;
  }): Promise<void> {
    const repository = this.requireDeviceRegistrationRepository();
    try {
      await repository.manager.transaction(async (manager) => {
        const registrationRepository = manager.getRepository(
          AttendanceMobileDeviceRegistration,
        );
        const auditRepository = manager.getRepository(
          AttendanceMobileDeviceRegistrationAudit,
        );
        const registration = await registrationRepository.findOne({
          where: {
            companyId: params.companyId,
            deviceIdentifier: params.deviceIdentifier,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (registration?.status === 'ACTIVE') {
          if (registration.employeeId !== params.employeeId) {
            throw new ConflictException(
              'This mobile app installation is registered to another employee. Contact an attendance administrator to review or release the device.',
            );
          }
          registration.lastSeenAt = new Date();
          registration.deviceInfo =
            params.deviceInfo ?? registration.deviceInfo;
          await registrationRepository.save(registration);
          return;
        }

        if (registration?.status === 'UNBOUND') {
          const previousEmployeeId = registration.lastEmployeeId;
          registration.employeeId = params.employeeId;
          registration.status = 'ACTIVE';
          registration.lastSeenAt = new Date();
          registration.deviceInfo =
            params.deviceInfo ?? registration.deviceInfo;
          await registrationRepository.save(registration);
          await auditRepository.save(
            auditRepository.create({
              companyId: params.companyId,
              registrationId: registration.id,
              deviceIdentifier: params.deviceIdentifier,
              action: 'REASSIGNED',
              previousEmployeeId,
              employeeId: params.employeeId,
              actorCompanyUserId: null,
              reason:
                'Re-enrolled by the authenticated employee after administrative device release.',
              deviceInfo: registration.deviceInfo,
            }),
          );
          return;
        }

        const usedByAnotherEmployee =
          await this.punchRepo.deviceIsUsedByAnotherEmployee({
            companyId: params.companyId,
            employeeId: params.employeeId,
            deviceIdentifier: params.deviceIdentifier,
          });
        if (usedByAnotherEmployee) {
          throw new ConflictException(
            'This mobile app installation appears in another employee’s attendance history. Contact an attendance administrator to verify ownership and release it if appropriate.',
          );
        }

        const created = await registrationRepository.save(
          registrationRepository.create({
            companyId: params.companyId,
            employeeId: params.employeeId,
            deviceIdentifier: params.deviceIdentifier,
            deviceInfo: params.deviceInfo,
            status: 'ACTIVE',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            lastEmployeeId: null,
            releasedByCompanyUserId: null,
            releasedAt: null,
            releaseReason: null,
          }),
        );
        await auditRepository.save(
          auditRepository.create({
            companyId: params.companyId,
            registrationId: created.id,
            deviceIdentifier: params.deviceIdentifier,
            action: 'ENROLLED',
            previousEmployeeId: null,
            employeeId: params.employeeId,
            actorCompanyUserId: null,
            reason: 'First attendance punch from this app installation.',
            deviceInfo: params.deviceInfo,
          }),
        );
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrentRegistration = await repository.findOne({
        where: {
          companyId: params.companyId,
          deviceIdentifier: params.deviceIdentifier,
        },
      });
      if (
        concurrentRegistration?.status === 'ACTIVE' &&
        concurrentRegistration.employeeId === params.employeeId
      ) {
        return;
      }
      throw new ConflictException(
        'This mobile app installation was registered concurrently to another employee. Contact an attendance administrator to review the device.',
      );
    }
  }

  async approveOverride(params: {
    companyId: number;
    id: number;
    reviewedBy: number;
    dto: ApproveMobilePunchOverrideDto;
  }) {
    const punch = await this.findOne(params.companyId, params.id);
    this.ensureReviewerCanReview(punch, params.reviewedBy);

    if (
      punch.validationStatus !==
      AttendancePunchValidationStatusEnum.PENDING_OVERRIDE
    ) {
      throw new BadRequestException(
        'Only pending override punches can be approved.',
      );
    }

    punch.validationStatus =
      AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED;
    punch.overrideReviewedBy = params.reviewedBy;
    punch.overrideReviewedAt = new Date();
    punch.overrideReviewNote = params.dto.reviewNote ?? null;
    punch.isProcessed = false;
    punch.processedEventId = null;
    punch.processingAttempts = punch.processingAttempts ?? 0;
    punch.lastProcessingError = null;

    await this.punchRepo.save(punch);
    await this.eventIngestionService.ingestMobilePunch(
      params.companyId,
      punch.id,
    );

    return this.findOne(params.companyId, punch.id);
  }

  async rejectOverride(params: {
    companyId: number;
    id: number;
    reviewedBy: number;
    dto: ApproveMobilePunchOverrideDto;
  }) {
    const punch = await this.findOne(params.companyId, params.id);
    this.ensureReviewerCanReview(punch, params.reviewedBy);

    if (
      punch.validationStatus !==
      AttendancePunchValidationStatusEnum.PENDING_OVERRIDE
    ) {
      throw new BadRequestException(
        'Only pending override punches can be rejected.',
      );
    }

    punch.validationStatus =
      AttendancePunchValidationStatusEnum.OVERRIDE_REJECTED;
    punch.overrideReviewedBy = params.reviewedBy;
    punch.overrideReviewedAt = new Date();
    punch.overrideReviewNote = params.dto.reviewNote ?? null;

    return this.punchRepo.save(punch);
  }

  private async matchGeofence(params: {
    companyId: number;
    employeeBranchId?: number | null;
    requiredCheckpoints: AttendanceCheckpoint[];
    geofenceRequired: boolean;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  }): Promise<{
    matchedGeofence: AttendanceGeofence | null;
    validation: {
      valid: boolean;
      message: string;
      distanceMeters?: number;
    } | null;
    validationResult: Record<string, any> | null;
    errors: string[];
  }> {
    const gpsCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.GPS,
    );
    const checkpointGeofenceIds = Array.from(
      new Set(
        gpsCheckpoints
          .map((checkpoint) => checkpoint.geofenceId)
          .filter((value): value is number => Boolean(value)),
      ),
    );

    if (!params.geofenceRequired) {
      return {
        matchedGeofence: null,
        validation: null,
        validationResult: {
          required: false,
          matched: false,
          checkedGeofenceIds: [],
          attempts: [],
        },
        errors: [],
      };
    }

    const allowedGeofences = checkpointGeofenceIds.length
      ? await this.geofenceRepo.findActiveByIds(
          params.companyId,
          checkpointGeofenceIds,
        )
      : await this.geofenceRepo.findActiveForBranch(
          params.companyId,
          params.employeeBranchId ?? null,
        );

    if (!allowedGeofences.length) {
      return {
        matchedGeofence: null,
        validation: null,
        validationResult: {
          required: true,
          matched: false,
          checkedGeofenceIds: [],
          attempts: [],
        },
        errors: [
          checkpointGeofenceIds.length
            ? 'No active geofence is configured for the active GPS checkpoint(s).'
            : 'No active registered geofence is configured for the employee branch.',
        ],
      };
    }

    const attempts: Array<Record<string, any>> = [];

    for (const geofence of allowedGeofences) {
      if (
        params.employeeBranchId &&
        geofence.branchId &&
        geofence.branchId !== params.employeeBranchId
      ) {
        attempts.push({
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          valid: false,
          message:
            'Configured geofence does not belong to the employee branch.',
        });
        continue;
      }

      if (geofence.status !== AttendanceGeofenceStatusEnum.ACTIVE) {
        attempts.push({
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          valid: false,
          message: 'Configured geofence is inactive.',
        });
        continue;
      }

      const validation =
        geofence.type === AttendanceGeofenceTypeEnum.CIRCLE
          ? this.geofenceDistanceService.validateCircleGeofence({
              officeLatitude: Number(geofence.latitude),
              officeLongitude: Number(geofence.longitude),
              userLatitude: params.latitude,
              userLongitude: params.longitude,
              radiusMeters: geofence.radiusMeters,
              accuracyMeters: params.accuracyMeters,
              allowedAccuracyMeters: geofence.allowedAccuracyMeters,
              strictAccuracy: geofence.strictAccuracy,
            })
          : this.geofenceDistanceService.validatePolygonGeofence({
              coordinates: geofence.polygonCoordinates ?? [],
              userLatitude: params.latitude,
              userLongitude: params.longitude,
              accuracyMeters: params.accuracyMeters,
              allowedAccuracyMeters: geofence.allowedAccuracyMeters,
              strictAccuracy: geofence.strictAccuracy,
            });
      const checkpointDistanceError = this.getGpsCheckpointDistanceError({
        geofenceId: geofence.id,
        requiredCheckpoints: gpsCheckpoints,
        distanceMeters: validation.distanceMeters,
      });
      const valid = validation.valid && !checkpointDistanceError;
      const message = checkpointDistanceError ?? validation.message;

      attempts.push({
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        valid,
        message,
        distanceMeters: validation.distanceMeters,
      });

      if (valid) {
        return {
          matchedGeofence: geofence,
          validation,
          validationResult: {
            required: true,
            matched: true,
            matchedGeofenceId: geofence.id,
            matchedGeofenceName: geofence.name,
            checkedGeofenceIds: allowedGeofences.map((item) => item.id),
            attempts,
          },
          errors: [],
        };
      }
    }

    return {
      matchedGeofence: null,
      validation: null,
      validationResult: {
        required: true,
        matched: false,
        checkedGeofenceIds: allowedGeofences.map((item) => item.id),
        attempts,
      },
      errors: this.buildValidationFailureErrors(
        'Location is not inside the allowed geofence.',
        attempts,
      ),
    };
  }

  private async matchWifiNetwork(params: {
    companyId: number;
    employeeBranchId?: number | null;
    requiredCheckpoints: AttendanceCheckpoint[];
    wifiSsid?: string | null;
    wifiBssid?: string | null;
    submittedIpAddress?: string | null;
    fallbackIpAddress?: string | null;
  }): Promise<{
    matchedWifiNetwork: AttendanceWifiNetwork | null;
    validationResult: Record<string, any> | null;
    errors: string[];
  }> {
    const wifiCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.WIFI,
    );
    const checkpointWifiIds = Array.from(
      new Set(
        wifiCheckpoints
          .map((checkpoint) => checkpoint.wifiNetworkId)
          .filter((value): value is number => Boolean(value)),
      ),
    );
    const wifiRequired = wifiCheckpoints.length > 0;
    const hasWifiDetails = Boolean(
      params.wifiSsid || params.wifiBssid || params.submittedIpAddress,
    );
    const ipAddressForValidation =
      params.submittedIpAddress ?? params.fallbackIpAddress ?? null;

    if (!wifiRequired && !hasWifiDetails) {
      return {
        matchedWifiNetwork: null,
        validationResult: null,
        errors: [],
      };
    }

    const allowedWifiNetworks = checkpointWifiIds.length
      ? await this.wifiRepo.findActiveByIds(params.companyId, checkpointWifiIds)
      : await this.wifiRepo.findActiveForBranch(
          params.companyId,
          params.employeeBranchId ?? null,
        );

    if (!allowedWifiNetworks.length) {
      return {
        matchedWifiNetwork: null,
        validationResult: {
          required: wifiRequired,
          matched: false,
          checkedWifiNetworkIds: [],
          attempts: [],
        },
        errors:
          wifiRequired || hasWifiDetails
            ? [
                wifiRequired
                  ? 'No active WiFi network is configured for the active WiFi checkpoint(s).'
                  : 'Submitted WiFi details could not be validated because no active WiFi network is configured for the employee branch.',
              ]
            : [],
      };
    }

    const attempts: Array<Record<string, any>> = [];

    for (const wifiNetwork of allowedWifiNetworks) {
      if (
        params.employeeBranchId &&
        wifiNetwork.branchId &&
        wifiNetwork.branchId !== params.employeeBranchId
      ) {
        attempts.push({
          wifiNetworkId: wifiNetwork.id,
          wifiNetworkName: wifiNetwork.name,
          valid: false,
          message:
            'Configured WiFi network does not belong to the employee branch.',
        });
        continue;
      }

      const validation = this.wifiValidator.validate({
        wifiNetwork,
        ssid: params.wifiSsid,
        bssid: params.wifiBssid,
        ipAddress: ipAddressForValidation,
      });

      attempts.push({
        wifiNetworkId: wifiNetwork.id,
        wifiNetworkName: wifiNetwork.name,
        valid: validation.valid,
        message: validation.message,
      });

      if (validation.valid) {
        return {
          matchedWifiNetwork: wifiNetwork,
          validationResult: {
            required: wifiRequired,
            matched: true,
            matchedWifiNetworkId: wifiNetwork.id,
            matchedWifiNetworkName: wifiNetwork.name,
            checkedWifiNetworkIds: allowedWifiNetworks.map((item) => item.id),
            attempts,
          },
          errors: [],
        };
      }
    }

    return {
      matchedWifiNetwork: null,
      validationResult: {
        required: wifiRequired,
        matched: false,
        checkedWifiNetworkIds: allowedWifiNetworks.map((item) => item.id),
        attempts,
      },
      errors:
        wifiRequired || hasWifiDetails
          ? this.buildValidationFailureErrors(
              'WiFi network does not match any allowed office network.',
              attempts,
            )
          : [],
    };
  }

  private async resolveEmployeeContext(params: {
    companyId: number;
    requestedEmployeeId: number | null;
    authenticatedEmployeeId: number | null;
  }) {
    const resolvedEmployeeId =
      params.requestedEmployeeId ?? params.authenticatedEmployeeId;

    if (!resolvedEmployeeId) {
      throw new BadRequestException(
        'An employee profile is required to create a mobile punch.',
      );
    }

    if (
      params.authenticatedEmployeeId &&
      params.requestedEmployeeId &&
      params.requestedEmployeeId !== params.authenticatedEmployeeId
    ) {
      throw new ForbiddenException(
        'You can only create attendance punches for your own employee profile.',
      );
    }

    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId: resolvedEmployeeId })
      .andWhere('companyUser.company_id = :companyId', {
        companyId: params.companyId,
      })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found in the active company.');
    }

    return employee;
  }

  private async validateEmployeePunchAvailability(params: {
    companyId: number;
    employee: Employee;
    punchType: AttendancePunchTypeEnum;
    punchTime: Date;
    includePendingOfflinePunches?: boolean;
  }): Promise<{
    attendanceDate: string;
    schedule: ResolvedAttendanceSchedule;
    window: { start: Date; end: Date };
  }> {
    const context = await this.resolvePunchAttendanceContext({
      companyId: params.companyId,
      employeeId: params.employee.id,
      punchTime: params.punchTime,
    });

    this.assertEmployeeCanPunch(params.employee, context.attendanceDate);

    const punchState = await this.findExistingPunchState({
      companyId: params.companyId,
      employee: params.employee,
      attendanceDate: context.attendanceDate,
      window: context.window,
      includePendingOfflinePunches:
        params.includePendingOfflinePunches ?? false,
    });

    if (params.punchType === AttendancePunchTypeEnum.CHECK_IN) {
      if (punchState.hasCheckIn) {
        throw new BadRequestException({
          message: 'Employee has already checked in for this attendance day.',
        });
      }

      return context;
    }

    if (!punchState.hasCheckIn) {
      throw new BadRequestException({
        message: 'Employee must check in before checking out.',
      });
    }

    if (punchState.hasCheckOut) {
      throw new BadRequestException({
        message: 'Employee has already checked out for this attendance day.',
      });
    }

    return context;
  }

  private async resolvePunchAttendanceContext(params: {
    companyId: number;
    employeeId: number;
    punchTime: Date;
  }): Promise<{
    attendanceDate: string;
    schedule: ResolvedAttendanceSchedule;
    window: { start: Date; end: Date };
  }> {
    const punchDate = formatDateOnly(params.punchTime);
    const candidateDates = Array.from(
      new Set([punchDate, addDaysToDateOnly(punchDate, -1)]),
    );
    const candidateSchedules = await Promise.all(
      candidateDates.map(async (scheduleDate, index) => {
        const schedule = await this.scheduleResolver.resolveForDate(
          params.companyId,
          params.employeeId,
          scheduleDate,
        );
        const window = this.buildAttendanceWindow(schedule);
        const score = this.scoreAttendanceSchedule(
          schedule,
          window,
          params.punchTime,
        );

        return {
          schedule,
          window,
          score,
          order: index,
        };
      }),
    );

    const bestMatch = candidateSchedules
      .filter(
        (
          candidate,
        ): candidate is typeof candidate & {
          window: { start: Date; end: Date };
        } =>
          Boolean(
            candidate.window &&
            candidate.schedule.scheduleStartAt &&
            candidate.schedule.scheduleEndAt,
          ),
      )
      .sort(
        (left, right) =>
          left.score.outsideWindow - right.score.outsideWindow ||
          left.score.outsideSchedule - right.score.outsideSchedule ||
          left.score.distanceFromScheduleMs -
            right.score.distanceFromScheduleMs ||
          left.order - right.order,
      )[0];

    if (!bestMatch) {
      throw new BadRequestException({
        message:
          'No valid timetable or shift found for this employee on this attendance day.',
      });
    }

    return {
      attendanceDate: bestMatch.schedule.scheduleDate,
      schedule: bestMatch.schedule,
      window: bestMatch.window,
    };
  }

  private buildAttendanceWindow(
    schedule: ResolvedAttendanceSchedule,
  ): { start: Date; end: Date } | null {
    if (!schedule.scheduleStartAt || !schedule.scheduleEndAt) {
      return null;
    }

    return {
      start: new Date(
        schedule.scheduleStartAt.getTime() -
          this.preShiftWindowHours * 60 * 60 * 1000,
      ),
      end: new Date(
        schedule.scheduleEndAt.getTime() +
          this.postShiftWindowHours * 60 * 60 * 1000,
      ),
    };
  }

  private scoreAttendanceSchedule(
    schedule: ResolvedAttendanceSchedule,
    window: { start: Date; end: Date } | null,
    punchTime: Date,
  ) {
    if (!window || !schedule.scheduleStartAt || !schedule.scheduleEndAt) {
      return {
        outsideWindow: 1,
        outsideSchedule: 1,
        distanceFromScheduleMs: Number.MAX_SAFE_INTEGER,
      };
    }

    const punchAtMs = punchTime.getTime();
    const scheduleStartMs = schedule.scheduleStartAt.getTime();
    const scheduleEndMs = schedule.scheduleEndAt.getTime();
    const withinWindow =
      punchAtMs >= window.start.getTime() && punchAtMs <= window.end.getTime();
    const withinSchedule =
      punchAtMs >= scheduleStartMs && punchAtMs <= scheduleEndMs;
    const distanceFromScheduleMs =
      punchAtMs < scheduleStartMs
        ? scheduleStartMs - punchAtMs
        : punchAtMs > scheduleEndMs
          ? punchAtMs - scheduleEndMs
          : 0;

    return {
      outsideWindow: withinWindow ? 0 : 1,
      outsideSchedule: withinSchedule ? 0 : 1,
      distanceFromScheduleMs,
    };
  }

  private async findExistingPunchState(params: {
    companyId: number;
    employee: Employee;
    attendanceDate: string;
    window: { start: Date; end: Date };
    includePendingOfflinePunches?: boolean;
  }): Promise<{ hasCheckIn: boolean; hasCheckOut: boolean }> {
    const employeeNo = this.normalizeOptionalString(
      params.employee.employee_no,
    );
    const [
      mobilePunches,
      pendingOfflinePunches,
      processedEvents,
      dailySummary,
      rawLogs,
    ] = await Promise.all([
      this.punchRepo.findApprovedForEmployeeWindow({
        companyId: params.companyId,
        employeeId: params.employee.id,
        windowStart: params.window.start,
        windowEnd: params.window.end,
      }),
      params.includePendingOfflinePunches
        ? this.punchRepo.findPendingOfflineForEmployeeWindow({
            companyId: params.companyId,
            employeeId: params.employee.id,
            windowStart: params.window.start,
            windowEnd: params.window.end,
          })
        : Promise.resolve([]),
      this.processedEventRepository.find({
        where: {
          companyId: params.companyId,
          employeeId: params.employee.id,
          isValid: true,
          eventTime: Between(params.window.start, params.window.end),
        },
        order: {
          eventTime: 'ASC',
        },
      }),
      this.dailySummaryRepository.findOne({
        where: {
          companyId: params.companyId,
          employeeId: params.employee.id,
          attendanceDate: params.attendanceDate,
        },
      }),
      employeeNo
        ? this.rawLogRepository.find({
            where: {
              companyId: params.companyId,
              employeeNo,
              eventTime: Between(params.window.start, params.window.end),
            },
            order: {
              eventTime: 'ASC',
            },
          })
        : Promise.resolve([]),
    ]);

    const hasMobileCheckIn = mobilePunches.some(
      (punch) => punch.punchType === AttendancePunchTypeEnum.CHECK_IN,
    );
    const hasPendingOfflineCheckIn = pendingOfflinePunches.some(
      (punch) => punch.punchType === AttendancePunchTypeEnum.CHECK_IN,
    );
    const hasMobileCheckOut = mobilePunches.some(
      (punch) => punch.punchType === AttendancePunchTypeEnum.CHECK_OUT,
    );
    const hasProcessedCheckIn = processedEvents.some(
      (event) => event.direction === AttendanceProcessedEventDirectionEnum.IN,
    );
    const hasProcessedCheckOut = processedEvents.some(
      (event) => event.direction === AttendanceProcessedEventDirectionEnum.OUT,
    );
    const hasRawCheckIn = rawLogs.some(
      (log) =>
        this.inferRawLogDirection(log) ===
        AttendanceProcessedEventDirectionEnum.IN,
    );
    const hasRawCheckOut = rawLogs.some(
      (log) =>
        this.inferRawLogDirection(log) ===
        AttendanceProcessedEventDirectionEnum.OUT,
    );

    return {
      hasCheckIn:
        hasMobileCheckIn ||
        hasPendingOfflineCheckIn ||
        hasProcessedCheckIn ||
        hasRawCheckIn ||
        Boolean(dailySummary?.checkInAt),
      hasCheckOut:
        hasMobileCheckOut ||
        hasProcessedCheckOut ||
        hasRawCheckOut ||
        Boolean(dailySummary?.checkOutAt),
    };
  }

  private inferRawLogDirection(
    rawLog: HikvisionAttendanceLog,
  ): AttendanceProcessedEventDirectionEnum {
    const checkInMinors = new Set([1, 3, 75]);
    const checkOutMinors = new Set([2, 4, 76]);

    if (typeof rawLog.minor === 'number') {
      if (checkInMinors.has(rawLog.minor)) {
        return AttendanceProcessedEventDirectionEnum.IN;
      }

      if (checkOutMinors.has(rawLog.minor)) {
        return AttendanceProcessedEventDirectionEnum.OUT;
      }
    }

    const status = (rawLog.attendanceStatus ?? '')
      .toLowerCase()
      .replace(/[\s_-]/g, '');

    if (status.includes('checkin') || status === 'in') {
      return AttendanceProcessedEventDirectionEnum.IN;
    }

    if (status.includes('checkout') || status === 'out') {
      return AttendanceProcessedEventDirectionEnum.OUT;
    }

    return AttendanceProcessedEventDirectionEnum.UNKNOWN;
  }

  private assertEmployeeCanPunch(
    employee: Employee,
    attendanceDate?: string | null,
  ) {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can create attendance punches.',
      );
    }

    if (
      attendanceDate &&
      employee.exit_date &&
      attendanceDate > employee.exit_date
    ) {
      throw new BadRequestException(
        'Attendance punch date cannot be after the employee exit date.',
      );
    }
  }

  private async resolvePolicy(companyId: number, policySetId: number | null) {
    return this.attendanceCompanyConfigService.resolvePolicyForCompany(
      companyId,
      policySetId,
    );
  }

  private ensurePolicyAllowsPunchChannel(
    policy: AttendancePolicy | null,
    channel: 'WEB' | 'MOBILE',
  ) {
    if (!policy) {
      return;
    }

    const authenticationModes = this.parseAuthenticationModes(
      policy.authentication_modes,
    );

    const allowed =
      channel === 'WEB'
        ? authenticationModes.has('WEB')
        : authenticationModes.has('MOBILE_APP') ||
          authenticationModes.has('MOBILE');
    if (!allowed) {
      throw new BadRequestException(
        `Active attendance policy does not allow ${channel.toLowerCase()} punch authentication.`,
      );
    }
  }

  private async findRequiredCheckpoints(policySetId: number | null) {
    if (!policySetId) {
      return [];
    }

    return this.checkpointRepository.find({
      where: {
        policySetId,
        status: AttendanceCheckpointStatusEnum.ACTIVE,
        isRequired: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  private isGeofenceRequired(
    policy: AttendancePolicy | null,
    requiredCheckpoints: AttendanceCheckpoint[],
  ): boolean {
    return Boolean(
      policy?.require_geo_fencing ||
      requiredCheckpoints.some(
        (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.GPS,
      ),
    );
  }

  private async validateTrustedMobileDevice(params: {
    policy: AttendancePolicy | null;
    companyId: number;
    employeeId: number;
    window: { start: Date; end: Date };
    deviceIdentifier?: string | null;
  }) {
    if (!params.policy || params.policy.allow_multi_device_login) {
      return;
    }

    const existingPunches = await this.punchRepo.findApprovedForEmployeeWindow({
      companyId: params.companyId,
      employeeId: params.employeeId,
      windowStart: params.window.start,
      windowEnd: params.window.end,
    });

    const trustedDeviceIdentifier = existingPunches
      .map((punch) => this.normalizeOptionalString(punch.deviceIdentifier))
      .find((value): value is string => Boolean(value));

    if (!trustedDeviceIdentifier) {
      return;
    }

    if (!params.deviceIdentifier) {
      throw new BadRequestException({
        message:
          'This attendance day already has a trusted mobile device. Device identifier is required.',
      });
    }

    if (trustedDeviceIdentifier !== params.deviceIdentifier) {
      throw new BadRequestException({
        message:
          'Multiple mobile devices are not allowed for the active attendance policy. Use the first trusted device used for this attendance day.',
      });
    }
  }

  private collectUnsupportedCheckpointValidationErrors(
    requiredCheckpoints: AttendanceCheckpoint[],
  ) {
    const errors: string[] = [];
    const unsupportedCheckpoints = requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.DEVICE,
    );

    if (unsupportedCheckpoints.length) {
      const checkpointLabels = unsupportedCheckpoints.map((checkpoint) =>
        checkpoint.type.toLowerCase(),
      );
      errors.push(
        `Active attendance checkpoints require ${checkpointLabels.join(
          ' and ',
        )} verification, which mobile punch cannot satisfy.`,
      );
    }

    return errors;
  }

  private getGpsCheckpointDistanceError(params: {
    geofenceId: number;
    requiredCheckpoints: AttendanceCheckpoint[];
    distanceMeters?: number;
  }) {
    const matchedGpsCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) =>
        checkpoint.type === AttendanceCheckpointTypeEnum.GPS &&
        (!checkpoint.geofenceId || checkpoint.geofenceId === params.geofenceId),
    );

    if (
      typeof params.distanceMeters === 'number' &&
      matchedGpsCheckpoints.length
    ) {
      const distanceMeters = params.distanceMeters;
      const satisfiesDistanceRule = matchedGpsCheckpoints.some(
        (checkpoint) =>
          checkpoint.maxDistanceMeters === null ||
          checkpoint.maxDistanceMeters === undefined ||
          distanceMeters <= checkpoint.maxDistanceMeters,
      );

      if (!satisfiesDistanceRule) {
        const strictestDistance = Math.min(
          ...matchedGpsCheckpoints
            .map((checkpoint) => checkpoint.maxDistanceMeters)
            .filter((value): value is number => value !== null),
        );

        return `GPS checkpoint distance exceeded. Maximum allowed distance is ${strictestDistance}m.`;
      }
    }

    return null;
  }

  private buildValidationFailureErrors(
    summary: string,
    attempts: Array<Record<string, any>>,
  ) {
    const detailMessages = Array.from(
      new Set(
        attempts
          .map((attempt) =>
            typeof attempt.message === 'string' ? attempt.message : null,
          )
          .filter((message): message is string => Boolean(message)),
      ),
    ).slice(0, 2);

    return [summary, ...detailMessages];
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private parseAuthenticationModes(authenticationModes: string) {
    return new Set(
      authenticationModes
        .split(',')
        .map((mode) => mode.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  private ensureReviewerCanReview(
    punch: Awaited<ReturnType<AttendanceMobilePunchesService['findOne']>>,
    reviewedBy: number,
  ) {
    if (punch.employee?.company_user_id === reviewedBy) {
      throw new ForbiddenException(
        'You cannot approve or reject your own mobile punch override request.',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
