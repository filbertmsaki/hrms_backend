import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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
import { AttendanceScheduleResolverService } from '../processing/attendance-schedule-resolver.service';
import { ResolvedAttendanceSchedule } from '../processing/entities/resolved-attendance-schedule.type';
import { AttendanceProcessedEventDirectionEnum } from '../processing/enums/attendance-processed-event-direction.enum';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';

@Injectable()
export class AttendanceMobilePunchesService {
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
    @InjectRepository(AttendancePolicy)
    private readonly policyRepository: Repository<AttendancePolicy>,
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
  ) {}

  async checkIn(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    dto: CreateAttendanceMobilePunchDto;
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    return this.createPunch({
      ...params,
      punchType: AttendancePunchTypeEnum.CHECK_IN,
    });
  }

  async checkOut(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    dto: CreateAttendanceMobilePunchDto;
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    return this.createPunch({
      ...params,
      punchType: AttendancePunchTypeEnum.CHECK_OUT,
    });
  }

  async createPunch(params: {
    companyId: number;
    authenticatedEmployeeId?: number | null;
    employeeId?: number | null;
    policySetId?: number | null;
    punchType: AttendancePunchTypeEnum;
    dto: CreateAttendanceMobilePunchDto;
    requestIp?: string | null;
    userAgent?: string | null;
  }) {
    const employee = await this.resolveEmployeeContext({
      companyId: params.companyId,
      requestedEmployeeId: params.employeeId ?? null,
      authenticatedEmployeeId: params.authenticatedEmployeeId ?? null,
    });
    const policy = await this.resolvePolicy(
      params.companyId,
      params.policySetId ?? null,
    );

    this.ensurePolicyAllowsMobilePunch(policy);

    const requiredCheckpoints = await this.findRequiredCheckpoints(
      policy?.id ?? null,
    );
    const punchTime = new Date();
    this.assertEmployeeCanPunch(employee);

    const wifiSsid = this.normalizeOptionalString(params.dto.wifiSsid);
    const wifiBssid = this.normalizeOptionalString(params.dto.wifiBssid);
    const deviceIdentifier = this.normalizeOptionalString(
      params.dto.deviceIdentifier,
    );
    const overrideReason = this.normalizeOptionalString(params.dto.overrideReason);
    const submittedIpAddress = this.normalizeOptionalString(params.dto.ipAddress);
    const ipAddress =
      submittedIpAddress ??
      this.normalizeOptionalString(params.requestIp) ??
      null;
    const geofenceMatch = await this.matchGeofence({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      requiredCheckpoints,
      latitude: params.dto.latitude,
      longitude: params.dto.longitude,
      accuracyMeters: params.dto.accuracyMeters,
    });

    if (geofenceMatch.errors.length) {
      throw new BadRequestException({
        message: geofenceMatch.errors[0],
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

    if (wifiMatch.errors.length) {
      throw new BadRequestException({
        message: wifiMatch.errors[0],
      });
    }

    const punchAvailability = await this.validateEmployeePunchAvailability({
      companyId: params.companyId,
      employee,
      punchType: params.punchType,
      punchTime,
    });
    const attendanceDate = punchAvailability.attendanceDate;

    const validationErrors =
      this.collectUnsupportedCheckpointValidationErrors(requiredCheckpoints);

    const validationPassed = validationErrors.length === 0;

    const hasOverrideReason = Boolean(overrideReason);

    if (!validationPassed && !hasOverrideReason) {
      throw new BadRequestException({
        message: 'Attendance punch rejected.',
        errors: validationErrors,
      });
    }

    const status = validationPassed
      ? AttendancePunchValidationStatusEnum.APPROVED
      : AttendancePunchValidationStatusEnum.PENDING_OVERRIDE;

    const punch = this.punchRepo.createEntity({
      companyId: params.companyId,
      branchId: employee.primary_branch_id ?? null,
      employeeId: employee.id,
      policySetId: policy?.id ?? null,
      geofenceId: geofenceMatch.matchedGeofence?.id ?? null,
      wifiNetworkId: wifiMatch.matchedWifiNetwork?.id ?? null,
      punchType: params.punchType,
      source: AttendancePunchSourceEnum.MOBILE,
      punchTime,
      attendanceDate,
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
      validationMessage: validationPassed
        ? 'Mobile punch validation passed.'
        : validationErrors.join(' | '),
      geofenceValidationResult: geofenceMatch.validationResult,
      wifiValidationResult: wifiMatch.validationResult,
      isOverrideRequested: !validationPassed && hasOverrideReason,
      overrideReason: overrideReason ?? null,
      deviceInfo: params.dto.deviceInfo ?? null,
      rawPayload: {
        ...params.dto,
        wifiSsid,
        wifiBssid,
        ipAddress,
        deviceIdentifier,
        overrideReason,
        requestIp: params.requestIp,
        userAgent: params.userAgent,
      },
      isProcessed: false,
      processedEventId: null,
    });

    const saved = await this.punchRepo.save(punch);

    return {
      message: validationPassed
        ? 'Attendance punch saved successfully.'
        : 'Attendance punch saved as pending override.',
      punch: saved,
    };
  }

  async findAll(companyId: number, query: AttendanceMobilePunchQueryDto) {
    return this.punchRepo.findPaginated(companyId, query);
  }

  async findOne(companyId: number, id: number) {
    const punch = await this.punchRepo.findOneById(companyId, id);

    if (!punch) {
      throw new NotFoundException('Attendance mobile punch not found.');
    }

    return punch;
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

    return this.punchRepo.save(punch);
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
          message: 'Configured geofence does not belong to the employee branch.',
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

      if (geofence.type !== AttendanceGeofenceTypeEnum.CIRCLE) {
        attempts.push({
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          valid: false,
          message: 'Only circle geofence is currently supported for mobile punch.',
        });
        continue;
      }

      const validation = this.geofenceDistanceService.validateCircleGeofence({
        officeLatitude: Number(geofence.latitude),
        officeLongitude: Number(geofence.longitude),
        userLatitude: params.latitude,
        userLongitude: params.longitude,
        radiusMeters: geofence.radiusMeters,
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
          message: 'Configured WiFi network does not belong to the employee branch.',
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
      errors: wifiRequired || hasWifiDetails
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
        ): candidate is typeof candidate & { window: { start: Date; end: Date } } =>
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
  }): Promise<{ hasCheckIn: boolean; hasCheckOut: boolean }> {
    const employeeNo = this.normalizeOptionalString(params.employee.employee_no);
    const [mobilePunches, processedEvents, dailySummary, rawLogs] =
      await Promise.all([
        this.punchRepo.findApprovedForEmployeeWindow({
          companyId: params.companyId,
          employeeId: params.employee.id,
          windowStart: params.window.start,
          windowEnd: params.window.end,
        }),
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
        this.inferRawLogDirection(log) === AttendanceProcessedEventDirectionEnum.IN,
    );
    const hasRawCheckOut = rawLogs.some(
      (log) =>
        this.inferRawLogDirection(log) === AttendanceProcessedEventDirectionEnum.OUT,
    );

    return {
      hasCheckIn:
        hasMobileCheckIn ||
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

    if (attendanceDate && employee.exit_date && attendanceDate > employee.exit_date) {
      throw new BadRequestException(
        'Attendance punch date cannot be after the employee exit date.',
      );
    }
  }

  private async resolvePolicy(companyId: number, policySetId: number | null) {
    if (policySetId) {
      const policy = await this.policyRepository.findOne({
        where: {
          id: policySetId,
          company_id: companyId,
        },
      });

      if (!policy) {
        throw new BadRequestException(
          'Configured attendance policy does not belong to the active company.',
        );
      }

      return policy;
    }

    return this.policyRepository.findOne({
      where: {
        company_id: companyId,
        is_active: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  private ensurePolicyAllowsMobilePunch(policy: AttendancePolicy | null) {
    if (!policy) {
      return;
    }

    const authenticationModes = this.parseAuthenticationModes(
      policy.authentication_modes,
    );

    if (
      authenticationModes.size &&
      !authenticationModes.has('MOBILE_APP') &&
      !authenticationModes.has('MOBILE') &&
      !authenticationModes.has('WEB')
    ) {
      throw new BadRequestException(
        'Active attendance policy does not allow mobile punch authentication.',
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

  private collectUnsupportedCheckpointValidationErrors(
    requiredCheckpoints: AttendanceCheckpoint[],
  ) {
    const errors: string[] = [];
    const unsupportedCheckpoints = requiredCheckpoints.filter(
      (checkpoint) =>
        checkpoint.type === AttendanceCheckpointTypeEnum.DEVICE ||
        checkpoint.type === AttendanceCheckpointTypeEnum.QR,
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

    if (typeof params.distanceMeters === 'number' && matchedGpsCheckpoints.length) {
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
}
