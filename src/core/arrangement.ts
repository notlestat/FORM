import { transformedBounds, validateField } from "./field.ts";
import type { FieldDocument, Placement } from "./field.ts";
import type { Point, Rect } from "../../experiments/afterimage/core.ts";

export type Alignment =
  "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type ArtworkSizes = Map<string, { width: number; height: number }>;
export type SpacingAxis = "x" | "y";
export type SpacingMode = "gaps" | "centres";

type SelectionPointer = Pick<
  PointerEvent,
  "shiftKey" | "button" | "isPrimary" | "preventDefault" | "stopPropagation"
>;
/** Capture before drawing overlays; transform handles retain Shift resizing. */
export function captureArtworkSelection(
  event: SelectionPointer,
  transformHandle: boolean,
  select: () => void,
): boolean {
  if (
    !event.shiftKey ||
    event.button !== 0 ||
    !event.isPrimary ||
    transformHandle
  )
    return false;
  event.preventDefault();
  event.stopPropagation();
  select();
  return true;
}

/** Selection is presentation state; Shift toggles membership without duplicate IDs. */
export function artworkSelection(
  current: string[],
  id: string,
  additive: boolean,
  preserve = false,
): string[] {
  const existing = [...new Set(current)];
  if (!additive) return preserve && existing.includes(id) ? existing : [id];
  return existing.includes(id)
    ? existing.filter((value) => value !== id)
    : [...existing, id];
}
function selected(d: FieldDocument, ids: string[]): Placement[] {
  const unique = new Set(ids);
  const placements = d.placements.filter((p) => unique.has(p.id));
  if (!placements.length || placements.length !== unique.size)
    throw Error("Select existing artwork to arrange.");
  return placements;
}
export function artworkRect(p: Placement, sizes: ArtworkSizes): Rect {
  const size = sizes.get(p.nodeId);
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  )
    throw Error("Render all selected artwork before aligning it.");
  return transformedBounds(
    { x: 0, y: 0, width: size.width, height: size.height },
    p.transform,
  );
}
export function selectionBounds(
  d: FieldDocument,
  ids: string[],
  sizes: ArtworkSizes,
): Rect {
  const bounds = selected(d, ids).map((p) => artworkRect(p, sizes));
  const x = Math.min(...bounds.map((r) => r.x)),
    y = Math.min(...bounds.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...bounds.map((r) => r.x + r.width)) - x,
    height: Math.max(...bounds.map((r) => r.y + r.height)) - y,
  };
}
export function translateArtwork(
  d: FieldDocument,
  ids: string[],
  delta: Point,
): FieldDocument {
  const next = structuredClone(d);
  for (const p of selected(next, ids)) {
    p.transform.x += delta.x;
    p.transform.y += delta.y;
  }
  validateField(next);
  return next;
}
export function alignArtwork(
  d: FieldDocument,
  ids: string[],
  sizes: ArtworkSizes,
  alignment: Alignment,
): FieldDocument {
  const next = structuredClone(d),
    placements = selected(next, ids);
  if (placements.length < 2)
    throw Error("Select at least two artworks to align.");
  const box = selectionBounds(next, ids, sizes);
  for (const p of placements) {
    const r = artworkRect(p, sizes);
    switch (alignment) {
      case "left":
        p.transform.x += box.x - r.x;
        break;
      case "center-x":
        p.transform.x += box.x + box.width / 2 - r.x - r.width / 2;
        break;
      case "right":
        p.transform.x += box.x + box.width - r.x - r.width;
        break;
      case "top":
        p.transform.y += box.y - r.y;
        break;
      case "center-y":
        p.transform.y += box.y + box.height / 2 - r.y - r.height / 2;
        break;
      case "bottom":
        p.transform.y += box.y + box.height - r.y - r.height;
        break;
    }
  }
  validateField(next);
  return next;
}
export function removeArtwork(d: FieldDocument, ids: string[]): FieldDocument {
  selected(d, ids);
  const next = structuredClone(d),
    removed = new Set(ids);
  next.placements = next.placements.filter((p) => !removed.has(p.id));
  validateField(next);
  return next;
}

/** Keep the first/last centre-ordered images fixed and arrange the interior. */
export function distributeArtwork(
  d: FieldDocument,
  ids: string[],
  sizes: ArtworkSizes,
  axis: SpacingAxis,
  mode: SpacingMode,
): FieldDocument {
  const next = structuredClone(d);
  const items = selected(next, ids)
    .map((p) => {
      const r = artworkRect(p, sizes),
        length = axis === "x" ? r.width : r.height;
      return { p, start: r[axis], length, centre: r[axis] + length / 2 };
    })
    .sort(
      (a, b) =>
        a.centre - b.centre || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0),
    );
  if (items.length < 3)
    throw Error("Select at least three artworks to distribute.");
  const first = items[0],
    last = items.at(-1)!;
  const gap =
    (last.start +
      last.length -
      first.start -
      items.reduce((sum, item) => sum + item.length, 0)) /
    (items.length - 1);
  if (mode === "gaps" && gap < -1e-8)
    throw Error(
      "Not enough room for equal gaps. Move the two outer artworks farther apart, or use equal centres.",
    );
  const step = (last.centre - first.centre) / (items.length - 1);
  let cursor = first.start + first.length + Math.max(0, gap);
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i];
    const target =
      mode === "centres" ? first.centre + step * i - item.length / 2 : cursor;
    const delta = target - item.start;
    if (Math.abs(delta) > 1e-8) item.p.transform[axis] += delta;
    cursor += item.length + Math.max(0, gap);
  }
  validateField(next);
  return next;
}
