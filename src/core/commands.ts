import { validateParams } from "../../experiments/afterimage/core.ts";
import { samePaintedMask } from "../../experiments/afterimage/mask.ts";
import type { Params, Point, Rect } from "../../experiments/afterimage/core.ts";
import type { Positions, StudyState } from "./project.ts";

// Authoring excludes navigation, selection and proof presentation.
export type AuthoringState = Pick<
  StudyState,
  "name" | "params" | "positions" | "capture" | "connected"
>;
export type StudyEdit =
  | { type: "parameters"; params: Params }
  | { type: "placement"; object: keyof Positions; position: Point }
  | { type: "capture"; capture: Rect }
  | { type: "connection"; connected: boolean }
  | { type: "name"; name: string };
type Entry = { label: string; before: AuthoringState; after: AuthoringState };
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const same = (a: AuthoringState, b: AuthoringState) =>
  a.name === b.name &&
  a.connected === b.connected &&
  (["source", "operation", "result"] as const).every((k) =>
    samePoint(a.positions[k], b.positions[k]),
  ) &&
  samePoint(a.capture, b.capture) &&
  a.capture.width === b.capture.width &&
  a.capture.height === b.capture.height &&
  (
    [
      "count",
      "opacity",
      "falloff",
      "distribution",
      "follow",
      "mode",
      "mask",
      "feather",
      "jitter",
      "seed",
    ] as const
  ).every((k) => a.params[k] === b.params[k]) &&
  a.params.path.every((p, i) => samePoint(p, b.params.path[i])) &&
  samePoint(a.params.maskCenter, b.params.maskCenter) &&
  samePoint(a.params.maskRadius, b.params.maskRadius) &&
  samePaintedMask(a.params.paintedMask, b.params.paintedMask);
const copy = <T>(value: T): T => structuredClone(value);

export function authoringFromStudy(s: StudyState): AuthoringState {
  return copy({
    name: s.name,
    params: s.params,
    positions: s.positions,
    capture: s.capture,
    connected: s.connected,
  });
}
function point(p: Point) {
  if (!p || ![p.x, p.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6))
    throw Error("Use finite coordinates between -1,000,000 and 1,000,000.");
}
function validate(s: AuthoringState) {
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 160)
    throw Error("Name the study using 1 to 160 characters.");
  validateParams(s.params);
  for (const object of ["source", "operation", "result"] as const)
    point(s.positions[object]);
  point(s.capture);
  if (
    !Number.isFinite(s.capture.width) ||
    s.capture.width <= 0 ||
    s.capture.width > 1e6 ||
    s.capture.width !== s.capture.height
  )
    throw Error("Use a positive square capture frame.");
  if (typeof s.connected !== "boolean")
    throw Error("Invalid source connection.");
}
export function applyStudyEdit(
  state: AuthoringState,
  edit: StudyEdit,
): AuthoringState {
  const next = copy(state);
  switch (edit.type) {
    case "parameters":
      next.params = copy(edit.params);
      break;
    case "placement":
      if (!["source", "operation", "result"].includes(edit.object))
        throw Error("Unknown workspace object.");
      next.positions[edit.object] = { ...edit.position };
      break;
    case "capture":
      next.capture = { ...edit.capture };
      break;
    case "connection":
      next.connected = edit.connected;
      break;
    case "name":
      next.name = edit.name;
      break;
    default:
      throw Error("Unknown study command.");
  }
  validate(next);
  return next;
}

// A single transaction groups pointer/numeric previews into one reversible edit.
// A rejected edit never mutates present state or history. Snapshots are detached.
export class StudyCommands {
  private present: AuthoringState;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private transaction: { label: string; before: AuthoringState } | null = null;
  private revision = 0;
  private limit: number;
  constructor(initial: AuthoringState, limit = 80) {
    validate(initial);
    if (!Number.isInteger(limit) || limit < 1)
      throw Error("Invalid history limit.");
    this.limit = limit;
    this.present = copy(initial);
  }
  get state() {
    return copy(this.present);
  }
  get status() {
    return {
      revision: this.revision,
      undoCount: this.past.length,
      redoCount: this.future.length,
      undoLabel: this.past.at(-1)?.label ?? null,
      redoLabel: this.future.at(-1)?.label ?? null,
      active: Boolean(this.transaction),
    };
  }
  execute(edit: StudyEdit, label: string) {
    const next = applyStudyEdit(this.present, edit);
    if (same(next, this.present)) return this.state;
    if (!this.transaction)
      this.record({ label, before: this.present, after: next });
    this.present = next;
    this.revision++;
    return this.state;
  }
  begin(label: string) {
    if (this.transaction) throw Error("Finish the current edit first.");
    this.transaction = { label, before: copy(this.present) };
  }
  commit() {
    if (!this.transaction) return this.state;
    const { label, before } = this.transaction;
    this.transaction = null;
    if (!same(before, this.present))
      this.record({ label, before, after: this.present });
    return this.state;
  }
  cancel() {
    if (!this.transaction) return this.state;
    const { before } = this.transaction;
    this.transaction = null;
    if (!same(before, this.present)) this.revision++;
    this.present = copy(before);
    return this.state;
  }
  undo() {
    if (this.transaction)
      throw Error("Finish the current edit before undoing.");
    const entry = this.past.pop();
    if (entry) {
      this.future.push(entry);
      this.present = copy(entry.before);
      this.revision++;
    }
    return this.state;
  }
  redo() {
    if (this.transaction)
      throw Error("Finish the current edit before redoing.");
    const entry = this.future.pop();
    if (entry) {
      this.past.push(entry);
      this.present = copy(entry.after);
      this.revision++;
    }
    return this.state;
  }
  reset(state: AuthoringState) {
    validate(state);
    this.present = copy(state);
    this.past = [];
    this.future = [];
    this.transaction = null;
    this.revision++;
    return this.state;
  }
  private record(entry: Entry) {
    this.past.push(copy(entry));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
}
