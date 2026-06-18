import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { formatDateOnly } from '../../shared/hr.utils';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';

@Injectable()
export class AttendanceMobilePunchesService {
  constructor(
    private readonly punchRepo: AttendanceMobilePunchRepository,
    private readonly geofenceRepo: AttendanceGeofenceRepository,
    private readonly wifiRepo: AttendanceWifiNetworkRepository,
    private readonly geofenceDistanceService: GeofenceDistanceService,
    private readonly wifiValidator: WifiNetworkValidatorService,
    @InjectRepository(AttendancePolicy)
    private readonly policyRepository: Repository<AttendancePolicy>,
    @InjectRepository(AttendanceCheckpoint)
    private readonly checkpointRepository: Repository<AttendanceCheckpoint>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
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

    const attendanceDate = formatDateOnly(punchTime);
    this.assertEmployeeCanPunch(employee, attendanceDate);

    const ipAddress = params.dto.ipAddress || params.requestIp || null;
    const geofenceMatch = await this.matchGeofence({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      policy,
      requiredCheckpoints,
      latitude: params.dto.latitude,
      longitude: params.dto.longitude,
      accuracyMeters: params.dto.accuracyMeters,
    });

    const wifiMatch = await this.matchWifiNetwork({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      requiredCheckpoints,
      wifiSsid: params.dto.wifiSsid,
      wifiBssid: params.dto.wifiBssid,
      ipAddress,
    });

    const validationErrors = [
      ...this.collectUnsupportedCheckpointValidationErrors(requiredCheckpoints),
      ...geofenceMatch.errors,
      ...wifiMatch.errors,
    ];

    const validationPassed = validationErrors.length === 0;

    const hasOverrideReason = Boolean(params.dto.overrideReason?.trim());

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
      wifiSsid: params.dto.wifiSsid ?? null,
      wifiBssid: params.dto.wifiBssid ?? null,
      ipAddress,
      userAgent: params.userAgent ?? null,
      deviceIdentifier: params.dto.deviceIdentifier ?? null,
      validationStatus: status,
      validationMessage: validationPassed
        ? 'Mobile punch validation passed.'
        : validationErrors.join(' | '),
      geofenceValidationResult: geofenceMatch.validationResult,
      wifiValidationResult: wifiMatch.validationResult,
      isOverrideRequested: !validationPassed && hasOverrideReason,
      overrideReason: params.dto.overrideReason ?? null,
      deviceInfo: params.dto.deviceInfo ?? null,
      rawPayload: {
        ...params.dto,
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
    policy: AttendancePolicy | null;
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
    const geofenceRequired = Boolean(
      params.policy?.require_geo_fencing || gpsCheckpoints.length,
    );

    if (!geofenceRequired) {
      return {
        matchedGeofence: null,
        validation: null,
        validationResult: null,
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
            : 'Active attendance policy requires geofence validation, but no active geofence is configured for the employee branch.',
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
        checkpointGeofenceIds.length
          ? 'Location does not match any allowed geofence for the active attendance checkpoints.'
          : 'Location does not match any allowed geofence for mobile attendance.',
        attempts,
      ),
    };
  }

  private async matchWifiNetwork(params: {
    companyId: number;
    employeeBranchId?: number | null;
    requiredCheckpoints: AttendanceCheckpoint[];
    wifiSsid?: string;
    wifiBssid?: string;
    ipAddress?: string | null;
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
      params.wifiSsid?.trim() || params.wifiBssid?.trim() || params.ipAddress,
    );

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
        errors: wifiRequired
          ? ['No active WiFi network is configured for the active WiFi checkpoint(s).']
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
        ipAddress: params.ipAddress,
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
      errors: wifiRequired
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

  private assertEmployeeCanPunch(employee: Employee, attendanceDate: string) {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can create attendance punches.',
      );
    }

    if (employee.exit_date && attendanceDate > employee.exit_date) {
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
