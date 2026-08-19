"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import SafetyAlertLog from "@/components/SafetyAlertLog";
import { FileText, Download, ShieldCheck, CheckCircle2, AlertTriangle, Calendar, Filter } from "lucide-react";

export default function ReportsPage() {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      backgroundColor: "#f8fafc",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Reports Workspace */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflowY: "auto",
        padding: "20px",
        gap: "20px"
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          padding: "16px 20px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          boxShadow: "var(--shadow-sm)"
        }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>
              Automated Safety & Incident Compliance Reports
            </h1>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              DPDP privacy-certified audit trail with timestamped IMU, geofence breaches, and vision alerts.
            </p>
          </div>

          <button
            onClick={() => alert("Safety Audit CSV exported successfully.")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.2)"
            }}
          >
            <Download size={14} />
            <span>Export Audit Log</span>
          </button>
        </div>

        {/* Metric Cards Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div style={{ backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Incidents Logged</span>
            <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>24</div>
            <span style={{ fontSize: "11px", color: "var(--emerald-primary)", fontWeight: 600 }}>↓ 18% from last shift</span>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Critical Falls & Impacts</span>
            <div style={{ fontSize: "24px", fontWeight: 900, color: "#e11d48", marginTop: "4px" }}>1</div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Resolved by safety marshal</span>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>PPE Compliance Rate</span>
            <div style={{ fontSize: "24px", fontWeight: 900, color: "#059669", marginTop: "4px" }}>97.8%</div>
            <span style={{ fontSize: "11px", color: "var(--emerald-primary)", fontWeight: 600 }}>Certified compliant</span>
          </div>

          <div style={{ backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>DPDP Privacy Compliance</span>
            <div style={{ fontSize: "24px", fontWeight: 900, color: "#2563eb", marginTop: "4px" }}>100%</div>
            <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>Face blurring active</span>
          </div>
        </div>

        {/* Content Section */}
        <div style={{ flex: 1 }}>
          <SafetyAlertLog />
        </div>
      </div>
    </div>
  );
}
