// Global telemetry store and subscriber registry across Next.js requests
const globalStore = globalThis as unknown as {
  telemetryStore?: Record<string, any>;
  telemetrySubscribers?: Set<(data: any) => void>;
};

if (!globalStore.telemetryStore) {
  globalStore.telemetryStore = {};
}
if (!globalStore.telemetrySubscribers) {
  globalStore.telemetrySubscribers = new Set();
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

export function getTelemetryStore() {
  return globalStore.telemetryStore || {};
}

export function setTelemetryDevice(deviceId: string, payload: any) {
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
}

export function addTelemetrySubscriber(cb: (data: any) => void) {
  globalStore.telemetrySubscribers?.add(cb);
  return () => globalStore.telemetrySubscribers?.delete(cb);
}
