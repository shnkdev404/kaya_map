"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navigation/Navbar";
import { 
  Smartphone, 
  Radio, 
  MapPin, 
  Battery, 
  Check, 
  AlertCircle, 
  Play, 
  Square, 
  ArrowLeft, 
  Compass,
  Sparkles,
  Target,
  Send,
  ShieldAlert,
  Lock,
  Layers,
  Camera,
  RotateCw,
  Eye,
  EyeOff,
  Video,
  Volume2,
  VolumeX,
  Cpu
} from "lucide-react";

import { calculateDistanceMeters, calculateSpeedMps, formatSpeedKmh, projectCoordinates } from "@/lib/geo";
import { GPSKalmanFilter } from "@/lib/kalman";
import { ThreatDetection, BlindSpotAlert } from "@/lib/types";
import { detectObjects, loadObjectDetector } from "@/lib/detector";

export default function PhoneBroadcasterPage() {
  const [deviceId, setDeviceId] = useState("Phone-" + Math.floor(100 + Math.random() * 900));
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [status, setStatus] = useState("Ready to start broadcast");
  const [statusType, setStatusType] = useState<"idle" | "active" | "error">("idle");
  
  // Camera & AI State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isUsingSyntheticVideo, setIsUsingSyntheticVideo] = useState(false);
  const [aiModelLoaded, setAiModelLoaded] = useState(false);

  // GPS Coordinates
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLon, setCurrentLon] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentAltitude, setCurrentAltitude] = useState<number | null>(null);
  const [pingLatency, setPingLatency] = useState<number>(0);

  // IMU / Orientation State
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [hasImuSupport, setHasImuSupport] = useState(false);
  const [needsIosPermission, setNeedsIosPermission] = useState(false);

  // Device & Network State
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isSimulatedWalk, setIsSimulatedWalk] = useState(false);
  const [packetsSent, setPacketsSent] = useState(0);
  const [isSecure, setIsSecure] = useState(true);
  const [hostIp, setHostIp] = useState("");

  // Shared Perception & Threat Detection State
  const [activeDetections, setActiveDetections] = useState<ThreatDetection[]>([]);
  const [blindSpotAlerts, setBlindSpotAlerts] = useState<BlindSpotAlert[]>([]);
  const activeDetectionsRef = useRef<ThreatDetection[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => { activeDetectionsRef.current = activeDetections; }, [activeDetections]);

  // Video and Canvas references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastFrameB64Ref = useRef<string | null>(null);
  const isDetectingRef = useRef<boolean>(false);
  const animTickRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const highRateIntervalRef = useRef<any>(null);
  const streamTickRef = useRef<any>(null);
  const aiDetectionIntervalRef = useRef<any>(null);
  const simIntervalRef = useRef<any>(null);
  const kalmanRef = useRef<GPSKalmanFilter>(new GPSKalmanFilter(2.5));
  
  // High-rate state refs for transmission
  const latestLatRef = useRef<number | null>(null);
  const latestLonRef = useRef<number | null>(null);
  const latestAccuracyRef = useRef<number | null>(null);
  const latestAltitudeRef = useRef<number | null>(null);
  const latestSpeedRef = useRef<number>(0);
  const latestHeadingRef = useRef<number | null>(null);
  const latestPitchRef = useRef<number | null>(null);
  const latestRollRef = useRef<number | null>(null);

  useEffect(() => {
    latestHeadingRef.current = heading;
    latestPitchRef.current = pitch;
    latestRollRef.current = roll;
  }, [heading, pitch, roll]);

  // Pre-load AI Object Detection Model on Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostIp(window.location.host);
      const secure = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setIsSecure(secure);

      loadObjectDetector()
        .then(() => setAiModelLoaded(true))
        .catch(() => {});

      if (
        typeof (DeviceOrientationEvent as any) !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        setNeedsIosPermission(true);
      }
    }
  }, []);

  // Read Battery status if supported
  useEffect(() => {
    if (typeof window !== "undefined" && "getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(battery.level * 100);
        battery.addEventListener("levelchange", () => {
          setBatteryLevel(battery.level * 100);
        });
      }).catch(() => {});
    }
  }, []);

  // Listen to IMU Orientation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      setHasImuSupport(true);
      let calculatedHeading: number | null = null;

      if ((e as any).webkitCompassHeading !== undefined) {
        calculatedHeading = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null) {
        calculatedHeading = (360 - e.alpha) % 360;
      }

      if (calculatedHeading !== null) {
        const rounded = Math.round(calculatedHeading);
        setHeading(rounded);
        latestHeadingRef.current = rounded;
      }
      if (e.beta !== null) {
        const p = Math.round(e.beta);
        setPitch(p);
        latestPitchRef.current = p;
      }
      if (e.gamma !== null) {
        const r = Math.round(e.gamma);
        setRoll(r);
        latestRollRef.current = r;
      }
    };

    const win = window as any;
    if ("ondeviceorientationabsolute" in win) {
      win.addEventListener("deviceorientationabsolute", handleOrientation, true);
    } else if ("ondeviceorientation" in win) {
      win.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      win.removeEventListener("deviceorientationabsolute", handleOrientation);
      win.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  // Synthetic scene renderer for simulation
  const renderSyntheticPhoneScene = (canvas: HTMLCanvasElement, step: number, hdg = 0) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width || 480;
    const h = canvas.height || 360;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#090d16");
    grad.addColorStop(0.48, "#1e293b");
    grad.addColorStop(0.5, "#334155");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
    ctx.lineWidth = 1;
    const horizon = h * 0.48;
    const vanishingX = w * 0.5 + Math.sin((hdg * Math.PI) / 180) * 50;

    for (let x = -w; x <= w * 2; x += 50) {
      ctx.beginPath();
      ctx.moveTo(vanishingX, horizon);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const offset = (step * 4) % 30;
    for (let y = horizon; y <= h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      ctx.lineTo(w, y + offset);
      ctx.stroke();
    }

    // Moving Construction Vehicle
    const vX = w * 0.45 + Math.sin(step * 0.04) * (w * 0.22);
    const vY = horizon + 30 + Math.abs(Math.sin(step * 0.02)) * 40;
    const vScale = 0.85 + (vY - horizon) / (h - horizon);

    ctx.fillStyle = activeDetectionsRef.current.length > 0 ? "#ef4444" : "#f59e0b";
    ctx.fillRect(vX - 28 * vScale, vY - 18 * vScale, 56 * vScale, 32 * vScale);
    ctx.fillStyle = "#020617";
    ctx.fillRect(vX - 30 * vScale, vY + 10 * vScale, 16 * vScale, 12 * vScale);
    ctx.fillRect(vX + 14 * vScale, vY + 10 * vScale, 16 * vScale, 12 * vScale);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(vX - 12 * vScale, vY - 30 * vScale, 24 * vScale, 14 * vScale);

    // Reticle
    ctx.strokeStyle = activeDetectionsRef.current.length > 0 ? "rgba(239, 68, 68, 0.6)" : "rgba(16, 185, 129, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w * 0.32, h * 0.32, w * 0.36, h * 0.36);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillText(`● REC [LIVE] ${deviceId}`, 12, 20);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`HD 1080P · 30 FPS · FOV 70° · HDG ${hdg}°`, 12, 34);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(new Date().toLocaleTimeString(), w - 90, 20);
  };

  useEffect(() => {
    let animId: any;
    const loop = () => {
      animTickRef.current++;
      if (simCanvasRef.current && isCameraActive && (!mediaStreamRef.current || isUsingSyntheticVideo)) {
        renderSyntheticPhoneScene(simCanvasRef.current, animTickRef.current, latestHeadingRef.current || 0);
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isCameraActive, isUsingSyntheticVideo, deviceId]);

  // Start Camera Stream with multi-tier fallback
  const startCamera = async (facing: "environment" | "user" = cameraFacing) => {
    setIsCameraActive(true);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setIsUsingSyntheticVideo(true);
      return;
    }

    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      mediaStreamRef.current = stream;
      setIsUsingSyntheticVideo(false);
      setHasCameraPermission(true);

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Start Real-Time AI Detection Loop (runs every 280ms)
      if (aiDetectionIntervalRef.current) clearInterval(aiDetectionIntervalRef.current);
      aiDetectionIntervalRef.current = setInterval(() => {
        runRealtimeAiDetection();
      }, 280);

    } catch (err: any) {
      console.warn("Hardware camera unavailable, activating synthetic camera:", err);
      setIsUsingSyntheticVideo(true);
      setHasCameraPermission(false);

      if (aiDetectionIntervalRef.current) clearInterval(aiDetectionIntervalRef.current);
      aiDetectionIntervalRef.current = setInterval(() => {
        runRealtimeAiDetection();
      }, 280);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (aiDetectionIntervalRef.current) {
      clearInterval(aiDetectionIntervalRef.current);
      aiDetectionIntervalRef.current = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  // REAL-TIME AI OBJECT DETECTION ON CAMERA FRAME
  const runRealtimeAiDetection = async () => {
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;

    let mediaElem: HTMLVideoElement | HTMLCanvasElement | null = null;
    if (mediaStreamRef.current && videoRef.current && videoRef.current.readyState >= 2 && !isUsingSyntheticVideo) {
      mediaElem = videoRef.current;
    } else if (simCanvasRef.current) {
      mediaElem = simCanvasRef.current;
    }

    if (!mediaElem) {
      isDetectingRef.current = false;
      return;
    }

    try {
      const obsLat = latestLatRef.current || 23.0225;
      const obsLon = latestLonRef.current || 72.5714;
      const obsHdg = latestHeadingRef.current || 0;

      // 1. Run AI Inference (COCO-SSD / MobileNet)
      const detections = await detectObjects(mediaElem, obsLat, obsLon, obsHdg, 70);

      // Attach device metadata
      detections.forEach((d) => {
        d.source_device_id = deviceId;
      });

      setActiveDetections(detections);
      activeDetectionsRef.current = detections;

      // 2. Draw Bounding Boxes on in-camera overlay canvas
      if (overlayCanvasRef.current) {
        const oCtx = overlayCanvasRef.current.getContext("2d");
        if (oCtx) {
          const w = 480;
          const h = 360;
          overlayCanvasRef.current.width = w;
          overlayCanvasRef.current.height = h;
          oCtx.clearRect(0, 0, w, h);

          detections.forEach((det) => {
            if (det.bbox) {
              const [x, y, bw, bh] = det.bbox;
              const isThreat = ["car", "truck", "bus", "motorcycle", "forklift", "threat"].includes(det.class);
              const color = isThreat ? "#ef4444" : "#10b981";

              oCtx.strokeStyle = color;
              oCtx.lineWidth = 2.5;
              oCtx.strokeRect(x, y, bw, bh);

              const label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}% (${det.est_distance_m.toFixed(1)}m)`;
              oCtx.font = "bold 11px 'JetBrains Mono', monospace";
              const tw = oCtx.measureText(label).width;

              oCtx.fillStyle = color;
              oCtx.fillRect(x, Math.max(0, y - 18), tw + 8, 18);
              oCtx.fillStyle = "#ffffff";
              oCtx.fillText(label, x + 4, Math.max(14, y - 4));
            }
          });
        }
      }

      // 3. Capture compact frame for shared perception broadcast (320x240 @ 0.5 quality ~10KB)
      if (captureCanvasRef.current) {
        const canvas = captureCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(mediaElem, 0, 0, 320, 240);
          lastFrameB64Ref.current = canvas.toDataURL("image/jpeg", 0.5);
        }
      }
    } catch (e) {
    } finally {
      isDetectingRef.current = false;
    }
  };

  // Play Audible Blind-Spot Alert
  const playBlindSpotChime = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(659, now + 0.12);
      osc.frequency.setValueAtTime(880, now + 0.24);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  };

  const sendCurrentPose = () => {
    if (latestLatRef.current === null || latestLonRef.current === null) return;

    const payload = {
      device_id: deviceId,
      agent_id: deviceId,
      name: deviceId,
      type: "phone",
      lat: latestLatRef.current,
      lon: latestLonRef.current,
      altitude: latestAltitudeRef.current,
      heading: latestHeadingRef.current,
      heading_deg: latestHeadingRef.current,
      pitch: latestPitchRef.current,
      pitch_deg: latestPitchRef.current,
      roll: latestRollRef.current,
      camera_hfov_deg: 70,
      image_b64: lastFrameB64Ref.current,
      detections: activeDetectionsRef.current,
      accuracy_m: latestAccuracyRef.current,
      speed_mps: latestSpeedRef.current,
      altitude_m: latestAltitudeRef.current,
      battery: batteryLevel,
      timestamp: Date.now() / 1000,
      client_time: Date.now(),
      online: true
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }

    const t0 = Date.now();
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then((res) => res.json())
      .then((data) => {
        const roundtrip = Date.now() - t0;
        setPingLatency(roundtrip);

        if (data.blind_spot_alerts && data.blind_spot_alerts.length > 0) {
          setBlindSpotAlerts(data.blind_spot_alerts);
          playBlindSpotChime();
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([250, 100, 250, 100, 350]);
          }
        } else {
          setBlindSpotAlerts([]);
        }
      })
      .catch(() => {});

    setPacketsSent((p) => p + 1);
  };

  const processGpsFix = (c: GeolocationCoordinates) => {
    const now = Date.now() / 1000;
    const rawLat = c.latitude;
    const rawLon = c.longitude;
    const rawAccuracy = c.accuracy || 5;
    const rawAlt = c.altitude || 0;

    const filtered = kalmanRef.current.update(rawLat, rawLon, rawAccuracy, now, rawAlt);

    latestLatRef.current = filtered.lat;
    latestLonRef.current = filtered.lon;
    latestAccuracyRef.current = filtered.accuracy;
    latestAltitudeRef.current = filtered.alt;

    let speedMps = filtered.speedMps;
    if (c.speed !== null && c.speed !== undefined && c.speed > 0) {
      speedMps = Math.max(c.speed, filtered.speedMps);
    }
    latestSpeedRef.current = speedMps;

    setCurrentLat(filtered.lat);
    setCurrentLon(filtered.lon);
    setCurrentAccuracy(filtered.accuracy);
    setCurrentAltitude(filtered.alt);
    setCurrentSpeed(speedMps);

    sendCurrentPose();
    
    const accuracyLabel = filtered.accuracy <= 4 ? `🛰️ Kalman Lock (±${filtered.accuracy.toFixed(1)}m)` : filtered.accuracy <= 12 ? `Good (±${filtered.accuracy.toFixed(1)}m)` : `Coarse (±${Math.round(filtered.accuracy)}m)`;
    setStatus(`Live GPS: ${filtered.lat.toFixed(6)}, ${filtered.lon.toFixed(6)} · ${accuracyLabel} · ${formatSpeedKmh(speedMps)}`);
    setStatusType("active");
  };

  const startBroadcasting = async () => {
    setIsBroadcasting(true);
    setStatus("Broadcasting Live Telemetry, Camera & AI Detections...");
    setStatusType("active");

    startCamera();

    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      const port = "8000";
      const ws = new WebSocket(`${proto}//${host}:${port}/ws/device`);
      ws.onopen = () => setStatus("Connected to Hub · Live AI Stream Active");
      wsRef.current = ws;
    } catch (e) {}

    streamTickRef.current = setInterval(() => {
      sendCurrentPose();
    }, 280);

    if (isSimulatedWalk) {
      startSimulation();
      return;
    }

    if (typeof window !== "undefined" && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          processGpsFix(pos.coords);
        },
        (err) => {
          console.warn("GPS notice:", err.message);
          let msg = err.message;
          if (err.code === 1) msg = "Location permission denied. Allow location in browser settings.";
          if (err.code === 2) msg = "Position unavailable. Turn on device GPS.";
          setStatus(`GPS Notice: ${msg}`);
          setStatusType("error");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
      watchIdRef.current = watchId;

      highRateIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            processGpsFix(pos.coords);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 3500 }
        );
      }, 400);
    }
  };

  const startSimulation = async () => {
    let baseLat = currentLat || 23.0225;
    let baseLon = currentLon || 72.5714;

    let simLat = baseLat;
    let simLon = baseLon;
    let step = 0;

    simIntervalRef.current = setInterval(() => {
      step += 0.06;
      simLat = baseLat + Math.sin(step) * 0.0025;
      simLon = baseLon + Math.cos(step) * 0.0025;
      const simHeading = Math.round(((Math.atan2(Math.cos(step), -Math.sin(step)) * 180) / Math.PI + 360) % 360);
      const simSpeedMps = 1.4 + Math.sin(step * 2) * 0.3;

      latestLatRef.current = simLat;
      latestLonRef.current = simLon;
      latestAccuracyRef.current = 2.4;
      latestSpeedRef.current = simSpeedMps;
      latestAltitudeRef.current = 14;

      setCurrentLat(simLat);
      setCurrentLon(simLon);
      setCurrentAccuracy(2.4);
      setCurrentSpeed(simSpeedMps);
      setHeading(simHeading);

      sendCurrentPose();
      setStatus(`Simulated GPS: ${simLat.toFixed(6)}, ${simLon.toFixed(6)} · ${formatSpeedKmh(simSpeedMps)}`);
      setStatusType("active");
    }, 280);
  };

  const stopBroadcasting = () => {
    setIsBroadcasting(false);
    setStatus("Broadcast stopped");
    setStatusType("idle");
    stopCamera();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (highRateIntervalRef.current) {
      clearInterval(highRateIntervalRef.current);
      highRateIntervalRef.current = null;
    }
    if (streamTickRef.current) {
      clearInterval(streamTickRef.current);
      streamTickRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    kalmanRef.current.reset();
  };

  // Trigger Sample Threat Detection
  const handleSimulateThreat = (threatClass: string, distanceM: number, bearingOffsetDeg: number) => {
    const obsLat = latestLatRef.current || 23.0225;
    const obsLon = latestLonRef.current || 72.5714;
    const obsHeading = latestHeadingRef.current || 0;

    const effectiveBearing = ((obsHeading + bearingOffsetDeg) % 360 + 360) % 360;
    const [tLat, tLon] = projectCoordinates(obsLat, obsLon, effectiveBearing, distanceM);

    const det: ThreatDetection = {
      id: `det-${Date.now()}`,
      class: threatClass,
      confidence: 0.94,
      bearing_deg: effectiveBearing,
      bearing_offset_deg: bearingOffsetDeg,
      est_distance_m: distanceM,
      globalLat: tLat,
      globalLon: tLon,
      source_device_id: deviceId,
      bbox: [80, 100, 280, 220]
    };

    setActiveDetections([det]);
    activeDetectionsRef.current = [det];
    sendCurrentPose();

    setTimeout(() => {
      setActiveDetections([]);
      activeDetectionsRef.current = [];
      sendCurrentPose();
    }, 4500);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-main)", display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif" }}>
      <Navbar />

      <main style={{
        flex: 1,
        maxWidth: "560px",
        margin: "0 auto",
        width: "100%",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }}>
        {/* Navigation Strip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link
            href="/geofence"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--emerald-primary)",
              textDecoration: "none"
            }}
          >
            <ArrowLeft size={16} />
            <span>Live Command Map</span>
          </Link>

          <Link
            href="/vision"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#2563eb",
              textDecoration: "none"
            }}
          >
            <Video size={16} />
            <span>Shared Perception Hub</span>
          </Link>
        </div>

        {/* Targeted Blind-Spot Warning Banner */}
        {blindSpotAlerts.length > 0 && (
          <div style={{
            backgroundColor: "#dc2626",
            color: "#ffffff",
            borderRadius: "14px",
            padding: "16px 18px",
            boxShadow: "0 8px 25px rgba(220, 38, 38, 0.45)",
            animation: "pulse 1.2s infinite",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "26px" }}>🚨</span>
              <div>
                <strong style={{ fontSize: "14px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  TARGETED BLIND-SPOT WARNING!
                </strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", opacity: 0.95 }}>
                  Hazard approaching your blind spot (spotted by peer camera)
                </p>
              </div>
            </div>

            {blindSpotAlerts.map((alert, idx) => (
              <div key={idx} style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                padding: "10px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: 1.4,
                fontWeight: 600
              }}>
                {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* LIVE CAMERA VIEWFINDER & SENSOR HUD */}
        <div style={{
          backgroundColor: "#0f172a",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid #1e293b",
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          position: "relative"
        }}>
          {/* Video / Canvas Viewport */}
          <div style={{
            position: "relative",
            width: "100%",
            aspectRatio: "4/3",
            backgroundColor: "#000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            {/* Real Hardware Camera Video */}
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                  el.srcObject = mediaStreamRef.current;
                  el.play().catch(() => {});
                }
              }}
              playsInline
              autoPlay
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: isCameraActive && mediaStreamRef.current && !isUsingSyntheticVideo ? "block" : "none"
              }}
            />

            {/* Synthetic Animated Worksite Feed Canvas */}
            <canvas
              ref={simCanvasRef}
              width={480}
              height={360}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: isCameraActive && (isUsingSyntheticVideo || !mediaStreamRef.current) ? "block" : "none"
              }}
            />

            {/* Hidden canvas for frame encoding */}
            <canvas ref={captureCanvasRef} style={{ display: "none" }} />

            {/* Bounding box overlay canvas */}
            <canvas
              ref={overlayCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                display: isCameraActive ? "block" : "none"
              }}
            />

            {!isCameraActive && (
              <div style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
                <Camera size={48} style={{ opacity: 0.4, margin: "0 auto 12px" }} />
                <p style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#94a3b8" }}>
                  AI Camera Standby
                </p>
                <p style={{ fontSize: "12px", margin: "4px 0 14px", color: "#64748b" }}>
                  Tap below to start live camera & AI object detection
                </p>
                <button
                  onClick={() => startCamera()}
                  style={{
                    backgroundColor: "var(--emerald-primary)",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Camera size={16} />
                  <span>Start Camera & AI</span>
                </button>
              </div>
            )}

            {/* In-Viewfinder HUD */}
            {isCameraActive && (
              <>
                {/* Heading Tape Overlay */}
                <div style={{
                  position: "absolute",
                  top: "10px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "rgba(15, 23, 42, 0.75)",
                  backdropFilter: "blur(6px)",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px solid rgba(255,255,255,0.15)"
                }}>
                  <Compass size={13} style={{ color: "#38bdf8" }} />
                  <span>{heading !== null ? `${heading}°` : "0°"}</span>
                  <span style={{ color: "#94a3b8" }}>·</span>
                  <span>{activeDetections.length} AI Objects</span>
                </div>

                {/* Camera Flip Button */}
                <button
                  onClick={toggleCameraFacing}
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    backgroundColor: "rgba(15, 23, 42, 0.75)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                    color: "#ffffff",
                    padding: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <RotateCw size={16} />
                </button>

                {/* Live AI Status Badge */}
                <div style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "10px",
                  backgroundColor: "rgba(5, 150, 105, 0.85)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#ffffff" }} className="pulse-active" />
                  <span>AI YOLO ENGINE ACTIVE ({activeDetections.length} DETECTIONS)</span>
                </div>
              </>
            )}
          </div>

          {/* Camera Action Bar */}
          <div style={{
            padding: "12px 16px",
            backgroundColor: "#090d16",
            borderTop: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => (isCameraActive ? stopCamera() : startCamera())}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  backgroundColor: isCameraActive ? "#ef4444" : "var(--emerald-primary)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Camera size={14} />
                <span>{isCameraActive ? "Stop Camera" : "Start Camera"}</span>
              </button>

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  color: "#e2e8f0",
                  border: "none",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{soundEnabled ? "Audio ON" : "Muted"}</span>
              </button>
            </div>

            <span style={{ fontSize: "11px", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
              {packetsSent} packets · {aiModelLoaded ? "AI Model Ready" : "Loading Model..."}
            </span>
          </div>
        </div>

        {/* BROADCASTER CONTROLS CARD */}
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          border: "1px solid var(--border-light)",
          boxShadow: "var(--shadow-md)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "40px",
                height: "40px",
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
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--emerald-dark)", margin: 0 }}>
                  Phone Pose & Sensors
                </h2>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                  GPS, IMU, and Real-Time AI Object Detection
                </p>
              </div>
            </div>

            {batteryLevel !== null && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                fontWeight: 700,
                color: batteryLevel > 20 ? "var(--emerald-primary)" : "#ef4444",
                backgroundColor: "var(--bg-card-muted)",
                border: "1px solid var(--border-light)",
                padding: "4px 8px",
                borderRadius: "6px"
              }}>
                <Battery size={14} />
                <span>{Math.round(batteryLevel)}%</span>
              </div>
            )}
          </div>

          {/* Node Call-Sign */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Device Node ID
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={isBroadcasting}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border-light)",
                fontSize: "14px",
                fontWeight: 700,
                backgroundColor: isBroadcasting ? "#f8fafc" : "#ffffff",
                color: "#0f172a",
                outline: "none"
              }}
            />
          </div>

          {/* Start / Stop Broadcast Action */}
          <button
            onClick={isBroadcasting ? stopBroadcasting : startBroadcasting}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              backgroundColor: isBroadcasting ? "#ef4444" : "var(--emerald-primary)",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: isBroadcasting ? "0 4px 15px rgba(239, 68, 68, 0.3)" : "0 4px 15px rgba(5, 150, 105, 0.3)"
            }}
          >
            {isBroadcasting ? <Square size={16} /> : <Play size={16} />}
            <span>{isBroadcasting ? "Stop Live Broadcast" : "Start Live Broadcast"}</span>
          </button>

          {/* Status Message */}
          <div style={{
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: statusType === "active" ? "#ecfdf5" : statusType === "error" ? "#fef2f2" : "#f8fafc",
            border: `1px solid ${statusType === "active" ? "#a7f3d0" : statusType === "error" ? "#fecaca" : "var(--border-light)"}`,
            fontSize: "12px",
            color: statusType === "active" ? "#065f46" : statusType === "error" ? "#991b1b" : "#475569",
            fontWeight: 600,
            lineHeight: 1.4
          }}>
            {status}
          </div>

          {/* SIMULATE THREAT / DETECTIONS ON THIS PHONE */}
          <div style={{
            borderTop: "1px solid var(--border-light)",
            paddingTop: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Threat Test Scenarios
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                onClick={() => handleSimulateThreat("forklift", 12.5, 25.0)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  backgroundColor: "#fff1f2",
                  color: "#e11d48",
                  border: "1px solid #fecdd3",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left"
                }}
              >
                🚨 Forklift Threat (12m)
              </button>

              <button
                onClick={() => handleSimulateThreat("vehicle", 15.0, -30.0)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  backgroundColor: "#fff7ed",
                  color: "#ea580c",
                  border: "1px solid #fed7aa",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left"
                }}
              >
                ⚠️ Vehicle Incursion (15m)
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
