import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import type { EmployeeAccessCredential } from '../../employee-access-credentials/entity/employee-access-credential.entity';
import { DeviceUserFingerprintsService } from './device-user-fingerprints.service';

describe('device user fingerprint lookup', () => {
  const assignments = { findOne: jest.fn() };
  const credentials = { find: jest.fn() };
  const service = new DeviceUserFingerprintsService(
    assignments as unknown as Repository<EmployeeDeviceAssignment>,
    credentials as unknown as Repository<EmployeeAccessCredential>,
  );
  beforeEach(() => jest.resetAllMocks());

  it('finds unlinked fingerprints by company, device and device employee number without returning biometric data', async () => {
    assignments.findOne.mockResolvedValue({
      id: 7,
      employeeId: null,
      employeeNo: 'D-1',
      employeeName: 'Device user',
    });
    credentials.find.mockResolvedValue([
      {
        id: 4,
        fingerprintId: '1',
        cardReaderNo: 1,
        credentialStatus: 'ACTIVE',
        source: 'DEVICE_SYNC',
        lastSyncedAt: null,
        metadata: { secret: 'must not be returned' },
      },
    ]);
    const result = await service.list(3, 9, 7);
    expect(assignments.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, companyId: 3, deviceId: 9 } }),
    );
    expect(credentials.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 3,
          deviceId: 9,
          employeeNo: 'D-1',
          credentialType: 'FINGERPRINT',
        }),
      }),
    );
    expect(result.hr_employee_id).toBeNull();
    expect(result.fingerprints).toEqual([
      {
        id: 4,
        fingerprint_id: '1',
        card_reader_no: 1,
        status: 'ACTIVE',
        source: 'DEVICE_SYNC',
        last_synced_at: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('rejects assignments outside the requested company and device', async () => {
    assignments.findOne.mockResolvedValue(null);
    await expect(service.list(3, 9, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(credentials.find).not.toHaveBeenCalled();
  });
});
