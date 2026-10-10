import { zipSync, strToU8 } from "fflate";
import { validateParams, crc32 } from "../../experiments/afterimage/core.ts";
import type { Params, Point, Rect } from "../../experiments/afterimage/core.ts";

export type Camera = Point & { scale: number };
export type Positions = Record<"source" | "operation" | "result", Point>;
export type Presentation = {
  camera: Camera;
  mode: "mask" | "path" | "arrange";
  proof: "paper" | "dark";
};
export type StudyState = {
  name: string;
  params: Params;
  positions: Positions;
  capture: Rect;
  connected: boolean;
  presentation: Presentation;
};
export type Asset = {
  id: string;
  path: string;
  sha256: string;
  byteLength: number;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  name: string;
};
export type FormDocument = {
  format: "form";
  formatVersion: 1;
  projectId: string;
  name: string;
  colour: { working: "linear-srgb"; export: "srgb-straight-alpha" };
  asset: Asset;
  source: { id: "source-1"; assetId: string };
  operation: {
    id: "afterimage-1";
    instrument: "afterimage";
    instrumentVersion: 1 | 2;
    params: Params;
  };
  connections: {
    sourceId: "source-1";
    output: "image";
    targetId: "afterimage-1";
    input: "image";
  }[];
  placements: {
    source: { entityId: "source-1"; position: Point };
    operation: { entityId: "afterimage-1"; position: Point };
    result: { entityId: "afterimage-1"; output: "image"; position: Point };
  };
  capture: Rect;
  presentation: Presentation;
};
export const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 26 * 1024 * 1024;
const MAX_JSON_BYTES = 128 * 1024;
const fail = (message: string): never => {
  throw Error(message);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Invalid project data.");
  return value as Record<string, unknown>;
};
function text(value: unknown, limit: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    fail("Invalid project name or identifier.");
}
function finite(value: unknown, limit = 1e6): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > limit
  )
    fail("Invalid project coordinates.");
}
function point(value: unknown) {
  const p = record(value);
  finite(p.x);
  finite(p.y);
}
export function imageMime(bytes: Uint8Array): Asset["mime"] {
  if (
    bytes.length >= 8 &&
    bytes
      .slice(0, 8)
      .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i])
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  return fail("The embedded photograph must be JPEG or PNG.");
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function validateDocument(
  value: unknown,
): asserts value is FormDocument {
  const d = record(value);
  if (d.format !== "form" || d.formatVersion !== 1)
    fail("This .form project version is not supported.");
  text(d.projectId, 80);
  text(d.name, 160);
  if (!/^[a-zA-Z0-9_-]+$/.test(d.projectId))
    fail("Invalid project identifier.");
  const colour = record(d.colour);
  if (
    colour.working !== "linear-srgb" ||
    colour.export !== "srgb-straight-alpha"
  )
    fail("Unsupported project colour policy.");
  const a = record(d.asset);
  if (
    typeof a.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(a.sha256) ||
    a.id !== a.sha256
  )
    fail("Invalid asset identity.");
  if (a.mime !== "image/jpeg" && a.mime !== "image/png")
    fail("Unsupported source image format.");
  if (
    a.path !== `assets/${a.sha256}.${a.mime === "image/jpeg" ? "jpg" : "png"}`
  )
    fail("Invalid asset path.");
  text(a.name, 240);
  for (const n of [a.width, a.height])
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 4096)
      fail("Invalid source image dimensions.");
  if (
    (a.width as number) * (a.height as number) > 16_000_000 ||
    !Number.isInteger(a.byteLength) ||
    (a.byteLength as number) < 3 ||
    (a.byteLength as number) > MAX_IMAGE_BYTES
  )
    fail("Source image exceeds this project's limits.");
  const source = record(d.source),
    operation = record(d.operation);
  if (source.id !== "source-1" || source.assetId !== a.id)
    fail("Missing source asset reference.");
  if (
    operation.id !== "afterimage-1" ||
    operation.instrument !== "afterimage" ||
    ![1, 2].includes(operation.instrumentVersion as number)
  )
    fail("This project requires an unsupported instrument version.");
  try {
    validateParams(operation.params as Params);
  } catch {
    fail("Invalid AFTERIMAGE settings in project.");
  }
  if (
    (operation.params as Params).paintedMask !== undefined &&
    operation.instrumentVersion !== 2
  )
    fail("Painted selections require AFTERIMAGE instrument version 2.");
  if (!Array.isArray(d.connections) || d.connections.length > 1)
    fail("Unsupported project connections.");
  for (const edge of d.connections as unknown[]) {
    const e = record(edge);
    if (
      e.sourceId !== source.id ||
      e.targetId !== operation.id ||
      e.output !== "image" ||
      e.input !== "image"
    )
      fail("Invalid image connection.");
  }
  const placements = record(d.placements);
  for (const name of ["source", "operation", "result"] as const) {
    const p = record(placements[name]);
    point(p.position);
    if (
      p.entityId !== (name === "source" ? source.id : operation.id) ||
      (name === "result" && p.output !== "image")
    )
      fail("Invalid placement reference.");
  }
  const capture = record(d.capture);
  point(capture);
  finite(capture.width);
  finite(capture.height);
  if ((capture.width as number) <= 0 || capture.width !== capture.height)
    fail("Invalid square capture frame.");
  const presentation = record(d.presentation),
    camera = record(presentation.camera);
  point(camera);
  finite(camera.scale, 2.5);
  if (
    (camera.scale as number) < 0.2 ||
    !["mask", "path", "arrange"].includes(presentation.mode as string) ||
    !["paper", "dark"].includes(presentation.proof as string)
  )
    fail("Invalid workspace presentation.");
}
export function createDocument(
  projectId: string,
  state: StudyState,
  asset: Asset,
): FormDocument {
  const d: FormDocument = {
    format: "form",
    formatVersion: 1,
    projectId,
    name: state.name,
    colour: { working: "linear-srgb", export: "srgb-straight-alpha" },
    asset: structuredClone(asset),
    source: { id: "source-1", assetId: asset.id },
    operation: {
      id: "afterimage-1",
      instrument: "afterimage",
      instrumentVersion: state.params.paintedMask ? 2 : 1,
      params: structuredClone(state.params),
    },
    connections: state.connected
      ? [
          {
            sourceId: "source-1",
            output: "image",
            targetId: "afterimage-1",
            input: "image",
          },
        ]
      : [],
    placements: {
      source: { entityId: "source-1", position: { ...state.positions.source } },
      operation: {
        entityId: "afterimage-1",
        position: { ...state.positions.operation },
      },
      result: {
        entityId: "afterimage-1",
        output: "image",
        position: { ...state.positions.result },
      },
    },
    capture: { ...state.capture },
    presentation: structuredClone(state.presentation),
  };
  validateDocument(d);
  return d;
}
export function studyFromDocument(d: FormDocument): StudyState {
  return {
    name: d.name,
    params: structuredClone(d.operation.params),
    positions: {
      source: { ...d.placements.source.position },
      operation: { ...d.placements.operation.position },
      result: { ...d.placements.result.position },
    },
    capture: { ...d.capture },
    connected: d.connections.length === 1,
    presentation: structuredClone(d.presentation),
  };
}
export async function encodeProject(
  d: FormDocument,
  image: Uint8Array,
): Promise<Uint8Array> {
  validateDocument(d);
  if (
    image.length !== d.asset.byteLength ||
    imageMime(image) !== d.asset.mime ||
    (await sha256(image)) !== d.asset.sha256
  )
    fail("The source photograph changed while packaging the project.");
  const document = strToU8(JSON.stringify(d));
  if (document.length > MAX_JSON_BYTES) fail("Project document is too large.");
  const manifest = strToU8(
    JSON.stringify({
      format: "form",
      formatVersion: 1,
      document: {
        path: "document.json",
        sha256: await sha256(document),
        byteLength: document.length,
      },
      instrument: { id: "afterimage", version: d.operation.instrumentVersion },
    }),
  );
  // Already-compressed JPEG/PNG assets are stored, avoiding unbounded inflation.
  return zipSync(
    {
      "manifest.json": manifest,
      "document.json": document,
      [d.asset.path]: image,
    },
    { level: 0 },
  );
}

// Bounded stored-entry ZIP reader; the caller selects version-specific limits.
// Central/local metadata, CRCs and hashes must agree before any image decode.
export function readProjectEntries(
  bytes: Uint8Array,
  maxBytes = MAX_PACKAGE_BYTES,
  maxEntries = 3,
  maxJSONBytes = MAX_JSON_BYTES,
  minEntries = 3,
): Map<string, Uint8Array> {
  if (bytes.length < 22 || bytes.length > maxBytes)
    fail("Invalid or oversized .form package.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    end = bytes.length - 22;
  if (
    v.getUint32(end, true) !== 0x06054b50 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0 ||
    v.getUint16(end + 8, true) < minEntries ||
    v.getUint16(end + 8, true) > maxEntries ||
    v.getUint16(end + 10, true) !== v.getUint16(end + 8, true) ||
    v.getUint16(end + 20, true) !== 0
  )
    fail("Unsupported or damaged .form archive.");
  const start = v.getUint32(end + 16, true),
    length = v.getUint32(end + 12, true);
  if (start + length !== end) fail("Damaged archive directory.");
  const result = new Map<string, Uint8Array>(),
    spans: { start: number; end: number }[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let at = start;
  for (let i = 0; i < v.getUint16(end + 8, true); i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 0x02014b50)
      fail("Damaged archive entry.");
    const flags = v.getUint16(at + 8, true),
      method = v.getUint16(at + 10, true),
      checksum = v.getUint32(at + 16, true),
      compressed = v.getUint32(at + 20, true),
      size = v.getUint32(at + 24, true),
      nameSize = v.getUint16(at + 28, true),
      extra = v.getUint16(at + 30, true),
      comment = v.getUint16(at + 32, true),
      local = v.getUint32(at + 42, true);
    if (
      flags & ~0x800 ||
      method !== 0 ||
      size !== compressed ||
      v.getUint16(at + 34, true) !== 0 ||
      at + 46 + nameSize + extra + comment > end
    )
      fail("Unsupported compressed or damaged project entry.");
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameSize));
    const isImage = /^assets\/[a-f0-9]{64}\.(jpg|png)$/.test(name);
    if (
      (name !== "manifest.json" && name !== "document.json" && !isImage) ||
      result.has(name) ||
      size > (isImage ? MAX_IMAGE_BYTES : maxJSONBytes)
    )
      fail("Invalid, duplicate or oversized project entry.");
    if (
      local + 30 > start ||
      v.getUint32(local, true) !== 0x04034b50 ||
      v.getUint16(local + 6, true) !== flags ||
      v.getUint16(local + 8, true) !== method ||
      v.getUint32(local + 14, true) !== checksum ||
      v.getUint32(local + 18, true) !== compressed ||
      v.getUint32(local + 22, true) !== size ||
      v.getUint16(local + 26, true) !== nameSize
    )
      fail("Archive entry metadata mismatch.");
    const dataStart = local + 30 + nameSize + v.getUint16(local + 28, true),
      dataEnd = dataStart + size;
    if (
      dataEnd > start ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + nameSize)) !== name
    )
      fail("Invalid archive data range.");
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== checksum)
      fail("Project checksum failed. The file may be damaged.");
    result.set(name, data);
    spans.push({ start: local, end: dataEnd });
    at += 46 + nameSize + extra + comment;
  }
  spans.sort((a, b) => a.start - b.start);
  if (
    at !== end ||
    spans[0].start !== 0 ||
    spans.some((span, i) => i > 0 && spans[i - 1].end !== span.start) ||
    spans.at(-1)!.end !== start
  )
    fail("Unexpected or overlapping archive data.");
  return result;
}
export async function decodeProject(
  bytes: Uint8Array,
): Promise<{ document: FormDocument; image: Uint8Array }> {
  const files = readProjectEntries(bytes),
    json = (path: string): unknown => {
      const data = files.get(path);
      if (!data) fail("Project metadata is missing.");
      try {
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(data),
        );
      } catch {
        return fail("Invalid JSON in project.");
      }
    };
  const manifest = record(json("manifest.json"));
  if (manifest.format !== "form" || manifest.formatVersion !== 1)
    fail("This .form project version is not supported.");
  const info = record(manifest.document),
    instrument = record(manifest.instrument),
    data = files.get("document.json");
  if (!data) return fail("Project document is missing.");
  if (
    info.path !== "document.json" ||
    info.byteLength !== data?.length ||
    info.sha256 !== (await sha256(data))
  )
    fail("Project document integrity check failed.");
  if (
    instrument.id !== "afterimage" ||
    ![1, 2].includes(instrument.version as number)
  )
    fail("Unsupported required instrument.");
  const document = json("document.json");
  validateDocument(document);
  if (instrument.version !== document.operation.instrumentVersion)
    fail("Project instrument requirements do not match its study.");
  const image = files.get(document.asset.path);
  if (!image) return fail("Embedded photograph is missing.");
  if (
    image.length !== document.asset.byteLength ||
    (await sha256(image)) !== document.asset.sha256 ||
    imageMime(image) !== document.asset.mime
  )
    fail("Embedded photograph integrity check failed.");
  return { document: structuredClone(document), image: new Uint8Array(image) };
}
