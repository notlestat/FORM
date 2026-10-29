import { isExportedArtwork, placementOpacity } from "./field.ts";
import type { Placement } from "./field.ts";

type CompositionContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "scale"
  | "drawImage"
  | "globalAlpha"
  | "globalCompositeOperation"
>;
type ArtworkRaster = {
  image: CanvasImageSource;
  width: number;
  height: number;
};

/** One source-over pass shared by full and tiled composition exports. */
export function composeArtwork(
  context: CompositionContext,
  placements: Placement[],
  outputs: Map<string, ArtworkRaster>,
): void {
  for (const placement of placements) {
    if (!isExportedArtwork(placement)) continue;
    const output = outputs.get(placement.nodeId);
    if (!output)
      throw Error(
        `Cannot export ${placement.name}: its current output is unavailable.`,
      );
    const t = placement.transform;
    context.save();
    try {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = placementOpacity(placement);
      context.translate(t.x, t.y);
      context.rotate((t.rotation * Math.PI) / 180);
      context.scale(t.scaleX, t.scaleY);
      context.drawImage(output.image, 0, 0, output.width, output.height);
    } finally {
      context.restore();
    }
  }
}
