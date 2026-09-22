import { GeofenceDistanceService } from './geofence-distance.service';

describe('GeofenceDistanceService', () => {
  let service: GeofenceDistanceService;

  beforeEach(() => {
    service = new GeofenceDistanceService();
  });

  it('calculates zero meters for the same coordinate', () => {
    expect(
      service.calculateDistanceMeters(-6.792354, 39.208328, -6.792354, 39.208328),
    ).toBe(0);
  });

  it('accepts a punch inside the configured radius plus allowed GPS tolerance', () => {
    const result = service.validateCircleGeofence({
      officeLatitude: -6.792354,
      officeLongitude: 39.208328,
      userLatitude: -6.792354,
      userLongitude: 39.20905,
      radiusMeters: 60,
      accuracyMeters: 20,
      allowedAccuracyMeters: 25,
    });

    expect(result.valid).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(70);
    expect(result.message).toBe('Location is inside the allowed geofence.');
  });

  it('rejects a punch outside the configured radius plus allowed GPS tolerance', () => {
    const result = service.validateCircleGeofence({
      officeLatitude: -6.792354,
      officeLongitude: 39.208328,
      userLatitude: -6.792354,
      userLongitude: 39.21025,
      radiusMeters: 60,
      accuracyMeters: 10,
      allowedAccuracyMeters: 25,
    });

    expect(result.valid).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(180);
    expect(result.message).toBe('Location is outside the allowed geofence. Distance 212m, allowed 85m.');
  });

  it('rejects low GPS accuracy before accepting an in-radius coordinate in strict mode', () => {
    const result = service.validateCircleGeofence({
      officeLatitude: -6.792354,
      officeLongitude: 39.208328,
      userLatitude: -6.792354,
      userLongitude: 39.208328,
      radiusMeters: 60,
      accuracyMeters: 80,
      allowedAccuracyMeters: 25,
      strictAccuracy: true,
    });

    expect(result).toEqual({
      valid: false,
      distanceMeters: 0,
      message: 'GPS accuracy is too low. Accuracy 80m is greater than allowed 25m.',
    });
  });
});
