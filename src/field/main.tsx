import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo";
import "./style.css";
import { defaults, cubic, sample } from "../../experiments/afterimage/core";
import type { Params, Point, Rect } from "../../experiments/afterimage/core";
import {
  TrajectoryStroke,
  fitTrajectory,
} from "../../experiments/afterimage/trajectory";
import {
  appendMaskStroke,
  MaskStrokeBuilder,
  MAX_MASK_POINTS,
  MAX_MASK_STROKES,
} from "../../experiments/afterimage/mask";
import { exportPNG, download } from "../../experiments/afterimage/export";
import {
  addAfterimage,
  artworkBounds,
  connect,
  decodeField,
  emptyField,
  encodeField,
  FieldCommands,
  fromWorld,
  independentVariation,
  linkedCopy,
  isExportedArtwork,
  placementOpacity,
  reorderArtwork,
  outputType,
  removeNode,
  replaceImage,
  resizeArtwork,
  rotateArtwork,
  rotationStep,
  screenToField,
  toWorld,
  transformedBounds,
  validateField,
  zoomAt,
  FIELD_LIMITS,
} from "../core/field";
import type {
  ArtworkOrder,
  Coverage,
  FieldDocument,
  FieldNode,
  Placement,
  Port,
} from "../core/field";
import type { Camera } from "../core/project";
import {
  AssetRegistry,
  CaptureRenderer,
  coverageCanvas,
  FieldEvaluator,
} from "./engine";
import type { Evaluation, Raster } from "./engine";
import { RecoveryStore } from "../platform/recovery";
import type { RecoverySnapshot } from "../platform/recovery";

import {
  alignArtwork,
  artworkSelection,
  selectionBounds,
  translateArtwork,
  removeArtwork,
} from "../core/arrangement";
import type { Alignment } from "../core/arrangement";

type Selection = { kind: "node" | "placement"; id: string } | null;
type Mode = "select" | "trajectory" | "selection";
type Prepared = {
  document: FieldDocument;
  assets: AssetRegistry;
  migrated: boolean;
};
const uuid = () => crypto.randomUUID();
const blankResult = (): Evaluation => ({
  outputs: new Map(),
  errors: new Map(),
  rendered: 0,
  cacheHits: 0,
});
const buttonLabel: Record<Mode, string> = {
  select: "Select",
  trajectory: "Trajectory",
  selection: "Selection",
};
const friendly = (error: unknown) =>
  error instanceof Error ? error.message : "The operation failed.";
const cleanName = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} ._-]+/gu, "")
    .trim()
    .slice(0, 120) || "FORM";
const processSignature = (d: FieldDocument) =>
  JSON.stringify({
    nodes: d.nodes.map(({ id, kind, ...n }) => ({
      id,
      kind,
      ...n,
      position: undefined,
      name: undefined,
    })),
    edges: d.edges,
    assets: d.assets.map((a) => [a.id, a.width, a.height]),
  });
const authoringSignature = (d: FieldDocument) =>
  JSON.stringify({ ...d, presentation: undefined });
function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(5)))),
    cancelled = useRef(false);
  useEffect(() => setDraft(String(Number(value.toFixed(5)))), [value]);
  const finish = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(Number(value.toFixed(5))));
      return;
    }
    const n = Number(draft);
    if (
      draft.trim() &&
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max)
    ) {
      if (n !== Number(value.toFixed(5))) onCommit(n);
    }
    setDraft(String(Number(value.toFixed(5))));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
function NameField({
  value,
  label,
  onCommit,
  disabled = false,
}: {
  value: string;
  label: string;
  onCommit: (s: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value),
    cancel = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="name-field"
      aria-label={label}
      maxLength={160}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => (cancel.current = false)}
      onBlur={() => {
        if (!cancel.current && draft.trim() && draft.trim() !== value)
          onCommit(draft.trim());
        setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function Artwork({ raster }: { raster?: Raster }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    if (!raster) {
      canvas.current.width = canvas.current.height = 1;
      return;
    }
    const c = canvas.current;
    c.width = raster.image.width;
    c.height = raster.image.height;
    c.getContext("2d")!.drawImage(raster.image, 0, 0);
  }, [raster]);
  return (
    <canvas ref={canvas} className="artwork" aria-label="Rendered artwork" />
  );
}
function FieldApp() {
  const initial = useRef(emptyField(uuid())),
    commands = useRef(new FieldCommands(initial.current)),
    assets = useRef(new AssetRegistry()),
    evaluator = useRef(new FieldEvaluator()),
    recovery = useRef(new RecoveryStore());
  const [doc, setDoc] = useState(initial.current),
    [camera, setCamera] = useState<Camera>(initial.current.presentation.camera),
    cameraRef = useRef(camera),
    [selection, setPrimarySelection] = useState<Selection>(null),
    [artworkIds, setArtworkIds] = useState<string[]>([]),
    [mode, setMode] = useState<Mode>("select"),
    [branchId, setBranchId] = useState<string | null>(null);
  const [result, setResult] = useState<Evaluation>(blankResult),
    [updating, setUpdating] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("Loading the initial study."),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [initialized, setInitialized] = useState(false),
    [recoveryState, setRecoveryState] = useState("Preparing local recovery"),
    [recoverable, setRecoverable] = useState<RecoverySnapshot | null>(null),
    [pending, setPending] = useState<Prepared | "new" | null>(null),
    [downloaded, setDownloaded] = useState<string | null>(null),
    [proof, setProof] = useState<"paper" | "dark">("paper"),
    [epoch, setEpoch] = useState(0),
    [gestureActive, setGestureActive] = useState(false),
    [ink, setInk] = useState<Point[]>([]),
    [brushMode, setBrushMode] = useState<"paint" | "erase">("paint"),
    [brushSize, setBrushSize] = useState(12),
    [showObjects, setShowObjects] = useState(true),
    [showInspector, setShowInspector] = useState(true),
    [checks, setChecks] = useState<Record<string, unknown> | null>(null);
  const field = useRef<HTMLDivElement>(null),
    photoInput = useRef<HTMLInputElement>(null),
    replaceInput = useRef<HTMLInputElement>(null),
    maskInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    gesture = useRef<(() => void) | null>(null),
    space = useRef(false),
    abortExport = useRef<AbortController | null>(null),
    live = useRef({ doc, camera, busy, pending, gestureActive, initialized });
  live.current = { doc, camera, busy, pending, gestureActive, initialized };
  cameraRef.current = camera;
  const signature = authoringSignature(doc),
    changed =
      downloaded !== null ? downloaded !== signature : doc.nodes.length > 0;
  const sync = useCallback(() => setDoc(commands.current.state), []);
  const execute = (
    label: string,
    edit: (d: FieldDocument) => FieldDocument | void,
  ) => {
    if (live.current.busy || live.current.pending || gesture.current) return;
    try {
      commands.current.execute(label, edit);
      sync();
      setError("");
    } catch (e) {
      setError(friendly(e));
    }
  };
  const patchNode = (id: string, label: string, edit: (n: FieldNode) => void) =>
    execute(label, (d) => {
      const n = d.nodes.find((n) => n.id === id);
      if (n) edit(n);
    });
  const patchPlacement = (
    id: string,
    label: string,
    edit: (p: Placement) => void,
  ) =>
    execute(label, (d) => {
      const p = d.placements.find((p) => p.id === id);
      if (p) edit(p);
    });
  const setSelection = (s: Selection) => {
    setPrimarySelection(s);
    setArtworkIds(s?.kind === "placement" ? [s.id] : []);
  };
  const selectedArtworkIds = artworkIds.filter((id) =>
    doc.placements.some((p) => p.id === id),
  );
  const multipleArtwork = selectedArtworkIds.length > 1;
  const alignmentReady =
    !updating &&
    multipleArtwork &&
    selectedArtworkIds.every((id) => {
      const p = doc.placements.find((p) => p.id === id)!;
      return result.outputs.has(p.nodeId);
    });
  const currentPlacement =
    selection?.kind === "placement"
      ? doc.placements.find((p) => p.id === selection.id)
      : undefined;
  const placementIndex = currentPlacement
    ? doc.placements.findIndex((p) => p.id === currentPlacement.id)
    : -1;
  const changeOrder = (order: ArtworkOrder) => {
    if (locked || !currentPlacement) return;
    execute("Arrange artwork", (d) =>
      reorderArtwork(d, currentPlacement.id, order),
    );
  };
  const currentNode = doc.nodes.find(
    (n) =>
      n.id ===
      (currentPlacement?.nodeId ??
        (selection?.kind === "node" ? selection.id : "")),
  );
  const operation =
    currentNode?.kind === "afterimage"
      ? currentNode
      : doc.nodes.find((n) => n.id === branchId && n.kind === "afterimage");
  const pathEdge =
      operation &&
      doc.edges.find((e) => e.to === operation.id && e.input === "trajectory"),
    maskEdge =
      operation &&
      doc.edges.find((e) => e.to === operation.id && e.input === "selection"),
    imageEdge =
      operation &&
      doc.edges.find((e) => e.to === operation.id && e.input === "image");
  const pathNode = doc.nodes.find((n) => n.id === pathEdge?.from),
    maskNode = doc.nodes.find((n) => n.id === maskEdge?.from),
    inputRaster = result.outputs.get(imageEdge?.from ?? "");
  const operationPlacement =
    currentPlacement?.nodeId === operation?.id
      ? currentPlacement
      : doc.placements.find((p) => p.nodeId === operation?.id && p.visible);
  const inputPlacement = doc.placements.find(
    (p) => p.nodeId === imageEdge?.from && p.visible,
  );
  const locked = busy || !!pending || gestureActive;
  const deleteSelection = () => {
    if (locked || !selection) return;
    if (selection.kind === "placement") {
      execute(
        multipleArtwork
          ? "Remove selected artwork"
          : "Remove artwork placement",
        (d) =>
          removeArtwork(
            d,
            selectedArtworkIds.length ? selectedArtworkIds : [selection.id],
          ),
      );
      setNotice(
        "Selected artwork removed. Undo restores it; shared process objects remain.",
      );
    } else if (selection.kind === "node") {
      execute("Delete process object", (d) => removeNode(d, selection.id));
      setNotice(
        "Object and its views removed; downstream inputs disconnected. Undo restores them.",
      );
    } else return;
    setSelection(null);
    setBranchId(null);
  };
  const [replacePolicy, setReplacePolicy] = useState<"scale" | "keep">("scale");
  const select = (s: Selection) => {
    if (locked) return;
    setSelection(s);
    const p =
        s?.kind === "placement"
          ? doc.placements.find((p) => p.id === s.id)
          : undefined,
      n = doc.nodes.find(
        (n) => n.id === (p?.nodeId ?? (s?.kind === "node" ? s.id : "")),
      );
    if (n?.kind === "afterimage") setBranchId(n.id);
    else if (n?.kind === "trajectory" || n?.kind === "selection") {
      const e = doc.edges.find((e) => e.from === n.id);
      setBranchId(e?.to ?? null);
    } else if (n?.kind === "image") {
      if (imageEdge?.from !== n.id) setBranchId(null);
    } else setBranchId(null);
  };
  const selectArtwork = (id: string, additive = false, preserve = false) => {
    if (locked) return selectedArtworkIds;
    const next = artworkSelection(
      selectedArtworkIds,
      id,
      additive && mode === "select",
      preserve,
    );
    select(next.length ? { kind: "placement", id: next.at(-1)! } : null);
    setArtworkIds(next);
    return next;
  };
  const selectAllArtwork = () => {
    if (locked) return;
    const next = doc.placements.filter((p) => p.visible).map((p) => p.id);
    select(next.length ? { kind: "placement", id: next.at(-1)! } : null);
    setArtworkIds(next);
    setMode("select");
  };
  const alignSelected = (alignment: Alignment) =>
    execute("Align selected artwork", (d) =>
      alignArtwork(d, selectedArtworkIds, result.outputs, alignment),
    );
  const clientPoint = (e: { clientX: number; clientY: number }) => {
    const r = field.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldPoint = (e: { clientX: number; clientY: number }) =>
    screenToField(clientPoint(e), cameraRef.current);
  const snapshot = () => ({
    ...commands.current.state,
    presentation: { camera: { ...cameraRef.current }, proof },
  });
  const processing = processSignature(doc),
    visibleIds = [
      ...new Set(doc.placements.filter((p) => p.visible).map((p) => p.nodeId)),
    ]
      .sort()
      .join("|");
  useEffect(() => {
    if (!initialized) return;
    const abort = new AbortController();
    let alive = true;
    setUpdating(true);
    const timer = setTimeout(() => {
      const state = live.current.doc;
      evaluator.current
        .evaluate(
          state,
          assets.current,
          [
            ...new Set(
              state.placements.filter((p) => p.visible).map((p) => p.nodeId),
            ),
          ],
          "preview",
          abort.signal,
        )
        .then((next) => {
          if (alive && !abort.signal.aborted) {
            setResult(next);
            setUpdating(false);
          }
        })
        .catch((e) => {
          if (alive && !abort.signal.aborted) {
            setError(friendly(e));
            setUpdating(false);
          }
        });
    }, 24);
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [processing, visibleIds, epoch, initialized]);
  useEffect(() => {
    let active = true;
    recovery.current
      .read()
      .then((s) => {
        if (active) {
          setRecoverable(s);
          setRecoveryState(
            s ? "A local recovery is available" : "Local recovery ready",
          );
        }
      })
      .catch((e) => active && setRecoveryState(friendly(e)));
    (async () => {
      const registry = assets.current,
        response = await fetch("/fixtures/marble-head.jpg");
      if (!response.ok)
        throw Error("The fixture could not load. Import a photograph.");
      const a = await registry.prepare(
        new Uint8Array(await response.arrayBuffer()),
        "Marble head / The Met",
      );
      if (!active) {
        registry.dispose();
        return;
      }
      let d = emptyField(uuid());
      d.name = "First field";
      d.assets.push(a);
      const sourceId = uuid(),
        placementId = uuid();
      d.nodes.push({
        id: sourceId,
        name: "Marble head",
        kind: "image",
        assetId: a.id,
        position: { x: 60, y: 80 },
      });
      d.placements.push({
        id: placementId,
        nodeId: sourceId,
        name: "Source photograph",
        transform: { x: 60, y: 80, scaleX: 0.6, scaleY: 0.6, rotation: 0 },
        visible: true,
        included: false,
      });
      const created = addAfterimage(d, sourceId, uuid, {
        x: a.width,
        y: a.height,
      });
      d = created.document;
      commands.current = new FieldCommands(d);
      setDoc(d);
      setSelection({ kind: "placement", id: created.placementId });
      setBranchId(d.placements.at(-1)!.nodeId);
      setInitialized(true);
      setNotice(
        "Select an output to shape it. Import your photograph to begin a new process.",
      );
    })().catch((e) => {
      if (active) {
        setInitialized(true);
        setError(friendly(e));
      }
    });
    return () => {
      active = false;
      gesture.current?.();
      abortExport.current?.abort();
      recovery.current.invalidate();
      void evaluator.current.reset();
      assets.current.dispose();
    };
  }, []);
  useEffect(() => {
    if (
      !initialized ||
      recoverable ||
      pending ||
      commands.current.status.active ||
      gestureActive ||
      busy
    )
      return;
    const d = snapshot();
    const registry = assets.current;
    const timer = setTimeout(() => {
      setRecoveryState("Saving local recovery");
      recovery.current
        .save(() => encodeField(d, registry.bytes), d.name)
        .then((date) => {
          if (date)
            setRecoveryState(
              `Recovery saved ${new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            );
        })
        .catch((e) => setRecoveryState(friendly(e)));
    }, 1200);
    return () => {
      clearTimeout(timer);
      recovery.current.invalidate();
    };
  }, [
    signature,
    camera,
    proof,
    initialized,
    recoverable,
    pending,
    gestureActive,
    busy,
  ]);
  useEffect(() => {
    if (!pending) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    if (!dialog.current?.open) dialog.current?.showModal();
  }, [pending]);
  const undo = () => {
      if (locked) return;
      commands.current.undo();
      sync();
    },
    redo = () => {
      if (locked) return;
      commands.current.redo();
      sync();
    };
  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      const editing =
        e.target instanceof Element &&
        !!e.target.closest(
          "input,textarea,select,[contenteditable]:not([contenteditable=false])",
        );
      if (e.key === "Escape" && gesture.current) {
        e.preventDefault();
        gesture.current();
        return;
      }
      if (editing) return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        selection &&
        !locked
      ) {
        e.preventDefault();
        if (!e.repeat && !e.isComposing) deleteSelection();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        space.current = true;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!locked) void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key.toLowerCase() === "f" && !locked) fitView();
      if (e.key === "Escape" && !locked) {
        setMode("select");
        select(null);
      }
    };
    const keyUp = (e: KeyboardEvent) => {
        if (e.key === " ") space.current = false;
      },
      blur = () => {
        space.current = false;
        gesture.current?.();
      },
      beforeUnload = (e: BeforeUnloadEvent) => {
        if (changed) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  });
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,button,select")
      )
        return;
      e.preventDefault();
      if (live.current.busy || gesture.current) return;
      const p = clientPoint(e);
      setCamera((c) =>
        e.ctrlKey || e.metaKey
          ? zoomAt(c, p, c.scale * Math.exp(-e.deltaY * 0.008))
          : { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY },
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const runGesture = (
    e: React.PointerEvent,
    label: string,
    move: (p: Point, event: PointerEvent) => void,
    finish?: (p: Point, event: PointerEvent) => void,
    authored = true,
  ) => {
    if (
      locked ||
      gesture.current ||
      !e.isPrimary ||
      (e.button !== 0 && e.button !== 1)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement,
      pointerId = e.pointerId,
      initialCamera = { ...cameraRef.current };
    if (authored) commands.current.begin(label);
    setGestureActive(true);
    const cleanup = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("resize", cancel);
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      gesture.current = null;
      setGestureActive(false);
      setInk([]);
    };
    const cancel = () => {
      if (authored) {
        commands.current.cancel();
        sync();
      } else setCamera(initialCamera);
      cleanup();
      setNotice(`${label} cancelled.`);
    };
    const onMove = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      try {
        move(worldPoint(v), v);
        if (authored) sync();
      } catch (e) {
        cancel();
        setError(friendly(e));
      }
    };
    const onEnd = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      try {
        finish?.(worldPoint(v), v);
        if (authored) {
          commands.current.commit();
          sync();
        }
        cleanup();
      } catch (e) {
        cancel();
        setError(friendly(e));
      }
    };
    gesture.current = cancel;
    el.setPointerCapture(pointerId);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    window.addEventListener("resize", cancel);
  };
  function pan(e: React.PointerEvent) {
    const first = clientPoint(e),
      initial = { ...cameraRef.current };
    runGesture(
      e,
      "Pan field",
      (point) => {
        const c = cameraRef.current,
          screen = { x: point.x * c.scale + c.x, y: point.y * c.scale + c.y };
        const next = {
          ...initial,
          x: initial.x + screen.x - first.x,
          y: initial.y + screen.y - first.y,
        };
        cameraRef.current = next;
        setCamera(next);
      },
      undefined,
      false,
    );
  }
  function movePlacement(e: React.PointerEvent, p: Placement) {
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    if (mode !== "select") {
      e.stopPropagation();
      select({ kind: "placement", id: p.id });
      return;
    }
    if (locked || !e.isPrimary || e.button !== 0) return;
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      selectArtwork(p.id, true);
      return;
    }
    const ids = selectArtwork(p.id, false, true),
      first = worldPoint(e),
      original = commands.current.state;
    const label = ids.length > 1 ? "Move selected artwork" : "Move artwork";
    runGesture(e, label, (point) =>
      commands.current.execute(label, () =>
        translateArtwork(original, ids, {
          x: point.x - first.x,
          y: point.y - first.y,
        }),
      ),
    );
  }
  function moveNode(e: React.PointerEvent, n: FieldNode) {
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    select({ kind: "node", id: n.id });
    const first = worldPoint(e),
      original = { ...n.position };
    runGesture(e, "Move process object", (p) =>
      commands.current.execute("Move process object", (d) => {
        const node = d.nodes.find((v) => v.id === n.id)!;
        node.position = {
          x: original.x + p.x - first.x,
          y: original.y + p.y - first.y,
        };
      }),
    );
  }
  function transformHandle(
    e: React.PointerEvent,
    p: Placement,
    raster: Raster,
    kind: "scale" | "rotate",
  ) {
    const initial = structuredClone(p.transform),
      start = worldPoint(e),
      center = toWorld({ x: raster.width / 2, y: raster.height / 2 }, initial),
      startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let previousAngle = startAngle,
      turned = 0;
    runGesture(
      e,
      kind === "scale" ? "Scale artwork" : "Rotate artwork",
      (point, event) =>
        commands.current.execute("Transform artwork", (d) => {
          const item = d.placements.find((v) => v.id === p.id)!;
          if (kind === "rotate") {
            if (Math.hypot(point.x - center.x, point.y - center.y) < 1e-6)
              return;
            const angle = Math.atan2(point.y - center.y, point.x - center.x);
            turned += rotationStep(previousAngle, angle);
            previousAngle = angle;
            item.transform = rotateArtwork(
              initial,
              raster.width,
              raster.height,
              initial.rotation + turned,
            );
          } else {
            item.transform = resizeArtwork(
              initial,
              point,
              raster.width,
              raster.height,
              event.shiftKey,
            );
          }
        }),
    );
  }
  function placementKey(e: React.KeyboardEvent, p: Placement) {
    const offsets: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      },
      delta = offsets[e.key];
    if (!delta) return;
    e.preventDefault();
    const ids = selectedArtworkIds.includes(p.id)
      ? selectedArtworkIds
      : selectArtwork(p.id);
    execute("Nudge selected artwork", (d) =>
      translateArtwork(d, ids, {
        x: delta.x * (e.shiftKey ? 10 : 1),
        y: delta.y * (e.shiftKey ? 10 : 1),
      }),
    );
  }
  function pathDrag(
    e: React.PointerEvent,
    p: Placement,
    raster: Raster,
    index: number,
  ) {
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    const op = operation;
    if (op?.kind !== "afterimage") return;
    runGesture(e, "Shape trajectory", (world) => {
      const point = fromWorld(world, p.transform);
      const value = {
        x: point.x + raster.region.x,
        y: point.y + raster.region.y,
      };
      commands.current.execute("Shape trajectory", (d) => {
        const path = d.nodes.find((n) => n.id === pathNode?.id);
        if (path?.kind === "trajectory") path.points[index] = value;
        else {
          const n = d.nodes.find((n) => n.id === op.id);
          if (n?.kind === "afterimage") n.params.path[index] = value;
        }
      });
    });
  }
  function drawPath(e: React.PointerEvent, p: Placement, raster: Raster) {
    if (locked || !e.isPrimary) return;
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    if (operation?.kind !== "afterimage") return;
    const point = (world: Point) => {
      const q = fromWorld(world, p.transform);
      return { x: q.x + raster.region.x, y: q.y + raster.region.y };
    };
    const stroke = new TrajectoryStroke(
      point(worldPoint(e)),
      2 / Math.max(0.05, camera.scale),
    );
    setInk(stroke.points);
    runGesture(
      e,
      "Draw trajectory",
      (world) => {
        stroke.append(point(world));
        setInk(stroke.points);
      },
      (world) => {
        stroke.append(point(world));
        const points = fitTrajectory(stroke.points);
        if (!points)
          throw Error(
            "Draw a longer trajectory. The previous path is retained.",
          );
        commands.current.execute("Draw trajectory", (d) => {
          const path = d.nodes.find((n) => n.id === pathNode?.id);
          if (path?.kind === "trajectory") path.points = points;
          else {
            const n = d.nodes.find((n) => n.id === operation.id);
            if (n?.kind === "afterimage") n.params.path = points;
          }
        });
        setNotice("Trajectory drawn. Refine the handles or Undo once.");
      },
    );
  }
  function selectionDrag(
    e: React.PointerEvent,
    placement: Placement,
    width: number,
    height: number,
    kind: "center" | "radius" | number,
  ) {
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    if (maskNode?.kind !== "selection") return;
    runGesture(e, "Shape selection", (world) => {
      const q = fromWorld(world, placement.transform),
        normalized = {
          x: Math.max(0, Math.min(1, q.x / width)),
          y: Math.max(0, Math.min(1, q.y / height)),
        };
      commands.current.execute("Shape selection", (d) => {
        const n = d.nodes.find((n) => n.id === maskNode.id);
        if (n?.kind !== "selection") return;
        if (n.coverage.kind === "ellipse") {
          if (kind === "center") n.coverage.center = normalized;
          else if (kind === "radius")
            n.coverage.radius = {
              x: Math.max(0.005, Math.abs(normalized.x - n.coverage.center.x)),
              y: Math.max(0.005, Math.abs(normalized.y - n.coverage.center.y)),
            };
        } else if (n.coverage.kind === "closed" && typeof kind === "number")
          n.coverage.points[kind] = normalized;
      });
    });
  }
  function drawSelection(
    e: React.PointerEvent,
    placement: Placement,
    width: number,
    height: number,
  ) {
    if (locked || !e.isPrimary) return;
    if (space.current || e.button === 1) {
      pan(e);
      return;
    }
    if (
      maskNode?.kind !== "selection" ||
      !["painted", "closed"].includes(maskNode.coverage.kind)
    )
      return;
    const coverage = structuredClone(maskNode.coverage),
      point = (world: Point) => {
        const q = fromWorld(world, placement.transform);
        return { x: q.x / width, y: q.y / height };
      },
      first = point(worldPoint(e));
    if (first.x < 0 || first.x > 1 || first.y < 0 || first.y > 1) return;
    try {
      const remaining =
        coverage.kind === "painted"
          ? MAX_MASK_POINTS -
            coverage.painted.strokes.reduce((n, s) => n + s.points.length, 0)
          : 256;
      if (
        coverage.kind === "painted" &&
        coverage.painted.strokes.length >= MAX_MASK_STROKES
      )
        throw Error(
          "This selection has 64 strokes. Undo or clear it before painting.",
        );
      const stroke = new MaskStrokeBuilder(
        Math.min(coverage.kind === "closed" ? 256 : 128, remaining),
        0.003,
      );
      stroke.append(first);
      setInk(stroke.strokePoints);
      runGesture(
        e,
        coverage.kind === "closed"
          ? "Draw closed selection"
          : `${brushMode === "paint" ? "Paint" : "Erase"} selection`,
        (world) => {
          stroke.append(point(world));
          setInk(stroke.strokePoints);
        },
        (world) => {
          stroke.append(point(world), true);
          const points = stroke.strokePoints;
          if (coverage.kind === "closed" && points.length < 3)
            throw Error(
              "Draw a boundary with at least three points. Previous selection retained.",
            );
          commands.current.execute("Draw selection", (d) => {
            const n = d.nodes.find((n) => n.id === maskNode.id);
            if (n?.kind !== "selection") return;
            n.coverage =
              coverage.kind === "closed"
                ? { kind: "closed", points }
                : {
                    kind: "painted",
                    painted: appendMaskStroke(
                      (coverage as Extract<Coverage, { kind: "painted" }>)
                        .painted,
                      { mode: brushMode, radius: brushSize / 200, points },
                    ),
                  };
          });
          setNotice("Selection updated. Each stroke is one Undo step.");
        },
      );
    } catch (e) {
      setInk([]);
      setError(friendly(e));
    }
  }
  function canvasDown(e: React.PointerEvent) {
    if (space.current || e.button === 1) pan(e);
    else select(null);
  }
  function fitView() {
    if (!field.current || locked) return;
    let bounds: Rect[] = [];
    if (multipleArtwork && alignmentReady) {
      bounds = [selectionBounds(doc, selectedArtworkIds, result.outputs)];
    } else if (currentPlacement) {
      const r = result.outputs.get(currentPlacement.nodeId);
      if (r)
        bounds = [
          transformedBounds(
            { x: 0, y: 0, width: r.width, height: r.height },
            currentPlacement.transform,
          ),
        ];
    } else if (currentNode)
      bounds = [{ ...currentNode.position, width: 226, height: 88 }];
    if (!bounds.length)
      bounds = doc.placements
        .filter((p) => p.visible)
        .flatMap((p) => {
          const r = result.outputs.get(p.nodeId);
          return r
            ? [
                transformedBounds(
                  { x: 0, y: 0, width: r.width, height: r.height },
                  p.transform,
                ),
              ]
            : [];
        })
        .concat(
          doc.nodes
            .filter((n) => n.kind !== "image")
            .map((n) => ({ ...n.position, width: 226, height: 100 })),
        );
    if (!bounds.length) {
      setCamera({ x: 80, y: 140, scale: 0.45 });
      return;
    }
    const minX = Math.min(...bounds.map((b) => b.x)),
      minY = Math.min(...bounds.map((b) => b.y)),
      maxX = Math.max(...bounds.map((b) => b.x + b.width)),
      maxY = Math.max(...bounds.map((b) => b.y + b.height)),
      w = field.current.clientWidth,
      h = field.current.clientHeight,
      scale = Math.max(
        0.05,
        Math.min(
          2,
          (w - 120) / Math.max(1, maxX - minX),
          (h - 120) / Math.max(1, maxY - minY),
        ),
      );
    setCamera({
      x: w / 2 - ((minX + maxX) / 2) * scale,
      y: h / 2 - ((minY + maxY) / 2) * scale,
      scale,
    });
  }
  function createOperation() {
    const image =
        currentNode && outputType(currentNode) === "Image2D"
          ? currentNode
          : doc.nodes.find((n) => n.kind === "image"),
      raster = image && result.outputs.get(image.id);
    if (!image || !raster) {
      setError("Select a rendered photograph or output first.");
      return;
    }
    let selectedId = "";
    execute("Create AFTERIMAGE", (d) => {
      const added = addAfterimage(d, image.id, uuid, {
        x: raster.width,
        y: raster.height,
      });
      selectedId = added.placementId;
      return added.document;
    });
    if (selectedId) {
      setSelection({ kind: "placement", id: selectedId });
      setBranchId(
        commands.current.state.placements.find((p) => p.id === selectedId)!
          .nodeId,
      );
    }
  }
  async function importPhoto(file: File, asMask = false) {
    if (locked) return;
    if (file.size > 24 * 1024 * 1024) {
      setError("Use a photograph smaller than 24 MiB.");
      return;
    }
    setBusy(true);
    setError("");
    let preparedId: string | null = null;
    const originalAssets = new Set(assets.current.bytes.keys());
    try {
      const a = await assets.current.prepare(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        ),
        sourceId = uuid(),
        placementId = uuid();
      preparedId = a.id;
      commands.current.execute(
        asMask ? "Import selection image" : "Place photograph",
        (d) => {
          if (!d.assets.some((v) => v.id === a.id)) d.assets.push(a);
          if (asMask && maskNode?.kind === "selection") {
            const n = d.nodes.find((n) => n.id === maskNode.id);
            if (n?.kind === "selection")
              n.coverage = { kind: "image", assetId: a.id };
          } else if (asMask)
            throw Error(
              "Select an operation with a selection input before importing a mask.",
            );
          else {
            const p = screenToField(
              {
                x: field.current!.clientWidth / 3,
                y: field.current!.clientHeight / 3,
              },
              cameraRef.current,
            );
            d.nodes.push({
              id: sourceId,
              name: a.name,
              kind: "image",
              assetId: a.id,
              position: p,
            });
            d.placements.push({
              id: placementId,
              nodeId: sourceId,
              name: a.name,
              transform: {
                ...p,
                scaleX: Math.min(1, 400 / a.width),
                scaleY: Math.min(1, 400 / a.width),
                rotation: 0,
              },
              visible: true,
              included: false,
            });
          }
        },
      );
      sync();
      setEpoch((n) => n + 1);
      if (!asMask) {
        setSelection({ kind: "placement", id: placementId });
        setBranchId(null);
        setMode("select");
      }
      setNotice(
        asMask
          ? "Imported luminance × alpha as selection coverage."
          : "Photograph placed. Create AFTERIMAGE or include it directly in the export.",
      );
    } catch (e) {
      if (preparedId && !originalAssets.has(preparedId))
        assets.current.discard(preparedId);
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function replacePhoto(file: File) {
    if (locked || currentNode?.kind !== "image") return;
    if (file.size > 24 * 1024 * 1024) {
      setError("Use a photograph smaller than 24 MiB.");
      return;
    }
    const sourceId = currentNode.id,
      scaleGuides = replacePolicy === "scale";
    const existing = new Set(assets.current.bytes.keys());
    let preparedId: string | null = null;
    setBusy(true);
    setError("");
    try {
      const a = await assets.current.prepare(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
      );
      preparedId = a.id;
      commands.current.execute("Replace source photograph", (d) =>
        replaceImage(d, sourceId, a, scaleGuides, uuid),
      );
      sync();
      setEpoch((n) => n + 1);
      setNotice(
        scaleGuides
          ? "Source replaced. Direct trajectories and fixed frames scaled; normalized selections retained."
          : "Source replaced. Source-space trajectory coordinates and frames retained.",
      );
    } catch (e) {
      if (preparedId && !existing.has(preparedId))
        assets.current.discard(preparedId);
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (live.current.busy || live.current.pending || gesture.current) return;
    setBusy(true);
    setError("");
    try {
      const d = snapshot(),
        bytes = await encodeField(d, assets.current.bytes);
      download(new Blob([new Uint8Array(bytes)]), `${cleanName(d.name)}.form`);
      setDownloaded(authoringSignature(d));
      setNotice(
        "Project download prepared. Keep the .form file; local recovery is not a backup.",
      );
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepareProject(bytes: Uint8Array): Promise<Prepared> {
    const loaded = await decodeField(bytes),
      registry = new AssetRegistry();
    try {
      for (const a of loaded.document.assets)
        await registry.prepare(loaded.assets.get(a.id)!, a.name, a);
      return {
        document: loaded.document,
        assets: registry,
        migrated: loaded.migrated,
      };
    } catch (e) {
      registry.dispose();
      throw e;
    }
  }
  async function open(file: File) {
    if (locked) return;
    if (file.size > FIELD_LIMITS.packageBytes) {
      setError("Project exceeds the 64 MiB limit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setPending(
        await prepareProject(new Uint8Array(await file.arrayBuffer())),
      );
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function acceptProject(p: Prepared) {
    gesture.current?.();
    recovery.current.invalidate();
    await evaluator.current.reset();
    const previous = assets.current;
    assets.current = p.assets;
    commands.current = new FieldCommands(p.document);
    setDoc(p.document);
    setCamera(p.document.presentation.camera);
    setProof(p.document.presentation.proof);
    setSelection(null);
    setBranchId(null);
    setResult(blankResult());
    setDownloaded(authoringSignature(p.document));
    setPending(null);
    setRecoverable(null);
    setEpoch((n) => n + 1);
    previous.dispose();
    setNotice(
      p.migrated
        ? "Older project migrated to FIELD. Original file is unchanged; save a new copy."
        : "FIELD project opened. Undo starts fresh.",
    );
  }
  function dismissProject() {
    if (pending && pending !== "new") pending.assets.dispose();
    setPending(null);
  }
  async function newProject() {
    setBusy(true);
    try {
      await evaluator.current.reset();
      const previous = assets.current;
      assets.current = new AssetRegistry();
      previous.dispose();
      const d = emptyField(uuid());
      commands.current = new FieldCommands(d);
      setDoc(d);
      setCamera(d.presentation.camera);
      setSelection(null);
      setBranchId(null);
      setResult(blankResult());
      setPending(null);
      setRecoverable(null);
      setDownloaded(null);
      setMode("select");
      setEpoch((n) => n + 1);
      await recovery.current.clear();
      setNotice("Empty field ready. Import a photograph to begin.");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  async function restoreRecovery() {
    if (!recoverable || locked) return;
    setBusy(true);
    try {
      const prepared = await prepareProject(recoverable.bytes);
      setPending(prepared);
    } catch (e) {
      setError(
        `Recovery could not open: ${friendly(e)}. Existing work is unchanged.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportArtwork(size = 4096) {
    if (locked) return;
    const d = snapshot(),
      included = d.placements.filter(isExportedArtwork);
    if (!included.length) {
      setError(
        "Include visible artwork with opacity above 0% in the export first.",
      );
      return;
    }
    setBusy(true);
    setProgress(0);
    setError("");
    const controller = new AbortController();
    abortExport.current = controller;
    const engine = new FieldEvaluator();
    try {
      setNotice("Evaluating the included artwork at export quality.");
      const results = await engine.evaluate(
        d,
        assets.current,
        [...new Set(included.map((p) => p.nodeId))],
        "export",
        controller.signal,
      );
      if (results.errors.size)
        throw Error([...results.errors.values()].join(" "));
      const region = artworkBounds(d.placements, results.outputs);
      const ratio = region.width / region.height,
        dimensions =
          ratio >= 1
            ? { width: size, height: Math.max(1, Math.round(size / ratio)) }
            : { width: Math.max(1, Math.round(size * ratio)), height: size };
      const renderer = new CaptureRenderer(d.placements, results.outputs),
        blob = await exportPNG(
          renderer,
          defaults(1, 1),
          region,
          dimensions,
          setProgress,
          controller.signal,
        );
      if (controller.signal.aborted)
        throw new DOMException("Export cancelled", "AbortError");
      download(
        blob,
        `${cleanName(d.name)}-${dimensions.width}x${dimensions.height}.png`,
      );
      setNotice(
        `Transparent ${dimensions.width} × ${dimensions.height} PNG prepared from the included artwork.`,
      );
    } catch (e) {
      setNotice(
        (e as Error).name === "AbortError"
          ? "Export cancelled. No file was downloaded."
          : "Export did not finish.",
      );
      if ((e as Error).name !== "AbortError") setError(friendly(e));
    } finally {
      await engine.reset();
      abortExport.current = null;
      setBusy(false);
    }
  }
  async function runChecks() {
    if (locked) return;
    setBusy(true);
    setError("");
    const engine = new FieldEvaluator(),
      controller = new AbortController();
    abortExport.current = controller;
    try {
      const state = snapshot(),
        included = state.placements.filter(isExportedArtwork);
      if (!included.length)
        throw Error(
          "Include visible artwork with opacity above 0% before running rendering checks.",
        );
      const evaluated = await engine.evaluate(
        state,
        assets.current,
        [...new Set(included.map((p) => p.nodeId))],
        "preview",
        controller.signal,
      );
      if (evaluated.errors.size)
        throw Error([...evaluated.errors.values()].join(" "));
      const renderer = new CaptureRenderer(state.placements, evaluated.outputs),
        region = artworkBounds(state.placements, evaluated.outputs),
        ratio = region.width / region.height,
        w = ratio >= 1 ? 512 : Math.max(1, Math.round(512 * ratio)),
        h = ratio >= 1 ? Math.max(1, Math.round(512 / ratio)) : 512;
      renderer.draw(defaults(1, 1), region, w, h);
      const full = renderer.read(),
        tiled = new Uint8Array(full.length);
      for (let y = 0; y < h; y += 64)
        for (let x = 0; x < w; x += 128) {
          const tw = Math.min(128, w - x),
            th = Math.min(64, h - y);
          renderer.draw(
            defaults(1, 1),
            {
              x: region.x + (x / w) * region.width,
              y: region.y + (y / h) * region.height,
              width: (tw / w) * region.width,
              height: (th / h) * region.height,
            },
            tw,
            th,
          );
          const pixels = renderer.read();
          for (let row = 0; row < th; row++)
            tiled.set(
              pixels.subarray((th - row - 1) * tw * 4, (th - row) * tw * 4),
              ((h - y - row - 1) * w + x) * 4,
            );
        }
      let maximum = 0;
      full.forEach(
        (v, i) => (maximum = Math.max(maximum, Math.abs(v - tiled[i]))),
      );
      const report = {
        timestamp: new Date().toISOString(),
        scope: "Same-browser 512px composition tile comparison",
        width: w,
        height: h,
        maxChannelError: maximum,
        pass: maximum <= 2,
        rendered: evaluated.rendered,
        cacheHits: evaluated.cacheHits,
        backend: "AFTERIMAGE WebGL2 and Canvas2D sRGB source-over composition",
        nativePlatformsVerified: false,
      };
      setChecks(report);
      download(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
        "form-field-rendering-checks.json",
      );
      setNotice(
        "Rendering check report downloaded. This does not verify native platforms.",
      );
    } catch (e) {
      setError(friendly(e));
    } finally {
      await engine.reset();
      abortExport.current = null;
      setBusy(false);
    }
  }
  const selectionPreview = useMemo(() => {
    if (maskNode?.kind !== "selection" || !inputRaster) return null;
    try {
      return coverageCanvas(
        maskNode.coverage,
        inputRaster.width,
        inputRaster.height,
        maskNode.feather,
        assets.current,
      ).toDataURL("image/png");
    } catch {
      return null;
    }
  }, [maskNode, inputRaster, epoch]);
  const editMask = (coverage: Coverage) => {
    if (maskNode?.kind === "selection")
      patchNode(maskNode.id, "Change selection shape", (n) => {
        if (n.kind === "selection") n.coverage = coverage;
      });
  };
  const changeParameter = <K extends keyof Params>(
    key: K,
    value: Params[K],
  ) => {
    if (operation?.kind === "afterimage")
      patchNode(operation.id, "Edit AFTERIMAGE", (n) => {
        if (n.kind === "afterimage") n.params[key] = value;
      });
  };
  const connectionTargets =
    currentNode?.kind === "afterimage"
      ? currentNode
      : operation?.kind === "afterimage"
        ? operation
        : null;
  const renderable = initialized && doc.nodes.length > 0;
  const anchor = (nodeId: string): Point => {
    const placement = doc.placements.find(
        (p) => p.nodeId === nodeId && p.visible,
      ),
      raster = result.outputs.get(nodeId);
    if (placement && raster)
      return toWorld(
        { x: raster.width / 2, y: raster.height / 2 },
        placement.transform,
      );
    const n = doc.nodes.find((n) => n.id === nodeId);
    return { x: (n?.position.x ?? 0) + 113, y: (n?.position.y ?? 0) + 48 };
  };
  const actualPath =
    pathNode?.kind === "trajectory"
      ? pathNode.points
      : operation?.kind === "afterimage"
        ? operation.params.path
        : null;
  const modeHelp =
    mode === "select"
      ? "Drag artwork to compose. Space-drag pans; pinch zooms; F fits."
      : mode === "trajectory"
        ? "Draw on the selected output or move its handles. Escape cancels."
        : "Edit selection on the input photograph. Paint or draw a boundary; Escape cancels.";
  return (
    <div className={`form-app proof-${proof}`}>
      <header className="command-strip">
        <div className="identity">
          <span className="wordmark">FORM</span>
          <span className="environment">Field</span>
        </div>
        <div className="project-title">
          <NameField
            value={doc.name}
            label="Project name"
            disabled={locked}
            onCommit={(name) =>
              execute("Rename project", (d) => {
                d.name = name;
              })
            }
          />
          <span className="project-state">
            {downloaded === null
              ? "Local project"
              : changed
                ? "Edited"
                : "Downloaded"}
          </span>
        </div>
        <nav aria-label="Project actions">
          <button disabled={locked} onClick={() => setPending("new")}>
            New
          </button>
          <button
            disabled={locked}
            onClick={() => projectInput.current?.click()}
          >
            Open
          </button>
          <button disabled={locked || !initialized} onClick={() => void save()}>
            Save
          </button>
          <button
            className="primary"
            disabled={locked || !renderable}
            onClick={() => void exportArtwork()}
          >
            Export PNG
          </button>
        </nav>
      </header>
      <div className="action-strip">
        <div className="place-actions">
          <button disabled={locked} onClick={() => photoInput.current?.click()}>
            Place photograph
          </button>
          <button
            disabled={locked || !renderable || multipleArtwork}
            onClick={createOperation}
          >
            Create AFTERIMAGE
          </button>
        </div>
        <div className="modes" role="group" aria-label="Workspace mode">
          {(Object.keys(buttonLabel) as Mode[]).map((key) => (
            <button
              key={key}
              disabled={
                locked ||
                !initialized ||
                (multipleArtwork && key !== "select") ||
                ((key === "trajectory" || key === "selection") && !operation)
              }
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
              }}
            >
              {buttonLabel[key]}
            </button>
          ))}
        </div>
        <div className="history-actions">
          <button
            disabled={locked || !commands.current.status.undo}
            title={commands.current.status.undo ?? "Nothing to undo"}
            onClick={undo}
          >
            Undo
          </button>
          <button
            disabled={locked || !commands.current.status.redo}
            title={commands.current.status.redo ?? "Nothing to redo"}
            onClick={redo}
          >
            Redo
          </button>
        </div>
      </div>
      {recoverable && (
        <div className="recovery-banner">
          <span>
            Local recovery available: {recoverable.name}. It may contain work
            not downloaded as a file.
          </span>
          <button disabled={locked} onClick={() => void restoreRecovery()}>
            Review recovery
          </button>
          <button
            disabled={locked}
            onClick={() => {
              void recovery.current
                .clear()
                .then(() => setRecoverable(null))
                .catch((e) => setError(friendly(e)));
            }}
          >
            Discard recovery
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}
      <div
        className={`work-area ${!showObjects ? "objects-hidden" : ""} ${!showInspector ? "inspector-hidden" : ""}`}
      >
        {showObjects && (
          <aside className="objects-panel" aria-label="FIELD objects">
            <div className="panel-heading">
              <h2>Objects</h2>
              <button className="quiet" onClick={() => setShowObjects(false)}>
                Hide
              </button>
            </div>
            <h3>
              Artwork{" "}
              <small className="layer-direction">
                Front → back · Shift-click to select several
              </small>
            </h3>
            <button
              className="quiet"
              disabled={locked || !doc.placements.some((p) => p.visible)}
              onClick={selectAllArtwork}
            >
              Select all artwork
            </button>
            <ul>
              {[...doc.placements].reverse().map((p) => (
                <li key={p.id}>
                  <button
                    className={
                      selectedArtworkIds.includes(p.id) ? "selected" : ""
                    }
                    disabled={locked}
                    onClick={(e) => selectArtwork(p.id, e.shiftKey)}
                  >
                    <span>{p.name}</span>
                    <small>
                      {p.visible
                        ? p.included
                          ? "In export"
                          : "Reference"
                        : "Hidden"}
                      {placementOpacity(p) < 1
                        ? ` · ${Math.round(placementOpacity(p) * 100)}%`
                        : ""}
                      {doc.placements.filter((q) => q.nodeId === p.nodeId)
                        .length > 1
                        ? " · Linked"
                        : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <h3>Process</h3>
            <ul>
              {doc.nodes.map((n) => (
                <li key={n.id}>
                  <button
                    disabled={locked}
                    className={
                      selection?.kind === "node" && selection.id === n.id
                        ? "selected"
                        : ""
                    }
                    onClick={() => select({ kind: "node", id: n.id })}
                  >
                    <span>{n.name}</span>
                    <small>
                      {n.kind === "afterimage" ? "AFTERIMAGE" : outputType(n)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {!doc.nodes.length && (
              <p className="empty-help">
                Place a photograph to start. Sources stay intact while
                operations produce editable outputs.
              </p>
            )}
          </aside>
        )}
        <main
          ref={field}
          className={`field-stage mode-${mode}`}
          aria-label="Spatial FIELD workspace"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) canvasDown(e);
          }}
        >
          <div className="field-help">{modeHelp}</div>
          {!renderable && (
            <div className="empty-field">
              <span className="empty-mark">FORM</span>
              <p>A field for material and process.</p>
              <button
                disabled={locked}
                onClick={() => photoInput.current?.click()}
              >
                Place a photograph
              </button>
            </div>
          )}
          <div
            className="field-world"
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            }}
          >
            <svg
              className="dependency-lines"
              width="1"
              height="1"
              aria-hidden="true"
            >
              {doc.edges
                .filter((e) => !branchId || e.to === branchId)
                .map((e) => {
                  const start = anchor(e.from),
                    end = anchor(e.to),
                    middle = {
                      x: (start.x + end.x) / 2,
                      y: (start.y + end.y) / 2,
                    };
                  return (
                    <g key={`${e.to}-${e.input}`}>
                      <path
                        d={`M ${start.x} ${start.y} C ${start.x + 80} ${start.y}, ${end.x - 80} ${end.y}, ${end.x} ${end.y}`}
                      />
                      <text x={middle.x} y={middle.y - 8}>
                        {e.input === "image"
                          ? "Image2D"
                          : e.input === "trajectory"
                            ? "Path2D"
                            : "Mask2D"}
                      </text>
                    </g>
                  );
                })}
            </svg>
            {doc.placements
              .filter((p) => p.visible)
              .map((placement) => {
                const raster = result.outputs.get(placement.nodeId),
                  selected = selectedArtworkIds.includes(placement.id),
                  node = doc.nodes.find((n) => n.id === placement.nodeId)!,
                  t = placement.transform;
                const isPath =
                    mode === "trajectory" &&
                    placement.id === operationPlacement?.id &&
                    raster &&
                    actualPath,
                  isMask =
                    mode === "selection" &&
                    placement.id === inputPlacement?.id &&
                    raster &&
                    maskNode?.kind === "selection";
                const width = raster?.width ?? 420,
                  height = raster?.height ?? 420,
                  handleRadius =
                    7 /
                    Math.max(
                      0.05,
                      camera.scale *
                        Math.min(Math.abs(t.scaleX), Math.abs(t.scaleY)),
                    ),
                  hitRadius = handleRadius * 2.1;
                return (
                  <section
                    className={`visual-object ${selected ? "selected-artwork" : ""} ${placement.included ? "included" : "reference"}`}
                    key={placement.id}
                    style={{
                      width,
                      height,
                      transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg) scale(${t.scaleX}, ${t.scaleY})`,
                    }}
                    aria-label={placement.name}
                  >
                    <button
                      className="art-label"
                      style={{
                        transform: `scale(${1 / (camera.scale * Math.abs(t.scaleX))}, ${1 / (camera.scale * Math.abs(t.scaleY))})`,
                        transformOrigin: "bottom left",
                      }}
                      title="Shift-click to select several; drag to move selection; arrow keys nudge; Shift nudges by 10"
                      onPointerDown={(e) => movePlacement(e, placement)}
                      onKeyDown={(e) => placementKey(e, placement)}
                      onClick={(e) => {
                        if (e.detail === 0)
                          selectArtwork(placement.id, e.shiftKey);
                      }}
                    >
                      <span>{placement.name}</span>
                      <small>
                        {updating && node.kind === "afterimage"
                          ? "Updating"
                          : result.errors.has(node.id)
                            ? "Missing output"
                            : raster?.proxy
                              ? "Preview"
                              : placement.included
                                ? "Artwork"
                                : "Reference"}
                      </small>
                    </button>
                    <div
                      className="visual-body"
                      style={{ opacity: placementOpacity(placement) }}
                      onPointerDown={(e) => {
                        if (space.current || e.button === 1) canvasDown(e);
                        else movePlacement(e, placement);
                      }}
                    >
                      <Artwork raster={raster} />
                      {!raster && (
                        <div className="unavailable-output">
                          {result.errors.get(node.id) ?? "Preparing output"}
                        </div>
                      )}
                    </div>
                    {selected &&
                      !multipleArtwork &&
                      raster &&
                      mode === "select" && (
                        <>
                          <button
                            className="transform-handle scale-handle"
                            aria-label={`Scale ${placement.name}`}
                            style={{
                              transform: `scale(${1 / (camera.scale * Math.abs(t.scaleX))}, ${1 / (camera.scale * Math.abs(t.scaleY))})`,
                            }}
                            onPointerDown={(e) =>
                              transformHandle(e, placement, raster, "scale")
                            }
                          />
                          <button
                            className="transform-handle rotate-handle"
                            aria-label={`Rotate ${placement.name}`}
                            title="Drag to rotate around the artwork centre"
                            style={{
                              transform: `scale(${1 / (camera.scale * Math.abs(t.scaleX))}, ${1 / (camera.scale * Math.abs(t.scaleY))})`,
                            }}
                            onPointerDown={(e) =>
                              transformHandle(e, placement, raster, "rotate")
                            }
                          >
                            ↻
                          </button>
                        </>
                      )}
                    {isPath && (
                      <svg
                        className="art-overlay trajectory-overlay"
                        viewBox={`0 0 ${width} ${height}`}
                        onPointerDown={(e) => drawPath(e, placement, raster)}
                      >
                        <rect
                          width={width}
                          height={height}
                          fill="transparent"
                        />
                        <path
                          className="trajectory-curve"
                          d={`M ${actualPath[0].x - raster.region.x} ${actualPath[0].y - raster.region.y} C ${actualPath[1].x - raster.region.x} ${actualPath[1].y - raster.region.y}, ${actualPath[2].x - raster.region.x} ${actualPath[2].y - raster.region.y}, ${actualPath[3].x - raster.region.x} ${actualPath[3].y - raster.region.y}`}
                          strokeWidth={
                            1.5 / (camera.scale * Math.abs(t.scaleX))
                          }
                        />
                        <path
                          className="handle-lines"
                          d={`M ${actualPath[0].x - raster.region.x} ${actualPath[0].y - raster.region.y} L ${actualPath[1].x - raster.region.x} ${actualPath[1].y - raster.region.y} M ${actualPath[2].x - raster.region.x} ${actualPath[2].y - raster.region.y} L ${actualPath[3].x - raster.region.x} ${actualPath[3].y - raster.region.y}`}
                          strokeWidth={1 / (camera.scale * Math.abs(t.scaleX))}
                        />
                        {actualPath.map((point, i) => (
                          <g
                            key={i}
                            onPointerDown={(e) =>
                              pathDrag(e, placement, raster, i)
                            }
                          >
                            <circle
                              className="handle-hit"
                              cx={point.x - raster.region.x}
                              cy={point.y - raster.region.y}
                              r={hitRadius}
                            />
                            <circle
                              className="path-handle"
                              cx={point.x - raster.region.x}
                              cy={point.y - raster.region.y}
                              r={handleRadius}
                            />
                          </g>
                        ))}
                        {ink.length > 0 && (
                          <polyline
                            className="draw-ink"
                            points={ink
                              .map(
                                (p) =>
                                  `${p.x - raster.region.x},${p.y - raster.region.y}`,
                              )
                              .join(" ")}
                            strokeWidth={
                              2 / (camera.scale * Math.abs(t.scaleX))
                            }
                          />
                        )}
                      </svg>
                    )}
                    {isMask && (
                      <svg
                        className="art-overlay selection-overlay"
                        viewBox={`0 0 ${width} ${height}`}
                        onPointerDown={(e) =>
                          drawSelection(e, placement, width, height)
                        }
                      >
                        <defs>
                          <filter id={`mask-black-${placement.id}`}>
                            <feColorMatrix
                              type="matrix"
                              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                            />
                          </filter>
                          <mask
                            id={`mask-outside-${placement.id}`}
                            maskUnits="userSpaceOnUse"
                            x="0"
                            y="0"
                            width={width}
                            height={height}
                          >
                            <rect width={width} height={height} fill="white" />
                            {selectionPreview && (
                              <image
                                href={selectionPreview}
                                width={width}
                                height={height}
                                preserveAspectRatio="none"
                                filter={`url(#mask-black-${placement.id})`}
                              />
                            )}
                          </mask>
                        </defs>
                        <rect
                          width={width}
                          height={height}
                          fill="#242823"
                          opacity=".55"
                          mask={`url(#mask-outside-${placement.id})`}
                        />
                        {maskNode.coverage.kind === "ellipse" && (
                          <>
                            <ellipse
                              className="selection-edge"
                              cx={maskNode.coverage.center.x * width}
                              cy={maskNode.coverage.center.y * height}
                              rx={maskNode.coverage.radius.x * width}
                              ry={maskNode.coverage.radius.y * height}
                              strokeWidth={
                                1.5 / (camera.scale * Math.abs(t.scaleX))
                              }
                            />
                            {[
                              {
                                kind: "center" as const,
                                point: maskNode.coverage.center,
                              },
                              {
                                kind: "radius" as const,
                                point: {
                                  x:
                                    maskNode.coverage.center.x +
                                    maskNode.coverage.radius.x,
                                  y:
                                    maskNode.coverage.center.y +
                                    maskNode.coverage.radius.y,
                                },
                              },
                            ].map(({ kind, point }) => (
                              <g
                                key={kind}
                                onPointerDown={(e) =>
                                  selectionDrag(
                                    e,
                                    placement,
                                    width,
                                    height,
                                    kind,
                                  )
                                }
                              >
                                <circle
                                  className="handle-hit"
                                  cx={point.x * width}
                                  cy={point.y * height}
                                  r={hitRadius}
                                />
                                <circle
                                  className="path-handle"
                                  cx={point.x * width}
                                  cy={point.y * height}
                                  r={handleRadius}
                                />
                              </g>
                            ))}
                          </>
                        )}
                        {maskNode.coverage.kind === "closed" && (
                          <>
                            <polygon
                              className="selection-edge"
                              points={maskNode.coverage.points
                                .map((p) => `${p.x * width},${p.y * height}`)
                                .join(" ")}
                              strokeWidth={
                                1.5 / (camera.scale * Math.abs(t.scaleX))
                              }
                            />
                            {maskNode.coverage.points.map((point, i) => (
                              <g
                                key={i}
                                onPointerDown={(e) =>
                                  selectionDrag(e, placement, width, height, i)
                                }
                              >
                                <circle
                                  className="handle-hit"
                                  cx={point.x * width}
                                  cy={point.y * height}
                                  r={hitRadius}
                                />
                                <circle
                                  className="path-handle"
                                  cx={point.x * width}
                                  cy={point.y * height}
                                  r={handleRadius / 1.5}
                                />
                              </g>
                            ))}
                          </>
                        )}
                        {ink.length > 0 &&
                          (maskNode.coverage.kind === "painted" ? (
                            ink.length === 1 ? (
                              <circle
                                className={`brush-ink ${brushMode}`}
                                cx={ink[0].x * width}
                                cy={ink[0].y * height}
                                r={(brushSize / 200) * Math.max(width, height)}
                              />
                            ) : (
                              <polyline
                                className={`brush-ink ${brushMode}`}
                                points={ink
                                  .map((p) => `${p.x * width},${p.y * height}`)
                                  .join(" ")}
                                strokeWidth={
                                  (brushSize / 100) * Math.max(width, height)
                                }
                              />
                            )
                          ) : (
                            <polyline
                              className="draw-ink"
                              points={ink
                                .map((p) => `${p.x * width},${p.y * height}`)
                                .join(" ")}
                              strokeWidth={
                                2 / (camera.scale * Math.abs(t.scaleX))
                              }
                            />
                          ))}
                      </svg>
                    )}
                  </section>
                );
              })}
            {doc.nodes
              .filter((n) => n.kind !== "image")
              .map((n) => {
                const selected =
                    selection?.kind === "node" && selection.id === n.id,
                  points = n.kind === "trajectory" ? n.points : null;
                const minX = points
                    ? Math.min(...points.map((p) => p.x)) - 20
                    : 0,
                  minY = points ? Math.min(...points.map((p) => p.y)) - 20 : 0,
                  maxX = points ? Math.max(...points.map((p) => p.x)) + 20 : 1,
                  maxY = points ? Math.max(...points.map((p) => p.y)) + 20 : 1;
                return (
                  <section
                    key={n.id}
                    className={`process-object ${selected || n.id === branchId ? "selected-process" : ""}`}
                    style={{ left: n.position.x, top: n.position.y }}
                  >
                    <button
                      className="process-label"
                      onPointerDown={(e) => moveNode(e, n)}
                      onClick={() => select({ kind: "node", id: n.id })}
                    >
                      <span>{n.name}</span>
                      <small>{outputType(n)}</small>
                    </button>
                    {n.kind === "trajectory" && points && (
                      <svg
                        className="process-preview"
                        viewBox={`${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`}
                        aria-hidden="true"
                      >
                        <path
                          d={`M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`}
                        />
                      </svg>
                    )}
                    {n.kind === "selection" && (
                      <div className="process-caption">
                        {n.coverage.kind === "painted"
                          ? `${n.coverage.painted.strokes.length} paint / erase strokes`
                          : n.coverage.kind === "closed"
                            ? `${n.coverage.points.length} boundary points`
                            : n.coverage.kind === "image"
                              ? "Imported luminance coverage"
                              : "Elliptical region"}
                      </div>
                    )}
                    {n.kind === "afterimage" && (
                      <div className="process-caption">
                        {n.params.count} exposures{" "}
                        <span>
                          {result.errors.has(n.id)
                            ? "Missing input"
                            : updating
                              ? "Updating"
                              : "Ready"}
                        </span>
                      </div>
                    )}
                  </section>
                );
              })}
          </div>
          <div className="view-controls">
            <button
              disabled={locked}
              onClick={() =>
                setCamera((c) =>
                  zoomAt(
                    c,
                    {
                      x: field.current!.clientWidth / 2,
                      y: field.current!.clientHeight / 2,
                    },
                    c.scale / 1.2,
                  ),
                )
              }
              aria-label="Zoom out"
            >
              −
            </button>
            <output>{Math.round(camera.scale * 100)}%</output>
            <button
              disabled={locked}
              onClick={() =>
                setCamera((c) =>
                  zoomAt(
                    c,
                    {
                      x: field.current!.clientWidth / 2,
                      y: field.current!.clientHeight / 2,
                    },
                    c.scale * 1.2,
                  ),
                )
              }
              aria-label="Zoom in"
            >
              +
            </button>
            <button disabled={locked} onClick={fitView}>
              Fit selection
            </button>
            <button onClick={() => setShowObjects((v) => !v)}>Objects</button>
            <button onClick={() => setShowInspector((v) => !v)}>
              Inspector
            </button>
            <button
              aria-pressed={proof === "dark"}
              onClick={() =>
                setProof((p) => (p === "paper" ? "dark" : "paper"))
              }
            >
              Dark proof
            </button>
          </div>
        </main>
        {showInspector && (
          <aside className="inspector" aria-label="Contextual inspector">
            <div className="panel-heading">
              <h2>
                {multipleArtwork
                  ? `${selectedArtworkIds.length} artworks`
                  : currentPlacement
                    ? "Artwork"
                    : currentNode
                      ? currentNode.kind === "image"
                        ? "Photograph"
                        : currentNode.kind === "afterimage"
                          ? "AFTERIMAGE"
                          : currentNode.kind === "trajectory"
                            ? "Trajectory"
                            : "Selection"
                      : "Field"}
              </h2>
              <button className="quiet" onClick={() => setShowInspector(false)}>
                Hide
              </button>
            </div>
            {multipleArtwork && (
              <section className="inspector-section">
                <h3>Align selection</h3>
                <p className="control-help">
                  Align to the combined bounds of the selected artwork. Rotated
                  and reflected images use their transformed image rectangles.
                </p>
                <div className="action-pair">
                  {(
                    [
                      ["left", "Left edges"],
                      ["right", "Right edges"],
                      ["center-x", "Horizontal centres"],
                      ["center-y", "Vertical centres"],
                      ["top", "Top edges"],
                      ["bottom", "Bottom edges"],
                    ] as [Alignment, string][]
                  ).map(([alignment, label]) => (
                    <button
                      key={alignment}
                      disabled={locked || !alignmentReady}
                      onClick={() => alignSelected(alignment)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!alignmentReady && (
                  <p className="control-help">
                    All selected outputs must render before alignment is
                    available.
                  </p>
                )}
                <p className="control-help">
                  Drag any selected image to move them together. Shift-click an
                  image or its Objects entry to add or remove it. Arrow keys on
                  an artwork label nudge the selection; Shift nudges by 10.
                  Escape clears the selection.
                </p>
                <div className="action-pair">
                  <button disabled={locked} onClick={() => select(null)}>
                    Clear selection
                  </button>
                  <button
                    className="danger"
                    disabled={locked}
                    onClick={deleteSelection}
                  >
                    Remove selected
                  </button>
                </div>
              </section>
            )}
            {currentPlacement && !multipleArtwork && (
              <section className="inspector-section">
                <NameField
                  value={currentPlacement.name}
                  label="Artwork name"
                  disabled={locked}
                  onCommit={(name) =>
                    patchPlacement(
                      currentPlacement.id,
                      "Rename artwork",
                      (p) => {
                        p.name = name;
                      },
                    )
                  }
                />
                <div className="number-grid">
                  <NumberField
                    label="Position X"
                    value={currentPlacement.transform.x}
                    disabled={locked}
                    onCommit={(n) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Move artwork",
                        (p) => {
                          p.transform.x = n;
                        },
                      )
                    }
                  />
                  <NumberField
                    label="Position Y"
                    value={currentPlacement.transform.y}
                    disabled={locked}
                    onCommit={(n) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Move artwork",
                        (p) => {
                          p.transform.y = n;
                        },
                      )
                    }
                  />
                  <NumberField
                    label="Scale X"
                    step={0.05}
                    min={-8}
                    max={8}
                    value={currentPlacement.transform.scaleX}
                    disabled={locked}
                    onCommit={(n) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Scale artwork",
                        (p) => {
                          p.transform.scaleX = n;
                        },
                      )
                    }
                  />
                  <NumberField
                    label="Scale Y"
                    step={0.05}
                    min={-8}
                    max={8}
                    value={currentPlacement.transform.scaleY}
                    disabled={locked}
                    onCommit={(n) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Scale artwork",
                        (p) => {
                          p.transform.scaleY = n;
                        },
                      )
                    }
                  />
                </div>
                <NumberField
                  label="Rotation °"
                  value={currentPlacement.transform.rotation}
                  disabled={locked}
                  onCommit={(n) =>
                    patchPlacement(
                      currentPlacement.id,
                      "Rotate artwork",
                      (p) => {
                        const raster = result.outputs.get(p.nodeId);
                        if (!raster)
                          throw Error("Render the artwork before rotating it.");
                        p.transform = rotateArtwork(
                          p.transform,
                          raster.width,
                          raster.height,
                          n,
                        );
                      },
                    )
                  }
                />
                <NumberField
                  label="Opacity %"
                  min={0}
                  max={100}
                  value={placementOpacity(currentPlacement) * 100}
                  disabled={locked}
                  onCommit={(n) =>
                    patchPlacement(
                      currentPlacement.id,
                      "Change artwork opacity",
                      (p) => {
                        p.opacity = n / 100;
                      },
                    )
                  }
                />
                <h3>Layer order</h3>
                <div className="action-pair">
                  <button
                    disabled={
                      locked || placementIndex === doc.placements.length - 1
                    }
                    onClick={() => changeOrder("front")}
                  >
                    Bring to front
                  </button>
                  <button
                    disabled={locked || placementIndex === 0}
                    onClick={() => changeOrder("back")}
                  >
                    Send to back
                  </button>
                  <button
                    disabled={
                      locked || placementIndex === doc.placements.length - 1
                    }
                    onClick={() => changeOrder("forward")}
                  >
                    Forward one
                  </button>
                  <button
                    disabled={locked || placementIndex === 0}
                    onClick={() => changeOrder("backward")}
                  >
                    Back one
                  </button>
                </div>
                <p className="control-help">
                  The Objects list reads front to back. Layer order and opacity
                  apply to this placement, including export; linked copies keep
                  their own composition settings. At 0% the artwork stays
                  selectable but contributes nothing to export.
                </p>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={currentPlacement.included}
                    disabled={locked}
                    onChange={(e) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Change export membership",
                        (p) => {
                          p.included = e.target.checked;
                        },
                      )
                    }
                  />
                  Include in export
                </label>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={currentPlacement.visible}
                    disabled={locked}
                    onChange={(e) =>
                      patchPlacement(
                        currentPlacement.id,
                        "Change artwork visibility",
                        (p) => {
                          p.visible = e.target.checked;
                        },
                      )
                    }
                  />
                  Visible in field
                </label>
                <div className="action-pair">
                  <button
                    disabled={locked}
                    onClick={() => {
                      const id = uuid();
                      execute("Place linked copy", (d) =>
                        linkedCopy(d, currentPlacement.id, id),
                      );
                      setSelection({ kind: "placement", id });
                      setNotice(
                        "Linked copy placed. Both views follow the same operation.",
                      );
                    }}
                  >
                    Linked copy
                  </button>
                  <button
                    disabled={locked || currentNode?.kind !== "afterimage"}
                    onClick={() => {
                      let id = "";
                      execute("Make independent variation", (d) => {
                        const varied = independentVariation(
                          d,
                          currentPlacement.id,
                          uuid,
                        );
                        id = varied.placementId;
                        return varied.document;
                      });
                      if (id) {
                        setSelection({ kind: "placement", id });
                        setBranchId(
                          commands.current.state.placements.find(
                            (p) => p.id === id,
                          )!.nodeId,
                        );
                        setNotice(
                          "Independent variation created. Editable upstream objects copied; immutable photograph bytes shared.",
                        );
                      }
                    }}
                  >
                    Vary
                  </button>
                </div>
                <p className="control-help">
                  Rotation turns around the artwork centre. Hold Shift while
                  resizing to preserve proportions. Artwork transforms affect
                  composition and export. Linked copies share a process;
                  variations have independent guides.
                </p>
                <button
                  className="danger"
                  disabled={locked}
                  onClick={deleteSelection}
                >
                  Remove this placement
                </button>
              </section>
            )}
            {currentNode && !multipleArtwork && (
              <section className="inspector-section">
                <h3>{currentPlacement ? "Process" : "Object"}</h3>
                <NameField
                  value={currentNode.name}
                  label="Object name"
                  disabled={locked}
                  onCommit={(name) =>
                    patchNode(currentNode.id, "Rename object", (n) => {
                      n.name = name;
                    })
                  }
                />
                {!currentPlacement && currentNode.kind !== "image" && (
                  <>
                    <div className="number-grid">
                      <NumberField
                        label="Station X"
                        value={currentNode.position.x}
                        disabled={locked}
                        onCommit={(v) =>
                          patchNode(currentNode.id, "Arrange station", (n) => {
                            n.position.x = v;
                          })
                        }
                      />
                      <NumberField
                        label="Station Y"
                        value={currentNode.position.y}
                        disabled={locked}
                        onCommit={(v) =>
                          patchNode(currentNode.id, "Arrange station", (n) => {
                            n.position.y = v;
                          })
                        }
                      />
                    </div>
                    <p className="control-help">
                      Station positions arrange the process diagram. They do not
                      change the artwork.
                    </p>
                  </>
                )}
                {currentNode.kind === "image" && (
                  <>
                    <p className="control-help">
                      {
                        doc.assets.find((a) => a.id === currentNode.assetId)
                          ?.width
                      }{" "}
                      ×{" "}
                      {
                        doc.assets.find((a) => a.id === currentNode.assetId)
                          ?.height
                      }{" "}
                      pixels. Original bytes stay embedded in the project.
                    </p>
                    <button disabled={locked} onClick={createOperation}>
                      Create AFTERIMAGE from this source
                    </button>
                    <label className="control-help">
                      When replacing this source
                      <select
                        aria-label="Replacement geometry"
                        disabled={locked}
                        value={replacePolicy}
                        onChange={(e) =>
                          setReplacePolicy(e.target.value as "scale" | "keep")
                        }
                      >
                        <option value="scale">
                          Scale direct trajectories and frames
                        </option>
                        <option value="keep">
                          Keep source-space coordinates
                        </option>
                      </select>
                    </label>
                    <p className="control-help">
                      Replacement affects every process connected to this
                      source. Variations have independent source objects.
                      Selections keep their relative position; artwork placement
                      stays fixed.
                    </p>
                    <button
                      disabled={locked}
                      onClick={() => replaceInput.current?.click()}
                    >
                      Replace photograph
                    </button>
                  </>
                )}
                {!currentPlacement && (
                  <button
                    className="danger"
                    disabled={locked}
                    onClick={deleteSelection}
                  >
                    Delete object and its views
                  </button>
                )}
              </section>
            )}
            {operation?.kind === "afterimage" && !multipleArtwork && (
              <section className="inspector-section">
                <h3>Exposures</h3>
                <div className="number-grid">
                  <NumberField
                    label="Count"
                    min={1}
                    max={64}
                    value={operation.params.count}
                    disabled={locked}
                    onCommit={(n) => changeParameter("count", n)}
                  />
                  <NumberField
                    label="Opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={operation.params.opacity}
                    disabled={locked}
                    onCommit={(n) => changeParameter("opacity", n)}
                  />
                  <NumberField
                    label="Falloff"
                    min={0}
                    max={2}
                    step={0.05}
                    value={operation.params.falloff}
                    disabled={locked}
                    onCommit={(n) => changeParameter("falloff", n)}
                  />
                  <NumberField
                    label="Distribution"
                    min={0.2}
                    max={4}
                    step={0.1}
                    value={operation.params.distribution}
                    disabled={locked}
                    onCommit={(n) => changeParameter("distribution", n)}
                  />
                </div>
                <label className="select-control">
                  Accumulation
                  <select
                    value={operation.params.mode}
                    disabled={locked}
                    onChange={(e) =>
                      changeParameter("mode", e.target.value as Params["mode"])
                    }
                  >
                    <option value="ghosts">Ordered ghosts</option>
                    <option value="exposure">Normalized exposure</option>
                  </select>
                </label>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={operation.params.follow}
                    disabled={locked}
                    onChange={(e) =>
                      changeParameter("follow", e.target.checked)
                    }
                  />
                  Follow trajectory direction
                </label>
                <div className="number-grid">
                  <NumberField
                    label="Variation"
                    min={0}
                    max={1000}
                    value={operation.params.jitter}
                    disabled={locked}
                    onCommit={(n) => changeParameter("jitter", n)}
                  />
                  <NumberField
                    label="Locked seed"
                    min={0}
                    max={4294967295}
                    value={operation.params.seed}
                    disabled={locked}
                    onCommit={(n) => changeParameter("seed", n)}
                  />
                </div>
                <button
                  disabled={locked}
                  onClick={() =>
                    changeParameter(
                      "seed",
                      crypto.getRandomValues(new Uint32Array(1))[0],
                    )
                  }
                >
                  New seed
                </button>
                <div className="action-pair">
                  <button
                    disabled={locked}
                    aria-pressed={mode === "trajectory"}
                    onClick={() => setMode("trajectory")}
                  >
                    Edit trajectory
                  </button>
                  <button
                    disabled={locked || !maskNode}
                    aria-pressed={mode === "selection"}
                    onClick={() => {
                      setMode("selection");
                      if (inputPlacement)
                        setSelection({
                          kind: "placement",
                          id: inputPlacement.id,
                        });
                    }}
                  >
                    Edit selection
                  </button>
                </div>
                <details>
                  <summary>Output frame</summary>
                  <p className="control-help">
                    The operation frame controls which source-space area is
                    rendered. Export automatically fits the included artwork.
                  </p>
                  {operation.frame ? (
                    <>
                      <div className="number-grid">
                        {(["x", "y", "width", "height"] as const).map((key) => (
                          <NumberField
                            key={key}
                            label={`Output ${key}`}
                            value={operation.frame![key]}
                            disabled={locked}
                            min={
                              key === "width" || key === "height"
                                ? 1
                                : undefined
                            }
                            onCommit={(v) =>
                              patchNode(
                                operation.id,
                                "Edit output frame",
                                (n) => {
                                  if (n.kind === "afterimage" && n.frame)
                                    n.frame[key] = v;
                                },
                              )
                            }
                          />
                        ))}
                      </div>
                      <button
                        disabled={locked}
                        onClick={() =>
                          patchNode(
                            operation.id,
                            "Fit operation frame",
                            (n) => {
                              if (n.kind === "afterimage") n.frame = null;
                            },
                          )
                        }
                      >
                        Fit operation frame
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={locked || !result.outputs.get(operation.id)}
                      onClick={() =>
                        patchNode(operation.id, "Fix operation frame", (n) => {
                          if (n.kind === "afterimage")
                            n.frame = {
                              ...result.outputs.get(n.id)!.region,
                            };
                        })
                      }
                    >
                      Keep current frame
                    </button>
                  )}
                </details>
              </section>
            )}
            {actualPath &&
              operation?.kind === "afterimage" &&
              !multipleArtwork && (
                <section className="inspector-section">
                  <details
                    open={
                      currentNode?.kind === "trajectory" ||
                      mode === "trajectory"
                    }
                  >
                    <summary>Trajectory points</summary>
                    <p className="control-help">
                      Draw over the output or edit source-space coordinates. One
                      smooth cubic is retained.
                    </p>
                    {actualPath.map((p, i) => (
                      <div className="number-grid path-row" key={i}>
                        <NumberField
                          label={`Point ${i + 1} X`}
                          value={p.x}
                          disabled={locked}
                          onCommit={(v) =>
                            execute("Shape trajectory", (d) => {
                              const n = d.nodes.find(
                                (n) => n.id === pathNode?.id,
                              );
                              if (n?.kind === "trajectory") n.points[i].x = v;
                              else {
                                const op = d.nodes.find(
                                  (n) => n.id === operation.id,
                                );
                                if (op?.kind === "afterimage")
                                  op.params.path[i].x = v;
                              }
                            })
                          }
                        />
                        <NumberField
                          label={`Point ${i + 1} Y`}
                          value={p.y}
                          disabled={locked}
                          onCommit={(v) =>
                            execute("Shape trajectory", (d) => {
                              const n = d.nodes.find(
                                (n) => n.id === pathNode?.id,
                              );
                              if (n?.kind === "trajectory") n.points[i].y = v;
                              else {
                                const op = d.nodes.find(
                                  (n) => n.id === operation.id,
                                );
                                if (op?.kind === "afterimage")
                                  op.params.path[i].y = v;
                              }
                            })
                          }
                        />
                      </div>
                    ))}
                  </details>
                </section>
              )}
            {maskNode?.kind === "selection" && !multipleArtwork && (
              <section className="inspector-section">
                <h3>Selection</h3>
                <label className="select-control">
                  Selection shape
                  <select
                    value={maskNode.coverage.kind}
                    disabled={locked}
                    onChange={(e) => {
                      const kind = e.target.value;
                      if (kind === "painted")
                        editMask({
                          kind: "painted",
                          painted: {
                            enabled: true,
                            base: "empty",
                            strokes: [],
                          },
                        });
                      if (kind === "ellipse")
                        editMask({
                          kind: "ellipse",
                          center: { x: 0.5, y: 0.5 },
                          radius: { x: 0.46, y: 0.48 },
                        });
                      if (kind === "closed")
                        editMask({
                          kind: "closed",
                          points: [
                            { x: 0.2, y: 0.2 },
                            { x: 0.8, y: 0.2 },
                            { x: 0.5, y: 0.8 },
                          ],
                        });
                      if (kind === "image") maskInput.current?.click();
                      setMode("selection");
                    }}
                  >
                    <option value="ellipse">Elliptical region</option>
                    <option value="painted">Painted subject</option>
                    <option value="closed">Closed boundary</option>
                    <option value="image">Imported grayscale image</option>
                  </select>
                </label>
                <NumberField
                  label="Selection feather"
                  min={0.001}
                  max={0.5}
                  step={0.01}
                  value={maskNode.feather}
                  disabled={locked}
                  onCommit={(v) =>
                    patchNode(maskNode.id, "Feather selection", (n) => {
                      if (n.kind === "selection") n.feather = v;
                    })
                  }
                />
                {maskNode.coverage.kind === "painted" && (
                  <>
                    <div className="action-pair">
                      <button
                        disabled={locked}
                        aria-pressed={brushMode === "paint"}
                        onClick={() => {
                          setBrushMode("paint");
                          setMode("selection");
                        }}
                      >
                        Paint
                      </button>
                      <button
                        disabled={locked}
                        aria-pressed={brushMode === "erase"}
                        onClick={() => {
                          setBrushMode("erase");
                          setMode("selection");
                        }}
                      >
                        Erase
                      </button>
                    </div>
                    <NumberField
                      label="Brush diameter %"
                      min={1}
                      max={40}
                      value={brushSize}
                      disabled={locked}
                      onCommit={setBrushSize}
                    />
                    <div className="action-pair">
                      <button
                        disabled={locked}
                        onClick={() =>
                          editMask({
                            kind: "painted",
                            painted: {
                              enabled: true,
                              base: "full",
                              strokes: [],
                            },
                          })
                        }
                      >
                        Reveal all
                      </button>
                      <button
                        disabled={locked}
                        onClick={() =>
                          editMask({
                            kind: "painted",
                            painted: {
                              enabled: true,
                              base: "empty",
                              strokes: [],
                            },
                          })
                        }
                      >
                        Clear selection
                      </button>
                    </div>
                    <p className="control-help">
                      Paint on the input artwork. Manual selection, up to 64
                      strokes and 512 points; masks use a 1024px raster.
                    </p>
                  </>
                )}
                {maskNode.coverage.kind === "closed" && (
                  <p className="control-help">
                    Draw a closed boundary on the input. The last point connects
                    to the first. Move vertices to refine it.
                  </p>
                )}
                {maskNode.coverage.kind === "ellipse" && (
                  <div className="number-grid">
                    <NumberField
                      label="Center X %"
                      value={maskNode.coverage.center.x * 100}
                      disabled={locked}
                      onCommit={(v) =>
                        patchNode(maskNode.id, "Move selection", (n) => {
                          if (
                            n.kind === "selection" &&
                            n.coverage.kind === "ellipse"
                          )
                            n.coverage.center.x = v / 100;
                        })
                      }
                    />
                    <NumberField
                      label="Center Y %"
                      value={maskNode.coverage.center.y * 100}
                      disabled={locked}
                      onCommit={(v) =>
                        patchNode(maskNode.id, "Move selection", (n) => {
                          if (
                            n.kind === "selection" &&
                            n.coverage.kind === "ellipse"
                          )
                            n.coverage.center.y = v / 100;
                        })
                      }
                    />
                    <NumberField
                      label="Radius X %"
                      value={maskNode.coverage.radius.x * 100}
                      min={0.5}
                      disabled={locked}
                      onCommit={(v) =>
                        patchNode(maskNode.id, "Resize selection", (n) => {
                          if (
                            n.kind === "selection" &&
                            n.coverage.kind === "ellipse"
                          )
                            n.coverage.radius.x = v / 100;
                        })
                      }
                    />
                    <NumberField
                      label="Radius Y %"
                      value={maskNode.coverage.radius.y * 100}
                      min={0.5}
                      disabled={locked}
                      onCommit={(v) =>
                        patchNode(maskNode.id, "Resize selection", (n) => {
                          if (
                            n.kind === "selection" &&
                            n.coverage.kind === "ellipse"
                          )
                            n.coverage.radius.y = v / 100;
                        })
                      }
                    />
                  </div>
                )}
                <button
                  disabled={locked}
                  onClick={() => maskInput.current?.click()}
                >
                  Import selection image
                </button>
                {!inputPlacement && imageEdge && (
                  <button
                    disabled={locked}
                    onClick={() =>
                      execute("Place input reference", (d) => {
                        d.placements.push({
                          id: uuid(),
                          nodeId: imageEdge.from,
                          name: "Input reference",
                          transform: {
                            x: 60,
                            y: 80,
                            scaleX: 0.6,
                            scaleY: 0.6,
                            rotation: 0,
                          },
                          visible: true,
                          included: false,
                        });
                      })
                    }
                  >
                    Show input for selection editing
                  </button>
                )}
              </section>
            )}
            {connectionTargets && !multipleArtwork && (
              <section className="inspector-section">
                <details
                  open={currentNode?.kind === "afterimage" && !currentPlacement}
                >
                  <summary>Connections</summary>
                  <p className="control-help">
                    Connect compatible objects. Shared guides update every
                    connected operation. Cycles are rejected.
                  </p>
                  {(["image", "trajectory", "selection"] as Port[]).map(
                    (port) => {
                      const edge = doc.edges.find(
                          (e) =>
                            e.to === connectionTargets.id && e.input === port,
                        ),
                        expected =
                          port === "image"
                            ? "Image2D"
                            : port === "trajectory"
                              ? "Path2D"
                              : "Mask2D";
                      return (
                        <label key={port} className="select-control">
                          {expected} input
                          <select
                            aria-label={`${expected} input`}
                            disabled={locked}
                            value={edge?.from ?? ""}
                            onChange={(e) =>
                              execute("Change connection", (d) =>
                                e.target.value
                                  ? connect(d, {
                                      from: e.target.value,
                                      to: connectionTargets.id,
                                      input: port,
                                    })
                                  : {
                                      ...d,
                                      edges: d.edges.filter(
                                        (v) =>
                                          v.to !== connectionTargets.id ||
                                          v.input !== port,
                                      ),
                                    },
                              )
                            }
                          >
                            <option value="">
                              {port === "image"
                                ? "Missing image"
                                : port === "trajectory"
                                  ? "Use stored trajectory"
                                  : "No selection mask"}
                            </option>
                            {doc.nodes
                              .filter(
                                (n) =>
                                  n.id !== connectionTargets.id &&
                                  outputType(n) === expected,
                              )
                              .map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      );
                    },
                  )}
                </details>
              </section>
            )}
            <section className="inspector-section">
              <h3>Export</h3>
              <p className="control-help">
                Export fits all visible artwork included in the output. The
                canvas stays open; reference material and process controls stay
                outside the PNG.
              </p>
              <div className="action-pair">
                <button
                  disabled={locked}
                  onClick={() => void exportArtwork(2048)}
                >
                  Export 2K
                </button>
                <button disabled={locked} onClick={() => void exportArtwork()}>
                  Export 4K
                </button>
              </div>
            </section>
            {!selection && (
              <section className="inspector-section">
                <p>
                  Select artwork to transform it, or a process object to inspect
                  its inputs. Draw trajectories on outputs and selections on
                  their inputs.
                </p>
                <p>
                  Linked copies follow the same process. Vary creates an
                  independent operation with copied guides.
                </p>
              </section>
            )}
            <section className="inspector-section">
              <details>
                <summary>Project and rendering</summary>
                <p className="control-help">
                  {doc.nodes.length} objects, {doc.placements.length}{" "}
                  placements, {doc.assets.length} embedded images. Local
                  recovery is browser storage; download your .form file for a
                  portable copy.
                </p>
                <p className="control-help">{recoveryState}</p>
                <button
                  disabled={locked}
                  onClick={() => {
                    setBusy(true);
                    void evaluator.current
                      .reset()
                      .then(() => {
                        setEpoch((n) => n + 1);
                        setNotice(
                          "Rendering resources rebuilt from the document.",
                        );
                      })
                      .catch((e) => setError(friendly(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Restore rendering
                </button>
                <button
                  disabled={locked || updating}
                  onClick={() => void runChecks()}
                >
                  Run rendering checks
                </button>
                {checks && <pre>{JSON.stringify(checks, null, 2)}</pre>}
                <a href="/?legacy=1" target="_blank" rel="noreferrer">
                  Open earlier study prototype
                </a>
              </details>
            </section>
          </aside>
        )}
      </div>
      <footer className="status-strip">
        <span role="status" aria-live="polite">
          {notice}
        </span>
        <span>
          {busy
            ? abortExport.current
              ? `Export ${Math.round(progress * 100)}%`
              : "Working"
            : updating
              ? "Updating previews"
              : `${result.rendered} rendered / ${result.cacheHits} reused`}
        </span>
        {busy && abortExport.current && (
          <button onClick={() => abortExport.current?.abort()}>Cancel</button>
        )}
        <span className="recovery-status">{recoveryState}</span>
      </footer>
      <input
        ref={replaceInput}
        type="file"
        hidden
        accept="image/jpeg,image/png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void replacePhoto(file);
        }}
      />
      <input
        ref={photoInput}
        type="file"
        hidden
        accept="image/jpeg,image/png"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importPhoto(f);
        }}
      />
      <input
        ref={maskInput}
        type="file"
        hidden
        accept="image/jpeg,image/png"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importPhoto(f, true);
        }}
      />
      <input
        ref={projectInput}
        type="file"
        hidden
        accept=".form"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void open(f);
        }}
      />
      <dialog
        ref={dialog}
        className="project-dialog"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) dismissProject();
        }}
      >
        <h2>
          {pending === "new" ? "Start an empty field?" : "Open this project?"}
        </h2>
        <p>
          {pending === "new"
            ? "Current work will be replaced and local recovery cleared. Download a .form file first to keep it."
            : "The project and embedded images have been validated. Opening replaces this field and starts a fresh undo history. Keep your current .form file if needed."}
        </p>
        {pending && pending !== "new" && (
          <p>
            {pending.document.name} · {pending.document.nodes.length} objects ·{" "}
            {pending.document.placements.length} placements
          </p>
        )}
        <div className="dialog-actions">
          <button disabled={busy} onClick={dismissProject}>
            Keep current field
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (pending === "new") void newProject();
              else if (pending) {
                setBusy(true);
                void acceptProject(pending)
                  .catch((e) => setError(friendly(e)))
                  .finally(() => setBusy(false));
              }
            }}
          >
            {pending === "new" ? "Start new field" : "Open project"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<FieldApp />);
