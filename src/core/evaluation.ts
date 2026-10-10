import type { Params, Rect } from "../../experiments/afterimage/core.ts";
import type { FieldDocument } from "./field.ts";
import { sha256 } from "./project.ts";

// Authored layout and placement are deliberately outside operation identity.
export function operationInputs(d: FieldDocument, id: string) {
  const n = d.nodes.find((n) => n.id === id);
  if (n?.kind !== "afterimage") throw Error("Select an AFTERIMAGE operation.");
  const inputs = d.edges.filter((e) => e.to === id);
  const path = d.nodes.find(
    (n) => n.id === inputs.find((e) => e.input === "trajectory")?.from,
  );
  const selection = d.nodes.find(
    (n) => n.id === inputs.find((e) => e.input === "selection")?.from,
  );
  const params: Params = {
    ...structuredClone(n.params),
    path:
      path?.kind === "trajectory"
        ? structuredClone(path.points)
        : structuredClone(n.params.path),
    mask: false,
    paintedMask: undefined,
  };
  return {
    params,
    selection: selection?.kind === "selection" ? selection : null,
  };
}
export async function operationKey(
  d: FieldDocument,
  id: string,
  sourceKey: string,
  region: Rect,
  quality: "preview" | "export",
) {
  const { params, selection } = operationInputs(d, id);
  return sha256(
    new TextEncoder().encode(
      JSON.stringify({
        instrument: "afterimage-2",
        source: sourceKey,
        params,
        selection: selection
          ? { coverage: selection.coverage, feather: selection.feather }
          : null,
        region,
        quality,
      }),
    ),
  );
}
