"use client";

import React, { useState } from "react";
import { GeofenceZone, DeviceTelemetry } from "@/lib/types";
import { calculateDistanceMeters, formatDistance } from "@/lib/geo";
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  X, 
  MapPin, 
  Bell, 
  Check, 
  Target, 
  AlertTriangle,
  Eye,
  EyeOff
} from "lucide-react";

interface GeofenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  geofences: GeofenceZone[];
  onAddGeofence: (zone: GeofenceZone) => void;
  onToggleGeofence: (id: string) => void;
  onRemoveGeofence: (id: string) => void;
  devices: DeviceTelemetry[];
  selectedDevice: DeviceTelemetry | null;
  mapCenter?: [number, number];
}

const COLOR_PRESETS = [
  { name: "Emerald", value: "#059669" },
  { name: "Mint", value: "#10b981" },
  { name: "Forest", value: "#064e3b" },
  { name: "Amber", value: "#d97706" },
  { name: "Rose", value: "#e11d48" },
  { name: "Indigo", value: "#4f46e5" },
];

export default function GeofenceModal({
  isOpen,
  onClose,
  geofences,
  onAddGeofence,
  onToggleGeofence,
  onRemoveGeofence,
  devices,
  selectedDevice,
  mapCenter
}: GeofenceModalProps) {
  const defaultLat = mapCenter ? mapCenter[0].toFixed(6) : "0.000000";
  const defaultLon = mapCenter ? mapCenter[1].toFixed(6) : "0.000000";
  const [name, setName] = useState("");
  const [lat, setLat] = useState<string>(defaultLat);
  const [lon, setLon] = useState<string>(defaultLon);
  const [radius, setRadius] = useState<number>(300);
  const [alertOnExit, setAlertOnExit] = useState(true);
  const [alertOnEnter, setAlertOnEnter] = useState(true);
  const [selectedColor, setSelectedColor] = useState("#059669");

  // Keep coords synced with mapCenter if opened
  React.useEffect(() => {
    if (mapCenter && (!lat || lat === "0.000000")) {
      setLat(mapCenter[0].toFixed(6));
      setLon(mapCenter[1].toFixed(6));
    }
  }, [mapCenter, isOpen]);

  if (!isOpen) return null;

  const handleUseDeviceLocation = () => {
    if (selectedDevice) {
      setLat(selectedDevice.lat.toFixed(6));
      setLon(selectedDevice.lon.toFixed(6));
    } else if (devices.length > 0) {
      setLat(devices[0].lat.toFixed(6));
      setLon(devices[0].lon.toFixed(6));
    }
  };

  const handleUseMapCenter = () => {
    if (mapCenter) {
      setLat(mapCenter[0].toFixed(6));
      setLon(mapCenter[1].toFixed(6));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      alert("Please enter valid decimal coordinates for latitude and longitude.");
      return;
    }
    if (radius <= 0) {
      alert("Radius must be greater than 0 meters.");
      return;
    }

    const newZone: GeofenceZone = {
      id: `zone-${Date.now()}`,
      name: name.trim() || `Geofence ${geofences.length + 1}`,
      center: [latNum, lonNum],
      radiusMeters: radius,
      alertOnEnter,
      alertOnExit,
      color: selectedColor,
      enabled: true
    };

    onAddGeofence(newZone);
    setName("");
  };

  return (
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
        maxWidth: "620px",
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
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 800, color: "var(--emerald-dark)" }}>
                Geofence Perimeter Manager
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "1px" }}>
                Define coordinates and radius thresholds with automatic breach detection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Active Geofences List */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)" }}>
                Configured Geofences ({geofences.length})
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {geofences.map((zone) => {
                // Calculate device containment stats
                const devicesInside = devices.filter((d) => {
                  const dist = calculateDistanceMeters(d.lat, d.lon, zone.center[0], zone.center[1]);
                  return dist <= zone.radiusMeters;
                });

                return (
                  <div
                    key={zone.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      backgroundColor: zone.enabled ? "#ffffff" : "#f8fafc",
                      border: `1.5px solid ${zone.enabled ? zone.color : "var(--border-light)"}`,
                      borderRadius: "10px",
                      opacity: zone.enabled ? 1 : 0.65,
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: zone.color
                      }} />
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{zone.name}</span>
                          <span style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            backgroundColor: "var(--bg-green-tint)",
                            color: "var(--emerald-dark)"
                          }}>
                            {formatDistance(zone.radiusMeters)} radius
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>
                          {zone.center[0].toFixed(5)}°, {zone.center[1].toFixed(5)}°
                          {devices.length > 0 && (
                            <span style={{ marginLeft: "8px", fontWeight: 600, color: devicesInside.length > 0 ? "var(--emerald-primary)" : "var(--text-muted)" }}>
                              · {devicesInside.length} of {devices.length} devices inside
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => onToggleGeofence(zone.id)}
                        title={zone.enabled ? "Disable Geofence" : "Enable Geofence"}
                        style={{
                          background: "none",
                          border: "1px solid var(--border-light)",
                          borderRadius: "6px",
                          padding: "5px 8px",
                          cursor: "pointer",
                          color: zone.enabled ? "var(--emerald-primary)" : "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "11px",
                          fontWeight: 600
                        }}
                      >
                        {zone.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                        <span>{zone.enabled ? "Active" : "Muted"}</span>
                      </button>

                      <button
                        onClick={() => onRemoveGeofence(zone.id)}
                        title="Delete Geofence"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          padding: "6px"
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {geofences.length === 0 && (
                <div style={{
                  textAlign: "center",
                  padding: "20px",
                  border: "1px dashed var(--border-light)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  fontSize: "12px"
                }}>
                  No geofences defined yet. Use the form below to create your first boundary.
                </div>
              )}
            </div>
          </div>

          {/* Form to Create New Geofence */}
          <form onSubmit={handleSubmit} style={{
            backgroundColor: "var(--bg-card-muted)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--emerald-dark)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Plus size={16} />
              <span>Create New Geofence Zone</span>
            </div>

            {/* Zone Name */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Zone Label / Identifier
              </label>
              <input
                type="text"
                placeholder="e.g. Field Operations Base, Sector Alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  fontSize: "13px",
                  backgroundColor: "#ffffff",
                  outline: "none"
                }}
              />
            </div>

            {/* Latitude & Longitude Coordinates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Center Latitude (decimal °)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 18.520430"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    backgroundColor: "#ffffff",
                    outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Center Longitude (decimal °)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 73.856743"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    backgroundColor: "#ffffff",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Coordinate Fill Shortcuts */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleUseMapCenter}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)",
                  cursor: "pointer"
                }}
              >
                📍 Use Map Center
              </button>

              <button
                type="button"
                onClick={handleUseDeviceLocation}
                disabled={devices.length === 0}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  border: "1px solid var(--border-light)",
                  color: devices.length > 0 ? "var(--emerald-primary)" : "var(--text-muted)",
                  cursor: devices.length > 0 ? "pointer" : "not-allowed"
                }}
              >
                🎯 Use Device Position
              </button>
            </div>

            {/* Radius Slider & Input */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Zone Radius: <span style={{ color: "var(--emerald-primary)", fontWeight: 800 }}>{formatDistance(radius)}</span>
                </label>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>50m to 10,000m</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--emerald-primary)", cursor: "pointer" }}
                />
                <input
                  type="number"
                  min="10"
                  max="100000"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{
                    width: "80px",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    fontSize: "12px",
                    backgroundColor: "#ffffff",
                    textAlign: "right"
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>meters</span>
              </div>
            </div>

            {/* Color Palette Selection */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                Perimeter Color
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setSelectedColor(c.value)}
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      backgroundColor: c.value,
                      border: selectedColor === c.value ? "2.5px solid #0f172a" : "2px solid #ffffff",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {selectedColor === c.value && <Check size={14} color="#ffffff" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Alert Flags */}
            <div style={{ display: "flex", gap: "16px", paddingTop: "4px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={alertOnExit}
                  onChange={(e) => setAlertOnExit(e.target.checked)}
                  style={{ accentColor: "var(--emerald-primary)" }}
                />
                <span>Alert when device EXITS perimeter</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={alertOnEnter}
                  onChange={(e) => setAlertOnEnter(e.target.checked)}
                  style={{ accentColor: "var(--emerald-primary)" }}
                />
                <span>Alert when device ENTERS perimeter</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "8px",
                backgroundColor: "var(--emerald-primary)",
                border: "none",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.25)",
                marginTop: "6px"
              }}
            >
              <Plus size={16} />
              <span>Add Geofence to Map</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
