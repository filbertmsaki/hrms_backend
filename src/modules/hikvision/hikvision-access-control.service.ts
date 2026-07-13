import { Injectable } from '@nestjs/common';
import { DeviceCommandLogService } from './device-command-logs/service/device-command-log.service';
import { DeviceCommandHttpMethodEnum } from './device-command-logs/enum/device-command-http-method.enum';
import { DeviceCommandTypeEnum } from './device-command-logs/enum/device-command-type.enum';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import {
  buildCredentialsFromDevice,
  toDisplayString,
} from './helpers/hikvision-utils';
import { HikvisionRequestOptions } from './interfaces/hikvision-client.interface';

export type HikvisionRemoteDoorCommand =
  | 'open'
  | 'close'
  | 'alwaysOpen'
  | 'alwaysClose';
type DeviceRequestLogOptions = {
  commandType?: DeviceCommandTypeEnum;
  correlationId?: string;
  createdByCompanyUserId?: number | null;
};

@Injectable()
export class HikvisionAccessControlService {
  constructor(
    private readonly digestClient: HikvisionDigestClient,
    private readonly parserHelper: HikvisionParserHelper,
    private readonly deviceCommandLogService: DeviceCommandLogService,
    private readonly hikvisionHelper: HikvisionHelperService,
  ) {}

  async getDeviceInfo(companyId: number, deviceId: number) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/System/deviceInfo',
      {
        headers: { Accept: 'application/json, application/xml' },
      },
    );
  }

  async getAccessControlCapabilities(companyId: number, deviceId: number) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/capabilities',
      {
        headers: { Accept: 'application/json, application/xml' },
      },
    );
  }

  async getAcsWorkStatus(companyId: number, deviceId: number) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/AcsWorkStatus?format=json',
      {
        headers: { Accept: 'application/json, application/xml' },
      },
    );
  }

  async getDoorConfiguration(
    companyId: number,
    deviceId: number,
    doorNo: number,
  ) {
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
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json, application/xml',
        },
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
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json, application/xml',
        },
        body: xml,
        logOptions: { commandType: DeviceCommandTypeEnum.REMOTE_OPEN_DOOR },
      },
    );
  }

  async getGroupCfg(companyId: number, deviceId: number, groupNo: string) {
    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/GroupCfg/${groupNo}`,
      {
        headers: { Accept: 'application/json, application/xml' },
      },
    );
  }

  async putGroupCfg(
    companyId: number,
    deviceId: number,
    groupNo: string,
    payload: Record<string, unknown>,
  ) {
    const name = this.escapeXml(
      toDisplayString(payload.groupName ?? payload.name ?? `Group ${groupNo}`),
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<GroupCfg version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n  <groupNo>${this.escapeXml(groupNo)}</groupNo>\n  <groupName>${name}</groupName>\n</GroupCfg>`;

    return this.requestToDevice(
      companyId,
      deviceId,
      `/ISAPI/AccessControl/GroupCfg/${groupNo}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json, application/xml',
        },
        body: xml,
      },
    );
  }

  async getUserRightPlanTemplate(
    companyId: number,
    deviceId: number,
    templateNo: string,
  ) {
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
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/xml',
        },
        body: JSON.stringify(payload),
      },
    );
  }

  async getUserRightWeekPlanCfg(
    companyId: number,
    deviceId: number,
    planNo: string,
  ) {
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
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/xml',
        },
        body: JSON.stringify(payload),
      },
    );
  }

  async searchUserInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/UserInfo/Search?format=json',
      payload,
    );
  }

  async recordUserInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/UserInfo/Record?format=json',
      payload,
    );
  }

  async modifyUserInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/UserInfo/Modify?format=json',
      payload,
    );
  }

  async setupUserInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/UserInfo/SetUp?format=json',
      payload,
    );
  }

  async deleteUserInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/UserInfo/Delete?format=json',
      payload,
    );
  }

  async searchCardInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CardInfo/Search?format=json',
      payload,
    );
  }

  async recordCardInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CardInfo/Record?format=json',
      payload,
    );
  }

  async setupCardInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CardInfo/SetUp?format=json',
      payload,
    );
  }

  async modifyCardInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CardInfo/Modify?format=json',
      payload,
    );
  }

  async deleteCardInfo(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CardInfo/Delete?format=json',
      payload,
    );
  }

  async captureFingerprint(
    companyId: number,
    deviceId: number,
    payload: string,
  ) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/CaptureFingerPrint',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json, application/xml',
        },
        body: payload,
      },
    );
  }

  async setupFingerprint(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/FingerPrint/SetUp?format=json',
      payload,
    );
  }

  async deleteFingerprint(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPut(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/FingerPrint/Delete?format=json',
      payload,
    );
  }

  async uploadFingerprint(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestJsonPost(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/FingerPrintUpload?format=json',
      payload,
    );
  }

  async getAcsEventCapabilities(companyId: number, deviceId: number) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/AcsEvent/capabilities?format=json',
      {
        headers: { Accept: 'application/json, application/xml' },
        logOptions: { commandType: DeviceCommandTypeEnum.SEARCH_ACS_EVENTS },
      },
    );
  }

  async getAcsEventTotalNum(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/AcsEventTotalNum?format=json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/xml',
        },
        body: JSON.stringify(payload),
        logOptions: { commandType: DeviceCommandTypeEnum.SEARCH_ACS_EVENTS },
      },
    );
  }

  async searchAcsEvents(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.requestToDevice(
      companyId,
      deviceId,
      '/ISAPI/AccessControl/AcsEvent?format=json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/xml',
        },
        body: JSON.stringify(payload),
        logOptions: { commandType: DeviceCommandTypeEnum.SEARCH_ACS_EVENTS },
      },
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
    const device = await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
    );
    const credentials = buildCredentialsFromDevice(device);
    const requestMethod = (
      options.method ?? 'GET'
    ).toUpperCase() as DeviceCommandHttpMethodEnum;
    const requestBody = this.parseRequestBody(options.body);
    const logOptions = options.logOptions as
      | DeviceRequestLogOptions
      | undefined;
    const commandType =
      logOptions?.commandType ?? this.inferCommandType(requestMethod, path);

    let commandLogId: number | null = null;
    try {
      const commandLog = await this.deviceCommandLogService.create({
        company_id: companyId,
        branch_id: device.branchId ?? null,
        device_id: deviceId,
        command_type: commandType,
        http_method: requestMethod,
        endpoint: path,
        request_body: requestBody,
        correlation_id: logOptions?.correlationId ?? null,
        created_by_company_user_id: logOptions?.createdByCompanyUserId ?? null,
      });
      commandLogId = commandLog.id;
    } catch {
      commandLogId = null;
    }

    try {
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

      if (commandLogId) {
        if (response.ok) {
          await this.deviceCommandLogService.markSuccess(commandLogId, {
            httpStatus: response.status,
            responseBody: this.toObject(parsed, response.body),
          });
        } else {
          await this.deviceCommandLogService.markFailed(
            commandLogId,
            `Device responded with HTTP ${response.status}`,
            {
              httpStatus: response.status,
              responseBody: this.toObject(parsed, response.body),
            },
          );
        }
      }

      return {
        status: response.status,
        ok: response.ok,
        raw: response.body,
        parsed,
      };
    } catch (error) {
      if (commandLogId) {
        await this.deviceCommandLogService.markFailed(
          commandLogId,
          (error as Error).message,
          null,
        );
      }
      throw error;
    }
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
      logOptions: { commandType: this.inferCommandType('POST', path) },
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
      logOptions: { commandType: this.inferCommandType('PUT', path) },
    });
  }

  private inferCommandType(
    method: DeviceCommandHttpMethodEnum | string,
    path: string,
  ): DeviceCommandTypeEnum {
    const normalizedPath = path.toLowerCase();
    const normalizedMethod = String(method).toUpperCase();

    if (normalizedPath.includes('/userinfo/search'))
      return DeviceCommandTypeEnum.SEARCH_USERS;
    if (
      normalizedPath.includes('/userinfo/record') ||
      normalizedPath.includes('/userinfo/modify') ||
      normalizedPath.includes('/userinfo/setup')
    )
      return DeviceCommandTypeEnum.SET_USER;
    if (normalizedPath.includes('/userinfo/delete'))
      return DeviceCommandTypeEnum.DELETE_USER;
    if (normalizedPath.includes('/cardinfo/search'))
      return DeviceCommandTypeEnum.GET_CARD;
    if (
      normalizedPath.includes('/cardinfo/record') ||
      normalizedPath.includes('/cardinfo/modify') ||
      normalizedPath.includes('/cardinfo/setup')
    )
      return DeviceCommandTypeEnum.SET_CARD;
    if (normalizedPath.includes('/cardinfo/delete'))
      return DeviceCommandTypeEnum.DELETE_CARD;
    if (normalizedPath.includes('/capturefingerprint'))
      return DeviceCommandTypeEnum.CAPTURE_FINGERPRINT;
    if (normalizedPath.includes('/fingerprint/setup'))
      return DeviceCommandTypeEnum.SET_FINGERPRINT;
    if (normalizedPath.includes('/fingerprint/delete'))
      return DeviceCommandTypeEnum.DELETE_FINGERPRINT;
    if (
      normalizedPath.includes('/accesscontrol/acsevent') ||
      normalizedPath.includes('/accesscontrol/acseventtotalnum')
    ) {
      return DeviceCommandTypeEnum.SEARCH_ACS_EVENTS;
    }
    if (normalizedPath.includes('/userrightweekplancfg')) {
      return normalizedMethod === 'GET'
        ? DeviceCommandTypeEnum.GET_WEEK_PLAN
        : DeviceCommandTypeEnum.SET_WEEK_PLAN;
    }
    if (normalizedPath.includes('/userrightplantemplate')) {
      return normalizedMethod === 'GET'
        ? DeviceCommandTypeEnum.GET_TEMPLATE
        : DeviceCommandTypeEnum.SET_TEMPLATE;
    }
    if (normalizedPath.includes('/door/param')) {
      return normalizedMethod === 'GET'
        ? DeviceCommandTypeEnum.GET_DOOR
        : DeviceCommandTypeEnum.SET_DOOR;
    }
    if (normalizedPath.includes('/remotecontrol/door'))
      return DeviceCommandTypeEnum.REMOTE_OPEN_DOOR;
    if (normalizedPath.includes('/accesscontrol/acsworkstatus'))
      return DeviceCommandTypeEnum.OTHER;
    if (normalizedPath.includes('/accesscontrol/capabilities'))
      return DeviceCommandTypeEnum.OTHER;

    if (normalizedMethod === 'GET') return DeviceCommandTypeEnum.GET_USER;
    return DeviceCommandTypeEnum.OTHER;
  }

  private parseRequestBody(body: unknown): Record<string, unknown> | null {
    if (body === null || body === undefined) {
      return null;
    }

    if (typeof body === 'string') {
      const trimmed = body.trim();
      if (!trimmed) {
        return null;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return { raw: trimmed };
      }
      return { raw: trimmed };
    }

    if (typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }

    return { raw: toDisplayString(body) };
  }

  private toObject(
    parsed: Record<string, unknown> | string,
    rawBody: string,
  ): Record<string, unknown> {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return { raw: parsed || rawBody };
  }

  private buildDoorParamXml(payload: Record<string, unknown>): string {
    const doorName = this.escapeXml(
      toDisplayString(payload.doorName ?? payload.door_name ?? 'Door'),
    );
    const magneticType = this.escapeXml(
      toDisplayString(
        payload.magneticType ?? payload.magnetic_type ?? 'alwaysClose',
      ),
    );
    const openButtonType = this.escapeXml(
      toDisplayString(
        payload.openButtonType ?? payload.open_button_type ?? 'alwaysOpen',
      ),
    );
    const openDuration = Number(
      payload.openDuration ?? payload.open_duration ?? 5,
    );
    const disabledOpenDuration = Number(
      payload.disabledOpenDuration ?? payload.disabled_open_duration ?? 15,
    );
    const magneticAlarmTimeout = Number(
      payload.magneticAlarmTimeout ?? payload.magnetic_alarm_timeout ?? 30,
    );
    const enableLeaderCard = this.toBooleanText(
      payload.enableLeaderCard ?? payload.enable_leader_card ?? false,
    );
    const leaderCardMode = this.escapeXml(
      toDisplayString(
        payload.leaderCardMode ?? payload.leader_card_mode ?? 'disable',
      ),
    );
    const leaderCardOpenDuration = Number(
      payload.leaderCardOpenDuration ?? payload.leader_card_open_duration ?? 10,
    );

    return `<?xml version="1.0" encoding="UTF-8"?>\n<DoorParam version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n  <doorName>${doorName}</doorName>\n  <magneticType>${magneticType}</magneticType>\n  <openButtonType>${openButtonType}</openButtonType>\n  <openDuration>${Number.isFinite(openDuration) ? openDuration : 5}</openDuration>\n  <disabledOpenDuration>${Number.isFinite(disabledOpenDuration) ? disabledOpenDuration : 15}</disabledOpenDuration>\n  <magneticAlarmTimeout>${Number.isFinite(magneticAlarmTimeout) ? magneticAlarmTimeout : 30}</magneticAlarmTimeout>\n  <enableLeaderCard>${enableLeaderCard}</enableLeaderCard>\n  <leaderCardMode>${leaderCardMode}</leaderCardMode>\n  <leaderCardOpenDuration>${Number.isFinite(leaderCardOpenDuration) ? leaderCardOpenDuration : 10}</leaderCardOpenDuration>\n</DoorParam>`;
  }

  private toBooleanText(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    const normalized = toDisplayString(value ?? '')
      .trim()
      .toLowerCase();
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
}
