import { Zlib } from "fflate";
import { chunk } from "./core.ts";
import type { Params, Rect } from "./core";
import type { AfterimageRenderer } from "./renderer";
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function exportPNG(
  renderer: Pick<AfterimageRenderer, "draw" | "read">,
  params: Params,
  region: Rect,
  size: number | { width: number; height: number },
  onProgress: (value: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const width = typeof size === "number" ? size : size.width,
    height = typeof size === "number" ? size : size.height;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 8192))
    throw Error("Export dimensions must be between 1 and 8192.");
  const output: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  ];
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  output.push(chunk("IHDR", header), chunk("sRGB", new Uint8Array([0])));
  const zip = new Zlib({ level: 3 }, (bytes) =>
    output.push(chunk("IDAT", bytes)),
  );
  // One row band plus one tile readback; no full-size canvas or RGBA framebuffer.
  for (let y = 0; y < height; y += 128) {
    if (signal.aborted)
      throw new DOMException("Export cancelled", "AbortError");
    const h = Math.min(128, height - y),
      rows = new Uint8Array(h * (width * 4 + 1));
    for (let x = 0; x < width; x += 1024) {
      const w = Math.min(1024, width - x);
      renderer.draw(
        params,
        {
          x: region.x + (x / width) * region.width,
          y: region.y + (y / height) * region.height,
          width: (w / width) * region.width,
          height: (h / height) * region.height,
        },
        w,
        h,
      );
      const pixels = renderer.read();
      for (let row = 0; row < h; row++)
        rows.set(
          pixels.subarray((h - 1 - row) * w * 4, (h - row) * w * 4),
          row * (width * 4 + 1) + 1 + x * 4,
        );
    }
    zip.push(rows, y + h === height);
    onProgress((y + h) / height);
    await pause();
  }
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  output.push(chunk("IEND", new Uint8Array()));
  return new Blob(output as BlobPart[], { type: "image/png" });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
