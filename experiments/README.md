# FORM phase 1 experiments

`afterimage/core.ts` contains pure geometry; `renderer.ts` owns the isolated WebGL2 kernel; `export.ts` encodes row-band PNGs; `main.tsx` is the temporary interface. These are replaceable studies within approved phase 1.

## Repeat locally

1. `npm ci`, then `npm run dev -- --port 5174 --strictPort`.
2. Open http://127.0.0.1:5174 and wait for the source/result.
3. Open technical checks, run checks and download JSON.
4. Export 4K PNG; inspect transparency, edges and tile boundaries.
5. In Region mode, drag handles on the source and confirm the path/frame stay unchanged. In Trajectory mode, drag a point on the result and confirm the source region/frame stay unchanged. Undo the edit. Fit artwork should explicitly reframe; export should match that frame. Move the source label and confirm the artwork is unchanged. Disconnect and confirm export is disabled.
6. Open Object placement. Try a label drag, numeric placement and keyboard arrows; undo/redo each. Change an endpoint, Fit artwork, then undo the fit and the path separately. Change a numeric value and Escape before leaving it. Save/reopen and verify authored state returns with a fresh history.
7. Duplicate a study, change its count/path/proof, switch back and confirm the original is unchanged. Import another image and confirm it adds a study. Replace its source and confirm other studies remain intact. Save/reopen all studies; each reopened history should be fresh. Repeat up to four studies and confirm Import/Duplicate are unavailable.
8. Check New project cancellation/confirmation, narrow strip selection and malformed multi-image files. These latest UI checks remain outstanding after browser permission was denied; do not treat this procedure as completed evidence.
9. Repeat with authorised portrait, object and texture photographs. Record artistic observations separately from performance.

The development-only `window.formExperiment` exposes `runChecks`, `exportPNG(size)`, `getState` and `getCapabilities` for local probes. It is not a stable application/plugin API.

| Runtime | Evidence | Status |
| --- | --- | --- |
| Mac Chromium 154 | 2K repeat/tile, colour/opacity, 8K completion | Local checks pass |
| Codex in-app Chromium 155 | Initial report, direct drag/undo, 4K download | Local interaction/export evidence |
| macOS WKWebView/Tauri | None | Open |
| Windows WebView2/Tauri | None | Open |

For native targets use the same kernel/fixture and record OS, webview version, limits, DPR, report, exported image, context loss/recovery and process memory. A successful build alone does not pass rendering.

See [findings](../docs/PHASE1_RESULTS.md) for measurements and limits. `results/chromium-initial.json` predates the expanded 2K/colour tests. `afterimage-4096.png` is the actual default nine-exposure output.

## Drawn trajectory checks

Choose Draw trajectory, drag over the result and release. Confirm the artwork changes, four handles return, one Undo restores the exact old path and the frame stays fixed. Check a tap and a short stroke leave the curve/history unchanged. During another stroke, press Escape; test pointer capture loss and resize cancellation. Repeat at different FIELD zoom levels and confirm screen-to-artwork mapping. Save/reopen and export the retained curve. These latest pointer checks remain outstanding because a saved browser permission setting blocks access, despite renewed user approval. Seven automated drawing tests pass independently.

## Painted selection checks

Choose Painted subject under Selection shape. Paint the source, erase a gap, Undo/Redo, and verify the exact selection returns with path/capture unchanged. Try a dot, a long stroke, Escape, capture cancellation and different FIELD zoom levels. Reveal all/Clear selection must each be one undo step. Switch shape, duplicate, replace another source and save/reopen to check isolation and portability.

Run checks and inspect paintedMaskPass, its alpha/orientation detail and the selected-study tile comparison. Export PNG and inspect actual alpha and feathered edges. GPU fixtures are implemented but not executed in this milestone; earlier saved browser permissions still block agent verification. Record measurements and artistic judgement separately.
