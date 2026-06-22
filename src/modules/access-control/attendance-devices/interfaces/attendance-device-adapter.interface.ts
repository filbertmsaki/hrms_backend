import { AttendanceDevice } from '../entities/attendance-device.entity';

export type AttendanceDeviceConnectionTestResult = {
  success: boolean;
  message: string;
  latency_ms: number;
  device?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
};

export interface AttendanceDeviceAdapter {
  supports(device: AttendanceDevice): boolean;

  testConnection(
    companyId: number,
    device: AttendanceDevice,
  ): Promise<AttendanceDeviceConnectionTestResult>;

  syncDeviceData?(
    companyId: number,
    device: AttendanceDevice,
  ): Promise<Record<string, unknown>>;
}
