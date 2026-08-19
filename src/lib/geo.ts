/**
 * Calculates Great Circle distance between two points in meters using Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radius of earth in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Computes instantaneous speed (m/s) between two GPS points over delta time (seconds)
 * Applies a deadband threshold to prevent GPS stationary jitter from showing fake speed.
 */
export function calculateSpeedMps(
  prevLat: number,
  prevLon: number,
  prevTimestampSec: number,
  curLat: number,
  curLon: number,
  curTimestampSec: number,
  deadbandDistanceMeters = 0.8
): number {
  const dt = curTimestampSec - prevTimestampSec;
  if (dt <= 0.05 || dt > 12) return 0;

  const dist = calculateDistanceMeters(prevLat, prevLon, curLat, curLon);
  if (dist < deadbandDistanceMeters) return 0;

  const speed = dist / dt;
  // Cap at realistic maximum (e.g. 70 m/s = 250 km/h)
  return Math.min(speed, 70);
}

export function formatSpeedKmh(mps: number | null | undefined): string {
  if (!mps || mps <= 0.05) return "0.0 km/h";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}
