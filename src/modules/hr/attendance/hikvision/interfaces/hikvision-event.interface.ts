export interface HikvisionEvent {
  employeeNo: string;
  employeeName?: string | null;
  cardNo?: string | null;
  eventTime: string;
  major: number;
  minor: number;
  eventType: string;
  attendanceStatus: string;
  verifyMode?: string | null;
  doorNo?: number | null;
  serialNo?: string | null;
  deviceTime?: string | null;
  rawPayload: Record<string, unknown>;
}
