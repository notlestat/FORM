# Artwork selection and alignment

10 October 2026. [Draft PR #4](https://github.com/notlestat/FORM/pull/4) is open/unmerged. Branch: `codex/artwork-alignment`, based on composition commit f43b5239df98199a903c8f64ffbc2bc0e4eb877d.

Select mode now supports several artworks at once. Shift-click an image, its label or its Objects entry to add/remove it. Select all artwork selects visible placements, including references. Plain clicking an Objects entry selects it alone; dragging an already selected image retains the multi-selection. Each selected image is outlined.

Drag any selected image to move the selection together. Arrow keys while an artwork label is focused nudge the selection by one field unit; Shift nudges by ten. A group drag commits one undo entry. Escape, pointer cancellation, lost capture, window blur or resize cancel the drag and restore the original document/redo branch. Escape outside a gesture clears the selection. Delete/Backspace or Remove selected removes all selected placements atomically, preserving shared process objects; Undo restores them. Text fields keep their normal editing shortcuts.

When several artworks are selected, the inspector offers left/right/top/bottom edges and horizontal/vertical centres. These align transformed image rectangles to the combined selection bounds. The rectangles include transparent pixels; alignment does not scan alpha silhouettes. Rotation, reflection, scale, opacity, stacking and connections remain unchanged. Missing or updating outputs disable alignment. Fit selection fits the combined bounds once outputs are ready.

Single-artwork scale/rotation handles and per-process inspectors are hidden during multi-selection to avoid applying an ambiguous operation to one member. Select one artwork to access these controls; Shift on its scale handle still preserves proportions. This step does not add group scaling/rotation, persistent groups or marquee selection.

Selection itself is presentation state and is not saved or placed in authoring history. Authored translations persist through the existing format-3 codec/recovery and determine PNG composition. No schema migration or new capture rectangle is required. Operation cache keys remain unchanged by alignment.

## Verification

- 91/91 CPU tests pass: seven new cases cover selection toggles, all six alignments with rotated/reflected/nonuniform images, unselected placement preservation, missing/invalid geometry rejection, group translation, history commit/cancellation/redo, atomic deletion/undo and portable roundtrip/cache identity.
- TypeScript, production build and git diff --check pass. The existing shared dependency chunk-size advisory remains.
- [CPU report](../experiments/results/artwork-alignment-cpu.json) · [test log](../experiments/results/artwork-alignment-tests.txt).
- Live pointer/keyboard/visual verification remains pending because the saved localhost permission blocks agent browser access. CPU evidence does not establish event behaviour or GPU/native/recovery correctness.

Corey reports the additional-image workflow works and requests the next build. This is user feedback; specific opacity, PNG, platform and recovery coverage is unknown. No merge is authorised.

## Local check

Place two images or a linked copy. In Select mode, Shift-click both Objects entries and check the inspector says two artworks. Drag either selected image; Undo/Redo, cancel another drag with Escape, then use Left edges or Horizontal centres. Try a rotated image. Save/reopen and export to inspect the arrangement. Delete the selection and Undo. Finally select one artwork and verify Shift resizing still retains proportions.
