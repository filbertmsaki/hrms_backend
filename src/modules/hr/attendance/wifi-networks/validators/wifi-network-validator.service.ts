
import { Injectable } from '@nestjs/common';
import { IpCidrValidatorService } from './ip-cidr-validator.service';
import { AttendanceWifiNetwork } from '../entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';

@Injectable()
export class WifiNetworkValidatorService {
  constructor(private readonly ipCidrValidator: IpCidrValidatorService) {}

  validate(params: {
    wifiNetwork: AttendanceWifiNetwork;
    ssid?: string | null;
    bssid?: string | null;
    ipAddress?: string | null;
  }) {
    const { wifiNetwork, ssid, bssid, ipAddress } = params;

    if (wifiNetwork.status !== AttendanceWifiNetworkStatusEnum.ACTIVE) {
      return {
        valid: false,
        message: 'WiFi network is inactive.',
      };
    }

    if (!wifiNetwork.allowMobileAttendance) {
      return {
        valid: false,
        message: 'This WiFi network is not allowed for mobile attendance.',
      };
    }

    if (wifiNetwork.requireSsidMatch) {
      if (!ssid) {
        return {
          valid: false,
          message: 'WiFi SSID is required.',
        };
      }

      if (ssid.trim().toLowerCase() !== wifiNetwork.ssid.trim().toLowerCase()) {
        return {
          valid: false,
          message: `Invalid WiFi SSID. Required ${wifiNetwork.ssid}, received ${ssid}.`,
        };
      }
    }

    if (wifiNetwork.requireBssidMatch) {
      if (!wifiNetwork.bssid) {
        return {
          valid: false,
          message:
            'BSSID validation is required, but no BSSID is configured for this WiFi network.',
        };
      }

      if (!bssid) {
        return {
          valid: false,
          message: 'WiFi BSSID is required.',
        };
      }

      if (
        this.normalizeMac(bssid) !== this.normalizeMac(wifiNetwork.bssid)
      ) {
        return {
          valid: false,
          message:
            'Invalid WiFi BSSID. User is not connected to the allowed office access point.',
        };
      }
    }

    if (wifiNetwork.requireIpMatch) {
      if (!wifiNetwork.allowedIpCidrs?.length) {
        return {
          valid: false,
          message:
            'IP validation is required, but no allowed IP CIDR range is configured.',
        };
      }

      if (!ipAddress) {
        return {
          valid: false,
          message: 'IP address is required for office LAN validation.',
        };
      }

      const ipValid = this.ipCidrValidator.isIpInAnyCidr(
        ipAddress,
        wifiNetwork.allowedIpCidrs,
      );

      if (!ipValid) {
        return {
          valid: false,
          message: `IP address ${ipAddress} is not inside the allowed office LAN/VLAN ranges.`,
        };
      }
    }

    return {
      valid: true,
      message: 'WiFi network validation passed.',
    };
  }

  private normalizeMac(value: string): string {
    return value.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  }
}