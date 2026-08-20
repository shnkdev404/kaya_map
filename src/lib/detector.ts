import { ThreatDetection } from "./types";
import { projectCoordinates } from "./geo";

let modelPromise: Promise<any> | null = null;
let cachedModel: any = null;

// Approximate real-world heights (in meters) for common classes
const CLASS_HEIGHTS: Record<string, number> = {
  person: 1.7,
  car: 1.5,
  truck: 2.8,
  bus: 3.2,
  motorcycle: 1.2,
  bicycle: 1.1,
  forklift: 2.2,
  threat: 1.8,
  dog: 0.6,
  cat: 0.3,
  backpack: 0.5,
  chair: 0.85,
  "cell phone": 0.15,
  bottle: 0.25,
  laptop: 0.22
};

/**
 * Loads TensorFlow.js and COCO-SSD object detection model with CDN script fallback
 */
export async function loadObjectDetector(): Promise<any> {
  if (cachedModel) return cachedModel;
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    try {
      // 1. Try dynamic import from installed packages
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      cachedModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      return cachedModel;
    } catch (err) {
      console.warn("Module import failed, attempting CDN fallback for COCO-SSD:", err);

      // 2. Browser CDN fallback
      if (typeof window !== "undefined") {
        if (!(window as any).cocoSsd) {
          await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js");
          await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
        }
        cachedModel = await (window as any).cocoSsd.load();
        return cachedModel;
      }
      throw err;
    }
  })();

  return modelPromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

/**
 * Runs real-time AI object detection on a video frame or canvas
 */
export async function detectObjects(
  mediaElement: HTMLVideoElement | HTMLCanvasElement,
  obsLat: number,
  obsLon: number,
  obsHeading: number,
  hfovDeg = 70
): Promise<ThreatDetection[]> {
  try {
    const model = await loadObjectDetector();
    if (!model) return [];

    const predictions = await model.detect(mediaElement);
    if (!predictions || predictions.length === 0) return [];

    const width = mediaElement instanceof HTMLVideoElement ? (mediaElement.videoWidth || 640) : mediaElement.width;
    const height = mediaElement instanceof HTMLVideoElement ? (mediaElement.videoHeight || 480) : mediaElement.height;

    // Focal length estimate in pixels: f = (W / 2) / tan(HFOV / 2)
    const fovRad = (hfovDeg * Math.PI) / 180;
    const focalLengthPx = (width / 2) / Math.tan(fovRad / 2);

    const detections: ThreatDetection[] = predictions.map((pred: any, idx: number) => {
      const [x, y, bw, bh] = pred.bbox; // [x, y, width, height]
      const className = pred.class.toLowerCase();
      const confidence = pred.score || 0.9;

      // 1. Horizontal bearing offset
      const bboxCenterX = x + bw / 2;
      const pixelOffset = bboxCenterX - width / 2;
      const angleOffsetDeg = (pixelOffset / (width / 2)) * (hfovDeg / 2);
      const effectiveBearing = ((obsHeading + angleOffsetDeg) % 360 + 360) % 360;

      // 2. Monocular pinhole depth estimate: d = (f * H_real) / bh
      const realHeightM = CLASS_HEIGHTS[className] || 1.6;
      const safeBboxH = Math.max(bh, 15);
      let estDistanceM = (focalLengthPx * realHeightM) / safeBboxH;
      estDistanceM = Math.max(1.5, Math.min(estDistanceM, 45)); // Clamp between 1.5m and 45m

      // 3. Project global real-world coordinates
      const [gLat, gLon] = projectCoordinates(obsLat, obsLon, effectiveBearing, estDistanceM);

      const isThreatClass = ["car", "truck", "bus", "motorcycle", "forklift", "threat"].includes(className);

      return {
        id: `det-${Date.now()}-${idx}`,
        class: className,
        confidence: Math.round(confidence * 100) / 100,
        bbox: [Math.round(x), Math.round(y), Math.round(bw), Math.round(bh)],
        bearing_deg: Math.round(effectiveBearing * 10) / 10,
        bearing_offset_deg: Math.round(angleOffsetDeg * 10) / 10,
        est_distance_m: Math.round(estDistanceM * 10) / 10,
        globalLat: gLat,
        globalLon: gLon,
        trajectory_mps: isThreatClass ? 4.5 : 1.2,
        trajectory_heading: Math.round(effectiveBearing)
      };
    });

    return detections;
  } catch (err) {
    console.warn("Detection inference error:", err);
    return [];
  }
}
