# Painted subject selection

Implemented 9 October 2026 as the next bounded AFTERIMAGE step.

## Use it

Choose Painted subject under Selection shape. The selection starts empty. Paint on the source photograph to reveal the parts that repeat; choose Erase to remove background or open gaps. Brush size is the diameter as a percentage of the photograph's longer edge. Selection feather softens the completed selection.

Reveal all selects the entire photograph and clears the strokes. Clear selection starts empty again. Both actions are undoable. Switching back to Elliptical region retains painted strokes; switching again restores them. Use selection mask turns masking off without deleting it.

Each completed brush stroke is one undo step. A click paints a dot. Escape, pointer cancellation, capture loss, blur or resize cancels a pending stroke. Provisional brush ink appears on the source, then the output updates on release. Painting leaves trajectory, exposure parameters, seed, object placement and capture unchanged.

The same mask is sampled in source coordinates for every exposure. It therefore follows the selected source pixels through movement and rotation. Save/Open retains editable strokes, and duplicated studies get independent selection records. Replacing a source resets that study's instrument settings and selection. PNG export uses the active study's mask with transparency.

This is manual selection, not automatic subject detection. Numeric ellipse controls remain available when using Elliptical region. The new controls retain FORM's Archivo typography, neutral surfaces and restrained state accents.

## Data and bounds

`experiments/afterimage/mask.ts` owns normalized brush geometry, validation, detached edits, equality and bounded collection. Each selection allows up to 64 strokes and 512 points in total. Brush diameter is 1 to 40 percent. Gestures compact at 128 points or the smaller remaining point budget, retaining their first/latest endpoints; this can simplify a long, detailed stroke. UI coordinates are rounded to six decimal places. At the bound, Undo or Clear selection frees room.

`mask-raster.ts` generates source-space alpha using Canvas2D paint/erase strokes, then feathers it with padded blur. The raster's long edge is capped at 1024 pixels; padding is at most 77 pixels on each side. This bounds mask texture size but does not provide full source-resolution hair/detail masking for a 4096px photograph. Actual process/GPU memory is not measured for this step.

The source overlay and WebGL mask use the same rasterizer. The renderer caches one mask texture by source dimensions, geometry and feather, and reuses it across output tiles. Masking is applied before existing linear-light exposure accumulation. The image centre remains the rotation pivot; capture fitting stays explicit.

## File compatibility

Painted parameters require AFTERIMAGE instrument version 2, including retained inactive strokes. Existing ellipse-only projects remain instrument version 1. The `.form` container versions stay 1 and 2; manifest requirements must match the document's highest required instrument version. Older builds reject required instrument version 2 rather than silently discarding painted data.

New code still opens legacy single-study and existing multi-study files. Masks remain JSON authoring data, not PNG assets or GPU objects. Asset hashes, count/file limits and integrity checks remain in force. Four bounded painted studies were tested within the metadata budget.

## Verification

Eight new tests cover detached ordered strokes, bounds and invalid geometry, long-gesture compaction, exact undo/redo/cancellation, unchanged trajectory/capture, instrument requirements, saved mask roundtrip, independent duplicates, legacy/mixed workspaces and four-study metadata size. All 52 automated tests and the TypeScript/production build pass.

Run checks in the app now includes full/empty mask alpha, painted-dot orientation and erased-centre fixtures. It also compares tiled/untiled rendering for the currently selected study. These GPU checks are implemented but have not been executed for this milestone. Earlier browser control was denied by a saved setting, despite renewed user approval; real brush interaction, Canvas2D feathering, GPU alpha and latest layout/export quality still need browser verification. Native macOS/Windows gates remain open.

[painted-subject.form](../experiments/results/painted-subject.form) is a codec-generated two-study fixture, not a browser download or a photographic quality result. [Evidence](../experiments/results/painted-mask.json) distinguishes implemented behaviour from verified results.

On 10 October, `npm test` passed all 52 tests and `npm run build` passed again. The metadata test now fills all 64 strokes and 512 points in each of four studies. Live brush, feather, GPU and PNG checks remain open.

For the next manual check, select Painted subject and paint a small area near the top of the photograph. Confirm that the same area repeats in the result, erase a gap, then Undo and Redo. Save and reopen the project to confirm the selection survives. Under Technical checks, Run checks should report `paintedMaskPass: true` and `tilePass: true`. Export a PNG and inspect the selected edges on a contrasting background.

## Review workflow

The work is on `codex/painted-subject-mask`, following AGENTS.md. Initially the checkout had no commits or remote. On 10 October Corey authorised creating a GitHub repository, pushing the work and opening a PR, then explicitly requested public visibility. The initialization commit is now on main in [notlestat/FORM](https://github.com/notlestat/FORM). The first implementation PR includes the complete prototype because there was no earlier application baseline. See [GitHub review workflow](GITHUB.md). No merge is authorised.
