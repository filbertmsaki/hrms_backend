export interface HikvisionMappedDeviceFields {
  deviceCode?: string;
  deviceName?: string;
  deviceSerialNumber?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  macAddress?: string;
  deviceType?: string;
  timezone?: string;
  vendorName?: string;
}

export interface HikvisionSyncSnapshot {
  deviceInfo: Record<string, unknown>;
  accessControlCapabilities: Record<string, unknown>;
  mappedFields: HikvisionMappedDeviceFields;
  metadataExtras: Record<string, unknown>;
}
