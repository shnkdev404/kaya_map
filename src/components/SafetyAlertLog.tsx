"use client";

import React, { useState } from "react";
import { AlertTriangle, ShieldAlert, HardHat, Activity, ShieldCheck, Filter, Download } from "lucide-react";

export interface SafetyEvent {
  id: string;
  timestamp: string;
  type: "PPE_VIOLATION" | "FALL_ALERT" | "ZONE_BREACH" | "PROXIMITY_HAZARD";
  severity: "low" | "medium" | "critical";
  description: string;
  location?: string;
  isFaceHidden: boolean;
}

const INITIAL_EVENTS: SafetyEvent[] = [
  {
    id: "evt-001",
    timestamp: new Date(Date.now() - 1000 * 15).toISOString(), 
    type: "FALL_ALERT",
    severity: "critical",
    description: "IMU accelerometer triggered abnormal 3.2G impact deceleration near Sector 4.",
    location: "Sector 4 - Scaffold Area",
    isFaceHidden: true,
  },
  {
    id: "evt-002",
    timestamp: new Date(Date.now() - 1000 * 120).toISOString(),
    type: "PPE_VIOLATION",
    severity: "medium",
    description: "Camera feed detected worker without certified high-vis vest and hardhat.",
    location: "Main Bay Access Point",
    isFaceHidden: true,
  },
  {
    id: "evt-003",
    timestamp: new Date(Date.now() - 1000 * 340).toISOString(),
    type: "PROXIMITY_HAZARD",
    severity: "medium",
    description: "Forklift vehicle within 1.2m of pedestrian walking lane in loading dock.",
    location: "Loading Dock 2",
    isFaceHidden: true,
  },
  {
    id: "evt-004",
    timestamp: new Date(Date.now() - 1000 * 620).toISOString(),
    type: "ZONE_BREACH",
    severity: "low",
    description: "Target node crossed polygon waypoint perimeter into restricted high-voltage room.",
    location: "Restricted Generator Bay",
    isFaceHidden: true,
  }
];

export default function SafetyAlertLog() {
  const [events, setEvents] = useState<SafetyEvent[]>(INITIAL_EVENTS);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const filteredEvents = events.filter((e) => {
    if (filterSeverity === "all") return true;
    return e.severity === filterSeverity;
  });

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case "critical":
        return { 
          border: "1px solid #fecaca", 
          bg: "#fff1f2", 
          badgeBg: "#ffe4e6",
          badgeText: "#e11d48", 
          subText: "#be123c", 
          icon: <Activity size={15} /> 
        };
      case "medium":
        return { 
          border: "1px solid #fde68a", 
          bg: "#fffbeb", 
          badgeBg: "#fef3c7",
          badgeText: "#b45309", 
          subText: "#92400e", 
          icon: <HardHat size={15} /> 
        };
      default:
        return { 
          border: "1px solid #e2e8f0", 
          bg: "#f8fafc", 
          badgeBg: "#e2e8f0",
          badgeText: "#475569", 
          subText: "#64748b", 
          icon: <ShieldAlert size={15} /> 
        };
    }
  };

  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid var(--border-light)",
      borderRadius: "var(--radius-lg)",
      padding: "20px",
      boxShadow: "var(--shadow-sm)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: "350px"
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            backgroundColor: "#fff1f2",
            color: "#e11d48",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
              Live Safety & Threat Event Log
            </h2>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Automated AI Computer Vision & Sensor Fusion Auditing
            </span>
          </div>
        </div>

        {/* Severity Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {["all", "critical", "medium", "low"].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                border: filterSeverity === sev ? "1px solid #059669" : "1px solid var(--border-light)",
                backgroundColor: filterSeverity === sev ? "#ecfdf5" : "#ffffff",
                color: filterSeverity === sev ? "#065f46" : "var(--text-secondary)",
                textTransform: "capitalize",
                transition: "all 0.15s ease"
              }}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Event List */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        paddingRight: "4px"
      }}>
        {filteredEvents.map((event) => {
          const styles = getSeverityStyles(event.severity);
          
          return (
            <div 
              key={event.id} 
              style={{
                padding: "14px",
                borderRadius: "10px",
                border: styles.border,
                backgroundColor: styles.bg,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                transition: "all 0.15s ease"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: styles.badgeText,
                  backgroundColor: styles.badgeBg,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  letterSpacing: "0.02em"
                }}>
                  {styles.icon}
                  <span>{event.type.replace("_", " ")}</span>
                </div>
                <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", fontWeight: 600 }}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
              
              <div style={{ fontSize: "12px", color: styles.subText, lineHeight: 1.4, fontWeight: 500 }}>
                {event.description}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                {event.location && (
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>
                    📍 {event.location}
                  </span>
                )}
                
                {/* DPDP Compliance Blur Tag */}
                {event.isFaceHidden && (
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 6px",
                    backgroundColor: "#ffffff",
                    borderRadius: "4px",
                    border: "1px solid var(--border-light)",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "var(--emerald-primary)",
                    letterSpacing: "0.04em"
                  }}>
                    <ShieldCheck size={11} />
                    <span>DPDP PRIVACY BLUR ON</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
