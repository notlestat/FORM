import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { defaults } from "../../experiments/afterimage/core.ts";
import {
  createDocument,
  encodeProject,
  sha256,
  readProjectEntries,
} from "./project.ts";
import type { Asset, StudyState } from "./project.ts";
import {
  duplicateStudy,
  encodeWorkspace,
  decodeWorkspace,
  validateWorkspace,
  MAX_WORKSPACE_BYTES,
} from "./workspace.ts";
import type { WorkspaceDocument } from "./workspace.ts";
const photo = new Uint8Array(
  readFileSync(
    new URL("../../public/fixtures/marble-head.jpg", import.meta.url),
  ),
);
const pixel = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=",
    "base64",
  ),
);
const hash = await sha256(photo),
  pixelHash = await sha256(pixel);
const asset: Asset = {
  id: hash,
  sha256: hash,
  path: `assets/${hash}.jpg`,
  byteLength: photo.length,
  mime: "image/jpeg",
  width: 391,
  height: 623,
  name: "Head.jpg",
};
const state: StudyState = {
  name: "Base study",
  params: defaults(391, 623),
  positions: {
    source: { x: 66, y: 218 },
    operation: { x: 346, y: 292 },
    result: { x: 600, y: 68 },
  },
  capture: { x: -100, y: -200, width: 1000, height: 1000 },
  connected: true,
  presentation: {
    camera: { x: 43, y: 25, scale: 0.7 },
    mode: "path",
    proof: "paper",
  },
};
const base = (): WorkspaceDocument => ({
  format: "form",
  formatVersion: 2,
  projectId: "test-project",
  name: "Study project",
  activeStudyId: "first",
  studies: [
    { id: "first", document: createDocument("test-project", state, asset) },
  ],
});
const images = () => new Map([[hash, photo]]);
async function raw(d: WorkspaceDocument, extra?: string) {
  const doc = strToU8(JSON.stringify(d));
  return zipSync(
    {
      "manifest.json": strToU8(
        JSON.stringify({
          format: "form",
          formatVersion: 2,
          document: {
            path: "document.json",
            sha256: await sha256(doc),
            byteLength: doc.length,
          },
          instrument: { id: "afterimage", version: 1 },
        }),
      ),
      "document.json": doc,
      [asset.path]: photo,
      ...(extra ? { [extra]: photo } : {}),
    },
    { level: 0 },
  );
}
test("duplicate studies have independent authored state and share one embedded photograph", async () => {
  const original = base(),
    d = duplicateStudy(original, "first", "second");
  d.studies[1].document.operation.params.count = 25;
  d.studies[1].document.capture.x = -900;
  d.studies[1].document.presentation.proof = "dark";
  assert.equal(original.studies.length, 1);
  assert.equal(d.studies[0].document.operation.params.count, 9);
  assert.equal(d.studies[0].document.capture.x, -100);
  const bytes = await encodeWorkspace(d, images()),
    loaded = await decodeWorkspace(bytes);
  assert.deepEqual(loaded.document, d);
  assert.equal(loaded.images.size, 1);
  assert.deepEqual(loaded.images.get(hash), photo);
  assert.equal(readProjectEntries(bytes, MAX_WORKSPACE_BYTES, 6).size, 3);
});
test("multiple source photographs and selected-study presentation roundtrip exactly", async () => {
  const d = base(),
    a: Asset = {
      id: pixelHash,
      sha256: pixelHash,
      path: `assets/${pixelHash}.png`,
      byteLength: pixel.length,
      mime: "image/png",
      width: 1,
      height: 1,
      name: "Pixel.png",
    };
  d.studies.push({
    id: "second",
    document: createDocument(
      d.projectId,
      {
        ...state,
        name: "Second source",
        params: defaults(1, 1),
        connected: false,
        presentation: {
          camera: { x: -330, y: 40, scale: 1.5 },
          mode: "mask",
          proof: "dark",
        },
      },
      a,
    ),
  });
  d.activeStudyId = "second";
  const bytes = await encodeWorkspace(
      d,
      new Map([
        [hash, photo],
        [pixelHash, pixel],
      ]),
    ),
    loaded = await decodeWorkspace(bytes);
  assert.deepEqual(loaded.document, d);
  assert.equal(loaded.images.size, 2);
  assert.deepEqual(loaded.images.get(pixelHash), pixel);
});
test("version 1 files migrate without changing the study or original bytes", async () => {
  const before = base().studies[0].document,
    loaded = await decodeWorkspace(await encodeProject(before, photo));
  assert.equal(loaded.legacy, true);
  assert.equal(loaded.document.formatVersion, 2);
  assert.deepEqual(loaded.document.studies[0].document, before);
  assert.deepEqual(loaded.images.get(hash), photo);
});
test("study identifiers, project ownership and selection must be valid", () => {
  const a = duplicateStudy(base(), "first", "second");
  a.studies[1].id = "first";
  assert.throws(() => validateWorkspace(a), /Duplicate/);
  const b = base();
  b.activeStudyId = "missing";
  assert.throws(() => validateWorkspace(b), /selected/);
  const c = base();
  c.studies[0].document.projectId = "other";
  assert.throws(() => validateWorkspace(c), /different project/);
});
test("deduplicated photographs cannot declare conflicting decoded dimensions", () => {
  const d = duplicateStudy(base(), "first", "second");
  d.studies[1].document.asset.width++;
  assert.throws(() => validateWorkspace(d), /Conflicting/);
});
test("study limits reject additions without mutating the original and copy names stay distinct", () => {
  let d = base();
  for (const id of ["second", "third", "fourth"])
    d = duplicateStudy(d, "first", id);
  assert.deepEqual(
    d.studies.map((s) => s.document.name),
    ["Base study", "Base study copy", "Base study copy 2", "Base study copy 3"],
  );
  const before = structuredClone(d);
  assert.throws(() => duplicateStudy(d, "first", "fifth"), /four studies/);
  assert.deepEqual(d, before);
});
test("missing, corrupt and unexpected assets cannot load a partial workspace", async () => {
  const d = base();
  await assert.rejects(encodeWorkspace(d, new Map()), /missing/);
  const bytes = await raw(d);
  const at = bytes.findIndex(
    (b, i) => b === 255 && bytes[i + 1] === 216 && bytes[i + 2] === 255,
  );
  bytes[at + 100] ^= 1;
  await assert.rejects(decodeWorkspace(bytes), /checksum/);
  await assert.rejects(
    decodeWorkspace(await raw(d, `assets/${"a".repeat(64)}.jpg`)),
    /Unexpected/,
  );
});
test("future workspace versions and oversized packages fail clearly", async () => {
  const d = base();
  (d as { formatVersion: number }).formatVersion = 3;
  await assert.rejects(decodeWorkspace(await raw(d)), /version/);
  await assert.rejects(
    decodeWorkspace(new Uint8Array(MAX_WORKSPACE_BYTES + 1)),
    /oversized/,
  );
});
