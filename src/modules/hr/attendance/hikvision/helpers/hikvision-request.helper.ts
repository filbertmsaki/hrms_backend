import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AttendanceDevice } from '../../devices/entities/attendance-device.entity';

const DEFAULT_PORT = 80;

export function buildDeviceBaseUrl(device: Pick<AttendanceDevice, 'ipAddress' | 'port'>): string {
  return `http://${device.ipAddress}:${device.port || DEFAULT_PORT}`;
}

export function buildDeviceUrl(
  device: Pick<AttendanceDevice, 'ipAddress' | 'port'>,
  path: string,
): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${buildDeviceBaseUrl(device)}${safePath}`;
}

export function normalizeHikvisionError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  const message = (error as { message?: string; code?: string } | null)?.message ?? 'Unknown error';
  const code = (error as { code?: string } | null)?.code;

  if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
    return new HttpException('Device authentication failed (401 Unauthorized)', HttpStatus.UNAUTHORIZED);
  }

  if (message.includes('400') || message.toLowerCase().includes('bad request')) {
    return new HttpException('Invalid request sent to Hikvision device (400 Bad Request)', HttpStatus.BAD_REQUEST);
  }

  if (code === 'ECONNABORTED' || message.toLowerCase().includes('timeout')) {
    return new ServiceUnavailableException('Hikvision device timeout');
  }

  if (code === 'ECONNRESET' || message.toLowerCase().includes('socket hang up')) {
    return new ServiceUnavailableException('Hikvision connection reset');
  }

  if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ECONNREFUSED') {
    return new ServiceUnavailableException('Hikvision device is offline or unreachable');
  }

  if (message.toLowerCase().includes('invalid xml')) {
    return new HttpException('Invalid XML received from Hikvision device', HttpStatus.BAD_GATEWAY);
  }

  return new ServiceUnavailableException(`Hikvision integration error: ${message}`);
}
