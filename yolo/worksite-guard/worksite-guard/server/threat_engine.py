"""Turns raw YOLO detections into worker-safety threats.

Two layers guard against the "random misclassified object" problem:
1. Confidence thresholding happens in the detector (config.CONF_THRESHOLD).
2. Temporal debouncing happens here: a threat only fires once it has been
   seen in at least DEBOUNCE_HITS of the last FRAME_HISTORY frames for that
   client, so a single bad frame never raises an alert by itself.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from config import settings
from detector import Detection

# Class names below match both COCO (general model) and the common
# "Construction Site Safety" PPE dataset class set, so this works whether
# or not a PPE model is loaded.
VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle", "train", "vehicle", "machinery"}
SHARP_TOOL_CLASSES = {"knife", "scissors"}
PPE_MISSING_CLASSES = {"NO-Hardhat": "hard hat", "NO-Safety Vest": "safety vest", "NO-Mask": "mask"}


@dataclass
class Threat:
    level: str  # "caution" | "danger"
    label: str
    message: str
    box: tuple[int, int, int, int] | None = None


@dataclass
class _ClientHistory:
    window: Deque[set] = field(default_factory=lambda: deque(maxlen=settings.FRAME_HISTORY))

    def push(self, threat_keys: set) -> None:
        self.window.append(threat_keys)

    def confirmed(self, key: str) -> bool:
        hits = sum(1 for frame_keys in self.window if key in frame_keys)
        return hits >= settings.DEBOUNCE_HITS


class ThreatEngine:
    def __init__(self) -> None:
        self._history: dict[str, _ClientHistory] = {}

    def _hist(self, client_id: str) -> _ClientHistory:
        return self._history.setdefault(client_id, _ClientHistory())

    def evaluate(self, client_id: str, detections: list[Detection], frame_w: int, frame_h: int) -> list[Threat]:
        raw: dict[str, Threat] = {}

        people = [d for d in detections if d.label in ("person", "Person")]
        vehicles = [d for d in detections if d.label in VEHICLE_CLASSES]
        sharp = [d for d in detections if d.label in SHARP_TOOL_CLASSES]
        ppe_missing = [d for d in detections if d.label in PPE_MISSING_CLASSES]

        frame_diag = (frame_w ** 2 + frame_h ** 2) ** 0.5 or 1.0

        # 1. Proximity to vehicles / heavy machinery
        for p in people:
            for v in vehicles:
                ratio = _center_distance(p, v) / frame_diag
                if ratio < settings.PROXIMITY_DANGER_RATIO:
                    key = f"proximity:danger:{v.label}"
                    raw[key] = Threat("danger", "Proximity", f"Worker very close to {v.label}", _union_box(p, v))
                elif ratio < settings.PROXIMITY_CAUTION_RATIO:
                    key = f"proximity:caution:{v.label}"
                    raw.setdefault(key, Threat("caution", "Proximity", f"Worker near {v.label}", _union_box(p, v)))

        # 2. Sharp tools near a person
        for p in people:
            for s in sharp:
                if _center_distance(p, s) / frame_diag < settings.PROXIMITY_DANGER_RATIO:
                    key = f"sharp:{s.label}"
                    raw[key] = Threat("caution", "Sharp object", f"{s.label.capitalize()} near worker", _union_box(p, s))

        # 3. PPE compliance (only populated if a PPE model is loaded)
        for d in ppe_missing:
            item = PPE_MISSING_CLASSES[d.label]
            key = f"ppe:{d.label}"
            raw[key] = Threat("danger", "PPE", f"Worker missing {item}", (d.x1, d.y1, d.x2, d.y2))

        # Debounce against the recent-frame history for this client
        hist = self._hist(client_id)
        hist.push(set(raw.keys()))
        return [t for key, t in raw.items() if hist.confirmed(key)]


def _center_distance(a: Detection, b: Detection) -> float:
    ax, ay = a.center
    bx, by = b.center
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _union_box(a: Detection, b: Detection) -> tuple[int, int, int, int]:
    return (min(a.x1, b.x1), min(a.y1, b.y1), max(a.x2, b.x2), max(a.y2, b.y2))
