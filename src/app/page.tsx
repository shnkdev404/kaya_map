"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navigation/Navbar";
import StatsHeader from "@/components/Dashboard/StatsHeader";
import DeviceCard from "@/components/Dashboard/DeviceCard";
import SimulatorModal from "@/components/Dashboard/SimulatorModal";
import GeofenceModal from "@/components/Dashboard/GeofenceModal";
import StationCalibrateModal from "@/components/Dashboard/StationCalibrateModal";
import { DeviceTelemetry, SimulationProfile, GeofenceZone, GeofenceAlert } from "@/lib/types";
import { 
  calculateDistanceMeters, 
  formatDistance, 
  calculateSpeedMps, 
  formatSpeedKmh,
  isPointInPolygon,
  calculatePolygonCentroid,
  calculatePolygonPerimeterMeters,
  calculatePolygonAreaMeters,
  formatArea
} from "@/lib/geo";
import { GPSKalmanFilter } from "@/lib/kalman";
import { 
  Radio, 
  Search, 
  Plus, 
  Gauge, 
  Target, 
  MapPin, 
  Activity, 
  Layers,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Smartphone,
  CheckCircle2,
  Mountain,
  PlusCircle,
  Compass,
  QrCode,
  X,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  PenTool,
  Undo2,
  Hexagon,
  Circle,
  Crosshair,
  Satellite
} from "lucide-react";
import Link from "next/link";

// Dynamic import of Leaflet LiveMap with SSR disabled
const LiveMap = dynamic(() => import("@/components/Map/LiveMap"), {
  ssr: false,
  loading: () => (
    <div style={{
      width: "100%",
      height: "100%",
      minHeight: "500px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f8faf8",
      color: "var(--emerald-dark)"
    }}>
      <div style={{
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        border: "3px solid #d1fae5",
        borderTopColor: "#059669",
        animation: "spin 1s linear infinite"
      }} />
      <span style={{ marginTop: "12px", fontSize: "13px", fontWeight: 600 }}>
        Loading High-Precision Map...
      </span>
    </div>
  )
});

export default function DashboardPage() {
  // Start with 0 dummy devices
  const [devices, setDevices] = useState<DeviceTelemetry[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceTelemetry | null>(null);
  const [activeTrails, setActiveTrails] = useState<Record<string, boolean>>({});
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Geofencing & Waypoint Marking State
  const [geofences, setGeofences] = useState<GeofenceZone[]>([]);
  const [isGeofenceModalOpen, setIsGeofenceModalOpen] = useState(false);
  const [isDrawingWaypoints, setIsDrawingWaypoints] = useState(false);
  const [drawingWaypoints, setDrawingWaypoints] = useState<[number, number][]>([]);
  const [geofenceAlerts, setGeofenceAlerts] = useState<GeofenceAlert[]>([]);
  const previousContainmentRef = useRef<Record<string, Record<string, boolean>>>({});

  // Simulator State (Empty & Off by default)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProfiles, setSimProfiles] = useState<SimulationProfile[]>([]);
  const simAnglesRef = useRef<Record<string, number>>({});

  // Laptop Base Station & Precise Calibration State
  const [isLaptopStationActive, setIsLaptopStationActive] = useState(true);
  const [laptopLocation, setLaptopLocation] = useState<{ lat: number; lon: number; accuracy: number; altitude: number | null; label?: string } | null>(null);
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);
  const [isCalibrateModalOpen, setIsCalibrateModalOpen] = useState(false);
  const [isPinpointingStation, setIsPinpointingStation] = useState(false);
  const isCustomStationCalibratedRef = useRef(false);
  const hasAutoSyncedPhoneRef = useRef(false);
  const laptopWatchIdRef = useRef<number | null>(null);
  const initialOriginSetRef = useRef(false);

  // Phone Connect Guide Modal
  const [isPhoneGuideOpen, setIsPhoneGuideOpen] = useState(false);
  const [hostUrl, setHostUrl] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // 2D/3D Kinematic Kalman Filters per device to eliminate GPS noise & calculate optimal velocity
  const kalmanFiltersMapRef = useRef<Map<string, GPSKalmanFilter>>(new Map());

  const applyDeviceKalman = (d: DeviceTelemetry): DeviceTelemetry => {
    if (!kalmanFiltersMapRef.current.has(d.device_id)) {
      kalmanFiltersMapRef.current.set(d.device_id, new GPSKalmanFilter(2.5));
    }
    const kf = kalmanFiltersMapRef.current.get(d.device_id)!;
    const kState = kf.update(d.lat, d.lon, d.accuracy_m || 5, d.timestamp || Date.now() / 1000, d.altitude_m || 0);
    const finalSpeed = (d.speed_mps !== undefined && d.speed_mps !== null && d.speed_mps > 0) ? d.speed_mps : kState.speedMps;

    return {
      ...d,
      lat: kState.lat,
      lon: kState.lon,
      accuracy_m: kState.accuracy,
      altitude_m: kState.alt,
      speed_mps: finalSpeed
    };
  };

  // Sync Server Station device and broadcast position
  const syncServerStation = (rawLat: number, rawLon: number, accuracy: number, altitude: number | null, label?: string) => {
    if (!kalmanFiltersMapRef.current.has("station-laptop")) {
      kalmanFiltersMapRef.current.set("station-laptop", new GPSKalmanFilter(1.5));
    }
    const kf = kalmanFiltersMapRef.current.get("station-laptop")!;
    const kState = kf.update(rawLat, rawLon, accuracy, Date.now() / 1000, altitude || 0);

    const lat = kState.lat;
    const lon = kState.lon;
    const loc = { lat, lon, accuracy: kState.accuracy, altitude: kState.alt, label };
    setLaptopLocation(loc);

    const stationDevice: DeviceTelemetry = {
      device_id: "station-laptop",
      name: "Command Station (Laptop / Server)",
      type: "station",
      lat,
      lon,
      accuracy_m: kState.accuracy,
      speed_mps: kState.speedMps,
      altitude_m: kState.alt,
      timestamp: Date.now() / 1000,
      online: true,
      color: "#2563eb",
      history: [{ lat, lon, timestamp: Date.now() / 1000 }]
    };

    // Post to telemetry backend
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stationDevice)
    }).catch(() => {});

    setDevices((prev) => {
      const map = new Map(prev.map((d) => [d.device_id, d]));
      const existing = map.get("station-laptop");
      const history = existing ? [...(existing.history || []), { lat, lon, timestamp: Date.now() / 1000 }] : [{ lat, lon, timestamp: Date.now() / 1000 }];
      map.set("station-laptop", { ...stationDevice, history: history.slice(-60) });
      return Array.from(map.values());
    });

    if (!initialOriginSetRef.current) {
      initialOriginSetRef.current = true;
      setFocusCoords([lat, lon]);
    }
  };

  // Handlers for Station Calibration & Persistence
  const handleSaveStationCalibration = (lat: number, lon: number, accuracy: number, label: string) => {
    isCustomStationCalibratedRef.current = true;
    if (typeof window !== "undefined") {
      localStorage.setItem("kaya_custom_station", JSON.stringify({ lat, lon, accuracy, label, altitude: 0 }));
    }
    syncServerStation(lat, lon, accuracy, null, label);
    setFocusCoords([lat, lon]);
    setIsPinpointingStation(false);
  };

  const handleResetToAutoGps = () => {
    isCustomStationCalibratedRef.current = false;
    if (typeof window !== "undefined") {
      localStorage.removeItem("kaya_custom_station");
    }
    handleRefreshServerGps();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostUrl(window.location.host);

      // Check if user has previously calibrated base station
      try {
        const saved = localStorage.getItem("kaya_custom_station");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.lat && parsed.lon) {
            isCustomStationCalibratedRef.current = true;
            syncServerStation(parsed.lat, parsed.lon, parsed.accuracy || 1.5, parsed.altitude || null, parsed.label || "Calibrated Base Station");
          }
        }
      } catch (e) {}

      // 1. Fast IP-based resolution for instant origin coordinates
      const fetchFastIp = async () => {
        if (isCustomStationCalibratedRef.current) return;
        try {
          const res = await fetch("https://ipwho.is/");
          const data = await res.json();
          if (!isCustomStationCalibratedRef.current && data && data.latitude && data.longitude) {
            syncServerStation(data.latitude, data.longitude, 500, null, `${data.city || ""}, ${data.region || ""}`);
          }
        } catch (e) {
          try {
            const res2 = await fetch("https://ipapi.co/json/");
            const data2 = await res2.json();
            if (!isCustomStationCalibratedRef.current && data2 && data2.latitude && data2.longitude) {
              syncServerStation(data2.latitude, data2.longitude, 500, null, `${data2.city || ""}, ${data2.region || ""}`);
            }
          } catch (e2) {}
        }
      };

      fetchFastIp();

      // 2. High-accuracy Browser GPS Watch
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (isCustomStationCalibratedRef.current) return;
            const c = pos.coords;
            syncServerStation(c.latitude, c.longitude, c.accuracy || 8, c.altitude, "Live GPS Fix");
          },
          (err) => {
            console.warn("Server GPS notice:", err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
        );
        laptopWatchIdRef.current = watchId;
      }
    }

    return () => {
      if (laptopWatchIdRef.current !== null && typeof window !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(laptopWatchIdRef.current);
      }
    };
  }, []);

  // 1. Persistent Real-Time SSE Stream (<15ms sub-second latency from Next.js server)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource: EventSource | null = null;
    let sseReconnectTimer: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource("/api/telemetry/stream");

        eventSource.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "snapshot" && Array.isArray(msg.devices)) {
              // Auto-sync laptop base station to phone satellite GPS if not custom calibrated
              const phone = msg.devices.find((x: any) => (x.type === "phone" || x.device_id.startsWith("phone") || x.device_id === "phone-broadcaster") && (x.accuracy_m || 20) <= 15);
              if (phone && !isCustomStationCalibratedRef.current && !hasAutoSyncedPhoneRef.current) {
                hasAutoSyncedPhoneRef.current = true;
                syncServerStation(phone.lat, phone.lon, Math.min(phone.accuracy_m || 2, 2.5), phone.altitude_m || null, "Auto-Synced from Phone GNSS");
              }

              setDevices((prev) => {
                const prevMap = new Map(prev.map((d) => [d.device_id, d]));
                const merged: DeviceTelemetry[] = msg.devices.map((rawDev: DeviceTelemetry) => {
                  const d = applyDeviceKalman(rawDev);
                  const existing = prevMap.get(d.device_id);
                  const prevHist = existing?.history || [];
                  const lastPt = prevHist[prevHist.length - 1];
                  const hasMoved = !lastPt || Math.abs(lastPt.lat - d.lat) > 0.000005 || Math.abs(lastPt.lon - d.lon) > 0.000005;
                  const history = hasMoved ? [...prevHist, { lat: d.lat, lon: d.lon, timestamp: d.timestamp || Date.now() / 1000 }].slice(-60) : prevHist;
                  return { ...d, history };
                });

                if (isLaptopStationActive && !msg.devices.some((d: any) => d.device_id === "station-laptop")) {
                  const localStation = prev.find((p) => p.device_id === "station-laptop");
                  if (localStation) merged.unshift(localStation);
                }
                return merged;
              });
            } else if (msg.type === "update" && msg.device) {
              const d = applyDeviceKalman(msg.device as DeviceTelemetry);

              // Auto-sync laptop base station to phone satellite GPS on first connection if not custom calibrated
              if (!isCustomStationCalibratedRef.current && !hasAutoSyncedPhoneRef.current && (d.type === "phone" || d.device_id.startsWith("phone") || d.device_id === "phone-broadcaster") && (d.accuracy_m || 20) <= 15) {
                hasAutoSyncedPhoneRef.current = true;
                syncServerStation(d.lat, d.lon, Math.min(d.accuracy_m || 2, 2.5), d.altitude_m || null, "Auto-Synced from Phone GNSS");
              }

              setDevices((prev) => {
                const map = new Map(prev.map((dev) => [dev.device_id, dev]));
                const existing = map.get(d.device_id);
                const prevHist = existing?.history || [];
                const lastPt = prevHist[prevHist.length - 1];
                const hasMoved = !lastPt || Math.abs(lastPt.lat - d.lat) > 0.000005 || Math.abs(lastPt.lon - d.lon) > 0.000005;
                const history = hasMoved ? [...prevHist, { lat: d.lat, lon: d.lon, timestamp: d.timestamp || Date.now() / 1000 }].slice(-60) : prevHist;

                const updatedDev = { ...d, history };
                map.set(d.device_id, updatedDev);

                // Update selected device reference if active
                setSelectedDevice((curr) => (curr?.device_id === d.device_id ? updatedDev : curr));

                return Array.from(map.values());
              });
            } else if (msg.type === "delete" && msg.device_id) {
              setDevices((prev) => prev.filter((d) => d.device_id !== msg.device_id));
            }
          } catch (e) {}
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          sseReconnectTimer = setTimeout(connectSSE, 2000);
        };
      } catch (e) {}
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
    };
  }, [isLaptopStationActive]);

  // 2. FastAPI WebSocket Client fallback (if server.py is running on port 8000)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = () => {
      if (typeof window === "undefined") return;
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.hostname;
        const port = "8000";
        const url = `${proto}//${host}:${port}/ws/viewer`;

        ws = new WebSocket(url);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "snapshot" && Array.isArray(data.devices)) {
              setDevices((prev) => {
                const map = new Map(prev.map((d) => [d.device_id, d]));
                data.devices.forEach((d: DeviceTelemetry) => {
                  const existing = map.get(d.device_id);
                  const history = existing ? [...(existing.history || []), { lat: d.lat, lon: d.lon, timestamp: Date.now() / 1000 }] : [{ lat: d.lat, lon: d.lon, timestamp: Date.now() / 1000 }];
                  map.set(d.device_id, { ...d, history: history.slice(-50) });
                });
                return Array.from(map.values());
              });
            } else if (data.type === "update" && data.device) {
              const d = data.device;
              setDevices((prev) => {
                const map = new Map(prev.map((dev) => [dev.device_id, dev]));
                const existing = map.get(d.device_id);
                const history = existing ? [...(existing.history || []), { lat: d.lat, lon: d.lon, timestamp: Date.now() / 1000 }] : [{ lat: d.lat, lon: d.lon, timestamp: Date.now() / 1000 }];
                map.set(d.device_id, { ...d, history: history.slice(-50) });
                return Array.from(map.values());
              });
            }
          } catch (err) {}
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        };
      } catch (e) {}
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // 3. Fast HTTP API Poll Fallback (every 350ms for low-latency synchronization)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetch("/api/telemetry")
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "ok" && Array.isArray(data.devices)) {
            setDevices((prev) => {
              const prevMap = new Map(prev.map((d) => [d.device_id, d]));
              const serverDevices: DeviceTelemetry[] = data.devices.map((rawDev: DeviceTelemetry) => {
                const d = applyDeviceKalman(rawDev);
                const existing = prevMap.get(d.device_id);
                const prevHist = existing?.history || [];
                const lastPt = prevHist[prevHist.length - 1];
                const hasMoved = !lastPt || Math.abs(lastPt.lat - d.lat) > 0.000005 || Math.abs(lastPt.lon - d.lon) > 0.000005;
                const history = hasMoved ? [...prevHist, { lat: d.lat, lon: d.lon, timestamp: d.timestamp || Date.now() / 1000 }].slice(-60) : prevHist;
                return { ...d, history };
              });

              // Keep local station-laptop if active locally and not on server yet
              if (isLaptopStationActive && !data.devices.some((d: any) => d.device_id === "station-laptop")) {
                const localStation = prev.find((p) => p.device_id === "station-laptop");
                if (localStation) serverDevices.unshift(localStation);
              }

              // Keep simulated targets if simulating
              if (isSimulating) {
                const simDevices = prev.filter((d) => d.device_id.startsWith("sim-"));
                simDevices.forEach((sd) => {
                  if (!serverDevices.some((ud) => ud.device_id === sd.device_id)) {
                    serverDevices.push(sd);
                  }
                });
              }

              return serverDevices;
            });
          }
        })
        .catch(() => {});
    }, 350);

    return () => clearInterval(pollInterval);
  }, [isLaptopStationActive, isSimulating]);

  // Geofence Containment & Breach Detection Engine
  useEffect(() => {
    if (geofences.length === 0 || devices.length === 0) return;

    devices.forEach((device) => {
      geofences.forEach((zone) => {
        if (!zone.enabled) return;

        const isPoly = zone.type === "polygon" && zone.waypoints && zone.waypoints.length >= 3;
        let isInside = false;
        let distance = 0;

        if (isPoly && zone.waypoints) {
          isInside = isPointInPolygon([device.lat, device.lon], zone.waypoints);
          distance = calculateDistanceMeters(device.lat, device.lon, zone.center[0], zone.center[1]);
        } else {
          distance = calculateDistanceMeters(device.lat, device.lon, zone.center[0], zone.center[1]);
          isInside = distance <= zone.radiusMeters;
        }

        const prevInside = previousContainmentRef.current[device.device_id]?.[zone.id];

        if (prevInside !== undefined && prevInside !== isInside) {
          const alertType = isInside ? "entered" : "exited";
          const shouldAlert = (isInside && zone.alertOnEnter) || (!isInside && zone.alertOnExit);

          if (shouldAlert) {
            const newAlert: GeofenceAlert = {
              id: `alert-${Date.now()}-${Math.random()}`,
              deviceId: device.device_id,
              deviceName: device.name || device.device_id,
              zoneId: zone.id,
              zoneName: zone.name,
              type: alertType,
              distance,
              timestamp: Date.now() / 1000
            };

            setGeofenceAlerts((prev) => [newAlert, ...prev.slice(0, 4)]);
          }
        }

        // Store state
        if (!previousContainmentRef.current[device.device_id]) {
          previousContainmentRef.current[device.device_id] = {};
        }
        previousContainmentRef.current[device.device_id][zone.id] = isInside;
      });
    });
  }, [devices, geofences]);

  // Simulator runner (only when explicitly enabled by user)
  useEffect(() => {
    if (!isSimulating || simProfiles.length === 0) return;

    const interval = setInterval(() => {
      setDevices((prevDevices) => {
        const updated = [...prevDevices];

        simProfiles.forEach((profile) => {
          let angle = simAnglesRef.current[profile.id] || 0;
          angle += 0.05;
          simAnglesRef.current[profile.id] = angle;

          let lat = profile.startLat;
          let lon = profile.startLon;

          if (profile.pattern === "circle") {
            const radius = 0.0035;
            lat = profile.startLat + Math.sin(angle) * radius;
            lon = profile.startLon + Math.cos(angle) * radius * 1.3;
          } else if (profile.pattern === "patrol") {
            const size = 0.005;
            const segment = Math.floor((angle % 4));
            const progress = (angle % 1);
            if (segment === 0) {
              lat = profile.startLat + progress * size;
              lon = profile.startLon;
            } else if (segment === 1) {
              lat = profile.startLat + size;
              lon = profile.startLon + progress * size * 1.3;
            } else if (segment === 2) {
              lat = profile.startLat + size - progress * size;
              lon = profile.startLon + size * 1.3;
            } else {
              lat = profile.startLat;
              lon = profile.startLon + size * 1.3 - progress * size * 1.3;
            }
          } else {
            lat = profile.startLat + Math.sin(angle * 0.5) * 0.004;
            lon = profile.startLon + Math.cos(angle * 0.7) * 0.005;
          }

          const existingIdx = updated.findIndex((d) => d.device_id === profile.id);
          const speedMps = profile.speedKmh / 3.6;
          const newPoint = { lat, lon, timestamp: Date.now() / 1000, speed_mps: speedMps };

          if (existingIdx >= 0) {
            const cur = updated[existingIdx];
            const history = [...(cur.history || []), newPoint].slice(-60);
            updated[existingIdx] = {
              ...cur,
              lat,
              lon,
              speed_mps: speedMps,
              timestamp: Date.now() / 1000,
              online: true,
              history
            };
          } else {
            updated.push({
              device_id: profile.id,
              name: profile.name,
              type: profile.type,
              lat,
              lon,
              accuracy_m: 2.0,
              speed_mps: speedMps,
              battery: 92,
              timestamp: Date.now() / 1000,
              online: true,
              color: profile.color,
              history: [newPoint]
            });
          }
        });

        return updated;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isSimulating, simProfiles]);

  // Keep selected device synced
  useEffect(() => {
    if (selectedDevice) {
      const live = devices.find((d) => d.device_id === selectedDevice.device_id);
      if (live) setSelectedDevice(live);
    } else if (devices.length > 0) {
      const station = devices.find((d) => d.device_id === "station-laptop");
      setSelectedDevice(station || devices[0]);
    }
  }, [devices, selectedDevice]);

  const handleRefreshServerGps = () => {
    setIsRefreshingGps(true);
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = pos.coords;
          syncServerStation(c.latitude, c.longitude, c.accuracy || 5, c.altitude, "Live GPS Fix");
          setFocusCoords([c.latitude, c.longitude]);
          setIsRefreshingGps(false);
        },
        (err) => {
          console.warn("GPS refresh failed:", err);
          setIsRefreshingGps(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      setIsRefreshingGps(false);
    }
  };

  const handleToggleLaptopStation = () => {
    if (isLaptopStationActive) {
      setIsLaptopStationActive(false);
      if (laptopWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(laptopWatchIdRef.current);
        laptopWatchIdRef.current = null;
      }
      handleRemoveDevice("station-laptop");
    } else {
      setIsLaptopStationActive(true);
      if (typeof window !== "undefined" && navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const c = pos.coords;
            syncServerStation(c.latitude, c.longitude, c.accuracy || 5, c.altitude, "Live GPS Fix");
          },
          (err) => {
            if (laptopLocation) {
              syncServerStation(laptopLocation.lat, laptopLocation.lon, laptopLocation.accuracy, laptopLocation.altitude);
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        laptopWatchIdRef.current = watchId;
      } else if (laptopLocation) {
        syncServerStation(laptopLocation.lat, laptopLocation.lon, laptopLocation.accuracy, laptopLocation.altitude);
      }
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await fetch(`/api/telemetry?device_id=${encodeURIComponent(deviceId)}`, { method: "DELETE" });
    } catch (e) {}

    setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
    if (selectedDevice?.device_id === deviceId) {
      const remaining = devices.filter((d) => d.device_id !== deviceId);
      setSelectedDevice(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const handleClearAllDevices = async () => {
    try {
      await fetch("/api/telemetry?clear=all", { method: "DELETE" });
    } catch (e) {}
    setDevices([]);
    setSelectedDevice(null);
  };

  const handleToggleTrail = (deviceId: string) => {
    setActiveTrails((prev) => ({ ...prev, [deviceId]: !prev[deviceId] }));
  };

  const handleFocusDevice = (device: DeviceTelemetry) => {
    setSelectedDevice(device);
    setFocusCoords([device.lat, device.lon]);
  };

  const handleAddGeofence = (zone: GeofenceZone) => {
    setGeofences((prev) => [...prev, zone]);
  };

  const handleToggleGeofence = (id: string) => {
    setGeofences((prev) =>
      prev.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const handleRemoveGeofence = (id: string) => {
    setGeofences((prev) => prev.filter((g) => g.id !== id));
  };

  const filteredDevices = devices.filter((d) => {
    const matchesSearch = (d.name || d.device_id).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || d.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--bg-main)" }}>
      {/* Top Navigation */}
      <Navbar
        onlineCount={onlineCount}
        totalDevices={devices.length}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        isSimulating={isSimulating}
        onOpenGeofences={() => setIsGeofenceModalOpen(true)}
        geofenceCount={geofences.filter((g) => g.enabled).length}
        onOpenPhoneGuide={() => setIsPhoneGuideOpen(true)}
        onToggleLaptopStation={handleToggleLaptopStation}
        isLaptopStationActive={isLaptopStationActive}
      />

      {/* Main Container */}
      <main style={{ flex: 1, padding: "20px 24px", maxWidth: "1680px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
        
        {/* Geofence Breach Alert Banners */}
        {geofenceAlerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {geofenceAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  backgroundColor: alert.type === "exited" ? "#fef2f2" : "#f0fdf4",
                  border: alert.type === "exited" ? "1px solid #fecaca" : "1px solid #a7f3d0",
                  color: alert.type === "exited" ? "#b91c1c" : "#047857",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", fontWeight: 700 }}>
                  {alert.type === "exited" ? (
                    <AlertTriangle size={16} style={{ color: "#ef4444" }} />
                  ) : (
                    <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                  )}
                  <span>
                    <b>{alert.deviceName}</b> has {alert.type === "exited" ? "BREACHED (Exited)" : "ENTERED"} geofence <u>{alert.zoneName}</u> ({formatDistance(alert.distance)} from center).
                  </span>
                </div>
                <button
                  onClick={() => setGeofenceAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "12px", fontWeight: 600 }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Top Metric Header */}
        <StatsHeader
          devices={devices}
          isSimulating={isSimulating}
          geofenceCount={geofences.filter((g) => g.enabled).length}
        />

        {/* Dashboard Grid (Sidebar + Live Map + Telemetry Inspector) */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr 300px",
          gap: "16px",
          minHeight: "calc(100vh - 220px)"
        }}>
          
          {/* LEFT: Devices List & Filters */}
          <section style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            {/* Sidebar Header */}
            <div style={{ padding: "16px", borderBottom: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Radio size={18} style={{ color: "var(--emerald-primary)" }} />
                  <h2 style={{ fontSize: "15px", fontWeight: 800, color: "var(--emerald-dark)" }}>
                    Connected Fleet
                  </h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    backgroundColor: "var(--bg-green-pill)",
                    color: "var(--emerald-primary)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)"
                  }}>
                    {filteredDevices.length} Nodes
                  </span>
                  {devices.length > 0 && (
                    <button
                      onClick={handleClearAllDevices}
                      title="Clear / Reset all nodes"
                      style={{
                        background: "none",
                        border: "1px solid var(--border-light)",
                        borderRadius: "6px",
                        padding: "2px 6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px"
                      }}
                    >
                      <Trash2 size={11} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Box */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#f8faf9",
                border: "1px solid var(--border-light)",
                borderRadius: "8px",
                padding: "8px 12px",
                marginBottom: "8px"
              }}>
                <Search size={14} style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search device name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontSize: "12px",
                    width: "100%",
                    color: "var(--text-main)"
                  }}
                />
              </div>

              {/* Filter Pills */}
              <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                {["all", "phone", "station", "raspberry-pi", "vehicle", "drone"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    style={{
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      backgroundColor: typeFilter === t ? "var(--bg-green-tint)" : "#ffffff",
                      color: typeFilter === t ? "var(--emerald-primary)" : "var(--text-muted)",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderColor: typeFilter === t ? "var(--border-green)" : "var(--border-light)"
                    }}
                  >
                    {t === "all" ? "All Types" : t === "station" ? "Base Station" : t.replace("-", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Device Cards List */}
            <div style={{
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              overflowY: "auto",
              flex: 1
            }}>
              {filteredDevices.map((device) => (
                <DeviceCard
                  key={device.device_id}
                  device={device}
                  isSelected={selectedDevice?.device_id === device.device_id}
                  onSelect={(d) => setSelectedDevice(d)}
                  onFocus={handleFocusDevice}
                  showTrail={Boolean(activeTrails[device.device_id])}
                  onToggleTrail={handleToggleTrail}
                  geofences={geofences}
                  onRemove={handleRemoveDevice}
                />
              ))}

              {filteredDevices.length === 0 && (
                <div style={{
                  textAlign: "center",
                  padding: "36px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px"
                }}>
                  <div style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    backgroundColor: "var(--bg-green-tint)",
                    color: "var(--emerald-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                      No Devices Connected
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                      Open the broadcaster on your phone or toggle Laptop Station to stream coordinates live.
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPhoneGuideOpen(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      backgroundColor: "var(--emerald-primary)",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)",
                      marginTop: "4px"
                    }}
                  >
                    <span>Connect Phone Guide</span>
                    <QrCode size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Share Link */}
            <div style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border-light)",
              backgroundColor: "#fcfdfc",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                Stream phone GPS:
              </span>
              <button
                onClick={() => setIsPhoneGuideOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--emerald-primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                <span>/phone</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </section>

          {/* CENTER: Interactive Live Map */}
          <section style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative"
          }}>
            <LiveMap
              devices={devices}
              selectedDevice={selectedDevice}
              onSelectDevice={(d) => setSelectedDevice(d)}
              activeTrails={activeTrails}
              geofences={geofences}
              focusCoords={focusCoords}
              serverOrigin={laptopLocation ? [laptopLocation.lat, laptopLocation.lon] : null}
              isDrawingWaypoints={isDrawingWaypoints}
              drawingWaypoints={drawingWaypoints}
              onAddDrawingWaypoint={(coords) => setDrawingWaypoints((prev) => [...prev, coords])}
              onMapClickCoords={(lat, lon) => {
                if (isPinpointingStation) {
                  handleSaveStationCalibration(lat, lon, 1.5, "Calibrated from Satellite Map");
                }
              }}
              drawingColor="#059669"
            />

            {/* Floating Pinpoint Base Station Mode Banner */}
            {isPinpointingStation && (
              <div style={{
                position: "absolute",
                top: "16px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                backgroundColor: "#ffffff",
                border: "2px solid #2563eb",
                borderRadius: "var(--radius-md)",
                padding: "10px 18px",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.25)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                animation: "fadeIn 0.2s ease"
              }}>
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "#2563eb"
                }} className="pulse-active" />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#1e40af" }}>
                    🎯 Pinpoint Base Station Active
                  </span>
                  <span style={{ fontSize: "11px", color: "#3b82f6" }}>
                    Click anywhere on the map to set your laptop base station origin (±1m precision)
                  </span>
                </div>
                <button
                  onClick={() => setIsPinpointingStation(false)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    backgroundColor: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    cursor: "pointer",
                    marginLeft: "6px"
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Floating Interactive Waypoint Drawing Action Bar */}
            {isDrawingWaypoints && (
              <div style={{
                position: "absolute",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                backgroundColor: "#ffffff",
                border: "1.5px solid var(--emerald-primary)",
                borderRadius: "12px",
                padding: "8px 14px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                animation: "fadeIn 0.2s ease"
              }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--emerald-dark)" }}>
                  📍 {drawingWaypoints.length} Waypoints
                </span>
                <button
                  onClick={() => setDrawingWaypoints((prev) => prev.slice(0, -1))}
                  disabled={drawingWaypoints.length === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    backgroundColor: "#f1f5f9",
                    border: "1px solid var(--border-light)",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: drawingWaypoints.length === 0 ? "not-allowed" : "pointer"
                  }}
                >
                  <Undo2 size={13} />
                  <span>Undo Point</span>
                </button>
                <button
                  onClick={() => {
                    if (drawingWaypoints.length < 3) {
                      alert("Please click at least 3 waypoints on the map to enclose a region.");
                      return;
                    }
                    setIsGeofenceModalOpen(true);
                  }}
                  disabled={drawingWaypoints.length < 3}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    backgroundColor: drawingWaypoints.length < 3 ? "#94a3b8" : "var(--emerald-primary)",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: drawingWaypoints.length < 3 ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 8px rgba(5, 150, 105, 0.25)"
                  }}
                >
                  <Check size={13} />
                  <span>Enclose & Save Fence</span>
                </button>
                <button
                  onClick={() => {
                    setIsDrawingWaypoints(false);
                    setDrawingWaypoints([]);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    backgroundColor: "#fee2e2",
                    color: "#ef4444",
                    border: "1px solid #fecaca",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>

          {/* RIGHT: Geofencing & Telemetry Inspector */}
          <section style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            padding: "16px",
            overflowY: "auto"
          }}>
            {/* Geofencing Summary Card */}
            <div style={{
              backgroundColor: "var(--bg-card-muted)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldCheck size={16} style={{ color: "var(--emerald-primary)" }} />
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--emerald-dark)", textTransform: "uppercase" }}>
                    Geofences ({geofences.filter(g => g.enabled).length})
                  </span>
                </div>
                <button
                  onClick={() => setIsGeofenceModalOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "none",
                    border: "none",
                    color: "var(--emerald-primary)",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <PlusCircle size={14} />
                  <span>Configure</span>
                </button>
              </div>

              {geofences.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {geofences.map((zone) => {
                    const isPoly = zone.type === "polygon" && zone.waypoints && zone.waypoints.length >= 3;
                    const perimeter = isPoly && zone.waypoints ? calculatePolygonPerimeterMeters(zone.waypoints) : 0;
                    return (
                      <div
                        key={zone.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          padding: "6px 8px",
                          backgroundColor: "#ffffff",
                          borderRadius: "6px",
                          border: "1px solid var(--border-light)"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: zone.color }} />
                          <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{zone.name}</span>
                        </div>
                        <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700 }}>
                          {isPoly && zone.waypoints ? `📍 ${zone.waypoints.length} pts · ${formatDistance(perimeter)}` : `🔵 ${formatDistance(zone.radiusMeters)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  No active boundaries. Click configure to set up a circular or multi-waypoint perimeter.
                </div>
              )}
            </div>

            {/* Live Telemetry Specs for Selected Device / Server Station */}
            {(() => {
              const isServerStation = !selectedDevice || selectedDevice.device_id === "station-laptop" || selectedDevice.type === "station";
              const currentDevice = selectedDevice || devices.find((d) => d.device_id === "station-laptop") || (laptopLocation ? {
                device_id: "station-laptop",
                name: "Command Station (Laptop / Server)",
                type: "station" as const,
                lat: laptopLocation.lat,
                lon: laptopLocation.lon,
                accuracy_m: laptopLocation.accuracy,
                speed_mps: 0,
                altitude_m: laptopLocation.altitude,
                timestamp: Date.now() / 1000,
                online: true,
                color: "#2563eb",
                history: [{ lat: laptopLocation.lat, lon: laptopLocation.lon, timestamp: Date.now() / 1000 }]
              } : null);

              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Activity size={18} style={{ color: isServerStation ? "#2563eb" : "var(--emerald-primary)" }} />
                      <h3 style={{ fontSize: "14px", fontWeight: 800, color: isServerStation ? "#1e40af" : "var(--emerald-dark)" }}>
                        {isServerStation ? "Server Telemetry" : "Target Telemetry"}
                      </h3>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {isServerStation ? (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          backgroundColor: "#eff6ff",
                          color: "#2563eb",
                          border: "1px solid #bfdbfe",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          letterSpacing: "0.03em"
                        }}>
                          💻 SERVER ORIGIN
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            const station = devices.find((d) => d.device_id === "station-laptop");
                            if (station) handleFocusDevice(station);
                          }}
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            backgroundColor: "#eff6ff",
                            color: "#2563eb",
                            border: "1px solid #bfdbfe",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            cursor: "pointer"
                          }}
                          title="Switch to Server Laptop Station"
                        >
                          ← Server Origin
                        </button>
                      )}

                      {currentDevice?.online && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          backgroundColor: "#f0fdf4",
                          color: "#059669",
                          border: "1px solid #a7f3d0",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}>
                          ONLINE
                        </span>
                      )}
                    </div>
                  </div>

                  {currentDevice ? (
                    <>
                      {/* 360° Compass Dial if device provides heading or for server orientation */}
                      {(currentDevice.heading !== undefined && currentDevice.heading !== null) ? (
                        <div style={{
                          backgroundColor: "#fcfdfc",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-md)",
                          padding: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-around"
                        }}>
                          <div style={{ position: "relative", width: "70px", height: "70px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: "50%",
                              border: "1.5px dashed var(--border-light)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}>
                              <span style={{ position: "absolute", top: "1px", fontSize: "8px", fontWeight: 800, color: "#ef4444" }}>N</span>
                            </div>
                            <div style={{
                              width: "3px",
                              height: "54px",
                              position: "relative",
                              transform: `rotate(${currentDevice.heading}deg)`,
                              transition: "transform 0.2s ease-out"
                            }}>
                              <div style={{ width: "100%", height: "50%", backgroundColor: "#ef4444", borderRadius: "2px 2px 0 0" }} />
                              <div style={{ width: "100%", height: "50%", backgroundColor: "var(--text-muted)", borderRadius: "0 0 2px 2px" }} />
                            </div>
                            <div style={{ position: "absolute", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ffffff", border: "2px solid var(--emerald-primary)" }} />
                          </div>

                          <div>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                              True Heading
                            </div>
                            <div style={{ fontSize: "18px", fontWeight: 800, color: isServerStation ? "#2563eb" : "var(--emerald-dark)", fontFamily: "'JetBrains Mono', monospace" }}>
                              {currentDevice.heading}°
                            </div>
                            {currentDevice.pitch != null && (
                              <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                Pitch: {currentDevice.pitch}° · Roll: {currentDevice.roll}°
                              </div>
                            )}
                          </div>
                        </div>
                      ) : isServerStation && (
                        <div style={{
                          backgroundColor: "#f8fafc",
                          border: "1px solid #bfdbfe",
                          borderRadius: "var(--radius-md)",
                          padding: "10px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#2563eb" }} className="pulse-active" />
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e40af" }}>
                                {laptopLocation?.label || "Base Command Origin"}
                              </span>
                            </div>
                            <button
                              onClick={() => setIsCalibrateModalOpen(true)}
                              title="Calibrate or pinpoint laptop base station"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "#2563eb",
                                border: "none",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#ffffff",
                                cursor: "pointer",
                                boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)"
                              }}
                            >
                              <Crosshair size={12} />
                              <span>Calibrate Position</span>
                            </button>
                          </div>

                          {/* Quick 1-Click Phone Satellite Sync if phone is connected */}
                          {(() => {
                            const phoneDev = devices.find((d) => d.type === "phone" || d.device_id.startsWith("phone") || d.device_id === "phone-broadcaster");
                            if (!phoneDev) return null;
                            return (
                              <button
                                onClick={() => handleSaveStationCalibration(phoneDev.lat, phoneDev.lon, Math.min(phoneDev.accuracy_m || 2, 3), "Synced from Phone GNSS")}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                  width: "100%",
                                  padding: "6px",
                                  borderRadius: "6px",
                                  backgroundColor: "#f0fdf4",
                                  border: "1px solid #bbf7d0",
                                  color: "#166534",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer"
                                }}
                              >
                                <Satellite size={13} />
                                <span>1-Click Sync to Phone GPS (±{Math.round(phoneDev.accuracy_m || 2)}m)</span>
                              </button>
                            );
                          })()}
                        </div>
                      )}

                      <div style={{
                        backgroundColor: "#fcfdfc",
                        border: "1px solid var(--border-light)",
                        borderRadius: "var(--radius-md)",
                        padding: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                            {isServerStation ? "Server / Laptop GPS Metrics" : "GPS & Motion Metrics"}
                          </span>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: isServerStation ? "#2563eb" : "var(--emerald-primary)", backgroundColor: isServerStation ? "#eff6ff" : "var(--bg-green-pill)", padding: "1px 6px", borderRadius: "4px" }}>
                            {isServerStation ? "Base Origin" : currentDevice.type}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Latitude</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--text-main)" }}>
                            {currentDevice.lat.toFixed(6)}°
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Longitude</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--text-main)" }}>
                            {currentDevice.lon.toFixed(6)}°
                          </span>
                        </div>

                        <div style={{ height: "1px", backgroundColor: "var(--border-light)" }} />

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Speed</span>
                          <span style={{ fontWeight: 700, color: isServerStation ? "#2563eb" : "var(--emerald-dark)" }}>
                            {currentDevice.speed_mps ? `${(currentDevice.speed_mps * 3.6).toFixed(1)} km/h` : "0.0 km/h"}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Altitude</span>
                          <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                            {currentDevice.altitude_m ? `${Math.round(currentDevice.altitude_m)} m` : "Ground Level"}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Accuracy</span>
                          <span style={{ fontWeight: 700, color: isServerStation ? "#2563eb" : "var(--emerald-primary)" }}>
                            {currentDevice.accuracy_m ? `±${Math.round(currentDevice.accuracy_m)} meters` : "±5 meters"}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Breadcrumbs</span>
                          <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                            {currentDevice.history?.length || 1} points
                          </span>
                        </div>

                        <div style={{
                          marginTop: "2px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "6px",
                          padding: "5px 8px",
                          color: "#166534"
                        }}>
                          <span>✨ 2D Kinematic Kalman Filter</span>
                          <span style={{ backgroundColor: "#dcfce7", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 800 }}>ACTIVE</span>
                        </div>
                      </div>

                      {/* Locate Action Button */}
                      <button
                        onClick={() => handleFocusDevice(currentDevice)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "10px",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: isServerStation ? "#2563eb" : "var(--emerald-primary)",
                          color: "#ffffff",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: "pointer",
                          boxShadow: isServerStation ? "0 4px 12px rgba(37, 99, 235, 0.25)" : "0 4px 12px rgba(5, 150, 105, 0.25)",
                          transition: "all 0.2s"
                        }}
                      >
                        <Target size={16} />
                        <span>{isServerStation ? "Center Server Origin on Map" : "Center Target on Map"}</span>
                      </button>
                    </>
                  ) : (
                    <div style={{
                      textAlign: "center",
                      padding: "30px 16px",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      border: "1px dashed var(--border-light)",
                      borderRadius: "var(--radius-md)"
                    }}>
                      Acquiring Laptop / Server Coordinates...
                    </div>
                  )}
                </>
              );
            })()}
          </section>

        </div>
      </main>

      {/* Phone Connect Modal */}
      {isPhoneGuideOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(6px)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px"
        }}>
          <div style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            boxShadow: "0 20px 40px rgba(6, 78, 59, 0.15)",
            width: "100%",
            maxWidth: "520px",
            maxHeight: "90vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "var(--bg-green-tint)",
                  color: "var(--emerald-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <Smartphone size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: "17px", fontWeight: 800, color: "var(--emerald-dark)" }}>
                    Connect Smartphone GPS & IMU
                  </h2>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "1px" }}>
                    Stream live GPS and compass orientation from any mobile device
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPhoneGuideOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Step 1 */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  backgroundColor: "var(--emerald-primary)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  1
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                    Connect phone to same Wi-Fi network
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Ensure your smartphone and this laptop are on the same local Wi-Fi or mobile hotspot.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  backgroundColor: "var(--emerald-primary)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  2
                </div>
                <div style={{ width: "100%" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                    Open URL in phone browser
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Open Safari (iOS) or Chrome (Android) and navigate to:
                  </div>

                  {/* Copyable Links */}
                  <div style={{
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#f8faf9",
                    border: "1.5px solid var(--border-green)",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 700, color: "var(--emerald-dark)" }}>
                      https://{hostUrl || "192.168.225.62:3000"}/phone
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://${hostUrl || "192.168.225.62:3000"}/phone`);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        backgroundColor: "var(--bg-green-pill)",
                        color: "var(--emerald-dark)",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedLink ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  backgroundColor: "var(--emerald-primary)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  3
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                    Tap Start Live Broadcast & Allow Permissions
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    When prompted by the mobile browser, tap <b>Allow Location</b> and <b>Enable Compass / Motion sensors</b>.
                  </div>
                </div>
              </div>

              {/* HTTPS Note Alert */}
              <div style={{
                backgroundColor: "#ecfdf5",
                border: "1px solid var(--border-green)",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "12px",
                color: "var(--emerald-dark)",
                lineHeight: 1.5
              }}>
                <b>💡 Pro-Tip for GPS & Heading:</b> Mobile browsers enforce HTTPS for GPS & Compass. If accessing over Wi-Fi, run <code>npm run dev:https</code> on your laptop to enable HTTPS.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Geofence Modal */}
      <GeofenceModal
        isOpen={isGeofenceModalOpen}
        onClose={() => setIsGeofenceModalOpen(false)}
        geofences={geofences}
        onAddGeofence={(zone) => {
          setGeofences((prev) => [...prev, zone]);
          setIsGeofenceModalOpen(false);
          setIsDrawingWaypoints(false);
          setDrawingWaypoints([]);
        }}
        onToggleGeofence={handleToggleGeofence}
        onRemoveGeofence={handleRemoveGeofence}
        devices={devices}
        selectedDevice={selectedDevice}
        mapCenter={laptopLocation ? [laptopLocation.lat, laptopLocation.lon] : selectedDevice ? [selectedDevice.lat, selectedDevice.lon] : undefined}
        onStartMapDrawing={() => {
          setIsGeofenceModalOpen(false);
          setIsDrawingWaypoints(true);
          setDrawingWaypoints([]);
        }}
        drawnWaypoints={drawingWaypoints}
        onClearDrawnWaypoints={() => setDrawingWaypoints([])}
      />

      {/* Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        isSimulating={isSimulating}
        onStartSimulation={() => setIsSimulating(true)}
        onStopSimulation={() => setIsSimulating(false)}
        profiles={simProfiles}
        originCoords={laptopLocation ? [laptopLocation.lat, laptopLocation.lon] : selectedDevice ? [selectedDevice.lat, selectedDevice.lon] : null}
        onAddProfile={(profile) => setSimProfiles((prev) => [...prev, profile])}
        onRemoveProfile={(id) => {
          setSimProfiles((prev) => prev.filter((p) => p.id !== id));
          setDevices((prev) => prev.filter((d) => d.device_id !== id));
        }}
      />

      {/* Station Precision Calibrator Modal */}
      <StationCalibrateModal
        isOpen={isCalibrateModalOpen}
        onClose={() => setIsCalibrateModalOpen(false)}
        currentLat={laptopLocation?.lat || 0}
        currentLon={laptopLocation?.lon || 0}
        currentAccuracy={laptopLocation?.accuracy || 5}
        label={laptopLocation?.label}
        phoneDevice={devices.find((d) => d.type === "phone" || d.device_id.startsWith("phone") || d.device_id === "phone-broadcaster")}
        onSaveCalibration={handleSaveStationCalibration}
        onStartMapPinpoint={() => setIsPinpointingStation(true)}
        onResetToAutoGps={handleResetToAutoGps}
      />
    </div>
  );
}
