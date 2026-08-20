import { DeviceTelemetry, BlindSpotAlert } from "./types";
import { calculateFovPolygon, projectThreatToGlobal, checkBlindSpotThreats } from "./geo";

// Global telemetry store and subscriber registry across Next.js requests
const globalStore = globalThis as unknown as {
  telemetryStore?: Record<string, DeviceTelemetry>;
  telemetrySubscribers?: Set<(data: any) => void>;
  activeBlindSpotAlerts?: BlindSpotAlert[];
};

if (!globalStore.telemetryStore) {
  globalStore.telemetryStore = {};
}
if (!globalStore.telemetrySubscribers) {
  globalStore.telemetrySubscribers = new Set();
}
if (!globalStore.activeBlindSpotAlerts) {
  globalStore.activeBlindSpotAlerts = [];
}

export function broadcastTelemetryUpdate(data: any) {
  if (globalStore.telemetrySubscribers) {
    globalStore.telemetrySubscribers.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {}
    });
  }
}

export function getTelemetryStore(): Record<string, DeviceTelemetry> {
  return globalStore.telemetryStore || {};
}

export function getActiveBlindSpotAlerts(): BlindSpotAlert[] {
  return globalStore.activeBlindSpotAlerts || [];
}

export function processTelemetryPacket(rawPayload: any): {
  device: DeviceTelemetry;
  blindSpotAlerts: BlindSpotAlert[];
} {
  const deviceId = rawPayload.agent_id || rawPayload.device_id || "unknown";
  const heading = rawPayload.heading_deg ?? rawPayload.heading ?? 0;
  const hfov = rawPayload.camera_hfov_deg ?? 68;
  const pitch = rawPayload.pitch_deg ?? rawPayload.pitch ?? 0;

  // 1. Calculate Field of View (FOV) polygon
  const fovPolygon = calculateFovPolygon(
    rawPayload.lat,
    rawPayload.lon,
    heading,
    hfov,
    50
  );

  // 2. Project all detections to global coordinates
  const projectedThreats = (rawPayload.detections || []).map((det: any) => {
    const [gLat, gLon] = projectThreatToGlobal(
      rawPayload.lat,
      rawPayload.lon,
      heading,
      det
    );
    return {
      ...det,
      globalLat: gLat,
      globalLon: gLon
    };
  });

  const existing = globalStore.telemetryStore?.[deviceId];
  const history = existing?.history || [];
  if (rawPayload.lat && rawPayload.lon) {
    history.push({
      lat: rawPayload.lat,
      lon: rawPayload.lon,
      timestamp: rawPayload.timestamp || Date.now(),
      heading,
      speed_mps: rawPayload.speed_mps
    });
    if (history.length > 50) history.shift();
  }

  const devicePayload: DeviceTelemetry = {
    ...rawPayload,
    device_id: deviceId,
    agent_id: deviceId,
    type: rawPayload.type || 'phone',
    heading,
    heading_deg: heading,
    pitch,
    pitch_deg: pitch,
    camera_hfov_deg: hfov,
    fov_polygon: fovPolygon,
    detections: projectedThreats,
    projected_threats: projectedThreats,
    history,
    online: true,
    server_time: Date.now() / 1000
  };

  if (globalStore.telemetryStore) {
    globalStore.telemetryStore[deviceId] = devicePayload;
  }

  // 3. Run Point-in-Polygon Blind-Spot Engine across all active agents
  const activeAgents = Object.values(globalStore.telemetryStore || {});
  const alerts = checkBlindSpotThreats(activeAgents, 60);
  globalStore.activeBlindSpotAlerts = alerts;

  return {
    device: devicePayload,
    blindSpotAlerts: alerts
  };
}

export function setTelemetryDevice(deviceId: string, payload: DeviceTelemetry) {
  if (globalStore.telemetryStore) {
    globalStore.telemetryStore[deviceId] = payload;
  }
}

export function removeTelemetryDevice(deviceId: string) {
  if (globalStore.telemetryStore && globalStore.telemetryStore[deviceId]) {
    delete globalStore.telemetryStore[deviceId];
  }
}

export function clearAllTelemetry() {
  globalStore.telemetryStore = {};
  globalStore.activeBlindSpotAlerts = [];
}

export function addTelemetrySubscriber(cb: (data: any) => void) {
  globalStore.telemetrySubscribers?.add(cb);
  return () => globalStore.telemetrySubscribers?.delete(cb);
}
