# Phase 1 results

9 October 2026. Approved scope: Spatial workbench A; AFTERIMAGE quality, platform rendering, tiled export and interaction experiments. Local evidence is available; creative and native platform gates remain open.

## Reviewable behaviour

The study uses a real photograph and a cubic trajectory. Up to 64 samples follow approximate arc-length spacing with falloff, optional orientation and seeded variation. Ordered ghosts and normalised exposures accumulate in linear light. An elliptical region provides a limited masking experiment.

Source, operation and result are visible together. Moving labels changes their arrangement; changing the trajectory changes the image. Disconnecting the source clears the preview and disables export. Numeric path/region controls accompany dragging. Instrument parameters, placements, connection, capture fitting and name share undo/redo. The preview is 768²; export uses the original source.

Archivo Variable is bundled locally under the SIL Open Font License. Neutral surfaces, compact contextual controls, thin rules, restrained typography and negative space follow the written FORM brief. Dark proof changes the artwork's viewing surface; exports retain transparency.

## Measured evidence

Host: Apple Silicon macOS 26.6.2, arm64. Browser user agents report compatibility macOS versions, not the host OS version. WebKit WebGL does not identify the physical GPU, so timings are not hardware-GPU guarantees.

| Check | Result | Scope |
| --- | --- | --- |
| Processing tests | 10 pass | Sampling, seed, bounds, validation, capture and PNG CRC |
| TypeScript / Vite | Build passes | Bundle-size warning remains |
| Same-device repeat | Pixel bytes identical | Two 2048² draws |
| 2K tiled vs full | Max channel difference 1/255; mean 0.000119/255 | 16 tiles of 512², one device |
| Linear-light mix | `[188,188,0,255]` | Equal red/green input, expected sRGB result |
| Global opacity | `[255,0,0,128]` | Half-opacity red in normalised exposure |
| 30 preview draws | p50 4.0 ms; p95 5.8 ms | 768², 9 exposures, readback-inclusive wall time, HeadlessChrome 154 |
| 4K PNG | 4096² RGBA, 12,659,214 bytes | Actual app download; all chunk CRCs and decompressed length verified |
| Exploratory 8K | 8192² blob, 42,074,159 bytes, 5.21 s | Completed locally; blob not retained or independently decoded |
| 8K JS heap | 41.4 MB before; 124.2 MB after | Two samples; excludes peak process/GPU memory |
| Connection / keyboard | Disconnect disables export; reconnect restores it; ArrowRight changes exposures; undo restores count | In-app UI checks |
| Layout / proof | 1440 × 900 desktop and dark proof inspected; 390px document width stays 390px | Narrow containment only; no mobile authoring claim |
| Direct editing | Endpoint drag changes curve; undo restores exact path | Real pointer interaction; capture fixed for duration of drag |

Raw evidence lives in [experiments/results](../experiments/results). The initial in-app Chromium 155 report used a smaller tile comparison; it is retained separately.

Export allocates a 128-row band and tile readback: about 2.62 MB of raw buffers at 4K. Compressed chunks, Blob construction, browser allocations and the full source texture also consume memory. This tiles output, not oversized sources. Imports are capped at 24 MB, 4096px per edge and 16 MP. Dimension checks happen after browser decoding; this is not a hardened image decoder.

## Fixes from testing

- Freeze capture coordinates during dragging so changing bounds cannot move a handle away from the pointer.
- Use `overflow: clip` to prevent focus from creating hidden canvas scroll offsets.
- Keep range components mounted while values change.
- Preserve global opacity in normalised accumulation.
- Prevent source replacement during checks/export.

## Remaining gates

| Experiment | Current evidence | Needed before promotion |
| --- | --- | --- |
| S1 artwork quality | One permitted stone portrait/material fixture | Portrait, object and texture studies; Corey's judgement of useful results and edges |
| S2 platforms | Local Chromium succeeds | Actual WKWebView/Tauri and Windows WebView2; loss/recovery, limits and visual parity |
| S3 export | 2K comparison, 4K file and 8K completion | Peak process/GPU memory, large-source behaviour, cancellation across platforms |
| S4 interaction | Direct path drag and undo checked | Corey predicts placement vs process edits; broader usability and keyboard placement |

No Rust toolchain or Windows execution host was available. Native rendering cannot be inferred from Chromium. Pixi initialises an isolated WebGL2 context; a dedicated raw shader performs the study. Shared Pixi stage/GPU-state integration is not proven.

The React study has one connection and a shared authoring history. The single-study document and portable project codec are implemented. General graph commands/DAG, scale/rotation transforms, graph editing, revisions/cache invalidation, subject masks and context recovery remain later work. The fixture is 391 × 623: larger PNG dimensions do not add photographic detail.

Review source → trajectory → exposure behaviour before promoting this into the shared document. Keep platform gates open until measured on their actual hosts.

## Region and trajectory refinement

Implemented after Corey's feedback that Region and Trajectory felt similar. Region now selects pixels on the source photograph. Trajectory handles appear only on the result. The region no longer doubles as the rotation pivot; rotation uses the image centre. The frame is initialised on import and remains fixed across parameter edits and undo. Fit artwork explicitly recalculates it. Export uses that visible frame, including any intentional crop.

Actual pointer checks passed: region dragging changed the mask centre without changing the trajectory/frame; trajectory dragging changed the curve without changing the mask/frame; undo restored the curve; a numeric endpoint edit retained the frame until Fit artwork was clicked. The source preview uses contain fitting so landscape or tall images and overlay coordinates share the same image rectangle.

The updated GPU check verifies that moving a disabled region leaves rotated image pixels identical. The 2K tile check still has maximum error 1/255. Decoded 768px PNG pixels match a direct render of the preview frame within 1/255. Raw evidence: [region-trajectory-rendering.json](../experiments/results/region-trajectory-rendering.json). The earlier 4K study remains historical output; crop behaviour is now explicit.

## Portable project milestone

Corey approved moving to the next step after the interaction refinement. Save/Open now use a versioned single-study document with separate source, operation, placement, connection and capture records. The original JPEG/PNG is embedded with its SHA-256 identity. Browser decoding and dimension checks complete before replacement; pending changes get a replacement dialog. Undo history is cleared on open.

Twenty automated tests pass: ten processing tests and ten project codec/validation tests. A real browser download → edit → cancel replacement → reopen → download journey produced byte-identical manifest, document and image entries. The retained [project-roundtrip.form](../experiments/results/project-roundtrip.form) uses the public fixture. Browser checks also rejected corrupt CRC data and a valid archive with mismatched decoded image dimensions while preserving current authored controls. Header controls stay within 390px width. Evidence: [project-roundtrip.json](../experiments/results/project-roundtrip.json).

This is a browser file adapter: Save starts a download, and the checkpoint indicates that export was requested. It does not verify durable filesystem storage, provide autosave/recovery or implement native atomic writes. Platform gates above remain open.

## Authoring command milestone

Implemented the command foundation before expanding to multiple objects. Nine command tests bring the total automated suite to 29. They verify mixed-edit inverses, grouped previews, cancellation, no-op and redo behaviour, validation without mutation, bounded detached history and history reset.

Actual browser checks passed for exact source placement undo/redo, keyboard result nudging and Cmd+Z, source disconnect/undo/redo with correct export availability, separate capture/path undo, numeric Escape cancellation, name cancellation/undo and a slider drag grouped into one step. A direct path drag restored the exact SVG curve in one undo and kept the capture fixed. Reset undo restored a loaded study's count, seed and region. The new controls fit within a 390px-wide document; no browser console errors were recorded.

A real [command-history-study.form](../experiments/results/command-history-study.form) download retained the renamed study and 710-unit result position. Reopening restored that position and cleared history. The previous milestone's `.form` file still opens with its exact count, endpoint, region and seed. [Browser evidence](../experiments/results/command-history.json) records the checks. The interface retains the existing Archivo typography and neutral FORM treatment.

Opening a project or replacing its photograph starts a new history. Undo stacks stay in memory, are capped at 80 entries and are not saved. Navigation, selection and proof are presentation, so undo does not move the camera. This does not implement multi-object graph editing or clear the native platform gates.

## Multiple-study milestone

The next requested step adds up to four independent AFTERIMAGE studies, additive import, duplication, a comparison strip and all-study save/reopen. Eight workspace tests bring the automated suite to 37. Tests cover independent copies, asset deduplication, multiple sources, exact serialization, version 1 migration, identifiers/ownership/selection, bounds and corrupt/missing/unexpected assets.

Actual browser checks verified independent parameters and cached results; retained history, capture, mode and proof when switching; isolated source replacement; additive import; four-study controls; and real multi-study save/reopen. The retained [four-studies.form](../experiments/results/four-studies.form) contains four studies and two unique images. Reopening/resaving at a fixed viewport produced byte-identical entries. An earlier two-study resave changed only active camera values during navigation; authored geometry and assets were retained. Automatic resize fitting has since been removed so view changes remain explicit.

CRC corruption was rejected with all four current studies retained. Browser permission was denied during the later decoded-dimension failure check and before New project and narrow-strip checks. Those outcomes remain unverified for this milestone. The second source is a generated 24 × 32 test pattern, not a second photographic quality fixture. See [evidence](../experiments/results/multi-study.json).

One study is actively evaluated. Shared graph editing, linked copies, simultaneous FIELD branches, native recovery, FRAME and LIVE remain future work. Earlier native and artistic gates remain open.

## Drawn trajectory milestone

The next requested step adds sketching movement over the result, then refining the fitted curve with existing handles/numeric controls. The bounded collector/fitter uses spatial rather than timing samples, keeps endpoints and produces one smooth cubic. Seven new tests bring the suite to 44; TypeScript/build pass. Automated checks include one exact undo entry, cancellation preserving redo, unchanged capture and exact saved-path roundtrip.

This does not establish unrestricted freehand paths or photographic quality: loops and corners are simplified. No renderer/instrument/file schema changes were needed. Corey allowed browser checks, but the controller rejected localhost because of a saved permission setting. Pointer and latest layout checks remain unverified. The [retained project](../experiments/results/drawn-trajectory.form) was produced by the codec, not a browser download; [evidence](../experiments/results/draw-trajectory.json) distinguishes those scopes.

## Painted selection milestone

Corey confirmed the drawn trajectory worked and requested the next build step. Manual painted selection now selects source pixels using ordered paint/erase strokes. An eight-test data/history/file suite covers exact retained strokes, cancellation, unchanged path/capture, independent duplicates, legacy/mixed workspaces and instrument version requirements. All 52 tests and the build pass.

The renderer now samples a cached source-space mask texture before exposure accumulation. A shared bounded Canvas2D rasterizer provides source feedback and the GPU texture. This implementation has not yet passed live GPU, brush or exported-image verification. Run checks contains full/empty mask, orientation and erase fixtures for that verification. Fine detail is limited by the 1024px mask raster. [Evidence](../experiments/results/painted-mask.json) and a [codec-generated fixture](../experiments/results/painted-subject.form) are retained. Native and artistic gates remain open.

10 October verification reran `npm test` and `npm run build`: all 52 tests passed and the TypeScript/production build succeeded. The four-study metadata fixture now uses the full 64-stroke and 512-point limits in every study. Browser/GPU checks were not rerun.
