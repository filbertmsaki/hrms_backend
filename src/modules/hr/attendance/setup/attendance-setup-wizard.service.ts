import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAttendanceSetupWizardDto } from './dtos/create-attendance-setup-wizard.dto';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceCheckpoint } from '../checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceCheckpointTypeEnum } from '../checkpoints/enums/attendance-checkpoint-type.enum';
import { AttendanceCheckpointStatusEnum } from '../checkpoints/enums/attendance-checkpoint-status.enum';
import { AttendanceGeofence } from '../geofences/entities/attendance-geofence.entity';
import { AttendanceGeofenceTypeEnum } from '../geofences/enums/attendance-geofence-type.enum';
import { AttendanceGeofenceStatusEnum } from '../geofences/enums/attendance-geofence-status.enum';
import { AttendanceWifiNetwork } from '../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkStatusEnum } from '../wifi-networks/enums/attendance-wifi-network-status.enum';
import { HolidayGroup } from '../holidays/entities/holiday-group.entity';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceSetupCompletionService } from './attendance-setup-completion.service';

@Injectable()
export class AttendanceSetupWizardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly setupCompletionService: AttendanceSetupCompletionService,
  ) {}

  async createSetup(companyId: number, dto: CreateAttendanceSetupWizardDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const policyRepo = manager.getRepository(AttendancePolicy);
      const geofenceRepo = manager.getRepository(AttendanceGeofence);
      const wifiRepo = manager.getRepository(AttendanceWifiNetwork);
      const holidayGroupRepo = manager.getRepository(HolidayGroup);
      const checkpointRepo = manager.getRepository(AttendanceCheckpoint);

      const policyName = dto.policy.name?.trim();
      if (!policyName) {
        throw new BadRequestException('Attendance policy name is required.');
      }

      const existingPolicy = await policyRepo.findOne({
        where: {
          company_id: companyId,
          name: policyName,
        },
        select: ['id'],
      });

      if (existingPolicy) {
        throw new BadRequestException(
          `Attendance policy "${policyName}" already exists for this company.`,
        );
      }

      if (dto.policy.is_active ?? true) {
        await policyRepo.update(
          {
            company_id: companyId,
            is_active: true,
          },
          {
            is_active: false,
          },
        );
      }

      const policy = await policyRepo.save(
        policyRepo.create({
          ...dto.policy,
          company_id: companyId,
          name: policyName,
          is_active: dto.policy.is_active ?? true,
          calculation_time: dto.policy.calculation_time ?? '23:59:00',
          auto_calculate_attendance:
            dto.policy.auto_calculate_attendance ?? true,
          overtime_rate_multiplier:
            dto.policy.overtime_rate_multiplier?.toFixed(2) ?? '1.00',
          holiday_overtime_multiplier:
            dto.policy.holiday_overtime_multiplier?.toFixed(2) ?? '1.00',
          weekend_overtime_multiplier:
            dto.policy.weekend_overtime_multiplier?.toFixed(2) ?? '1.00',
        }),
      );

      let geofence: AttendanceGeofence | null = null;

      if (dto.geofence) {
        const geofenceType =
          dto.geofence.type ?? AttendanceGeofenceTypeEnum.CIRCLE;

        if (geofenceType === AttendanceGeofenceTypeEnum.POLYGON) {
          throw new BadRequestException(
            'Polygon geofence is disabled in Phase One. Use CIRCLE geofence.',
          );
        }

        if (
          dto.geofence.latitude === undefined ||
          dto.geofence.longitude === undefined ||
          dto.geofence.radiusMeters === undefined
        ) {
          throw new BadRequestException(
            'latitude, longitude and radiusMeters are required for circle geofence.',
          );
        }

        geofence = await geofenceRepo.save(
          geofenceRepo.create({
            companyId,
            branchId: dto.geofence.branchId ?? null,
            name: dto.geofence.name.trim(),
            description: dto.geofence.description ?? null,
            type: AttendanceGeofenceTypeEnum.CIRCLE,
            latitude: String(dto.geofence.latitude),
            longitude: String(dto.geofence.longitude),
            radiusMeters: dto.geofence.radiusMeters,
            allowedAccuracyMeters: dto.geofence.allowedAccuracyMeters ?? 50,
            strictAccuracy: dto.geofence.strictAccuracy ?? false,
            polygonCoordinates: null,
            status: dto.geofence.status ?? AttendanceGeofenceStatusEnum.ACTIVE,
          }),
        );
      }

      let wifiNetwork: AttendanceWifiNetwork | null = null;

      if (dto.wifiNetwork) {
        wifiNetwork = await wifiRepo.save(
          wifiRepo.create({
            companyId,
            branchId: dto.wifiNetwork.branchId ?? null,
            name: dto.wifiNetwork.name.trim(),
            description: dto.wifiNetwork.description ?? null,
            ssid: dto.wifiNetwork.ssid.trim(),
            bssid: dto.wifiNetwork.bssid ?? null,
            allowedIpCidrs: dto.wifiNetwork.allowedIpCidrs ?? null,
            securityType: dto.wifiNetwork.securityType,
            requireSsidMatch: dto.wifiNetwork.requireSsidMatch ?? true,
            requireBssidMatch: dto.wifiNetwork.requireBssidMatch ?? false,
            requireIpMatch: dto.wifiNetwork.requireIpMatch ?? false,
            allowMobileAttendance:
              dto.wifiNetwork.allowMobileAttendance ?? true,
            metadata: dto.wifiNetwork.metadata ?? null,
            status:
              dto.wifiNetwork.status ?? AttendanceWifiNetworkStatusEnum.ACTIVE,
          }),
        );
      }

      let holidayGroup: HolidayGroup | null = null;

      if (
        dto.holidayGroup ||
        policy.holiday_policy_mode !== AttendanceHolidayPolicyModeEnum.OFF
      ) {
        holidayGroup = await holidayGroupRepo.save(
          holidayGroupRepo.create({
            companyId,
            name:
              dto.holidayGroup?.name?.trim() ?? `${policy.name} Holiday Group`,
            description: dto.holidayGroup?.description ?? null,
          }),
        );
      }

      const checkpointsToCreate = [...(dto.checkpoints ?? [])];

      if (dto.autoCreateGpsCheckpoint ?? Boolean(geofence)) {
        if (geofence) {
          checkpointsToCreate.push({
            name: 'GPS / Geofence',
            type: AttendanceCheckpointTypeEnum.GPS,
            geofence_id: geofence.id,
            is_required: true,
            allow_override: false,
            max_distance_meters: geofence.radiusMeters,
            strict_mode: false,
            status: AttendanceCheckpointStatusEnum.ACTIVE,
          });
        }
      }

      if (dto.autoCreateWifiCheckpoint ?? Boolean(wifiNetwork)) {
        if (wifiNetwork) {
          checkpointsToCreate.push({
            name: 'Office WiFi',
            type: AttendanceCheckpointTypeEnum.WIFI,
            wifi_network_id: wifiNetwork.id,
            is_required: true,
            allow_override: false,
            strict_mode: false,
            status: AttendanceCheckpointStatusEnum.ACTIVE,
          });
        }
      }

      const checkpoints: AttendanceCheckpoint[] = [];

      for (const checkpointDto of checkpointsToCreate) {
        if (checkpointDto.type === AttendanceCheckpointTypeEnum.QR) {
          throw new BadRequestException(
            'QR checkpoint is disabled in Phase One. Use GPS, WIFI, DEVICE or MANUAL.',
          );
        }

        if (
          checkpointDto.type === AttendanceCheckpointTypeEnum.GPS &&
          !checkpointDto.geofence_id
        ) {
          throw new BadRequestException(
            'geofence_id is required for GPS checkpoint.',
          );
        }

        if (
          checkpointDto.type === AttendanceCheckpointTypeEnum.WIFI &&
          !checkpointDto.wifi_network_id
        ) {
          throw new BadRequestException(
            'wifi_network_id is required for WIFI checkpoint.',
          );
        }

        if (
          checkpointDto.type === AttendanceCheckpointTypeEnum.DEVICE &&
          !checkpointDto.device_id
        ) {
          throw new BadRequestException(
            'device_id is required for DEVICE checkpoint.',
          );
        }

        checkpoints.push(
          await checkpointRepo.save(
            checkpointRepo.create({
              policySetId: policy.id,
              name: checkpointDto.name.trim(),
              type: checkpointDto.type,
              deviceId: checkpointDto.device_id ?? null,
              geofenceId: checkpointDto.geofence_id ?? null,
              wifiNetworkId: checkpointDto.wifi_network_id ?? null,
              isRequired: checkpointDto.is_required ?? true,
              allowOverride: checkpointDto.allow_override ?? false,
              maxDistanceMeters: checkpointDto.max_distance_meters ?? null,
              strictMode: checkpointDto.strict_mode ?? false,
              status:
                checkpointDto.status ?? AttendanceCheckpointStatusEnum.ACTIVE,
            }),
          ),
        );
      }

      return {
        policy,
        geofence,
        wifiNetwork,
        holidayGroup,
        checkpoints,
      };
    });

    return {
      message: 'Attendance setup created successfully.',
      data: {
        policyId: result.policy.id,
        geofenceId: result.geofence?.id ?? null,
        wifiNetworkId: result.wifiNetwork?.id ?? null,
        holidayGroupId: result.holidayGroup?.id ?? null,
        checkpointIds: result.checkpoints.map((checkpoint) => checkpoint.id),
      },
      status: await this.setupCompletionService.getStatus(companyId),
    };
  }
}
