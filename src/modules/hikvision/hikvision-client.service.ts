import { Injectable } from '@nestjs/common';
import { HikvisionAccessControlService } from './hikvision-access-control.service';

@Injectable()
export class HikvisionClientService {
  constructor(
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  getAcsEventCapabilities(companyId: number, deviceId: number) {
    return this.hikvisionAccessControlService.getAcsEventCapabilities(companyId, deviceId);
  }

  getAcsEventTotalNum(
    companyId: number,
    deviceId: number,
    payload: Record<string, unknown>,
  ) {
    return this.hikvisionAccessControlService.getAcsEventTotalNum(companyId, deviceId, payload);
  }

  searchAcsEvents(companyId: number, deviceId: number, payload: Record<string, unknown>) {
    return this.hikvisionAccessControlService.searchAcsEvents(companyId, deviceId, payload);
  }
}
