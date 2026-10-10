import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { defaults } from "../../experiments/afterimage/core.ts";
import {
  createDocument,
  studyFromDocument,
  encodeProject,
  decodeProject,
  sha256,
  validateDocument,
  MAX_PACKAGE_BYTES,
} from "./project.ts";
import type { Asset, FormDocument, StudyState } from "./project.ts";
const photo = new Uint8Array(
  readFileSync(
    new URL("../../public/fixtures/marble-head.jpg", import.meta.url),
  ),
);
const hash = await sha256(photo);
const asset: Asset = {
  id: hash,
  sha256: hash,
  path: `assets/${hash}.jpg`,
  mime: "image/jpeg",
  byteLength: photo.length,
  width: 391,
  height: 623,
  name: "Original photograph.jpg",
};
const state: StudyState = {
  name: "Exposure study",
  params: { ...defaults(391, 623), seed: 284, jitter: 33, count: 27 },
  positions: {
    source: { x: -555, y: 44 },
    operation: { x: 315, y: 701 },
    result: { x: 2045, y: -432 },
  },
  capture: { x: -300, y: -700, width: 1200, height: 1200 },
  connected: true,
  presentation: {
    camera: { x: -2500, y: 2000, scale: 1.3 },
    mode: "path",
    proof: "dark",
  },
};
const doc = () => createDocument("project-test-1", state, asset);
async function rawPackage(d: FormDocument, image = photo, extra?: string) {
  const document = strToU8(JSON.stringify(d));
  const manifest = strToU8(
    JSON.stringify({
      format: "form",
      formatVersion: 1,
      document: {
        path: "document.json",
        byteLength: document.length,
        sha256: await sha256(document),
      },
      instrument: { id: "afterimage", version: 1 },
    }),
  );
  return zipSync(
    {
      "manifest.json": manifest,
      "document.json": document,
      [extra ?? d.asset.path]: image,
    },
    { level: 0 },
  );
}
test("portable package retains exact authored state and original asset bytes", async () => {
  const d = doc(),
    bytes = await encodeProject(d, photo),
    loaded = await decodeProject(bytes);
  assert.deepEqual(loaded.document, d);
  assert.deepEqual(loaded.image, photo);
  assert.deepEqual(studyFromDocument(loaded.document), state);
  loaded.document.operation.params.seed++;
  assert.equal(d.operation.params.seed, 284);
});
test("explicit capture, presentation and disconnected input survive reopen", async () => {
  const changed = { ...state, connected: false };
  const d = createDocument("project-test-2", changed, asset);
  const loaded = await decodeProject(await encodeProject(d, photo));
  assert.deepEqual(studyFromDocument(loaded.document), changed);
});
test("future document and unsupported instrument versions fail clearly", () => {
  assert.throws(
    () => validateDocument({ ...doc(), formatVersion: 2 }),
    /version/,
  );
  const d = doc();
  (d.operation as { instrumentVersion: number }).instrumentVersion = 3;
  assert.throws(() => validateDocument(d), /instrument version/);
});
test("broken references, non-finite capture and invalid parameters fail validation", () => {
  const broken = doc();
  (broken.connections[0] as { sourceId: string }).sourceId = "missing";
  assert.throws(() => validateDocument(broken), /connection/);
  const invalid = doc();
  invalid.capture.x = NaN;
  assert.throws(() => validateDocument(invalid), /coordinates/);
  const params = doc();
  params.operation.params.count = 1000;
  assert.throws(() => validateDocument(params), /AFTERIMAGE/);
});
test("corrupted asset payload fails CRC before loading", async () => {
  const bytes = await encodeProject(doc(), photo);
  const at = bytes.findIndex(
    (b, i) => b === 255 && bytes[i + 1] === 216 && bytes[i + 2] === 255,
  );
  assert.ok(at >= 0);
  bytes[at + 100] ^= 1;
  await assert.rejects(decodeProject(bytes), /checksum/);
});
test("asset hash mismatch is rejected even with valid ZIP CRCs", async () => {
  const altered = photo.slice();
  altered[400] ^= 1;
  await assert.rejects(
    decodeProject(await rawPackage(doc(), altered)),
    /photograph integrity/,
  );
});
test("unsafe asset paths and unknown entries are rejected", async () => {
  await assert.rejects(
    decodeProject(await rawPackage(doc(), photo, "../outside.jpg")),
    /entry/,
  );
});
test("oversized packages and compression expansion are rejected before extraction", async () => {
  await assert.rejects(
    decodeProject(new Uint8Array(MAX_PACKAGE_BYTES + 1)),
    /oversized/,
  );
  const bytes = await encodeProject(doc(), photo),
    v = new DataView(bytes.buffer),
    end = bytes.length - 22,
    central = v.getUint32(end + 16, true);
  v.setUint32(central + 24, 0x7fffffff, true);
  await assert.rejects(decodeProject(bytes), /Unsupported compressed/);
});
test("invalid semantic document inside an otherwise valid archive cannot load", async () => {
  const d = doc();
  d.capture.width = 0;
  await assert.rejects(decodeProject(await rawPackage(d)), /capture frame/);
});
test("truncated packages fail without returning partial project data", async () => {
  const bytes = await encodeProject(doc(), photo);
  await assert.rejects(
    decodeProject(bytes.subarray(0, bytes.length - 10)),
    /archive/,
  );
});
