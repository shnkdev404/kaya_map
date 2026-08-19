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

/**
 * Ray-Casting Point-in-Polygon (PIP) Algorithm
 * Accurately determines whether a coordinate [lat, lon] is strictly inside a waypoint perimeter polygon.
 */
export function isPointInPolygon(
  point: [number, number],
  waypoints: [number, number][]
): boolean {
  if (!waypoints || waypoints.length < 3) return false;

  const [lat, lon] = point;
  let inside = false;

  for (let i = 0, j = waypoints.length - 1; i < waypoints.length; j = i++) {
    const [latI, lonI] = waypoints[i];
    const [latJ, lonJ] = waypoints[j];

    const intersect =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Computes geographic centroid (center of mass) of a waypoint polygon
 */
export function calculatePolygonCentroid(waypoints: [number, number][]): [number, number] {
  if (!waypoints || waypoints.length === 0) return [0, 0];
  let latSum = 0;
  let lonSum = 0;
  waypoints.forEach(([lat, lon]) => {
    latSum += lat;
    lonSum += lon;
  });
  return [latSum / waypoints.length, lonSum / waypoints.length];
}

/**
 * Computes total closed perimeter distance in meters for a sequence of waypoints
 */
export function calculatePolygonPerimeterMeters(waypoints: [number, number][]): number {
  if (!waypoints || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const next = (i + 1) % waypoints.length;
    total += calculateDistanceMeters(
      waypoints[i][0],
      waypoints[i][1],
      waypoints[next][0],
      waypoints[next][1]
    );
  }
  return total;
}

/**
 * Computes approximate enclosed geodesic surface area in square meters
 */
export function calculatePolygonAreaMeters(waypoints: [number, number][]): number {
  if (!waypoints || waypoints.length < 3) return 0;
  const R = 6371e3; // Radius of earth in meters
  let area = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const j = (i + 1) % waypoints.length;
    const lat1 = (waypoints[i][0] * Math.PI) / 180;
    const lat2 = (waypoints[j][0] * Math.PI) / 180;
    const lon1 = (waypoints[i][1] * Math.PI) / 180;
    const lon2 = (waypoints[j][1] * Math.PI) / 180;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = (Math.abs(area) * R * R) / 2.0;
  return area;
}

export function formatArea(sqMeters: number): string {
  if (sqMeters >= 1000000) {
    return `${(sqMeters / 1000000).toFixed(2)} km²`;
  }
  if (sqMeters >= 10000) {
    return `${(sqMeters / 10000).toFixed(2)} hectares`;
  }
  return `${Math.round(sqMeters).toLocaleString()} m²`;
}
