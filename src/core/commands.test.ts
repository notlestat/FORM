import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../../experiments/afterimage/core.ts";
import { StudyCommands } from "./commands.ts";
import type { AuthoringState } from "./commands.ts";

const initial = (): AuthoringState => ({
  name: "Study",
  params: defaults(391, 623),
  positions: {
    source: { x: 66, y: 218 },
    operation: { x: 346, y: 292 },
    result: { x: 600, y: 68 },
  },
  capture: { x: -100, y: -200, width: 1000, height: 1000 },
  connected: true,
});
test("mixed document edits undo and redo exact authored state in order", () => {
  const start = initial(),
    c = new StudyCommands(start),
    states = [start];
  states.push(
    c.execute(
      { type: "placement", object: "source", position: { x: -555, y: 500 } },
      "Move source",
    ),
  );
  states.push(
    c.execute({ type: "connection", connected: false }, "Disconnect source"),
  );
  states.push(
    c.execute(
      {
        type: "capture",
        capture: { x: -600, y: -300, width: 1300, height: 1300 },
      },
      "Fit artwork",
    ),
  );
  states.push(
    c.execute({ type: "name", name: "Renamed study" }, "Rename study"),
  );
  states.push(
    c.execute(
      {
        type: "parameters",
        params: { ...start.params, seed: 937, jitter: 23, count: 31 },
      },
      "Edit exposure",
    ),
  );
  for (let i = states.length - 2; i >= 0; i--)
    assert.deepEqual(c.undo(), states[i]);
  for (let i = 1; i < states.length; i++) assert.deepEqual(c.redo(), states[i]);
});
test("a hundred drag previews form one undo entry", () => {
  const c = new StudyCommands(initial());
  c.begin("Move result");
  for (let i = 0; i < 100; i++)
    c.execute(
      { type: "placement", object: "result", position: { x: i, y: -i } },
      "Move result",
    );
  assert.equal(c.status.undoCount, 0);
  c.commit();
  assert.equal(c.status.undoCount, 1);
  assert.deepEqual(c.undo(), initial());
  assert.deepEqual(c.redo().positions.result, { x: 99, y: -99 });
});
test("cancel restores all previewed fields and preserves the redo branch", () => {
  const c = new StudyCommands(initial());
  c.execute({ type: "name", name: "A" }, "Rename");
  c.undo();
  c.begin("Edit path");
  c.execute(
    { type: "parameters", params: { ...initial().params, count: 62 } },
    "Count",
  );
  c.execute(
    { type: "placement", object: "result", position: { x: 22, y: 34 } },
    "Move",
  );
  assert.deepEqual(c.cancel(), initial());
  assert.equal(c.status.undoCount, 0);
  assert.equal(c.status.redoCount, 1);
  assert.equal(c.redo().name, "A");
});
test("no-op gestures and edits do not erase redo", () => {
  const c = new StudyCommands(initial());
  c.execute({ type: "connection", connected: false }, "Disconnect");
  c.undo();
  c.begin("Drag");
  c.execute(
    { type: "placement", object: "result", position: { x: 600, y: 68 } },
    "Drag",
  );
  c.commit();
  c.execute({ type: "name", name: "Study" }, "Rename");
  c.execute(
    {
      type: "capture",
      capture: { height: 1000, width: 1000, y: -200, x: -100 },
    },
    "Fit",
  );
  c.execute(
    { type: "placement", object: "source", position: { y: 218, x: 66 } },
    "Move",
  );
  assert.equal(c.status.redoCount, 1);
  assert.equal(c.status.undoCount, 0);
  assert.equal(c.redo().connected, false);
});
test("a new committed edit replaces the redo branch", () => {
  const c = new StudyCommands(initial());
  c.execute({ type: "name", name: "A" }, "Rename");
  c.undo();
  c.begin("Move");
  c.execute(
    { type: "placement", object: "source", position: { x: 44, y: 22 } },
    "Move",
  );
  c.commit();
  assert.equal(c.status.redoCount, 0);
  assert.deepEqual(c.redo(), c.state);
});
test("invalid commands leave current state, revision and history intact", () => {
  const c = new StudyCommands(initial());
  c.execute({ type: "connection", connected: false }, "Disconnect");
  const before = c.state,
    status = c.status;
  assert.throws(
    () =>
      c.execute(
        { type: "placement", object: "result", position: { x: NaN, y: 2 } },
        "Move",
      ),
    /finite/,
  );
  assert.throws(() =>
    c.execute(
      { type: "parameters", params: { ...before.params, count: 65 } },
      "Count",
    ),
  );
  assert.throws(
    () =>
      c.execute(
        { type: "capture", capture: { x: 0, y: 0, width: 0, height: 0 } },
        "Fit",
      ),
    /square/,
  );
  assert.throws(() => c.execute({ type: "name", name: "" }, "Rename"), /Name/);
  assert.deepEqual(c.state, before);
  assert.deepEqual(c.status, status);
});
test("history snapshots cannot be mutated by callers and respect the limit", () => {
  const start = initial(),
    c = new StudyCommands(start, 2);
  start.params.count = 60;
  for (const name of ["A", "B", "C"])
    c.execute({ type: "name", name }, "Rename");
  const external = c.state;
  external.params.count = 45;
  external.positions.source.x = 123;
  assert.equal(c.state.params.count, 9);
  assert.equal(c.state.positions.source.x, 66);
  assert.equal(c.status.undoCount, 2);
  assert.equal(c.undo().name, "B");
  assert.equal(c.undo().name, "A");
  assert.equal(c.undo().name, "A");
});
test("opening a new state clears transactions and both histories", () => {
  const c = new StudyCommands(initial());
  c.execute({ type: "name", name: "Old" }, "Rename");
  c.begin("Drag");
  c.execute(
    { type: "placement", object: "result", position: { x: 2, y: 3 } },
    "Move",
  );
  const next = { ...initial(), name: "New project" };
  c.reset(next);
  assert.deepEqual(c.undo(), next);
  assert.deepEqual(c.redo(), next);
  assert.equal(c.status.active, false);
  assert.equal(c.status.undoCount, 0);
  assert.equal(c.status.redoCount, 0);
});
test("undo during an open transaction cannot split a drag", () => {
  const c = new StudyCommands(initial());
  c.begin("Drag");
  c.execute(
    { type: "placement", object: "result", position: { x: 2, y: 3 } },
    "Move",
  );
  assert.throws(() => c.undo(), /Finish/);
  assert.throws(() => c.redo(), /Finish/);
  c.cancel();
  assert.deepEqual(c.state, initial());
});
