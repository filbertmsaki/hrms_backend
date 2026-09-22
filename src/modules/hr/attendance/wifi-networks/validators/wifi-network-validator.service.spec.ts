import { BadRequestException } from '@nestjs/common';
import { AttendanceWifiNetwork } from '../entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';
import { AttendanceWifiSecurityTypeEnum } from '../enums/attendance-wifi-security-type.enum';
import { IpCidrValidatorService } from './ip-cidr-validator.service';
import { WifiNetworkValidatorService } from './wifi-network-validator.service';

describe('WifiNetworkValidatorService', () => {
  let ipCidrValidator: IpCidrValidatorService;
  let service: WifiNetworkValidatorService;

  const baseNetwork = (): AttendanceWifiNetwork =>
    ({
      id: 9,
      companyId: 1,
      branchId: 5,
      name: 'HQ Staff',
      description: null,
      ssid: 'Alliance-HQ-Staff',
      bssid: 'AA:BB:CC:DD:EE:FF',
      allowedIpCidrs: ['192.168.80.0/24'],
      securityType: AttendanceWifiSecurityTypeEnum.WPA2,
      requireSsidMatch: true,
      requireBssidMatch: true,
      requireIpMatch: true,
      allowMobileAttendance: true,
      metadata: null,
      status: AttendanceWifiNetworkStatusEnum.ACTIVE,
    }) as AttendanceWifiNetwork;

  beforeEach(() => {
    ipCidrValidator = new IpCidrValidatorService();
    service = new WifiNetworkValidatorService(ipCidrValidator);
  });

  it('accepts a mobile attendance request on the active SSID, AP, and office CIDR', () => {
    const result = service.validate({
      wifiNetwork: baseNetwork(),
      ssid: ' alliance-hq-staff ',
      bssid: 'aa-bb-cc-dd-ee-ff',
      ipAddress: '192.168.80.27',
    });

    expect(result).toEqual({
      valid: true,
      message: 'WiFi network validation passed.',
    });
  });

  it('rejects inactive networks before accepting matching WiFi details', () => {
    const network = baseNetwork();
    network.status = AttendanceWifiNetworkStatusEnum.INACTIVE;

    expect(
      service.validate({
        wifiNetwork: network,
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message: 'WiFi network is inactive.',
    });
  });

  it('rejects mobile punches when mobile attendance is disabled for the network', () => {
    const network = baseNetwork();
    network.allowMobileAttendance = false;

    expect(
      service.validate({
        wifiNetwork: network,
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message: 'This WiFi network is not allowed for mobile attendance.',
    });
  });

  it('rejects missing or mismatched SSID when exact SSID matching is required', () => {
    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message: 'WiFi SSID is required.',
    });

    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        ssid: 'Guest-WiFi',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message:
        'Invalid WiFi SSID. Required Alliance-HQ-Staff, received Guest-WiFi.',
    });
  });

  it('rejects missing, unconfigured, or mismatched BSSID when AP matching is required', () => {
    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        ssid: 'Alliance-HQ-Staff',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message: 'WiFi BSSID is required.',
    });

    const unconfigured = baseNetwork();
    unconfigured.bssid = null;
    expect(
      service.validate({
        wifiNetwork: unconfigured,
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message:
        'BSSID validation is required, but no BSSID is configured for this WiFi network.',
    });

    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        ssid: 'Alliance-HQ-Staff',
        bssid: '11:22:33:44:55:66',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message:
        'Invalid WiFi BSSID. User is not connected to the allowed office access point.',
    });
  });

  it('rejects missing, unconfigured, or out-of-range IP addresses when LAN matching is required', () => {
    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
      }),
    ).toEqual({
      valid: false,
      message: 'IP address is required for office LAN validation.',
    });

    const unconfigured = baseNetwork();
    unconfigured.allowedIpCidrs = null;
    expect(
      service.validate({
        wifiNetwork: unconfigured,
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toEqual({
      valid: false,
      message:
        'IP validation is required, but no allowed IP CIDR range is configured.',
    });

    expect(
      service.validate({
        wifiNetwork: baseNetwork(),
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '10.7.0.15',
      }),
    ).toEqual({
      valid: false,
      message:
        'IP address 10.7.0.15 is not inside the allowed office LAN/VLAN ranges.',
    });
  });

  it('propagates invalid CIDR configuration as a setup error', () => {
    const network = baseNetwork();
    network.allowedIpCidrs = ['192.168.80.0/40'];

    expect(() =>
      service.validate({
        wifiNetwork: network,
        ssid: 'Alliance-HQ-Staff',
        bssid: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.80.27',
      }),
    ).toThrow(BadRequestException);
  });
});
