"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import WorksiteGuardDashboard from "@/components/WorksiteGuardDashboard";

export default function VisionPage() {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      backgroundColor: "#f8fafc",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Navigation Sidebar */}
      <Sidebar />

      {/* Main Live Vision & Threat Analysis Workspace */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflowY: "auto",
        padding: "20px"
      }}>
        <WorksiteGuardDashboard />
      </div>
    </div>
  );
}
