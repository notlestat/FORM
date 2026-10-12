import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyField,
  addAfterimage,
  validateField,
  FieldCommands,
  connect,
} from "./field.ts";
import { placeMaterial } from "./frame.ts";
import {
  defineInstrument,
  applyInstrument,
  parseDefinition,
  validateDefinition,
  INSTRUMENT_BYTES,
} from "./instrument.ts";
import { operationInputs } from "./evaluation.ts";
const ids = () => {
  let i = 0;
  return () => `inst-${++i}`;
};
function fixture() {
  const id = ids(),
    placed = placeMaterial(emptyField("p"), "text", { x: 0, y: 0 }, id),
    source = placed.document.nodes[0].id;
  const added = addAfterimage(placed.document, source, id, { x: 900, y: 280 }),
    d = added.document,
    op = d.placements.find((p) => p.id === added.placementId)!.nodeId;
  return { id, d, op, source };
}
test("an authored instrument roundtrips settings and connected guides as portable data", () => {
  const { d, op } = fixture(),
    path = d.nodes.find((n) => n.kind === "trajectory")!;
  if (path.kind === "trajectory") path.points[2] = { x: 340, y: -85 };
  const mask = d.nodes.find((n) => n.kind === "selection")!;
  if (mask.kind === "selection")
    mask.coverage = {
      kind: "painted",
      painted: {
        enabled: true,
        base: "empty",
        strokes: [
          {
            mode: "paint",
            radius: 0.04,
            points: [
              { x: 0.3, y: 0.4 },
              { x: 0.8, y: 0.9 },
            ],
          },
        ],
      },
    };
  const definition = defineInstrument(d, op, { width: 900, height: 280 });
  const parsed = parseDefinition(
    new TextEncoder().encode(JSON.stringify(definition)),
  );
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(definition)));
  assert.deepEqual(parsed.params.path, operationInputs(d, op).params.path);
  assert.equal(parsed.selection?.coverage.kind, "painted");
});
test("applying an instrument rescales coordinates and frames but preserves seed and normalized coverage", () => {
  const { d, id, op, source } = fixture();
  const node = d.nodes.find((n) => n.id === op)!;
  if (node.kind === "afterimage")
    node.frame = { x: -50, y: 30, width: 1000, height: 500 };
  const def = defineInstrument(d, op, { width: 900, height: 280 }),
    before = structuredClone(d);
  const applied = applyInstrument(
      d,
      source,
      { width: 1800, height: 560 },
      def,
      id,
    ),
    p = applied.document.placements.find((p) => p.id === applied.placementId)!,
    n = applied.document.nodes.find((n) => n.id === p.nodeId)!;
  const resolved = operationInputs(applied.document, n.id);
  assert.deepEqual(
    resolved.params.path,
    def.params.path.map((p) => ({ x: p.x * 2, y: p.y * 2 })),
  );
  assert.equal(resolved.params.seed, def.params.seed);
  assert.deepEqual(resolved.selection?.coverage, def.selection?.coverage);
  if (n.kind === "afterimage")
    assert.deepEqual(n.frame, { x: -100, y: 60, width: 2000, height: 1000 });
  assert.deepEqual(d, before);
  assert.deepEqual(
    applied.document.edges.find((e) => e.to === n.id && e.input === "image"),
    { from: source, to: n.id, input: "image" },
  );
  validateField(applied.document);
});
test("an instrument without a selection stays unmasked after application", () => {
  const { d, id, op, source } = fixture();
  d.edges = d.edges.filter((e) => !(e.to === op && e.input === "selection"));
  const def = defineInstrument(d, op, { width: 900, height: 280 }),
    added = applyInstrument(d, source, { width: 900, height: 280 }, def, id),
    nextId = added.document.placements.find(
      (p) => p.id === added.placementId,
    )!.nodeId;
  assert.equal(operationInputs(added.document, nextId).selection, null);
  assert.equal(
    added.document.nodes.filter((n) => n.kind === "selection").length,
    1,
  );
});
test("image-mask instruments explicitly require a project rather than silently losing their source", () => {
  const { d, op } = fixture();
  const mask = d.nodes.find((n) => n.kind === "selection")!;
  if (mask.kind === "selection")
    mask.coverage = { kind: "image", assetId: "not-embedded" };
  assert.throws(
    () => defineInstrument(d, op, { width: 900, height: 280 }),
    /imported selection image/,
  );
});
test("invalid, oversized, future or executable definitions are rejected without authoring changes", () => {
  const { d, id, op, source } = fixture(),
    def = defineInstrument(d, op, { width: 900, height: 280 }),
    commands = new FieldCommands(d);
  const invalid = [
    { ...def, formatVersion: 2 },
    { ...def, instrument: { id: "unknown", version: 2 } },
    { ...def, sourceSize: { width: 0, height: 100 } },
    { ...def, code: "alert(1)" },
    { ...def, params: { ...def.params, seed: -1 } },
    {
      ...def,
      selection: { coverage: { kind: "closed", points: [] }, feather: 0.1 },
    },
  ];
  for (const value of invalid) {
    assert.throws(() => validateDefinition(value));
    assert.throws(() =>
      commands.execute(
        "apply",
        (v) =>
          applyInstrument(
            v,
            source,
            { width: 900, height: 280 },
            value as any,
            id,
          ).document,
      ),
    );
    assert.deepEqual(commands.state, d);
  }
  assert.throws(
    () => parseDefinition(new Uint8Array(INSTRUMENT_BYTES + 1)),
    /256 KiB/,
  );
  assert.throws(() => parseDefinition(new Uint8Array([255])), /encoded data/);
});
test("reusable instrument creation is a single undoable command and does not rewrite shared guides", () => {
  const { d, id, op, source } = fixture(),
    def = defineInstrument(d, op, { width: 900, height: 280 }),
    commands = new FieldCommands(d);
  commands.execute(
    "apply",
    (v) =>
      applyInstrument(v, source, { width: 900, height: 280 }, def, id).document,
  );
  const after = commands.state;
  commands.undo();
  assert.deepEqual(commands.state, d);
  commands.redo();
  assert.deepEqual(commands.state, after);
});

test("a valid maximum-length instrument name produces a valid bounded output label", () => {
  const { d, id, op, source } = fixture(),
    def = defineInstrument(d, op, { width: 900, height: 280 });
  def.name = "B".repeat(160);
  validateDefinition(def);
  const added = applyInstrument(
    d,
    source,
    { width: 900, height: 280 },
    def,
    id,
  );
  const p = added.document.placements.find((p) => p.id === added.placementId)!;
  assert.ok(p.name.length <= 160);
  assert.equal(
    added.document.nodes.find((n) => n.id === p.nodeId)!.name,
    def.name,
  );
});
