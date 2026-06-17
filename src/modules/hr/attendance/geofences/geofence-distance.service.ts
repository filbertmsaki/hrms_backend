import { Injectable } from '@nestjs/common';

@Injectable()
export class GeofenceDistanceService {
  calculateDistanceMeters(
    officeLatitude: number,
    officeLongitude: number,
    userLatitude: number,
    userLongitude: number,
  ): number {
    const earthRadiusMeters = 6371000;

    const toRad = (value: number) => (value * Math.PI) / 180;

    const dLat = toRad(userLatitude - officeLatitude);
    const dLon = toRad(userLongitude - officeLongitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(officeLatitude)) *
        Math.cos(toRad(userLatitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
  }

  validateCircleGeofence(params: {
    officeLatitude: number;
    officeLongitude: number;
    userLatitude: number;
    userLongitude: number;
    radiusMeters: number;
    accuracyMeters?: number | null;
    allowedAccuracyMeters?: number | null;
    strictAccuracy?: boolean;
  }) {
    const distanceMeters = this.calculateDistanceMeters(
      params.officeLatitude,
      params.officeLongitude,
      params.userLatitude,
      params.userLongitude,
    );

    const accuracyMeters = params.accuracyMeters ?? 0;
    const allowedAccuracyMeters = params.allowedAccuracyMeters ?? 0;

    if (params.strictAccuracy && accuracyMeters > allowedAccuracyMeters) {
      return {
        valid: false,
        distanceMeters,
        message: `GPS accuracy is too low. Accuracy ${accuracyMeters}m is greater than allowed ${allowedAccuracyMeters}m.`,
      };
    }

    const allowedRadius = params.radiusMeters + allowedAccuracyMeters;

    if (distanceMeters > allowedRadius) {
      return {
        valid: false,
        distanceMeters,
        message: `Location is outside the allowed geofence. Distance ${Math.round(
          distanceMeters,
        )}m, allowed ${allowedRadius}m.`,
      };
    }

    return {
      valid: true,
      distanceMeters,
      message: 'Location is inside the allowed geofence.',
    };
  }
}
