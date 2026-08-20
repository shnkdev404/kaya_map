<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/YOLOv8-ultralytics-FF6F00?style=for-the-badge" />
  <img src="https://img.shields.io/badge/TensorFlow.js-4.22-FF6F00?style=for-the-badge&logo=tensorflow" />
  <img src="https://img.shields.io/badge/FastAPI-WebSocket-009688?style=for-the-badge&logo=fastapi" />
  <img src="https://img.shields.io/badge/Leaflet-Maps-199900?style=for-the-badge&logo=leaflet" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python" />
</p>

# KAYA·AI — Real-Time Multi-Agent Spatial Perception & Worksite Safety Platform

> A full-stack, multi-agent spatial intelligence platform that fuses **live GPS telemetry**, **computer vision (YOLO + COCO-SSD)**, **Kalman-filtered positioning**, **geofencing**, and a novel **Shared Perception & Blind-Spot Threat Engine** to create a real-time safety awareness mesh across phones, Raspberry Pis, drones, and edge devices.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Module Deep Dive](#-module-deep-dive)
- [API Reference](#-api-reference)
- [Add-Ons & Potential Enhancements](#-add-ons--potential-enhancements)
- [Weaknesses & Known Limitations](#-weaknesses--known-limitations)
- [License](#-license)

---

## 🔭 Overview

**KAYA·AI** is not just a GPS tracker — it is a **multi-agent worksite perception system** that:

1. **Tracks** any number of devices (phones, Raspberry Pis, vehicles, drones) in real-time on an interactive map with sub-second latency.
2. **Sees** through each device's camera using AI object detection (YOLOv8 server-side, COCO-SSD client-side in the browser).
3. **Thinks** spatially by projecting detected objects onto real-world GPS coordinates using monocular pinhole depth estimation and compass-bearing geometry.
4. **Alerts** automatically when a hazard is detected in one agent's blind spot — the **Shared Perception Engine** checks every detected threat against every peer agent's 70° Field-of-View cone, and sends targeted WebSocket alerts to the specific device at risk.

### Core Innovation: Shared Perception & Blind-Spot Engine

```
  Phone A (facing South, detects "truck" at bearing 195°)
       │
       ├─→ Project threat to global GPS coordinates
       ├─→ Check: Is threat within 40m of Phone B?  ✅ (18m)
       ├─→ Check: Is threat OUTSIDE Phone B's 70° FOV?  ✅ (behind Phone B)
       └─→ 🚨 FIRE targeted blind-spot alert → Phone B's socket ONLY
```

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        KAYA·AI PLATFORM                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │  Next.js 15 App │    │  FastAPI Server   │    │ YOLO Server │ │
│  │  (Frontend)     │    │  (WebSocket Hub)  │    │ (CV Engine) │ │
│  │                 │    │                   │    │             │ │
│  │  • Geofence Map │◄──►│  • /ws/device     │    │ • YOLOv8n   │ │
│  │  • Vision Feed  │    │  • /ws/viewer     │    │ • PPE Model │ │
│  │  • SLAM Tracking│    │  • Broadcast      │    │ • Threat    │ │
│  │  • Reports      │    │                   │    │   Engine    │ │
│  │  • Phone Page   │    └──────────────────-┘    │ • FOV Check │ │
│  │                 │                              └─────────────┘ │
│  │  API Routes:    │                                              │
│  │  POST /api/     │    ┌──────────────────────────────────────┐ │
│  │   telemetry     │◄──►│     Telemetry Store (In-Memory)      │ │
│  │  GET  /api/     │    │  • processTelemetryPacket()          │ │
│  │   telemetry/    │    │  • FOV Polygon Calculation           │ │
│  │   stream (SSE)  │    │  • Threat Projection to GPS          │ │
│  └─────────────────┘    │  • Blind-Spot Cross-Agent Check      │ │
│                          │  • 3-Second TTL Threat Cache         │ │
│                          └──────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐ │
│  │ 📱 Phone      │  │ 🥧 Raspberry  │  │ 🚁 Drone / Vehicle   │ │
│  │ Broadcaster   │  │ Pi Tracker    │  │ (Simulated or Real)   │ │
│  │               │  │               │  │                       │ │
│  │ GPS + Compass │  │ GPS (NEO-6M)  │  │ Circular / Patrol /   │ │
│  │ + Camera      │  │ IMU (BNO055)  │  │ Linear / Random       │ │
│  └───────────────┘  └───────────────┘  └───────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Phone GPS + Heading  ──→  POST /api/telemetry  ──→  processTelemetryPacket()
                                                        │
                                    ┌───────────────────┼──────────────────┐
                                    ▼                   ▼                  ▼
                            Calculate FOV       Project Threats      Check Blind
                            Polygon (70°)       to Global GPS        Spots vs All
                                                                     Peer Agents
                                    │                   │                  │
                                    └───────────────────┼──────────────────┘
                                                        ▼
                                                SSE Broadcast ──→ Dashboard Map
                                                        │
                                                        └──→ Targeted Alert
                                                             to At-Risk Device
```

---

## ✨ Features

### 1. 🗺️ Live Geofence Command Dashboard (`/geofence`)
- **Interactive Leaflet Map** with CartoDB Positron / OSM Light cartography
- **Rotated directional SVG arrow markers** with 70° FOV vision cones rendered live
- **Breadcrumb trail tracking** with polyline history and **GPX export**
- **Circle & polygon geofence zones** with enter/exit breach alerts
- **Ray-casting point-in-polygon** algorithm for accurate polygon containment
- **Geodesic area, perimeter, and centroid** computation for polygon zones
- **360° SVG compass dial** showing true heading, velocity (km/h & m/s), altitude, GPS confidence
- **Connected fleet sidebar** with device type filtering (Phone, Pi, Vehicle, Drone, Sensor, Station)
- **Kalman-filtered GPS** for smooth positioning and outlier rejection
- **QR code connection guide** for mobile onboarding
- **Laptop Base Station mode** — broadcast laptop's GPS as a fixed reference point

### 2. 📹 Live Vision & Threat Analysis (`/vision`)
- **Multi-camera real-time feed** from phones and Raspberry Pis
- **Browser-side object detection** via TensorFlow.js COCO-SSD (lite_mobilenet_v2)
- **Server-side YOLOv8 detection** with threat proximity analysis
- **Monocular pinhole depth estimation**: `distance = (focal_length × real_height) / bbox_height`
- **Pixel-to-bearing conversion** for spatial threat projection
- **Shared Perception Engine**: cross-agent FOV blind-spot verification with targeted alerts
- **Safety alert log** with threat classification and incident analysis
- **Incident Case Study modal** with video playback and spatial reconstruction

### 3. 🤖 SLAM Robot Odometry (`/slam`)
- **6-DoF heading tracking** visualization
- **LiDAR point cloud synthesis** (simulated telemetry)
- **Real-time localization confidence** metrics
- **Geofence zone awareness** integration

### 4. 📊 Safety Reports (`/reports`)
- **WorksiteGuard Dashboard** with aggregated threat and detection summaries
- **Per-camera threat classification** and incident timelines

### 5. 📱 Phone Broadcaster (`/phone`)
- Open `http://<server-ip>:3000/phone` on any smartphone
- Captures GPS via `navigator.geolocation.watchPosition` (high-accuracy mode)
- Reads orientation via `webkitCompassHeading` (iOS) and `deviceorientationabsolute` (Android)
- Streams live camera frames with AI detection overlays
- **Desktop Simulation Mode** for testing on laptops without GPS

### 6. 🎮 Multi-Target Simulator
- Launch virtual vehicles, drones, and edge nodes
- Configurable patterns: **circular**, **patrol**, **linear**, **random**
- Per-target speed, color, and device type customization

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | Next.js 15 (App Router) + React 19 + TypeScript 5.7 |
| **Styling** | Vanilla CSS with custom design tokens (emerald/mint/forest green palette) |
| **Typography** | Plus Jakarta Sans + JetBrains Mono (Google Fonts) |
| **Mapping** | Leaflet.js with CartoDB Positron tiles |
| **Icons** | Lucide React |
| **Client-side AI** | TensorFlow.js 4.22 + COCO-SSD (lite_mobilenet_v2) |
| **Server-side AI** | Ultralytics YOLOv8n (.pt + .onnx) with optional PPE model |
| **Real-time Transport** | Server-Sent Events (SSE) for dashboard, WebSocket for device streams |
| **Backend (Telemetry)** | FastAPI + Uvicorn (Python) with WebSocket endpoints |
| **Backend (CV)** | FastAPI + OpenCV + PyTorch (YOLO inference) |
| **GPS Filtering** | Custom 2D/3D Kinematic Kalman Filter with outlier gating |
| **Geospatial Math** | Haversine formula, ray-casting PIP, equirectangular projection |
| **Edge Clients** | Raspberry Pi (pynmea2 + BNO055 IMU + OpenCV webcam) |
| **HTTPS** | Self-signed certificates (auto-generated via `selfsigned` npm package) |

---

## 📂 Project Structure

```
kaya-tracker/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── layout.tsx                  # Root layout (metadata, fonts)
│   │   ├── globals.css                 # Design system (CSS variables, Leaflet overrides)
│   │   ├── geofence/page.tsx           # 🗺️ Main geofence command dashboard (1624 lines)
│   │   ├── vision/page.tsx             # 📹 Live vision & threat analysis
│   │   ├── slam/page.tsx               # 🤖 SLAM robot odometry
│   │   ├── reports/page.tsx            # 📊 Safety reports
│   │   ├── phone/page.tsx              # 📱 Phone broadcaster (1130 lines)
│   │   └── api/telemetry/
│   │       ├── route.ts                # POST/GET/DELETE telemetry API
│   │       └── stream/route.ts         # SSE real-time stream endpoint
│   ├── components/
│   │   ├── Navigation/Navbar.tsx       # Top navigation bar
│   │   ├── Sidebar.tsx                 # Collapsible side navigation
│   │   ├── Map/LiveMap.tsx             # Leaflet interactive map
│   │   ├── Dashboard/
│   │   │   ├── DeviceCard.tsx          # Device telemetry card
│   │   │   ├── GeofenceModal.tsx       # Geofence creation/management modal
│   │   │   ├── SimulatorModal.tsx      # Multi-target simulator
│   │   │   ├── StationCalibrateModal.tsx # Base station calibration
│   │   │   └── StatsHeader.tsx         # Dashboard statistics
│   │   ├── WorksiteGuardDashboard.tsx  # 📹 Full vision + threat dashboard (1421 lines)
│   │   ├── SafetyAlertLog.tsx          # Safety alert timeline
│   │   ├── SlamTelemetry.tsx           # SLAM telemetry panel
│   │   └── IncidentAnalysisModal.tsx   # Incident video analysis
│   └── lib/
│       ├── types.ts                    # TypeScript type definitions
│       ├── telemetryStore.ts           # Global in-memory telemetry store + SSE broadcast
│       ├── geo.ts                      # Geospatial engine (421 lines)
│       ├── kalman.ts                   # GPS Kalman filter (253 lines)
│       └── detector.ts                 # TF.js COCO-SSD object detector
│
├── yolo/worksite-guard/.../server/
│   ├── main.py                         # FastAPI YOLO WebSocket server (439 lines)
│   ├── threat_engine.py                # Threat classification + blind-spot engine (290 lines)
│   ├── detector.py                     # YOLOv8 detector wrapper
│   ├── config.py                       # Inference & threat geometry settings
│   ├── yolov8n.pt / .onnx             # Pre-trained model weights
│   └── static/                         # Dashboard & client HTML
│
├── yolo/worksite-guard/.../pi_client/
│   └── pi_client.py                    # Raspberry Pi camera + alert client
│
├── server.py                           # FastAPI central WebSocket hub
├── pi_tracker.py                       # Pi GPS + IMU tracker (NEO-6M + BNO055)
├── run.py                              # Central launcher script
├── server-https.js                     # Self-signed HTTPS server for Next.js
├── scripts/
│   ├── test_fov_algorithm.py           # FOV blind-spot algorithm unit tests
│   └── test_perception.js              # Perception system JavaScript tests
│
├── package.json                        # Node dependencies
├── requirements.txt                    # Python dependencies
├── next.config.mjs                     # Next.js config (LAN origins)
└── tsconfig.json                       # TypeScript configuration
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18 and **npm**
- **Python** ≥ 3.10 (for server-side components)

### 1. Frontend (Next.js Dashboard)

```bash
# Install dependencies
npm install

# Start development server (accessible on LAN)
npm run dev
```

Open **`http://localhost:3000`** — this serves the full dashboard.

For **HTTPS** (required for phone GPS on some browsers):

```bash
npm run dev:https
```

### 2. Python Telemetry Server (Optional — for legacy WebSocket mode)

```bash
pip install -r requirements.txt
python run.py
```

### 3. YOLO Vision Server (Optional — for server-side detection)

```bash
cd yolo/worksite-guard/worksite-guard/server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 4. Raspberry Pi Client

```bash
# On the Raspberry Pi:
pip install pynmea2 pyserial adafruit-circuitpython-bno055 websockets

# Edit SERVER_URL in pi_tracker.py, then:
python pi_tracker.py
```

### 5. Connect a Phone

Open `http://<your-lan-ip>:3000/phone` on any smartphone. Grant GPS and camera permissions.

---

## 🔬 Module Deep Dive

### Kalman Filter (`src/lib/kalman.ts`)

A custom 2D/3D kinematic Kalman filter designed for noisy smartphone GPS:

- **Dynamic process noise (Q)** and **measurement noise (R)** scaled by GPS accuracy radius
- **Outlier gating**: rejects multipath / satellite glitch spikes (>35m jumps in <2s with low accuracy)
- **Velocity deadband**: speeds < 0.25 m/s (0.9 km/h) treated as stationary to prevent drift
- **State vector**: `[lat, lon, alt, vLat, vLon, vAlt]` with predict → correct cycle

### Geospatial Engine (`src/lib/geo.ts`)

- **Haversine distance** (great-circle) between GPS coordinates
- **Forward compass bearing** calculation
- **Equirectangular projection** for local coordinate transforms (sub-mm precision at worksite scale)
- **Ray-casting point-in-polygon** for complex polygon geofences
- **Geodesic polygon area** (Shoelace formula on spherical coordinates)
- **FOV polygon generation** (pie-slice cone from agent position)
- **Blind-spot cross-agent verification** across all active agents

### Object Detection (`src/lib/detector.ts`)

Client-side AI inference pipeline:
1. Load TF.js COCO-SSD (lite_mobilenet_v2) with CDN fallback
2. Compute focal length: `f = (W / 2) / tan(HFOV / 2)`
3. Monocular depth: `distance = (f × H_real) / bbox_height`
4. Pixel bearing: `angle_offset = (pixel_offset / half_width) × (HFOV / 2)`
5. Project to GPS: `[lat, lon] = equirectangular_project(observer, bearing, distance)`

### Threat Engine (`yolo/.../threat_engine.py`)

Server-side threat classification:
- **Proximity hazards**: People within danger ratio (15% frame diagonal) of vehicles → DANGER
- **Sharp tool detection**: Knives/scissors near workers → CAUTION
- **Frame debouncing**: 2-of-4 frame confirmation before firing alerts (kills single-frame misclassifications)
- **3-second TTL threat cache**: Threats auto-expire if not re-confirmed
- **Multi-agent FOV blind-spot verification**: Targeted alerts pushed to specific at-risk device sockets

---

## 📡 API Reference

### `POST /api/telemetry`
Submit device telemetry. Processes through the shared perception engine.

```json
{
  "device_id": "phone-01",
  "type": "phone",
  "lat": 23.0225,
  "lon": 72.5714,
  "heading_deg": 145.5,
  "speed_mps": 1.2,
  "camera_hfov_deg": 70,
  "detections": [
    { "class": "car", "confidence": 0.87, "bearing_deg": 12.5, "est_distance_m": 18.3 }
  ]
}
```

**Response** includes FOV polygon point count, active threats, blind-spot alerts targeted at the sender, and latency.

### `GET /api/telemetry`
Returns all active devices and current blind-spot alerts.

### `GET /api/telemetry/stream`
Server-Sent Events stream. Sends initial snapshot, then real-time updates with 10s keepalive heartbeat.

### `DELETE /api/telemetry?device_id=<id>`
Remove a specific device. Use `?clear=all` to reset everything or `?clear=dummy` for simulated devices only.

---

## 🧩 Add-Ons & Potential Enhancements

| # | Enhancement | Impact | Effort |
|---|------------|--------|--------|
| 1 | **Database Persistence** (PostgreSQL / TimescaleDB) — store historical telemetry, GPX tracks, and incidents | 🔴 Critical | Medium |
| 2 | **User Authentication & RBAC** — JWT/OAuth for multi-tenant access, per-site permissions | 🔴 Critical | Medium |
| 3 | **PPE Compliance Detection** — train a custom YOLO model for hard hats, vests, goggles | 🟡 High | Medium |
| 4 | **Push Notifications** — Web Push API / FCM for critical blind-spot alerts when app is backgrounded | 🟡 High | Low |
| 5 | **Audio/Haptic Alerts** — audible siren + vibration on phone when a blind-spot hazard approaches | 🟡 High | Low |
| 6 | **Historical Heatmaps** — aggregate incident/detection data into spatial heatmaps over time | 🟢 Medium | Low |
| 7 | **Multi-floor / Indoor Mapping** — integrate floor plan overlays for warehouses, construction sites | 🟢 Medium | High |
| 8 | **LiDAR / Depth Camera Integration** — replace monocular depth estimation with real depth sensors | 🟡 High | High |
| 9 | **Edge AI on Raspberry Pi** — run lightweight YOLO (e.g., YOLOv8-nano ONNX on NPU) directly on Pi | 🟢 Medium | Medium |
| 10 | **Incident Report Export** — PDF/CSV generation of safety incidents with screenshots and GPS logs | 🟢 Medium | Low |
| 11 | **Multi-site Dashboard** — monitor multiple geographically separated worksites from one HQ view | 🟢 Medium | Medium |
| 12 | **Drone Autopilot Integration** — MAVLink / DJI SDK for autonomous perimeter patrol | 🟢 Medium | High |
| 13 | **Weather Overlay** — integrate weather API for wind/rain hazard warnings on map | 🟢 Low | Low |
| 14 | **Dark Mode** — full dark theme for the entire dashboard | 🟢 Low | Low |
| 15 | **Mobile Native App** — React Native or Flutter app for richer phone broadcasting UX | 🟢 Medium | High |

---

## ⚠️ Weaknesses & Known Limitations

### 🔴 Critical

| # | Weakness | Detail |
|---|----------|--------|
| 1 | **No persistent storage** | All telemetry, threats, and geofences are stored in-memory (`globalThis`). A server restart or Next.js hot-reload wipes everything. No historical data survives. |
| 2 | **No authentication or authorization** | Any device on the LAN can POST telemetry, delete devices, or view all data. No JWT, API keys, or user accounts. |
| 3 | **SSE scalability ceiling** | The SSE stream uses an in-process subscriber set. This does not scale across multiple Next.js server instances or Vercel serverless. Beyond ~50 concurrent clients, backpressure will degrade. |
| 4 | **Hardcoded server URL in Pi client** | `pi_tracker.py` has `SERVER_URL = "ws://SERVER_IP_HERE:8000/ws/device"` — users must manually edit this before deploying. |

### 🟡 Important

| # | Weakness | Detail |
|---|----------|--------|
| 5 | **Monocular depth estimation is approximate** | Distance is estimated from bounding box height vs. assumed real-world object height. This is inherently noisy (±30-50% error) — especially for partially visible or crouching objects. |
| 6 | **Duplicate navigation patterns** | `/vision` and `/reports` pages render the same `WorksiteGuardDashboard` component with no differentiation. This is dead code duplication. |
| 7 | **SLAM telemetry is fully simulated** | The SLAM page generates random jitter — it is not connected to any real SLAM system (ROS, ORB-SLAM, etc.). |
| 8 | **Missing error boundaries** | No React error boundaries in any component. A single detection error or map crash propagates to the entire page. |
| 9 | **No rate limiting on API** | The `POST /api/telemetry` endpoint has no throttling. A misbehaving client can flood the server. |
| 10 | **Threat TTL is fixed at 3 seconds** | The threat cache uses a hard 3-second TTL. Fast-moving threats (vehicles at 60 km/h cover 50m in 3s) may expire before cross-agent correlation completes. |

### 🟢 Minor

| # | Weakness | Detail |
|---|----------|--------|
| 11 | **Giant monolithic components** | `geofence/page.tsx` (1624 lines) and `WorksiteGuardDashboard.tsx` (1421 lines) are very large single-file components. Refactoring into composable hooks + smaller components would improve maintainability. |
| 12 | **Inline styles everywhere** | All components use inline `style={{}}` objects rather than CSS modules, CSS classes, or a styled-components approach. This makes theming, responsive design, and hover states verbose. |
| 13 | **Empty `catch` blocks** | Multiple `try/catch` blocks silently swallow errors (e.g., `telemetryStore.ts:41`, SSE stream handler). This hides bugs in production. |
| 14 | **No CI/CD or linting enforcement** | ESLint is configured but no CI pipeline, pre-commit hooks, or test runner are set up. The only tests are standalone Python/JS scripts. |
| 15 | **`certificates/` directory is empty** | The HTTPS certificate generation creates certs in `.certs/`, but the `certificates/` directory exists empty and unused. |
| 16 | **No TypeScript strict mode** | `tsconfig.json` does not enforce `strict: true`, allowing implicit `any` and potential type safety gaps. |
| 17 | **Video file committed to repo** | A 16MB `Recording 2026-08-20 214608.mp4` (and copy in `public/`) is tracked in git. Binary blobs should use Git LFS or be `.gitignore`d. |
| 18 | **`reactStrictMode: false`** | Strict mode is disabled in `next.config.mjs`, which masks potential side-effect bugs and double-render issues. |

---

## 🎨 Design Aesthetics

- **Minimalist White Canvas**: Clean white backgrounds (`#ffffff`, `#fcfdfc`), delicate borders (`#e5ede6`), soft glassmorphism with `backdrop-filter: blur(12px)`
- **Shades of Green**: Emerald (`#059669`), Mint (`#ecfdf5`), Forest (`#064e3b`), and Jade glow accents
- **Typography**: Plus Jakarta Sans (UI) + JetBrains Mono (telemetry data)
- **Micro-Interactions**: Animated pulse beacons, radar sweep animations, smooth hover transitions, 360° compass rose dial

---

## 📄 License

This project is private and not currently published under an open-source license.

---

<p align="center">
  Built with ☕ and spatial geometry &nbsp;·&nbsp; <strong>KAYA·AI</strong>
</p>
