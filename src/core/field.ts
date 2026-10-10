import { zipSync, strToU8 } from "fflate";
import { defaults, validateParams } from "../../experiments/afterimage/core.ts";
import type { Params, Point, Rect } from "../../experiments/afterimage/core.ts";
import { validatePaintedMask } from "../../experiments/afterimage/mask.ts";
import type { PaintedMask } from "../../experiments/afterimage/mask.ts";
import {
  readProjectEntries,
  sha256,
  imageMime,
  MAX_IMAGE_BYTES,
} from "./project.ts";
import type { Asset, Camera } from "./project.ts";
import { decodeWorkspace } from "./workspace.ts";
import type { WorkspaceDocument } from "./workspace.ts";

export const FIELD_LIMITS = {
  nodes: 48,
  placements: 32,
  assets: 16,
  packageBytes: 64 * 1024 * 1024,
  assetBytes: 60 * 1024 * 1024,
  decodedPixels: 32 * 1024 * 1024,
  metadataBytes: 1024 * 1024,
};
export type Coverage =
  | { kind: "ellipse"; center: Point; radius: Point }
  | { kind: "painted"; painted: PaintedMask }
  | { kind: "closed"; points: Point[] }
  | { kind: "image"; assetId: string };
export type NodeBase = { id: string; name: string; position: Point };
export type FieldNode = NodeBase &
  (
    | { kind: "image"; assetId: string }
    | { kind: "trajectory"; points: Params["path"] }
    | { kind: "selection"; coverage: Coverage; feather: number }
    | {
        kind: "afterimage";
        instrumentVersion: 2;
        params: Params;
        frame: Rect | null;
      }
  );
export type Port = "image" | "trajectory" | "selection";
export type Edge = { from: string; to: string; input: Port };
export type Transform = Point & {
  scaleX: number;
  scaleY: number;
  rotation: number;
};
export type Placement = {
  id: string;
  nodeId: string;
  name: string;
  transform: Transform;
  visible: boolean;
  included: boolean;
};
export type FieldDocument = {
  format: "form";
  formatVersion: 3;
  projectId: string;
  name: string;
  colour: {
    working: "linear-srgb";
    composition: "srgb-source-over";
    export: "srgb-straight-alpha";
  };
  assets: Asset[];
  nodes: FieldNode[];
  edges: Edge[];
  placements: Placement[];
  capture: Rect;
  presentation: { camera: Camera; proof: "paper" | "dark" };
};
function fail(s: string): never {
  throw Error(s);
}
const text = (s: unknown, max = 160) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
const finite = (n: unknown, max = 1e6): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;
export const validPoint = (p: unknown): p is Point =>
  !!p &&
  typeof p === "object" &&
  finite((p as Point).x) &&
  finite((p as Point).y);
export function validRect(r: unknown): r is Rect {
  return (
    validPoint(r) &&
    finite((r as Rect).width) &&
    finite((r as Rect).height) &&
    (r as Rect).width > 0 &&
    (r as Rect).height > 0
  );
}
export const outputType = (n: FieldNode): "Image2D" | "Path2D" | "Mask2D" =>
  n.kind === "trajectory"
    ? "Path2D"
    : n.kind === "selection"
      ? "Mask2D"
      : "Image2D";
export const inputType = (p: Port) =>
  p === "image" ? "Image2D" : p === "trajectory" ? "Path2D" : "Mask2D";
export function topologicalOrder(
  d: Pick<FieldDocument, "nodes" | "edges">,
): string[] {
  const done = new Set<string>(),
    visiting = new Set<string>(),
    order: string[] = [];
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail("This connection creates a processing cycle.");
    visiting.add(id);
    for (const edge of d.edges) if (edge.to === id) visit(edge.from);
    visiting.delete(id);
    done.add(id);
    order.push(id);
  };
  for (const n of d.nodes) visit(n.id);
  return order;
}
export function validateField(value: unknown): asserts value is FieldDocument {
  const d = value as FieldDocument;
  if (
    !d ||
    d.format !== "form" ||
    d.formatVersion !== 3 ||
    !text(d.projectId) ||
    !text(d.name)
  )
    fail("Unsupported or invalid FIELD document.");
  if (
    d.colour?.working !== "linear-srgb" ||
    d.colour?.composition !== "srgb-source-over" ||
    d.colour?.export !== "srgb-straight-alpha"
  )
    fail("Unsupported colour policy.");
  if (
    !Array.isArray(d.nodes) ||
    d.nodes.length > FIELD_LIMITS.nodes ||
    !Array.isArray(d.placements) ||
    d.placements.length > FIELD_LIMITS.placements ||
    !Array.isArray(d.edges) ||
    d.edges.length > FIELD_LIMITS.nodes * 3 ||
    !Array.isArray(d.assets) ||
    d.assets.length > FIELD_LIMITS.assets
  )
    fail("FIELD project exceeds its object limits.");
  const assets = new Map<string, Asset>();
  let assetBytes = 0;
  for (const a of d.assets) {
    if (
      !a ||
      !/^[a-f0-9]{64}$/.test(a.id) ||
      a.id !== a.sha256 ||
      assets.has(a.id) ||
      !["image/jpeg", "image/png"].includes(a.mime) ||
      a.path !== `assets/${a.id}.${a.mime === "image/jpeg" ? "jpg" : "png"}` ||
      !Number.isInteger(a.byteLength) ||
      a.byteLength < 1 ||
      a.byteLength > MAX_IMAGE_BYTES ||
      !Number.isInteger(a.width) ||
      !Number.isInteger(a.height) ||
      a.width < 1 ||
      a.height < 1 ||
      Math.max(a.width, a.height) > 4096 ||
      a.width * a.height > 16e6 ||
      !text(a.name)
    )
      fail("Invalid FIELD asset.");
    assets.set(a.id, a);
    assetBytes += a.byteLength;
  }
  if (
    d.assets.reduce((total, a) => total + a.width * a.height, 0) >
    FIELD_LIMITS.decodedPixels
  )
    fail("Embedded images exceed the 32-megapixel decode budget.");
  if (assetBytes > FIELD_LIMITS.assetBytes)
    fail("Embedded images exceed the 60 MiB project budget.");
  const nodes = new Map<string, FieldNode>();
  for (const n of d.nodes) {
    if (
      !n ||
      !text(n.id) ||
      !text(n.name) ||
      !validPoint(n.position) ||
      nodes.has(n.id)
    )
      fail("Invalid or duplicate FIELD object.");
    nodes.set(n.id, n);
    if (n.kind === "image") {
      if (!assets.has(n.assetId)) fail("Photograph asset is missing.");
    } else if (n.kind === "trajectory") {
      if (
        !Array.isArray(n.points) ||
        n.points.length !== 4 ||
        !n.points.every(validPoint)
      )
        fail("Invalid trajectory.");
    } else if (n.kind === "selection") {
      if (
        !finite(n.feather) ||
        n.feather < 0.001 ||
        n.feather > 0.5 ||
        !n.coverage
      )
        fail("Invalid selection feather.");
      const m = n.coverage;
      if (m.kind === "ellipse") {
        if (
          !validPoint(m.center) ||
          !validPoint(m.radius) ||
          m.radius.x <= 0 ||
          m.radius.y <= 0
        )
          fail("Invalid ellipse selection.");
      } else if (m.kind === "painted") validatePaintedMask(m.painted);
      else if (m.kind === "closed") {
        if (
          !Array.isArray(m.points) ||
          m.points.length < 3 ||
          m.points.length > 256 ||
          !m.points.every(
            (p) =>
              validPoint(p) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
          )
        )
          fail("A closed selection needs 3–256 normalized points.");
      } else if (m.kind === "image") {
        if (!assets.has(m.assetId)) fail("Selection image is missing.");
      } else fail("Unsupported selection shape.");
    } else if (n.kind === "afterimage") {
      if (n.instrumentVersion !== 2) fail("Unsupported AFTERIMAGE version.");
      validateParams(n.params);
      if (n.frame !== null && !validRect(n.frame))
        fail("Invalid output frame.");
    } else fail("Unsupported FIELD object.");
  }
  const inputs = new Set<string>();
  for (const e of d.edges) {
    const from = e && nodes.get(e.from),
      to = e && nodes.get(e.to);
    if (
      !from ||
      to?.kind !== "afterimage" ||
      !["image", "trajectory", "selection"].includes(e.input) ||
      outputType(from) !== inputType(e.input)
    )
      fail(
        "Connection types do not match. Choose Image2D, Path2D or Mask2D as labelled.",
      );
    const key = `${e.to}:${e.input}`;
    if (inputs.has(key)) fail("An input can have only one connection.");
    inputs.add(key);
  }
  topologicalOrder(d);
  const placementIds = new Set<string>();
  for (const p of d.placements) {
    const n = p && nodes.get(p.nodeId),
      t = p?.transform;
    if (
      !p ||
      !text(p.id) ||
      !text(p.name) ||
      placementIds.has(p.id) ||
      !n ||
      outputType(n) !== "Image2D" ||
      !validPoint(t) ||
      !finite(t.rotation, 36000) ||
      !finite(t.scaleX, 8) ||
      !finite(t.scaleY, 8) ||
      Math.abs(t.scaleX) < 0.05 ||
      Math.abs(t.scaleY) < 0.05 ||
      typeof p.visible !== "boolean" ||
      typeof p.included !== "boolean"
    )
      fail("Invalid artwork placement or transform.");
    placementIds.add(p.id);
  }
  if (
    !validRect(d.capture) ||
    !validPoint(d.presentation?.camera) ||
    !finite(d.presentation.camera.scale, 4) ||
    d.presentation.camera.scale < 0.05 ||
    !["paper", "dark"].includes(d.presentation.proof)
  )
    fail("Invalid capture or FIELD camera.");
  if (JSON.stringify(d).length > FIELD_LIMITS.metadataBytes)
    fail("FIELD metadata exceeds the supported budget.");
}
export function emptyField(id: string): FieldDocument {
  return {
    format: "form",
    formatVersion: 3,
    projectId: id,
    name: "Untitled field",
    colour: {
      working: "linear-srgb",
      composition: "srgb-source-over",
      export: "srgb-straight-alpha",
    },
    assets: [],
    nodes: [],
    edges: [],
    placements: [],
    capture: { x: 800, y: 80, width: 1000, height: 1000 },
    presentation: { camera: { x: 80, y: 140, scale: 0.45 }, proof: "paper" },
  };
}
export function connect(d: FieldDocument, edge: Edge): FieldDocument {
  const next = structuredClone(d);
  next.edges = next.edges.filter(
    (e) => e.to !== edge.to || e.input !== edge.input,
  );
  next.edges.push({ ...edge });
  validateField(next);
  return next;
}
export function addAfterimage(
  d: FieldDocument,
  imageId: string,
  id: () => string,
  dimensions: Point,
): { document: FieldDocument; placementId: string } {
  const next = structuredClone(d),
    source = next.nodes.find((n) => n.id === imageId);
  if (!source || outputType(source) !== "Image2D")
    fail("Select a photograph or visual output first.");
  const p = defaults(dimensions.x, dimensions.y),
    opId = id(),
    pathId = id(),
    maskId = id(),
    placementId = id();
  const offset = next.nodes.filter((n) => n.kind === "afterimage").length * 180;
  next.nodes.push(
    {
      id: opId,
      kind: "afterimage",
      name: "Afterimage",
      position: { x: 490 + offset, y: 350 + offset },
      instrumentVersion: 2,
      params: p,
      frame: null,
    },
    {
      id: pathId,
      kind: "trajectory",
      name: "Trajectory",
      position: { x: 490 + offset, y: 190 + offset },
      points: p.path,
    },
    {
      id: maskId,
      kind: "selection",
      name: "Selection",
      position: { x: 490 + offset, y: 30 + offset },
      coverage: {
        kind: "ellipse",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.46, y: 0.48 },
      },
      feather: 0.1,
    },
  );
  next.edges.push(
    { from: imageId, to: opId, input: "image" },
    { from: pathId, to: opId, input: "trajectory" },
    { from: maskId, to: opId, input: "selection" },
  );
  next.placements.push({
    id: placementId,
    nodeId: opId,
    name: "Afterimage output",
    transform: {
      x: 850 + offset,
      y: 80 + offset,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    visible: true,
    included: true,
  });
  validateField(next);
  return { document: next, placementId };
}
export function linkedCopy(
  d: FieldDocument,
  placementId: string,
  id: string,
): FieldDocument {
  const next = structuredClone(d),
    original = next.placements.find((p) => p.id === placementId);
  if (!original) fail("Select artwork to place a linked copy.");
  next.placements.push({
    ...structuredClone(original),
    id,
    name: `${original.name.slice(0, 145)} copy`,
    transform: {
      ...original.transform,
      x: original.transform.x + 80,
      y: original.transform.y + 80,
    },
  });
  validateField(next);
  return next;
}
export function independentVariation(
  d: FieldDocument,
  placementId: string,
  id: () => string,
): { document: FieldDocument; placementId: string } {
  const next = structuredClone(d),
    original = next.placements.find((p) => p.id === placementId),
    node = next.nodes.find((n) => n.id === original?.nodeId);
  if (!original || node?.kind !== "afterimage")
    fail("Select an AFTERIMAGE output to make a variation.");
  // Clone editable upstream objects while sharing immutable image bytes.
  const cloned = new Map<string, string>();
  const cloneBranch = (sourceId: string): string => {
    const previous = cloned.get(sourceId);
    if (previous) return previous;
    const copy = structuredClone(d.nodes.find((n) => n.id === sourceId)!);
    copy.id = id();
    copy.name = `${copy.name.slice(0, 145)} variation`;
    copy.position.x += 160;
    copy.position.y += 160;
    cloned.set(sourceId, copy.id);
    next.nodes.push(copy);
    for (const edge of d.edges.filter((e) => e.to === sourceId))
      next.edges.push({ ...edge, from: cloneBranch(edge.from), to: copy.id });
    return copy.id;
  };
  const opId = cloneBranch(node.id),
    newPlacementId = id();
  next.placements.push({
    ...structuredClone(original),
    id: newPlacementId,
    nodeId: opId,
    name: `${original.name.slice(0, 145)} variation`,
    transform: {
      ...original.transform,
      x: original.transform.x + 160,
      y: original.transform.y + 160,
    },
  });
  validateField(next);
  return { document: next, placementId: newPlacementId };
}
export function replaceImage(
  d: FieldDocument,
  sourceId: string,
  asset: Asset,
  scaleGuides: boolean,
  id: () => string,
): FieldDocument {
  const next = structuredClone(d),
    source = next.nodes.find((n) => n.id === sourceId);
  if (source?.kind !== "image") fail("Select a source photograph to replace.");
  const old = next.assets.find((a) => a.id === source.assetId)!;
  if (!next.assets.some((a) => a.id === asset.id))
    next.assets.push(structuredClone(asset));
  source.assetId = asset.id;
  const sx = asset.width / old.width,
    sy = asset.height / old.height;
  const point = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy });
  const affected = new Set(
    next.edges
      .filter((e) => e.from === sourceId && e.input === "image")
      .map((e) => e.to),
  );
  const scaled = new Set<string>(),
    privateGuides = new Map<string, string>();
  if (scaleGuides)
    for (const node of next.nodes.filter((n) => affected.has(n.id))) {
      if (node.kind !== "afterimage") continue;
      node.params.path = node.params.path.map(point) as Params["path"];
      node.params.maskCenter = point(node.params.maskCenter);
      node.params.maskRadius = point(node.params.maskRadius);
      if (node.frame)
        node.frame = {
          ...point(node.frame),
          width: node.frame.width * sx,
          height: node.frame.height * sy,
        };
      const edge = next.edges.find(
        (e) => e.to === node.id && e.input === "trajectory",
      );
      if (!edge) continue;
      const originalId = edge.from;
      if (
        next.edges.some((e) => e.from === originalId && !affected.has(e.to))
      ) {
        let privateId = privateGuides.get(originalId);
        if (!privateId) {
          const copy = structuredClone(
            next.nodes.find((n) => n.id === originalId)!,
          );
          copy.id = id();
          copy.position.y += 120;
          privateId = copy.id;
          privateGuides.set(originalId, privateId);
          next.nodes.push(copy);
        }
        edge.from = privateId;
      }
      if (!scaled.has(edge.from)) {
        const guide = next.nodes.find((n) => n.id === edge.from)!;
        if (guide.kind === "trajectory")
          guide.points = guide.points.map(point) as Params["path"];
        scaled.add(edge.from);
      }
    }
  // Mask coverage uses normalized coordinates and keeps its relative position.
  validateField(next);
  return next;
}
export function removeNode(d: FieldDocument, nodeId: string): FieldDocument {
  const next = structuredClone(d);
  next.nodes = next.nodes.filter((n) => n.id !== nodeId);
  next.edges = next.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  next.placements = next.placements.filter((p) => p.nodeId !== nodeId);
  validateField(next);
  return next;
}
export function toWorld(p: Point, t: Transform): Point {
  const a = (t.rotation * Math.PI) / 180,
    x = p.x * t.scaleX,
    y = p.y * t.scaleY;
  return {
    x: t.x + x * Math.cos(a) - y * Math.sin(a),
    y: t.y + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function fromWorld(p: Point, t: Transform): Point {
  const a = (t.rotation * Math.PI) / 180,
    x = p.x - t.x,
    y = p.y - t.y;
  return {
    x: (x * Math.cos(a) + y * Math.sin(a)) / t.scaleX,
    y: (-x * Math.sin(a) + y * Math.cos(a)) / t.scaleY,
  };
}
export function transformedBounds(r: Rect, t: Transform): Rect {
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height },
  ].map((p) => toWorld(p, t));
  const x = Math.min(...corners.map((p) => p.x)),
    y = Math.min(...corners.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((p) => p.x)) - x,
    height: Math.max(...corners.map((p) => p.y)) - y,
  };
}
export function rotateArtwork(
  t: Transform,
  width: number,
  height: number,
  rotation: number,
): Transform {
  const localCenter = { x: width / 2, y: height / 2 };
  const center = toWorld(localCenter, t);
  const offset = toWorld(localCenter, { ...t, x: 0, y: 0, rotation });
  return { ...t, x: center.x - offset.x, y: center.y - offset.y, rotation };
}
export function rotationStep(previousAngle: number, nextAngle: number): number {
  const delta = nextAngle - previousAngle;
  return (Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
}
export function resizeArtwork(
  t: Transform,
  pointer: Point,
  width: number,
  height: number,
  proportional: boolean,
): Transform {
  const local = fromWorld(pointer, { ...t, scaleX: 1, scaleY: 1 });
  if (proportional) {
    const x = width * t.scaleX,
      y = height * t.scaleY;
    const factor = Math.max(
      0.05 / Math.min(Math.abs(t.scaleX), Math.abs(t.scaleY)),
      Math.min(
        8 / Math.max(Math.abs(t.scaleX), Math.abs(t.scaleY)),
        (local.x * x + local.y * y) / (x * x + y * y),
      ),
    );
    return { ...t, scaleX: t.scaleX * factor, scaleY: t.scaleY * factor };
  }
  return {
    ...t,
    scaleX:
      Math.sign(t.scaleX) *
      Math.max(0.05, Math.min(8, Math.abs(local.x / width))),
    scaleY:
      Math.sign(t.scaleY) *
      Math.max(0.05, Math.min(8, Math.abs(local.y / height))),
  };
}
export function artworkBounds(
  placements: Placement[],
  outputs: Map<string, { width: number; height: number }>,
): Rect {
  const bounds = placements
    .filter((p) => p.visible && p.included)
    .map((p) => {
      const r = outputs.get(p.nodeId);
      if (!r) fail("Render the included artwork before exporting.");
      return transformedBounds(
        { x: 0, y: 0, width: r.width, height: r.height },
        p.transform,
      );
    });
  if (!bounds.length)
    fail("Include at least one artwork placement in the export.");
  const x = Math.min(...bounds.map((r) => r.x)),
    y = Math.min(...bounds.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...bounds.map((r) => r.x + r.width)) - x,
    height: Math.max(...bounds.map((r) => r.y + r.height)) - y,
  };
}
export function screenToField(p: Point, c: Camera): Point {
  return { x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale };
}
export function zoomAt(c: Camera, p: Point, scale: number): Camera {
  const local = screenToField(p, c);
  const s = Math.max(0.05, Math.min(4, scale));
  return { x: p.x - local.x * s, y: p.y - local.y * s, scale: s };
}

export class FieldCommands {
  private value: FieldDocument;
  private past: { state: FieldDocument; label: string }[] = [];
  private future: { state: FieldDocument; label: string }[] = [];
  private transaction: {
    state: FieldDocument;
    label: string;
    future: { state: FieldDocument; label: string }[];
  } | null = null;
  revision = 0;
  constructor(d: FieldDocument) {
    validateField(d);
    this.value = structuredClone(d);
  }
  get state() {
    return structuredClone(this.value);
  }
  get status() {
    return {
      undo: this.past.at(-1)?.label ?? null,
      redo: this.future.at(-1)?.label ?? null,
      active: !!this.transaction,
    };
  }
  begin(label: string) {
    if (this.transaction) fail("Finish the current gesture first.");
    this.transaction = {
      state: this.state,
      label,
      future: this.future.slice(),
    };
  }
  execute(label: string, edit: (d: FieldDocument) => FieldDocument | void) {
    const next = this.state,
      result = edit(next) ?? next;
    validateField(result);
    if (JSON.stringify(result) === JSON.stringify(this.value)) return;
    if (!this.transaction) {
      this.past.push({ state: this.value, label });
      this.future = [];
      this.prune();
    }
    this.value = structuredClone(result);
    this.revision++;
  }
  private prune() {
    while (
      this.past.length > 64 ||
      this.past.reduce((n, s) => n + JSON.stringify(s.state).length * 2, 0) >
        16 * 1024 * 1024
    )
      this.past.shift();
  }
  commit() {
    if (!this.transaction) return;
    const t = this.transaction;
    this.transaction = null;
    if (JSON.stringify(t.state) !== JSON.stringify(this.value)) {
      this.past.push({ state: t.state, label: t.label });
      this.future = [];
      this.prune();
    }
  }
  cancel() {
    if (!this.transaction) return;
    this.value = this.transaction.state;
    this.future = this.transaction.future;
    this.transaction = null;
    this.revision++;
  }
  undo() {
    if (this.transaction) return;
    const old = this.past.pop();
    if (!old) return;
    this.future.push({ state: this.value, label: old.label });
    this.value = old.state;
    this.revision++;
  }
  redo() {
    if (this.transaction) return;
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ state: this.value, label: next.label });
    this.value = next.state;
    this.revision++;
  }
}

export function migrateWorkspace(w: WorkspaceDocument): FieldDocument {
  const d = emptyField(w.projectId);
  d.name = w.name;
  w.studies.forEach((s, i) => {
    const old = s.document,
      prefix = `legacy-${i}`,
      sourceId = `${prefix}-source`,
      opId = `${prefix}-afterimage`,
      pathId = `${prefix}-path`,
      maskId = `${prefix}-mask`,
      active = s.id === w.activeStudyId;
    if (!d.assets.some((a) => a.id === old.asset.id))
      d.assets.push(structuredClone(old.asset));
    const offset = active ? 0 : 1800 * (i + 1);
    const p = structuredClone(old.operation.params),
      asset = old.asset;
    d.nodes.push(
      {
        id: sourceId,
        name: asset.name,
        kind: "image",
        assetId: asset.id,
        position: { x: -600 + offset, y: 0 },
      },
      {
        id: opId,
        name: old.name,
        kind: "afterimage",
        instrumentVersion: 2,
        params: p,
        frame: structuredClone(old.capture),
        position: { x: -250 + offset, y: 160 },
      },
      {
        id: pathId,
        name: "Trajectory",
        kind: "trajectory",
        points: p.path,
        position: { x: -250 + offset, y: 0 },
      },
      {
        id: maskId,
        name: "Selection",
        kind: "selection",
        coverage: p.paintedMask?.enabled
          ? { kind: "painted", painted: structuredClone(p.paintedMask) }
          : {
              kind: "ellipse",
              center: {
                x: p.maskCenter.x / asset.width,
                y: p.maskCenter.y / asset.height,
              },
              radius: {
                x: p.maskRadius.x / asset.width,
                y: p.maskRadius.y / asset.height,
              },
            },
        feather: p.feather,
        position: { x: -250 + offset, y: -160 },
      },
    );
    if (old.connections.length)
      d.edges.push({ from: sourceId, to: opId, input: "image" });
    d.edges.push({ from: pathId, to: opId, input: "trajectory" });
    if (p.mask) d.edges.push({ from: maskId, to: opId, input: "selection" });
    d.placements.push(
      {
        id: `${prefix}-reference`,
        nodeId: sourceId,
        name: asset.name,
        transform: {
          x: -600 + offset,
          y: 0,
          scaleX: 0.55,
          scaleY: 0.55,
          rotation: 0,
        },
        visible: true,
        included: false,
      },
      {
        id: `${prefix}-output`,
        nodeId: opId,
        name: old.name,
        transform: { x: offset, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        visible: true,
        included: active,
      },
    );
    if (active)
      d.capture = {
        x: 0,
        y: 0,
        width: old.capture.width,
        height: old.capture.height,
      };
  });
  validateField(d);
  return d;
}
export async function encodeField(
  d: FieldDocument,
  assets: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  validateField(d);
  const document = strToU8(JSON.stringify(d)),
    files: Record<string, Uint8Array> = {};
  if (document.length > FIELD_LIMITS.metadataBytes)
    fail("FIELD metadata exceeds its byte budget.");
  for (const a of d.assets) {
    const bytes = assets.get(a.id);
    if (
      !bytes ||
      bytes.length !== a.byteLength ||
      (await sha256(bytes)) !== a.sha256 ||
      imageMime(bytes) !== a.mime
    )
      fail("Asset integrity check failed before saving.");
    files[a.path] = bytes;
  }
  files["document.json"] = document;
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "form",
      formatVersion: 3,
      document: {
        path: "document.json",
        byteLength: document.length,
        sha256: await sha256(document),
      },
      instruments: d.nodes.some((n) => n.kind === "afterimage")
        ? [{ id: "afterimage", version: 2 }]
        : [],
    }),
  );
  const bytes = zipSync(files, { level: 0 });
  if (bytes.length > FIELD_LIMITS.packageBytes)
    fail("Project exceeds the 64 MiB package limit.");
  return bytes;
}
export async function decodeField(bytes: Uint8Array): Promise<{
  document: FieldDocument;
  assets: Map<string, Uint8Array>;
  migrated: boolean;
}> {
  const entries = readProjectEntries(
    bytes,
    FIELD_LIMITS.packageBytes,
    FIELD_LIMITS.assets + 2,
    FIELD_LIMITS.metadataBytes,
    2,
  );
  const json = (path: string) => {
    const b = entries.get(path);
    if (!b) fail("Project metadata is missing.");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b));
  };
  const manifest = json("manifest.json");
  if ([1, 2].includes(manifest.formatVersion)) {
    const old = await decodeWorkspace(bytes);
    return {
      document: migrateWorkspace(old.document),
      assets: old.images,
      migrated: true,
    };
  }
  if (manifest.format !== "form" || manifest.formatVersion !== 3)
    fail("Unsupported FIELD project version.");
  const content = entries.get("document.json")!,
    info = manifest.document;
  if (
    !info ||
    info.path !== "document.json" ||
    info.byteLength !== content?.length ||
    info.sha256 !== (await sha256(content))
  )
    fail("FIELD document integrity check failed.");
  const document = json("document.json");
  validateField(document);
  const required = document.nodes.some((n) => n.kind === "afterimage")
    ? [{ id: "afterimage", version: 2 }]
    : [];
  if (JSON.stringify(manifest.instruments) !== JSON.stringify(required))
    fail("Unsupported or mismatched instrument requirements.");
  const assets = new Map<string, Uint8Array>(),
    expected = new Set(["manifest.json", "document.json"]);
  for (const a of document.assets) {
    const b = entries.get(a.path);
    if (
      !b ||
      b.length !== a.byteLength ||
      (await sha256(b)) !== a.sha256 ||
      imageMime(b) !== a.mime
    )
      fail("FIELD embedded image integrity check failed.");
    assets.set(a.id, new Uint8Array(b));
    expected.add(a.path);
  }
  if (
    entries.size !== expected.size ||
    [...entries.keys()].some((k) => !expected.has(k))
  )
    fail("Unexpected FIELD package entry.");
  return { document: structuredClone(document), assets, migrated: false };
}
