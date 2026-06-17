import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceWifiNetworkRepository } from './repositories/attendance-wifi-network.repository';
import { CreateAttendanceWifiNetworkDto } from './dtos/create-attendance-wifi-network.dto';
import { UpdateAttendanceWifiNetworkDto } from './dtos/update-attendance-wifi-network.dto';
import { AttendanceWifiNetworkQueryDto } from './dtos/attendance-wifi-network-query.dto';
import { ValidateAttendanceWifiNetworkDto } from './dtos/validate-attendance-wifi-network.dto';
import { AttendanceWifiNetworkStatusEnum } from './enums/attendance-wifi-network-status.enum';
import { AttendanceWifiSecurityTypeEnum } from './enums/attendance-wifi-security-type.enum';
import { WifiNetworkValidatorService } from './validators/wifi-network-validator.service';

@Injectable()
export class AttendanceWifiNetworksService {
  constructor(
    private readonly wifiRepo: AttendanceWifiNetworkRepository,
    private readonly wifiValidator: WifiNetworkValidatorService,
  ) {}

  async create(companyId: number, dto: CreateAttendanceWifiNetworkDto) {
    await this.validateDuplicate(companyId, dto.ssid, dto.bssid);

    this.validatePayload(dto);

    const wifiNetwork = this.wifiRepo.createEntity({
      companyId,
      branchId: dto.branchId ?? null,
      name: dto.name.trim(),
      description: dto.description ?? null,
      ssid: dto.ssid.trim(),
      bssid: dto.bssid ? dto.bssid.trim() : null,
      allowedIpCidrs: dto.allowedIpCidrs ?? null,
      securityType: dto.securityType ?? AttendanceWifiSecurityTypeEnum.UNKNOWN,
      requireSsidMatch: dto.requireSsidMatch ?? true,
      requireBssidMatch: dto.requireBssidMatch ?? false,
      requireIpMatch: dto.requireIpMatch ?? false,
      allowMobileAttendance: dto.allowMobileAttendance ?? true,
      metadata: dto.metadata ?? null,
      status: dto.status ?? AttendanceWifiNetworkStatusEnum.ACTIVE,
    });

    return this.wifiRepo.save(wifiNetwork);
  }

  async findAll(companyId: number, query: AttendanceWifiNetworkQueryDto) {
    return this.wifiRepo.findPaginated(companyId, query);
  }

  async findOne(companyId: number, id: number) {
    const wifiNetwork = await this.wifiRepo.findOneById(companyId, id);

    if (!wifiNetwork) {
      throw new NotFoundException('Attendance WiFi network not found.');
    }

    return wifiNetwork;
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateAttendanceWifiNetworkDto,
  ) {
    const wifiNetwork = await this.findOne(companyId, id);

    const nextSsid = dto.ssid ?? wifiNetwork.ssid;
    const nextBssid = dto.bssid !== undefined ? dto.bssid : wifiNetwork.bssid;

    if (dto.ssid !== undefined || dto.bssid !== undefined) {
      await this.validateDuplicate(companyId, nextSsid, nextBssid, id);
    }

    this.validatePayload({
      ...wifiNetwork,
      ...dto,
      ssid: nextSsid,
      bssid: nextBssid ?? undefined,
    });

    if (dto.branchId !== undefined) {
      wifiNetwork.branchId = dto.branchId;
    }

    if (dto.name !== undefined) {
      wifiNetwork.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      wifiNetwork.description = dto.description;
    }

    if (dto.ssid !== undefined) {
      wifiNetwork.ssid = dto.ssid.trim();
    }

    if (dto.bssid !== undefined) {
      wifiNetwork.bssid = dto.bssid ? dto.bssid.trim() : null;
    }

    if (dto.allowedIpCidrs !== undefined) {
      wifiNetwork.allowedIpCidrs = dto.allowedIpCidrs;
    }

    if (dto.securityType !== undefined) {
      wifiNetwork.securityType = dto.securityType;
    }

    if (dto.requireSsidMatch !== undefined) {
      wifiNetwork.requireSsidMatch = dto.requireSsidMatch;
    }

    if (dto.requireBssidMatch !== undefined) {
      wifiNetwork.requireBssidMatch = dto.requireBssidMatch;
    }

    if (dto.requireIpMatch !== undefined) {
      wifiNetwork.requireIpMatch = dto.requireIpMatch;
    }

    if (dto.allowMobileAttendance !== undefined) {
      wifiNetwork.allowMobileAttendance = dto.allowMobileAttendance;
    }

    if (dto.metadata !== undefined) {
      wifiNetwork.metadata = dto.metadata;
    }

    if (dto.status !== undefined) {
      wifiNetwork.status = dto.status;
    }

    return this.wifiRepo.save(wifiNetwork);
  }

  async activate(companyId: number, id: number) {
    const wifiNetwork = await this.findOne(companyId, id);

    wifiNetwork.status = AttendanceWifiNetworkStatusEnum.ACTIVE;

    return this.wifiRepo.save(wifiNetwork);
  }

  async deactivate(companyId: number, id: number) {
    const wifiNetwork = await this.findOne(companyId, id);

    wifiNetwork.status = AttendanceWifiNetworkStatusEnum.INACTIVE;

    return this.wifiRepo.save(wifiNetwork);
  }

  async remove(companyId: number, id: number) {
    await this.findOne(companyId, id);

    await this.wifiRepo.softDelete(id);

    return {
      message: 'Attendance WiFi network deleted successfully.',
    };
  }

  async validateNetwork(
    companyId: number,
    id: number,
    dto: ValidateAttendanceWifiNetworkDto,
    requestIp?: string,
  ) {
    const wifiNetwork = await this.findOne(companyId, id);

    const result = this.wifiValidator.validate({
      wifiNetwork,
      ssid: dto.ssid,
      bssid: dto.bssid,
      ipAddress: dto.ipAddress || requestIp || null,
    });

    return {
      wifiNetworkId: wifiNetwork.id,
      wifiNetworkName: wifiNetwork.name,
      ...result,
    };
  }

  private async validateDuplicate(
    companyId: number,
    ssid: string,
    bssid?: string | null,
    excludeId?: number,
  ) {
    const exists = await this.wifiRepo.existsBySsidAndBssid({
      companyId,
      ssid,
      bssid,
      excludeId,
    });

    if (exists) {
      throw new BadRequestException(
        'Attendance WiFi network with this SSID and BSSID already exists for this company.',
      );
    }
  }

  private validatePayload(dto: {
    ssid?: string;
    bssid?: string | null;
    requireBssidMatch?: boolean;
    requireIpMatch?: boolean;
    allowedIpCidrs?: string[] | null;
  }) {
    if (!dto.ssid || !dto.ssid.trim()) {
      throw new BadRequestException('SSID is required.');
    }

    if (dto.requireBssidMatch && !dto.bssid) {
      throw new BadRequestException(
        'BSSID is required when requireBssidMatch is true.',
      );
    }

    if (dto.requireIpMatch && !dto.allowedIpCidrs?.length) {
      throw new BadRequestException(
        'At least one allowed IP CIDR is required when requireIpMatch is true.',
      );
    }
  }
}
