import { ThreatDetection, BlindSpotAlert, DeviceTelemetry } from "./types";

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
  return Math.min(speed, 70);
}

export function formatSpeedKmh(mps: number | null | undefined): string {
  if (!mps || mps <= 0.05) return "0.0 km/h";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

/**
 * Ray-Casting Point-in-Polygon (PIP) Algorithm
 * Accurately determines whether a coordinate [lat, lon] is inside a polygon.
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

/* =========================================================================
 * SHARED PERCEPTION & BLIND-SPOT GEOMETRY ENGINE
 * ========================================================================= */

/**
 * Projects a geographic point given an origin [lat, lon], bearing in degrees, and distance in meters.
 * Uses local ENU (equirectangular projection) for sub-millimeter precision at worksite scale.
 */
export function projectCoordinates(
  originLat: number,
  originLon: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const thetaRad = (bearingDeg * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((originLat * Math.PI) / 180);

  const dLat = (distanceMeters * Math.cos(thetaRad)) / metersPerDegreeLat;
  const dLon = (distanceMeters * Math.sin(thetaRad)) / metersPerDegreeLon;

  return [originLat + dLat, originLon + dLon];
}

/**
 * Computes forward compass bearing in degrees (0° to 360°) from point 1 to point 2.
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Computes the FOV (Field of View) vision cone polygon for an agent.
 * Given lat, lon, heading, HFOV (horizontal field of view), and range (e.g. 50m),
 * generates a pie-slice polygon centered at the agent.
 */
export function calculateFovPolygon(
  lat: number,
  lon: number,
  headingDeg: number,
  hfovDeg = 68,
  visibilityRangeMeters = 50,
  numArcPoints = 16
): [number, number][] {
  const halfFov = hfovDeg / 2;
  const startAngle = headingDeg - halfFov;
  const endAngle = headingDeg + halfFov;

  const polygon: [number, number][] = [[lat, lon]]; // Start at observer location

  for (let i = 0; i <= numArcPoints; i++) {
    const angle = startAngle + (i / numArcPoints) * (endAngle - startAngle);
    const point = projectCoordinates(lat, lon, angle, visibilityRangeMeters);
    polygon.push(point);
  }

  polygon.push([lat, lon]); // Close polygon back at observer
  return polygon;
}

/**
 * Projects a local YOLO threat detection (with bearing and estimated distance) to a global [lat, lon].
 */
export function projectThreatToGlobal(
  agentLat: number,
  agentLon: number,
  agentHeadingDeg: number,
  detection: ThreatDetection
): [number, number] {
  // If bearing is relative (-90° to +90°), add to agent heading; if absolute, use directly
  const effectiveBearing = (detection.bearing_deg !== undefined)
    ? ((agentHeadingDeg + detection.bearing_deg) % 360 + 360) % 360
    : agentHeadingDeg;

  return projectCoordinates(
    agentLat,
    agentLon,
    effectiveBearing,
    detection.est_distance_m || 10
  );
}

/**
 * Determines relative hazard position to an agent ('behind', 'left_flank', 'right_flank', 'obscured')
 */
export function determineRelativePosition(
  targetHeadingDeg: number,
  fromTargetToThreatBearingDeg: number
): 'behind' | 'left_flank' | 'right_flank' | 'obscured' {
  const relativeAngle = ((fromTargetToThreatBearingDeg - targetHeadingDeg) % 360 + 360) % 360;

  if (relativeAngle >= 135 && relativeAngle <= 225) {
    return 'behind';
  } else if (relativeAngle > 45 && relativeAngle < 135) {
    return 'right_flank';
  } else if (relativeAngle > 225 && relativeAngle < 315) {
    return 'left_flank';
  }
  return 'obscured';
}

/**
 * Core Shared Perception & Blind-Spot Engine:
 * For every detected threat from any agent, tests against all peer agents' FOV polygons.
 * If threat is in proximity of Agent B, but outside Agent B's FOV polygon -> Fires targeted Blind-Spot Alert!
 */
export function checkBlindSpotThreats(
  activeAgents: DeviceTelemetry[],
  maxAlertDistanceM = 60
): BlindSpotAlert[] {
  const alerts: BlindSpotAlert[] = [];

  for (const sourceAgent of activeAgents) {
    const sourceId = sourceAgent.agent_id || sourceAgent.device_id;
    const sourceDetections = sourceAgent.detections || [];
    const sourceHeading = sourceAgent.heading_deg ?? sourceAgent.heading ?? 0;

    for (const det of sourceDetections) {
      // Calculate or read global coordinate of threat
      let threatLat = det.globalLat;
      let threatLon = det.globalLon;

      if (!threatLat || !threatLon) {
        const [pLat, pLon] = projectThreatToGlobal(
          sourceAgent.lat,
          sourceAgent.lon,
          sourceHeading,
          det
        );
        threatLat = pLat;
        threatLon = pLon;
      }

      // Check all peer agents
      for (const targetAgent of activeAgents) {
        const targetId = targetAgent.agent_id || targetAgent.device_id;
        if (targetId === sourceId) continue; // Don't alert self

        const targetHeading = targetAgent.heading_deg ?? targetAgent.heading ?? 0;
        const targetFov = targetAgent.fov_polygon || calculateFovPolygon(
          targetAgent.lat,
          targetAgent.lon,
          targetHeading,
          targetAgent.camera_hfov_deg || 68,
          50
        );

        const distToTarget = calculateDistanceMeters(
          targetAgent.lat,
          targetAgent.lon,
          threatLat,
          threatLon
        );

        // If threat is within proximity range of target agent
        if (distToTarget <= maxAlertDistanceM) {
          // Check if threat is inside target agent's FOV
          const insideTargetFov = isPointInPolygon([threatLat, threatLon], targetFov);

          // If threat is OUTSIDE target's FOV -> Target cannot see it! (Blind-spot threat)
          if (!insideTargetFov) {
            const bearingFromTarget = calculateBearing(
              targetAgent.lat,
              targetAgent.lon,
              threatLat,
              threatLon
            );
            const relPos = determineRelativePosition(targetHeading, bearingFromTarget);

            const alertItem: BlindSpotAlert = {
              id: `bs-${sourceId}-${targetId}-${Date.now()}`,
              targetAgentId: targetId,
              sourceAgentId: sourceId,
              threatClass: det.class || 'threat',
              threatLat,
              threatLon,
              distanceToTargetM: Math.round(distToTarget * 10) / 10,
              bearingFromTargetDeg: Math.round(bearingFromTarget),
              relativePosition: relPos,
              message: `⚠️ Blind-spot ${det.class || 'hazard'} approaching ${relPos.replace('_', ' ')} (${Math.round(distToTarget)}m away), spotted by ${sourceAgent.name || sourceId}!`,
              timestamp: Date.now()
            };

            alerts.push(alertItem);
          }
        }
      }
    }
  }

  return alerts;
}
