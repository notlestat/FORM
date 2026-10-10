# Artwork composition

10 October 2026. Branch: `codex/artwork-composition`.

Overlapping artworks previously followed insertion order with no placement opacity control. Select artwork and use Bring to front, Send to back, Forward one or Back one, then set Opacity % from 0 to 100. The Objects artwork list shows the frontmost placement first. Canvas and PNG exports follow the saved order. Process-station order stays independent.

Opacity affects only the placed image: labels, handles and guides remain usable. A linked copy initially inherits opacity but can then change it independently. All layer and opacity edits participate in existing Undo/Redo and browser recovery. Layer-only edits keep the same AFTERIMAGE cache identity. Source photographs and operation parameters remain unchanged.

Stored placement order is back to front. Format 3 accepts an optional opacity field in [0,1]; absent opacity defaults to 1, so existing files retain their appearance. Portable roundtrips preserve both settings. Older application revisions can ignore opacity; reopen these files in the current build to retain the intended appearance.

Export uses a shared Canvas2D source-over composition pass for whole and tiled draws. Fully transparent, hidden and excluded placements do not contribute to export bounds or required outputs. If every included placement is transparent, export reports that visible artwork with opacity above 0% is required. Canvas selection remains available at 0%.

## Verification

- 84/84 CPU tests pass, including layer ordering, immutable graph/transform preservation, undo/redo and boundary no-ops, optional opacity validation, old format-3 defaults, exact portable roundtrip, zero-opacity export bounds and export draw submission/state restoration.
- Existing cache identity test now verifies layer order and opacity do not invalidate operation output.
- TypeScript, production build and whitespace checks pass. The existing shared dependency chunk size advisory remains.
- Tests use a recording Canvas2D context for composition submission; they do not prove rendered pixels or browser visual parity. Agent browser access remains blocked by the saved localhost permission.

[CPU evidence](../experiments/results/artwork-composition-cpu.json) · [test log](../experiments/results/artwork-composition-tests.txt).

## Local review

Place a linked copy over its original. Set the upper placement to 50%, move it forward/back and check the overlap changes. Undo/redo both edits; save and reopen the .form file. Export 2K/4K and inspect the order, transparency and edges. Set one placement to 0% and confirm it remains selectable while the export fits contributing artwork. Run inspector rendering checks for same-browser tiled comparison. These new interactions await user review.

Corey reports the preceding build is good for now. This is user-reported provisional acceptance with unknown test coverage; no merge or native/platform acceptance is inferred.
