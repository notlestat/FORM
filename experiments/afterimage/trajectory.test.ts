import test from "node:test";
import assert from "node:assert/strict";
import { TrajectoryStroke, fitTrajectory } from "./trajectory.ts";
import { cubic, defaults, sample } from "./core.ts";
import { StudyCommands } from "../../src/core/commands.ts";
import {
  createDocument,
  encodeProject,
  decodeProject,
  sha256,
} from "../../src/core/project.ts";
import { readFileSync } from "node:fs";

test("straight strokes fit the same curve despite uneven pointer sampling", () => {
  const a = fitTrajectory([
    { x: 0, y: 20 },
    { x: 1, y: 20 },
    { x: 2, y: 20 },
    { x: 40, y: 20 },
    { x: 120, y: 20 },
  ])!;
  const b = fitTrajectory([
    { x: 0, y: 20 },
    { x: 120, y: 20 },
  ])!;
  a.forEach((p, i) => {
    assert.ok(Math.abs(p.x - b[i].x) < 1e-10);
    assert.ok(Math.abs(p.y - 20) < 1e-10);
  });
  for (let i = 0; i <= 10; i++)
    assert.ok(Math.abs(cubic(a, i / 10).x - i * 12) < 1e-10);
});
test("a drawn arc retains endpoints and follows its bend with bounded approximation", () => {
  const points = Array.from({ length: 101 }, (_, i) => ({
    x: 100 * Math.cos(((i / 100) * Math.PI) / 2),
    y: 100 * Math.sin(((i / 100) * Math.PI) / 2),
  }));
  const path = fitTrajectory(points)!;
  assert.deepEqual(path[0], points[0]);
  assert.deepEqual(path[3], points.at(-1));
  for (let i = 0; i <= 100; i++) {
    const p = cubic(path, i / 100);
    assert.ok(
      Math.hypot(p.x - points[i].x, p.y - points[i].y) < 1,
      "Arc fitting error must stay below one source unit.",
    );
  }
});
test("reversing a stroke reverses the fitted trajectory and its exposure movement", () => {
  const points = [
      { x: -40, y: 50 },
      { x: 10, y: 80 },
      { x: 70, y: 85 },
      { x: 90, y: 110 },
    ],
    a = fitTrajectory(points)!,
    b = fitTrajectory([...points].reverse())!;
  a.forEach((p, i) => {
    assert.ok(Math.hypot(p.x - b[3 - i].x, p.y - b[3 - i].y) < 1e-10);
  });
  const p = defaults(100, 100);
  p.path = b;
  assert.equal(sample(p).at(-1)!.x, -130);
  assert.equal(sample(p).at(-1)!.y, -60);
});
test("taps, repeated samples and short strokes cannot replace the existing path", () => {
  assert.equal(fitTrajectory([]), null);
  assert.equal(
    fitTrajectory([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]),
    null,
  );
  assert.equal(
    fitTrajectory(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      6,
    ),
    null,
  );
  assert.deepEqual(
    fitTrajectory([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 9, y: 3 },
    ]),
    fitTrajectory([
      { x: 0, y: 0 },
      { x: 9, y: 3 },
    ]),
  );
});
test("stroke collection is bounded, detached and keeps the latest endpoint", () => {
  const start = { x: 0, y: 0 },
    stroke = new TrajectoryStroke(start, 0.1);
  start.x = 99;
  for (let i = 1; i <= 15000; i++) stroke.append({ x: i / 10, y: 0 });
  const points = stroke.points;
  assert.ok(points.length <= 2048);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.deepEqual(points.at(-1), { x: 1500, y: 0 });
  points[0].x = 88;
  assert.equal(stroke.points[0].x, 0);
  assert.ok(fitTrajectory(stroke.points));
});
test("invalid or oversized stroke data fail without modifying the input", () => {
  const points = [
      { x: 0, y: 0 },
      { x: 10, y: NaN },
    ],
    before = structuredClone(points);
  assert.throws(() => fitTrajectory(points), /coordinates/);
  assert.deepEqual(points, before);
  assert.throws(
    () =>
      fitTrajectory(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0,
      ),
    /minimum/,
  );
  assert.throws(
    () => fitTrajectory(Array.from({ length: 2049 }, () => ({ x: 0, y: 0 }))),
    /too many/,
  );
  assert.throws(() => new TrajectoryStroke({ x: 0, y: 0 }, 0), /spacing/);
});
test("drawing is one exact undo entry, cancellation preserves redo and saving retains the fitted curve", async () => {
  const params = defaults(391, 623),
    initial = {
      name: "Drawn study",
      params,
      positions: {
        source: { x: 66, y: 218 },
        operation: { x: 346, y: 292 },
        result: { x: 600, y: 68 },
      },
      capture: { x: -50, y: -50, width: 1000, height: 1000 },
      connected: true,
    };
  const store = new StudyCommands(initial),
    path = fitTrajectory([
      { x: 195, y: 311 },
      { x: 260, y: 210 },
      { x: 390, y: 280 },
      { x: 550, y: 450 },
    ])!;
  store.begin("Draw trajectory");
  store.execute(
    { type: "parameters", params: { ...store.state.params, path } },
    "Draw trajectory",
  );
  store.commit();
  assert.equal(store.status.undoCount, 1);
  assert.deepEqual(store.state.capture, initial.capture);
  store.undo();
  assert.deepEqual(store.state, initial);
  store.begin("Draw trajectory");
  store.cancel();
  assert.equal(store.status.redoCount, 1);
  store.redo();
  assert.deepEqual(store.state.params.path, path);
  const image = new Uint8Array(
      readFileSync(
        new URL("../../public/fixtures/marble-head.jpg", import.meta.url),
      ),
    ),
    hash = await sha256(image);
  const doc = createDocument(
    "draw-test",
    {
      ...store.state,
      presentation: {
        camera: { x: 45, y: 30, scale: 0.8 },
        mode: "path",
        proof: "paper",
      },
    },
    {
      id: hash,
      sha256: hash,
      path: `assets/${hash}.jpg`,
      mime: "image/jpeg",
      byteLength: image.length,
      width: 391,
      height: 623,
      name: "Head.jpg",
    },
  );
  assert.deepEqual(
    (await decodeProject(await encodeProject(doc, image))).document.operation
      .params.path,
    path,
  );
});
