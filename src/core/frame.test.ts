import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  emptyField,
  validateField,
  encodeField,
  decodeField,
  FieldCommands,
  linkedCopy,
  independentVariation,
  connect,
  addAfterimage,
} from "./field.ts";
import { sha256 } from "./project.ts";
import { artboardAt, columnGuides, materialKey } from "./authoring.ts";
import {
  placeMaterial,
  fitArtworkToArtboard,
  textLines,
  contactSheet,
} from "./frame.ts";
import { selectionBounds } from "./arrangement.ts";
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
function materials() {
  const id = ids(),
    first = placeMaterial(emptyField("test"), "text", { x: 20, y: 50 }, id);
  const second = placeMaterial(
    first.document,
    "ellipse",
    { x: 1100, y: 500 },
    id,
  );
  const sizes = new Map(
    second.document.nodes.flatMap((n) =>
      n.kind === "text" || n.kind === "shape"
        ? [[n.id, { width: n.width, height: n.height }] as const]
        : [],
    ),
  );
  return {
    d: second.document,
    sizes,
    ids: second.document.placements.map((p) => p.id),
    id,
  };
}
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("format 4 stores editable materials, transparent artboards and their guides without assets", async () => {
  const { d } = materials();
  d.artboards.push({
    ...artboardAt("board", { x: -50, y: 80 }),
    background: null,
  });
  const loaded = await decodeField(await encodeField(d, new Map()));
  assert.deepEqual(loaded.document, d);
  assert.equal(loaded.migrated, false);
  assert.equal(loaded.assets.size, 0);
});
async function pack(doc: unknown, version: number) {
  const bytes = strToU8(JSON.stringify(doc));
  return zipSync(
    {
      "document.json": bytes,
      "manifest.json": strToU8(
        JSON.stringify({
          format: "form",
          formatVersion: version,
          document: {
            path: "document.json",
            byteLength: bytes.length,
            sha256: await sha256(bytes),
          },
          instruments: [],
        }),
      ),
    },
    { level: 0 },
  );
}
test("a genuine format 3 project migrates explicitly and never mutates its original bytes", async () => {
  const old = JSON.parse(JSON.stringify(emptyField("old")));
  delete old.artboards;
  old.formatVersion = 3;
  const bytes = await pack(old, 3),
    copy = bytes.slice();
  const result = await decodeField(bytes);
  assert.equal(result.migrated, true);
  assert.equal(result.document.formatVersion, 4);
  assert.deepEqual(result.document.artboards, []);
  assert.deepEqual(bytes, copy);
});
test("format mismatches and new objects falsely declared as old documents are rejected", async () => {
  await assert.rejects(() => decodeFieldPromise(), /versions disagree/);
  async function decodeFieldPromise() {
    return decodeField(await pack(emptyField("test"), 3));
  }
  const { d } = materials();
  const old = JSON.parse(JSON.stringify(d));
  delete old.artboards;
  old.formatVersion = 3;
  await assert.rejects(
    async () => decodeField(await pack(old, 3)),
    /Unsupported objects/,
  );
});
test("unsafe colours, unbounded typography and invalid grids fail before a command commits", () => {
  const { d } = materials(),
    commands = new FieldCommands(d),
    before = commands.state;
  assert.throws(
    () =>
      commands.execute("bad text", (v) => {
        const n = v.nodes.find((n) => n.kind === "text")!;
        if (n.kind === "text") n.color = "url(https://example.com)";
      }),
    /text material/,
  );
  assert.deepEqual(commands.state, before);
  assert.equal(commands.status.undo, null);
  for (const change of [
    (n: any) => (n.fontSize = Infinity),
    (n: any) => (n.width = 4097),
    (n: any) => {
      n.width = 4096;
      n.height = 4096;
    },
    (n: any) => (n.content = "x".repeat(4097)),
  ]) {
    const bad = structuredClone(d);
    change(bad.nodes[0]);
    assert.throws(() => validateField(bad));
  }
  const b = artboardAt("b", { x: 0, y: 0 });
  b.margin = 540;
  assert.throws(() => columnGuides(b), /grid/);
});
test("column guides respect margins and leave the final margin exact", () => {
  const b = artboardAt("b", { x: -20, y: 400 });
  const columns = columnGuides(b);
  near(columns[0].x, b.margin);
  near(columns.at(-1)!.x + columns.at(-1)!.width, b.width - b.margin);
  near(columns[1].x - columns[0].x - columns[0].width, b.gutter);
});
test("group fitting preserves angles, reflections and relative proportions inside live margins", () => {
  const { d, sizes, ids } = materials();
  d.placements[0].transform.rotation = 37;
  d.placements[1].transform.scaleX = -1;
  const b = artboardAt("b", { x: 2000, y: -300 }),
    before = selectionBounds(d, ids, sizes),
    fit = fitArtworkToArtboard(d, ids, sizes, b),
    after = selectionBounds(fit, ids, sizes);
  near(after.x + after.width / 2, b.x + b.width / 2);
  near(after.y + after.height / 2, b.y + b.height / 2);
  assert.ok(after.width <= b.width - b.margin * 2 + 1e-8);
  assert.ok(after.height <= b.height - b.margin * 2 + 1e-8);
  near(after.width / after.height, before.width / before.height);
  assert.equal(fit.placements[0].transform.rotation, 37);
  assert.ok(fit.placements[1].transform.scaleX < 0);
  assert.notDeepEqual(fit.placements, d.placements);
  assert.deepEqual(fit.nodes, d.nodes);
});
test("failed oversized fitting leaves the source document and undo branch intact", () => {
  const { d, sizes, ids } = materials(),
    commands = new FieldCommands(d),
    b = {
      ...artboardAt("b", { x: 0, y: 0 }),
      width: 1,
      height: 1,
      margin: 0,
      columns: 1,
      gutter: 0,
    };
  assert.throws(
    () =>
      commands.execute("fit", (v) => fitArtworkToArtboard(v, ids, sizes, b)),
    /transform/,
  );
  assert.deepEqual(commands.state, d);
  assert.equal(commands.status.undo, null);
});
test("text and shape copies share data until varied independently; both can connect to AFTERIMAGE", () => {
  const { d, id } = materials();
  const source = d.nodes[0];
  const copy = linkedCopy(d, d.placements[0].id, id());
  assert.equal(copy.placements.at(-1)!.nodeId, source.id);
  const varied = independentVariation(
    copy,
    copy.placements.at(-1)!.id,
    id,
  ).document;
  const newId = varied.placements.at(-1)!.nodeId;
  assert.notEqual(newId, source.id);
  const node = varied.nodes.find((n) => n.id === newId)!;
  if (node.kind === "text") node.content = "Changed";
  assert.equal(
    (varied.nodes.find((n) => n.id === source.id) as any).content,
    "FORM",
  );
  const operated = addAfterimage(varied, source.id, id, {
    x: 900,
    y: 280,
  }).document;
  const op = operated.nodes.find((n) => n.kind === "afterimage")!;
  const reconnected = connect(operated, {
    from: d.nodes[1].id,
    to: op.id,
    input: "image",
  });
  assert.equal(
    reconnected.edges.find((e) => e.to === op.id && e.input === "image")!.from,
    d.nodes[1].id,
  );
});
test("a contact sheet keeps source artwork in place and creates linked images plus editable captions", async () => {
  const { d, sizes, ids, id } = materials(),
    before = structuredClone(d),
    sheet = contactSheet(d, ids, sizes, id),
    b = sheet.document.artboards[0];
  assert.deepEqual(
    sheet.document.placements.slice(0, d.placements.length),
    d.placements,
  );
  assert.deepEqual(sheet.document.nodes.slice(0, d.nodes.length), d.nodes);
  assert.equal(sheet.placementIds.length, 2);
  assert.equal(sheet.document.nodes.filter((n) => n.kind === "text").length, 3);
  for (const placementId of sheet.placementIds) {
    const p = sheet.document.placements.find((p) => p.id === placementId)!;
    assert.ok(d.nodes.some((n) => n.id === p.nodeId));
    const bounds = selectionBounds(sheet.document, [p.id], sizes);
    assert.ok(bounds.x >= b.x + b.margin - 1e-8);
    assert.ok(bounds.x + bounds.width <= b.x + b.width - b.margin + 1e-8);
  }
  assert.deepEqual(d, before);
  assert.deepEqual(
    (await decodeField(await encodeField(sheet.document, new Map()))).document,
    sheet.document,
  );
});
test("contact sheet creation, captions and board undo and redo together", () => {
  const { d, sizes, ids, id } = materials(),
    commands = new FieldCommands(d);
  commands.execute("sheet", (v) => contactSheet(v, ids, sizes, id).document);
  const after = commands.state;
  commands.undo();
  assert.deepEqual(commands.state, d);
  commands.redo();
  assert.deepEqual(commands.state, after);
});
test("contact sheets enforce existing artwork and document budgets atomically", () => {
  const { d, sizes, ids, id } = materials();
  assert.throws(() => contactSheet(d, [], sizes, id), /Select/);
  assert.throws(() => contactSheet(d, ["missing"], sizes, id));
  let crowded = d;
  while (crowded.placements.length < 32)
    crowded = linkedCopy(crowded, ids[0], id());
  const before = structuredClone(crowded);
  assert.throws(() => contactSheet(crowded, ids, sizes, id), /limits/);
  assert.deepEqual(crowded, before);
});
test("wrapping respects explicit lines, word boundaries, Unicode graphemes and character spacing", () => {
  const measure = (s: string) => (s === "e\u0301" ? 1 : s.length);
  assert.deepEqual(textLines("FORM\n\nTEST", 20, 0, measure), [
    "FORM",
    "",
    "TEST",
  ]);
  assert.deepEqual(textLines("one two three", 7, 0, measure), [
    "one two",
    "three",
  ]);
  assert.deepEqual(textLines("abcdef", 3, 0, measure), ["abc", "def"]);
  assert.deepEqual(textLines("e\u0301e\u0301", 1, 0, measure), [
    "e\u0301",
    "e\u0301",
  ]);
  assert.deepEqual(textLines("abcd", 3, 1, measure), ["ab", "cd"]);
  assert.deepEqual(textLines("a\r\nb", 3, 0, measure), ["a", "b"]);
});

test("material raster identity follows visual edits and ignores names, identifiers and station position", () => {
  const { d } = materials(),
    n = d.nodes[0];
  if (n.kind !== "text") throw Error("fixture");
  const key = materialKey(n, "preview"),
    copy = {
      ...n,
      id: "another",
      name: "renamed",
      position: { x: 999, y: 100 },
    };
  assert.equal(materialKey(copy, "preview"), key);
  copy.content = "NEW";
  assert.notEqual(materialKey(copy, "preview"), key);
  assert.notEqual(materialKey(n, "export"), key);
});

test("contact sheets accept maximum-length artwork names without truncating their caption content", () => {
  const { d, sizes, ids, id } = materials();
  d.placements[0].name = "A".repeat(160);
  validateField(d);
  const sheet = contactSheet(d, ids, sizes, id);
  assert.ok(sheet.document.placements.every((p) => p.name.length <= 160));
  assert.ok(
    sheet.document.nodes.some(
      (n) => n.kind === "text" && n.content === "A".repeat(160),
    ),
  );
});
