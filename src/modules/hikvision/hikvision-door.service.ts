import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import DigestFetch from 'digest-fetch';
import { XMLParser } from 'fast-xml-parser';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessDoorSyncStatusEnum } from '../access-control/access-doors/enum/access-door-sync-status.enum';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';

type RemoteDoorCommand = 'open' | 'close' | 'alwaysOpen' | 'alwaysClose';

@Injectable()
export class HikvisionDoorSyncService {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    trimValues: true,
  });

  constructor(
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly configService: ConfigService,
  ) {}

  async syncFromDevice(companyId: number, deviceId: number) {
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const results: Array<{
      door_no: number;
      status: 'SYNCED' | 'SKIPPED' | 'FAILED';
      reason?: string;
    }> = [];
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (let doorNo = 1; doorNo <= 8; doorNo += 1) {
      try {
        const response = await this.requestToDevice(
          device,
          'GET',
          `/ISAPI/AccessControl/Door/param/${doorNo}`,
        );
        const body = response.body.trim();
        if (response.status !== 200) {
          if (this.isSkippableDoorResponse(body)) {
            skipped += 1;
            results.push({
              door_no: doorNo,
              status: 'SKIPPED',
              reason: 'notSupport/invalidID',
            });
            continue;
          }
          failed += 1;
          results.push({
            door_no: doorNo,
            status: 'FAILED',
            reason: `status ${response.status}`,
          });
          continue;
        }

        const parsed = this.parsePayload(body);
        const doorParam = this.extractDoorParam(parsed);
        const existing = await this.accessDoorRepository.findOne({
          where: { companyId, deviceId: device.id, doorNo },
          withDeleted: true,
        });

        const entity = existing ?? this.accessDoorRepository.create();
        entity.companyId = companyId;
        entity.branchId = entity.branchId ?? device.branchId ?? null;
        entity.deviceId = device.id;
        entity.doorNo = doorNo;
        entity.doorName =
          this.asTrimmedString(doorParam.doorName) || `Door ${doorNo}`;
        entity.magneticType = this.asNullableString(doorParam.magneticType);
        entity.openButtonType = this.asNullableString(doorParam.openButtonType);
        entity.openDuration = this.asNullableNumber(doorParam.openDuration);
        entity.disabledOpenDuration = this.asNullableNumber(
          doorParam.disabledOpenDuration,
        );
        entity.magneticAlarmTimeout = this.asNullableNumber(
          doorParam.magneticAlarmTimeout,
        );
        entity.enableLeaderCard = this.asNullableBoolean(
          doorParam.enableLeaderCard,
        );
        entity.leaderCardMode = this.asNullableString(doorParam.leaderCardMode);
        entity.leaderCardOpenDuration = this.asNullableNumber(
          doorParam.leaderCardOpenDuration,
        );
        entity.remoteControlPwStatus = this.asNullableBoolean(
          doorParam.remoteControlPWStatus,
        );
        entity.syncStatus = AccessDoorSyncStatusEnum.SYNCED;
        entity.lastSyncedAt = new Date();
        const pullExtras = this.extractNonDuplicatedPullExtras(parsed);
        entity.metadata = this.mergeMetadata(entity.metadata, {
          hikvision: {
            last_pull_status: response.status,
            last_pull_at: new Date().toISOString(),
            ...(Object.keys(pullExtras).length > 0
              ? { last_pull_extras: pullExtras }
              : {}),
          },
        });

        if (existing?.deletedAt) {
          await this.accessDoorRepository.recover(existing);
        }

        await this.accessDoorRepository.save(entity);
        synced += 1;
        results.push({ door_no: doorNo, status: 'SYNCED' });
      } catch (error) {
        failed += 1;
        results.push({
          door_no: doorNo,
          status: 'FAILED',
          reason:
            (error as { message?: string } | null)?.message ||
            'Unknown sync error',
        });
      }
    }

    return {
      message: 'Door sync-from-device completed',
      device_id: device.id,
      synced,
      skipped,
      failed,
      results,
    };
  }

  async syncDoorToDevice(companyId: number, door: AccessDoor) {
    const device = await this.findHikvisionDeviceOrFail(
      companyId,
      this.ensureDoorHasDeviceId(door),
    );
    const xml = this.buildDoorPutXml(door);

    const response = await this.requestToDevice(
      device,
      'PUT',
      `/ISAPI/AccessControl/Door/param/${door.doorNo}`,
      xml,
      'application/xml',
    );

    if (response.status >= 200 && response.status < 300) {
      door.syncStatus = AccessDoorSyncStatusEnum.SYNCED;
      door.lastSyncedAt = new Date();
      door.metadata = this.mergeMetadata(door.metadata, {
        hikvision: {
          last_push_status: response.status,
          last_push_response: this.parsePayloadSafely(response.body),
        },
      });
      await this.accessDoorRepository.save(door);

      return {
        message: 'Door synced to device successfully',
        door_id: door.id,
        device_id: device.id,
        door_no: door.doorNo,
      };
    }

    door.syncStatus = AccessDoorSyncStatusEnum.FAILED;
    door.metadata = this.mergeMetadata(door.metadata, {
      hikvision: {
        last_push_error: {
          status: response.status,
          response: response.body.slice(0, 500),
        },
      },
    });
    await this.accessDoorRepository.save(door);

    throw new BadRequestException(
      `Failed to sync door to Hikvision device. status=${response.status}`,
    );
  }

  async getDoorConfiguration(companyId: number, door: AccessDoor) {
    const device = await this.findHikvisionDeviceOrFail(
      companyId,
      this.ensureDoorHasDeviceId(door),
    );
    const response = await this.requestToDevice(
      device,
      'GET',
      `/ISAPI/AccessControl/Door/param/${door.doorNo}`,
    );

    if (response.status !== 200) {
      throw new BadRequestException(
        `Failed to get door configuration from Hikvision device. status=${response.status}`,
      );
    }

    const parsed = this.parsePayloadSafely(response.body);
    return {
      message: 'Door configuration fetched successfully',
      door_id: door.id,
      door_no: door.doorNo,
      device_id: device.id,
      configuration: parsed,
    };
  }

  async remoteControlDoor(
    companyId: number,
    door: AccessDoor,
    command: RemoteDoorCommand,
  ) {
    const device = await this.findHikvisionDeviceOrFail(
      companyId,
      this.ensureDoorHasDeviceId(door),
    );
    const xml = this.buildRemoteDoorCommandXml(command);
    const response = await this.requestToDevice(
      device,
      'PUT',
      `/ISAPI/AccessControl/RemoteControl/door/${door.doorNo}`,
      xml,
      'application/xml',
    );

    if (response.status >= 200 && response.status < 300) {
      door.metadata = this.mergeMetadata(door.metadata, {
        hikvision: {
          remote_control: {
            command,
            status: response.status,
            at: new Date().toISOString(),
          },
        },
      });
      await this.accessDoorRepository.save(door);
      return {
        message: `Door ${command} command sent successfully`,
        door_id: door.id,
        door_no: door.doorNo,
      };
    }

    throw new BadRequestException(
      `Hikvision door ${command} failed with status ${response.status}`,
    );
  }

  private async findHikvisionDeviceOrFail(
    companyId: number,
    deviceId: number,
  ): Promise<AttendanceDevice> {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
    });

    if (!device) {
      throw new NotFoundException('Attendance device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === 'hikvision' ||
      (device.vendorName || '').toLowerCase().includes('hikvision');

    if (!isHikvision) {
      throw new BadRequestException(
        'Device is not configured as a Hikvision integration',
      );
    }

    if (!device.apiUsername || !device.apiPassword) {
      throw new BadRequestException(
        'Missing api_username/api_password for the selected device',
      );
    }

    return device;
  }

  private ensureDoorHasDeviceId(door: AccessDoor): number {
    if (door.deviceId === null) {
      throw new BadRequestException(
        'This door is no longer linked to a device',
      );
    }

    return door.deviceId;
  }

  private async requestToDevice(
    device: AttendanceDevice,
    method: string,
    path: string,
    body?: string,
    contentType = 'application/xml',
  ): Promise<{ status: number; body: string }> {
    const timeoutMs = Number(
      this.configService.get<string>('HIKVISION_REQUEST_TIMEOUT_MS') ?? 15000,
    );
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(
      () => timeoutController.abort(),
      timeoutMs,
    );

    try {
      const client = new DigestFetch(device.apiUsername, device.apiPassword);
      const response = await client.fetch(this.buildDeviceUrl(device, path), {
        method,
        headers: {
          Accept: 'application/json, application/xml',
          'Content-Type': contentType,
        },
        body,
        signal: timeoutController.signal,
      });

      if (response.status === 401) {
        throw new UnauthorizedException(
          'Hikvision digest authentication failed (401)',
        );
      }

      return {
        status: response.status,
        body: await response.text(),
      };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const message = (error as Error).message?.toLowerCase?.() ?? '';
      if (
        timeoutController.signal.aborted ||
        code === 'ECONNABORTED' ||
        message.includes('timeout')
      ) {
        throw new ServiceUnavailableException('Hikvision request timeout');
      }
      if (
        code === 'ENOTFOUND' ||
        code === 'EHOSTUNREACH' ||
        code === 'ECONNREFUSED'
      ) {
        throw new ServiceUnavailableException(
          'Hikvision device is offline or unreachable',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private buildDeviceUrl(device: AttendanceDevice, path: string): string {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const protocol =
      (device.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http';
    const port = device.port || (protocol === 'https' ? 443 : 80);
    const usePort = !(
      (protocol === 'http' && port === 80) ||
      (protocol === 'https' && port === 443)
    );
    return `${protocol}://${device.ipAddress}${usePort ? `:${port}` : ''}${safePath}`;
  }

  private parsePayload(payload: string): Record<string, unknown> {
    const trimmed = payload.trim();
    if (!trimmed) {
      return {};
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as Record<string, unknown>;
    }
    return this.xmlParser.parse(trimmed) as Record<string, unknown>;
  }

  private parsePayloadSafely(
    payload: string,
  ): Record<string, unknown> | string {
    try {
      return this.parsePayload(payload);
    } catch {
      return payload.slice(0, 1000);
    }
  }

  private extractDoorParam(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const candidate = payload.DoorParam;
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
    ) {
      return candidate as Record<string, unknown>;
    }
    return payload;
  }

  private isSkippableDoorResponse(body: string): boolean {
    const lowered = body.toLowerCase();
    return (
      lowered.includes('notsupport') ||
      lowered.includes('invalidid') ||
      lowered.includes('invalid id')
    );
  }

  private extractNonDuplicatedPullExtras(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const root = this.toObject(payload);
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(root)) {
      if (key !== 'DoorParam' && key !== '?xml') {
        extras[key] = value;
      }
    }

    return extras;
  }

  private buildDoorPutXml(door: AccessDoor): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<DoorParam version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <doorName>${this.escapeXml(door.doorName)}</doorName>
  <magneticType>${this.escapeXml(door.magneticType || '')}</magneticType>
  <openButtonType>${this.escapeXml(door.openButtonType || '')}</openButtonType>
  <openDuration>${door.openDuration ?? 0}</openDuration>
  <disabledOpenDuration>${door.disabledOpenDuration ?? 0}</disabledOpenDuration>
  <magneticAlarmTimeout>${door.magneticAlarmTimeout ?? 0}</magneticAlarmTimeout>
  <enableLeaderCard>${door.enableLeaderCard ? 'true' : 'false'}</enableLeaderCard>
  <leaderCardMode>${this.escapeXml(door.leaderCardMode || '')}</leaderCardMode>
  <leaderCardOpenDuration>${door.leaderCardOpenDuration ?? 0}</leaderCardOpenDuration>
</DoorParam>`;
  }

  private buildRemoteDoorCommandXml(command: RemoteDoorCommand): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <cmd>${command}</cmd>
</RemoteControlDoor>`;
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private asTrimmedString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private asNullableString(value: unknown): string | null {
    const normalized = this.asTrimmedString(value);
    return normalized || null;
  }

  private asNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private asNullableBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const lowered = String(value).trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') {
      return true;
    }
    if (lowered === 'false' || lowered === '0') {
      return false;
    }
    return null;
  }

  private mergeMetadata(
    existing: Record<string, unknown> | null,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const safeExisting = this.toObject(existing);
    const safePatch = this.toObject(patch);
    const existingHikvision = this.sanitizeHikvisionMetadata(
      this.toObject(safeExisting.hikvision),
    );
    const patchHikvision = this.sanitizeHikvisionMetadata(
      this.toObject(safePatch.hikvision),
    );

    return {
      ...safeExisting,
      ...safePatch,
      hikvision: {
        ...existingHikvision,
        ...patchHikvision,
      },
    };
  }

  private sanitizeHikvisionMetadata(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...value };
    // Legacy key stored full door payload and duplicated persisted columns.
    delete sanitized.raw_pull_response;
    return sanitized;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
