import type { Point } from "./core.ts";

export type MaskStroke = {
  mode: "paint" | "erase";
  radius: number;
  points: Point[];
};
export type PaintedMask = {
  enabled: boolean;
  base: "empty" | "full";
  strokes: MaskStroke[];
};
export const MAX_MASK_STROKES = 64;
export const MAX_MASK_POINTS = 512;

export function validatePaintedMask(
  value: unknown,
): asserts value is PaintedMask {
  const m = value as PaintedMask;
  if (
    !m ||
    typeof m !== "object" ||
    typeof m.enabled !== "boolean" ||
    !["empty", "full"].includes(m.base) ||
    !Array.isArray(m.strokes) ||
    m.strokes.length > MAX_MASK_STROKES
  )
    throw Error("Invalid painted selection.");
  let count = 0;
  for (const s of m.strokes) {
    if (
      !s ||
      !["paint", "erase"].includes(s.mode) ||
      !Number.isFinite(s.radius) ||
      s.radius < 0.005 ||
      s.radius > 0.2 ||
      !Array.isArray(s.points) ||
      s.points.length < 1
    )
      throw Error("Invalid mask stroke.");
    count += s.points.length;
    if (count > MAX_MASK_POINTS)
      throw Error("This painted selection has too many points.");
    for (const p of s.points)
      if (
        !p ||
        ![p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      )
        throw Error("Mask points must stay within the photograph.");
  }
}
export function appendMaskStroke(
  mask: PaintedMask,
  stroke: MaskStroke,
): PaintedMask {
  const next = structuredClone(mask);
  next.strokes.push(structuredClone(stroke));
  validatePaintedMask(next);
  return next;
}
export function samePaintedMask(a?: PaintedMask, b?: PaintedMask) {
  if (!a || !b) return a === b;
  return (
    a.enabled === b.enabled &&
    a.base === b.base &&
    a.strokes.length === b.strokes.length &&
    a.strokes.every(
      (s, i) =>
        s.mode === b.strokes[i].mode &&
        s.radius === b.strokes[i].radius &&
        s.points.length === b.strokes[i].points.length &&
        s.points.every(
          (p, j) =>
            p.x === b.strokes[i].points[j].x &&
            p.y === b.strokes[i].points[j].y,
        ),
    )
  );
}

// Bound a gesture without dropping its first/latest point or introducing jumps.
// Normalized points keep brush geometry independent of source/preview resolution.
export class MaskStrokeBuilder {
  private points: Point[] = [];
  private limit: number;
  private spacing: number;
  constructor(limit: number, spacing: number) {
    if (
      !Number.isInteger(limit) ||
      limit < 2 ||
      limit > MAX_MASK_POINTS ||
      !Number.isFinite(spacing) ||
      spacing <= 0
    )
      throw Error(
        "This selection is full. Undo strokes or clear it before painting.",
      );
    this.limit = limit;
    this.spacing = spacing;
  }
  append(point: Point, force = false) {
    if (!point || ![point.x, point.y].every(Number.isFinite))
      throw Error("Invalid brush coordinates.");
    const p = {
      x: Math.round(Math.max(0, Math.min(1, point.x)) * 1e6) / 1e6,
      y: Math.round(Math.max(0, Math.min(1, point.y)) * 1e6) / 1e6,
    };
    if (![p.x, p.y].every(Number.isFinite))
      throw Error("Invalid brush coordinates.");
    const last = this.points.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < this.spacing && !force)
      return;
    if (last && p.x === last.x && p.y === last.y) return;
    if (this.points.length >= this.limit) {
      if (this.limit === 2) this.points.pop();
      else {
        this.points = this.points.filter((_, i) => i % 2 === 0);
        this.spacing *= 2;
      }
    }
    this.points.push(p);
  }
  get strokePoints() {
    return this.points.map((p) => ({ ...p }));
  }
}
