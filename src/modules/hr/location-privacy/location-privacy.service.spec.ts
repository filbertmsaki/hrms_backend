import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LocationPrivacyService } from './location-privacy.service';
import {
  LocationPrivacyAcknowledgement,
  LocationPrivacyNotice,
} from './entities/location-privacy.entities';

describe('LocationPrivacyService', () => {
  let service: LocationPrivacyService;
  let notices: { findOne: jest.Mock };
  let acknowledgements: { findOne: jest.Mock };

  beforeEach(() => {
    notices = { findOne: jest.fn() };
    acknowledgements = { findOne: jest.fn() };
    service = new LocationPrivacyService(
      notices as unknown as Repository<LocationPrivacyNotice>,
      acknowledgements as unknown as Repository<LocationPrivacyAcknowledgement>,
      {} as never,
    );
  });

  it('blocks location capture while an employee has not acknowledged the active required version', async () => {
    notices.findOne.mockResolvedValue({
      id: 17,
      companyId: 3,
      version: 2,
      status: 'ACTIVE',
      requireAcknowledgement: true,
    });
    acknowledgements.findOne.mockResolvedValue(null);

    await expect(service.assertAcknowledged(3, 41)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(acknowledgements.findOne).toHaveBeenCalledWith({
      where: { companyId: 3, employeeId: 41, noticeId: 17 },
    });
  });

  it('allows location capture after acknowledgement for the active notice version', async () => {
    notices.findOne.mockResolvedValue({
      id: 17,
      companyId: 3,
      version: 2,
      status: 'ACTIVE',
      requireAcknowledgement: true,
    });
    acknowledgements.findOne.mockResolvedValue({ id: 9, noticeId: 17 });

    await expect(service.assertAcknowledged(3, 41)).resolves.toBeUndefined();
  });

  it('does not block location capture when the company has no active notice', async () => {
    notices.findOne.mockResolvedValue(null);

    await expect(service.assertAcknowledged(3, 41)).resolves.toBeUndefined();
    expect(acknowledgements.findOne).not.toHaveBeenCalled();
  });
});
