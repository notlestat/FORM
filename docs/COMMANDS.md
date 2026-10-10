# Editing commands

Implemented 9 October 2026. Each AFTERIMAGE study now owns an independent authoring history.

## Use it

Undo and Redo sit below the instrument controls. Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z or Ctrl+Y redoes. The hint names the next available action.

One history covers exposure parameters, path/region edits, object positions, source connection, Fit artwork and study name. Reset study resets instrument parameters as one reversible action. It keeps the explicit capture frame, just as other parameter edits do.

A drag previews continuously and commits once on release. Escape or pointer cancellation restores the pre-edit state. Numeric path, region, seed and placement controls group changes while focused, then commit on blur. Escape cancels before leaving the field. Name changes commit on blur or Enter; Escape abandons the draft, and an empty name restores the current name.

Object placement provides a Source/Afterimage/Result selector and numeric coordinates. Object labels are keyboard focusable. Arrow keys move by one FIELD unit; Shift moves by ten. Label dragging changes placement without changing instrument geometry. Pan, zoom, selection, manipulation mode and proof do not consume authoring history. They remain saved presentation where applicable.

## State and transactions

`src/core/commands.ts` is independent of React, DOM and rendering. Typed edits produce validated authored states. The command store owns current authoring state; React receives detached views for controls and rendering. Snapshots retain exact floating-point geometry. An invalid edit leaves state, revision and history intact.

The history holds at most 80 before/after snapshots. Repeated previews in a transaction make one entry. Cancelling and no-op edits preserve the redo branch; a new committed change clears it. Returned state is cloned, so callers cannot mutate stored history. A monotonically increasing session revision records mutations; it is not a persisted document revision or an evaluation scheduler.

Switching studies preserves each session history. Duplicating starts a fresh history on the copy. Photograph replacement resets only the selected history; opening a project resets all histories. Asset-aware undo is not implemented. Project naming, importing, duplicating and New project are outside study authoring undo. Save first when you need to return to replaced work. `.form` versions 1 and 2 retain authored state, not undo stacks. This is bounded per-study history, not a general graph command system.

## Verification

Nine command tests cover mixed-edit inverses, 100 grouped previews, cancellation with redo preservation, no-op equality independent of property order, replacement of the redo branch, invalid edits, detached/bounded history, project reset and undo during a transaction. The full processing/trajectory/mask/project/command/workspace suite has 52 passing tests.

Browser tests verify actual placement/slider/path drags, keyboard movement and undo, source connection/export restoration, capture undo independent of path undo, numeric/name cancellation and save/reopen compatibility. See [evidence](../experiments/results/command-history.json) and the fixture-only [saved study](../experiments/results/command-history-study.form).

Subsequent browser checks verified switching between independent study histories and exact retained parameters/presentation, with fresh histories after opening. See [multiple-study evidence](../experiments/results/multi-study.json).

Draw trajectory previews provisional ink and commits the fitted curve as one authoring transaction on release. Short strokes and cancellation preserve the prior curve and redo branch. Seven drawing tests bring the current suite to 44. See [drawing scope](DRAW_TRAJECTORY.md); real pointer verification remains blocked by a saved browser permission setting.

Painted subject strokes, shape switching, Reveal all and Clear selection use the existing authoring history. Brush size/tool selection are transient interface settings. Eight new mask tests bring the suite to 52. See [painted selection](PAINTED_MASK.md).
