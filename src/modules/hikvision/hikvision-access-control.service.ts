import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import {
  HikvisionConnectionCredentials,
  HikvisionRequestOptions,
} from './interfaces/hikvision-client.interface';

export type HikvisionRemoteDoorCommand = 'open' | 'close' | 'alwaysOpen' | 'alwaysClose';

@Injectable()
export class HikvisionAccessControlService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly digestClient: HikvisionDigestClient,
    private readonly parserHelper: HikvisionParserHelper,
  ) {}

  async getDeviceInfo(companyId: number, deviceId: number) {
    return this.requestToDevice(companyId, deviceId, '/ISAPI/System/deviceInfo', {
      headers: { Accept: 'application/json, application/xml' },
    });
  }

  async getAccessControlCapabilities(companyId: number, deviceId: number) {
    return this.requestToDevice(companyId, deviceId, '/ISAPI/AccessControl/capabilities', {
      headers: { Accept: 'application/json, application/xml' },
    });
  }

  async getAcsWorkStatus(companyId: number, deviceId: number) {
    return this.requestToDevice(companyId, deviceId, '/ISAPI/AccessControl/AcsWorkStatus?format=json', {
      headers: { Accept: 'application/json, application/xml' },
    });
  }

  async getDoorConfiguration(companyId: number, deviceId: number, doorNo: number) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/Door/param/${doorNo}`,
      {
        headers: { Accept: 'application/json, application/xml' },
      },
    );
  }

  async updateDoorConfiguration(
    companyId: number,
    deviceId: number,
    doorNo: number,
    payload: Record<string, unknown>,
  ) {
    const xml = this.buildDoorParamXml(payload);
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/Door/param/${doorNo}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml', Accept: 'application/json, application/xml' },
        body: xml,
      },
    );
  }

  async remoteControlDoor(
    companyId: number,
    deviceId: number,
    doorNo: number,
    command: HikvisionRemoteDoorCommand,
  ) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n  <cmd>${command}</cmd>\n</RemoteControlDoor>`;
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/RemoteControl/door/${doorNo}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml', Accept: 'application/json, application/xml' },
        body: xml,
      },
    );
  }

  async getGroupCfg(companyId: number, deviceId: number, groupNo: string) {
    return this.requestToDevice(companyId, deviceId, `/ISAPI/AccessControl/GroupCfg/${groupNo}`, {
      headers: { Accept: 'application/json, application/xml' },
    });
  }

  async putGroupCfg(
    companyId: number,
    deviceId: number,
    groupNo: string,
    payload: Record<string, unknown>,
  ) {
    const name = this.escapeXml(String(payload.groupName ?? payload.name ?? `Group ${groupNo}`));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<GroupCfg version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n  <groupNo>${this.escapeXml(groupNo)}</groupNo>\n  <groupName>${name}</groupName>\n</GroupCfg>`;

    return this.requestToDevice(companyId, deviceId, `/ISAPI/AccessControl/GroupCfg/${groupNo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml', Accept: 'application/json, application/xml' },
      body: xml,
    });
  }

  async getUserRightPlanTemplate(companyId: number, deviceId: number, templateNo: string) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/UserRightPlanTemplate/${templateNo}?format=json`,
      { headers: { Accept: 'application/json, application/xml' } },
    );
  }

  async putUserRightPlanTemplate(
    companyId: number,
    deviceId: number,
    templateNo: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/UserRightPlanTemplate/${templateNo}?format=json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, application/xml' },
        body: JSON.stringify(payload),
      },
    );
  }

  async getUserRightWeekPlanCfg(companyId: number, deviceId: number, planNo: string) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/UserRightWeekPlanCfg/${planNo}?format=json`,
      { headers: { Accept: 'application/json, application/xml' } },
    );
  }

  async putUserRightWeekPlanCfg(
    companyId: number,
    deviceId: number,
    planNo: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/UserRightWeekPlanCfg/${planNo}?format=json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, application/xml' },
        body: JSON.stringify(payload),
      },
    );
  }

  async searchUserInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPost(companyId, deviceId, '/ISAPI/AccessControl/UserInfo/Search?format=json', payload);
  }

  async recordUserInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPost(companyId, deviceId, '/ISAPI/AccessControl/UserInfo/Record?format=json', payload);
  }

  async modifyUserInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(companyId, deviceId, '/ISAPI/AccessControl/UserInfo/Modify?format=json', payload);
  }

  async deleteUserInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(companyId, deviceId, '/ISAPI/AccessControl/UserInfo/Delete?format=json', payload);
  }

  async searchCardInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPost(companyId, deviceId, '/ISAPI/AccessControl/CardInfo/Search?format=json', payload);
  }

  async recordCardInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPost(companyId, deviceId, '/ISAPI/AccessControl/CardInfo/Record?format=json', payload);
  }

  async modifyCardInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(companyId, deviceId, '/ISAPI/AccessControl/CardInfo/Modify?format=json', payload);
  }

  async deleteCardInfo(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(companyId, deviceId, '/ISAPI/AccessControl/CardInfo/Delete?format=json', payload);
  }

  async captureFingerprint(companyId: number, deviceId: number, payload: string) {
    return this.requestToDevice(companyId, deviceId, '/ISAPI/AccessControl/CaptureFingerPrint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Accept: 'application/json, application/xml' },
      body: payload,
    });
  }

  async setupFingerprint(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/FingerPrint/SetUp?format=json',
      payload,
    );
  }

  async deleteFingerprint(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/FingerPrint/Delete?format=json',
      payload,
    );
  }

  async postAcsEvent(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/AcsEvent?format=json',
      payload,
    );
  }

  async requestToDevice(
    companyId: number,
    deviceId: number,
    path: string,
    options: HikvisionRequestOptions = {},
  ): Promise<{
    status: number;
    ok: boolean;
    raw: string;
    parsed: Record<string, unknown> | string;
  }> {
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const credentials = this.buildCredentialsFromDevice(device);
    const response = await this.digestClient.request(credentials, path, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    let parsed: Record<string, unknown> | string = response.body;
    if (response.body?.trim()) {
      try {
        parsed = this.parserHelper.parsePayload(response.body);
      } catch {
        parsed = response.body;
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      raw: response.body,
      parsed,
    };
  }

  private async requestJsonPost(
    companyId: number,
    deviceId: number,
    path: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(companyId, deviceId, path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/xml',
      },
      body: JSON.stringify(payload),
    });
  }

  private async requestJsonPut(
    companyId: number,
    deviceId: number,
    path: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(companyId, deviceId, path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/xml',
      },
      body: JSON.stringify(payload),
    });
  }

  private buildDoorParamXml(payload: Record<string, unknown>): string {
    const doorName = this.escapeXml(String(payload.doorName ?? payload.door_name ?? 'Door'));
    const magneticType = this.escapeXml(String(payload.magneticType ?? payload.magnetic_type ?? 'alwaysClose'));
    const openButtonType = this.escapeXml(String(payload.openButtonType ?? payload.open_button_type ?? 'alwaysOpen'));
    const openDuration = Number(payload.openDuration ?? payload.open_duration ?? 5);
    const disabledOpenDuration = Number(payload.disabledOpenDuration ?? payload.disabled_open_duration ?? 15);
    const magneticAlarmTimeout = Number(payload.magneticAlarmTimeout ?? payload.magnetic_alarm_timeout ?? 30);
    const enableLeaderCard = this.toBooleanText(payload.enableLeaderCard ?? payload.enable_leader_card ?? false);
    const leaderCardMode = this.escapeXml(String(payload.leaderCardMode ?? payload.leader_card_mode ?? 'disable'));
    const leaderCardOpenDuration = Number(payload.leaderCardOpenDuration ?? payload.leader_card_open_duration ?? 10);

    return `<?xml version="1.0" encoding="UTF-8"?>\n<DoorParam version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n  <doorName>${doorName}</doorName>\n  <magneticType>${magneticType}</magneticType>\n  <openButtonType>${openButtonType}</openButtonType>\n  <openDuration>${Number.isFinite(openDuration) ? openDuration : 5}</openDuration>\n  <disabledOpenDuration>${Number.isFinite(disabledOpenDuration) ? disabledOpenDuration : 15}</disabledOpenDuration>\n  <magneticAlarmTimeout>${Number.isFinite(magneticAlarmTimeout) ? magneticAlarmTimeout : 30}</magneticAlarmTimeout>\n  <enableLeaderCard>${enableLeaderCard}</enableLeaderCard>\n  <leaderCardMode>${leaderCardMode}</leaderCardMode>\n  <leaderCardOpenDuration>${Number.isFinite(leaderCardOpenDuration) ? leaderCardOpenDuration : 10}</leaderCardOpenDuration>\n</DoorParam>`;
  }

  private toBooleanText(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return 'true';
    }

    return 'false';
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private buildCredentialsFromDevice(device: AttendanceDevice): HikvisionConnectionCredentials {
    if (!device.apiUsername || !device.apiPassword) {
      throw new BadRequestException('Missing Hikvision credentials for this device');
    }

    return {
      ipAddress: device.ipAddress,
      port: device.port || ((device.protocol || 'http').toLowerCase() === 'https' ? 443 : 80),
      protocol: (device.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http',
      username: device.apiUsername,
      password: device.apiPassword,
    };
  }

  private async findHikvisionDeviceOrFail(companyId: number, deviceId: number): Promise<AttendanceDevice> {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
    });

    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === 'hikvision' ||
      (device.vendorName || '').toLowerCase().includes('hikvision');

    if (!isHikvision) {
      throw new BadRequestException('Requested device is not configured as Hikvision');
    }

    return device;
  }
}
