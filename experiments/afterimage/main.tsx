import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo";
import "./style.css";
import {
  defaults,
  sample,
  captureFor as fitCapture,
  clone,
  validateParams,
} from "./core";
import type { Params, Point, Rect } from "./core";
import { TrajectoryStroke, fitTrajectory } from "./trajectory";
import {
  MaskStrokeBuilder,
  appendMaskStroke,
  MAX_MASK_POINTS,
  MAX_MASK_STROKES,
} from "./mask";
import { rasterizeMask } from "./mask-raster";
import {
  createDocument,
  studyFromDocument,
  sha256,
  imageMime,
} from "../../src/core/project";
import type {
  Camera,
  FormDocument,
  StudyState,
  Presentation,
} from "../../src/core/project";
import {
  encodeWorkspace,
  decodeWorkspace,
  duplicateStudy,
  validateWorkspace,
  MAX_STUDIES,
  MAX_WORKSPACE_BYTES,
} from "../../src/core/workspace";
import type { WorkspaceDocument } from "../../src/core/workspace";
import { StudyCommands, authoringFromStudy } from "../../src/core/commands";
import type { AuthoringState, StudyEdit } from "../../src/core/commands";
import { AfterimageRenderer } from "./renderer";
import { exportPNG, download } from "./export";

type ImageSource = {
  image: HTMLImageElement;
  url: string;
  name: string;
  width: number;
  height: number;
  ownedURL: boolean;
  bytes: Uint8Array;
  hash: string;
  mime: "image/jpeg" | "image/png";
};
type Metrics = {
  draw: number;
  elapsed: number;
  capabilities: ReturnType<AfterimageRenderer["capabilities"]>;
};
type RuntimeStudy = {
  id: string;
  source: ImageSource;
  commands: StudyCommands;
  presentation: Presentation;
  thumbnail: string | null;
};
type PreparedProject = {
  document: WorkspaceDocument;
  studies: RuntimeStudy[];
  legacy: boolean;
};
function workspaceDocument(
  projectId: string,
  name: string,
  activeStudyId: string,
  studies: RuntimeStudy[],
  live?: Presentation,
): WorkspaceDocument {
  const document: WorkspaceDocument = {
    format: "form",
    formatVersion: 2,
    projectId,
    name,
    activeStudyId,
    studies: studies.map((s) => ({
      id: s.id,
      document: createDocument(
        projectId,
        {
          ...s.commands.state,
          presentation: live && s.id === activeStudyId ? live : s.presentation,
        },
        {
          id: s.source.hash,
          sha256: s.source.hash,
          path: `assets/${s.source.hash}.${s.source.mime === "image/jpeg" ? "jpg" : "png"}`,
          mime: s.source.mime,
          byteLength: s.source.bytes.length,
          width: s.source.width,
          height: s.source.height,
          name: s.source.name,
        },
      ),
    })),
  };
  validateWorkspace(document);
  return document;
}
function thumbnail(canvas: HTMLCanvasElement): string {
  const small = document.createElement("canvas");
  small.width = small.height = 192;
  small.getContext("2d")!.drawImage(canvas, 0, 0, 192, 192);
  return small.toDataURL("image/png");
}
const captureFor = (p: Params, s: ImageSource) =>
  fitCapture(p, s.width, s.height);
const imageURL = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(Error("The image could not be decoded. Try a JPEG or PNG."));
    i.src = url;
  });
const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));
type RangeProps = {
  name: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  onValue: (value: number) => void;
};
function Range({
  name,
  label,
  min,
  max,
  step = 1,
  value,
  onStart,
  onEnd,
  onCancel,
  onValue,
}: RangeProps) {
  return (
    <label className="parameter">
      <span>
        {label}
        <output>{value.toFixed(step < 1 ? 2 : 0)}</output>
      </span>
      <input
        name={name}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={(e) => {
          onStart();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => onEnd()}
        onPointerCancel={onCancel}
        onLostPointerCapture={onCancel}
        onBlur={onEnd}
        onChange={(e) => onValue(Number(e.target.value))}
      />
    </label>
  );
}
function StudyName({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={160}
      disabled={disabled}
      onFocus={() => {
        cancelled.current = false;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current) {
          setDraft(value);
          return;
        }
        const name = draft.trim() || value;
        setDraft(name);
        onCommit(name);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
const initialAuthoring = (): AuthoringState => ({
  name: "Afterimage study",
  params: defaults(391, 623),
  positions: {
    source: { x: 66, y: 218 },
    operation: { x: 346, y: 292 },
    result: { x: 600, y: 68 },
  },
  capture: { x: 0, y: 0, width: 1000, height: 1000 },
  connected: true,
});
function App() {
  const [source, setSource] = useState<ImageSource | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("Loading the source study…"),
    [mode, setMode] = useState<"path" | "mask" | "arrange">("mask"),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [showChecks, setShowChecks] = useState(false),
    [checks, setChecks] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [proof, setProof] = useState<"paper" | "dark">("paper");
  const [authored, setAuthored] = useState<AuthoringState>(initialAuthoring);
  const [drawArmed, setDrawArmed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [brushMode, setBrushMode] = useState<"paint" | "erase">("paint");
  const [brushSize, setBrushSize] = useState(12);
  const [brushPoints, setBrushPoints] = useState<Point[]>([]);
  const drawingCancel = useRef<(() => void) | null>(null);
  const commands = useRef<StudyCommands | null>(null);
  if (!commands.current) commands.current = new StudyCommands(authored);
  const [commandStatus, setCommandStatus] = useState(commands.current.status);
  const {
    params,
    positions,
    connected,
    name: studyName,
    capture: captureFrame,
  } = authored;
  const painted = Boolean(params.paintedMask?.enabled);
  const paintedPreview = useMemo(
    () =>
      source && painted && params.paintedMask
        ? rasterizeMask(
            params.paintedMask,
            source.width,
            source.height,
            params.feather,
          ).toDataURL("image/png")
        : null,
    [params.paintedMask, params.feather, source, painted],
  );
  const studies = useRef<RuntimeStudy[]>([]);
  const [studyViews, setStudyViews] = useState<
    {
      id: string;
      name: string;
      thumbnail: string | null;
      proof: "paper" | "dark";
    }[]
  >([]);
  const [activeStudyId, setActiveStudyId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [projectName, setProjectName] = useState("Afterimage project");
  const filePurpose = useRef<"add" | "replace">("add");
  const ownedURLs = useRef(new Set<string>());
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID()),
    [exportedSignature, setExportedSignature] = useState<string | null>(null),
    [pendingProject, setPendingProject] = useState<PreparedProject | null>(
      null,
    );
  const [pendingNew, setPendingNew] = useState(false);
  const [camera, setCamera] = useState<Camera>({ x: 45, y: 30, scale: 0.8 }),
    [selected, setSelected] = useState<"source" | "operation" | "result">(
      "result",
    );
  const canvas = useRef<HTMLCanvasElement>(null),
    field = useRef<HTMLDivElement>(null),
    engine = useRef<AfterimageRenderer | null>(null),
    exportEngine = useRef<AfterimageRenderer | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    openDialog = useRef<HTMLDialogElement>(null),
    loadId = useRef(0),
    abort = useRef<AbortController | null>(null),
    space = useRef(false);
  const capture: Rect = captureFrame ?? {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  };
  const study: StudyState = {
    name: studyName,
    params,
    positions,
    capture,
    connected,
    presentation: { camera, mode, proof },
  };
  const workspaceSnapshot = studies.current.length
    ? workspaceDocument(
        projectId,
        projectName,
        activeStudyId,
        studies.current,
        { camera, mode, proof },
      )
    : null;
  const signature = JSON.stringify(workspaceSnapshot);
  const changed = Boolean(source) && signature !== exportedSignature;
  const current = useRef({
    params,
    source,
    connected,
    capture,
    study,
    signature,
    projectId,
    busy,
    drawing,
    pending: Boolean(pendingProject) || pendingNew,
    workspace: workspaceSnapshot,
    activeStudyId,
  });
  current.current = {
    params,
    source,
    connected,
    capture,
    study,
    signature,
    projectId,
    busy,
    drawing,
    pending: Boolean(pendingProject) || pendingNew,
    workspace: workspaceSnapshot,
    activeStudyId,
  };
  function publishStudies() {
    setStudyViews(
      studies.current.map((s) => ({
        id: s.id,
        name: s.commands.state.name,
        thumbnail: s.thumbnail,
        proof:
          s.id === current.current.activeStudyId
            ? current.current.study.presentation.proof
            : s.presentation.proof,
      })),
    );
  }
  function ownedURL(blob: Blob) {
    const url = URL.createObjectURL(blob);
    ownedURLs.current.add(url);
    return url;
  }
  function revoke(url: string) {
    if (ownedURLs.current.delete(url)) URL.revokeObjectURL(url);
  }
  function disposeSources(records: RuntimeStudy[]) {
    for (const s of records) if (s.source.ownedURL) revoke(s.source.url);
  }
  function stashActive() {
    const active = studies.current.find(
      (s) => s.id === current.current.activeStudyId,
    );
    if (active)
      active.presentation = structuredClone(current.current.study.presentation);
  }
  function activateStudy(record: RuntimeStudy) {
    drawingCancel.current?.();
    setDrawArmed(false);
    commands.current = record.commands;
    syncCommands();
    setSource(record.source);
    setActiveStudyId(record.id);
    setCamera({ ...record.presentation.camera });
    setMode(record.presentation.mode);
    setProof(record.presentation.proof);
    setChecks(null);
    publishStudies();
  }
  function selectStudy(id: string) {
    if (
      current.current.busy ||
      current.current.drawing ||
      current.current.pending ||
      id === current.current.activeStudyId
    )
      return;
    commitGesture();
    stashActive();
    const record = studies.current.find((s) => s.id === id);
    if (!record) return;
    activateStudy(record);
    setNotice(`Editing ${record.commands.state.name}.`);
  }
  function startNewProject() {
    setError("");
    const image = current.current.source;
    if (!image) return;
    const initial = defaults(image.width, image.height),
      id = crypto.randomUUID(),
      record: RuntimeStudy = {
        id,
        source: image,
        commands: new StudyCommands({
          ...initialAuthoring(),
          params: initial,
          capture: captureFor(initial, image),
        }),
        presentation: { camera: { ...camera }, mode: "mask", proof: "paper" },
        thumbnail: null,
      };
    const previous = studies.current;
    studies.current = [record];
    setProjectId(crypto.randomUUID());
    setProjectName("Afterimage project");
    setExportedSignature(null);
    setPendingNew(false);
    activateStudy(record);
    fit();
    for (const old of previous)
      if (old.source.ownedURL && old.source.url !== image.url)
        revoke(old.source.url);
    setNotice("New project started with the selected photograph.");
  }
  function requestNewProject() {
    if (busy || drawing || current.current.pending || !source) return;
    commitGesture();
    if (changed) setPendingNew(true);
    else startNewProject();
  }
  function duplicateCurrentStudy() {
    if (
      current.current.busy ||
      current.current.drawing ||
      current.current.pending ||
      !current.current.workspace
    )
      return;
    try {
      commitGesture();
      stashActive();
      const snapshot = workspaceDocument(
        current.current.projectId,
        projectName,
        current.current.activeStudyId,
        studies.current,
      );
      const id = crypto.randomUUID(),
        next = duplicateStudy(snapshot, current.current.activeStudyId, id),
        copy = next.studies.find((s) => s.id === id)!,
        original = studies.current.find(
          (s) => s.id === current.current.activeStudyId,
        )!;
      const state = studyFromDocument(copy.document),
        record: RuntimeStudy = {
          id,
          source: original.source,
          commands: new StudyCommands(authoringFromStudy(state)),
          presentation: state.presentation,
          thumbnail: original.thumbnail,
        };
      studies.current.push(record);
      activateStudy(record);
      setNotice(
        "Study duplicated. Edits to this copy leave the original intact.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function syncCommands() {
    const next = commands.current!.state;
    setAuthored((old) => ({
      ...next,
      params:
        JSON.stringify(old.params) === JSON.stringify(next.params)
          ? old.params
          : next.params,
      capture:
        JSON.stringify(old.capture) === JSON.stringify(next.capture)
          ? old.capture
          : next.capture,
    }));
    setCommandStatus(commands.current!.status);
    publishStudies();
  }
  function dispatch(edit: StudyEdit, label: string) {
    if (
      current.current.busy ||
      current.current.drawing ||
      current.current.pending
    )
      return;
    try {
      commands.current!.execute(edit, label);
      syncCommands();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function setParams(
    next: Params | ((old: Params) => Params),
    label = "Edit Afterimage",
  ) {
    const p = commands.current!.state.params;
    dispatch(
      {
        type: "parameters",
        params: typeof next === "function" ? next(p) : next,
      },
      label,
    );
  }
  function edit<K extends keyof Params>(key: K, value: Params[K]) {
    const labels: Record<keyof Params, string> = {
      count: "Change exposures",
      opacity: "Change opacity",
      falloff: "Change exposure falloff",
      distribution: "Change spacing",
      follow: "Follow path direction",
      mode: "Change accumulation",
      mask: "Change region masking",
      feather: "Change region feather",
      jitter: "Change seeded variation",
      seed: "Change seed",
      path: "Shape trajectory",
      maskCenter: "Move region",
      maskRadius: "Resize region",
      paintedMask: "Edit painted selection",
    };
    setParams((old) => ({ ...old, [key]: value }), labels[key]);
  }
  function beginGesture(label = "Edit Afterimage") {
    if (
      current.current.busy ||
      current.current.drawing ||
      current.current.pending
    )
      return;
    if (commands.current!.status.active) commands.current!.commit();
    commands.current!.begin(label);
    setCommandStatus(commands.current!.status);
  }
  function commitGesture() {
    if (drawingCancel.current) return;
    commands.current!.commit();
    syncCommands();
  }
  function cancelGesture() {
    if (drawingCancel.current) {
      drawingCancel.current();
      return;
    }
    commands.current!.cancel();
    syncCommands();
  }
  function undoEdit(forward = false) {
    if (
      current.current.busy ||
      current.current.pending ||
      commands.current!.status.active
    )
      return;
    const label = forward
      ? commands.current!.status.redoLabel
      : commands.current!.status.undoLabel;
    if (!label) return;
    if (forward) commands.current!.redo();
    else commands.current!.undo();
    syncCommands();
    setNotice(`${forward ? "Redid" : "Undid"} ${label.toLowerCase()}.`);
  }
  function resetCommands(next: AuthoringState) {
    commands.current!.reset(next);
    syncCommands();
  }
  const fit = useCallback(() => {
    const rect = field.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = Math.min(
      (rect.width - 80) / 1320,
      (rect.height - 90) / 850,
      1.2,
    );
    setCamera({
      x: (rect.width - 1320 * scale) / 2,
      y: Math.max(20, (rect.height - 850 * scale) / 2),
      scale: Math.max(0.25, scale),
    });
  }, []);
  async function load(url: string, name: string, ownURL = false, add = false) {
    const id = ++loadId.current;
    setError("");
    setNotice("Reading image…");
    try {
      const [image, buffer] = await Promise.all([
        imageURL(url),
        fetch(url).then((r) => {
          if (!r.ok) throw Error("The source photograph could not be read.");
          return r.arrayBuffer();
        }),
      ]);
      const bytes = new Uint8Array(buffer);
      if (bytes.length > 24 * 1024 * 1024)
        throw Error("Choose a photograph under 24 MB.");
      const mime = imageMime(bytes),
        hash = await sha256(bytes);
      if (id !== loadId.current) {
        if (ownURL) revoke(url);
        return;
      }
      if (
        image.width * image.height > 16_000_000 ||
        image.width > 4096 ||
        image.height > 4096
      )
        throw Error(
          "This experiment accepts images up to 4096px per edge and 16 megapixels. Resize the source before importing.",
        );
      const next = {
        image,
        url,
        name,
        width: image.width,
        height: image.height,
        ownedURL: ownURL,
        bytes,
        hash,
        mime,
      };
      stashActive();
      if (add && studies.current.length >= MAX_STUDIES)
        throw Error(
          "This workspace supports four studies. Save the project before starting another.",
        );
      const initial = defaults(image.width, image.height),
        previous = studies.current;
      const state = {
        ...(add ? initialAuthoring() : commands.current!.state),
        params: initial,
        capture: captureFor(initial, next),
        connected: true,
      };
      if (add)
        state.name =
          name
            .replace(/\.[^.]+$/, " ")
            .trim()
            .slice(0, 160) || `Study ${previous.length + 1}`;
      const record: RuntimeStudy = {
        id: add ? crypto.randomUUID() : current.current.activeStudyId,
        source: next,
        commands: new StudyCommands(state),
        presentation: structuredClone(current.current.study.presentation),
        thumbnail: null,
      };
      const records = add
        ? [...previous, record]
        : previous.length
          ? previous.map((s) => (s.id === record.id ? record : s))
          : [record];
      workspaceDocument(
        current.current.projectId,
        projectName,
        record.id,
        records,
      );
      studies.current = records;
      activateStudy(record);
      for (const old of previous)
        if (
          old.source.ownedURL &&
          !records.some((s) => s.source.url === old.source.url)
        )
          revoke(old.source.url);
      setExportedSignature(null);
      setNotice("Source connected. Shape its exposure path.");
    } catch (e) {
      if (ownURL) revoke(url);
      setError(String((e as Error).message));
      setNotice("Source unchanged.");
    }
  }
  async function importFile(file?: File, purpose = filePurpose.current) {
    if (!file || busy || drawing || current.current.pending) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 24 * 1024 * 1024
    ) {
      setError("Choose a JPEG or PNG under 24 MiB.");
      return;
    }
    if (purpose === "add" && studies.current.length >= MAX_STUDIES) {
      setError(
        "This workspace holds four studies. Save this project before starting another.",
      );
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await load(ownedURL(file), file.name, true, purpose === "add");
    } finally {
      setBusy(false);
    }
  }
  async function saveProject() {
    const snapshot = current.current;
    if (!snapshot.workspace || busy || drawing) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const images = new Map(
        studies.current.map((s) => [s.source.hash, s.source.bytes]),
      );
      const bytes = await encodeWorkspace(snapshot.workspace, images);
      const name =
        projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "afterimage-project";
      download(
        new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
        `${name}.form`,
      );
      setExportedSignature(snapshot.signature);
      setNotice(
        `Project download started. ${snapshot.workspace.studies.length} ${snapshot.workspace.studies.length === 1 ? "study" : "studies"} included.`,
      );
    } catch (e) {
      setError((e as Error).message);
      setNotice("Project download failed. Studies unchanged.");
    } finally {
      setBusy(false);
    }
  }
  function applyProject(prepared: PreparedProject) {
    disposeSources(studies.current);
    studies.current = prepared.studies;
    setProjectId(prepared.document.projectId);
    setProjectName(prepared.document.name);
    activateStudy(
      prepared.studies.find((s) => s.id === prepared.document.activeStudyId)!,
    );
    setPendingProject(null);
    setExportedSignature(
      JSON.stringify(
        workspaceDocument(
          prepared.document.projectId,
          prepared.document.name,
          prepared.document.activeStudyId,
          prepared.studies,
        ),
      ),
    );
    setNotice(
      `Opened ${prepared.document.name}. ${prepared.studies.length} ${prepared.studies.length === 1 ? "study" : "studies"} restored${prepared.legacy ? " from a version 1 file" : ""}.`,
    );
  }
  function cancelOpen() {
    if (pendingProject) disposeSources(pendingProject.studies);
    setPendingProject(null);
    setPendingNew(false);
    setNotice("Current project kept.");
  }
  async function openProject(file?: File) {
    if (!file || busy || drawing || pendingProject || pendingNew) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setNotice("Checking project…");
    const id = ++loadId.current,
      urls: string[] = [];
    try {
      if (file.size > MAX_WORKSPACE_BYTES)
        throw Error("Choose a .form project under 64 MiB.");
      const parsed = await decodeWorkspace(
        new Uint8Array(await file.arrayBuffer()),
      );
      const decoded = new Map<string, ImageSource>(),
        records: RuntimeStudy[] = [];
      for (const entry of parsed.document.studies) {
        const a = entry.document.asset;
        let source = decoded.get(a.id);
        if (!source) {
          const bytes = parsed.images.get(a.id)!,
            url = ownedURL(new Blob([bytes as BlobPart], { type: a.mime }));
          urls.push(url);
          const image = await imageURL(url);
          if (
            image.naturalWidth !== a.width ||
            image.naturalHeight !== a.height
          )
            throw Error("The photograph dimensions do not match the project.");
          if (
            engine.current &&
            Math.max(a.width, a.height) > engine.current.maxSize
          )
            throw Error("A photograph exceeds this renderer's texture limit.");
          source = {
            image,
            url,
            name: a.name,
            width: a.width,
            height: a.height,
            ownedURL: true,
            bytes,
            hash: a.id,
            mime: a.mime,
          };
          decoded.set(a.id, source);
        }
        const state = studyFromDocument(entry.document),
          record: RuntimeStudy = {
            id: entry.id,
            source: { ...source, name: a.name },
            commands: new StudyCommands(authoringFromStudy(state)),
            presentation: state.presentation,
            thumbnail: null,
          };
        if (state.connected) {
          const r =
            exportEngine.current ??
            (await new AfterimageRenderer(
              document.createElement("canvas"),
            ).init());
          exportEngine.current = r;
          r.upload(source.image, source.width, source.height);
          r.draw(state.params, state.capture, 192, 192);
          record.thumbnail = thumbnail(r.canvas);
        }
        records.push(record);
        setProgress(records.length / parsed.document.studies.length);
        await nextFrame();
      }
      if (id !== loadId.current) {
        for (const url of urls) revoke(url);
        return;
      }
      const prepared: PreparedProject = {
        document: parsed.document,
        studies: records,
        legacy: parsed.legacy,
      };
      if (
        current.current.source &&
        current.current.signature !== exportedSignature
      ) {
        setPendingProject(prepared);
        setNotice("Project checked. Choose whether to replace this project.");
      } else applyProject(prepared);
    } catch (e) {
      for (const url of urls) revoke(url);
      setError((e as Error).message);
      setNotice("Project could not be opened. Current studies unchanged.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }
  useEffect(() => {
    document.title = `FORM / ${projectName} / ${studyName}`;
  }, [projectName, studyName]);
  useEffect(() => {
    if (
      (pendingProject || pendingNew) &&
      openDialog.current &&
      !openDialog.current.open
    )
      openDialog.current.showModal();
  }, [pendingProject, pendingNew]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (changed) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  useEffect(() => {
    let disposed = false;
    const r = new AfterimageRenderer(canvas.current!);
    r.init()
      .then(() => {
        if (disposed) {
          r.destroy();
          return;
        }
        engine.current = r;
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
      if (engine.current === r) {
        r.destroy();
        engine.current = null;
      }
      exportEngine.current?.destroy();
      for (const url of ownedURLs.current) URL.revokeObjectURL(url);
      ownedURLs.current.clear();
    };
  }, []);
  useEffect(() => {
    void load("/fixtures/marble-head.jpg", "Marble head / The Met");
    fit();
  }, [fit]);
  useEffect(() => {
    if (!ready || !source || !engine.current) return;
    try {
      engine.current.upload(source.image, source.width, source.height);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ready, source]);
  useEffect(() => {
    if (!ready || !source || !engine.current) return;
    if (!connected) {
      engine.current.clear();
      const record = studies.current.find((s) => s.id === activeStudyId);
      if (record) {
        record.thumbnail = null;
        publishStudies();
      }
      return;
    }
    const r = engine.current;
    const t = performance.now();
    const frame = requestAnimationFrame(() => {
      try {
        validateParams(params);
        const start = performance.now();
        r.draw(params, capture, 768, 768);
        const draw = performance.now() - start;
        const record = studies.current.find((s) => s.id === activeStudyId);
        if (record) {
          record.thumbnail = thumbnail(r.canvas);
          publishStudies();
        }
        setMetrics({
          draw,
          elapsed: performance.now() - t,
          capabilities: r.capabilities(),
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [params, source, ready, connected, captureFrame, activeStudyId]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !openDialog.current?.open) {
        cancelGesture();
        setDrawArmed(false);
        abort.current?.abort();
      }
      if (current.current.drawing) return;
      if (
        openDialog.current?.open ||
        (e.target as HTMLElement).matches("input,textarea,select")
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        space.current = true;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoEdit(e.shiftKey);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        undoEdit(true);
      }
      if (e.key.toLowerCase() === "f") fit();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fit]);
  useEffect(() => {
    const el = field.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (current.current.drawing) return;
      const rect = el.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top;
      setCamera((c) => {
        if (e.ctrlKey || e.metaKey) {
          const scale = Math.max(
            0.2,
            Math.min(2.5, c.scale * Math.exp(-e.deltaY * 0.005)),
          );
          return {
            x: x - ((x - c.x) * scale) / c.scale,
            y: y - ((y - c.y) * scale) / c.scale,
            scale,
          };
        }
        return { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function pan(e: React.PointerEvent) {
    if (current.current.drawing) return;
    if (e.button !== 1 && !space.current && e.target !== e.currentTarget)
      return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY },
      c = camera;
    const move = (v: PointerEvent) =>
      setCamera({
        ...c,
        x: c.x + v.clientX - start.x,
        y: c.y + v.clientY - start.y,
      });
    const end = () => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", end, { once: true });
    el.addEventListener("pointercancel", end, { once: true });
  }
  const objectNames = {
    source: "source",
    operation: "operation",
    result: "result",
  };
  function movePlacement(e: React.PointerEvent, key: keyof typeof positions) {
    if (
      space.current ||
      e.button !== 0 ||
      current.current.busy ||
      current.current.drawing ||
      current.current.pending
    )
      return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(key);
    const el = e.currentTarget,
      start = { x: e.clientX, y: e.clientY },
      old = commands.current!.state.positions[key],
      scale = camera.scale;
    beginGesture(`Move ${objectNames[key]}`);
    el.setPointerCapture(e.pointerId);
    const move = (v: PointerEvent) => {
      if (!commands.current!.status.active) return;
      dispatch(
        {
          type: "placement",
          object: key,
          position: {
            x: old.x + (v.clientX - start.x) / scale,
            y: old.y + (v.clientY - start.y) / scale,
          },
        },
        `Move ${objectNames[key]}`,
      );
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
    };
    const end = () => {
      commitGesture();
      cleanup();
    };
    const cancel = () => {
      cancelGesture();
      cleanup();
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", end, { once: true });
    el.addEventListener("pointercancel", cancel, { once: true });
    el.addEventListener("lostpointercapture", cancel, { once: true });
  }
  function placementKey(e: React.KeyboardEvent, key: keyof typeof positions) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = directions[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(key);
    const old = commands.current!.state.positions[key],
      step = e.shiftKey ? 10 : 1;
    dispatch(
      {
        type: "placement",
        object: key,
        position: { x: old.x + d[0] * step, y: old.y + d[1] * step },
      },
      `Move ${objectNames[key]}`,
    );
  }
  function directDrag(
    e: React.PointerEvent<SVGCircleElement>,
    kind: "path" | "center" | "rx" | "ry",
    index = 0,
  ) {
    e.stopPropagation();
    e.preventDefault();
    if (!connected || busy || drawing || drawArmed) return;
    beginGesture(
      kind === "path"
        ? "Shape trajectory"
        : kind === "center"
          ? "Move region"
          : "Resize region",
    );
    const initial = clone(current.current.params),
      matrix = e.currentTarget.ownerSVGElement!.getScreenCTM()!.inverse(),
      el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (v: PointerEvent) => {
      if (!commands.current!.status.active) return;
      const point = new DOMPoint(v.clientX, v.clientY).matrixTransform(matrix);
      setParams((old) => {
        if (kind === "path") {
          const p = [...old.path] as Params["path"];
          p[index] = { x: point.x, y: point.y };
          return { ...old, path: p };
        }
        if (kind === "center")
          return { ...old, maskCenter: { x: point.x, y: point.y } };
        return {
          ...old,
          maskRadius: {
            ...old.maskRadius,
            [kind === "rx" ? "x" : "y"]: Math.max(
              5,
              kind === "rx"
                ? Math.abs(point.x - initial.maskCenter.x)
                : Math.abs(point.y - initial.maskCenter.y),
            ),
          },
        };
      });
    };
    const end = () => {
      commitGesture();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
    };
    const cancel = () => {
      cancelGesture();
      end();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end, { once: true });
    el.addEventListener("pointercancel", cancel, { once: true });
    el.addEventListener("lostpointercapture", cancel, { once: true });
  }
  function paintMask(e: React.PointerEvent<SVGSVGElement>) {
    if (
      !source ||
      !painted ||
      !params.mask ||
      mode !== "mask" ||
      space.current ||
      e.button !== 0 ||
      !e.isPrimary ||
      current.current.busy ||
      current.current.pending ||
      drawingCancel.current
    )
      return;
    const transform = e.currentTarget.getScreenCTM();
    if (!transform) return;
    const inverse = transform.inverse(),
      el = e.currentTarget,
      pointerId = e.pointerId,
      image = source;
    const point = (v: { clientX: number; clientY: number }): Point => {
      const p = new DOMPoint(v.clientX, v.clientY).matrixTransform(inverse);
      return { x: p.x / image.width, y: p.y / image.height };
    };
    const first = point(e);
    if (first.x < 0 || first.x > 1 || first.y < 0 || first.y > 1) return;
    const mask = params.paintedMask!;
    if (mask.strokes.length >= MAX_MASK_STROKES) {
      setError(
        "This selection has 64 strokes. Undo or clear it before painting.",
      );
      return;
    }
    const remaining =
      MAX_MASK_POINTS - mask.strokes.reduce((n, s) => n + s.points.length, 0);
    let stroke: MaskStrokeBuilder;
    try {
      stroke = new MaskStrokeBuilder(Math.min(128, remaining), 0.003);
      stroke.append(first);
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setSelected("source");
    const label = brushMode === "paint" ? "Paint selection" : "Erase selection",
      store = commands.current!;
    beginGesture(label);
    setDrawing(true);
    setBrushPoints(stroke.strokePoints);
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      drawingCancel.current = null;
      setDrawing(false);
      setBrushPoints([]);
    };
    const cancel = () => {
      store.cancel();
      cleanup();
      if (commands.current === store) syncCommands();
      setNotice("Brush stroke cancelled. Selection unchanged.");
    };
    const move = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      try {
        stroke.append(point(v));
        setBrushPoints(stroke.strokePoints);
      } catch (error) {
        cancel();
        setError((error as Error).message);
      }
    };
    const finish = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      if (commands.current !== store || !store.status.active) {
        cancel();
        return;
      }
      try {
        stroke.append(point(v), true);
        const next = appendMaskStroke(mask, {
          mode: brushMode,
          radius: brushSize / 200,
          points: stroke.strokePoints,
        });
        store.execute(
          {
            type: "parameters",
            params: { ...store.state.params, paintedMask: next },
          },
          label,
        );
        store.commit();
        cleanup();
        syncCommands();
        setNotice(
          "Painted selection updated. One Undo restores the previous selection.",
        );
      } catch (error) {
        cancel();
        setError((error as Error).message);
      }
    };
    drawingCancel.current = cancel;
    el.setPointerCapture(pointerId);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    setNotice("Painting on the photograph. Release to apply; Escape cancels.");
  }
  function drawTrajectory(e: React.PointerEvent<SVGSVGElement>) {
    if (
      !drawArmed ||
      space.current ||
      e.button !== 0 ||
      !e.isPrimary ||
      !ready ||
      !connected ||
      current.current.busy ||
      current.current.pending ||
      drawingCancel.current
    )
      return;
    const transform = e.currentTarget.getScreenCTM();
    if (!transform) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected("result");
    const inverse = transform.inverse(),
      el = e.currentTarget,
      pointerId = e.pointerId;
    const point = (v: { clientX: number; clientY: number }): Point => {
      const p = new DOMPoint(v.clientX, v.clientY).matrixTransform(inverse);
      return { x: p.x, y: p.y };
    };
    const unitsPerPixel = Math.hypot(inverse.a, inverse.b);
    let stroke: TrajectoryStroke;
    try {
      stroke = new TrajectoryStroke(point(e), 2 * unitsPerPixel);
    } catch (error) {
      setError((error as Error).message);
      setDrawArmed(false);
      return;
    }
    beginGesture("Draw trajectory");
    const store = commands.current!;
    setDrawing(true);
    setDrawPoints(stroke.points);
    setNotice("Drawing trajectory. Release to apply; Escape cancels.");
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      drawingCancel.current = null;
      setDrawing(false);
      setDrawArmed(false);
      setDrawPoints([]);
    };
    const cancel = () => {
      store.cancel();
      cleanup();
      if (commands.current === store) syncCommands();
      setNotice("Drawing cancelled. Trajectory unchanged.");
    };
    const move = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      try {
        stroke.append(point(v));
        setDrawPoints(stroke.points);
      } catch (error) {
        cancel();
        setError((error as Error).message);
      }
    };
    const finish = (v: PointerEvent) => {
      if (v.pointerId !== pointerId) return;
      if (commands.current !== store || !store.status.active) {
        cancel();
        return;
      }
      try {
        stroke.append(point(v));
        const path = fitTrajectory(stroke.points, 6 * unitsPerPixel);
        if (path) {
          store.execute(
            { type: "parameters", params: { ...store.state.params, path } },
            "Draw trajectory",
          );
          store.commit();
        } else store.cancel();
        cleanup();
        syncCommands();
        setNotice(
          path
            ? "Trajectory drawn. Refine its handles; Fit artwork includes anything outside the frame."
            : "Stroke too short. The previous trajectory is unchanged.",
        );
      } catch (error) {
        cancel();
        setError((error as Error).message);
      }
    };
    drawingCancel.current = cancel;
    el.setPointerCapture(pointerId);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
  }
  useEffect(
    () => () => {
      drawingCancel.current?.();
    },
    [],
  );
  async function getExporter() {
    if (!exportEngine.current)
      exportEngine.current = await new AfterimageRenderer(
        document.createElement("canvas"),
      ).init();
    const s = current.current.source!;
    exportEngine.current.upload(s.image, s.width, s.height);
    return exportEngine.current;
  }
  async function exportImage(size = 4096) {
    if (!source || !connected || busy || drawing) return;
    setBusy(true);
    setError("");
    setProgress(0);
    abort.current = new AbortController();
    const snapshot = clone(params),
      region = { ...capture },
      start = performance.now();
    try {
      const r = await getExporter(),
        blob = await exportPNG(
          r,
          snapshot,
          region,
          size,
          setProgress,
          abort.current.signal,
        );
      download(blob, `form-afterimage-${size}.png`);
      setNotice(
        `${size} × ${size} PNG exported in ${((performance.now() - start) / 1000).toFixed(1)}s.`,
      );
    } catch (e) {
      setNotice(
        (e as Error).name === "AbortError"
          ? "Export cancelled."
          : "Export failed.",
      );
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  async function runChecks() {
    if (!source || busy || drawing) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const r = await getExporter(),
        p = clone(params),
        region = { ...capture };
      const times: number[] = [];
      for (let i = 0; i < 32; i++) {
        await nextFrame();
        const t = performance.now();
        r.draw(p, region, 768, 768);
        r.read();
        if (i > 1) times.push(performance.now() - t);
      }
      const size = 2048,
        tileSize = 512;
      r.draw(p, region, size, size);
      const full = r.read();
      const a = new Uint8Array(full);
      r.draw(p, region, size, size);
      const b = r.read();
      let deterministic = true;
      for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) {
          deterministic = false;
          break;
        }
      const tiled = new Uint8Array(full.length);
      for (let y = 0; y < size; y += tileSize)
        for (let x = 0; x < size; x += tileSize) {
          r.draw(
            p,
            {
              x: region.x + (x / size) * region.width,
              y: region.y + (y / size) * region.height,
              width: region.width / 4,
              height: region.height / 4,
            },
            tileSize,
            tileSize,
          );
          const tile = r.read();
          for (let row = 0; row < tileSize; row++) {
            const destinationRow = size - y - tileSize + row;
            tiled.set(
              tile.subarray(row * tileSize * 4, (row + 1) * tileSize * 4),
              (destinationRow * size + x) * 4,
            );
          }
        }
      let maxError = 0,
        sum = 0;
      for (let i = 0; i < full.length; i++) {
        const d = Math.abs(full[i] - tiled[i]);
        maxError = Math.max(maxError, d);
        sum += d;
      }
      times.sort((a, b) => a - b);
      const fixture = defaults(2, 1);
      fixture.path = [
        { x: 0, y: 0 },
        { x: 1 / 3, y: 0 },
        { x: 2 / 3, y: 0 },
        { x: 1, y: 0 },
      ];
      fixture.count = 2;
      fixture.mask = false;
      fixture.opacity = 1;
      fixture.falloff = 0;
      fixture.mode = "exposure";
      r.upload(
        new ImageData(
          new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
          2,
          1,
        ),
        2,
        1,
      );
      r.draw(fixture, { x: 1, y: 0, width: 1, height: 1 }, 1, 1);
      const linearMix = Array.from(r.read());
      fixture.count = 1;
      fixture.opacity = 0.5;
      r.draw(fixture, { x: 0, y: 0, width: 1, height: 1 }, 1, 1);
      const opacityPixel = Array.from(r.read());
      const white = new Uint8ClampedArray(64 * 64 * 4);
      white.fill(255);
      r.upload(new ImageData(white, 64, 64), 64, 64);
      const maskFixture = defaults(64, 64);
      maskFixture.count = 1;
      maskFixture.opacity = 1;
      maskFixture.feather = 0.001;
      maskFixture.paintedMask = { enabled: true, base: "full", strokes: [] };
      const maskFrame = { x: 0, y: 0, width: 64, height: 64 };
      r.draw(maskFixture, maskFrame, 64, 64);
      const fullMask = r.read(),
        fullMaskPass = fullMask.every((v, i) => i % 4 !== 3 || v === 255);
      maskFixture.paintedMask = { enabled: true, base: "empty", strokes: [] };
      r.draw(maskFixture, maskFrame, 64, 64);
      const emptyMask = r.read(),
        emptyMaskPass = emptyMask.every((v, i) => i % 4 !== 3 || v === 0);
      maskFixture.paintedMask.strokes = [
        { mode: "paint", radius: 0.1, points: [{ x: 0.25, y: 0.2 }] },
      ];
      r.draw(maskFixture, maskFrame, 64, 64);
      const dotMask = r.read(),
        alphaAt = (pixels: Uint8Array, x: number, y: number) =>
          pixels[((63 - y) * 64 + x) * 4 + 3];
      const topDotAlpha = alphaAt(dotMask, 16, 12),
        mirroredDotAlpha = alphaAt(dotMask, 16, 51);
      maskFixture.paintedMask = {
        enabled: true,
        base: "full",
        strokes: [
          { mode: "erase", radius: 0.12, points: [{ x: 0.5, y: 0.5 }] },
        ],
      };
      r.draw(maskFixture, maskFrame, 64, 64);
      const erasedMask = r.read(),
        erasedCenterAlpha = alphaAt(erasedMask, 32, 32),
        retainedCornerAlpha = alphaAt(erasedMask, 2, 2);
      const paintedMaskChecks = {
        fullMaskPass,
        emptyMaskPass,
        topDotAlpha,
        mirroredDotAlpha,
        erasedCenterAlpha,
        retainedCornerAlpha,
      };
      const paintedMaskPass =
        fullMaskPass &&
        emptyMaskPass &&
        topDotAlpha === 255 &&
        mirroredDotAlpha === 0 &&
        erasedCenterAlpha === 0 &&
        retainedCornerAlpha === 255;
      r.upload(source.image, source.width, source.height);
      // With the mask disabled, its centre must not rotate/move any pixels.
      const rotationFixture = defaults(source.width, source.height);
      rotationFixture.mask = false;
      rotationFixture.follow = true;
      rotationFixture.count = 3;
      const rotationFrame = captureFor(rotationFixture, source);
      r.draw(rotationFixture, rotationFrame, 128, 128);
      const rotationBefore = r.read();
      rotationFixture.maskCenter = { x: 0, y: 0 };
      r.draw(rotationFixture, rotationFrame, 128, 128);
      const rotationAfter = r.read();
      const regionPivotIndependent = rotationBefore.every(
        (value, index) => value === rotationAfter[index],
      );
      const report = {
        ...r.capabilities(),
        timestamp: new Date().toISOString(),
        fixture: source.name,
        exposureCount: p.count,
        capture: region,
        regionPivotIndependent,
        paintedMaskChecks,
        paintedMaskPass,
        readbackInclusiveP50ms: times[Math.floor(times.length * 0.5)],
        readbackInclusiveP95ms: times[Math.floor(times.length * 0.95)],
        repeatedPixelBytesIdentical: deterministic,
        tileComparisonSize: size,
        linearMixPixel: linearMix,
        linearMixPass: linearMix.every(
          (v, i) => Math.abs(v - [188, 188, 0, 255][i]) <= 1,
        ),
        opacityPixel,
        opacityPass: opacityPixel.every(
          (v, i) => Math.abs(v - [255, 0, 0, 128][i]) <= 1,
        ),
        tileMaxChannelError: maxError,
        tileMeanChannelError: sum / full.length,
        tilePass: maxError <= 2,
        estimatedSourceBytes: source.width * source.height * 4,
        export4kBandAndTileBytes: 128 * (4096 * 4 + 1) + 1024 * 128 * 4,
        note: "Readback-inclusive wall time, not GPU timer. Same-device repeat only. Windows and Tauri untested.",
      };
      setChecks(report);
      setNotice("Rendering checks complete. Results are available below.");
      return report;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    (window as unknown as { formExperiment: unknown }).formExperiment = {
      runChecks,
      exportPNG: async (size: number) => {
        const s = current.current.source!,
          p = clone(current.current.params),
          r = await getExporter();
        return exportPNG(
          r,
          p,
          { ...current.current.capture },
          size,
          () => {},
          new AbortController().signal,
        );
      },
      getState: () => ({
        workspace: current.current.workspace,
        activeStudyId: current.current.activeStudyId,
        history: commands.current!.status,
        params: current.current.params,
        source: current.current.source?.name,
        capture: { ...current.current.capture },
        document: current.current.source
          ? createDocument(current.current.projectId, current.current.study, {
              id: current.current.source.hash,
              sha256: current.current.source.hash,
              path: `assets/${current.current.source.hash}.${current.current.source.mime === "image/jpeg" ? "jpg" : "png"}`,
              mime: current.current.source.mime,
              byteLength: current.current.source.bytes.length,
              width: current.current.source.width,
              height: current.current.source.height,
              name: current.current.source.name,
            })
          : null,
      }),
      getCapabilities: () => engine.current?.capabilities(),
    };
  }, [
    source,
    params,
    busy,
    captureFrame,
    positions,
    camera,
    mode,
    proof,
    projectName,
    projectId,
    connected,
    commandStatus,
    activeStudyId,
    studyName,
    studyViews,
  ]);
  const pathD = `M${params.path[0].x} ${params.path[0].y} C${params.path[1].x} ${params.path[1].y},${params.path[2].x} ${params.path[2].y},${params.path[3].x} ${params.path[3].y}`;
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          FORM<span>Field</span>
        </div>
        <div className="document-name">
          <label className="project-name">
            <span className="sr-only">Project name</span>
            <StudyName
              label="Project name"
              value={projectName}
              disabled={busy || drawing}
              onCommit={(name) => setProjectName(name)}
            />
          </label>
          <span>{changed ? "Not exported" : "Project checkpoint"}</span>
        </div>
        <div className="header-actions">
          <button
            disabled={busy || drawing || Boolean(pendingProject)}
            onClick={() => projectInput.current?.click()}
          >
            Open project
          </button>
          <button
            disabled={busy || drawing || !source}
            onClick={() => void saveProject()}
          >
            Save project
          </button>
          <button
            disabled={busy || drawing || studyViews.length >= MAX_STUDIES}
            onClick={() => {
              filePurpose.current = "add";
              fileInput.current?.click();
            }}
          >
            Import photograph
          </button>
          <button
            className="primary"
            disabled={!ready || !source || busy || drawing || !connected}
            onClick={() => void exportImage()}
          >
            Export 4K PNG
          </button>
        </div>
      </header>
      <input
        hidden
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={projectInput}
        type="file"
        accept=".form"
        onChange={(e) => {
          void openProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <section className="study-strip" aria-label="Project studies">
        <div className="study-list" role="group" aria-label="Select study">
          {studyViews.map((s, i) => (
            <button
              key={s.id}
              className={`study-choice ${s.id === activeStudyId ? proof : s.proof}`}
              aria-label={`Select study ${i + 1}: ${s.name}`}
              aria-pressed={s.id === activeStudyId}
              disabled={busy || drawing || Boolean(pendingProject)}
              onClick={() => selectStudy(s.id)}
            >
              <span className="study-preview">
                {s.thumbnail ? (
                  <img src={s.thumbnail} alt={`Result of ${s.name}`} />
                ) : (
                  <span>{source ? "No result" : "Loading"}</span>
                )}
              </span>
              <span className="study-label">
                <span>{s.name}</span>
                <small>Study {i + 1}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="study-actions">
          <button
            className="duplicate-study"
            disabled={
              busy ||
              !source ||
              studyViews.length >= MAX_STUDIES ||
              Boolean(pendingProject)
            }
            onClick={duplicateCurrentStudy}
          >
            Duplicate study
          </button>
          <button
            className="duplicate-study"
            disabled={
              busy ||
              drawing ||
              !source ||
              Boolean(pendingProject) ||
              pendingNew
            }
            onClick={requestNewProject}
          >
            New project
          </button>
        </div>
      </section>
      <div className="workspace">
        <main
          ref={field}
          className="field"
          aria-label="FIELD spatial workspace"
          onPointerDown={pan}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file?.name.toLowerCase().endsWith(".form"))
              void openProject(file);
            else void importFile(file, "add");
          }}
        >
          <div className="field-title">
            <span>AFTERIMAGE</span>
            <p>
              Place an image.
              <br />
              Draw its movement.
            </p>
          </div>
          <div
            className="field-tools"
            role="group"
            aria-label="Canvas navigation"
          >
            <button disabled={drawing} onClick={fit}>
              Fit field
            </button>
            <button
              aria-label="Zoom out"
              disabled={drawing}
              onClick={() =>
                setCamera((c) => ({
                  ...c,
                  scale: Math.max(0.2, c.scale * 0.85),
                }))
              }
            >
              −
            </button>
            <span>{Math.round(camera.scale * 100)}%</span>
            <button
              aria-label="Zoom in"
              disabled={drawing}
              onClick={() =>
                setCamera((c) => ({
                  ...c,
                  scale: Math.min(2.5, c.scale / 0.85),
                }))
              }
            >
              +
            </button>
          </div>
          <div
            className="scene"
            style={{
              transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
            }}
          >
            {connected && (
              <svg
                className="connections"
                width="1800"
                height="1200"
                aria-hidden="true"
              >
                <path
                  d={`M${positions.source.x + 205} ${positions.source.y + 160} C${positions.source.x + 255} ${positions.source.y + 160},${positions.operation.x - 45} ${positions.operation.y + 42},${positions.operation.x} ${positions.operation.y + 42}`}
                />
                <path
                  d={`M${positions.operation.x + 160} ${positions.operation.y + 42} C${positions.operation.x + 205} ${positions.operation.y + 42},${positions.result.x - 45} ${positions.result.y + 310},${positions.result.x} ${positions.result.y + 310}`}
                />
              </svg>
            )}
            <section
              className={`source-object object ${selected === "source" ? "selected" : ""}`}
              style={{ left: positions.source.x, top: positions.source.y }}
              aria-label="Source photograph"
            >
              <div
                className="object-label"
                role="button"
                tabIndex={0}
                aria-label="Move source"
                title="Arrow keys move; Shift moves by 10"
                onKeyDown={(e) => placementKey(e, "source")}
                onPointerDown={(e) => movePlacement(e, "source")}
              >
                <span>Source</span>
                <span>01</span>
              </div>
              {source ? (
                <div
                  className="source-preview"
                  onClick={() => setSelected("source")}
                >
                  <img
                    src={source.url}
                    alt="Source photograph for AFTERIMAGE"
                    draggable="false"
                  />
                  {params.mask && (
                    <svg
                      className={`source-region ${painted && mode === "mask" ? "paint-surface" : ""}`}
                      viewBox={`0 0 ${source.width} ${source.height}`}
                      aria-label="Source region selection"
                      onPointerDown={paintMask}
                    >
                      <defs>
                        <filter id="painted-mask-black">
                          <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                          />
                        </filter>
                        <mask id="source-region-outside">
                          <rect
                            width={source.width}
                            height={source.height}
                            fill="white"
                          />
                          {paintedPreview ? (
                            <image
                              href={paintedPreview}
                              width={source.width}
                              height={source.height}
                              preserveAspectRatio="none"
                              filter="url(#painted-mask-black)"
                            />
                          ) : (
                            <ellipse
                              cx={params.maskCenter.x}
                              cy={params.maskCenter.y}
                              rx={params.maskRadius.x}
                              ry={params.maskRadius.y}
                              fill="black"
                            />
                          )}
                        </mask>
                      </defs>
                      <rect
                        width={source.width}
                        height={source.height}
                        fill="#171a18"
                        opacity=".55"
                        mask="url(#source-region-outside)"
                      />
                      {!painted && (
                        <ellipse
                          className="mask-outline"
                          cx={params.maskCenter.x}
                          cy={params.maskCenter.y}
                          rx={params.maskRadius.x}
                          ry={params.maskRadius.y}
                        />
                      )}
                      {painted &&
                        brushPoints.length > 0 &&
                        (brushPoints.length === 1 ? (
                          <circle
                            className={`brush-ink ${brushMode}`}
                            cx={brushPoints[0].x * source.width}
                            cy={brushPoints[0].y * source.height}
                            r={
                              (brushSize / 200) *
                              Math.max(source.width, source.height)
                            }
                          />
                        ) : (
                          <polyline
                            className={`brush-ink ${brushMode}`}
                            points={brushPoints
                              .map(
                                (p) =>
                                  `${p.x * source.width},${p.y * source.height}`,
                              )
                              .join(" ")}
                            strokeWidth={
                              (brushSize / 100) *
                              Math.max(source.width, source.height)
                            }
                          />
                        ))}
                      {mode === "mask" &&
                        !painted &&
                        connected &&
                        !busy &&
                        [
                          {
                            kind: "center" as const,
                            x: params.maskCenter.x,
                            y: params.maskCenter.y,
                          },
                          {
                            kind: "rx" as const,
                            x: params.maskCenter.x + params.maskRadius.x,
                            y: params.maskCenter.y,
                          },
                          {
                            kind: "ry" as const,
                            x: params.maskCenter.x,
                            y: params.maskCenter.y + params.maskRadius.y,
                          },
                        ].map((p) => (
                          <circle
                            key={p.kind}
                            className="control"
                            cx={p.x}
                            cy={p.y}
                            r={
                              (Math.max(
                                source.width / 205,
                                source.height / 326,
                              ) *
                                8) /
                              camera.scale
                            }
                            onPointerDown={(e) => directDrag(e, p.kind)}
                          >
                            <title>
                              {p.kind === "center"
                                ? "Move source region"
                                : p.kind === "rx"
                                  ? "Source region width"
                                  : "Source region height"}
                            </title>
                          </circle>
                        ))}
                    </svg>
                  )}
                </div>
              ) : (
                <div className="source-loading">Reading image…</div>
              )}
              <div className="source-guide">
                {mode === "mask"
                  ? params.mask
                    ? painted
                      ? "Paint what repeats. Erase to remove background or gaps."
                      : "Select the part of this photograph to repeat."
                    : "Region off. The whole photograph repeats."
                  : "Selected source pixels feed the exposures."}
              </div>
              <div className="object-caption">
                {source?.name}
                <span>
                  {source?.width} × {source?.height}
                </span>
              </div>
              <button
                className="text-button"
                disabled={busy || drawing}
                onClick={() => {
                  filePurpose.current = "replace";
                  fileInput.current?.click();
                }}
              >
                Replace source
              </button>
            </section>
            <section
              className={`operation object ${selected === "operation" ? "selected" : ""}`}
              style={{
                left: positions.operation.x,
                top: positions.operation.y,
              }}
              aria-label="AFTERIMAGE operation"
            >
              <div
                className="operation-name"
                role="button"
                tabIndex={0}
                aria-label="Move operation"
                title="Arrow keys move; Shift moves by 10"
                onKeyDown={(e) => placementKey(e, "operation")}
                onPointerDown={(e) => movePlacement(e, "operation")}
              >
                <span className="port" />
                Afterimage
                <span className="port" />
              </div>
              <div className="operation-body">
                <span>{connected ? "Image connected" : "Input missing"}</span>
                <strong>{params.count} exposures</strong>
                <button
                  className="text-button"
                  disabled={busy || drawing}
                  onClick={() => {
                    dispatch(
                      { type: "connection", connected: !connected },
                      connected ? "Disconnect source" : "Connect source",
                    );
                    setNotice(
                      connected
                        ? "Input disconnected. Connect a source to render the result."
                        : "Input connected.",
                    );
                  }}
                >
                  {connected ? "Disconnect input" : "Connect source"}
                </button>
              </div>
            </section>
            <section
              className={`result-object object ${selected === "result" ? "selected" : ""}`}
              style={{ left: positions.result.x, top: positions.result.y }}
              aria-label="AFTERIMAGE result"
            >
              <div
                className="object-label"
                role="button"
                tabIndex={0}
                aria-label="Move result"
                title="Arrow keys move; Shift moves by 10"
                onKeyDown={(e) => placementKey(e, "result")}
                onPointerDown={(e) => movePlacement(e, "result")}
              >
                <span>Exposure study</span>
                <span>{connected ? "Live result" : "Input missing"}</span>
              </div>
              <div
                className={`artwork ${proof}`}
                onClick={() => setSelected("result")}
              >
                <canvas
                  ref={canvas}
                  aria-label="Rendered AFTERIMAGE artwork"
                  style={{ opacity: connected ? 1 : 0.4 }}
                />
                {source && connected && mode === "path" && !drawArmed && (
                  <svg
                    className="handles"
                    viewBox={`${capture.x} ${capture.y} ${capture.width} ${capture.height}`}
                    aria-label="Exposure trajectory controls"
                  >
                    <>
                      <path
                        d={`M${params.path[0].x},${params.path[0].y}L${params.path[1].x},${params.path[1].y}M${params.path[2].x},${params.path[2].y}L${params.path[3].x},${params.path[3].y}`}
                        className="tangents"
                      />
                      <path d={pathD} className="trajectory" />
                      {sample(params).map((e, i) => (
                        <circle
                          key={i}
                          className="sample"
                          cx={params.path[0].x + e.x}
                          cy={params.path[0].y + e.y}
                          r={(capture.width / 650) * 2.3}
                        />
                      ))}
                      {params.path.map((p, i) => (
                        <circle
                          key={i}
                          className={`control ${i === 0 || i === 3 ? "endpoint" : ""}`}
                          cx={p.x}
                          cy={p.y}
                          r={(capture.width / 650) * 7}
                          onPointerDown={(e) => directDrag(e, "path", i)}
                        >
                          <title>
                            {
                              [
                                "Start",
                                "First tangent",
                                "Second tangent",
                                "End",
                              ][i]
                            }
                          </title>
                        </circle>
                      ))}
                    </>
                  </svg>
                )}
                {source && connected && drawArmed && (
                  <svg
                    className="handles draw-surface"
                    viewBox={`${capture.x} ${capture.y} ${capture.width} ${capture.height}`}
                    aria-label="Draw trajectory over result"
                    onPointerDown={drawTrajectory}
                  >
                    <rect
                      x={capture.x}
                      y={capture.y}
                      width={capture.width}
                      height={capture.height}
                      fill="transparent"
                    />
                    <path
                      d={pathD}
                      className="trajectory previous-trajectory"
                    />
                    <polyline
                      className="drawn-trajectory"
                      points={drawPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    />
                  </svg>
                )}
              </div>
              <div className="result-caption">
                <span>
                  {drawArmed
                    ? "Draw across the result. Release to apply; Escape cancels."
                    : mode === "path"
                      ? "Guide the exposures. The frame stays fixed until you fit it."
                      : mode === "mask"
                        ? "Select source pixels on the photograph at left."
                        : "Artwork view. Drag its label to reposition."}
                </span>
                <button
                  className="text-button"
                  disabled={!source || busy || drawing}
                  onClick={() => {
                    if (source) {
                      dispatch(
                        {
                          type: "capture",
                          capture: captureFor(params, source),
                        },
                        "Fit artwork",
                      );
                      setNotice(
                        "Artwork fitted. This frame stays fixed until you fit again.",
                      );
                    }
                  }}
                >
                  Fit artwork
                </button>
                <button
                  className="text-button"
                  disabled={drawing}
                  onClick={() =>
                    setProof((p) => (p === "paper" ? "dark" : "paper"))
                  }
                >
                  {proof === "paper" ? "Dark proof" : "Paper proof"}
                </button>
              </div>
            </section>
          </div>
          <div className="field-help">
            Space + drag to pan <span>·</span> Pinch to zoom <span>·</span> F to
            fit
          </div>
        </main>
        <aside className="inspector" aria-label="Afterimage controls">
          <div className="inspector-heading">
            <span>Instrument 01</span>
            <h1>Afterimage</h1>
            <p>
              Guide a photograph through
              <br />a sequence of exposures.
            </p>
          </div>
          <div
            className="mode-switch"
            role="group"
            aria-label="Manipulation mode"
          >
            {(["mask", "path", "arrange"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                disabled={drawing}
                onClick={() => {
                  setDrawArmed(false);
                  setMode(m);
                  setSelected(m === "mask" ? "source" : "result");
                }}
              >
                {m === "path" ? "Trajectory" : m === "mask" ? "Region" : "View"}
              </button>
            ))}
          </div>
          <p className="mode-hint" role="status">
            {drawArmed
              ? "On the result: draw a smooth movement path. Detailed loops and corners are simplified."
              : mode === "mask"
                ? !params.mask
                  ? "Selection off. The whole photograph repeats."
                  : painted
                    ? "On the source: paint or erase which pixels repeat."
                    : "On the source: choose what repeats."
                : mode === "path"
                  ? "On the result: guide where it travels."
                  : "Review the artwork without handles."}
          </p>
          <button
            className="draw-trajectory-button"
            aria-pressed={drawArmed}
            disabled={busy || drawing || !ready || !source || !connected}
            onClick={() => {
              setDrawArmed(!drawArmed);
              setMode("path");
              setSelected("result");
              setNotice(
                drawArmed
                  ? "Drawing stopped. Trajectory unchanged."
                  : "Draw across the result. Release to apply; Escape cancels.",
              );
            }}
          >
            {drawArmed ? "Cancel drawing" : "Draw trajectory"}
          </button>
          <fieldset
            disabled={busy || drawing || !source || !connected}
            className="controls"
          >
            <Range
              name="count"
              label="Exposures"
              min={1}
              max={64}
              value={params.count}
              onStart={() => beginGesture("Change exposures")}
              onEnd={commitGesture}
              onCancel={cancelGesture}
              onValue={(v) => edit("count", v)}
            />
            <Range
              name="opacity"
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={params.opacity}
              onStart={() => beginGesture("Change opacity")}
              onEnd={commitGesture}
              onCancel={cancelGesture}
              onValue={(v) => edit("opacity", v)}
            />
            <Range
              name="falloff"
              label="Exposure falloff"
              min={0}
              max={2}
              step={0.01}
              value={params.falloff}
              onStart={() => beginGesture("Change exposure falloff")}
              onEnd={commitGesture}
              onCancel={cancelGesture}
              onValue={(v) => edit("falloff", v)}
            />
            <Range
              name="distribution"
              label="Spacing"
              min={0.2}
              max={4}
              step={0.05}
              value={params.distribution}
              onStart={() => beginGesture("Change spacing")}
              onEnd={commitGesture}
              onCancel={cancelGesture}
              onValue={(v) => edit("distribution", v)}
            />
            <label className="select-label">
              Accumulation
              <select
                value={params.mode}
                onChange={(e) => edit("mode", e.target.value as Params["mode"])}
              >
                <option value="ghosts">Ordered ghosts</option>
                <option value="exposure">Normalised exposure</option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={params.follow}
                onChange={(e) => edit("follow", e.target.checked)}
              />
              Follow path direction
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={params.mask}
                onChange={(e) => edit("mask", e.target.checked)}
              />
              Use selection mask
            </label>
            <label className="select-label">
              Selection shape
              <select
                aria-label="Selection shape"
                value={painted ? "painted" : "ellipse"}
                onChange={(e) => {
                  const usePaint = e.target.value === "painted";
                  setParams(
                    (old) => ({
                      ...old,
                      mask: true,
                      paintedMask: usePaint
                        ? {
                            ...(old.paintedMask || {
                              base: "empty" as const,
                              strokes: [],
                            }),
                            enabled: true,
                          }
                        : old.paintedMask
                          ? { ...old.paintedMask, enabled: false }
                          : undefined,
                    }),
                    usePaint
                      ? "Use painted selection"
                      : "Use elliptical selection",
                  );
                  setMode("mask");
                  setDrawArmed(false);
                  setSelected("source");
                  setNotice(
                    usePaint
                      ? "Paint on the source photograph to choose what repeats."
                      : "Elliptical selection restored. Painted strokes retained.",
                  );
                }}
              >
                <option value="ellipse">Elliptical region</option>
                <option value="painted">Painted subject</option>
              </select>
            </label>
            {painted && params.mask && (
              <div className="paint-controls">
                <div
                  className="brush-tools"
                  role="group"
                  aria-label="Mask brush"
                >
                  {(["paint", "erase"] as const).map((tool) => (
                    <button
                      key={tool}
                      aria-pressed={brushMode === tool}
                      type="button"
                      onClick={() => {
                        setBrushMode(tool);
                        setMode("mask");
                        setDrawArmed(false);
                        setSelected("source");
                      }}
                    >
                      {tool === "paint" ? "Paint" : "Erase"}
                    </button>
                  ))}
                </div>
                <Range
                  name="brush-size"
                  label="Brush size %"
                  min={1}
                  max={40}
                  value={brushSize}
                  onStart={() => {}}
                  onEnd={() => {}}
                  onCancel={() => {}}
                  onValue={setBrushSize}
                />
                <div className="mask-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      edit("paintedMask", {
                        enabled: true,
                        base: "full",
                        strokes: [],
                      })
                    }
                  >
                    Reveal all
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      edit("paintedMask", {
                        enabled: true,
                        base: "empty",
                        strokes: [],
                      })
                    }
                  >
                    Clear selection
                  </button>
                </div>
                <p>
                  Paint directly on the source photograph. Each stroke is one
                  undo step.
                </p>
              </div>
            )}
            {params.mask && (
              <Range
                name="feather"
                label={painted ? "Selection feather" : "Region feather"}
                min={0.001}
                max={0.5}
                step={0.001}
                value={params.feather}
                onStart={() => beginGesture("Change region feather")}
                onEnd={commitGesture}
                onCancel={cancelGesture}
                onValue={(v) => edit("feather", v)}
              />
            )}
            <details
              className="precise"
              onFocusCapture={(e) => {
                const t = e.target as HTMLElement;
                if (!t.matches('input[type="number"]')) return;
                const name = t.getAttribute("aria-label") || "Seed";
                beginGesture(
                  name.startsWith("Point")
                    ? "Shape trajectory"
                    : name.startsWith("Region centre")
                      ? "Move region"
                      : name.startsWith("Region radius")
                        ? "Resize region"
                        : "Change seed",
                );
              }}
              onBlurCapture={(e) => {
                if ((e.target as HTMLElement).matches('input[type="number"]'))
                  commitGesture();
              }}
            >
              <summary>Precise controls</summary>
              {params.path.map((p, i) => (
                <div className="point-row" key={i}>
                  <span>{["Start", "Tangent 1", "Tangent 2", "End"][i]}</span>
                  {(["x", "y"] as const).map((axis) => (
                    <input
                      key={axis}
                      type="number"
                      aria-label={`Point ${i + 1} ${axis}`}
                      value={Math.round(p[axis])}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n) || Math.abs(n) > 1e6) return;
                        const path = [...params.path] as Params["path"];
                        path[i] = { ...p, [axis]: n };
                        edit("path", path);
                      }}
                    />
                  ))}
                </div>
              ))}
              {!painted && (
                <>
                  <div className="point-row">
                    <span>Region centre</span>
                    {(["x", "y"] as const).map((axis) => (
                      <input
                        key={axis}
                        name={`region-center-${axis}`}
                        type="number"
                        aria-label={`Region centre ${axis}`}
                        value={Math.round(params.maskCenter[axis])}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && Math.abs(n) <= 1e6)
                            edit("maskCenter", {
                              ...params.maskCenter,
                              [axis]: n,
                            });
                        }}
                      />
                    ))}
                  </div>
                  <div className="point-row">
                    <span>Region size</span>
                    {(["x", "y"] as const).map((axis) => (
                      <input
                        key={axis}
                        type="number"
                        min="5"
                        aria-label={`Region radius ${axis}`}
                        value={Math.round(params.maskRadius[axis])}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n >= 5 && n < 10000)
                            edit("maskRadius", {
                              ...params.maskRadius,
                              [axis]: n,
                            });
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
              <Range
                name="jitter"
                label="Seeded variation"
                min={0}
                max={100}
                step={1}
                value={params.jitter}
                onStart={() => beginGesture("Change seeded variation")}
                onEnd={commitGesture}
                onCancel={cancelGesture}
                onValue={(v) => edit("jitter", v)}
              />
              <label className="seed">
                Seed
                <input
                  type="number"
                  min="0"
                  max="4294967295"
                  value={params.seed}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 0 && n <= 4294967295)
                      edit("seed", n);
                  }}
                />
              </label>
            </details>
          </fieldset>
          <details className="precise placement-controls">
            <summary>Object placement</summary>
            <fieldset
              disabled={busy || drawing || !source}
              className="controls"
            >
              <label className="select-label">
                Object
                <select
                  aria-label="Object placement"
                  value={selected}
                  onChange={(e) =>
                    setSelected(e.target.value as keyof typeof positions)
                  }
                >
                  <option value="source">Source</option>
                  <option value="operation">Afterimage</option>
                  <option value="result">Result</option>
                </select>
              </label>
              <div className="point-row">
                <span>Position</span>
                {(["x", "y"] as const).map((axis) => (
                  <input
                    key={`${selected}-${axis}`}
                    type="number"
                    step="1"
                    aria-label={`Placement ${axis}`}
                    value={Number(positions[selected][axis].toFixed(2))}
                    onFocus={() =>
                      beginGesture(`Move ${objectNames[selected]}`)
                    }
                    onBlur={commitGesture}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n) || Math.abs(n) > 1e6) return;
                      dispatch(
                        {
                          type: "placement",
                          object: selected,
                          position: {
                            ...commands.current!.state.positions[selected],
                            [axis]: n,
                          },
                        },
                        `Move ${objectNames[selected]}`,
                      );
                    }}
                  />
                ))}
              </div>
              <p>
                Drag an object label or focus it and use the arrow keys. Shift
                moves by 10.
              </p>
            </fieldset>
          </details>
          <div className="undo-row">
            <button
              disabled={
                (commandStatus.undoCount === 0 && !commandStatus.active) ||
                busy ||
                drawing
              }
              onClick={() => {
                commitGesture();
                undoEdit();
              }}
              title={
                commandStatus.undoLabel
                  ? `Undo ${commandStatus.undoLabel}`
                  : "Undo"
              }
            >
              Undo
            </button>
            <button
              disabled={commandStatus.redoCount === 0 || busy || drawing}
              onClick={() => {
                commitGesture();
                undoEdit(true);
              }}
              title={
                commandStatus.redoLabel
                  ? `Redo ${commandStatus.redoLabel}`
                  : "Redo"
              }
            >
              Redo
            </button>
            <button
              disabled={!source || busy || drawing}
              onClick={() => {
                if (source) {
                  setParams(
                    defaults(source.width, source.height),
                    "Reset Afterimage",
                  );
                }
              }}
            >
              Reset study
            </button>
          </div>
          <p className="history-hint" role="status">
            {commandStatus.active
              ? "Editing… Escape cancels"
              : commandStatus.undoLabel
                ? `Undo: ${commandStatus.undoLabel}`
                : commandStatus.redoLabel
                  ? `Redo: ${commandStatus.redoLabel}`
                  : "No edits to undo"}
          </p>
          <div className="experiment-note">
            <span>Afterimage study</span>
            <label className="active-study-name">
              Study name
              <StudyName
                label="Study name"
                value={studyName}
                disabled={busy || drawing}
                onCommit={(name) =>
                  dispatch({ type: "name", name }, "Rename study")
                }
              />
            </label>
            <p>
              Import adds a study. Replace source changes this study. Save
              project keeps all studies together.
            </p>
            <button
              className="text-button"
              onClick={() => setShowChecks((v) => !v)}
            >
              {showChecks ? "Hide technical checks" : "Open technical checks"}
            </button>
          </div>
        </aside>
      </div>
      <footer className="status">
        <span role="status">
          {busy
            ? `Processing${progress ? ` / ${Math.round(progress * 100)}%` : ""}`
            : notice}
        </span>
        <span>
          {metrics
            ? `${metrics.draw.toFixed(1)} ms CPU submit · WebGL2`
            : "Initialising renderer"}
          {busy && abort.current && (
            <button onClick={() => abort.current?.abort()}>
              Cancel export
            </button>
          )}
        </span>
      </footer>
      {(pendingProject || pendingNew) && (
        <dialog
          ref={openDialog}
          className="project-dialog"
          onCancel={(e) => {
            e.preventDefault();
            cancelOpen();
          }}
        >
          <h2>
            {pendingNew
              ? "Start a new project?"
              : `Open ${pendingProject!.document.name}?`}
          </h2>
          <p>
            The current project has changes since its last export. Save it first
            if you want to keep every study.
          </p>
          <div>
            <button
              disabled={busy || drawing}
              onClick={() => void saveProject()}
            >
              Save current project
            </button>
            <button disabled={busy || drawing} onClick={cancelOpen}>
              Keep current project
            </button>
            <button
              className="primary"
              disabled={busy || drawing}
              onClick={() =>
                pendingNew ? startNewProject() : applyProject(pendingProject!)
              }
            >
              {pendingNew ? "Start new project" : "Open selected project"}
            </button>
          </div>
        </dialog>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {showChecks && (
        <section className="checks" aria-label="Technical experiment checks">
          <div>
            <h2>Rendering checks</h2>
            <p>
              Runs 30 measured draws with readback, repeatability and
              tiled-versus-full comparison. These are local measurements, not
              cross-platform guarantees.
            </p>
            <button
              disabled={busy || drawing || !source}
              onClick={() => void runChecks()}
            >
              Run checks
            </button>
            {checks && (
              <button
                onClick={() =>
                  download(
                    new Blob([JSON.stringify(checks, null, 2)], {
                      type: "application/json",
                    }),
                    "form-render-checks.json",
                  )
                }
              >
                Download results
              </button>
            )}
            <button onClick={() => setShowChecks(false)}>Close</button>
          </div>
          <pre>
            {JSON.stringify(checks || metrics?.capabilities || {}, null, 2)}
          </pre>
          <p className="fixture-credit">
            Test photograph:{" "}
            <a
              href="https://www.metmuseum.org/art/collection/search/248784"
              target="_blank"
              rel="noreferrer"
            >
              Marble head of a goddess, The Metropolitan Museum of Art
            </a>
            . Public domain / Open Access. This is a material test, not a
            supplied visual reference.
          </p>
        </section>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
