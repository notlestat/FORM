# Artwork spacing

10 October 2026. [Draft PR #5](https://github.com/notlestat/FORM/pull/5) is open/unmerged. Branch: `codex/artwork-spacing`, based on alignment/fix head 85840d88a7fe78ae5841551d1c89576e2160c12b.

Select at least three artworks, then use Distribute selection in the inspector: Horizontal gaps, Vertical gaps, Horizontal centres or Vertical centres. Both outer placements stay fixed; interior artwork moves along the chosen axis. Selection order and layer order do not determine the distribution: artworks are ordered spatially by their transformed rectangle centres, with stable ID tie-breaking.

Equal gaps accounts for different transformed image sizes. If the endpoints do not provide enough room for non-overlapping placement, the command reports an error and leaves every artwork unchanged. Move the two outer artworks farther apart or use equal centres. Equal centres uses evenly spaced centre positions and can overlap large images. All measurements use image rectangles, including transparent pixels, rather than alpha silhouettes.

Rotation, reflection, proportions, opacity, export membership, stacking and process connections are retained. Each distribution is one Undo/Redo command; repeating the same arrangement is a no-op within a 1e-8 field-unit tolerance. Existing format-3 projects, recovery and PNG export store/use the resulting ordinary transforms. No schema change is needed. Missing/updating outputs disable the controls.

## Evidence

- 99/99 CPU tests pass. Six new cases cover both axes and spacing modes, transformed sizes/reflections, fixed endpoints, selection-order independence, idempotence, insufficient-space rejection, unselected/missing artwork, one-step Undo/Redo and portable/cache/export-extent invariants.
- TypeScript, production build and git diff --check pass. The existing shared dependency chunk advisory remains.
- [CPU report](../experiments/results/artwork-spacing-cpu.json) · [test log](../experiments/results/artwork-spacing-tests.txt).
- Agent live/browser/visual verification remains blocked by saved localhost permission. New spacing interactions await user review; CPU geometry is not GPU/export pixel evidence.

Corey reports the preceding Shift-click correction works and requests continuation. Exact tested modes/devices are unknown; no merge/platform/recovery approval is inferred.

## Local check

Create three or four artwork placements and separate the two outer images. Shift-click to select them all. Try Horizontal gaps and verify the gaps match despite different image sizes/rotations. Undo, then try Horizontal centres. Repeat vertically. Save/reopen and export to inspect the composition. Select tightly overlapping artwork and confirm equal gaps reports insufficient room without moving anything.
