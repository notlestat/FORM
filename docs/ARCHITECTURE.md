# Architecture

Status: target architecture v0.1, 9 October 2026. The AFTERIMAGE experiment implements a bounded renderer, tiled PNG export, a single-study schema in `src/core/project.ts`, a four-study workspace/file codec in `src/core/workspace.ts` and per-study transactional authoring commands in `src/core/commands.ts`. See [project files](PROJECT_FILES.md) and [measured findings](PHASE1_RESULTS.md). General graph commands, DAG evaluation, caching, multiple instruments and native hosting remain proposed. Research evidence and unresolved constraints are in [RESEARCH.md](RESEARCH.md); decision status is in [DECISIONS.md](DECISIONS.md).

## Recommendation

Use TypeScript for a renderer-independent document, command system and processing scheduler. React owns accessible controls. PixiJS with a deliberately selected WebGL2 backend owns FIELD presentation and initial raster processing through a separate backend adapter. Small SVG overlays present editable paths and handles. Tauri is the desktop candidate, subject to early tests of the actual macOS and Windows webviews.

Do not install Three.js, React Flow, WASM runtimes or native GPU frameworks until a measured need exists. The first graph inspector can be a simple semantic input/output list plus a selected-branch diagram. Its commands must already support editing and reconnecting the underlying graph.

Proposed logical boundaries, not a mandate for many packages on day one:

| Module | Owns | Must not own |
| --- | --- | --- |
| `core/document` | Schemas, IDs, validation, coordinates, migrations | DOM, Pixi objects, file dialogs |
| `core/commands` | Transactions, inverse edits, undo/redo | Rendering, browser events |
| `engine` | Port checking, dependencies, scheduling, cache keys | React state, workspace positions |
| `instruments` | Descriptors, kernels, bounds and edit contracts | Global app state or storage |
| `render/webgl` | Textures, passes, compositing, resource lifetime | Authoritative project data |
| `ui/field` | Camera, selection, gestures, semantic object list | Duplicated processing state |
| `platform` | Files, recovery, native bridge interfaces | Instrument algorithms |
| `export` | Frozen document revision, region requests, encoding | Screen capture of the UI |

An eventual CLI/programmatic caller creates the same validated commands and invokes the same evaluator. A UI gesture does not get a private algorithm.

## Document and object model

One serializable `ProjectDocument` owns:

- `formatVersion`, `projectId`, document revision and colour policy.
- Assets keyed by content hash, with media kind, dimensions, orientation and original profile metadata.
- Source entities referring to assets or authored path geometry.
- Operation instances with stable ID, instrument ID/version, parameter values and local seed.
- Edges with source entity/output port and target operation/input port.
- Placements referring to an output port, with transform, visibility, stacking and workspace grouping.
- Captures/compositions with an ordered list of placement references and independent composition transforms.
- Future time bindings and reusable instrument definitions, introduced by schema migration when needed.

Saved workspace camera and panel preferences live in an optional presentation section. They cannot affect evaluation. Selection and active drag state are ephemeral. A source photograph is an asset plus a source entity; it is not the same as its placement on FIELD. One operation can feed several placements and composition items.

Use discriminated TypeScript records and runtime validation at file, bridge and command boundaries. TypeScript types alone do not validate a project file. IDs are opaque stable identifiers. Asset paths, node names and UI labels are never identifiers.

GPU handles, decoded images, worker buffers and executable functions stay in a disposable runtime resource registry. The document contains descriptors and references only.

## Coordinates

1. Screen space is CSS pixels, top-left origin, x right and y down. Device pixels apply only at the renderer boundary.
2. FIELD space is 64-bit floating-point document units with an independent camera transform. Infinite means unbounded navigation within documented precision limits, not an infinitely allocated canvas. Use camera-relative coordinates before conversion to GPU floats.
3. Source/artwork space uses oriented intrinsic image pixels. A photograph has bounds `[0,width] × [0,height]`; path points and masks can extend outside these bounds.
4. Output space includes an origin offset and bounds, allowing an AFTERIMAGE trail to extend beyond its source. Never silently clip to source dimensions.
5. Composition space uses an explicit artboard/capture size. Physical dimensions plus requested pixels-per-inch determine export pixels later; PPI metadata alone does not add detail.
6. Future 3D space is right-handed with declared units, camera and explicit projection into an `Image2D` output. FIELD positions are not 3D world positions.

For a handle: screen point → inverse camera → inverse output placement → output origin → source-space control coordinate. Centralise these transforms and test their inverses. Rotation, negative scaling, zoom and high DPI must not change the operation's meaning.

Source replacement preserves source-space coordinates by default. If dimensions differ, present Keep coordinates or Scale guides to new image; do not guess. This choice is one undoable command and becomes reproducible document data.

## Typed processing contracts

Initial value descriptors:

| Type | Required semantics |
| --- | --- |
| `Image2D` | Extent, origin, pixel format, colour space, alpha convention, sampling rule |
| `Mask2D` | Single-channel coverage 0–1, extent, coordinate mapping, edge behaviour |
| `Path2D` | Ordered cubic segments, closed flag, coordinate space and stable control IDs |
| `Scalar` / `Vec2` | Units, finite values, optional declared range |
| Later `Geometry2D`, `Mesh3D`, `PointCloud` | Topology/attributes, units, bounds and coordinate space |
| Later `Signal` / `FrameStream` | Value schema, timestamp/timebase, sampling and buffering policy |

Inputs declare type, cardinality, required/optional status and coordinate expectations. Outputs declare types and bounds. A mask is not implicitly an RGBA image. Explicit operations perform colour conversion, projection, rasterisation or mask extraction. Initially numeric parameters are authored values; typed signal binding is added later.

Instrument descriptors include parameter IDs, default values, units, ranges, step, serialization, animatability, direct-edit handle mapping, parameter migration and validation. Avoid saving UI slider positions as artistic values.

An evaluator contract accepts immutable inputs, parameters, seed, requested region/resolution, quality profile, cancellation token and, when supported, time. It returns output handles, bounds, diagnostics and dependencies. Each instrument declares backend requirements, estimated working memory, tile support and required upstream regions. A low-quality preview is distinct from final output in both cache and UI.

## Graph evaluation

The first graph is a directed acyclic graph. Validate ports and cycles before committing a connection. Maintain a reverse dependency index and topological order.

On an edit:

1. Validate and commit the document transaction; increment revision.
2. Mark changed operations and downstream dependencies dirty. A placement move affects presentation or a capture, not the instrument kernel.
3. Request only visible previews and actively requested exports. Shared dependencies evaluate once per equivalent request.
4. Form a cache key from instrument/algorithm version, canonical parameters, seed, input content hashes, region, resolution, colour policy, quality and backend precision class. Add explicit time and state checkpoint hashes for future time-dependent operations.
5. Coalesce continuous edits. Cancel obsolete work cooperatively; tag all completions with their input revision. A late completion cannot overwrite a newer request.
6. Publish current output handles atomically. Retain the prior successful result with a stale label while updating or after failure.

Cache by semantic content, not by UI node position or document revision alone. Revision tags prevent races; content keys permit reuse. Reconnecting an input invalidates the relevant downstream branch. UI, graph inspector and scripts all use this path.

Do not represent animation as a self-referencing edge. Stateful operations later need explicit previous-frame state, fixed-step evaluation, reset conditions and checkpoints. Live external input is not deterministic until recorded.

## CPU/GPU ownership and rendering

Main thread handles input and the initial Pixi render loop. A worker handles curve sampling, hashing and suitable asset preparation. Transfer typed arrays where ownership permits. Do not introduce SharedArrayBuffer requirements in v0.1. Worker rendering is a separate capability experiment, not an architectural requirement.

GPU processing uses the renderer adapter's owned WebGL context and resource manager. Kernels receive abstract texture references, not Pixi scene nodes. The backend implements those references with textures and framebuffers. This avoids a second full-resolution CPU copy between each operation.

Render pipeline: decode/orient source → prepare working colour representation → mask rasterisation → AFTERIMAGE passes → cached output → FIELD presentation or capture composition → output colour encoding. Convert sRGB samples to linear values for exposure blending and use premultiplied alpha internally. RGBA16F accumulation is a proposed quality path requiring framebuffer/blending capability tests. An RGBA8 path requires its own quality approval; if neither passes, report unsupported rather than silently corrupt highlights.

GPU readback occurs for export or an operation that explicitly needs CPU data. If a future geometry sampler needs pixels, cache a bounded analysis image and expose that resolution. Never read a full photograph back every pointer event.

Three.js later gets a render adapter with explicit target ownership. Sharing WebGL state or importing a native texture is a technical spike, not a promise. A separate canvas can support an early isolated 3D view but introduces composition and transfer costs. Browser-managed GPU textures cannot be assumed to accept arbitrary native Syphon/Spout handles.

## Reproducibility, history and variations

All randomness uses a specified, versioned PRNG with stored unsigned seed. AFTERIMAGE's baseline has no random component; optional micro-variation consumes seed-derived per-sample values. Store algorithm version, sample order and geometry quantisation policy. Never call wall-clock time or `Math.random` inside a deterministic kernel.

Expect exact document replay and identical quantised CPU geometry on tested runtimes. GPU raster output uses measured pixel tolerance across devices; do not promise bit-identical pixels across GPU drivers. Preserve export provenance with backend and algorithm versions.

The current bounded study uses validated edits and detached before/after snapshots over authored data, capped at 80 history entries. Parameter changes, placements, capture, connection and name share one history; presentation remains independent. See [implemented commands](COMMANDS.md). General graph commands are proposed to produce forward and inverse patches over authored data. A drag keeps provisional values in a transaction and commits once. Undo releases unused runtime resources but keeps asset bytes referenced by redo history. Bound history by bytes and entries; pruning history must not delete assets still in the current document. Save does not serialize GPU snapshots or require the whole undo stack.

Linked copy adds a placement. Independent variation clones a selected editable branch, regenerates IDs and keeps immutable source assets shared. Show the duplication boundary before cloning a complex branch. Captured raster snapshots have an explicit timestamp, source revision and portability advantage, but do not pretend to be live links.

## Saving, recovery and assets

Proposed `.form` package: ZIP container with `manifest.json`, versioned `document.json`, content-addressed `assets/`, optional preview and provenance. Use streamed packaging where available; choose an archive library only after a memory benchmark. Default to embedding imported originals so portability works. Cached previews may be discarded and rebuilt.

Manifest includes format version, required instrument versions, declared file lengths and hashes. Loading validates entry paths, decompressed-size and count limits, JSON schema, references, finite numbers and graph acyclicity before allocating large resources. Reject traversal paths and compressed expansion beyond configured limits. Unknown optional fields are preserved where safe; an unsupported future major format opens read-only or fails clearly, never overwrites the original.

Migrations are explicit `vN → vN+1` pure transforms with fixtures and backup of the original. Instrument parameter migrations are separate from file-format migration. Missing instruments remain dormant records. Missing assets retain relinkable identity.

Browser baseline is file input plus downloadable package. Optional file handles are capability-gated; recovery uses IndexedDB/OPFS where supported and cannot be treated as a backup because quotas and eviction vary. Desktop adapter writes a temporary package, verifies completion, then replaces the destination atomically where supported; preserve the prior valid file on failure. Save success is shown only after the adapter confirms the write. Dirty state survives cancelled dialogs.

## High-resolution capture

Export freezes an immutable document revision and evaluates the chosen composition, independently of viewport zoom. Proposed first target is PNG up to a tested 4096 × 4096 capture. Larger sizes are experimental until end-to-end tests pass.

Tile at a tested edge size such as 1024 pixels. Each output tile asks upstream for the source region it needs, including feather/antialias support and the inverse footprint of every exposure transform. A path spanning the entire image may require almost the entire source for a small output tile. Tiling output alone does not solve source-texture limits. Large source images require tiled decode/upload or a clearly disclosed import limit.

Assemble or stream PNG rows without allocating a giant final canvas. Verify overlap cropping and compare tiled output to an untiled small reference. Non-local operations must declare full-frame needs and get an explicit memory preflight. Export cancellation frees temporary resources and leaves no file reported as complete.

At 8192², one RGBA8 texture is 256 MiB and RGBA16F is 512 MiB. Four half-float targets already require 2 GiB before source data, decoding and display. These are byte calculations, not measured application usage.

Use estimated byte accounting, explicit resource release, bounded texture pools, LRU caches, viewport culling and proxy resolutions. Initial configurable preview GPU budget is 256 MiB, subject to device tests. Quality may drop during manipulation with a visible Preview label, then refine. Export never silently changes dimensions or sample count to meet the budget.

## Extensibility and trust

Built-in instruments are registered descriptors plus evaluators and optional editing adapters. Reusable user instruments later package a subgraph, exposed ports and mapped parameters, versioned by content hash. This first extension format is data-only.

Executable third-party code, native libraries and `.tox` files require separate trust and capability policies. A worker is not by itself a secure plugin sandbox. Keep filesystem/network capabilities out of the instrument contract. Tauri commands should expose narrow validated operations, not arbitrary shell or path access. Review native distribution, code signing and update security before shipping.

## Current multi-study step

The workspace contains one to four independent AFTERIMAGE studies, each wrapping the validated study schema and owning its commands/presentation. Root metadata owns the selected study and project name. Asset bytes are immutable and deduplicated by SHA-256. IDs within a study remain scoped there; this is not an implicit shared graph.

The selected study uses the active renderer. Other results use cached reduced previews; opening validates all records/assets, decodes unique sources and generates previews sequentially before replacing current work. Version 1 is explicitly wrapped as a one-study version 2 document. The ZIP reader accepts only bounded stored entries; packaging is still in memory. See [implemented multi-study scope](MULTI_STUDY.md). General dependency scheduling and cache invalidation remain future work.

## Drawn trajectory step

A renderer-independent collector/fitter in `experiments/afterimage/trajectory.ts` converts a bounded spatial stroke into the existing four-point path. It does not introduce another path schema or change instrument/file versions. The UI owns screen-coordinate conversion and provisional ink; existing authoring transactions own the accepted edit. Preview/export consume the same retained parameters. See [scope](DRAW_TRAJECTORY.md).

## Painted selection step

Validated normalized stroke records extend AFTERIMAGE parameters. The command store compares mask fields and points independently of property order. A shared Canvas2D rasterizer produces a bounded source-space alpha texture; source overlays and the isolated WebGL evaluator consume it. Texture caching avoids rerasterizing per exposure or tile. Completed strokes are authored commands; pointer ink and brush settings remain transient.

Painted data requires instrument version 2. Container versions stay unchanged, with manifest requirements validated against their studies. Ellipse-only legacy records remain version 1. This is a manual raster selection capability, not an automatic segmenter, generic mask graph or another instrument. See [scope and limitations](PAINTED_MASK.md).
