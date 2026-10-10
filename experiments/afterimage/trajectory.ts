import type { Params, Point } from "./core.ts";

const MAX_POINTS = 2048;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
function validatePoint(p: Point) {
  if (!p || ![p.x, p.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
    throw Error("Draw within the supported artwork coordinates.");
}

// Collect spatial samples rather than weighting the curve by pointer speed.
// Compaction bounds a long stroke while retaining both endpoints and order.
export class TrajectoryStroke {
  private samples: Point[];
  private last: Point;
  private spacing: number;
  constructor(start: Point, spacing: number) {
    validatePoint(start);
    if (!Number.isFinite(spacing) || spacing <= 0)
      throw Error("Invalid drawing sample spacing.");
    this.samples = [{ ...start }];
    this.last = { ...start };
    this.spacing = spacing;
  }
  append(p: Point) {
    validatePoint(p);
    this.last = { ...p };
    if (distance(this.samples.at(-1)!, p) < this.spacing) return;
    if (this.samples.length >= MAX_POINTS - 1) {
      this.samples = this.samples.filter((_, i) => i % 2 === 0);
      this.spacing *= 2;
    }
    this.samples.push({ ...p });
  }
  get points(): Point[] {
    const points = this.samples.map((p) => ({ ...p }));
    if (distance(points.at(-1)!, this.last) > 0) points.push({ ...this.last });
    return points;
  }
}

// Fit one editable cubic to uniformly spaced samples of the drawn polyline.
// This preserves endpoints, but intentionally smooths detailed/looping strokes.
export function fitTrajectory(
  points: readonly Point[],
  minLength = 1,
): Params["path"] | null {
  if (!Number.isFinite(minLength) || minLength <= 0)
    throw Error("Invalid minimum trajectory length.");
  if (points.length > MAX_POINTS)
    throw Error("The drawn trajectory has too many points.");
  points.forEach(validatePoint);
  const clean = points.filter(
    (p, i) => i === 0 || distance(points[i - 1], p) > 1e-8,
  );
  if (clean.length < 2) return null;
  const lengths = [0];
  for (let i = 1; i < clean.length; i++)
    lengths.push(lengths[i - 1] + distance(clean[i - 1], clean[i]));
  const total = lengths.at(-1)!;
  if (total < minLength) return null;
  const first = clean[0],
    last = clean.at(-1)!;
  let a = 0,
    b = 0,
    c = 0,
    x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0,
    segment = 1;
  for (let i = 1; i < 32; i++) {
    const t = i / 32,
      s = 1 - t,
      at = t * total;
    while (segment < clean.length - 1 && lengths[segment] < at) segment++;
    const u =
      (at - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1]);
    const p = {
      x: clean[segment - 1].x + u * (clean[segment].x - clean[segment - 1].x),
      y: clean[segment - 1].y + u * (clean[segment].y - clean[segment - 1].y),
    };
    const q1 = 3 * s * s * t,
      q2 = 3 * s * t * t;
    const dx = p.x - s * s * s * first.x - t * t * t * last.x;
    const dy = p.y - s * s * s * first.y - t * t * t * last.y;
    a += q1 * q1;
    b += q1 * q2;
    c += q2 * q2;
    x1 += q1 * dx;
    x2 += q2 * dx;
    y1 += q1 * dy;
    y2 += q2 * dy;
  }
  const determinant = a * c - b * b;
  const result: Params["path"] = [
    { ...first },
    { x: (c * x1 - b * x2) / determinant, y: (c * y1 - b * y2) / determinant },
    { x: (a * x2 - b * x1) / determinant, y: (a * y2 - b * y1) / determinant },
    { ...last },
  ];
  result.forEach(validatePoint);
  return result;
}
