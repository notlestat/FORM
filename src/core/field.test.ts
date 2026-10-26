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
  isExportedArtwork,
  placementOpacity,
  reorderArtwork,
  removeNode,
  replaceImage,
  resizeArtwork,
  rotateArtwork,
  rotationStep,
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
import { composeArtwork } from "./composition.ts";
import {
  alignArtwork,
  artworkRect,
  artworkSelection,
  captureArtworkSelection,
  distributeArtwork,
  removeArtwork,
  selectionBounds,
  translateArtwork,
} from "./arrangement.ts";

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
          formatVersion: d.formatVersion,
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
test("operation cache identity ignores layout, camera, capture, layer order, opacity and linked placements", async () => {
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
  moved.placements[0].opacity = 0.2;
  moved.placements.reverse();
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
test("artwork rotation fixes its world centre through full turns with anisotropic and reflected scale", () => {
  for (const scaleX of [1.7, -1.7]) {
    const t = { x: 480, y: -91, scaleX, scaleY: 0.4, rotation: 37 };
    const localCenter = { x: 391 / 2, y: 623 / 2 },
      center = toWorld(localCenter, t);
    for (const angle of [90, 180, 360, 540, -1080]) {
      const rotated = rotateArtwork(t, 391, 623, angle),
        after = toWorld(localCenter, rotated);
      near(after.x, center.x);
      near(after.y, center.y);
      assert.equal(rotated.rotation, angle);
      assert.equal(rotated.scaleX, t.scaleX);
      assert.equal(rotated.scaleY, t.scaleY);
      const restored = rotateArtwork(rotated, 391, 623, t.rotation);
      near(restored.x, t.x);
      near(restored.y, t.y);
    }
  }
});
test("rotation crosses the angle wrap continuously in both directions and supports multiple complete turns", () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  near(rotationStep(rad(179), rad(-179)), 2);
  near(rotationStep(rad(-179), rad(179)), -2);
  for (const direction of [1, -1]) {
    let last = 0,
      total = 0;
    for (let degrees = 10; degrees <= 1080; degrees += 10) {
      const raw = rad(degrees * direction),
        angle = Math.atan2(Math.sin(raw), Math.cos(raw));
      total += rotationStep(last, angle);
      last = angle;
    }
    near(total, 1080 * direction);
  }
});

test("layer moves retain graph and placement settings, with exact undo and boundary no-op", () => {
  const b = base();
  let d = linkedCopy(b.document, b.placementId, "middle");
  d = linkedCopy(d, b.placementId, "front");
  d.placements[1].opacity = 0.35;
  const original = structuredClone(d);
  for (const [order, expected] of [
    ["front", [b.placementId, "front", "middle"]],
    ["back", ["middle", b.placementId, "front"]],
    ["forward", [b.placementId, "front", "middle"]],
    ["backward", ["middle", b.placementId, "front"]],
  ] as const) {
    const next = reorderArtwork(d, "middle", order);
    assert.deepEqual(
      next.placements.map((p) => p.id),
      expected,
    );
    assert.deepEqual(next.nodes, d.nodes);
    assert.deepEqual(next.edges, d.edges);
    assert.deepEqual(
      next.placements.find((p) => p.id === "middle"),
      d.placements[1],
    );
  }
  assert.deepEqual(d, original);
  assert.throws(() => reorderArtwork(d, "missing", "front"), /Select artwork/);
  const commands = new FieldCommands(d);
  commands.execute("Raise", (state) =>
    reorderArtwork(state, "middle", "front"),
  );
  const raised = structuredClone(commands.state);
  commands.undo();
  assert.deepEqual(commands.state, original);
  commands.execute("Boundary", (state) =>
    reorderArtwork(state, "front", "front"),
  );
  commands.redo();
  assert.deepEqual(commands.state, raised);
});
test("opacity is placement-local, portable, backwards compatible, and validated", async () => {
  const b = base();
  assert.equal(placementOpacity(b.document.placements[0]), 1);
  const legacy = await decodeField(await encodeField(b.document, images));
  assert.equal(placementOpacity(legacy.document.placements[0]), 1);
  b.document.placements[0].opacity = 0.27;
  const d = linkedCopy(b.document, b.placementId, "copy");
  assert.equal(d.placements[1].opacity, 0.27);
  d.placements[1].opacity = 0.8;
  const reordered = reorderArtwork(d, b.placementId, "front");
  const opened = await decodeField(await encodeField(reordered, images));
  assert.deepEqual(opened.document, reordered);
  assert.equal(reordered.placements[1].opacity, 0.27);
  for (const value of [-0.1, 1.1, NaN, Infinity, null, "0.5"]) {
    const bad = structuredClone(d);
    (bad.placements[0] as any).opacity = value;
    assert.throws(() => validateField(bad), /Invalid artwork/);
  }
});
test("fully transparent artwork contributes neither bounds nor required export output", () => {
  const b = base(),
    d = linkedCopy(b.document, b.placementId, "transparent");
  d.placements[1].transform.x = -90000;
  d.placements[1].nodeId = "source";
  d.placements[1].opacity = 0;
  assert.equal(isExportedArtwork(d.placements[1]), false);
  const outputs = new Map([
    [b.document.placements[0].nodeId, { width: 100, height: 50 }],
  ]);
  assert.deepEqual(
    artworkBounds(d.placements, outputs),
    artworkBounds(b.document.placements, outputs),
  );
  d.placements[0].opacity = 0;
  assert.throws(() => artworkBounds(d.placements, new Map()), /Include/);
});
test("composition submits back-to-front source-over draws with independent opacity and restores state", () => {
  const b = base(),
    d = linkedCopy(b.document, b.placementId, "front");
  d.placements[0].opacity = 0.25;
  d.placements[1].opacity = 0.75;
  d.placements[1].transform = {
    x: 12,
    y: 9,
    rotation: 90,
    scaleX: -2,
    scaleY: 0.5,
  };
  const log: unknown[] = [],
    stack: [number, string][] = [];
  const context = {
    globalAlpha: 0.6,
    globalCompositeOperation: "multiply",
    save() {
      stack.push([this.globalAlpha, this.globalCompositeOperation]);
    },
    restore() {
      [this.globalAlpha, this.globalCompositeOperation] = stack.pop()!;
    },
    translate(x: number, y: number) {
      log.push(["translate", x, y]);
    },
    rotate(angle: number) {
      log.push(["rotate", angle]);
    },
    scale(x: number, y: number) {
      log.push(["scale", x, y]);
    },
    drawImage(...args: unknown[]) {
      log.push([
        "draw",
        this.globalAlpha,
        this.globalCompositeOperation,
        ...args,
      ]);
    },
  };
  const image = {};
  const outputs = new Map([
    [d.placements[0].nodeId, { image, width: 100, height: 50 }],
  ]);
  composeArtwork(context as any, d.placements, outputs as any);
  assert.deepEqual(
    log.filter((v: any) => v[0] === "draw"),
    [
      ["draw", 0.25, "source-over", image, 0, 0, 100, 50],
      ["draw", 0.75, "source-over", image, 0, 0, 100, 50],
    ],
  );
  assert.deepEqual(log.slice(4, 7), [
    ["translate", 12, 9],
    ["rotate", Math.PI / 2],
    ["scale", -2, 0.5],
  ]);
  assert.equal(context.globalAlpha, 0.6);
  assert.equal(context.globalCompositeOperation, "multiply");
  log.length = 0;
  const reordered = reorderArtwork(d, "front", "back");
  composeArtwork(context as any, reordered.placements, outputs as any);
  assert.deepEqual(
    log.filter((v: any) => v[0] === "draw").map((v: any) => v[1]),
    [0.75, 0.25],
  );
  log.length = 0;
  d.placements[0].opacity = 0;
  d.placements[1].included = false;
  composeArtwork(context as any, d.placements, new Map());
  assert.equal(log.length, 0);
  d.placements[1].included = true;
  assert.throws(
    () => composeArtwork(context as any, d.placements, new Map()),
    /unavailable/,
  );
  context.drawImage = () => {
    throw Error("device failure");
  };
  assert.throws(
    () => composeArtwork(context as any, d.placements, outputs as any),
    /device failure/,
  );
  assert.equal(context.globalAlpha, 0.6);
  assert.equal(stack.length, 0);
});

test("Shift selection toggles artwork exactly once and plain dragging preserves a selected set", () => {
  assert.deepEqual(artworkSelection([], "a", false), ["a"]);
  assert.deepEqual(artworkSelection(["a", "a"], "b", true), ["a", "b"]);
  assert.deepEqual(artworkSelection(["a"], "b", true), ["a", "b"]);
  assert.deepEqual(artworkSelection(["a", "b"], "a", true), ["b"]);
  assert.deepEqual(artworkSelection(["a"], "a", true), []);
  assert.deepEqual(artworkSelection(["a", "b"], "a", false, true), ["a", "b"]);
  assert.deepEqual(artworkSelection(["a", "b"], "a", false), ["a"]);
  assert.deepEqual(artworkSelection(["a", "b"], "c", false, true), ["c"]);
});
function arrangementFixture() {
  const b = base();
  let d = linkedCopy(b.document, b.placementId, "arrange-b");
  d = linkedCopy(d, b.placementId, "arrange-c");
  d.placements[0].transform = {
    x: 80,
    y: -70,
    scaleX: 1.5,
    scaleY: 0.8,
    rotation: 31,
  };
  d.placements[1].transform = {
    x: -90,
    y: 220,
    scaleX: -0.7,
    scaleY: 1.2,
    rotation: -65,
  };
  d.placements[2].transform = {
    x: 410,
    y: 470,
    scaleX: 0.6,
    scaleY: -1.4,
    rotation: 170,
  };
  d.placements[1].opacity = 0.4;
  return {
    d,
    ids: d.placements.map((p) => p.id),
    sizes: new Map([[d.placements[0].nodeId, { width: 391, height: 623 }]]),
  };
}
test("all six alignments use transformed selection bounds while retaining rotation, reflection and graph", () => {
  const { d, ids, sizes } = arrangementFixture();
  const original = structuredClone(d),
    box = selectionBounds(d, ids, sizes);
  for (const alignment of [
    "left",
    "center-x",
    "right",
    "top",
    "center-y",
    "bottom",
  ] as const) {
    const result = alignArtwork(d, ids, sizes, alignment);
    for (let i = 0; i < result.placements.length; i++) {
      const p = result.placements[i],
        r = artworkRect(p, sizes),
        t = d.placements[i].transform;
      if (alignment === "left") near(r.x, box.x);
      if (alignment === "right") near(r.x + r.width, box.x + box.width);
      if (alignment === "center-x")
        near(r.x + r.width / 2, box.x + box.width / 2);
      if (alignment === "top") near(r.y, box.y);
      if (alignment === "bottom") near(r.y + r.height, box.y + box.height);
      if (alignment === "center-y")
        near(r.y + r.height / 2, box.y + box.height / 2);
      near(p.transform.rotation, t.rotation);
      near(p.transform.scaleX, t.scaleX);
      near(p.transform.scaleY, t.scaleY);
      if (["left", "center-x", "right"].includes(alignment))
        near(p.transform.y, t.y);
      else near(p.transform.x, t.x);
      assert.equal(p.opacity, d.placements[i].opacity);
    }
    assert.deepEqual(result.nodes, d.nodes);
    assert.deepEqual(result.edges, d.edges);
    assert.deepEqual(result.assets, d.assets);
    assert.deepEqual(
      result.placements.map((p) => p.id),
      ids,
    );
  }
  assert.deepEqual(d, original);
});
test("alignment changes only selected placements and rejects missing geometry without mutation", () => {
  const { d, ids, sizes } = arrangementFixture(),
    original = structuredClone(d);
  const aligned = alignArtwork(d, ids.slice(0, 2), sizes, "left");
  assert.deepEqual(aligned.placements[2], d.placements[2]);
  assert.throws(() => alignArtwork(d, [ids[0]], sizes, "left"), /at least two/);
  assert.throws(
    () => alignArtwork(d, [ids[0], "missing"], sizes, "left"),
    /existing artwork/,
  );
  assert.throws(() => alignArtwork(d, ids, new Map(), "left"), /Render all/);
  for (const width of [0, -1, NaN, Infinity]) {
    assert.throws(
      () =>
        alignArtwork(
          d,
          ids,
          new Map([[d.placements[0].nodeId, { width, height: 100 }]]),
          "left",
        ),
      /Render all/,
    );
  }
  assert.deepEqual(d, original);
});
test("group translation preserves relative spacing and leaves other artwork intact", () => {
  const { d, ids } = arrangementFixture(),
    original = structuredClone(d),
    delta = { x: 123.5, y: -97.25 };
  const next = translateArtwork(d, [ids[0], ids[1], ids[0]], delta);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(next.placements[i], {
      ...d.placements[i],
      transform: {
        ...d.placements[i].transform,
        x: d.placements[i].transform.x + delta.x,
        y: d.placements[i].transform.y + delta.y,
      },
    });
  }
  assert.deepEqual(next.placements[2], d.placements[2]);
  assert.deepEqual(d, original);
  assert.throws(
    () => translateArtwork(d, ids, { x: NaN, y: 1 }),
    /Invalid artwork/,
  );
  assert.throws(
    () => translateArtwork(d, ["missing"], delta),
    /existing artwork/,
  );
});
test("group gestures commit one history entry and cancellation preserves the previous redo branch", () => {
  const { d, ids } = arrangementFixture(),
    commands = new FieldCommands(d);
  commands.begin("Group move");
  for (const x of [10, 20, 60])
    commands.execute("Move", () => translateArtwork(d, ids, { x, y: 30 }));
  commands.commit();
  const moved = commands.state;
  commands.undo();
  assert.deepEqual(commands.state, d);
  assert.equal(commands.status.undo, null);
  commands.begin("Cancelled move");
  commands.execute("Move", () => translateArtwork(d, ids, { x: 500, y: 400 }));
  commands.cancel();
  assert.deepEqual(commands.state, d);
  commands.redo();
  assert.deepEqual(commands.state, moved);
});
test("group deletion is atomic and undo restores every placement without changing shared processes", () => {
  const { d, ids } = arrangementFixture(),
    commands = new FieldCommands(d);
  commands.execute("Remove selection", (state) =>
    removeArtwork(state, ids.slice(0, 2)),
  );
  assert.deepEqual(commands.state.placements, [d.placements[2]]);
  assert.deepEqual(commands.state.nodes, d.nodes);
  assert.deepEqual(commands.state.edges, d.edges);
  commands.undo();
  assert.deepEqual(commands.state, d);
  assert.throws(() => removeArtwork(d, ["missing"]), /existing artwork/);
});
test("aligned group transforms roundtrip without new file state and keep operation cache identity", async () => {
  const { d, ids, sizes } = arrangementFixture();
  const aligned = alignArtwork(d, ids, sizes, "center-x");
  const moved = translateArtwork(aligned, ids, { x: 42, y: 83 });
  const opened = await decodeField(await encodeField(moved, images));
  assert.deepEqual(opened.document, moved);
  const region = { x: 0, y: 0, width: 1000, height: 1000 };
  assert.equal(
    await operationKey(moved, op(d).id, hash, region, "preview"),
    await operationKey(d, op(d).id, hash, region, "preview"),
  );
});

test("Shift selection captures image and overlay pointer input before drawing or drag handlers", () => {
  let ids = ["original"],
    prevented = 0,
    stopped = 0,
    selected = 0;
  const event = {
    shiftKey: true,
    button: 0,
    isPrimary: true,
    preventDefault() {
      prevented++;
    },
    stopPropagation() {
      stopped++;
    },
  };
  assert.equal(
    captureArtworkSelection(event, false, () => {
      selected++;
      ids = artworkSelection(ids, "next", true);
    }),
    true,
  );
  assert.deepEqual(ids, ["original", "next"]);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(selected, 1);
  captureArtworkSelection(event, false, () => {
    ids = artworkSelection(ids, "next", true);
  });
  assert.deepEqual(ids, ["original"]);
});
test("Shift capture leaves size/rotation handles, panning and ordinary pointers to their existing handlers", () => {
  const base = {
    shiftKey: true,
    button: 0,
    isPrimary: true,
    preventDefault() {
      throw Error("Unexpected capture");
    },
    stopPropagation() {
      throw Error("Unexpected capture");
    },
  };
  const unexpected = () => {
    throw Error("Unexpected selection");
  };
  assert.equal(captureArtworkSelection(base, true, unexpected), false);
  for (const change of [
    { button: 1 },
    { button: 2 },
    { shiftKey: false },
    { isPrimary: false },
  ])
    assert.equal(
      captureArtworkSelection({ ...base, ...change }, false, unexpected),
      false,
    );
});

function distributionFixture() {
  let { d } = arrangementFixture();
  d = linkedCopy(d, d.placements[0].id, "spacing-fourth");
  for (let i = 0; i < d.placements.length; i++) {
    d.placements[i].transform.x = [-2500, 130, 550, 6500][i];
    d.placements[i].transform.y = [-3500, -110, 680, 8500][i];
  }
  return {
    d,
    ids: d.placements.map((p) => p.id),
    sizes: new Map([[d.placements[0].nodeId, { width: 391, height: 623 }]]),
  };
}
function orderedRects(
  d: FieldDocument,
  sizes: Map<string, { width: number; height: number }>,
  axis: "x" | "y",
) {
  return d.placements
    .map((p) => ({ p, r: artworkRect(p, sizes) }))
    .sort(
      (a, b) =>
        a.r[axis] +
        (axis === "x" ? a.r.width : a.r.height) / 2 -
        (b.r[axis] + (axis === "x" ? b.r.width : b.r.height) / 2),
    );
}
test("equal gaps preserve endpoint placements and size-aware spacing on both axes with rotated/reflected artwork", () => {
  const { d, ids, sizes } = distributionFixture(),
    original = structuredClone(d);
  for (const axis of ["x", "y"] as const) {
    const before = orderedRects(d, sizes, axis),
      result = distributeArtwork(d, ids, sizes, axis, "gaps"),
      after = orderedRects(result, sizes, axis);
    assert.deepEqual(after[0].p, before[0].p);
    assert.deepEqual(after.at(-1)!.p, before.at(-1)!.p);
    const gaps = after
      .slice(1)
      .map(
        (item, i) =>
          item.r[axis] -
          after[i].r[axis] -
          (axis === "x" ? after[i].r.width : after[i].r.height),
      );
    assert.ok(gaps[0] > 0);
    gaps.forEach((gap) => near(gap, gaps[0]));
    for (const p of result.placements) {
      const old = d.placements.find((q) => q.id === p.id)!;
      assert.equal(
        p.transform[axis === "x" ? "y" : "x"],
        old.transform[axis === "x" ? "y" : "x"],
      );
      assert.deepEqual(
        { ...p.transform, [axis]: old.transform[axis] },
        old.transform,
      );
      assert.equal(p.opacity, old.opacity);
    }
    assert.deepEqual(result.nodes, d.nodes);
    assert.deepEqual(result.edges, d.edges);
    assert.deepEqual(
      result.placements.map((p) => p.id),
      ids,
    );
    assert.deepEqual(
      distributeArtwork(result, ids, sizes, axis, "gaps"),
      result,
    );
  }
  assert.deepEqual(d, original);
});
test("equal centres preserve endpoints and are independent of selection order on both axes", () => {
  const { d, ids, sizes } = distributionFixture();
  for (const axis of ["x", "y"] as const) {
    const before = orderedRects(d, sizes, axis),
      result = distributeArtwork(d, [...ids].reverse(), sizes, axis, "centres"),
      after = orderedRects(result, sizes, axis);
    const centres = after.map(
      (item) =>
        item.r[axis] + (axis === "x" ? item.r.width : item.r.height) / 2,
    );
    for (let i = 2; i < centres.length; i++)
      near(centres[i] - centres[i - 1], centres[1] - centres[0]);
    assert.deepEqual(after[0].p, before[0].p);
    assert.deepEqual(after.at(-1)!.p, before.at(-1)!.p);
    assert.deepEqual(distributeArtwork(d, ids, sizes, axis, "centres"), result);
    assert.deepEqual(
      distributeArtwork(result, ids, sizes, axis, "centres"),
      result,
    );
  }
});
test("equal gaps reject insufficient space atomically while equal centres permit overlapping artwork", () => {
  const b = base();
  let d = linkedCopy(b.document, b.placementId, "overlap-b");
  d = linkedCopy(d, b.placementId, "overlap-c");
  d.placements.forEach((p, i) => {
    p.transform.x = [0, 5, 20][i];
    p.transform.y = 0;
  });
  const ids = d.placements.map((p) => p.id),
    sizes = new Map([[d.placements[0].nodeId, { width: 100, height: 100 }]]),
    original = structuredClone(d);
  assert.throws(
    () => distributeArtwork(d, ids, sizes, "x", "gaps"),
    /Not enough room/,
  );
  assert.deepEqual(d, original);
  const next = distributeArtwork(d, ids, sizes, "x", "centres");
  near(next.placements[1].transform.x, 10);
  const commands = new FieldCommands(next);
  commands.undo();
  commands.execute("No-op spacing", (state) =>
    distributeArtwork(state, ids, sizes, "x", "centres"),
  );
  assert.equal(commands.status.undo, null);
});
test("distribution rejects too few, missing or unrendered artworks and leaves unselected placement intact", () => {
  const { d, ids, sizes } = distributionFixture();
  assert.throws(
    () => distributeArtwork(d, ids.slice(0, 2), sizes, "x", "gaps"),
    /at least three/,
  );
  assert.throws(
    () => distributeArtwork(d, [ids[0], ids[1], "missing"], sizes, "x", "gaps"),
    /existing artwork/,
  );
  assert.throws(
    () => distributeArtwork(d, ids, new Map(), "x", "centres"),
    /Render all/,
  );
  const result = distributeArtwork(
    d,
    [ids[0], ids[1], ids[3]],
    sizes,
    "x",
    "gaps",
  );
  assert.deepEqual(result.placements[2], d.placements[2]);
});
test("distribution undo and redo restore all translations in one command", () => {
  const { d, ids, sizes } = distributionFixture(),
    commands = new FieldCommands(d);
  commands.execute("Distribute", (state) =>
    distributeArtwork(state, ids, sizes, "y", "gaps"),
  );
  const spaced = commands.state;
  commands.undo();
  assert.deepEqual(commands.state, d);
  assert.equal(commands.status.undo, null);
  commands.redo();
  assert.deepEqual(commands.state, spaced);
});
test("distributed artwork persists in the current format and retains export extent without changing the instrument", async () => {
  const { d, ids, sizes } = distributionFixture(),
    spaced = distributeArtwork(d, ids, sizes, "x", "centres");
  assert.deepEqual(
    (await decodeField(await encodeField(spaced, images))).document,
    spaced,
  );
  const region = { x: 0, y: 0, width: 1000, height: 1000 };
  assert.equal(
    await operationKey(d, op(d).id, hash, region, "preview"),
    await operationKey(spaced, op(d).id, hash, region, "preview"),
  );
  const includedBefore = artworkBounds(d.placements, sizes),
    includedAfter = artworkBounds(spaced.placements, sizes);
  near(includedBefore.x, includedAfter.x);
  near(includedBefore.width, includedAfter.width);
});
