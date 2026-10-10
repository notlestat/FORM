import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  cubic,
  sample,
  bounds,
  squareCapture,
  captureFor,
  validateParams,
  crc32,
  chunk,
} from "./core.ts";
test("single exposure is an identity transform", () => {
  const p = defaults(400, 600);
  p.count = 1;
  assert.deepEqual(sample(p), [{ x: 0, y: 0, angle: 0, weight: 0.8 }]);
});
test("arc-length samples are equally spaced on a straight line", () => {
  const p = defaults(100, 100);
  p.path = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 0 },
  ];
  p.count = 5;
  sample(p).forEach((s, i) => assert.ok(Math.abs(s.x - i * 25) < 0.001));
});
test("locked seed repeats and new seed changes only jittered samples", () => {
  const p = defaults(100, 100);
  p.jitter = 15;
  assert.deepEqual(sample(p), sample(p));
  const a = sample(p);
  p.seed++;
  const b = sample(p);
  assert.deepEqual(a[0], b[0]);
  assert.notDeepEqual(a[1], b[1]);
});
test("zero-length paths remain finite and stable", () => {
  const p = defaults(100, 100);
  p.path.fill({ x: 50, y: 50 });
  p.follow = true;
  assert.ok(sample(p).every((e) => e.x === 0 && e.y === 0 && e.angle === 0));
});
test("rotation bounds contain every transformed corner", () => {
  const r = bounds(
    100,
    200,
    [{ x: 10, y: 20, angle: Math.PI / 2, weight: 1 }],
    { x: 50, y: 100 },
  );
  assert.ok(
    r.x <= -40 && r.y <= 70 && r.x + r.width >= 160 && r.y + r.height >= 170,
  );
});
test("capture is square and contains complete expanded result", () => {
  const r = { x: -120, y: 30, width: 800, height: 900 },
    s = squareCapture(r);
  assert.equal(s.width, s.height);
  assert.ok(s.x < r.x && s.y < r.y && s.x + s.width > r.x + r.width);
});
test("region edits leave motion and rotated capture bounds unchanged", () => {
  const p = defaults(400, 600);
  p.follow = true;
  const exposures = sample(p),
    frame = captureFor(p, 400, 600);
  p.maskCenter = { x: 80, y: 120 };
  p.maskRadius = { x: 40, y: 90 };
  assert.deepEqual(sample(p), exposures);
  assert.deepEqual(captureFor(p, 400, 600), frame);
});
test("invalid settings and non-finite points fail validation", () => {
  const p = defaults(100, 100);
  validateParams(p);
  assert.throws(() => validateParams({ ...p, count: 65 }));
  assert.throws(() =>
    validateParams({
      ...p,
      path: [{ x: NaN, y: 0 }, ...p.path.slice(1)] as typeof p.path,
    }),
  );
});
test("Bezier endpoints and subdivision values are exact", () => {
  const p = defaults(100, 100).path;
  assert.deepEqual(cubic(p, 0), p[0]);
  assert.deepEqual(cubic(p, 1), p[3]);
});
test("PNG chunks use standard CRC32 and big-endian lengths", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const c = chunk("IEND", new Uint8Array());
  assert.equal(new DataView(c.buffer).getUint32(0), 0);
  assert.equal(new DataView(c.buffer).getUint32(8), 0xae426082);
});
