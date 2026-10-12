# Architecture decisions

## 10 October: centre-pivot rotation

D26, requested rotation correction: rotate each placed artwork around its transformed centre for both drag and numeric editing. Preserve the existing transform/file model by compensating translation, rather than reinterpreting stored positions. Accumulate wrapped pointer-angle steps so full and repeated turns remain continuous. The rotation handle moves above the artwork midpoint. Reflected and anisotropic transforms retain the same centre; live pointer verification remains pending.

## 10 October: open canvas interaction

D25, requested by Corey: remove the board capture rectangle and its controls. Compose on the open field; derive export bounds from visible included artwork. Retain stored capture metadata only for compatibility, without applying its old crop. Delete/Backspace routes the selection through the same undoable removal command as the inspector. Shift-drag preserves current artwork proportions. CPU tests cover rotated/reflected proportional resize and automatic bounds; live pointer/keyboard checks remain pending.

## 10 October: first FIELD implementation

D22, authorised first FIELD build: Corey's request to build the whole first build supersedes the earlier bounded-experiment-only implementation gate. Complete the brief's FIELD journey with AFTERIMAGE first; retain FRAME/LIVE/cameras/native hosting as future milestones. The ten-item implementation/evidence map is in [FIRST_BUILD.md](FIRST_BUILD.md).

D23, implemented sharing: typed graph objects own source/path/selection/operation data. Linked placements share one output; independent variations recursively copy editable upstream entities and share only immutable assets. Layout and composition transforms are separate. Format 3 stores this model, with explicit migration from versions 1/2.

D24, implemented bounded rendering/persistence: semantic hashes drive dependency caching; GPU evaluation is serialised per evaluator with cancellation guards. Preview uses a 768px bound; export uses bounded 4K operation rasters and tiled Canvas2D sRGB composition. Browser IndexedDB recovery complements portable downloads without claiming native atomic save or a backup. Live interaction/GPU/restart recovery remain unverified because the saved browser permission blocks local testing. These choices require artist/device validation before a release claim.

All decisions below are proposed unless explicitly marked confirmed. Date: 9 October 2026.

| ID | Decision | Reason and cost | Revisit when |
| --- | --- | --- | --- |
| D01, confirmed | AFTERIMAGE first | Corey chose guided photographic exposures in this session | User changes creative priority |
| D02, confirmed for phase 1 | Spatial workbench concept A | Shows source, operation and outputs together; requires careful clutter control | Interface review or usability test rejects it |
| D03, proposed | One document, multiple environments | Preserves links into composition and time; needs stable IDs and separate presentation state | A concrete workflow exposes a missing entity |
| D04, proposed | Renderer-independent TypeScript core | Browser development and testability; compute hotspots may need later native work | Measured CPU bottleneck |
| D05, proposed | Pixi WebGL2 first | Current Pixi production guidance and narrower shader target; postpones compute shaders | WebGPU parity, deployment coverage and a measured benefit pass |
| D06, proposed | React UI plus small Zustand vanilla stores | Accessible controls and selective subscriptions; commands still own document edits | Profiling shows churn or state ownership becomes unclear |
| D07, proposed | Custom spatial interaction; defer React Flow | FIELD requires artwork manipulation; avoids graph-library ownership of the document | Advanced graph editing becomes a validated need |
| D08, proposed | Tauri desktop candidate | Narrow native host and shared browser UI; webview variability and GPU exchange remain costs | macOS/Windows compatibility spike fails or native throughput dominates |
| D09, proposed | DAG first; explicit time/state later | Understandable invalidation and deterministic still export | LIVE begins, with a dedicated state/checkpoint design |
| D10, proposed | Portable embedded `.form` assets | Reliable reopen and handoff; larger packages and archive-memory risk | Large media projects justify managed external assets |
| D11, proposed | TouchDesigner WebSocket control before native textures | Bounded protocol can be tested independently | Real-time image exchange becomes a release requirement |
| D12, proposed | Data-only reusable instruments before executable plugins | Reuses graph contracts with less trust complexity | A real instrument cannot be expressed from built-ins |

Alternative to D05: a direct WebGPU renderer reduces future API translation but increases the initial compatibility and validation work. Alternative to D08: an Electron shell could make the browser runtime more uniform at a packaging cost; it would not automatically solve native texture sharing. A native rendering core is a separate major commitment, justified only by measured needs.

Corey approved concept A and four bounded phase 1 experiments on 9 October 2026. The full FIELD vertical slice remains a later review. See PHASE1_RESULTS.md for evidence and open gates.

D13, phase 1 choice: self-hosted Archivo Variable, neutral editorial surfaces and restrained manipulation accents follow the original FORM brief. SIL OFL is retained in public/Archivo-OFL.txt.

D14, experiment only: Pixi initialises an isolated WebGL2 context; a dedicated kernel accumulates linear-light exposures and encodes straight-alpha sRGB. This does not establish integration with a shared Pixi stage.

D15, user workflow preference: use 6.1 Sol for implementation/testing; reserve Astra for substantial planning and system structure work. Model selection is controlled by the chat runtime.

D16, phase 1 interaction refinement: select repeated pixels on the source; guide exposure movement on the result. Use the image centre for rotation independently of the mask. Keep preview and export on one stable capture frame, changed explicitly by Fit artwork. This addresses Corey's observation that Region and Trajectory appeared to perform the same action.

D17, implemented bounded foundation: `.form` version 1 stores one AFTERIMAGE study in a three-entry ZIP (manifest, document, original JPEG/PNG). Stored entries avoid inflation; entry bounds, CRCs, SHA-256 hashes, references, instrument versions and decoded image dimensions are checked before replacement. Browser downloads provide portable manual checkpoints. No native atomic write, autosave or generic graph support is implied. See PROJECT_FILES.md.

D18, implemented bounded command foundation: one renderer-independent `StudyCommands` instance owns authoring edits and an 80-entry in-memory snapshot history. Pointer and numeric transactions commit once or cancel exactly. Workspace navigation, selection and proof presentation stay outside authoring undo. Opening/replacing the photograph resets history; asset-aware history and generic graph commands remain later work. Existing `.form` version 1 stores current authored state without serializing history.

D19, implemented bounded workspace: one to four independent AFTERIMAGE studies, each with its own commands, capture and presentation. Version 2 wraps the existing study schema, saves selected-study/root metadata and deduplicates immutable original images by hash. Evaluate one study and cache reduced comparison previews; keep generic shared-graph editing separate. Stored packages are capped at 64 MiB with 60 MiB unique assets and 24 MiB per image. Version 1 wraps explicitly into one study. Window resizing preserves the camera; Fit field is explicit. See MULTI_STUDY.md for scope and remaining verification.

D20, implemented bounded drawing: a stroke becomes the existing editable cubic trajectory, using uniform arc-length samples and fixed endpoints. Provisional ink stays outside authored state until release. One stroke is one cancellable command; capture stays fixed and existing file versions remain compatible. Detailed loops/multiple segments are explicitly outside this step. Saved browser permissions still block pointer verification despite renewed user approval. See DRAW_TRAJECTORY.md.

D21, implemented manual painted selection: store bounded normalized paint/erase strokes in AFTERIMAGE parameters; rasterize alpha at a maximum 1024px long edge and reuse one source-space texture across exposures/export tiles. Commit one command per stroke; retain ellipse geometry and painted data when switching shape. Require instrument version 2 for painted records, keeping container versions and legacy files compatible. This does not provide automated segmentation or source-resolution fine-detail masking. GPU/browser verification remains open. See PAINTED_MASK.md.


D27, implemented composition step: Corey's instruction to build the next thing authorises layer order and per-placement opacity as a bounded extension of precise composition in FIELD. Store placement order back to front and show the Objects list front to back. Opacity defaults to 1 in older format-3 documents; validate explicit values from 0 to 1. Linked copies share process output but retain independent presentation settings. Full and tiled exports use the same source-over pass and omit fully transparent placements from export bounds/evaluation. No new capture rectangle or separate FRAME environment is introduced. See ARTWORK_COMPOSITION.md.

D28, user-reported acceptance: Corey reports the preceding build is good for now after checking it. Record this as provisional artist feedback with unknown test coverage, not automated runtime evidence, platform support or permission to merge.


D29, implemented arrangement step: Corey's “it works build next step” authorises multi-selection, collective translation and six alignment controls. Shift-click toggles artwork membership in Select mode; selection remains presentation state. Alignment translates each image rectangle to the combined selection bounds, retaining rotation, reflection, opacity, layer order and shared process data. Group drag is one cancellable command; Delete removes selected placements atomically. Group scale/rotation, marquee selection and persistent grouping remain outside this step. Missing or updating outputs disable alignment. See ARTWORK_ALIGNMENT.md.

D30, user-reported composition feedback: Corey reports placing an additional image works and asks to continue. Record this user feedback without inferring specific opacity/export/native/recovery coverage or merge approval.


D31, corrective interaction: Corey reports canvas-image Shift-click does not multi-select. Capture Shift-left-primary-pointer at the artwork section before drawing overlays, and switch additive selection into Select mode. Bypass transform handles to retain Shift proportional resizing; keep Space/middle-button navigation. Accept additive selection in the Artwork list irrespective of the previous tool mode. Two pointer-routing regression tests bring the suite to 93; live user retest remains pending.


D32, implemented distribution: after Corey's provisional success report and request to continue, add horizontal/vertical equal-gap and equal-centre distribution for at least three selected artworks. Order by transformed rectangle centres, with ID tie-breaking; keep both end placements exactly fixed. Equal gaps account for transformed sizes and reject insufficient room atomically; equal centres may overlap. Translate interior placements only, preserving all graph, scale/rotation/opacity/stacking data. Retain existing commands/codec/recovery/export. See ARTWORK_SPACING.md.


## D33 — Shared FRAME alpha and reusable definitions, 12 October 2026

Corey asked to build the fuller first version against the original FORM prompt and review it afterward. FIELD remains the open canvas; FRAME now uses the same graph/placements with optional artboards and grids. Editable Archivo text and shapes produce image outputs compatible with AFTERIMAGE. A contact sheet is a linked composition, not a claim that the full ARCHIVE instrument exists. Portable format 4 prevents older builds silently dropping this authoring data; formats 1–3 migrate without modifying original files. Single-AFTERIMAGE definitions contain data only; imported mask assets stay in the full project. LIVE, camera, other instruments, native hosting and TouchDesigner retain their separate engineering/acceptance work. [Implemented scope and evidence](FIRST_ALPHA.md).
