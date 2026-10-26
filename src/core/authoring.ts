import type { Point, Rect } from "../../experiments/afterimage/core.ts";

export type TextMaterial = {
  kind: "text";
  content: string;
  width: number;
  height: number;
  fontSize: number;
  weight: number;
  lineHeight: number;
  tracking: number;
  align: "left" | "center" | "right";
  color: string;
};
export type ShapeMaterial = {
  kind: "shape";
  shape: "rectangle" | "ellipse";
  width: number;
  height: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
};
export type Artboard = Rect & {
  id: string;
  name: string;
  background: string | null;
  margin: number;
  columns: number;
  gutter: number;
};
export const validColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[a-f\d]{6}$/i.test(v);
const bounded = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validateMaterial(n: TextMaterial | ShapeMaterial) {
  if (
    !bounded(n.width, 1, 4096) ||
    !bounded(n.height, 1, 4096) ||
    n.width * n.height > 8e6
  )
    throw Error(
      "Text and shape boxes must fit within 4096px and 8 megapixels.",
    );
  if (n.kind === "text") {
    if (
      typeof n.content !== "string" ||
      n.content.length > 4096 ||
      !bounded(n.fontSize, 4, 512) ||
      !bounded(n.weight, 100, 900) ||
      !Number.isInteger(n.weight) ||
      !bounded(n.lineHeight, 0.5, 3) ||
      !bounded(n.tracking, -20, 100) ||
      !["left", "center", "right"].includes(n.align) ||
      !validColor(n.color)
    )
      throw Error("Invalid text material.");
  } else if (
    !["rectangle", "ellipse"].includes(n.shape) ||
    (n.fill !== null && !validColor(n.fill)) ||
    (n.stroke !== null && !validColor(n.stroke)) ||
    !bounded(n.strokeWidth, 0, 256)
  )
    throw Error("Invalid shape material.");
}
export function validateArtboards(boards: Artboard[]) {
  if (!Array.isArray(boards) || boards.length > 12)
    throw Error("Use up to 12 artboards.");
  const ids = new Set<string>();
  for (const b of boards) {
    if (
      !b ||
      typeof b.id !== "string" ||
      !b.id.trim() ||
      b.id.length > 160 ||
      ids.has(b.id) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 160 ||
      !bounded(b.x, -1e6, 1e6) ||
      !bounded(b.y, -1e6, 1e6) ||
      !Number.isInteger(b.width) ||
      !Number.isInteger(b.height) ||
      !bounded(b.width, 1, 8192) ||
      !bounded(b.height, 1, 8192) ||
      (b.background !== null && !validColor(b.background)) ||
      !bounded(b.margin, 0, Math.min(b.width, b.height) / 2) ||
      !Number.isInteger(b.columns) ||
      !bounded(b.columns, 1, 24) ||
      !bounded(b.gutter, 0, 8192) ||
      b.width - b.margin * 2 - b.gutter * (b.columns - 1) <= 0
    )
      throw Error(
        "Invalid artboard dimensions or grid. Reduce its margin, columns or gutter.",
      );
    ids.add(b.id);
  }
}
export function columnGuides(b: Artboard): { x: number; width: number }[] {
  validateArtboards([b]);
  const width =
    (b.width - b.margin * 2 - b.gutter * (b.columns - 1)) / b.columns;
  return Array.from({ length: b.columns }, (_, i) => ({
    x: b.margin + i * (width + b.gutter),
    width,
  }));
}
export function artboardAt(id: string, origin: Point): Artboard {
  return {
    id,
    name: "Untitled artboard",
    ...origin,
    width: 1080,
    height: 1350,
    background: "#f4f4ef",
    margin: 64,
    columns: 4,
    gutter: 24,
  };
}

/** Only authored visual settings identify a raster; names and station coordinates are presentation. */
export function materialKey(
  n: TextMaterial | ShapeMaterial,
  quality: "preview" | "export",
): string {
  const visual =
    n.kind === "text"
      ? {
          kind: n.kind,
          width: n.width,
          height: n.height,
          content: n.content,
          fontSize: n.fontSize,
          weight: n.weight,
          lineHeight: n.lineHeight,
          tracking: n.tracking,
          align: n.align,
          color: n.color,
        }
      : {
          kind: n.kind,
          width: n.width,
          height: n.height,
          shape: n.shape,
          fill: n.fill,
          stroke: n.stroke,
          strokeWidth: n.strokeWidth,
        };
  return JSON.stringify({ visual, quality, font: "archivo-bundled-v1" });
}
