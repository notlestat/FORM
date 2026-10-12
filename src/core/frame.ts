import { validateField } from "./field.ts";
import type { FieldDocument, FieldNode } from "./field.ts";
import type { Artboard } from "./authoring.ts";
import type { Point } from "../../experiments/afterimage/core.ts";
import { selectionBounds } from "./arrangement.ts";

export function placeMaterial(
  d: FieldDocument,
  kind: "text" | "rectangle" | "ellipse",
  origin: Point,
  id: () => string,
) {
  const next = structuredClone(d),
    nodeId = id(),
    placementId = id();
  const node: FieldNode =
    kind === "text"
      ? {
          id: nodeId,
          name: "Text",
          position: { ...origin },
          kind: "text",
          content: "FORM",
          width: 900,
          height: 280,
          fontSize: 160,
          weight: 600,
          lineHeight: 1.1,
          tracking: 0,
          align: "left",
          color: "#242823",
        }
      : {
          id: nodeId,
          name: kind === "ellipse" ? "Ellipse" : "Rectangle",
          position: { ...origin },
          kind: "shape",
          shape: kind,
          width: 400,
          height: 400,
          fill: "#242823",
          stroke: null,
          strokeWidth: 2,
        };
  next.nodes.push(node);
  next.placements.push({
    id: placementId,
    nodeId,
    name: node.name,
    transform: { ...origin, scaleX: 1, scaleY: 1, rotation: 0 },
    visible: true,
    included: true,
  });
  validateField(next);
  return { document: next, placementId };
}
/** Maps selected artwork as a group into the artboard's live area, preserving its proportions. */
export function fitArtworkToArtboard(
  d: FieldDocument,
  ids: string[],
  sizes: Map<string, { width: number; height: number }>,
  board: Artboard,
): FieldDocument {
  if (!ids.length) throw Error("Select artwork to fit to the artboard.");
  const bounds = selectionBounds(d, ids, sizes),
    next = structuredClone(d);
  const scale = Math.min(
    (board.width - board.margin * 2) / bounds.width,
    (board.height - board.margin * 2) / bounds.height,
  );
  const cx = bounds.x + bounds.width / 2,
    cy = bounds.y + bounds.height / 2;
  for (const p of next.placements)
    if (ids.includes(p.id)) {
      p.transform.x = board.x + board.width / 2 + (p.transform.x - cx) * scale;
      p.transform.y = board.y + board.height / 2 + (p.transform.y - cy) * scale;
      p.transform.scaleX *= scale;
      p.transform.scaleY *= scale;
    }
  validateField(next);
  return next;
}
/** Character tracking and wrapping are identical in preview and capture. Explicit blank lines survive. */
export function textLines(
  content: string,
  width: number,
  tracking: number,
  measure: (s: string) => number,
): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = (s: string) =>
    Array.from(segmenter.segment(s), (x) => x.segment);
  const lines: string[] = [];
  for (const paragraph of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "",
      used = 0;
    const flush = () => {
      lines.push(line.trimEnd());
      line = "";
      used = 0;
    };
    for (const token of paragraph.split(/(\s+)/)) {
      if (!token) continue;
      const letters = graphemes(token),
        widths = letters.map(measure);
      const tokenWidth =
        widths.reduce((a, b) => a + b, 0) +
        Math.max(0, letters.length - 1) * tracking;
      if (line && used + tracking + tokenWidth > width) flush();
      if (!line && /^\s+$/.test(token)) continue;
      letters.forEach((letter, i) => {
        if (line && used + tracking + widths[i] > width) flush();
        used += widths[i] + (line ? tracking : 0);
        line += letter;
      });
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Builds a new editable composition. Source placements and process nodes remain intact. */
export function contactSheet(
  d: FieldDocument,
  ids: string[],
  sizes: Map<string, { width: number; height: number }>,
  id: () => string,
) {
  const selected = d.placements.filter((p) => ids.includes(p.id));
  if (!selected.length || selected.length > 12)
    throw Error("Select 1–12 artworks for a contact sheet.");
  if (selected.length !== new Set(ids).size)
    throw Error("A selected artwork is missing.");
  const next = structuredClone(d),
    columns = Math.min(3, selected.length),
    margin = 64,
    gap = 32,
    cellWidth = 280,
    cellHeight = 380;
  const bounds = selectionBounds(d, ids, sizes),
    last = next.artboards.at(-1);
  const board: Artboard = {
    id: id(),
    name: "Contact sheet",
    x: Math.max(bounds.x + bounds.width, last ? last.x + last.width : 0) + 160,
    y: last?.y ?? bounds.y,
    width: margin * 2 + columns * cellWidth + (columns - 1) * gap,
    height:
      margin * 2 +
      Math.ceil(selected.length / columns) * cellHeight +
      (Math.ceil(selected.length / columns) - 1) * gap,
    background: "#f4f4ef",
    margin,
    columns,
    gutter: gap,
  };
  next.artboards.push(board);
  const placementIds: string[] = [];
  selected.forEach((p, i) => {
    const box = selectionBounds(d, [p.id], sizes),
      scale = Math.min(cellWidth / box.width, (cellHeight - 64) / box.height),
      x = board.x + margin + (i % columns) * (cellWidth + gap),
      y = board.y + margin + Math.floor(i / columns) * (cellHeight + gap);
    const copy = structuredClone(p);
    copy.id = id();
    copy.name = p.name.slice(0, 152) + " · sheet";
    copy.visible = true;
    copy.included = true;
    copy.transform.x =
      x + cellWidth / 2 + (p.transform.x - (box.x + box.width / 2)) * scale;
    copy.transform.y =
      y +
      (cellHeight - 64) / 2 +
      (p.transform.y - (box.y + box.height / 2)) * scale;
    copy.transform.scaleX *= scale;
    copy.transform.scaleY *= scale;
    next.placements.push(copy);
    placementIds.push(copy.id);
    const nodeId = id();
    next.nodes.push({
      id: nodeId,
      name: "Caption",
      position: { x, y: y + cellHeight - 48 },
      kind: "text",
      content: p.name,
      width: cellWidth,
      height: 48,
      fontSize: 18,
      weight: 400,
      lineHeight: 1.2,
      tracking: 0,
      align: "left",
      color: "#242823",
    });
    next.placements.push({
      id: id(),
      nodeId,
      name: "Caption · " + p.name.slice(0, 150),
      visible: true,
      included: true,
      transform: {
        x,
        y: y + cellHeight - 48,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
    });
  });
  validateField(next);
  return { document: next, boardId: board.id, placementIds };
}
