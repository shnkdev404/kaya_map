export type DeviceType = 'phone' | 'raspberry-pi' | 'vehicle' | 'drone' | 'sensor' | 'station';

export interface LocationPoint {
  lat: number;
  lon: number;
  timestamp: number;
  speed_mps?: number | null;
  altitude_m?: number | null;
  heading?: number | null;
}

export interface DeviceTelemetry {
  device_id: string;
  name?: string;
  type: DeviceType;
  lat: number;
  lon: number;
  heading?: number | null;
  pitch?: number | null;
  roll?: number | null;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  altitude_m?: number | null;
  battery?: number | null;
  timestamp: number;
  server_time?: number;
  online: boolean;
  color?: string;
  history?: LocationPoint[];
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

export interface GeofenceZone {
  id: string;
  name: string;
  center: [number, number]; // [lat, lon]
  radiusMeters: number;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  color: string;
  enabled: boolean;
}

export interface GeofenceAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  zoneId: string;
  zoneName: string;
  type: 'entered' | 'exited';
  distance: number;
  timestamp: number;
}
