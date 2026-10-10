import { zipSync, strToU8 } from "fflate";
import {
  validateDocument,
  readProjectEntries,
  decodeProject,
  sha256,
  imageMime,
} from "./project.ts";
import type { FormDocument, Asset } from "./project.ts";

export const MAX_STUDIES = 4;
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
export const MAX_ASSET_BYTES = 60 * 1024 * 1024;
export type WorkspaceDocument = {
  format: "form";
  formatVersion: 2;
  projectId: string;
  name: string;
  activeStudyId: string;
  studies: { id: string; document: FormDocument }[];
};
const fail = (message: string): never => {
  throw Error(message);
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("Invalid workspace data.");
  return v as Record<string, unknown>;
}
function identifier(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v))
    fail("Invalid study or project identifier.");
}
export function workspaceAssets(d: WorkspaceDocument): Map<string, Asset> {
  const assets = new Map<string, Asset>();
  for (const s of d.studies) {
    const a = s.document.asset,
      prev = assets.get(a.id);
    if (
      prev &&
      ["path", "mime", "byteLength", "width", "height"].some(
        (k) => prev[k as keyof Asset] !== a[k as keyof Asset],
      )
    )
      fail("Conflicting photograph metadata between studies.");
    assets.set(a.id, a);
  }
  if (
    [...assets.values()].reduce((n, a) => n + a.byteLength, 0) > MAX_ASSET_BYTES
  )
    fail("This project exceeds the 60 MiB photograph limit.");
  return assets;
}
export function validateWorkspace(
  value: unknown,
): asserts value is WorkspaceDocument {
  const d = object(value);
  if (d.format !== "form" || d.formatVersion !== 2)
    fail("This .form workspace version is not supported.");
  identifier(d.projectId);
  identifier(d.activeStudyId);
  if (typeof d.name !== "string" || !d.name.trim() || d.name.length > 160)
    fail("Name the project using 1 to 160 characters.");
  if (
    !Array.isArray(d.studies) ||
    d.studies.length < 1 ||
    d.studies.length > MAX_STUDIES
  )
    fail("This workspace supports one to four studies.");
  const ids = new Set<string>();
  for (const value of d.studies as unknown[]) {
    const s = object(value);
    identifier(s.id);
    if (ids.has(s.id)) fail("Duplicate study identifier.");
    ids.add(s.id);
    validateDocument(s.document);
    if (s.document.projectId !== d.projectId)
      fail("Study belongs to a different project.");
  }
  if (!ids.has(d.activeStudyId as string))
    fail("The selected study is missing.");
  workspaceAssets(value as WorkspaceDocument);
}
export function duplicateStudy(
  d: WorkspaceDocument,
  id: string,
  newId: string,
): WorkspaceDocument {
  validateWorkspace(d);
  identifier(newId);
  if (d.studies.length >= MAX_STUDIES)
    fail(
      "This workspace holds four studies. Save this project before starting another.",
    );
  const original = d.studies.find((s) => s.id === id);
  if (!original) fail("The selected study is missing.");
  const next = structuredClone(d),
    copy = structuredClone(original!);
  const names = new Set(d.studies.map((s) => s.document.name));
  let n = 1,
    name: string;
  do {
    const suffix = ` copy${n > 1 ? ` ${n}` : ""}`;
    name = copy.document.name.slice(0, 160 - suffix.length) + suffix;
    n++;
  } while (names.has(name));
  copy.id = newId;
  copy.document.name = name;
  next.studies.push(copy);
  next.activeStudyId = newId;
  validateWorkspace(next);
  return next;
}
export async function encodeWorkspace(
  d: WorkspaceDocument,
  images: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  validateWorkspace(d);
  const document = strToU8(JSON.stringify(d));
  if (document.length > 128 * 1024) fail("Project metadata is too large.");
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({
        format: "form",
        formatVersion: 2,
        document: {
          path: "document.json",
          sha256: await sha256(document),
          byteLength: document.length,
        },
        instrument: {
          id: "afterimage",
          version: Math.max(
            ...d.studies.map((s) => s.document.operation.instrumentVersion),
          ),
        },
      }),
    ),
    "document.json": document,
  };
  for (const a of workspaceAssets(d).values()) {
    const bytes = images.get(a.id);
    if (!bytes) return fail("An embedded photograph is missing.");
    if (
      bytes.length !== a.byteLength ||
      imageMime(bytes) !== a.mime ||
      (await sha256(bytes)) !== a.sha256
    )
      fail("An embedded photograph failed its integrity check.");
    files[a.path] = bytes;
  }
  const bytes = zipSync(files, { level: 0 });
  if (bytes.length > MAX_WORKSPACE_BYTES)
    fail("Project exceeds the 64 MiB file limit.");
  return bytes;
}
export async function decodeWorkspace(bytes: Uint8Array): Promise<{
  document: WorkspaceDocument;
  images: Map<string, Uint8Array>;
  legacy: boolean;
}> {
  const files = readProjectEntries(bytes, MAX_WORKSPACE_BYTES, MAX_STUDIES + 2);
  function json(path: string): unknown {
    const b = files.get(path);
    if (!b) fail("Project metadata is missing.");
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b));
    } catch {
      return fail("Invalid JSON in project.");
    }
  }
  const m = object(json("manifest.json"));
  if (m.format === "form" && m.formatVersion === 1) {
    const old = await decodeProject(bytes);
    const document: WorkspaceDocument = {
      format: "form",
      formatVersion: 2,
      projectId: old.document.projectId,
      name: old.document.name,
      activeStudyId: "study-1",
      studies: [{ id: "study-1", document: old.document }],
    };
    validateWorkspace(document);
    return {
      document,
      images: new Map([[old.document.asset.id, old.image]]),
      legacy: true,
    };
  }
  if (m.format !== "form" || m.formatVersion !== 2)
    fail("This .form workspace version is not supported.");
  const info = object(m.document),
    instrument = object(m.instrument),
    data = files.get("document.json");
  if (
    !data ||
    info.path !== "document.json" ||
    info.byteLength !== data.length ||
    info.sha256 !== (await sha256(data))
  )
    fail("Project document integrity check failed.");
  if (
    instrument.id !== "afterimage" ||
    ![1, 2].includes(instrument.version as number)
  )
    fail("Unsupported required instrument.");
  const document = json("document.json");
  validateWorkspace(document);
  if (
    instrument.version !==
    Math.max(
      ...document.studies.map((s) => s.document.operation.instrumentVersion),
    )
  )
    fail("Project instrument requirements do not match its studies.");
  const assets = workspaceAssets(document),
    images = new Map<string, Uint8Array>();
  if (files.size !== assets.size + 2)
    fail("Unexpected or missing project photographs.");
  for (const a of assets.values()) {
    const b = files.get(a.path);
    if (!b) return fail("Embedded photograph integrity check failed.");
    if (
      b.length !== a.byteLength ||
      imageMime(b) !== a.mime ||
      (await sha256(b)) !== a.sha256
    )
      fail("Embedded photograph integrity check failed.");
    images.set(a.id, new Uint8Array(b));
  }
  return { document, images, legacy: false };
}
