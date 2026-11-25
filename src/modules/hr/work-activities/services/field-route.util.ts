export interface FieldRouteStop {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export function suggestFieldRoute(stops: FieldRouteStop[]) {
  const valid = stops.filter(
    (stop) =>
      stop.latitude !== null &&
      stop.longitude !== null &&
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude) &&
      Math.abs(stop.latitude) <= 90 &&
      Math.abs(stop.longitude) <= 180,
  );
  const missing = stops.filter((stop) => !valid.includes(stop));
  const ordered: Array<
    FieldRouteStop & { distance_from_previous_km: number | null }
  > = [];
  const distance = (a: FieldRouteStop, b: FieldRouteStop) => {
    const rad = Math.PI / 180;
    const dLat = (b.latitude! - a.latitude!) * rad;
    const dLon = (b.longitude! - a.longitude!) * rad;
    const value =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.latitude! * rad) *
        Math.cos(b.latitude! * rad) *
        Math.sin(dLon / 2) ** 2;
    return (
      6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
    );
  };
  if (valid.length)
    ordered.push({ ...valid.shift()!, distance_from_previous_km: null });
  while (valid.length) {
    const previous = ordered[ordered.length - 1];
    let best = 0;
    for (let i = 1; i < valid.length; i++)
      if (distance(previous, valid[i]) < distance(previous, valid[best]))
        best = i;
    const stop = valid.splice(best, 1)[0];
    ordered.push({
      ...stop,
      distance_from_previous_km: Math.round(distance(previous, stop) * 10) / 10,
    });
  }
  return {
    stops: ordered,
    missing_locations: missing.map(({ id, name }) => ({ id, name })),
    method:
      'Straight-line nearest-neighbour estimate; does not account for roads or traffic.',
  };
}
