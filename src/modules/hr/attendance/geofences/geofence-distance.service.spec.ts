import { GeofenceDistanceService } from './geofence-distance.service';

describe('GeofenceDistanceService', () => {
  let service: GeofenceDistanceService;

  beforeEach(() => {
    service = new GeofenceDistanceService();
  });

  it('calculates zero meters for the same coordinate', () => {
    expect(
      service.calculateDistanceMeters(
        -6.792354,
        39.208328,
        -6.792354,
        39.208328,
      ),
    ).toBe(0);
  });

  it('accepts a mobile location inside a polygon geofence', () => {
    const result = service.validatePolygonGeofence({
      coordinates: [
        { latitude: -6.793, longitude: 39.207 },
        { latitude: -6.793, longitude: 39.21 },
        { latitude: -6.791, longitude: 39.21 },
        { latitude: -6.791, longitude: 39.207 },
      ],
      userLatitude: -6.792,
      userLongitude: 39.208,
    });

    expect(result.valid).toBe(true);
    expect(result.distanceMeters).toBe(0);
  });

  it('rejects a mobile location outside a polygon beyond GPS tolerance', () => {
    const result = service.validatePolygonGeofence({
      coordinates: [
        { latitude: -6.793, longitude: 39.207 },
        { latitude: -6.793, longitude: 39.21 },
        { latitude: -6.791, longitude: 39.21 },
        { latitude: -6.791, longitude: 39.207 },
      ],
      userLatitude: -6.794,
      userLongitude: 39.208,
      allowedAccuracyMeters: 10,
    });

    expect(result.valid).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(100);
  });

  it('applies strict GPS accuracy to polygon geofences', () => {
    const result = service.validatePolygonGeofence({
      coordinates: [
        { latitude: -6.793, longitude: 39.207 },
        { latitude: -6.793, longitude: 39.21 },
        { latitude: -6.791, longitude: 39.21 },
      ],
      userLatitude: -6.792,
      userLongitude: 39.208,
      accuracyMeters: 50,
      allowedAccuracyMeters: 20,
      strictAccuracy: true,
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('GPS accuracy is too low');
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
    expect(result.message).toBe(
      'Location is outside the allowed geofence. Distance 212m, allowed 85m.',
    );
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
      message:
        'GPS accuracy is too low. Accuracy 80m is greater than allowed 25m.',
    });
  });
});
