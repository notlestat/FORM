// Run: node --experimental-strip-types experiments/field/fixture.ts
import { readFileSync, writeFileSync } from "node:fs";
import { sha256 } from "../../src/core/project.ts";
import {
  addAfterimage,
  decodeField,
  emptyField,
  encodeField,
  independentVariation,
  linkedCopy,
} from "../../src/core/field.ts";
import assert from "node:assert/strict";

const bytes = new Uint8Array(
  readFileSync(
    new URL("../../public/fixtures/marble-head.jpg", import.meta.url),
  ),
);
const hash = await sha256(bytes);
const d = emptyField("public-field-fixture");
d.name = "FIELD / linked and varied";
d.assets.push({
  id: hash,
  sha256: hash,
  path: `assets/${hash}.jpg`,
  byteLength: bytes.length,
  width: 391,
  height: 623,
  mime: "image/jpeg",
  name: "Marble head / The Met",
});
d.nodes.push({
  id: "source",
  name: "Photograph",
  kind: "image",
  assetId: hash,
  position: { x: 60, y: 80 },
});
d.placements.push({
  id: "reference",
  nodeId: "source",
  name: "Source reference",
  transform: { x: 60, y: 80, scaleX: 0.6, scaleY: 0.6, rotation: 0 },
  visible: true,
  included: false,
});
let i = 0;
const id = () => `fixture-${++i}`;
const created = addAfterimage(d, "source", id, { x: 391, y: 623 });
const linked = linkedCopy(created.document, created.placementId, id());
const varied = independentVariation(linked, created.placementId, id);
const output = varied.document.nodes.find(
  (n) =>
    n.id ===
    varied.document.placements.find((p) => p.id === varied.placementId)!.nodeId,
)!;
if (output.kind === "afterimage") {
  output.params.seed = 2026;
  output.params.jitter = 45;
  output.params.count = 18;
}
varied.document.placements.at(-1)!.transform.rotation = 12;
varied.document.placements.at(-1)!.transform.x = 1800;
varied.document.capture = { x: 800, y: -100, width: 2100, height: 1200 };
const assets = new Map([[hash, bytes]]);
const archive = await encodeField(varied.document, assets);
assert.deepEqual((await decodeField(archive)).document, varied.document);
writeFileSync(
  new URL("../results/field-first-build.form", import.meta.url),
  archive,
);
console.log(
  JSON.stringify(
    {
      formatVersion: 3,
      nodes: varied.document.nodes.length,
      placements: varied.document.placements.length,
      assets: varied.document.assets.length,
      bytes: archive.length,
      sha256: await sha256(archive),
      roundtrip: "exact",
      rendering: "not tested",
    },
    null,
    2,
  ),
);
