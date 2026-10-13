import { Injectable } from '@nestjs/common';

@Injectable()
export class GeofenceDistanceService {
  validatePolygonGeofence(params: {
    coordinates: Array<{ latitude: number; longitude: number }>;
    userLatitude: number;
    userLongitude: number;
    accuracyMeters?: number | null;
    allowedAccuracyMeters?: number | null;
    strictAccuracy?: boolean;
  }) {
    const { coordinates, userLatitude, userLongitude } = params;
    const accuracyMeters = params.accuracyMeters ?? 0;
    const allowedAccuracyMeters = params.allowedAccuracyMeters ?? 0;

    if (
      coordinates.length < 3 ||
      !Number.isFinite(userLatitude) ||
      !Number.isFinite(userLongitude) ||
      coordinates.some(
        (point) =>
          !Number.isFinite(point.latitude) ||
          !Number.isFinite(point.longitude) ||
          point.latitude < -90 ||
          point.latitude > 90 ||
          point.longitude < -180 ||
          point.longitude > 180,
      )
    ) {
      return {
        valid: false,
        distanceMeters: undefined,
        message: 'Polygon geofence configuration or location is invalid.',
      };
    }

    if (params.strictAccuracy && accuracyMeters > allowedAccuracyMeters) {
      return {
        valid: false,
        distanceMeters: undefined,
        message: `GPS accuracy is too low. Accuracy ${accuracyMeters}m is greater than allowed ${allowedAccuracyMeters}m.`,
      };
    }

    const containsPoint = coordinates.reduce((inside, point, index) => {
      const previous = coordinates[(index + coordinates.length - 1) % coordinates.length];
      const crosses =
        point.longitude > userLongitude !== previous.longitude > userLongitude &&
        userLatitude <
          ((previous.latitude - point.latitude) *
            (userLongitude - point.longitude)) /
            (previous.longitude - point.longitude) +
            point.latitude;
      return crosses ? !inside : inside;
    }, false);
    const distanceToBoundary = this.distanceToPolygonBoundaryMeters(
      coordinates,
      userLatitude,
      userLongitude,
    );
    const valid =
      containsPoint || distanceToBoundary <= allowedAccuracyMeters;

    return {
      valid,
      distanceMeters: containsPoint ? 0 : distanceToBoundary,
      message: valid
        ? 'Location is inside the allowed geofence.'
        : `Location is outside the allowed geofence. Distance ${Math.round(distanceToBoundary)}m from boundary.`,
    };
  }

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

  private distanceToPolygonBoundaryMeters(
    coordinates: Array<{ latitude: number; longitude: number }>,
    latitude: number,
    longitude: number,
  ) {
    const earthRadiusMeters = 6371000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const latitudeRadians = toRadians(latitude);
    const project = (point: { latitude: number; longitude: number }) => ({
      x:
        earthRadiusMeters *
        toRadians(point.longitude - longitude) *
        Math.cos(latitudeRadians),
      y: earthRadiusMeters * toRadians(point.latitude - latitude),
    });
    const origin = { x: 0, y: 0 };
    let minimumDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < coordinates.length; index += 1) {
      const start = project(coordinates[index]);
      const end = project(coordinates[(index + 1) % coordinates.length]);
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection =
        segmentLengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((origin.x - start.x) * segmentX +
                  (origin.y - start.y) * segmentY) /
                  segmentLengthSquared,
              ),
            );
      const nearestX = start.x + projection * segmentX;
      const nearestY = start.y + projection * segmentY;
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(nearestX, nearestY),
      );
    }

    return minimumDistance;
  }
}
