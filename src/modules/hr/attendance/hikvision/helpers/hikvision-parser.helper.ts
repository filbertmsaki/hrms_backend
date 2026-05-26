import { BadGatewayException, Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { HikvisionAcsEventItem, HikvisionAcsEventResponse } from '../interfaces/acs-event-response.interface';
import { HikvisionAlertNotification } from '../interfaces/alert-stream.interface';
import { HikvisionEvent } from '../interfaces/hikvision-event.interface';

@Injectable()
export class HikvisionParserHelper {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    trimValues: true,
  });

  parsePayload(payload: string): Record<string, unknown> {
    const normalized = payload.trim();
    if (!normalized) {
      throw new BadGatewayException('Empty payload received from Hikvision device');
    }

    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      try {
        return JSON.parse(normalized) as Record<string, unknown>;
      } catch (error) {
        const message = (error as Error).message || 'Unknown JSON parse error';
        throw new BadGatewayException(`Invalid JSON received from Hikvision device: ${message}`);
      }
    }

    try {
      return this.xmlParser.parse(normalized) as Record<string, unknown>;
    } catch (error) {
      const message = (error as Error).message || 'Unknown XML parse error';
      throw new BadGatewayException(`Invalid XML received from Hikvision device: ${message}`);
    }
  }

  parseHikvisionEvent(payload: Record<string, unknown>): HikvisionEvent | null {
    const acsCandidate = this.extractEventCandidate(payload);
    if (!acsCandidate) {
      return null;
    }

    return this.mapEventFromSource(acsCandidate, payload);
  }

  parseAcsEventResponse(payload: Record<string, unknown>): HikvisionAcsEventResponse {
    return payload as HikvisionAcsEventResponse;
  }

  extractAcsEvents(payload: Record<string, unknown>): HikvisionEvent[] {
    const response = this.parseAcsEventResponse(payload);

    const acsEvent = response.AcsEvent as Record<string, unknown> | undefined;
    const listFromAcsEvent = acsEvent?.InfoList;
    const listFromRoot = response.AcsEventInfoList;

    const eventCandidates = this.toArray<HikvisionAcsEventItem>(
      listFromAcsEvent ?? listFromRoot ?? [],
    );

    return eventCandidates
      .map((event) => this.mapEventFromSource(event, payload))
      .filter((item): item is HikvisionEvent => Boolean(item));
  }

  extractAlertEvents(payload: Record<string, unknown>): HikvisionEvent[] {
    const candidate = this.extractEventCandidate(payload) as HikvisionAlertNotification | null;
    if (!candidate) {
      return [];
    }

    const event = this.mapEventFromSource(candidate as Record<string, unknown>, payload);
    return event ? [event] : [];
  }

  extractMessagesFromStreamBuffer(buffer: string): { messages: string[]; remainder: string } {
    let remainder = buffer;
    const messages: string[] = [];

    const xmlPatterns = [
      /<EventNotificationAlert[\s\S]*?<\/EventNotificationAlert>/g,
      /<AcsEventInfo[\s\S]*?<\/AcsEventInfo>/g,
      /<AcsEvent[\s\S]*?<\/AcsEvent>/g,
    ];

    for (const pattern of xmlPatterns) {
      const matches = remainder.match(pattern);
      if (!matches?.length) {
        continue;
      }

      for (const match of matches) {
        messages.push(match);
        remainder = remainder.replace(match, '');
      }
    }

    const lines = remainder.split(/\r?\n/);
    const lineRemainder = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        messages.push(trimmed);
      }
    }

    const safeRemainder = lineRemainder.length > 200_000
      ? lineRemainder.slice(-200_000)
      : lineRemainder;

    return {
      messages,
      remainder: safeRemainder,
    };
  }

  private extractEventCandidate(payload: Record<string, unknown>): Record<string, unknown> | null {
    const acsEventInfo = this.pickObject(payload, [
      'AcsEventInfo',
      'EventNotificationAlert',
      'eventNotificationAlert',
    ]);

    if (acsEventInfo) {
      return acsEventInfo;
    }

    const acsEvent = this.pickObject(payload, ['AcsEvent']);
    if (acsEvent?.InfoList) {
      const items = this.toArray<Record<string, unknown>>(acsEvent.InfoList);
      return items[0] ?? null;
    }

    const rootList = payload.AcsEventInfoList;
    if (rootList) {
      const items = this.toArray<Record<string, unknown>>(rootList);
      return items[0] ?? null;
    }

    return null;
  }

  private mapEventFromSource(
    source: Record<string, unknown>,
    rawPayload: Record<string, unknown>,
  ): HikvisionEvent | null {
    const major = this.toNumber(source.major ?? source.majorEventType);
    const minor = this.toNumber(source.minor ?? source.subEventType);
    const eventTime = this.toString(source.eventTime ?? source.dateTime ?? source.time);
    if (!eventTime) {
      return null;
    }

    const employeeNo = this.toString(
      source.employeeNoString ?? source.employeeNo ?? source.employeeIDNo,
    );
    const cardNo = this.toString(source.cardNo);
    const verifyMode = this.toString(source.currentVerifyMode ?? source.verifyMode);
    const doorNo = this.toNumber(source.doorNo ?? source.readerNo);
    const serialNo = this.toString(source.serialNo ?? source.serialNumber);

    const eventType = this.resolveEventType(source, major, minor);
    const attendanceStatus = this.resolveAttendanceStatus(eventType, major, minor);

    return {
      employeeNo: employeeNo || '',
      employeeName: this.toString(source.name ?? source.employeeName) || null,
      cardNo: cardNo || null,
      eventTime,
      major,
      minor,
      eventType,
      attendanceStatus,
      verifyMode: verifyMode || null,
      doorNo: Number.isFinite(doorNo) ? doorNo : null,
      serialNo: serialNo || null,
      deviceTime: eventTime,
      rawPayload,
    };
  }

  private resolveEventType(
    source: Record<string, unknown>,
    major: number,
    minor: number,
  ): string {
    const typeHint = this.toString(source.eventType ?? source.type ?? source.eventDescription);
    if (typeHint) {
      return typeHint.toUpperCase().replace(/\s+/g, '_');
    }

    return `MAJOR_${major}_MINOR_${minor}`;
  }

  private resolveAttendanceStatus(eventType: string, major: number, minor: number): string {
    const marker = `${eventType}`.toLowerCase();

    if (marker.includes('checkin') || marker.includes('check_in') || marker.includes('in')) {
      return 'CHECK_IN';
    }

    if (marker.includes('checkout') || marker.includes('check_out') || marker.includes('out')) {
      return 'CHECK_OUT';
    }

    if (marker.includes('deny') || marker.includes('denied')) {
      return 'ACCESS_DENIED';
    }

    if (marker.includes('grant') || marker.includes('granted') || marker.includes('pass')) {
      return 'ACCESS_GRANTED';
    }

    if (marker.includes('door') && marker.includes('open')) {
      return 'DOOR_OPEN';
    }

    if (major === 5 && minor === 75) {
      return 'CHECK_IN';
    }

    if (major === 5 && minor === 76) {
      return 'CHECK_OUT';
    }

    if (major === 5) {
      return 'ACCESS_GRANTED';
    }

    return 'UNKNOWN';
  }

  private toArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }
    if (value && typeof value === 'object') {
      return [value as T];
    }
    return [];
  }

  private pickObject(
    source: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> | null {
    for (const key of keys) {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private toString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}
