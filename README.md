# KAYA // Live GPS & IMU Multi-Device Telemetry Hub

A real-time telemetry command dashboard and mobile broadcaster built with **Next.js**, featuring a **minimalistic white canvas and refined shades of emerald, mint, and forest green**.

Streams high-precision GPS positions, speed, accuracy radiuses, and 3D compass heading from smartphones, Raspberry Pis, and edge devices live onto an interactive map.

---

## 🌿 Design Aesthetics

- **Minimalist White Canvas**: Clean white backgrounds (`#ffffff`, `#fcfdfc`), delicate borders (`#e5ede6`), and soft glassmorphism.
- **Shades of Green**: Emerald (`#059669`), Mint (`#ecfdf5`), Forest (`#064e3b`), and Jade glow accents for active markers and telemetry dials.
- **Micro-Interactions**: Dynamic rotated directional SVG arrow markers with heading cones of vision, animated pulse beacons, and a 360° compass rose dial.

---

## 🚀 Quick Start

### 1. Install Dependencies & Start Next.js App
```bash
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 📱 Features

### 1. Live Command Dashboard (`/`)
- **Interactive Map**: Zero-dependency clean light vector map with rotated directional arrows and accuracy circles.
- **Breadcrumb Trails**: Real-time polyline history tracking with one-click **GPX export**.
- **Telemetry Inspector**: 360° SVG compass dial, true heading, velocity (km/h & m/s), altitude, and GPS confidence radius.
- **Connected Fleet Sidebar**: Filter by device type (Phone, Raspberry Pi, Vehicle, Drone) with live status beacons.

### 2. Mobile Broadcaster (`/phone`)
- Open `http://<server-ip>:3000/phone` on any smartphone.
- Captures GPS via `navigator.geolocation.watchPosition` (high-accuracy mode).
- Reads orientation via `webkitCompassHeading` (iOS) and `deviceorientationabsolute` (Android).
- Includes **Desktop Simulation Mode** for testing motion on laptops/desktops.

### 3. Built-in Multi-Target Simulator
- Launch the simulator from the navbar to test virtual vehicles, drones, and edge nodes with circular, patrol, or roaming patterns.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Vanilla CSS Variables & Design System (Custom minimalist tokens)
- **Mapping**: Leaflet with CartoDB Positron / OSM Light cartography
- **Icons**: Lucide React
