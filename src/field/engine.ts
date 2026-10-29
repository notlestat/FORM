import { materialKey } from "../core/authoring";
import { textLines } from "../core/frame";
import type { TextMaterial, ShapeMaterial } from "../core/authoring";
import { composeArtwork } from "../core/composition";
import { AfterimageRenderer } from "../../experiments/afterimage/renderer";
import {
  rasterizeMask,
  featherCoverage,
} from "../../experiments/afterimage/mask-raster";
import { captureFor } from "../../experiments/afterimage/core";
import type { Params, Rect } from "../../experiments/afterimage/core";
import { imageMime, sha256, MAX_IMAGE_BYTES } from "../core/project";
import type { Asset } from "../core/project";
import { validateField } from "../core/field";
import { operationInputs, operationKey } from "../core/evaluation";
import { imageBounds } from "../core/image";
import type {
  FieldDocument,
  FieldNode,
  Coverage,
  Placement,
} from "../core/field";
export type Raster = {
  image: HTMLCanvasElement | HTMLImageElement;
  width: number;
  height: number;
  region: Rect;
  key: string;
  proxy: boolean;
};
export type Evaluation = {
  outputs: Map<string, Raster>;
  errors: Map<string, string>;
  cacheHits: number;
  rendered: number;
};
export type Quality = "preview" | "export";
const pause = () => new Promise<void>((r) => setTimeout(r, 0));
const abortIf = (s: AbortSignal) => {
  if (s.aborted) throw new DOMException("Evaluation cancelled", "AbortError");
};
export class AssetRegistry {
  readonly bytes = new Map<string, Uint8Array>();
  readonly images = new Map<string, HTMLImageElement>();
  private urls = new Map<string, string>();
  async prepare(
    bytes: Uint8Array,
    name: string,
    expected?: Asset,
  ): Promise<Asset> {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
      throw Error("Use a JPEG or PNG smaller than 24 MiB.");
    imageBounds(bytes);
    const mime = imageMime(bytes),
      hash = await sha256(bytes);
    if (
      expected &&
      (hash !== expected.sha256 ||
        bytes.length !== expected.byteLength ||
        mime !== expected.mime)
    )
      throw Error("Photograph integrity failed.");
    const previous = this.images.get(hash);
    if (previous) {
      if (
        expected &&
        (previous.naturalWidth !== expected.width ||
          previous.naturalHeight !== expected.height)
      )
        throw Error("Embedded image dimensions do not match.");
      return {
        id: hash,
        sha256: hash,
        path: `assets/${hash}.${mime === "image/jpeg" ? "jpg" : "png"}`,
        byteLength: bytes.length,
        width: previous.naturalWidth,
        height: previous.naturalHeight,
        mime,
        name: name.slice(0, 160) || "Photograph",
      };
    }
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mime }),
    );
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(Error("The image could not be decoded."));
        i.src = url;
      });
      const width = image.naturalWidth,
        height = image.naturalHeight;
      if (
        Math.max(width, height) > 4096 ||
        width * height > 16e6 ||
        width < 1 ||
        height < 1
      )
        throw Error(
          "Photographs must fit within 4096px per edge and 16 megapixels.",
        );
      if (expected && (expected.width !== width || expected.height !== height))
        throw Error("Embedded image dimensions do not match the document.");
      this.images.set(hash, image);
      this.bytes.set(hash, new Uint8Array(bytes));
      this.urls.set(hash, url);
      return {
        id: hash,
        sha256: hash,
        path: `assets/${hash}.${mime === "image/jpeg" ? "jpg" : "png"}`,
        byteLength: bytes.length,
        width,
        height,
        name: name.slice(0, 160) || "Photograph",
        mime,
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
  discard(id: string) {
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.images.delete(id);
    this.bytes.delete(id);
  }
  dispose() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.images.clear();
    this.bytes.clear();
  }
}
export function coverageCanvas(
  coverage: Coverage,
  width: number,
  height: number,
  feather: number,
  assets: AssetRegistry,
): HTMLCanvasElement {
  if (coverage.kind === "painted")
    return rasterizeMask(
      coverage.painted,
      Math.round(width),
      Math.round(height),
      feather,
    );
  const scale = Math.min(1, 1024 / Math.max(width, height)),
    w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  const raw = document.createElement("canvas");
  raw.width = w;
  raw.height = h;
  const c = raw.getContext("2d")!;
  c.fillStyle = "white";
  if (coverage.kind === "ellipse") {
    c.beginPath();
    c.ellipse(
      coverage.center.x * w,
      coverage.center.y * h,
      coverage.radius.x * w,
      coverage.radius.y * h,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  if (coverage.kind === "closed") {
    c.beginPath();
    coverage.points.forEach((p, i) =>
      i ? c.lineTo(p.x * w, p.y * h) : c.moveTo(p.x * w, p.y * h),
    );
    c.closePath();
    c.fill("evenodd");
  }
  if (coverage.kind === "image") {
    const image = assets.images.get(coverage.assetId);
    if (!image) throw Error("Selection image is missing.");
    c.drawImage(image, 0, 0, w, h);
    const data = c.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const alpha =
        ((0.2126 * data.data[i] +
          0.7152 * data.data[i + 1] +
          0.0722 * data.data[i + 2]) *
          data.data[i + 3]) /
        255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
      data.data[i + 3] = alpha;
    }
    c.putImageData(data, 0, 0);
  }
  return featherCoverage(raw, feather);
}
async function materialCanvas(
  n: TextMaterial | ShapeMaterial,
  quality: Quality,
): Promise<Raster> {
  if (n.kind === "text") {
    const font = `${n.weight} ${n.fontSize}px "Archivo Variable"`;
    await document.fonts.load(font, n.content || "FORM");
    if (!document.fonts.check(font))
      throw Error("Archivo is not ready. Retry after the font loads.");
  }
  const scale =
    quality === "preview" ? Math.min(1, 768 / Math.max(n.width, n.height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(n.width * scale));
  canvas.height = Math.max(1, Math.round(n.height * scale));
  const c = canvas.getContext("2d")!;
  c.scale(canvas.width / n.width, canvas.height / n.height);
  if (n.kind === "text") {
    c.font = `${n.weight} ${n.fontSize}px "Archivo Variable"`;
    c.fontKerning = "none";
    c.textBaseline = "top";
    c.fillStyle = n.color;
    const pieces = (s: string) =>
      Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s),
        (x) => x.segment,
      );
    const lines = textLines(
      n.content,
      n.width,
      n.tracking,
      (s) => c.measureText(s).width,
    );
    lines.forEach((line, i) => {
      const chars = pieces(line),
        width =
          chars.reduce((sum, ch) => sum + c.measureText(ch).width, 0) +
          Math.max(0, chars.length - 1) * n.tracking;
      let x =
        n.align === "left"
          ? 0
          : n.align === "center"
            ? (n.width - width) / 2
            : n.width - width;
      const y = i * n.fontSize * n.lineHeight;
      if (y >= n.height) return;
      for (const char of chars) {
        c.fillText(char, x, y);
        x += c.measureText(char).width + n.tracking;
      }
    });
  } else {
    const inset = n.stroke ? n.strokeWidth / 2 : 0;
    c.beginPath();
    if (n.shape === "ellipse")
      c.ellipse(
        n.width / 2,
        n.height / 2,
        Math.max(0, n.width / 2 - inset),
        Math.max(0, n.height / 2 - inset),
        0,
        0,
        Math.PI * 2,
      );
    else
      c.rect(
        inset,
        inset,
        Math.max(0, n.width - inset * 2),
        Math.max(0, n.height - inset * 2),
      );
    if (n.fill) {
      c.fillStyle = n.fill;
      c.fill();
    }
    if (n.stroke && n.strokeWidth > 0) {
      c.strokeStyle = n.stroke;
      c.lineWidth = n.strokeWidth;
      c.stroke();
    }
  }
  return {
    image: canvas,
    width: n.width,
    height: n.height,
    region: { x: 0, y: 0, width: n.width, height: n.height },
    key: materialKey(n, quality),
    proxy: scale < 1,
  };
}
export class FieldEvaluator {
  private cache = new Map<string, Raster>();
  private renderer: AfterimageRenderer | null = null;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  async reset() {
    this.generation++;
    await this.queue.catch(() => {});
    this.cache.clear();
    this.renderer?.destroy();
    this.renderer = null;
  }
  private remember(key: string, raster: Raster, quality: Quality) {
    this.cache.set(key, raster);
    const budget = (quality === "preview" ? 64 : 192) * 1024 * 1024;
    let bytes = [...this.cache.values()].reduce(
      (n, v) => n + v.image.width * v.image.height * 4,
      0,
    );
    for (const [k, v] of this.cache) {
      if (bytes <= budget) break;
      if (k !== key) {
        this.cache.delete(k);
        bytes -= v.image.width * v.image.height * 4;
      }
    }
  }
  private async backend() {
    if (this.renderer?.lost) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (!this.renderer)
      this.renderer = await new AfterimageRenderer(
        document.createElement("canvas"),
      ).init();
    return this.renderer;
  }
  evaluate(
    d: FieldDocument,
    assets: AssetRegistry,
    ids: string[],
    quality: Quality,
    signal: AbortSignal,
  ): Promise<Evaluation> {
    const task = this.queue
      .catch(() => {})
      .then(() => this.run(d, assets, ids, quality, signal));
    this.queue = task;
    return task;
  }
  private async run(
    d: FieldDocument,
    assets: AssetRegistry,
    ids: string[],
    quality: Quality,
    signal: AbortSignal,
  ): Promise<Evaluation> {
    validateField(d);
    const generation = this.generation,
      outputs = new Map<string, Raster>(),
      errors = new Map<string, string>();
    let cacheHits = 0,
      rendered = 0;
    const running = new Map<string, Promise<Raster>>(),
      nodes = new Map(d.nodes.map((n) => [n.id, n]));
    const visit = (id: string): Promise<Raster> => {
      const existing = running.get(id);
      if (existing) return existing;
      const task = (async () => {
        abortIf(signal);
        if (generation !== this.generation)
          throw new DOMException("Renderer reset", "AbortError");
        const n = nodes.get(id);
        if (!n) throw Error("The connected object is missing.");
        if (n.kind === "image") {
          const a = d.assets.find((a) => a.id === n.assetId)!,
            image = assets.images.get(a.id);
          if (!image) throw Error("The photograph is missing.");
          const raster = {
            image,
            width: a.width,
            height: a.height,
            region: { x: 0, y: 0, width: a.width, height: a.height },
            key: a.sha256,
            proxy: false,
          };
          outputs.set(id, raster);
          return raster;
        }
        if (n.kind === "text" || n.kind === "shape") {
          const key = materialKey(n, quality);
          const cached = this.cache.get(key);
          if (cached) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            outputs.set(id, cached);
            cacheHits++;
            return cached;
          }
          const scale =
            quality === "preview"
              ? Math.min(1, 768 / Math.max(n.width, n.height))
              : 1;
          const bytes =
            Math.max(1, Math.round(n.width * scale)) *
            Math.max(1, Math.round(n.height * scale)) *
            4;
          const allocated = [...outputs.values()]
            .filter((o) => o.image instanceof HTMLCanvasElement)
            .reduce((sum, o) => sum + o.image.width * o.image.height * 4, 0);
          if (
            allocated + bytes >
            (quality === "export" ? 192 : 64) * 1024 * 1024
          )
            throw Error(
              "This composition exceeds its intermediate-image budget. Include fewer outputs.",
            );
          const raster = await materialCanvas(n, quality);
          abortIf(signal);
          if (generation !== this.generation)
            throw new DOMException("Obsolete output", "AbortError");
          this.remember(key, raster, quality);
          outputs.set(id, raster);
          rendered++;
          return raster;
        }
        if (n.kind !== "afterimage")
          throw Error("This object is a guide, not a visual output.");
        const inputs = d.edges.filter((e) => e.to === id),
          edge = inputs.find((e) => e.input === "image");
        if (!edge) throw Error("Connect an image to this AFTERIMAGE.");
        const source = await visit(edge.from);
        abortIf(signal);
        if (Math.max(source.width, source.height) > 4096)
          throw Error(
            "This intermediate output exceeds 4096 units. Set a smaller output frame before chaining it.",
          );
        const { params, selection } = operationInputs(d, id);
        const region =
            n.frame ?? captureFor(params, source.width, source.height),
          maxEdge = quality === "preview" ? 768 : 4096;
        const key = await operationKey(d, id, source.key, region, quality);
        const cached = this.cache.get(key);
        if (cached) {
          this.cache.delete(key);
          this.cache.set(key, cached);
          outputs.set(id, cached);
          cacheHits++;
          return cached;
        }
        const scale =
            quality === "preview"
              ? Math.min(1, maxEdge / Math.max(region.width, region.height))
              : maxEdge / Math.max(region.width, region.height),
          w = Math.max(1, Math.round(region.width * scale)),
          h = Math.max(1, Math.round(region.height * scale));
        const allocated = [...outputs.values()]
          .filter((o) => o.image instanceof HTMLCanvasElement)
          .reduce((sum, o) => sum + o.image.width * o.image.height * 4, 0);
        if (quality === "export" && allocated + w * h * 4 > 192 * 1024 * 1024)
          throw Error(
            "This export needs more than the 192 MiB intermediate-image budget. Include fewer independent outputs or shorten the processing chain.",
          );
        const r = await this.backend();
        abortIf(signal);
        if (w > r.maxSize || h > r.maxSize)
          throw Error("This GPU cannot render the required export dimensions.");
        const mask =
          selection?.kind === "selection"
            ? coverageCanvas(
                selection.coverage,
                source.width,
                source.height,
                selection.feather,
                assets,
              )
            : undefined;
        r.upload(source.image, source.width, source.height);
        r.draw(params, region, w, h, mask);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(r.canvas, 0, 0);
        const result = {
          image: canvas,
          width: region.width,
          height: region.height,
          region,
          key,
          proxy: scale < 1,
        };
        abortIf(signal);
        if (generation !== this.generation)
          throw new DOMException("Obsolete output", "AbortError");
        this.remember(key, result, quality);
        outputs.set(id, result);
        rendered++;
        await pause();
        abortIf(signal);
        return result;
      })();
      running.set(id, task);
      return task;
    };
    for (const id of ids) {
      try {
        await visit(id);
      } catch (error) {
        if (signal.aborted || (error as Error).name === "AbortError")
          throw error;
        errors.set(id, (error as Error).message);
      }
    }
    return { outputs, errors, cacheHits, rendered };
  }
}
export class CaptureRenderer {
  readonly canvas = document.createElement("canvas");
  constructor(
    private readonly placements: Placement[],
    private readonly outputs: Map<string, Raster>,
    private readonly background: string | null = null,
  ) {}
  draw(_params: Params, region: Rect, width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    const c = this.canvas.getContext("2d", { willReadFrequently: true })!;
    c.clearRect(0, 0, width, height);
    if (this.background) {
      c.fillStyle = this.background;
      c.fillRect(0, 0, width, height);
    }
    c.scale(width / region.width, height / region.height);
    c.translate(-region.x, -region.y);
    composeArtwork(c, this.placements, this.outputs);
  }
  read() {
    const c = this.canvas.getContext("2d")!,
      w = this.canvas.width,
      h = this.canvas.height,
      data = c.getImageData(0, 0, w, h).data,
      reversed = new Uint8Array(data.length);
    for (let y = 0; y < h; y++)
      reversed.set(
        data.subarray(y * w * 4, (y + 1) * w * 4),
        (h - 1 - y) * w * 4,
      );
    return reversed;
  }
}
