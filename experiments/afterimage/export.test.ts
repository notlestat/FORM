import test from "node:test";
import assert from "node:assert/strict";
import { unzlibSync } from "fflate";
import { exportPNG } from "./export.ts";
import { defaults, crc32 } from "./core.ts";
import type { Params, Rect } from "./core.ts";

class CoordinateRenderer {
  calls: { region: Rect; width: number; height: number }[] = [];
  private pixels = new Uint8Array();
  draw(_p: Params, region: Rect, width: number, height: number) {
    this.calls.push({ region, width, height });
    this.pixels = new Uint8Array(width * height * 4);
    // Simulate bottom-up GPU readback; source and destination units are 1:1.
    for (let row = 0; row < height; row++)
      for (let x = 0; x < width; x++) {
        const at = ((height - 1 - row) * width + x) * 4;
        this.pixels.set(
          [
            Math.round(region.x + x) % 251,
            Math.round(region.y + row) % 251,
            93,
            127,
          ],
          at,
        );
      }
  }
  read() {
    return this.pixels;
  }
}
async function unpack(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const idat: Uint8Array[] = [];
  let width = 0,
    height = 0;
  for (let pos = 8; pos < bytes.length;) {
    const length = view.getUint32(pos),
      type = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8));
    assert.equal(
      crc32(bytes.subarray(pos + 4, pos + 8 + length)),
      view.getUint32(pos + 8 + length),
    );
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
    }
    if (type === "IDAT") idat.push(bytes.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  const compressed = new Uint8Array(idat.reduce((n, x) => n + x.length, 0));
  let offset = 0;
  for (const x of idat) {
    compressed.set(x, offset);
    offset += x.length;
  }
  return { width, height, rows: unzlibSync(compressed) };
}
test("rectangular PNG preserves every pixel across partial columns, bands and bottom-up readback", async () => {
  const renderer = new CoordinateRenderer(),
    progress: number[] = [],
    width = 1103,
    height = 259;
  const blob = await exportPNG(
    renderer,
    defaults(100, 100),
    { x: 13, y: 17, width, height },
    { width, height },
    (p) => progress.push(p),
    new AbortController().signal,
  );
  const png = await unpack(blob);
  assert.equal(png.width, width);
  assert.equal(png.height, height);
  assert.equal(renderer.calls.length, 6);
  assert.equal(progress.at(-1), 1);
  assert.equal(png.rows.length, height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    assert.equal(png.rows[y * (width * 4 + 1)], 0);
    for (let x = 0; x < width; x++) {
      const at = y * (width * 4 + 1) + 1 + x * 4;
      assert.deepEqual(
        [...png.rows.subarray(at, at + 4)],
        [(x + 13) % 251, (y + 17) % 251, 93, 127],
      );
    }
  }
});
test("square legacy size and rectangular world mapping use the same tiled exporter", async () => {
  const renderer = new CoordinateRenderer();
  const blob = await exportPNG(
    renderer,
    defaults(100, 100),
    { x: -30, y: 40, width: 800, height: 400 },
    129,
    () => {},
    new AbortController().signal,
  );
  const png = await unpack(blob);
  assert.equal(png.width, 129);
  assert.equal(png.height, 129);
  assert.equal(renderer.calls[1].height, 1);
  assert.ok(
    Math.abs(renderer.calls[1].region.y - (40 + (128 / 129) * 400)) < 1e-9,
  );
});
test("cancellation after the final band still prevents publishing a completed blob", async () => {
  const abort = new AbortController(),
    renderer = new CoordinateRenderer();
  await assert.rejects(
    exportPNG(
      renderer,
      defaults(100, 100),
      { x: 0, y: 0, width: 10, height: 10 },
      10,
      () => abort.abort(),
      abort.signal,
    ),
    { name: "AbortError" },
  );
});
test("pre-cancelled or invalid exports never draw a tile", async () => {
  const abort = new AbortController();
  abort.abort();
  const renderer = new CoordinateRenderer();
  await assert.rejects(
    exportPNG(
      renderer,
      defaults(100, 100),
      { x: 0, y: 0, width: 10, height: 10 },
      10,
      () => {},
      abort.signal,
    ),
    { name: "AbortError" },
  );
  await assert.rejects(
    exportPNG(
      renderer,
      defaults(100, 100),
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 0, height: 10 },
      () => {},
      new AbortController().signal,
    ),
    /dimensions/,
  );
  assert.equal(renderer.calls.length, 0);
});
