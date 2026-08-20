"""WorksiteGuard server.

Run (HTTPS is required so phone browsers allow camera access):
    uvicorn main:app --host 0.0.0.0 --port 8000 \
        --ssl-keyfile ../key.pem --ssl-certfile ../cert.pem

See README.md for generating key.pem / cert.pem.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from detector import Detector
from threat_engine import ThreatEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worksite_guard.main")

app = FastAPI(title="WorksiteGuard")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

detector = Detector()
threat_engine = ThreatEngine()
executor = ThreadPoolExecutor(max_workers=4)

dashboards: set[WebSocket] = set()
clients: dict[str, dict] = {}  # client_id -> {"last_seen": ts}
client_sockets: dict[str, WebSocket] = {}
raw_frame_store: dict[str, bytes] = {}
detection_tasks: dict[str, asyncio.Task] = {}
active_threats_by_client: dict[str, list[dict]] = {}
latest_detections_by_client: dict[str, list[dict]] = {}


@app.get("/")
async def dashboard_page():
    return FileResponse(STATIC_DIR / "dashboard.html")


@app.get("/client")
async def client_page():
    return FileResponse(STATIC_DIR / "client.html")


@app.get("/api/clients")
async def list_clients():
    return {cid: {"last_seen": v["last_seen"]} for cid, v in clients.items()}


@app.get("/api/site-perception")
async def site_perception_api():
    all_threats = [
        {"source_client_id": cid, "level": t["level"], "label": t["label"], "message": t["message"]}
        for cid, t_list in active_threats_by_client.items()
        for t in t_list
    ]
    return {
        "clients": list(clients.keys()),
        "active_threats": all_threats,
        "summary": _build_site_summary(),
        "ts": time.time(),
    }


async def _broadcast(message: dict) -> None:
    """Broadcast to all safety dashboards."""
    if not dashboards:
        return
    dead = []
    payload = json.dumps(message)
    for ws in list(dashboards):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        dashboards.discard(ws)


async def _broadcast_to_clients(message: dict, exclude_client_id: str | None = None) -> None:
    """Broadcast to all streaming camera clients (phones, Pis)."""
    if not client_sockets:
        return
    dead = []
    payload = json.dumps(message)
    for cid, ws in list(client_sockets.items()):
        if exclude_client_id and cid == exclude_client_id:
            continue
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(cid)
    for cid in dead:
        client_sockets.pop(cid, None)


async def _broadcast_site_wide(message: dict, exclude_client_id: str | None = None) -> None:
    """Broadcast to dashboards and all active clients for shared worksite perception."""
    await _broadcast(message)
    await _broadcast_to_clients(message, exclude_client_id=exclude_client_id)


def _build_site_summary() -> dict:
    total_people = 0
    total_vehicles = 0
    total_threats = 0
    danger_threats = 0

    for dets in latest_detections_by_client.values():
        for d in dets:
            lbl = str(d.get("label", "")).lower()
            if lbl in ("person", "people"):
                total_people += 1
            elif lbl in ("car", "truck", "bus", "motorcycle", "train", "vehicle", "machinery"):
                total_vehicles += 1

    for thr_list in active_threats_by_client.values():
        total_threats += len(thr_list)
        danger_threats += sum(1 for t in thr_list if t.get("level") == "danger")

    return {
        "cameras_count": len(clients),
        "people_count": total_people,
        "vehicles_count": total_vehicles,
        "threats_count": total_threats,
        "danger_count": danger_threats,
    }


def _run_detection_sync(frame: np.ndarray):
    h, w = frame.shape[:2]
    detections = detector.detect(frame)
    return detections, w, h


async def _detection_loop(client_id: str) -> None:
    loop = asyncio.get_event_loop()
    last_threat_keys: set[str] = set()
    last_perception_sync = 0.0

    try:
        while True:
            await asyncio.sleep(settings.DETECT_INTERVAL)
            data = raw_frame_store.get(client_id)
            if data is None:
                continue
            arr = np.frombuffer(data, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                continue
            detections, w, h = await loop.run_in_executor(executor, _run_detection_sync, frame)
            threats = threat_engine.evaluate(client_id, detections, w, h)
            now_ts = time.time()

            detections_data = [
                {"label": d.label, "confidence": round(d.confidence, 2), "box": [d.x1, d.y1, d.x2, d.y2]}
                for d in detections
            ]
            threats_data = [
                {"level": t.level, "label": t.label, "message": t.message, "box": t.box}
                for t in threats
            ]
            latest_detections_by_client[client_id] = detections_data
            active_threats_by_client[client_id] = threats_data

            # Broadcast detections overlay specifically to dashboard
            await _broadcast({
                "type": "detections",
                "client_id": client_id,
                "frame_w": w,
                "frame_h": h,
                "detections": detections_data,
                "threats": threats_data,
                "ts": now_ts,
            })

            # Check for newly active threats to broadcast site-wide alert across all devices
            current_threat_keys = {f"{t.level}:{t.label}:{t.message}" for t in threats}
            new_keys = current_threat_keys - last_threat_keys
            last_threat_keys = current_threat_keys

            for t in threats:
                key = f"{t.level}:{t.label}:{t.message}"
                if key in new_keys:
                    logger.info("Broadcasting site-wide alert from %s: [%s] %s", client_id, t.level, t.message)
                    await _broadcast_site_wide({
                        "type": "site_alert",
                        "source_client_id": client_id,
                        "level": t.level,
                        "label": t.label,
                        "message": t.message,
                        "box": t.box,
                        "ts": now_ts,
                    })

            # Periodically (or on threat changes), synchronize shared worksite perception
            if new_keys or (now_ts - last_perception_sync >= 1.5):
                last_perception_sync = now_ts
                all_threats = [
                    {"source_client_id": cid, "level": t["level"], "label": t["label"], "message": t["message"]}
                    for cid, t_list in active_threats_by_client.items()
                    for t in t_list
                ]
                await _broadcast_site_wide({
                    "type": "site_perception",
                    "clients": list(clients.keys()),
                    "active_threats": all_threats,
                    "summary": _build_site_summary(),
                    "ts": now_ts,
                })
    except asyncio.CancelledError:
        pass


@app.websocket("/ws/stream/{client_id}")
async def stream_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    clients[client_id] = {"last_seen": time.time()}
    client_sockets[client_id] = websocket
    detection_tasks[client_id] = asyncio.create_task(_detection_loop(client_id))

    logger.info("Client connected: %s", client_id)
    await _broadcast_site_wide({"type": "client_online", "client_id": client_id})

    # Send initial site perception snapshot to the newly connected client
    all_threats = [
        {"source_client_id": cid, "level": t["level"], "label": t["label"], "message": t["message"]}
        for cid, t_list in active_threats_by_client.items()
        for t in t_list
    ]
    await _broadcast_site_wide({
        "type": "site_perception",
        "clients": list(clients.keys()),
        "active_threats": all_threats,
        "summary": _build_site_summary(),
        "ts": time.time(),
    })

    min_interval = 1.0 / settings.VIDEO_RELAY_FPS
    last_relay_ts = 0.0

    try:
        while True:
            data = await websocket.receive_bytes()
            now = time.time()
            if client_id in clients:
                clients[client_id]["last_seen"] = now
            raw_frame_store[client_id] = data

            if now - last_relay_ts < min_interval:
                continue
            last_relay_ts = now

            image_b64 = base64.b64encode(data).decode("ascii")
            await _broadcast({
                "type": "video_frame",
                "client_id": client_id,
                "image": image_b64,
                "ts": now,
            })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("Stream error for %s: %s", client_id, e)
    finally:
        task = detection_tasks.pop(client_id, None)
        if task:
            task.cancel()
        raw_frame_store.pop(client_id, None)
        client_sockets.pop(client_id, None)
        clients.pop(client_id, None)
        active_threats_by_client.pop(client_id, None)
        latest_detections_by_client.pop(client_id, None)

        await _broadcast_site_wide({"type": "client_offline", "client_id": client_id})
        all_threats = [
            {"source_client_id": cid, "level": t["level"], "label": t["label"], "message": t["message"]}
            for cid, t_list in active_threats_by_client.items()
            for t in t_list
        ]
        await _broadcast_site_wide({
            "type": "site_perception",
            "clients": list(clients.keys()),
            "active_threats": all_threats,
            "summary": _build_site_summary(),
            "ts": time.time(),
        })
        logger.info("Client disconnected: %s", client_id)


@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await websocket.accept()
    dashboards.add(websocket)
    try:
        all_threats = [
            {"source_client_id": cid, "level": t["level"], "label": t["label"], "message": t["message"]}
            for cid, t_list in active_threats_by_client.items()
            for t in t_list
        ]
        await websocket.send_text(json.dumps({
            "type": "roster",
            "clients": list(clients.keys()),
            "active_threats": all_threats,
            "summary": _build_site_summary(),
        }))
        while True:
            await websocket.receive_text()  # dashboard doesn't send anything meaningful; keeps the socket alive
    except WebSocketDisconnect:
        pass
    finally:
        dashboards.discard(websocket)

