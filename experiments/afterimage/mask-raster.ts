import { validatePaintedMask } from "./mask";
import type { PaintedMask } from "./mask";

// One bounded source-space alpha texture is reused by every exposure/export tile.
export function rasterizeMask(
  mask: PaintedMask,
  width: number,
  height: number,
  feather: number,
): HTMLCanvasElement {
  validatePaintedMask(mask);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    !Number.isFinite(feather) ||
    feather < 0.001 ||
    feather > 0.5
  )
    throw Error("Invalid painted mask dimensions or feather.");
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const raw = document.createElement("canvas");
  raw.width = Math.max(1, Math.round(width * scale));
  raw.height = Math.max(1, Math.round(height * scale));
  const c = raw.getContext("2d")!;
  c.fillStyle = "white";
  if (mask.base === "full") c.fillRect(0, 0, raw.width, raw.height);
  for (const s of mask.strokes) {
    c.globalCompositeOperation =
      s.mode === "paint" ? "source-over" : "destination-out";
    c.strokeStyle = "white";
    c.lineWidth = s.radius * 2 * Math.max(raw.width, raw.height);
    c.lineCap = c.lineJoin = "round";
    if (s.points.length === 1) {
      c.beginPath();
      c.arc(
        s.points[0].x * raw.width,
        s.points[0].y * raw.height,
        c.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(s.points[0].x * raw.width, s.points[0].y * raw.height);
      for (const p of s.points.slice(1))
        c.lineTo(p.x * raw.width, p.y * raw.height);
      c.stroke();
    }
  }
  return featherCoverage(raw, feather);
}

export function featherCoverage(
  raw: HTMLCanvasElement,
  feather: number,
): HTMLCanvasElement {
  const blur = feather * Math.max(raw.width, raw.height) * 0.05;
  // Padding prevents blur from fading a full selection at the image edges.
  const pad = Math.ceil(blur * 3),
    padded = document.createElement("canvas");
  padded.width = raw.width + pad * 2;
  padded.height = raw.height + pad * 2;
  const pc = padded.getContext("2d")!;
  pc.drawImage(raw, pad, pad);
  pc.drawImage(raw, 0, 0, 1, raw.height, 0, pad, pad, raw.height);
  pc.drawImage(
    raw,
    raw.width - 1,
    0,
    1,
    raw.height,
    pad + raw.width,
    pad,
    pad,
    raw.height,
  );
  pc.drawImage(raw, 0, 0, raw.width, 1, pad, 0, raw.width, pad);
  pc.drawImage(
    raw,
    0,
    raw.height - 1,
    raw.width,
    1,
    pad,
    pad + raw.height,
    raw.width,
    pad,
  );
  for (const [x, y] of [
    [0, 0],
    [raw.width - 1, 0],
    [0, raw.height - 1],
    [raw.width - 1, raw.height - 1],
  ])
    pc.drawImage(
      raw,
      x,
      y,
      1,
      1,
      x === 0 ? 0 : pad + raw.width,
      y === 0 ? 0 : pad + raw.height,
      pad,
      pad,
    );
  const result = document.createElement("canvas");
  result.width = raw.width;
  result.height = raw.height;
  const rc = result.getContext("2d")!;
  rc.filter = `blur(${blur}px)`;
  rc.drawImage(padded, -pad, -pad);
  return result;
}
