"use client";

import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Search,
  Video,
  Mic,
  ShieldCheck,
  Camera,
  ScanLine,
  SlidersHorizontal,
  User,
  MoveUpRight,
  Box,
  AlertTriangle,
  Zap,
  Eye,
  Layers,
  Sparkles
} from "lucide-react";

interface TrackedObject {
  id: string;
  type: string;
  distance: string;
  status: "Safe" | "Warning" | "Critical";
  confidence: number;
}

const INITIAL_OBJECTS: TrackedObject[] = [
  { id: "1", type: "Person (Worker 1)", distance: "1.2m", status: "Safe", confidence: 96.4 },
  { id: "2", type: "Person (Visitor)", distance: "3.4m", status: "Safe", confidence: 91.2 },
  { id: "3", type: "Heavy Forklift #4", distance: "5.1m", status: "Warning", confidence: 98.7 },
  { id: "4", type: "Person (Technician)", distance: "0.8m", status: "Critical", confidence: 94.8 },
];

export default function VisionDashboard() {
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showFaceBlur, setShowFaceBlur] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [objects, setObjects] = useState<TrackedObject[]>(INITIAL_OBJECTS);

  const filteredObjects = objects.filter((o) => 
    o.type.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      backgroundColor: "#f8fafc",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Shared Navigation Sidebar */}
      <Sidebar />

      {/* Main Vision Workspace */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflowY: "auto",
        color: "#0f172a"
      }}>
        {/* Global Search Header */}
        <header style={{
          height: "64px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", maxWidth: "450px", position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search camera streams, targets or safety events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                borderRadius: "8px",
                border: "1px solid var(--border-light)",
                fontSize: "13px",
                backgroundColor: "var(--bg-card-muted)",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "6px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              fontSize: "11px",
              fontWeight: 800,
              color: "#166534"
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#16a34a" }} className="pulse-active" />
              <span>3 CAMERAS ONLINE</span>
            </div>
          </div>
        </header>

        {/* Main Canvas - 50/50 Grid */}
        <main style={{
          flex: 1,
          padding: "20px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          overflow: "hidden"
        }}>
          
          {/* LEFT HALF: Main Raspberry Pi Camera Stream */}
          <div style={{
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-light)",
            padding: "16px",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: "100%"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Video size={18} style={{ color: "var(--emerald-primary)" }} />
                <h2 style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Raspberry Pi Main Feed (1080p · 60fps)
                </h2>
              </div>
              <span style={{
                fontSize: "10px",
                fontWeight: 800,
                backgroundColor: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
                padding: "2px 8px",
                borderRadius: "4px"
              }}>
                PRIMARY STREAM
              </span>
            </div>

            {/* Video Canvas Container */}
            <div style={{
              flex: 1,
              backgroundColor: "#090d16",
              borderRadius: "10px",
              position: "relative",
              overflow: "hidden",
              border: "1px solid #1e293b",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px"
            }}>
              {/* Badges Over Video */}
              <div style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.65)",
                backdropFilter: "blur(6px)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                padding: "4px 10px",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                zIndex: 10
              }}>
                <Camera size={13} style={{ color: "#94a3b8" }} />
                <span>Cam: Pi-Primary-01</span>
              </div>

              {showFaceBlur && (
                <div style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  backgroundColor: "rgba(5, 150, 105, 0.25)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(16, 185, 129, 0.6)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  color: "#34d399",
                  fontSize: "11px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  zIndex: 10
                }}>
                  <ShieldCheck size={13} />
                  <span>DPDP PRIVACY BLUR ACTIVE</span>
                </div>
              )}

              {/* Simulated AI Object Overlays */}
              {showBoundingBoxes && (
                <>
                  <div style={{
                    position: "absolute",
                    top: "22%",
                    left: "28%",
                    width: "120px",
                    height: "160px",
                    border: "2px solid #10b981",
                    borderRadius: "4px",
                    boxShadow: "0 0 15px rgba(16, 185, 129, 0.4)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "4px",
                    zIndex: 5
                  }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#ffffff", backgroundColor: "#10b981", padding: "1px 4px", borderRadius: "2px", width: "fit-content" }}>
                      Worker · 96%
                    </span>
                    {showFaceBlur && (
                      <div style={{
                        position: "absolute",
                        top: "10px",
                        left: "35px",
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        backdropFilter: "blur(18px)",
                        backgroundColor: "rgba(255, 255, 255, 0.2)",
                        border: "1px dashed rgba(16, 185, 129, 0.8)"
                      }} />
                    )}
                    <span style={{ fontSize: "9px", color: "#34d399", fontWeight: 700, alignSelf: "flex-end", fontFamily: "'JetBrains Mono', monospace" }}>
                      1.2m
                    </span>
                  </div>

                  <div style={{
                    position: "absolute",
                    bottom: "20%",
                    right: "22%",
                    width: "140px",
                    height: "110px",
                    border: "2px solid #ef4444",
                    borderRadius: "4px",
                    boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "4px",
                    zIndex: 5
                  }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#ffffff", backgroundColor: "#ef4444", padding: "1px 4px", borderRadius: "2px", width: "fit-content" }}>
                      ⚠️ No Hardhat · 94%
                    </span>
                    <span style={{ fontSize: "9px", color: "#fca5a5", fontWeight: 700, alignSelf: "flex-end", fontFamily: "'JetBrains Mono', monospace" }}>
                      0.8m Critical
                    </span>
                  </div>
                </>
              )}

              {/* Feed Status Center */}
              <ScanLine size={40} style={{ color: "#334155", marginBottom: "8px" }} className="spin-icon" />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
                AI Vision Pipeline Active · Sub-15ms Latency
              </span>
            </div>

            {/* Overlays Control Toolbar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderTop: "1px solid var(--border-light)",
              paddingTop: "12px",
              flexShrink: 0
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                <SlidersHorizontal size={13} /> Overlays:
              </span>

              <button
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: showBoundingBoxes ? "1px solid #a7f3d0" : "1px solid var(--border-light)",
                  backgroundColor: showBoundingBoxes ? "#ecfdf5" : "#ffffff",
                  color: showBoundingBoxes ? "#065f46" : "var(--text-secondary)"
                }}
              >
                <ScanLine size={13} />
                <span>Bounding Boxes</span>
              </button>

              <button
                onClick={() => setShowFaceBlur(!showFaceBlur)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: showFaceBlur ? "1px solid #a7f3d0" : "1px solid var(--border-light)",
                  backgroundColor: showFaceBlur ? "#ecfdf5" : "#ffffff",
                  color: showFaceBlur ? "#065f46" : "var(--text-secondary)"
                }}
              >
                <ShieldCheck size={13} />
                <span>DPDP Face Blur</span>
              </button>
            </div>
          </div>

          {/* RIGHT HALF: Live Tracking & Threat Matrix */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            height: "100%",
            overflow: "hidden"
          }}>
            {/* Top Right Split: Object Tracking & Threat Detection */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", flex: 1, minHeight: 0 }}>
              
              {/* Box 1: Live Object Tracking */}
              <div style={{
                backgroundColor: "#ffffff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-light)",
                padding: "16px",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px", flexShrink: 0 }}>
                  <Box size={16} style={{ color: "var(--emerald-primary)" }} />
                  <h3 style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>
                    Object Proximity Log
                  </h3>
                </div>

                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {filteredObjects.map((obj) => (
                    <div
                      key={obj.id}
                      style={{
                        padding: "8px 10px",
                        backgroundColor: "#f8fafc",
                        border: "1px solid var(--border-light)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                        <User size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {obj.type}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#059669" }}>
                          {obj.distance}
                        </span>
                        <span style={{
                          fontSize: "9px",
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor: obj.status === "Critical" ? "#ffe4e6" : obj.status === "Warning" ? "#fef3c7" : "#dcfce7",
                          color: obj.status === "Critical" ? "#e11d48" : obj.status === "Warning" ? "#b45309" : "#166534"
                        }}>
                          {obj.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Box 2: Threat Detection */}
              <div style={{
                backgroundColor: "#ffffff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-light)",
                padding: "16px",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px", flexShrink: 0 }}>
                  <AlertTriangle size={16} style={{ color: "#ef4444" }} />
                  <h3 style={{ fontSize: "12px", fontWeight: 800, color: "#991b1b", textTransform: "uppercase" }}>
                    Active Threat Alerts
                  </h3>
                </div>

                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{
                    padding: "10px",
                    backgroundColor: "#fff1f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#e11d48" }}>
                      ⚠️ PPE Violation Detected
                    </span>
                    <span style={{ fontSize: "11px", color: "#9f1239" }}>
                      No Hardhat on Technician (0.8m distance)
                    </span>
                  </div>

                  <div style={{
                    padding: "10px",
                    backgroundColor: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#b45309" }}>
                      ⚠️ Proximity Hazard
                    </span>
                    <span style={{ fontSize: "11px", color: "#92400e" }}>
                      Forklift vehicle within 1.2m of pedestrian lane
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Right: Secondary Feeds */}
            <div style={{
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-light)",
              padding: "16px",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              height: "170px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Camera size={16} style={{ color: "var(--emerald-primary)" }} />
                <h3 style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>
                  Secondary Remote Feeds
                </h3>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", flex: 1 }}>
                <div style={{
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  border: "1px solid #334155"
                }}>
                  <span style={{ position: "absolute", top: "6px", left: "8px", fontSize: "9px", fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.5)", padding: "1px 6px", borderRadius: "4px" }}>
                    Cam 2: Drone Aerial
                  </span>
                  <Video size={20} style={{ color: "#64748b" }} />
                </div>

                <div style={{
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  border: "1px solid #334155"
                }}>
                  <span style={{ position: "absolute", top: "6px", left: "8px", fontSize: "9px", fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.5)", padding: "1px 6px", borderRadius: "4px" }}>
                    Cam 3: Helmet Cam
                  </span>
                  <Video size={20} style={{ color: "#64748b" }} />
                </div>
              </div>
            </div>

          </div>
        </main>

        {/* Footer Status Bar */}
        <footer style={{
          height: "54px",
          backgroundColor: "#ffffff",
          borderTop: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: "12px",
          flexShrink: 0
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#065f46", fontWeight: 600 }}>
            <Mic size={16} style={{ color: "var(--emerald-primary)" }} />
            <span>Audio System: <b style={{ color: "var(--emerald-primary)" }}>Active & Listening</b></span>
          </div>

          <div style={{
            padding: "4px 12px",
            borderRadius: "6px",
            backgroundColor: "#f1f5f9",
            color: "#475569",
            fontWeight: 700,
            fontSize: "11px"
          }}>
            VLM Spatial Analysis Engine Ready
          </div>
        </footer>
      </div>
    </div>
  );
}
