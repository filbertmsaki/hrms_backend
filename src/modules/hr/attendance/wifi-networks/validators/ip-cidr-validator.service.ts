import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class IpCidrValidatorService {
  isIpInAnyCidr(ipAddress: string, cidrs: string[]): boolean {
    if (!cidrs.length) {
      return false;
    }

    return cidrs.some((cidr) => this.isIpInCidr(ipAddress, cidr));
  }

  isIpInCidr(ipAddress: string, cidr: string): boolean {
    const [range, bitsText] = cidr.split('/');

    if (!range || bitsText === undefined) {
      throw new BadRequestException(`Invalid CIDR format: ${cidr}`);
    }

    const bits = Number(bitsText);

    if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
      throw new BadRequestException(`Invalid CIDR mask: ${cidr}`);
    }

    const ipNumber = this.ipToNumber(ipAddress);
    const rangeNumber = this.ipToNumber(range);

    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

    return (ipNumber & mask) >>> 0 === (rangeNumber & mask) >>> 0;
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.');

    if (parts.length !== 4) {
      throw new BadRequestException(`Invalid IP address: ${ip}`);
    }

    const octets = parts.map((part) => Number(part));

    const invalid = octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    );

    if (invalid) {
      throw new BadRequestException(`Invalid IP address: ${ip}`);
    }

    return (
      (((octets[0] << 24) >>> 0) +
        ((octets[1] << 16) >>> 0) +
        ((octets[2] << 8) >>> 0) +
        octets[3]) >>>
      0
    );
  }
}
