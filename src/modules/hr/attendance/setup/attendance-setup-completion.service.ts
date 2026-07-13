import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceCheckpoint } from '../checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceCheckpointStatusEnum } from '../checkpoints/enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../checkpoints/enums/attendance-checkpoint-type.enum';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendanceGeofenceStatusEnum } from '../geofences/enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../geofences/enums/attendance-geofence-type.enum';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkStatusEnum } from '../wifi-networks/enums/attendance-wifi-network-status.enum';
import { HolidayGroup } from '../holidays/entities/holiday-group.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../timetable/timetables/enums/timetable-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';

type SetupStatusItem = {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AttendanceSetupCompletionService {
  constructor(
    @InjectRepository(AttendancePolicy)
    private readonly policyRepository: Repository<AttendancePolicy>,

    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,

    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,

    @InjectRepository(AttendanceCheckpoint)
    private readonly checkpointRepository: Repository<AttendanceCheckpoint>,

    @InjectRepository(AttendanceGeofence)
    private readonly geofenceRepository: Repository<AttendanceGeofence>,

    @InjectRepository(AttendanceWifiNetwork)
    private readonly wifiNetworkRepository: Repository<AttendanceWifiNetwork>,

    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
  ) {}

  async getStatus(companyId: number) {
    const completed: SetupStatusItem[] = [];
    const missing: SetupStatusItem[] = [];
    const warnings: SetupStatusItem[] = [];

    const activePolicy = await this.policyRepository.findOne({
      where: {
        company_id: companyId,
        is_active: true,
      },
      order: {
        id: 'ASC',
      },
    });

    if (!activePolicy) {
      missing.push({
        code: 'ACTIVE_ATTENDANCE_POLICY_MISSING',
        message: 'No active attendance policy is configured.',
        severity: 'ERROR',
      });

      return this.buildResponse({
        companyId,
        activePolicy: null,
        completed,
        missing,
        warnings,
        checkpointSummary: {
          totalActive: 0,
          requiredActive: 0,
          types: [],
        },
      });
    }

    completed.push({
      code: 'ACTIVE_ATTENDANCE_POLICY_FOUND',
      message: `Active attendance policy configured: ${activePolicy.name}.`,
      severity: 'INFO',
      metadata: {
        policyId: activePolicy.id,
      },
    });

    this.checkCalculationPolicy(activePolicy, completed, missing, warnings);

    const [defaultTimetableCount, employeeTimetableCount, activeCheckpoints] =
      await Promise.all([
        this.timetableRepository.count({
          where: {
            companyId,
            status: TimetableStatusEnum.ACTIVE,
            isDefault: true,
          },
        }),
        this.employeeTimetableRepository.count({
          where: {
            companyId,
            status: EmployeeTimetableStatusEnum.ACTIVE,
          },
        }),
        this.checkpointRepository.find({
          where: {
            policySetId: activePolicy.id,
            status: AttendanceCheckpointStatusEnum.ACTIVE,
          },
          order: {
            id: 'ASC',
          },
        }),
      ]);

    if (defaultTimetableCount > 0 || employeeTimetableCount > 0) {
      completed.push({
        code: 'SCHEDULE_SOURCE_FOUND',
        message:
          defaultTimetableCount > 0
            ? 'Default active timetable is configured.'
            : 'Employee timetable assignments are configured.',
        severity: 'INFO',
        metadata: {
          defaultTimetableCount,
          employeeTimetableCount,
        },
      });
    } else {
      missing.push({
        code: 'SCHEDULE_SOURCE_MISSING',
        message:
          'No default timetable or employee timetable assignment is configured.',
        severity: 'ERROR',
      });
    }

    const requiredCheckpoints = activeCheckpoints.filter(
      (checkpoint) => checkpoint.isRequired,
    );

    const checkpointSummary = {
      totalActive: activeCheckpoints.length,
      requiredActive: requiredCheckpoints.length,
      types: Array.from(
        new Set(activeCheckpoints.map((checkpoint) => checkpoint.type)),
      ),
    };

    if (activeCheckpoints.length > 0) {
      completed.push({
        code: 'ACTIVE_CHECKPOINT_FOUND',
        message: 'At least one active attendance checkpoint is configured.',
        severity: 'INFO',
        metadata: checkpointSummary,
      });
    } else {
      missing.push({
        code: 'ACTIVE_CHECKPOINT_MISSING',
        message:
          'No active attendance checkpoint is configured for the active policy.',
        severity: 'ERROR',
      });
    }

    this.checkCheckpointClarity(requiredCheckpoints, missing, warnings);

    await this.checkGeofenceRequirement({
      companyId,
      policy: activePolicy,
      requiredCheckpoints,
      completed,
      missing,
      warnings,
    });

    await this.checkWifiRequirement({
      companyId,
      requiredCheckpoints,
      completed,
      missing,
    });

    await this.checkHolidayRequirement({
      companyId,
      policy: activePolicy,
      completed,
      missing,
    });

    return this.buildResponse({
      companyId,
      activePolicy,
      completed,
      missing,
      warnings,
      checkpointSummary,
    });
  }

  private checkCalculationPolicy(
    policy: AttendancePolicy,
    completed: SetupStatusItem[],
    missing: SetupStatusItem[],
    warnings: SetupStatusItem[],
  ) {
    if (!policy.auto_calculate_attendance) {
      warnings.push({
        code: 'AUTO_CALCULATION_DISABLED',
        message:
          'Attendance auto calculation is disabled. Attendance will not process automatically until it is enabled.',
        severity: 'WARNING',
      });
    }

    if (
      policy.calculation_time &&
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(policy.calculation_time)
    ) {
      completed.push({
        code: 'CALCULATION_TIME_CONFIGURED',
        message: `Attendance calculation time configured: ${policy.calculation_time}.`,
        severity: 'INFO',
      });
    } else {
      missing.push({
        code: 'CALCULATION_TIME_MISSING',
        message: 'Attendance calculation time is missing or invalid.',
        severity: 'ERROR',
      });
    }
  }

  private checkCheckpointClarity(
    requiredCheckpoints: AttendanceCheckpoint[],
    missing: SetupStatusItem[],
    warnings: SetupStatusItem[],
  ) {
    for (const checkpoint of requiredCheckpoints) {
      if (
        checkpoint.type === AttendanceCheckpointTypeEnum.DEVICE &&
        !checkpoint.deviceId
      ) {
        missing.push({
          code: 'DEVICE_CHECKPOINT_DEVICE_MISSING',
          message: `Required device checkpoint "${checkpoint.name}" has no device assigned.`,
          severity: 'ERROR',
          metadata: {
            checkpointId: checkpoint.id,
          },
        });
      }

      if (
        checkpoint.type === AttendanceCheckpointTypeEnum.GPS &&
        !checkpoint.geofenceId
      ) {
        missing.push({
          code: 'GPS_CHECKPOINT_GEOFENCE_MISSING',
          message: `Required GPS checkpoint "${checkpoint.name}" has no geofence assigned.`,
          severity: 'ERROR',
          metadata: {
            checkpointId: checkpoint.id,
          },
        });
      }

      if (
        checkpoint.type === AttendanceCheckpointTypeEnum.WIFI &&
        !checkpoint.wifiNetworkId
      ) {
        missing.push({
          code: 'WIFI_CHECKPOINT_NETWORK_MISSING',
          message: `Required WiFi checkpoint "${checkpoint.name}" has no WiFi network assigned.`,
          severity: 'ERROR',
          metadata: {
            checkpointId: checkpoint.id,
          },
        });
      }

      if (checkpoint.type === AttendanceCheckpointTypeEnum.QR) {
        warnings.push({
          code: 'QR_CHECKPOINT_NOT_SUPPORTED_IN_PHASE_ONE',
          message: `QR checkpoint "${checkpoint.name}" exists, but QR validation is disabled in Phase One.`,
          severity: 'WARNING',
          metadata: {
            checkpointId: checkpoint.id,
          },
        });
      }

      if (checkpoint.type === AttendanceCheckpointTypeEnum.DEVICE) {
        warnings.push({
          code: 'DEVICE_CHECKPOINT_NOT_FOR_MOBILE',
          message: `Device checkpoint "${checkpoint.name}" is valid for biometric/device logs, but mobile punch cannot satisfy it.`,
          severity: 'WARNING',
          metadata: {
            checkpointId: checkpoint.id,
          },
        });
      }
    }
  }

  private async checkGeofenceRequirement(params: {
    companyId: number;
    policy: AttendancePolicy;
    requiredCheckpoints: AttendanceCheckpoint[];
    completed: SetupStatusItem[];
    missing: SetupStatusItem[];
    warnings: SetupStatusItem[];
  }) {
    const gpsRequired =
      params.policy.require_geo_fencing ||
      params.requiredCheckpoints.some(
        (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.GPS,
      );

    if (!gpsRequired) {
      params.completed.push({
        code: 'GPS_GEOFENCE_NOT_REQUIRED',
        message:
          'GPS/geofence validation is not required by the active policy.',
        severity: 'INFO',
      });
      return;
    }

    const linkedGeofenceIds = Array.from(
      new Set(
        params.requiredCheckpoints
          .filter(
            (checkpoint) =>
              checkpoint.type === AttendanceCheckpointTypeEnum.GPS &&
              checkpoint.geofenceId,
          )
          .map((checkpoint) => checkpoint.geofenceId!),
      ),
    );

    const qb = this.geofenceRepository
      .createQueryBuilder('geofence')
      .where('geofence.company_id = :companyId', {
        companyId: params.companyId,
      })
      .andWhere('geofence.status = :status', {
        status: AttendanceGeofenceStatusEnum.ACTIVE,
      })
      .andWhere('geofence.type = :type', {
        type: AttendanceGeofenceTypeEnum.CIRCLE,
      });

    if (linkedGeofenceIds.length > 0) {
      qb.andWhere('geofence.id IN (:...linkedGeofenceIds)', {
        linkedGeofenceIds,
      });
    }

    const activeCircleCount = await qb.getCount();

    if (activeCircleCount > 0) {
      params.completed.push({
        code: 'ACTIVE_CIRCLE_GEOFENCE_FOUND',
        message:
          'Active circle geofence is configured for GPS attendance validation.',
        severity: 'INFO',
        metadata: {
          activeCircleCount,
        },
      });
    } else {
      params.missing.push({
        code: 'ACTIVE_CIRCLE_GEOFENCE_MISSING',
        message:
          'GPS/geofence validation is required, but no active circle geofence is configured.',
        severity: 'ERROR',
      });
    }

    const polygonCount = await this.geofenceRepository.count({
      where: {
        companyId: params.companyId,
        status: AttendanceGeofenceStatusEnum.ACTIVE,
        type: AttendanceGeofenceTypeEnum.POLYGON,
      },
    });

    if (polygonCount > 0) {
      params.warnings.push({
        code: 'POLYGON_GEOFENCE_DISABLED_IN_PHASE_ONE',
        message:
          'Active polygon geofences exist, but Phase One only supports circle geofence validation.',
        severity: 'WARNING',
        metadata: {
          polygonCount,
        },
      });
    }
  }

  private async checkWifiRequirement(params: {
    companyId: number;
    requiredCheckpoints: AttendanceCheckpoint[];
    completed: SetupStatusItem[];
    missing: SetupStatusItem[];
  }) {
    const wifiCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.WIFI,
    );

    if (wifiCheckpoints.length === 0) {
      params.completed.push({
        code: 'WIFI_NOT_REQUIRED',
        message:
          'WiFi validation is not required by the active policy checkpoints.',
        severity: 'INFO',
      });
      return;
    }

    const linkedWifiIds = Array.from(
      new Set(
        wifiCheckpoints
          .map((checkpoint) => checkpoint.wifiNetworkId)
          .filter((value): value is number => Boolean(value)),
      ),
    );

    const qb = this.wifiNetworkRepository
      .createQueryBuilder('wifi')
      .where('wifi.company_id = :companyId', {
        companyId: params.companyId,
      })
      .andWhere('wifi.status = :status', {
        status: AttendanceWifiNetworkStatusEnum.ACTIVE,
      })
      .andWhere('wifi.allow_mobile_attendance = :allowMobileAttendance', {
        allowMobileAttendance: true,
      });

    if (linkedWifiIds.length > 0) {
      qb.andWhere('wifi.id IN (:...linkedWifiIds)', {
        linkedWifiIds,
      });
    }

    const activeWifiCount = await qb.getCount();

    if (activeWifiCount > 0) {
      params.completed.push({
        code: 'ACTIVE_WIFI_NETWORK_FOUND',
        message: 'Active WiFi network is configured for attendance validation.',
        severity: 'INFO',
        metadata: {
          activeWifiCount,
        },
      });
    } else {
      params.missing.push({
        code: 'ACTIVE_WIFI_NETWORK_MISSING',
        message:
          'WiFi validation is required, but no active attendance WiFi network is configured.',
        severity: 'ERROR',
      });
    }
  }

  private async checkHolidayRequirement(params: {
    companyId: number;
    policy: AttendancePolicy;
    completed: SetupStatusItem[];
    missing: SetupStatusItem[];
  }) {
    if (
      params.policy.holiday_policy_mode === AttendanceHolidayPolicyModeEnum.OFF
    ) {
      params.completed.push({
        code: 'HOLIDAY_RULES_DISABLED',
        message: 'Holiday rules are disabled by the active policy.',
        severity: 'INFO',
      });
      return;
    }

    const holidayGroupCount = await this.holidayGroupRepository.count({
      where: {
        companyId: params.companyId,
      },
    });

    if (holidayGroupCount > 0) {
      params.completed.push({
        code: 'HOLIDAY_GROUP_FOUND',
        message: 'Holiday group is configured.',
        severity: 'INFO',
      });
    } else {
      params.missing.push({
        code: 'HOLIDAY_GROUP_MISSING',
        message:
          'Holiday rules are enabled, but no holiday group is configured.',
        severity: 'ERROR',
      });
    }
  }

  private buildResponse(params: {
    companyId: number;
    activePolicy: AttendancePolicy | null;
    completed: SetupStatusItem[];
    missing: SetupStatusItem[];
    warnings: SetupStatusItem[];
    checkpointSummary: {
      totalActive: number;
      requiredActive: number;
      types: AttendanceCheckpointTypeEnum[];
    };
  }) {
    return {
      companyId: params.companyId,
      isComplete: params.missing.length === 0,
      activePolicy: params.activePolicy
        ? {
            id: params.activePolicy.id,
            name: params.activePolicy.name,
            calculationTime: params.activePolicy.calculation_time,
            autoCalculateAttendance:
              params.activePolicy.auto_calculate_attendance,
            requireGeoFencing: params.activePolicy.require_geo_fencing,
            allowMultiDeviceLogin: params.activePolicy.allow_multi_device_login,
            holidayPolicyMode: params.activePolicy.holiday_policy_mode,
            roundingMode: params.activePolicy.rounding_mode,
            maxMissingPunchAllowed:
              params.activePolicy.max_missing_punch_allowed,
          }
        : null,
      checkpointSummary: params.checkpointSummary,
      completed: params.completed.map((item) => item.message),
      missing: params.missing.map((item) => item.message),
      warnings: params.warnings.map((item) => item.message),
      details: {
        completed: params.completed,
        missing: params.missing,
        warnings: params.warnings,
      },
    };
  }
}
