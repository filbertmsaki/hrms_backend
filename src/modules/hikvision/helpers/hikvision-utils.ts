import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionConnectionCredentials } from '../interfaces/hikvision-client.interface';

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function toNullableDate(value: unknown): Date | null {
  const normalized = toNullableString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDuplicateDbError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const err = error as QueryFailedError & { code?: string; errno?: number };
  return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
}

export function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const current = toObject(existing);
  const next = toObject(patch);
  return {
    ...current,
    ...next,
    hikvision: {
      ...toObject(current.hikvision),
      ...toObject(next.hikvision),
    },
  };
}

export function buildCredentialsFromDevice(
  device: AttendanceDevice,
): HikvisionConnectionCredentials {
  if (!device.ipAddress) {
    throw new BadRequestException('Missing ip_address for this device');
  }
  if (!device.apiUsername || !device.apiPassword) {
    throw new BadRequestException('Missing Hikvision credentials for this device');
  }
  const protocol =
    (device.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http';
  return {
    ipAddress: device.ipAddress,
    port: device.port || (protocol === 'https' ? 443 : 80),
    protocol,
    username: device.apiUsername,
    password: device.apiPassword,
  };
}
