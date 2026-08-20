export type DeviceType = 'phone' | 'raspberry-pi' | 'vehicle' | 'drone' | 'sensor' | 'station';

export interface LocationPoint {
  lat: number;
  lon: number;
  timestamp: number;
  speed_mps?: number | null;
  altitude_m?: number | null;
  heading?: number | null;
}

export interface ThreatDetection {
  id?: string;
  class: string;
  bbox?: [number, number, number, number]; // [x, y, w, h] or [x1, y1, x2, y2]
  confidence: number;
  bearing_deg: number; // absolute bearing
  bearing_offset_deg?: number; // relative pixel offset bearing
  est_distance_m: number;
  globalLat?: number;
  globalLon?: number;
  trajectory_mps?: number;
  trajectory_heading?: number;
  source_device_id?: string;
  threat_to_target_id?: string;
  threat_to_target_name?: string;
  is_blind_spot?: boolean;
}

export interface BlindSpotAlert {
  id: string;
  targetAgentId: string; // The agent in danger who cannot see the threat
  sourceAgentId: string; // The agent that detected the threat
  threatClass: string;
  threatLat: number;
  threatLon: number;
  distanceToTargetM: number;
  bearingFromTargetDeg: number;
  relativePosition: 'behind' | 'left_flank' | 'right_flank' | 'obscured';
  message: string;
  timestamp: number;
}

export interface DeviceTelemetry {
  device_id: string;
  agent_id?: string;
  name?: string;
  type: DeviceType;
  lat: number;
  lon: number;
  heading?: number | null;
  heading_deg?: number | null;
  pitch?: number | null;
  pitch_deg?: number | null;
  roll?: number | null;
  camera_hfov_deg?: number | null; // e.g. 70 degrees
  accuracy_m?: number | null;
  speed_mps?: number | null;
  altitude_m?: number | null;
  battery?: number | null;
  timestamp: number;
  server_time?: number;
  online: boolean;
  color?: string;
  image_b64?: string;
  image_url?: string;
  history?: LocationPoint[];
  detections?: ThreatDetection[];
  fov_polygon?: [number, number][]; // Computed FOV vision cone polygon
  projected_threats?: ThreatDetection[];
  blind_spot_alerts?: BlindSpotAlert[];
}

export interface SimulationProfile {
  id: string;
  name: string;
  type: DeviceType;
  startLat: number;
  startLon: number;
  speedKmh: number;
  pattern: 'circle' | 'patrol' | 'linear' | 'random';
  color: string;
}

export type GeofenceType = 'circle' | 'polygon';

export interface GeofenceZone {
  id: string;
  name: string;
  type?: GeofenceType; // 'circle' | 'polygon'
  center: [number, number]; // [lat, lon]
  radiusMeters: number;
  waypoints?: [number, number][]; // For polygon geofences
  color: string;
  alertOnExit: boolean;
  alertOnEnter: boolean;
  enabled: boolean;
}

export interface GeofenceAlert {
  id: string;
  zoneId: string;
  zoneName: string;
  deviceId: string;
  deviceName?: string;
  type: 'breach_exit' | 'breach_enter' | 'entered' | 'exited' | string;
  timestamp: number;
  lat?: number;
  lon?: number;
  distance?: number;
  message?: string;
}
