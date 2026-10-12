# Draw trajectory

Implemented 9 October 2026 as a bounded AFTERIMAGE interaction step.

## Use it

Choose Draw trajectory in the inspector, then press and drag across the result. The stroke appears as a line over the artwork. Release to replace the current trajectory with one smooth, editable curve. Adjust its four handles or numeric coordinates afterwards.

Direction matters: movement is measured from the stroke's start, following the existing AFTERIMAGE contract. The first exposure stays in place. Region still selects which source pixels repeat. Drawing changes only trajectory geometry; count, seed, region, placement and capture stay unchanged.

One accepted stroke makes one Draw trajectory undo entry. Undo returns the exact old curve; Redo restores the new one. A tap or stroke shorter than six screen pixels leaves the old curve and redo history intact. Escape, pointer cancellation, capture loss, window blur or resize cancels the stroke. Escape also leaves drawing mode when no stroke is active.

The capture stays fixed. Fit artwork explicitly includes exposures extending outside it, and remains a separate undoable action. Save/Open and PNG export use the same fitted path as the existing renderer. Numeric editing remains the keyboard alternative.

## Scope and fitting

A gesture becomes one cubic Bézier curve. This smooths noise but cannot preserve detailed loops, sharp corners or several separate strokes. The inspector states that limitation; this is not a multi-segment freehand path instrument.

`experiments/afterimage/trajectory.ts` has no DOM or rendering dependencies. The stroke collector uses spatial sampling, retains endpoints and compacts long strokes to at most 2048 points. Curve fitting resamples the polyline at uniform arc length and solves for two control points while keeping both endpoints fixed. Pointer timing does not weight the fit. Invalid coordinates and oversized data fail before authored state changes.

The interface freezes the screen-to-artwork transform for the gesture, displays only provisional ink while drawing and commits the fitted geometry on release. Authoring transactions provide cancellation and exact undo. Other editing, navigation and file actions are disabled during a stroke. Raw gesture samples and transient drawing mode are not saved; current version 1/2 file formats remain compatible.

The added button and drawing feedback follow FORM's existing Archivo typography, neutral surfaces and restrained manipulation colour. This does not approve the temporary workbench as the final design or add another instrument.

## Verification

Seven new tests cover sampling-speed independence, a bent arc within a stated error bound, reversed direction, taps/repeated/short samples, bounded detached collection, invalid data, exact one-step undo/cancellation and saved-path roundtrip. All 44 tests and the TypeScript/production build pass.

Browser testing was explicitly allowed by Corey, but the controller still rejected localhost access because of a saved permission block. Real pointer drawing, Escape/capture cancellation, scaled-coordinate behaviour and the latest interface layout remain unverified. The retained [drawn-trajectory.form](../experiments/results/drawn-trajectory.form) is generated through the codec from the public fixture; it is not a browser download or an artistic-quality result. [Evidence](../experiments/results/draw-trajectory.json) records the tested scope.
