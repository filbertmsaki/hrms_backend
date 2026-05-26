import { HikvisionEvent } from './hikvision-event.interface';

export interface HikvisionAlertNotification {
  eventType?: string;
  majorEventType?: number | string;
  subEventType?: number | string;
  dateTime?: string;
  cardNo?: string;
  employeeNoString?: string;
  currentVerifyMode?: string | number;
  serialNo?: string | number;
  doorNo?: number | string;
  [key: string]: unknown;
}

export interface HikvisionListenerSession {
  deviceId: number;
  stopRequested: boolean;
  reconnectAttempts: number;
  abortController: AbortController;
  reconnectTimeout: NodeJS.Timeout | null;
}

export type HikvisionStreamEventHandler = (event: HikvisionEvent) => Promise<void>;
