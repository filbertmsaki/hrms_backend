import { suggestFieldRoute } from './field-route.util';

describe('suggestFieldRoute', () => {
  it('starts at the first mapped stop, chooses the nearest next stop and lists missing locations', () => {
    const result = suggestFieldRoute([
      { id: 1, name: 'Start', latitude: -6.8, longitude: 39.2 },
      { id: 2, name: 'Far', latitude: -6.8, longitude: 39.5 },
      { id: 3, name: 'Near', latitude: -6.8, longitude: 39.21 },
      { id: 4, name: 'Unknown', latitude: null, longitude: null },
    ]);
    expect(result.stops.map((stop) => stop.id)).toEqual([1, 3, 2]);
    expect(result.stops[1].distance_from_previous_km).toBeGreaterThan(0);
    expect(result.missing_locations).toEqual([{ id: 4, name: 'Unknown' }]);
  });
});
