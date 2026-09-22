import { ConfigService } from '@nestjs/config';
import { FieldLocationEnrichmentService } from './field-location-enrichment.service';

describe('FieldLocationEnrichmentService', () => {
  const buildService = (reverseGeocodingEnabled: boolean, events: any[]) => {
    const configService = {
      get: jest.fn().mockReturnValue(reverseGeocodingEnabled),
    } as unknown as ConfigService;
    const repository = {
      find: jest.fn().mockResolvedValue(events),
      save: jest.fn().mockImplementation(async (event) => event),
    };

    return {
      service: new FieldLocationEnrichmentService(
        configService,
        repository as never,
      ),
      repository,
      configService,
    };
  };

  it('marks pending locations as skipped when reverse geocoding is disabled', async () => {
    const event = {
      id: 1,
      addressStatus: 'PENDING',
      locationValidationResult: null,
    };
    const { service, repository, configService } = buildService(false, [event]);

    await expect(service.processPendingAddresses()).resolves.toBe(1);

    expect(configService.get).toHaveBeenCalledWith(
      'FIELD_VISIT_REVERSE_GEOCODING_ENABLED',
      false,
    );
    expect(event.addressStatus).toBe('SKIPPED');
    expect(event.locationValidationResult).toEqual({
      reverse_geocoding: expect.objectContaining({
        enabled: false,
        status: 'SKIPPED',
      }),
    });
    expect(repository.save).toHaveBeenCalledWith(event);
  });

  it('preserves existing validation data and marks geocoding unavailable when enabled', async () => {
    const event = {
      id: 2,
      addressStatus: 'PENDING',
      locationValidationResult: {
        within_geofence: true,
      },
    };
    const { service, repository } = buildService(true, [event]);

    await expect(service.processPendingAddresses()).resolves.toBe(1);

    expect(event.addressStatus).toBe('UNAVAILABLE');
    expect(event.locationValidationResult).toEqual({
      within_geofence: true,
      reverse_geocoding: expect.objectContaining({
        enabled: true,
        status: 'UNAVAILABLE',
      }),
    });
    expect(repository.save).toHaveBeenCalledWith(event);
  });

  it('returns zero without saving when no pending locations exist', async () => {
    const { service, repository } = buildService(false, []);

    await expect(service.processPendingAddresses()).resolves.toBe(0);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
