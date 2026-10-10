import { validatePaintedMask } from "./mask.ts";
import type { PaintedMask } from "./mask.ts";
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Params = {
  path: [Point, Point, Point, Point];
  count: number;
  opacity: number;
  falloff: number;
  distribution: number;
  follow: boolean;
  mode: "ghosts" | "exposure";
  mask: boolean;
  feather: number;
  maskCenter: Point;
  maskRadius: Point;
  jitter: number;
  seed: number;
  paintedMask?: PaintedMask;
};
export type Exposure = { x: number; y: number; angle: number; weight: number };
export function defaults(w: number, h: number): Params {
  return {
    path: [
      { x: w * 0.5, y: h * 0.5 },
      { x: w * 0.82, y: h * 0.2 },
      { x: w * 1.02, y: h * 0.77 },
      { x: w * 1.28, y: h * 0.42 },
    ],
    count: 9,
    opacity: 0.8,
    falloff: 0.6,
    distribution: 1,
    follow: false,
    mode: "ghosts",
    mask: true,
    feather: 0.1,
    maskCenter: { x: w * 0.5, y: h * 0.5 },
    maskRadius: { x: w * 0.46, y: h * 0.48 },
    jitter: 0,
    seed: 4719,
  };
}
export function cubic(p: Params["path"], t: number): Point {
  const s = 1 - t;
  return {
    x:
      s * s * s * p[0].x +
      3 * s * s * t * p[1].x +
      3 * s * t * t * p[2].x +
      t * t * t * p[3].x,
    y:
      s * s * s * p[0].y +
      3 * s * s * t * p[1].y +
      3 * s * t * t * p[2].y +
      t * t * t * p[3].y,
  };
}
export function tangent(p: Params["path"], t: number): number {
  const s = 1 - t;
  const x =
    3 * s * s * (p[1].x - p[0].x) +
    6 * s * t * (p[2].x - p[1].x) +
    3 * t * t * (p[3].x - p[2].x);
  const y =
    3 * s * s * (p[1].y - p[0].y) +
    6 * s * t * (p[2].y - p[1].y) +
    3 * t * t * (p[3].y - p[2].y);
  return Math.hypot(x, y) < 1e-8 ? 0 : Math.atan2(y, x);
}
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sample(p: Params): Exposure[] {
  // A fixed 1024-segment arc-length table is an explicit phase-1 accuracy limit.
  const lengths = [0];
  let prev = cubic(p.path, 0);
  for (let i = 1; i <= 1024; i++) {
    const v = cubic(p.path, i / 1024);
    lengths.push(lengths[i - 1] + Math.hypot(v.x - prev.x, v.y - prev.y));
    prev = v;
  }
  const total = lengths[1024],
    rng = random(p.seed),
    startAngle = tangent(p.path, 0);
  return Array.from({ length: p.count }, (_, i) => {
    const u = p.count === 1 ? 0 : i / (p.count - 1),
      distance = Math.pow(u, p.distribution) * total;
    let lo = 0,
      hi = 1024;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (lengths[m] < distance) lo = m + 1;
      else hi = m;
    }
    const before = Math.max(0, lo - 1),
      span = lengths[lo] - lengths[before];
    const t =
      total < 1e-8
        ? 0
        : (before + (span ? (distance - lengths[before]) / span : 0)) / 1024;
    const point = cubic(p.path, t),
      dx = (rng() - 0.5) * p.jitter,
      dy = (rng() - 0.5) * p.jitter;
    return {
      x: point.x - p.path[0].x + (i ? dx : 0),
      y: point.y - p.path[0].y + (i ? dy : 0),
      angle: p.follow ? tangent(p.path, t) - startAngle : 0,
      weight: p.opacity * Math.exp(-p.falloff * 3 * u),
    };
  });
}
export function bounds(
  w: number,
  h: number,
  exposures: Exposure[],
  anchor: Point,
): Rect {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const e of exposures)
    for (const [x, y] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ]) {
      const c = Math.cos(e.angle),
        s = Math.sin(e.angle),
        px = c * (x - anchor.x) - s * (y - anchor.y) + anchor.x + e.x,
        py = s * (x - anchor.x) + c * (y - anchor.y) + anchor.y + e.y;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  return {
    x: Math.floor(minX) - 2,
    y: Math.floor(minY) - 2,
    width: Math.ceil(maxX) - Math.floor(minX) + 4,
    height: Math.ceil(maxY) - Math.floor(minY) + 4,
  };
}
export function squareCapture(r: Rect): Rect {
  const edge = Math.max(r.width, r.height) * 1.12;
  return {
    x: r.x + (r.width - edge) / 2,
    y: r.y + (r.height - edge) / 2,
    width: edge,
    height: edge,
  };
}
// Region selection must not move the exposure's rotation pivot or capture bounds.
export function captureFor(p: Params, width: number, height: number): Rect {
  return squareCapture(
    bounds(width, height, sample(p), { x: width / 2, y: height / 2 }),
  );
}
export function validateParams(p: Params): void {
  if (p?.paintedMask !== undefined) validatePaintedMask(p.paintedMask);
  if (!p || !Array.isArray(p.path) || p.path.length !== 4)
    throw Error("A cubic trajectory needs four points.");
  for (const v of [...p.path, p.maskCenter, p.maskRadius])
    if (
      !v ||
      !Number.isFinite(v.x) ||
      !Number.isFinite(v.y) ||
      Math.abs(v.x) > 1e6 ||
      Math.abs(v.y) > 1e6
    )
      throw Error("Invalid control coordinates.");
  for (const [key, min, max] of [
    ["count", 1, 64],
    ["opacity", 0, 1],
    ["falloff", 0, 2],
    ["distribution", 0.2, 4],
    ["feather", 0.001, 0.5],
    ["jitter", 0, 1000],
    ["seed", 0, 4294967295],
  ] as const) {
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      throw Error(`Invalid ${key}.`);
  }
  if (
    !Number.isInteger(p.count) ||
    !Number.isInteger(p.seed) ||
    p.maskRadius.x <= 0 ||
    p.maskRadius.y <= 0 ||
    !["ghosts", "exposure"].includes(p.mode) ||
    typeof p.mask !== "boolean" ||
    typeof p.follow !== "boolean"
  )
    throw Error("Invalid instrument settings.");
}
export const clone = (p: Params): Params => structuredClone(p);
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const n of bytes) {
    c ^= n;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(data.length + 12),
    v = new DataView(b.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) b[i + 4] = type.charCodeAt(i);
  b.set(data, 8);
  v.setUint32(data.length + 8, crc32(b.subarray(4, -4)));
  return b;
}
