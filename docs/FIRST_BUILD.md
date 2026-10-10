# First FIELD build

10 October 2026. Corey requested: “whats the next steps for the first build lets just build the whole thing”. This authorises the first FIELD vertical slice described in the brief. It supersedes the earlier phase-1-only implementation boundary; future FRAME/LIVE/native milestones remain separately scoped.

## Open-canvas interaction update

Corey requested Delete-to-remove, Shift proportional resizing and a full canvas without the capture box. FIELD now implements these behaviours. Artwork deletion removes its placement while retaining shared process objects; deleting a process station removes that object and its views and disconnects downstream inputs. Both are undoable. Delete/Backspace is ignored during text/numeric editing, composition input, repeated key events, busy work or gestures. Shift resizing preserves the current aspect ratio, including existing anisotropic proportions and reflection. Artwork rotation now fixes its transformed centre rather than pivoting around a corner. The top-centre handle and numeric rotation control use the same geometry; angle wrapping is accumulated continuously for full turns. Reflected/nonuniform scale and exact centre preservation are CPU-tested. Capture mode, its box and controls are removed. Export automatically fits the visible included artwork.

## Implemented journey

Import → connect → manipulate → vary → compose → save/reopen → export.

| Brief requirement | Implementation | Current evidence |
| --- | --- | --- |
| Infinite field | Pan, cursor-anchored zoom, fit selection, process stations and placed artwork | Coordinate inversion/zoom tests; live interaction pending |
| Photograph import | Immutable JPEG/PNG bytes, hash deduplication, decoded dimension checks | Codec/integrity tests; browser decode/orientation/failed import pending |
| Move/transform | Artwork translation, anisotropic scale, reflection and rotation; numeric controls | Transform and command tests; handle interaction pending |
| Procedural object | AFTERIMAGE receives source image, trajectory and selection | Existing algorithm/seed tests; new graph GPU results pending |
| Explicit connections | Typed Image2D/Path2D/Mask2D inputs; source sharing and chained outputs | Type and cycle validation; UI connection checks pending |
| Dependent updates | Semantic SHA256 keys; dependency-first evaluation, shared-output memoization, cancellation and obsolete-publication guard | Cache identity tests; runtime cache/timing/race checks pending |
| Direct manipulation | Draw/edit a cubic path; ellipse, painted, closed or imported selection; open canvas | Curve/mask/history tests; actual pointer and Canvas2D feather tests pending |
| Deterministic regeneration | Locked seed, exact authored graph and immutable assets | CPU geometry/project equality; GPU tolerance pending |
| Save/reopen/recovery | Format 3 embedded assets; formats 1/2 migrate; IndexedDB snapshot with explicit restore review | Blank/full/legacy/corrupt codec tests; downloaded-file and restart recovery checks pending |
| Finished export | Frozen artwork, automatic export bounds, placement transforms and membership; aspect-preserving 2K/4K transparent PNG | Rectangular PNG byte/CRC/pixel orientation tests using a CPU renderer; real GPU/composition export pending |

All ten have implementation, but the integrated acceptance journey has **not** been verified. The old prototype's screenshots and PNGs are historical evidence and do not prove this FIELD build.

## Authorship and sharing

- A photograph object references immutable embedded bytes. Replacing one source updates its connected processes and is undoable.
- A linked copy places the same output again with independent composition transforms. Changing the operation updates every linked placement.
- Vary copies every editable upstream object, including source entities, while sharing the immutable original bytes. Later replacement or guide edits in that branch do not change the original.
- Replacing a source offers “Scale direct trajectories and frames” or “Keep source-space coordinates”. Normalized selections retain their relative position; placements stay fixed. Chained downstream guides retain their authored coordinate system. Scaling isolates a trajectory shared with an unrelated source branch.
- Source, trajectory and selection are explicit input objects. Connection controls replace one input atomically and reject invalid types/cycles. Disconnecting the image produces a visible missing-input error; disconnecting trajectory uses saved fallback points; disconnecting selection exposes the whole image.
- Moving a process station arranges the field diagram. Moving artwork changes the exported composition. Only visible placements marked Include in export are exported, in object-list order.

## Document and evaluation

`src/core/field.ts` owns the format-3 document, typed graph validation, authoring operations, bounded transaction history and legacy migration. `src/core/evaluation.ts` resolves connected inputs and semantic cache identity without DOM/backend state. Position, names, placement, capture and camera do not enter operation keys.

`src/field/engine.ts` evaluates shared dependencies once per request, serialises GPU jobs and retains bounded raster caches. Preview output is at most 768px per edge. Export re-evaluates at a 4096px long edge independently of preview. Linked placements reuse the same output. A chained output becomes a local image with its own origin and logical dimensions; path coordinates refer to that image.

The AFTERIMAGE kernel retains linear-sRGB accumulation. Composition is explicitly Canvas2D sRGB source-over; transparent PNG is tagged sRGB with straight alpha. This composition policy is declared in the document rather than presented as linear compositing.

Each authoring gesture commits one undo entry. Escape, pointer cancellation, lost capture, window blur and resize cancel the transaction and retain the prior redo branch. Camera navigation is presentation, outside authoring history. Open validates the entire package and decodes every embedded asset before presenting a replacement dialog. Undo history starts fresh on reopening.

## Bounds and limitations

48 objects, 32 artwork placements, 16 distinct assets; 24 MiB per source, 4096px per edge and 16 megapixels per image; 32 megapixels total decoded images; 60 MiB original asset bytes, 64 MiB project package, 1 MiB metadata.

Authoring history retains at most 64 entries within an estimated 16 MiB metadata budget. Painted selection retains the existing 64-stroke/512-point bounds. Closed boundaries have 3–256 normalized vertices.

Estimated raster cache budgets are 64 MiB preview and 192 MiB export. Export checks required intermediate canvases against 192 MiB; several 4K independent branches or a long chain can exceed this. Linked copies reuse their output. These are allocation policies, not measured total process/GPU memory guarantees. Each output is rasterized at a maximum 4K long edge, so magnifying a small area far beyond that resolution may reveal the raster limit. Final composition is tiled; operation intermediates are bounded full surfaces.

Assets displaced by replacement remain embedded for session undo rather than being silently deleted. Source bytes do not change. Stored format-3 capture metadata is retained for file compatibility; current FIELD export derives bounds from included artwork and ignores that old rectangle. Save downloads a package; no native atomic filesystem write is claimed. Recovery is local to this browser origin, not multi-device or multi-tab version coordination. Browser-cleared storage is lost. PNG and project downloads are client-side; there is no upload backend.

The legacy study is preserved at `?legacy=1`. Its format-2 writer cannot reopen format-3 FIELD documents. Native hosting, Windows/macOS renderer coverage, mobile authoring, FRAME, LIVE and camera/screen capture are not included.

## Evidence and remaining review

- `npm test`: **80/80 passed** (52 retained prototype tests, 28 new FIELD/export tests).
- `npm run build`: TypeScript and production build passed. The shared renderer/UI dependency chunk remains above Vite's 500 kB advisory size.
- `git diff --check`: passed.
- [CPU report](../experiments/results/field-first-build-cpu.json) and [portable FIELD fixture](../experiments/results/field-first-build.form) retain reproducible scope.
- [Fixture generator](../experiments/field/fixture.ts) creates a permitted-image project with linked artwork, a separate editable branch and a rectangular capture. It does not generate or verify a GPU image.

The browser tool reports a saved permission blocking `http://127.0.0.1:5174/`. Corey has authorised local testing and requested that the block be cleared, but no callable setting is available and native computer use explicitly blocks Codex itself. No alternate browser automation or raw browser protocol was used.

Once that setting is cleared, test the whole journey in FIELD: import an oriented image; connect/disconnect; edit shared and varied guides; drag, rotate and scale with/without Shift; delete a selected object; cancel and undo; include multiple placements and verify automatic export bounds; save/download/reopen; reload and review recovery; export rectangular 2K/4K captures; inspect transparency, crop and edges; compare technical tiles; trigger renderer recovery. Repeat on supported target devices before claiming native/platform readiness. Corey must approve interface and artwork quality separately.
