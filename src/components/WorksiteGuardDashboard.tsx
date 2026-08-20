"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  ShieldAlert, 
  AlertTriangle, 
  Camera, 
  Volume2, 
  VolumeX, 
  Video, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Cpu, 
  Activity, 
  Radio, 
  ExternalLink,
  Target,
  Sparkles,
  Smartphone,
  Eye,
  Compass,
  ArrowRight,
  Send,
  PlusCircle,
  Play
} from "lucide-react";
import IncidentAnalysisModal from "@/components/IncidentAnalysisModal";
import { DeviceTelemetry, ThreatDetection, BlindSpotAlert } from "@/lib/types";
import { projectCoordinates, calculateBearing, calculateDistanceMeters } from "@/lib/geo";

interface YoloDetection {
  box: [number, number, number, number];
  class_name: string;
  confidence: number;
  threat_level?: string;
  color?: string;
  bearing_deg?: number;
  est_distance_m?: number;
  globalLat?: number;
  globalLon?: number;
  trajectory_mps?: number;
  trajectory_heading?: number;
  source_device_id?: string;
  threat_to_target_id?: string;
  threat_to_target_name?: string;
  is_blind_spot?: boolean;
}

interface YoloThreat {
  level: "danger" | "caution";
  label: string;
  message: string;
  box?: [number, number, number, number];
}

interface LiveCameraTile {
  clientId: string;
  name: string;
  imageSrc?: string;
  detections: YoloDetection[];
  threats: YoloThreat[];
  threatLevel: "safe" | "caution" | "danger";
  lastFrameTime: number;
  frameWidth?: number;
  frameHeight?: number;
  lat?: number;
  lon?: number;
  heading?: number;
  speed_mps?: number;
  accuracy_m?: number;
}

interface ThreatLogItem {
  id: string;
  timeString: string;
  clientId: string;
  level: "danger" | "caution" | "safe";
  label: string;
  message: string;
  threatTo?: string;
  coordinates?: string;
  trajectory?: string;
}

export default function WorksiteGuardDashboard() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [clock, setClock] = useState<string>("");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState<boolean>(false);

  // Live Camera & Stream state
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [activeTiles, setActiveTiles] = useState<Map<string, LiveCameraTile>>(new Map());
  const [activeThreatMatrix, setActiveThreatMatrix] = useState<YoloDetection[]>([]);
  const [logs, setLogs] = useState<ThreatLogItem[]>([]);
  const [summary, setSummary] = useState<{
    camerasCount: number;
    peopleCount: number;
    dangerCount: number;
    threatsCount: number;
  }>({
    camerasCount: 0,
    peopleCount: 0,
    dangerCount: 0,
    threatsCount: 0,
  });

  // Global hazard banner
  const [activeBanner, setActiveBanner] = useState<{
    level: "danger" | "caution";
    title: string;
    message: string;
    clientId: string;
    threatTo?: string;
  } | null>(null);

  // References
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webcamOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileCanvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsDashRef = useRef<WebSocket | null>(null);
  const wsClientRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clock tick & Mount
  useEffect(() => {
    setMounted(true);
    const updateTime = () => setClock(new Date().toLocaleTimeString());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Alarm Sound Synthesis
  const playAlarmSound = useCallback((isDanger: boolean) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (isDanger) {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(587, now + 0.18);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {}
  }, [soundEnabled]);

  // Trigger site hazard banner
  const triggerGlobalBanner = useCallback((level: "danger" | "caution", title: string, message: string, clientId: string, threatTo?: string) => {
    setActiveBanner({ level, title, message, clientId, threatTo });
    playAlarmSound(level === "danger");

    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setActiveBanner(null);
    }, level === "danger" ? 9000 : 5000);
  }, [playAlarmSound]);

  // Draw YOLO bounding boxes on a canvas
  const drawDetections = useCallback((
    canvas: HTMLCanvasElement | null, 
    detections: YoloDetection[], 
    threats: YoloThreat[], 
    frameW: number, 
    frameH: number
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== frameW || canvas.height !== frameH) {
      canvas.width = frameW || 640;
      canvas.height = frameH || 480;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lineWidth = Math.max(2, Math.round(canvas.width / 240));
    const fontSize = Math.max(12, Math.round(canvas.width / 40));
    ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "bottom";

    for (const d of detections || []) {
      if (!d.box) continue;
      const [x1, y1, x2, y2] = d.box;
      const isThreat = d.threat_level === "danger" || d.is_blind_spot || d.class_name.toLowerCase().includes("threat") || d.class_name.toLowerCase().includes("forklift");
      const boxColor = isThreat ? "#ef4444" : "#10b981";

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Label background
      const label = `${d.class_name.toUpperCase()} ${Math.round(d.confidence * 100)}%${d.est_distance_m ? ` (${d.est_distance_m.toFixed(1)}m)` : ""}`;
      const textWidth = ctx.measureText(label).width;
      const textHeight = fontSize + 6;

      ctx.fillStyle = boxColor;
      ctx.fillRect(x1, Math.max(0, y1 - textHeight), textWidth + 10, textHeight);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x1 + 4, Math.max(textHeight, y1 - 2));

      // Blind spot warning indicator
      if (d.threat_to_target_name) {
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(x1, y2 + 2, textWidth + 16, textHeight);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`🚨 THREAT TO ${d.threat_to_target_name.toUpperCase()}`, x1 + 4, y2 + textHeight - 2);
      }
    }
  }, []);

  // 1. INGEST FROM NEXT.JS SSE REAL-TIME TELEMETRY STREAM (`/api/telemetry/stream`)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource("/api/telemetry/stream");

        eventSource.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const rawDevices: DeviceTelemetry[] = msg.type === "snapshot" ? (msg.devices || []) : (msg.device ? [msg.device] : []);
            
            if (rawDevices.length > 0) {
              const allDetections: YoloDetection[] = [];

              setActiveTiles((prev) => {
                const next = new Map(prev);

                rawDevices.forEach((dev) => {
                  if (dev.type === "station") return;

                  const tileKey = dev.device_id;
                  const existing = next.get(tileKey) || {
                    clientId: dev.device_id,
                    name: dev.name || dev.device_id,
                    detections: [],
                    threats: [],
                    threatLevel: "safe",
                    lastFrameTime: Date.now(),
                    frameWidth: 640,
                    frameHeight: 480
                  };

                  if (dev.image_b64) {
                    existing.imageSrc = dev.image_b64.startsWith("data:") ? dev.image_b64 : `data:image/jpeg;base64,${dev.image_b64}`;
                  }

                  existing.lat = dev.lat;
                  existing.lon = dev.lon;
                  existing.heading = dev.heading_deg ?? dev.heading ?? 0;
                  existing.speed_mps = dev.speed_mps || 0;
                  existing.accuracy_m = dev.accuracy_m || 2.5;
                  existing.lastFrameTime = Date.now();

                  // Map detections
                  const mappedDets: YoloDetection[] = (dev.detections || []).map((d: any) => {
                    const [x, y, w, h] = d.bbox || [60, 80, 260, 200];
                    const detObj: YoloDetection = {
                      box: [x, y, x + w, y + h],
                      class_name: d.class || "threat",
                      confidence: d.confidence || 0.92,
                      threat_level: d.is_blind_spot ? "danger" : "caution",
                      bearing_deg: d.bearing_deg,
                      est_distance_m: d.est_distance_m || 14.0,
                      globalLat: d.globalLat,
                      globalLon: d.globalLon,
                      trajectory_mps: d.trajectory_mps || 4.5,
                      trajectory_heading: d.trajectory_heading,
                      source_device_id: dev.device_id,
                      threat_to_target_id: d.threat_to_target_id,
                      threat_to_target_name: d.threat_to_target_name,
                      is_blind_spot: d.is_blind_spot
                    };
                    allDetections.push(detObj);
                    return detObj;
                  });

                  existing.detections = mappedDets;
                  existing.threatLevel = mappedDets.some((d) => d.is_blind_spot || d.threat_level === "danger") ? "danger" : (mappedDets.length > 0 ? "caution" : "safe");

                  next.set(tileKey, existing);

                  // Draw detections on overlay canvas
                  drawDetections(
                    tileCanvasRefs.current[tileKey] || null,
                    existing.detections,
                    existing.threats,
                    existing.frameWidth || 640,
                    existing.frameHeight || 480
                  );
                });

                return next;
              });

              setActiveThreatMatrix(allDetections);

              // Check alerts
              if (msg.blind_spot_alerts && msg.blind_spot_alerts.length > 0) {
                const firstAlert: BlindSpotAlert = msg.blind_spot_alerts[0];
                triggerGlobalBanner(
                  "danger",
                  `BLIND-SPOT THREAT DISPATCHED [${firstAlert.sourceAgentId} -> ${firstAlert.targetAgentId}]`,
                  firstAlert.message,
                  firstAlert.sourceAgentId,
                  firstAlert.targetAgentId
                );

                setLogs((prev) => [
                  {
                    id: firstAlert.id,
                    timeString: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                    clientId: firstAlert.sourceAgentId,
                    level: "danger",
                    label: `Blind-Spot Hazard (${firstAlert.threatClass})`,
                    message: firstAlert.message,
                    threatTo: firstAlert.targetAgentId,
                    coordinates: `${firstAlert.threatLat.toFixed(5)}°, ${firstAlert.threatLon.toFixed(5)}°`,
                    trajectory: `${firstAlert.distanceToTargetM}m @ ${firstAlert.bearingFromTargetDeg}°`
                  },
                  ...prev.slice(0, 50)
                ]);
              }
            }
          } catch {}
        };

        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
          reconnectTimer = setTimeout(connectSSE, 2500);
        };
      } catch {}
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [drawDetections, triggerGlobalBanner]);

  // 2. INGEST FROM FASTAPI WEBSOCKET (PORT 8000)
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;

    const connectDashboardWs = () => {
      try {
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${host}:8000/ws/dashboard`;

        ws = new WebSocket(wsUrl);
        wsDashRef.current = ws;

        ws.onopen = () => {
          if (isMounted) setBackendConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "video_frame") {
              setActiveTiles((prev) => {
                const next = new Map(prev);
                const existing: LiveCameraTile = next.get(msg.client_id) || {
                  clientId: msg.client_id,
                  name: msg.client_id,
                  imageSrc: undefined,
                  detections: [],
                  threats: [],
                  threatLevel: "safe",
                  lastFrameTime: Date.now(),
                  frameWidth: 640,
                  frameHeight: 480,
                };
                existing.imageSrc = `data:image/jpeg;base64,${msg.image}`;
                existing.lastFrameTime = Date.now();
                next.set(msg.client_id, existing);
                return next;
              });
            } else if (msg.type === "detections") {
              setActiveTiles((prev) => {
                const next = new Map(prev);
                const existing: LiveCameraTile = next.get(msg.client_id) || {
                  clientId: msg.client_id,
                  name: msg.client_id,
                  imageSrc: undefined,
                  detections: [],
                  threats: [],
                  threatLevel: "safe",
                  lastFrameTime: Date.now(),
                  frameWidth: msg.frame_w || 640,
                  frameHeight: msg.frame_h || 480,
                };
                existing.detections = msg.detections || [];
                existing.threats = msg.threats || [];
                existing.threatLevel = existing.threats.some((t) => t.level === "danger") ? "danger" : (existing.threats.some((t) => t.level === "caution") ? "caution" : "safe");
                next.set(msg.client_id, existing);

                drawDetections(
                  tileCanvasRefs.current[msg.client_id] || null,
                  existing.detections,
                  existing.threats,
                  existing.frameWidth || 640,
                  existing.frameHeight || 480
                );
                return next;
              });
            }
          } catch {}
        };

        ws.onclose = () => {
          if (isMounted) setBackendConnected(false);
          setTimeout(connectDashboardWs, 3000);
        };
      } catch {}
    };

    connectDashboardWs();

    return () => {
      isMounted = false;
      if (wsDashRef.current) wsDashRef.current.close();
    };
  }, [drawDetections]);

  // Real Camera Feed toggler
  const toggleLocalWebcam = async () => {
    if (isWebcamActive) {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (wsClientRef.current) wsClientRef.current.close();
      if (webcamVideoRef.current && webcamVideoRef.current.srcObject) {
        const stream = webcamVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        webcamVideoRef.current.srcObject = null;
      }
      setIsWebcamActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          audio: false
        });

        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          await webcamVideoRef.current.play();
        }
        setIsWebcamActive(true);

        // Frame capture loop
        streamIntervalRef.current = setInterval(() => {
          if (!webcamVideoRef.current || !captureCanvasRef.current) return;
          const video = webcamVideoRef.current;
          const canvas = captureCanvasRef.current;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          canvas.width = 480;
          canvas.height = 360;
          ctx.drawImage(video, 0, 0, 480, 360);
          const b64 = canvas.toDataURL("image/jpeg", 0.6);

          // Broadcast to Next.js telemetry
          fetch("/api/telemetry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_id: "station-webcam",
              name: "Command Station Webcam",
              type: "sensor",
              lat: 23.0225,
              lon: 72.5714,
              heading: 0,
              image_b64: b64,
              online: true,
              timestamp: Date.now() / 1000
            })
          }).catch(() => {});
        }, 120);
      } catch {
        alert("Unable to open camera.");
      }
    }
  };

  // 1-Click Multi-Phone Shared Perception Simulation Demo
  const triggerMultiPhoneDemo = async () => {
    // Phone A (Spur worker looking North)
    const phoneA: DeviceTelemetry = {
      device_id: "Phone-Alpha",
      name: "Phone Alpha (Alice)",
      type: "phone",
      lat: 23.02250,
      lon: 72.57140,
      heading: 0,
      heading_deg: 0,
      camera_hfov_deg: 70,
      online: true,
      timestamp: Date.now() / 1000,
      detections: [
        {
          class: "forklift",
          confidence: 0.95,
          bearing_deg: 125,
          est_distance_m: 14.5,
          globalLat: 23.02242,
          globalLon: 72.57152,
          bbox: [120, 100, 320, 240]
        }
      ]
    };

    // Phone B (Worker looking West 270°, vehicle is behind him at 125° -> in his blind spot!)
    const phoneB: DeviceTelemetry = {
      device_id: "Phone-Bravo",
      name: "Phone Bravo (Bob)",
      type: "phone",
      lat: 23.02245,
      lon: 72.57148,
      heading: 270,
      heading_deg: 270,
      camera_hfov_deg: 70,
      online: true,
      timestamp: Date.now() / 1000,
      detections: []
    };

    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phoneA)
    });

    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phoneB)
    });
  };

  const tileList = Array.from(activeTiles.values());
  const effectiveCameraCount = tileList.length + (isWebcamActive ? 1 : 0);
  const filteredLogs = logs.filter((l) => (filterLevel === "all" ? true : l.level === filterLevel));

  if (!mounted) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "18px",
      width: "100%",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Global Hazard Warning Banner */}
      {activeBanner && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 22px",
          backgroundColor: activeBanner.level === "danger" ? "#dc2626" : "#b45309",
          color: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 8px 25px rgba(220, 38, 38, 0.4)",
          animation: "pulse 1.5s infinite"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>{activeBanner.level === "danger" ? "🚨" : "⚠️"}</span>
            <div>
              <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", letterSpacing: "0.06em", textTransform: "uppercase", marginRight: "8px" }}>
                {activeBanner.title}
              </strong>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>{activeBanner.message}</span>
              {activeBanner.threatTo && (
                <span style={{
                  marginLeft: "10px",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 800
                }}>
                  🎯 ALERT SENT TO {activeBanner.threatTo} ONLY
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setActiveBanner(null)}
            style={{
              background: "rgba(255, 255, 255, 0.25)",
              border: "none",
              color: "#fff",
              fontSize: "18px",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Header Strip */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#ffffff",
        padding: "16px 20px",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-light)",
        boxShadow: "var(--shadow-sm)",
        flexWrap: "wrap",
        gap: "14px"
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)"
          }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ fontSize: "17px", fontWeight: 900, color: "#0f172a", margin: 0 }}>
                SHARED<span style={{ color: "#059669" }}>PERCEPTION</span>
              </h1>
              <span style={{
                fontSize: "10px",
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: "4px",
                backgroundColor: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0"
              }}>
                MULTI-PHONE VISION MESH
              </span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              Live multi-camera streams, YOLO object detection, and targeted blind-spot threat dispatch.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Multi-Phone Demo Trigger */}
          <button
            onClick={triggerMultiPhoneDemo}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "#fff1f2",
              color: "#e11d48",
              border: "1.5px solid #fecdd3",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(225, 29, 72, 0.15)"
            }}
          >
            <Sparkles size={14} />
            <span>Simulate Multi-Phone Threat Demo</span>
          </button>

          {/* Real WebCam Toggler */}
          <button
            onClick={toggleLocalWebcam}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              border: isWebcamActive ? "1.5px solid #059669" : "1px solid var(--border-light)",
              backgroundColor: isWebcamActive ? "#ecfdf5" : "#0f172a",
              color: isWebcamActive ? "#065f46" : "#ffffff",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            <Camera size={14} />
            <span>{isWebcamActive ? "Stop Local Camera" : "Start Local Camera Feed"}</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              backgroundColor: soundEnabled ? "#f0fdf4" : "#f8fafc",
              color: soundEnabled ? "#059669" : "var(--text-muted)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundEnabled ? "Audio ON" : "Muted"}</span>
          </button>

          {/* Incident Case Study Modal */}
          <button
            onClick={() => setIsIncidentModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)"
            }}
          >
            <Play size={14} />
            <span>Incident Case Study Video</span>
          </button>
        </div>
      </div>

      {/* TOP STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Active Camera Feeds</span>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
            {effectiveCameraCount}
          </div>
          <span style={{ fontSize: "11px", color: effectiveCameraCount > 0 ? "var(--emerald-primary)" : "var(--text-muted)", fontWeight: 600 }}>
            {effectiveCameraCount > 0 ? "Multi-phone mesh active" : "No camera stream attached"}
          </span>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Tracked Objects (YOLO)</span>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", marginTop: "2px" }}>
            {activeThreatMatrix.length}
          </div>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Real-time bounding boxes</span>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Blind-Spot Hazards</span>
          <div style={{ fontSize: "22px", fontWeight: 900, color: activeThreatMatrix.some((d) => d.is_blind_spot) ? "#dc2626" : "var(--emerald-primary)", marginTop: "2px" }}>
            {activeThreatMatrix.filter((d) => d.is_blind_spot).length}
          </div>
          <span style={{ fontSize: "11px", color: activeThreatMatrix.some((d) => d.is_blind_spot) ? "#dc2626" : "var(--emerald-primary)", fontWeight: 600 }}>
            {activeThreatMatrix.some((d) => d.is_blind_spot) ? "Targeted alarms dispatched" : "All peers clear"}
          </span>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Targeted Socket Alert</span>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "#059669", marginTop: "2px" }}>
            ACTIVE
          </div>
          <span style={{ fontSize: "11px", color: "var(--emerald-primary)", fontWeight: 600 }}>
            70° FOV & Blind-Spot Engine
          </span>
        </div>
      </div>

      {/* MAIN TWO-COLUMN VIEW: (1) MULTI-PHONE CAMERA FEED GRID + (2) LIVE OBJECT & THREAT INTELLIGENCE PANEL */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px", alignItems: "start" }}>
        
        {/* LEFT COLUMN: MULTI-PHONE CAMERA FEED GRID */}
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          padding: "18px",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Video size={18} style={{ color: "#059669" }} />
              <h2 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Live Phone Camera Feeds & YOLO Vision
              </h2>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              {effectiveCameraCount} Camera Node{effectiveCameraCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Empty state when no camera is attached */}
          {effectiveCameraCount === 0 && (
            <div style={{
              border: "1.5px dashed var(--border-light)",
              borderRadius: "12px",
              padding: "50px 20px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px"
            }}>
              <Smartphone size={36} style={{ color: "#94a3b8" }} />
              <div>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  No phone camera feeds currently streaming
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 12px" }}>
                  Open <code>/phone</code> on one or more smartphones to broadcast live video & detections.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={toggleLocalWebcam}
                  style={{
                    backgroundColor: "#059669",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Start Laptop Camera
                </button>
                <button
                  onClick={triggerMultiPhoneDemo}
                  style={{
                    backgroundColor: "#f1f5f9",
                    color: "#0f172a",
                    border: "1px solid var(--border-light)",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Spawn Virtual Phone Feeds
                </button>
              </div>
            </div>
          )}

          {/* Multi-Camera Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: effectiveCameraCount > 1 ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr",
            gap: "14px"
          }}>
            {/* Local Webcam Tile */}
            {isWebcamActive && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{
                  position: "relative",
                  aspectRatio: "4/3",
                  backgroundColor: "#0b120e",
                  borderRadius: "10px",
                  overflow: "hidden",
                  border: "2px solid #059669"
                }}>
                  <video 
                    ref={webcamVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                  />
                  <canvas
                    ref={webcamOverlayCanvasRef}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
                  />
                  <div style={{
                    position: "absolute",
                    left: "8px",
                    bottom: "8px",
                    backgroundColor: "rgba(0,0,0,0.75)",
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    zIndex: 4
                  }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                    <span>LOCAL WEBCAM [LIVE]</span>
                  </div>
                </div>
              </div>
            )}

            {/* Remote Phone Camera Tiles */}
            {tileList.map((tile) => {
              const isDanger = tile.threatLevel === "danger";
              const isCaution = tile.threatLevel === "caution";

              return (
                <div key={tile.clientId} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{
                    position: "relative",
                    aspectRatio: "4/3",
                    backgroundColor: "#0f172a",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: isDanger ? "2px solid #ef4444" : (isCaution ? "2px solid #f59e0b" : "1px solid var(--border-light)"),
                    boxShadow: isDanger ? "0 4px 15px rgba(239, 68, 68, 0.25)" : "none"
                  }}>
                    {tile.imageSrc ? (
                      <img 
                        src={tile.imageSrc} 
                        alt={tile.clientId} 
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} 
                      />
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: "#1e293b",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#94a3b8",
                        gap: "6px"
                      }}>
                        <Smartphone size={32} style={{ opacity: 0.5 }} />
                        <span style={{ fontSize: "11px", fontWeight: 700 }}>Telemetry Stream (No Video)</span>
                      </div>
                    )}

                    {/* Canvas Overlay for YOLO detections */}
                    <canvas
                      ref={(el) => { tileCanvasRefs.current[tile.clientId] = el; }}
                      width={tile.frameWidth || 640}
                      height={tile.frameHeight || 480}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
                    />

                    {/* Header Overlay */}
                    <div style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      right: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      zIndex: 4
                    }}>
                      <div style={{
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        backdropFilter: "blur(4px)",
                        color: "#ffffff",
                        fontSize: "10px",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontFamily: "'JetBrains Mono', monospace"
                      }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: isDanger ? "#ef4444" : "#10b981" }} />
                        <span>{tile.name}</span>
                      </div>

                      {tile.heading !== undefined && (
                        <div style={{
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#38bdf8",
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontFamily: "'JetBrains Mono', monospace"
                        }}>
                          🧭 {tile.heading}°
                        </div>
                      )}
                    </div>

                    {/* Threat Badge */}
                    <div style={{
                      position: "absolute",
                      left: "8px",
                      bottom: "8px",
                      backgroundColor: isDanger ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 23, 42, 0.8)",
                      color: "#ffffff",
                      fontSize: "10px",
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      zIndex: 4
                    }}>
                      {tile.detections.length} OBJECT{tile.detections.length !== 1 ? "S" : ""} DETECTED
                    </div>
                  </div>

                  {/* Tile Footer Details */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      📍 {tile.lat ? `${tile.lat.toFixed(5)}, ${tile.lon?.toFixed(5)}` : "GPS pending"}
                    </span>
                    <span style={{
                      fontWeight: 800,
                      color: isDanger ? "#dc2626" : (isCaution ? "#d97706" : "#059669")
                    }}>
                      {tile.threatLevel.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        </div>

        {/* RIGHT COLUMN: DEDICATED LIVE OBJECT & THREAT INTELLIGENCE PANEL */}
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          padding: "18px",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Target size={18} style={{ color: "#e11d48" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Threat Perception & Target Routing Matrix
              </h3>
            </div>
            <span style={{
              fontSize: "11px",
              fontWeight: 800,
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor: activeThreatMatrix.length > 0 ? "#fee2e2" : "#ecfdf5",
              color: activeThreatMatrix.length > 0 ? "#e11d48" : "#059669"
            }}>
              {activeThreatMatrix.length} active
            </span>
          </div>

          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
            Real-time projection of detected objects, global GPS coordinates, approaching trajectories, and targeted socket dispatch.
          </p>

          {/* ACTIVE DETECTIONS LIST */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
            {activeThreatMatrix.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "36px 12px",
                color: "var(--text-muted)",
                backgroundColor: "#f8fafc",
                borderRadius: "10px",
                border: "1px dashed var(--border-light)"
              }}>
                <ShieldCheck size={32} style={{ color: "#059669", margin: "0 auto 8px" }} />
                <p style={{ fontWeight: 700, margin: 0, color: "#0f172a", fontSize: "13px" }}>
                  Zero active threats detected
                </p>
                <span style={{ fontSize: "11px" }}>
                  All connected cameras report secure workspace.
                </span>
              </div>
            ) : (
              activeThreatMatrix.map((det, idx) => {
                const isBlindSpot = det.is_blind_spot;

                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: isBlindSpot ? "#fff1f2" : "#f8fafc",
                      border: `1.5px solid ${isBlindSpot ? "#fecdd3" : "var(--border-light)"}`,
                      borderLeft: `4px solid ${isBlindSpot ? "#e11d48" : "#10b981"}`,
                      borderRadius: "10px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}
                  >
                    {/* Object & Source */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "16px" }}>{isBlindSpot ? "🚨" : "🏷️"}</span>
                        <strong style={{ fontSize: "13px", color: "#0f172a", textTransform: "uppercase" }}>
                          {det.class_name} ({Math.round(det.confidence * 100)}%)
                        </strong>
                      </div>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: "rgba(15, 23, 42, 0.06)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontFamily: "'JetBrains Mono', monospace"
                      }}>
                        Spotted by: <b>{det.source_device_id}</b>
                      </span>
                    </div>

                    {/* Coordinates & Range */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      backgroundColor: "#ffffff",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid rgba(0,0,0,0.06)"
                    }}>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>📍 Global GPS:</span><br/>
                        <b>{det.globalLat ? `${det.globalLat.toFixed(5)}°, ${det.globalLon?.toFixed(5)}°` : "Estimated"}</b>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>📏 Range & Bearing:</span><br/>
                        <b>{det.est_distance_m ? `${det.est_distance_m.toFixed(1)}m @ ${Math.round(det.bearing_deg || 0)}°` : "Calculated"}</b>
                      </div>
                    </div>

                    {/* Trajectory & Speed */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#334155" }}>
                      <Activity size={13} style={{ color: "#2563eb" }} />
                      <span><b>Trajectory:</b> Approaching at {det.trajectory_mps || 4.5} m/s (Heading {det.trajectory_heading || Math.round(det.bearing_deg || 0)}°)</span>
                    </div>

                    {/* Threat Target & Socket Routing */}
                    {det.threat_to_target_name ? (
                      <div style={{
                        backgroundColor: "#e11d48",
                        color: "#ffffff",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}>
                        <span>🎯 THREAT TO: {det.threat_to_target_name.toUpperCase()} (in blind spot)</span>
                        <span style={{ fontSize: "10px", backgroundColor: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: "3px" }}>
                          ALERT ROUTED TO B ONLY
                        </span>
                      </div>
                    ) : (
                      <div style={{
                        backgroundColor: "#ecfdf5",
                        color: "#065f46",
                        padding: "5px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 600
                      }}>
                        ✅ In direct field of view of observer
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* SITE THREAT AUDIT LOG */}
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>
                Targeted Alert Audit Trail
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                {logs.length} logged
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
              {logs.length === 0 ? (
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>
                  No historical breach events.
                </span>
              ) : (
                logs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      backgroundColor: "#f8fafc",
                      borderLeft: "3px solid #dc2626",
                      fontSize: "11px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <b style={{ color: "#0f172a" }}>{log.clientId}</b> &rarr; <span style={{ color: "#dc2626", fontWeight: 700 }}>{log.threatTo || "Site"}</span>: {log.label}
                    </div>
                    <span style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                      {log.timeString}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Incident Case Study Video Modal */}
      <IncidentAnalysisModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
      />
    </div>
  );
}
