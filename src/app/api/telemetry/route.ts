import { NextResponse } from "next/server";
import {
  broadcastTelemetryUpdate,
  getTelemetryStore,
  setTelemetryDevice,
  removeTelemetryDevice,
  clearAllTelemetry
} from "@/lib/telemetryStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const device_id = data.device_id || "unknown";

    const payload = {
      ...data,
      device_id,
      server_time: Date.now() / 1000
    };

    setTelemetryDevice(device_id, payload);

    // Instantly notify all SSE listeners (<5ms)
    broadcastTelemetryUpdate({ type: "update", device: payload, timestamp: Date.now() });

    return NextResponse.json({
      status: "ok",
      device_id,
      latency_ms: data.client_time ? Date.now() - data.client_time : 0
    });
  } catch (error) {
    return NextResponse.json({ status: "error", message: "Invalid payload" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    devices: Object.values(getTelemetryStore())
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const device_id = searchParams.get("device_id");
  const clear = searchParams.get("clear");

  if (clear === "all") {
    clearAllTelemetry();
    broadcastTelemetryUpdate({ type: "clear", target: "all" });
    return NextResponse.json({ status: "ok", message: "Cleared all devices" });
  }

  if (clear === "dummy" || clear === "stale") {
    const store = getTelemetryStore();
    Object.keys(store).forEach((id) => {
      if (id.startsWith("sim-") || store[id]?.simulated) {
        removeTelemetryDevice(id);
      }
    });
    return NextResponse.json({ status: "ok", message: "Cleared dummy devices" });
  }

  if (device_id) {
    removeTelemetryDevice(device_id);
    broadcastTelemetryUpdate({ type: "delete", device_id });
    return NextResponse.json({ status: "ok", message: `Device ${device_id} deleted` });
  }

  return NextResponse.json({ status: "ok", message: "No action taken" });
}
