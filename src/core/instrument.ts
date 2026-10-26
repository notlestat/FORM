import type { Params, Rect } from "../../experiments/afterimage/core.ts";
import {
  addAfterimage,
  emptyField,
  outputType,
  validateField,
  validRect,
} from "./field.ts";
import type { FieldDocument, Coverage } from "./field.ts";
import { operationInputs } from "./evaluation.ts";
export const INSTRUMENT_BYTES = 256 * 1024;
export type InstrumentDefinition = {
  format: "form-instrument";
  formatVersion: 1;
  name: string;
  instrument: { id: "afterimage"; version: 2 };
  sourceSize: { width: number; height: number };
  params: Params;
  selection: {
    coverage: Exclude<Coverage, { kind: "image" }>;
    feather: number;
  } | null;
  frame: Rect | null;
};
export function validateDefinition(
  value: unknown,
): asserts value is InstrumentDefinition {
  const v = value as InstrumentDefinition;
  if (
    !v ||
    v.format !== "form-instrument" ||
    v.formatVersion !== 1 ||
    v.instrument?.id !== "afterimage" ||
    v.instrument.version !== 2 ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 160 ||
    !v.sourceSize ||
    ![v.sourceSize.width, v.sourceSize.height].every(
      (n) => Number.isFinite(n) && n >= 1 && n <= 4096,
    ) ||
    (v.frame !== null && !validRect(v.frame)) ||
    Object.keys(v).some(
      (k) =>
        ![
          "format",
          "formatVersion",
          "name",
          "instrument",
          "sourceSize",
          "params",
          "selection",
          "frame",
        ].includes(k),
    ) ||
    new TextEncoder().encode(JSON.stringify(v)).length > INSTRUMENT_BYTES
  )
    throw Error("Unsupported or invalid instrument definition.");
  const d = emptyField("definition-validation");
  d.nodes.push({
    id: "op",
    name: "AFTERIMAGE",
    kind: "afterimage",
    instrumentVersion: 2,
    params: v.params,
    frame: v.frame,
    position: { x: 0, y: 0 },
  });
  if (v.selection !== null) {
    if (!v.selection || (v.selection.coverage as Coverage)?.kind === "image")
      throw Error(
        "Instrument definitions cannot embed selection images. Save a .form project instead.",
      );
    d.nodes.push({
      id: "selection",
      name: "Selection",
      kind: "selection",
      coverage: v.selection.coverage,
      feather: v.selection.feather,
      position: { x: 0, y: 0 },
    });
  }
  validateField(d);
}
export function defineInstrument(
  d: FieldDocument,
  operationId: string,
  size: { width: number; height: number },
): InstrumentDefinition {
  const node = d.nodes.find((n) => n.id === operationId);
  if (node?.kind !== "afterimage")
    throw Error("Select an AFTERIMAGE to save its instrument.");
  const { params, selection } = operationInputs(d, operationId);
  if (selection?.coverage.kind === "image")
    throw Error(
      "This instrument uses an imported selection image. Save the .form project to keep that image with it.",
    );
  const definition: InstrumentDefinition = {
    format: "form-instrument",
    formatVersion: 1,
    name: node.name,
    instrument: { id: "afterimage", version: 2 },
    sourceSize: { ...size },
    params,
    selection: selection
      ? {
          coverage: structuredClone(selection.coverage) as Exclude<
            Coverage,
            { kind: "image" }
          >,
          feather: selection.feather,
        }
      : null,
    frame: structuredClone(node.frame),
  };
  validateDefinition(definition);
  return definition;
}
export function applyInstrument(
  d: FieldDocument,
  sourceId: string,
  size: { width: number; height: number },
  definition: InstrumentDefinition,
  id: () => string,
) {
  validateDefinition(definition);
  if (!d.nodes.some((n) => n.id === sourceId && outputType(n) === "Image2D"))
    throw Error("Select a photograph, text, shape or output first.");
  if (
    ![size.width, size.height].every(
      (n) => Number.isFinite(n) && n >= 1 && n <= 4096,
    )
  )
    throw Error("Instrument source must fit within 4096 units per edge.");
  const added = addAfterimage(d, sourceId, id, {
      x: size.width,
      y: size.height,
    }),
    next = added.document;
  const placement = next.placements.find((p) => p.id === added.placementId)!,
    op = next.nodes.find((n) => n.id === placement.nodeId)!;
  if (op.kind !== "afterimage") throw Error("Instrument output is missing.");
  const sx = size.width / definition.sourceSize.width,
    sy = size.height / definition.sourceSize.height;
  const point = (p: { x: number; y: number }) => ({ x: p.x * sx, y: p.y * sy });
  op.name = definition.name;
  placement.name = definition.name.slice(0, 153) + " output";
  op.params = structuredClone(definition.params);
  op.params.path = op.params.path.map(point) as Params["path"];
  op.params.maskCenter = point(op.params.maskCenter);
  op.params.maskRadius = point(op.params.maskRadius);
  op.params.jitter *= (sx + sy) / 2;
  op.frame = definition.frame
    ? {
        ...point(definition.frame),
        width: definition.frame.width * sx,
        height: definition.frame.height * sy,
      }
    : null;
  const path = next.nodes.find(
    (n) =>
      n.id ===
      next.edges.find((e) => e.to === op.id && e.input === "trajectory")!.from,
  )!;
  if (path.kind === "trajectory") path.points = structuredClone(op.params.path);
  const mask = next.nodes.find(
    (n) =>
      n.id ===
      next.edges.find((e) => e.to === op.id && e.input === "selection")!.from,
  )!;
  if (definition.selection && mask.kind === "selection") {
    mask.coverage = structuredClone(definition.selection.coverage);
    mask.feather = definition.selection.feather;
  } else {
    next.edges = next.edges.filter(
      (e) => !(e.to === op.id && e.input === "selection"),
    );
    next.nodes = next.nodes.filter((n) => n.id !== mask.id);
  }
  validateField(next);
  return added;
}
export function parseDefinition(bytes: Uint8Array): InstrumentDefinition {
  if (bytes.length > INSTRUMENT_BYTES)
    throw Error("Instrument file exceeds 256 KiB.");
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  validateDefinition(value);
  return structuredClone(value);
}
