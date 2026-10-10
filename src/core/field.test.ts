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
import { encodeWorkspace } from "./workspace.ts";
import {
  addAfterimage,
  artworkBounds,
  connect,
  decodeField,
  emptyField,
  encodeField,
  FieldCommands,
  FIELD_LIMITS,
  fromWorld,
  independentVariation,
  linkedCopy,
  removeNode,
  replaceImage,
  resizeArtwork,
  screenToField,
  topologicalOrder,
  toWorld,
  transformedBounds,
  validateField,
  zoomAt,
} from "./field.ts";
import type { FieldDocument } from "./field.ts";
import { operationInputs, operationKey } from "./evaluation.ts";
import { imageBounds } from "./image.ts";

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
  name: "Head.jpg",
};
const images = new Map([[hash, photo]]);
const ids = () => {
  let n = 0;
  return () => `test-${++n}`;
};
function base() {
  const d = emptyField("field-test");
  d.assets.push(structuredClone(asset));
  d.nodes.push({
    id: "source",
    name: "Photograph",
    kind: "image",
    assetId: hash,
    position: { x: 0, y: 0 },
  });
  return addAfterimage(d, "source", ids(), { x: asset.width, y: asset.height });
}
const op = (d: FieldDocument) =>
  d.nodes.find((n) => n.kind === "afterimage")! as Extract<
    FieldDocument["nodes"][number],
    { kind: "afterimage" }
  >;
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
async function raw(d: FieldDocument, instrument = 2, extra = false) {
  const data = strToU8(JSON.stringify(d));
  return zipSync(
    {
      "manifest.json": strToU8(
        JSON.stringify({
          format: "form",
          formatVersion: 3,
          document: {
            path: "document.json",
            byteLength: data.length,
            sha256: await sha256(data),
          },
          instruments: [{ id: "afterimage", version: instrument }],
        }),
      ),
      "document.json": data,
      [asset.path]: photo,
      ...(extra ? { "unexpected.json": strToU8("{}") } : {}),
    },
    { level: 0 },
  );
}

test("typed connections reject mismatches without editing the original", () => {
  const d = base().document,
    before = structuredClone(d);
  assert.throws(
    () => connect(d, { from: "source", to: op(d).id, input: "selection" }),
    /types/,
  );
  assert.deepEqual(d, before);
  assert.throws(
    () => connect(d, { from: "missing", to: op(d).id, input: "image" }),
    /types/,
  );
});
test("a processing cycle is rejected and each shared dependency is ordered once", () => {
  const d = base().document,
    first = op(d).id;
  const chained = addAfterimage(
    d,
    first,
    (() => {
      let i = 0;
      return () => `chain-${++i}`;
    })(),
    { x: 1000, y: 1000 },
  ).document;
  const second = chained.nodes.filter((n) => n.kind === "afterimage")[1].id;
  assert.throws(
    () => connect(chained, { from: second, to: first, input: "image" }),
    /cycle/,
  );
  const order = topologicalOrder(chained);
  assert.equal(new Set(order).size, chained.nodes.length);
  assert.ok(order.indexOf("source") < order.indexOf(first));
  assert.ok(order.indexOf(first) < order.indexOf(second));
});
test("linked copies share output identity but have independent composition transforms", () => {
  const { document: d, placementId } = base(),
    next = linkedCopy(d, placementId, "linked");
  assert.equal(next.nodes.length, d.nodes.length);
  assert.equal(next.placements[0].nodeId, next.placements[1].nodeId);
  next.placements[1].transform.rotation = 34;
  assert.equal(next.placements[0].transform.rotation, 0);
  assert.equal(d.placements.length, 1);
});
test("variation copies a whole upstream chain and retains one immutable photo asset", () => {
  const d = base().document;
  const chain = addAfterimage(
    d,
    op(d).id,
    (() => {
      let i = 0;
      return () => `chain-${++i}`;
    })(),
    { x: 1000, y: 1000 },
  );
  const variation = independentVariation(
    chain.document,
    chain.placementId,
    (() => {
      let i = 0;
      return () => `var-${++i}`;
    })(),
  ).document;
  const originals = new Set(chain.document.nodes.map((n) => n.id));
  const copies = variation.nodes.filter((n) => !originals.has(n.id));
  assert.equal(copies.length, chain.document.nodes.length);
  assert.equal(variation.assets.length, 1);
  assert.equal(copies.filter((n) => n.kind === "image").length, 1);
  assert.ok(
    variation.edges
      .filter((e) => !originals.has(e.to))
      .every((e) => !originals.has(e.from)),
  );
  const copy = copies.find((n) => n.kind === "afterimage")!;
  if (copy.kind === "afterimage") copy.params.seed = 89;
  assert.equal(
    op(chain.document).kind === "afterimage" &&
      op(chain.document).params.seed === 89,
    false,
  );
});
test("replacement keeps source coordinates or scales direct guides and frames explicitly", () => {
  const d = base().document,
    original = op(d);
  assert.equal(original.kind, "afterimage");
  if (original.kind !== "afterimage") return;
  original.frame = { x: -20, y: -30, width: 800, height: 1200 };
  const resized = {
    ...asset,
    id: "b".repeat(64),
    sha256: "b".repeat(64),
    path: `assets/${"b".repeat(64)}.jpg`,
    width: 782,
    height: 1246,
  };
  const keep = replaceImage(d, "source", resized, false, ids());
  const scaled = replaceImage(d, "source", resized, true, ids());
  const beforePath = d.nodes.find((n) => n.kind === "trajectory")!;
  assert.deepEqual(
    keep.nodes.find((n) => n.kind === "trajectory"),
    beforePath,
  );
  const scaledPath = scaled.nodes.find((n) => n.kind === "trajectory")!;
  if (beforePath.kind === "trajectory" && scaledPath.kind === "trajectory")
    assert.deepEqual(
      scaledPath.points,
      beforePath.points.map((p) => ({ x: p.x * 2, y: p.y * 2 })),
    );
  const after = op(scaled);
  if (after.kind === "afterimage")
    assert.deepEqual(after.frame, {
      x: -40,
      y: -60,
      width: 1600,
      height: 2400,
    });
  assert.deepEqual(
    scaled.nodes.find((n) => n.kind === "selection"),
    d.nodes.find((n) => n.kind === "selection"),
  );
  assert.deepEqual(scaled.capture, d.capture);
  assert.deepEqual(scaled.placements, d.placements);
});
test("replacing one source isolates a trajectory shared with an unrelated source", () => {
  const d = base().document;
  d.nodes.push({
    id: "other-source",
    name: "Other source",
    kind: "image",
    assetId: hash,
    position: { x: 20, y: 20 },
  });
  const added = addAfterimage(
    d,
    "other-source",
    (() => {
      let i = 0;
      return () => `other-${++i}`;
    })(),
    { x: 391, y: 623 },
  );
  const firstPath = d.nodes.find((n) => n.kind === "trajectory")!;
  const otherOp = added.document.placements.at(-1)!.nodeId;
  const shared = connect(added.document, {
    from: firstPath.id,
    to: otherOp,
    input: "trajectory",
  });
  const replacement = {
    ...asset,
    id: "b".repeat(64),
    sha256: "b".repeat(64),
    path: `assets/${"b".repeat(64)}.jpg`,
    width: 782,
    height: 1246,
  };
  const next = replaceImage(
    shared,
    "source",
    replacement,
    true,
    () => "private-path",
  );
  assert.equal(
    next.edges.find((e) => e.to === otherOp && e.input === "trajectory")!.from,
    firstPath.id,
  );
  assert.deepEqual(
    next.nodes.find((n) => n.id === firstPath.id),
    firstPath,
  );
  assert.equal(
    next.edges.find((e) => e.to === op(d).id && e.input === "trajectory")!.from,
    "private-path",
  );
});
test("transforms invert rotation, translation and reflected anisotropic scale", () => {
  const t = { x: -445, y: 351, scaleX: -1.8, scaleY: 0.23, rotation: 137 },
    p = { x: 412, y: -75 };
  const q = fromWorld(toWorld(p, t), t);
  near(q.x, p.x);
  near(q.y, p.y);
  const b = transformedBounds(
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 20, y: 30, scaleX: 2, scaleY: 3, rotation: 90 },
  );
  near(b.x, -130);
  near(b.y, 30);
  near(b.width, 150);
  near(b.height, 200);
});
test("zoom preserves the point under the cursor at both scale bounds", () => {
  const c = { x: -324, y: 991, scale: 0.6 },
    p = { x: 151, y: 712 },
    original = screenToField(p, c);
  for (const zoom of [0.001, 100]) {
    const next = zoomAt(c, p, zoom),
      after = screenToField(p, next);
    near(after.x, original.x);
    near(after.y, original.y);
    assert.ok(next.scale >= 0.05 && next.scale <= 4);
  }
});
test("gesture cancellation restores authored state and an existing redo branch", () => {
  const d = base().document,
    commands = new FieldCommands(d);
  commands.execute("Rename", (x) => {
    x.name = "Renamed";
  });
  commands.undo();
  commands.begin("Move");
  for (let i = 1; i <= 8; i++)
    commands.execute("Move", (x) => {
      x.placements[0].transform.x += i;
    });
  commands.cancel();
  assert.deepEqual(commands.state, d);
  assert.equal(commands.status.redo, "Rename");
  commands.redo();
  assert.equal(commands.state.name, "Renamed");
});
test("a long committed gesture is one exact undo and invalid edits are atomic", () => {
  const d = base().document,
    commands = new FieldCommands(d);
  commands.begin("Rotate");
  for (let i = 0; i < 20; i++)
    commands.execute("Rotate", (x) => {
      x.placements[0].transform.rotation = i;
    });
  commands.commit();
  const after = commands.state;
  commands.undo();
  assert.deepEqual(commands.state, d);
  commands.redo();
  assert.deepEqual(commands.state, after);
  assert.throws(
    () =>
      commands.execute("Invalid", (x) => {
        x.capture.width = 0;
      }),
    /capture/,
  );
  assert.deepEqual(commands.state, after);
});
test("deletion disconnects dependent inputs and undo restores shared references", () => {
  const d = base().document,
    commands = new FieldCommands(d);
  commands.execute("Delete source", (x) => removeNode(x, "source"));
  assert.equal(
    commands.state.edges.some((e) => e.input === "image"),
    false,
  );
  commands.undo();
  assert.deepEqual(commands.state, d);
});
test("FIELD roundtrip retains graph, coverage, colour, camera and capture with deduplicated assets", async () => {
  const original = base(),
    d = linkedCopy(original.document, original.placementId, "copy");
  const mask = d.nodes.find((n) => n.kind === "selection")!;
  if (mask.kind === "selection")
    mask.coverage = {
      kind: "closed",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.8, y: 0.2 },
        { x: 0.4, y: 0.9 },
      ],
    };
  d.capture = { x: -245, y: 10, width: 1200, height: 640 };
  d.presentation = { camera: { x: 20, y: -110, scale: 2 }, proof: "dark" };
  const bytes = await encodeField(d, images),
    loaded = await decodeField(bytes);
  assert.deepEqual(loaded.document, d);
  assert.deepEqual(loaded.assets.get(hash), photo);
  assert.equal(loaded.migrated, false);
  assert.equal(
    readProjectEntries(
      bytes,
      FIELD_LIMITS.packageBytes,
      18,
      FIELD_LIMITS.metadataBytes,
      2,
    ).size,
    3,
  );
});
test("an empty FIELD is a valid two-entry portable package", async () => {
  const d = emptyField("empty");
  assert.deepEqual(
    (await decodeField(await encodeField(d, new Map()))).document,
    d,
  );
});
test("legacy versions migrate fixed output framing and active capture membership", async () => {
  const state: StudyState = {
    name: "Legacy",
    params: defaults(391, 623),
    positions: {
      source: { x: 0, y: 0 },
      operation: { x: 0, y: 0 },
      result: { x: 0, y: 0 },
    },
    capture: { x: -100, y: -200, width: 1000, height: 1000 },
    connected: true,
    presentation: {
      camera: { x: 0, y: 0, scale: 1 },
      mode: "path",
      proof: "paper",
    },
  };
  const old = createDocument("legacy", state, asset);
  const v1 = await decodeField(await encodeProject(old, photo));
  assert.equal(v1.migrated, true);
  assert.deepEqual(
    op(v1.document).kind === "afterimage" && op(v1.document).frame,
    state.capture,
  );
  const v2 = await decodeField(
    await encodeWorkspace(
      {
        format: "form",
        formatVersion: 2,
        projectId: "legacy",
        name: "Legacy set",
        activeStudyId: "b",
        studies: [
          { id: "a", document: old },
          { id: "b", document: { ...structuredClone(old), name: "Other" } },
        ],
      },
      images,
    ),
  );
  assert.equal(v2.document.placements.filter((p) => p.included).length, 1);
  assert.equal(v2.document.assets.length, 1);
});
test("unsupported requirements, unexpected entries and corrupted bytes are rejected", async () => {
  const d = base().document;
  await assert.rejects(decodeField(await raw(d, 99)), /instrument/);
  await assert.rejects(decodeField(await raw(d, 2, true)), /entry/);
  const bytes = await encodeField(d, images);
  bytes[60] ^= 1;
  await assert.rejects(decodeField(bytes));
  await assert.rejects(
    encodeField(d, new Map([[hash, photo.slice(1)]])),
    /integrity/,
  );
});
test("decoded image and object budgets fail before allocating rendering resources", () => {
  const d = base().document;
  for (let i = 0; i < 3; i++)
    d.assets.push({
      ...asset,
      id: String(i).repeat(64),
      sha256: String(i).repeat(64),
      path: `assets/${String(i).repeat(64)}.jpg`,
      width: 4000,
      height: 4000,
    });
  assert.throws(() => validateField(d), /decode budget/);
  const tooMany = emptyField("limit");
  tooMany.nodes = Array.from({ length: 49 }, (_, i) => ({
    id: String(i),
    kind: "trajectory",
    name: "Guide",
    position: { x: 0, y: 0 },
    points: defaults(100, 100).path,
  }));
  assert.throws(() => validateField(tooMany), /object limits/);
});
test("operation cache identity ignores layout, camera, capture and linked placements", async () => {
  const b = base(),
    d = b.document,
    region = { x: -100, y: -100, width: 1000, height: 1000 };
  const before = await operationKey(d, op(d).id, hash, region, "preview");
  const moved = linkedCopy(d, b.placementId, "linked");
  moved.nodes.forEach((n) => {
    n.position.x += 400;
    n.name = "Renamed";
  });
  moved.placements[0].transform.rotation = 40;
  moved.capture.x = -400;
  moved.presentation.camera = { x: -800, y: 920, scale: 3 };
  assert.equal(
    await operationKey(moved, op(d).id, hash, region, "preview"),
    before,
  );
  assert.notEqual(
    await operationKey(moved, op(d).id, hash, region, "export"),
    before,
  );
});
test("guide edits invalidate only connected operation identities", async () => {
  const d = base().document,
    varied = independentVariation(
      d,
      d.placements[0].id,
      (() => {
        let i = 0;
        return () => `var-${++i}`;
      })(),
    ).document;
  const originalId = op(d).id,
    variedId = varied.placements[1].nodeId,
    region = { x: 0, y: 0, width: 1000, height: 1000 };
  const before = await operationKey(
      varied,
      originalId,
      hash,
      region,
      "preview",
    ),
    other = await operationKey(varied, variedId, hash, region, "preview");
  const path = varied.nodes.find(
    (n) =>
      n.id ===
      varied.edges.find((e) => e.to === originalId && e.input === "trajectory")!
        .from,
  )!;
  if (path.kind === "trajectory") path.points[1].y += 200;
  assert.notEqual(
    await operationKey(varied, originalId, hash, region, "preview"),
    before,
  );
  assert.equal(
    await operationKey(varied, variedId, hash, region, "preview"),
    other,
  );
  assert.notEqual(
    await operationKey(varied, variedId, "changed-source", region, "preview"),
    other,
  );
});
test("connected guide parameters are detached and disconnected trajectory uses saved fallback", () => {
  const d = base().document,
    nodeId = op(d).id,
    path = d.nodes.find((n) => n.kind === "trajectory")!;
  if (path.kind !== "trajectory") return;
  path.points[0].x += 200;
  const resolved = operationInputs(d, nodeId);
  assert.deepEqual(resolved.params.path, path.points);
  resolved.params.path[0].x += 500;
  assert.notEqual(resolved.params.path[0].x, path.points[0].x);
  d.edges = d.edges.filter((e) => e.input !== "trajectory");
  assert.deepEqual(operationInputs(d, nodeId).params.path, op(d).params.path);
});
test("encoded JPEG and PNG dimensions are bounded before browser decoding", () => {
  assert.deepEqual(imageBounds(photo), { width: 391, height: 623 });
  const png = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  assert.deepEqual(imageBounds(png), { width: 1, height: 1 });
  new DataView(png.buffer).setUint32(16, 20000);
  assert.throws(() => imageBounds(png), /4096/);
  assert.throws(() => imageBounds(photo.subarray(0, 10)), /JPEG|4096/);
});
test("proportional resize preserves existing aspect and reflection under rotated pointer coordinates and bounds", () => {
  const original = { x: 280, y: -110, scaleX: -2, scaleY: 0.5, rotation: 67 };
  const pointer = toWorld({ x: 620, y: 430 }, original);
  const resized = resizeArtwork(original, pointer, 391, 623, true);
  near(resized.scaleX / resized.scaleY, original.scaleX / original.scaleY);
  assert.ok(resized.scaleX < 0 && resized.scaleY > 0);
  assert.equal(resized.rotation, original.rotation);
  for (const local of [
    { x: 1e8, y: 1e8 },
    { x: -1e8, y: -1e8 },
  ]) {
    const result = resizeArtwork(
      original,
      toWorld(local, original),
      391,
      623,
      true,
    );
    near(result.scaleX / result.scaleY, original.scaleX / original.scaleY);
    assert.ok(Math.abs(result.scaleX) <= 8 && Math.abs(result.scaleY) <= 8);
    assert.ok(
      Math.abs(result.scaleX) >= 0.05 && Math.abs(result.scaleY) >= 0.05,
    );
  }
  const free = resizeArtwork(original, pointer, 391, 623, false);
  assert.notEqual(free.scaleX / free.scaleY, original.scaleX / original.scaleY);
});
test("automatic export bounds contain transformed included artwork and exclude hidden/reference placements", () => {
  const b = base(),
    d = b.document;
  d.placements[0].transform = {
    x: 20,
    y: 30,
    scaleX: 2,
    scaleY: 3,
    rotation: 90,
  };
  const reference = structuredClone(d.placements[0]);
  reference.id = "reference";
  reference.transform.x = -10000;
  reference.included = false;
  const hidden = structuredClone(d.placements[0]);
  hidden.id = "hidden";
  hidden.transform.x = 10000;
  hidden.visible = false;
  d.placements.push(reference, hidden);
  const outputs = new Map([
    [d.placements[0].nodeId, { width: 100, height: 50 }],
  ]);
  const bounds = artworkBounds(d.placements, outputs);
  near(bounds.x, -130);
  near(bounds.y, 30);
  near(bounds.width, 150);
  near(bounds.height, 200);
  d.capture = { x: -10000, y: -10000, width: 1, height: 1 };
  assert.deepEqual(artworkBounds(d.placements, outputs), bounds);
  assert.throws(() => artworkBounds(d.placements, new Map()), /Render/);
  d.placements[0].included = false;
  assert.throws(() => artworkBounds(d.placements, outputs), /Include/);
});
