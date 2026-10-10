import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import {
  validatePaintedMask,
  appendMaskStroke,
  MaskStrokeBuilder,
  MAX_MASK_POINTS,
} from "./mask.ts";
import type { PaintedMask } from "./mask.ts";
import { defaults } from "./core.ts";
import { StudyCommands } from "../../src/core/commands.ts";
import {
  createDocument,
  encodeProject,
  decodeProject,
  sha256,
  validateDocument,
  readProjectEntries,
} from "../../src/core/project.ts";
import {
  encodeWorkspace,
  decodeWorkspace,
  duplicateStudy,
  MAX_WORKSPACE_BYTES,
} from "../../src/core/workspace.ts";
import type { WorkspaceDocument } from "../../src/core/workspace.ts";
const empty = (): PaintedMask => ({
  enabled: true,
  base: "empty",
  strokes: [],
});
const stroke = {
  mode: "paint" as const,
  radius: 0.06,
  points: [
    { x: 0.4, y: 0.2 },
    { x: 0.5, y: 0.7 },
  ],
};
const initial = () => ({
  name: "Painted study",
  params: defaults(391, 623),
  positions: {
    source: { x: 66, y: 218 },
    operation: { x: 346, y: 292 },
    result: { x: 600, y: 68 },
  },
  capture: { x: -100, y: -100, width: 1000, height: 1000 },
  connected: true,
});
const image = new Uint8Array(
    readFileSync(
      new URL("../../public/fixtures/marble-head.jpg", import.meta.url),
    ),
  ),
  hash = await sha256(image);
const asset = {
  id: hash,
  sha256: hash,
  path: `assets/${hash}.jpg`,
  byteLength: image.length,
  mime: "image/jpeg" as const,
  width: 391,
  height: 623,
  name: "Head.jpg",
};
const doc = (mask?: PaintedMask) =>
  createDocument(
    "paint-test",
    {
      ...initial(),
      params: { ...initial().params, ...(mask ? { paintedMask: mask } : {}) },
      presentation: {
        camera: { x: 45, y: 30, scale: 0.8 },
        mode: "mask",
        proof: "paper",
      },
    },
    asset,
  );
test("paint and erase records are detached, ordered and bounded", () => {
  const mask = empty(),
    s = structuredClone(stroke),
    next = appendMaskStroke(mask, s);
  s.points[0].x = 0;
  assert.equal(next.strokes[0].points[0].x, 0.4);
  assert.equal(mask.strokes.length, 0);
  const erased = appendMaskStroke(next, { ...stroke, mode: "erase" });
  assert.deepEqual(
    erased.strokes.map((s) => s.mode),
    ["paint", "erase"],
  );
  assert.throws(
    () =>
      validatePaintedMask({
        ...empty(),
        strokes: Array.from({ length: 65 }, () => stroke),
      }),
    /selection/,
  );
  assert.throws(
    () =>
      validatePaintedMask({
        ...empty(),
        strokes: [
          {
            ...stroke,
            points: Array.from({ length: MAX_MASK_POINTS + 1 }, () => ({
              x: 0.5,
              y: 0.5,
            })),
          },
        ],
      }),
    /too many/,
  );
});
test("invalid normalized geometry and brush settings cannot enter authored state", () => {
  for (const bad of [
    { ...stroke, radius: 0 },
    { ...stroke, mode: "unknown" },
    { ...stroke, points: [] },
    { ...stroke, points: [{ x: Infinity, y: 0.5 }] },
    { ...stroke, points: [{ x: 1.1, y: 0.5 }] },
  ])
    assert.throws(() => validatePaintedMask({ ...empty(), strokes: [bad] }));
  const store = new StudyCommands(initial()),
    before = store.state;
  assert.throws(() =>
    store.execute(
      {
        type: "parameters",
        params: {
          ...before.params,
          paintedMask: { ...empty(), strokes: [{ ...stroke, radius: 1 }] },
        },
      },
      "Paint",
    ),
  );
  assert.deepEqual(store.state, before);
  assert.equal(store.status.undoCount, 0);
});
test("long brush gestures keep endpoints, precision and point limits", () => {
  const builder = new MaskStrokeBuilder(32, 0.001);
  builder.append({ x: 0.123456789, y: 0.2 });
  for (let i = 1; i < 10000; i++) builder.append({ x: i / 10000, y: 0.2 });
  builder.append({ x: 1.5, y: -0.1 }, true);
  const points = builder.strokePoints;
  assert.ok(points.length <= 32);
  assert.deepEqual(points[0], { x: 0.123457, y: 0.2 });
  assert.deepEqual(points.at(-1), { x: 1, y: 0 });
  points[0].x = 0;
  assert.equal(builder.strokePoints[0].x, 0.123457);
  assert.throws(() => builder.append({ x: Infinity, y: 0 }), /coordinates/);
  assert.throws(() => new MaskStrokeBuilder(1, 0.001), /full/);
});
test("each stroke has exact undo/redo and leaves trajectory and capture unchanged", () => {
  const store = new StudyCommands({
      ...initial(),
      params: { ...initial().params, paintedMask: empty() },
    }),
    before = store.state;
  store.begin("Paint selection");
  store.execute(
    {
      type: "parameters",
      params: {
        ...store.state.params,
        paintedMask: appendMaskStroke(empty(), stroke),
      },
    },
    "Paint selection",
  );
  store.commit();
  assert.equal(store.status.undoCount, 1);
  assert.deepEqual(store.state.capture, before.capture);
  assert.deepEqual(store.state.params.path, before.params.path);
  store.undo();
  assert.deepEqual(store.state, before);
  store.begin("Paint selection");
  store.cancel();
  assert.equal(store.status.redoCount, 1);
  store.redo();
  assert.deepEqual(store.state.params.paintedMask!.strokes, [stroke]);
  store.execute(
    {
      type: "parameters",
      params: {
        ...store.state.params,
        paintedMask: {
          strokes: [
            {
              points: structuredClone(stroke.points),
              radius: stroke.radius,
              mode: stroke.mode,
            },
          ],
          base: "empty",
          enabled: true,
        },
      },
    },
    "No change",
  );
  assert.equal(store.status.undoCount, 1);
});
test("painted files declare instrument version 2 and retain strokes exactly", async () => {
  const d = doc(appendMaskStroke(empty(), stroke));
  assert.equal(d.operation.instrumentVersion, 2);
  const bytes = await encodeProject(d, image),
    loaded = await decodeProject(bytes);
  assert.deepEqual(loaded.document, d);
  const entries = readProjectEntries(bytes);
  assert.equal(
    JSON.parse(new TextDecoder().decode(entries.get("manifest.json")))
      .instrument.version,
    2,
  );
  d.operation.instrumentVersion = 1;
  assert.throws(() => validateDocument(d), /version 2/);
});
test("legacy and mixed study workspaces keep independent masks and shared asset identity", async () => {
  const legacy = doc();
  assert.equal(legacy.operation.instrumentVersion, 1);
  const old = await decodeWorkspace(await encodeProject(legacy, image));
  assert.deepEqual(old.document.studies[0].document, legacy);
  const workspace: WorkspaceDocument = {
    format: "form",
    formatVersion: 2,
    projectId: "paint-test",
    name: "Paint project",
    activeStudyId: "paint",
    studies: [
      { id: "old", document: legacy },
      { id: "paint", document: doc(appendMaskStroke(empty(), stroke)) },
    ],
  };
  const copied = duplicateStudy(workspace, "paint", "copy");
  copied.studies[2].document.operation.params.paintedMask!.strokes[0].points[0].x = 0.1;
  assert.equal(
    copied.studies[1].document.operation.params.paintedMask!.strokes[0]
      .points[0].x,
    0.4,
  );
  const bytes = await encodeWorkspace(copied, new Map([[hash, image]])),
    loaded = await decodeWorkspace(bytes);
  assert.deepEqual(loaded.document, copied);
  assert.equal(loaded.images.size, 1);
  const entries = readProjectEntries(bytes, MAX_WORKSPACE_BYTES, 6);
  assert.equal(
    JSON.parse(new TextDecoder().decode(entries.get("manifest.json")))
      .instrument.version,
    2,
  );
});
test("mismatched required instrument versions reject otherwise valid packages", async () => {
  const workspace: WorkspaceDocument = {
    format: "form",
    formatVersion: 2,
    projectId: "paint-test",
    name: "Paint project",
    activeStudyId: "paint",
    studies: [{ id: "paint", document: doc(empty()) }],
  };
  const bytes = await encodeWorkspace(workspace, new Map([[hash, image]])),
    entries = readProjectEntries(bytes, MAX_WORKSPACE_BYTES, 6);
  const manifest = JSON.parse(
    new TextDecoder().decode(entries.get("manifest.json")),
  );
  manifest.instrument.version = 1;
  entries.set("manifest.json", strToU8(JSON.stringify(manifest)));
  await assert.rejects(
    decodeWorkspace(zipSync(Object.fromEntries(entries), { level: 0 })),
    /requirements/,
  );
});
test("four fully bounded painted studies fit within the supported metadata budget", async () => {
  const points = Array.from({ length: MAX_MASK_POINTS }, (_, i) => ({
    x: Math.round((i / (MAX_MASK_POINTS - 1)) * 1e6) / 1e6,
    y: 0.654321,
  }));
  const mask = {
      ...empty(),
      strokes: Array.from({ length: 64 }, (_, i) => ({
        ...stroke,
        points: points.slice(i * 8, i * 8 + 8),
      })),
    },
    workspace: WorkspaceDocument = {
      format: "form",
      formatVersion: 2,
      projectId: "paint-test",
      name: "Paint project",
      activeStudyId: "paint-0",
      studies: Array.from({ length: 4 }, (_, i) => ({
        id: `paint-${i}`,
        document: doc(mask),
      })),
    };
  const bytes = await encodeWorkspace(workspace, new Map([[hash, image]]));
  assert.equal((await decodeWorkspace(bytes)).document.studies.length, 4);
});
