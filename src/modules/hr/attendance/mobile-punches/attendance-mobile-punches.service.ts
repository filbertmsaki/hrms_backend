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
    const validationErrors = this.collectCheckpointValidationErrors({
      dto: params.dto,
      policy,
      requiredCheckpoints,
    });

    const geofenceValidation = await this.validateGeofenceIfProvided({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      geofenceId: params.dto.geofenceId,
      latitude: params.dto.latitude,
      longitude: params.dto.longitude,
      accuracyMeters: params.dto.accuracyMeters,
    });

    const wifiValidation = await this.validateWifiIfProvided({
      companyId: params.companyId,
      employeeBranchId: employee.primary_branch_id ?? null,
      wifiNetworkId: params.dto.wifiNetworkId,
      wifiSsid: params.dto.wifiSsid,
      wifiBssid: params.dto.wifiBssid,
      ipAddress,
    });

    validationErrors.push(
      ...this.collectCheckpointOutcomeErrors({
        dto: params.dto,
        requiredCheckpoints,
        geofenceValidation,
        wifiValidation,
      }),
      ...(geofenceValidation?.valid === false
        ? [geofenceValidation.message]
        : []),
      ...(wifiValidation?.valid === false ? [wifiValidation.message] : []),
    );

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
      geofenceId: params.dto.geofenceId ?? null,
      wifiNetworkId: params.dto.wifiNetworkId ?? null,
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
        geofenceValidation?.distanceMeters !== undefined
          ? String(geofenceValidation.distanceMeters)
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
      geofenceValidationResult: geofenceValidation ?? null,
      wifiValidationResult: wifiValidation ?? null,
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

  private async validateGeofenceIfProvided(params: {
    companyId: number;
    employeeBranchId?: number | null;
    geofenceId?: number;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  }): Promise<{
    valid: boolean;
    message: string;
    distanceMeters?: number;
  } | null> {
    if (!params.geofenceId) {
      return null;
    }

    const geofence = await this.geofenceRepo.findActiveById(
      params.companyId,
      params.geofenceId,
    );

    if (!geofence) {
      return {
        valid: false,
        message: 'Configured geofence is not active or does not exist.',
      };
    }

    if (
      params.employeeBranchId &&
      geofence.branchId &&
      geofence.branchId !== params.employeeBranchId
    ) {
      return {
        valid: false,
        message: 'Configured geofence does not belong to the employee branch.',
      };
    }

    if (geofence.status !== AttendanceGeofenceStatusEnum.ACTIVE) {
      return {
        valid: false,
        message: 'Configured geofence is inactive.',
      };
    }

    if (geofence.type !== AttendanceGeofenceTypeEnum.CIRCLE) {
      return {
        valid: false,
        message:
          'Only circle geofence is currently supported for mobile punch.',
      };
    }

    return this.geofenceDistanceService.validateCircleGeofence({
      officeLatitude: Number(geofence.latitude),
      officeLongitude: Number(geofence.longitude),
      userLatitude: params.latitude,
      userLongitude: params.longitude,
      radiusMeters: geofence.radiusMeters,
      accuracyMeters: params.accuracyMeters,
      allowedAccuracyMeters: geofence.allowedAccuracyMeters,
      strictAccuracy: geofence.strictAccuracy,
    });
  }

  private async validateWifiIfProvided(params: {
    companyId: number;
    employeeBranchId?: number | null;
    wifiNetworkId?: number;
    wifiSsid?: string;
    wifiBssid?: string;
    ipAddress?: string | null;
  }): Promise<{
    valid: boolean;
    message: string;
  } | null> {
    if (!params.wifiNetworkId) {
      return null;
    }

    const wifiNetwork = await this.wifiRepo.findActiveById(
      params.companyId,
      params.wifiNetworkId,
    );

    if (!wifiNetwork) {
      return {
        valid: false,
        message: 'Configured WiFi network is not active or does not exist.',
      };
    }

    if (
      params.employeeBranchId &&
      wifiNetwork.branchId &&
      wifiNetwork.branchId !== params.employeeBranchId
    ) {
      return {
        valid: false,
        message:
          'Configured WiFi network does not belong to the employee branch.',
      };
    }

    return this.wifiValidator.validate({
      wifiNetwork,
      ssid: params.wifiSsid,
      bssid: params.wifiBssid,
      ipAddress: params.ipAddress,
    });
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

  private collectCheckpointValidationErrors(params: {
    dto: CreateAttendanceMobilePunchDto;
    policy: AttendancePolicy | null;
    requiredCheckpoints: AttendanceCheckpoint[];
  }) {
    const errors: string[] = [];
    const gpsCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.GPS,
    );
    const wifiCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.WIFI,
    );
    const unsupportedCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) =>
        checkpoint.type === AttendanceCheckpointTypeEnum.DEVICE ||
        checkpoint.type === AttendanceCheckpointTypeEnum.QR,
    );

    if (params.policy?.require_geo_fencing && !params.dto.geofenceId) {
      errors.push('Active attendance policy requires geofence validation.');
    }

    if (gpsCheckpoints.length && !params.dto.geofenceId) {
      errors.push('Active GPS checkpoint requires a geofence selection.');
    }

    if (wifiCheckpoints.length && !params.dto.wifiNetworkId) {
      errors.push('Active WiFi checkpoint requires a WiFi network selection.');
    }

    const allowedGeofenceIds = gpsCheckpoints
      .map((checkpoint) => checkpoint.geofenceId)
      .filter((value): value is number => Boolean(value));
    const allowedWifiNetworkIds = wifiCheckpoints
      .map((checkpoint) => checkpoint.wifiNetworkId)
      .filter((value): value is number => Boolean(value));

    if (
      allowedGeofenceIds.length &&
      params.dto.geofenceId &&
      !allowedGeofenceIds.includes(params.dto.geofenceId)
    ) {
      errors.push(
        'Selected geofence does not match the active GPS checkpoint configuration.',
      );
    }

    if (
      allowedWifiNetworkIds.length &&
      params.dto.wifiNetworkId &&
      !allowedWifiNetworkIds.includes(params.dto.wifiNetworkId)
    ) {
      errors.push(
        'Selected WiFi network does not match the active WiFi checkpoint configuration.',
      );
    }

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

  private collectCheckpointOutcomeErrors(params: {
    dto: CreateAttendanceMobilePunchDto;
    requiredCheckpoints: AttendanceCheckpoint[];
    geofenceValidation: {
      valid: boolean;
      message: string;
      distanceMeters?: number;
    } | null;
    wifiValidation: {
      valid: boolean;
      message: string;
    } | null;
  }) {
    const errors: string[] = [];
    const matchedGpsCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) =>
        checkpoint.type === AttendanceCheckpointTypeEnum.GPS &&
        (!checkpoint.geofenceId ||
          checkpoint.geofenceId === params.dto.geofenceId),
    );

    if (
      params.geofenceValidation?.valid &&
      typeof params.geofenceValidation.distanceMeters === 'number' &&
      matchedGpsCheckpoints.length
    ) {
      const satisfiesDistanceRule = matchedGpsCheckpoints.some(
        (checkpoint) =>
          checkpoint.maxDistanceMeters === null ||
          checkpoint.maxDistanceMeters === undefined ||
          params.geofenceValidation!.distanceMeters! <=
            checkpoint.maxDistanceMeters,
      );

      if (!satisfiesDistanceRule) {
        const strictestDistance = Math.min(
          ...matchedGpsCheckpoints
            .map((checkpoint) => checkpoint.maxDistanceMeters)
            .filter((value): value is number => value !== null),
        );

        errors.push(
          `GPS checkpoint distance exceeded. Maximum allowed distance is ${strictestDistance}m.`,
        );
      }
    }

    return errors;
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
