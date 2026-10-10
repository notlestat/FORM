# Interaction design

Status: proposal v0.1. The visual review contains schematic layouts, not a functional FIELD implementation.

## Spatial operations

A visible object is a placement of material or a process output. An operation is an actual document entity with typed inputs, parameters and output ports. It may have several visual representations: a small labelled station in FIELD, handles over the selected output, an inspector or a graph node. All representations address the same entity and send the same commands.

The operation station contains its name, source/output references and evaluation status. It is not an empty box requiring the user to imagine the result. Its output appears beside it or at another chosen position. Selecting either can reveal the operation's artistic controls directly over the output.

**Proximity never creates a dependency.** Dragging an image near an operation does not connect it. FIELD arrangement, graph layout and artwork coordinates are distinct. Moving the output around FIELD does not alter its exposure path. Editing a path handle does.

## Five actions

| Action | First-version behaviour | Later extension |
| --- | --- | --- |
| PLACE | File drop or import; draw a path; add an output instance | Video, text, mesh and live source |
| CONNECT | Select source, choose compatible operation; or connect named ports | Connect signals and composite instruments |
| MANIPULATE | Object transforms; edit mask/path handles on selected artwork; exact values in inspector | Growth constraints and spatial deformations |
| PERFORM | Reserved in data design; absent from v0.1 product controls | Scrub time, record parameter motion, bind live input |
| CAPTURE | Set a rectangle, compose linked outputs, export PNG or save project | Artboards, image sequences and recording |

## Initial journey

1. Empty FIELD offers Import photograph and Open project. No sample artwork posing as a user result.
2. Drop a photograph. An image placement appears with its intrinsic dimensions available in the inspector. Import status is local to that object.
3. Select it and choose AFTERIMAGE from compatible manipulations. One transaction creates an operation, an explicit source connection, a starter trajectory and an output placement. A starter trajectory is ordinary editable data.
4. The output enters Edit trajectory. Click to add points; drag tangents; finish with Enter. Freehand drawing can be a later input method after curve fitting is validated.
5. A visible anchor identifies the unshifted exposure. Spacing marks show sample positions. Dragging a mark adjusts exposure distribution, not the object's position. Exact parameter fields offer the same control.
6. Enter Edit mask to isolate a subject with a closed path, or connect a grayscale mask. The mask overlay labels protected and moving areas. Feathering is editable.
7. Vary creates a separate AFTERIMAGE operation and path/mask branches for local edits, sharing the immutable photograph asset. Place linked copy instead creates another placement of the existing output. These are separate named actions.
8. Draw a capture rectangle. Include only explicitly selected artwork placements, then adjust crop and order. Reference images and operation controls never enter an export by accident.
9. Save `.form`; reopen; alter an upstream path; verify all linked placements update. Export renders the capture at requested dimensions.

## Three distinct interface concepts

### A. Spatial workbench, recommended

Sources sit left of the working area, operations occupy small movable labelled stations, and outputs can spread across the open canvas. Paths and masks appear over the selected output. Selection reveals a quiet dependency trace; a compact inspector sits at the right edge.

The main advantage is visible coexistence of source, process and variations. The cost is spatial clutter in large projects. Use user-created groups, focus selected branch and collapsed stations; never rearrange the workspace automatically after edits. This most directly tests the brief's defining hypothesis.

### B. Light table

One artwork occupies most of the screen. Material and variations live in a bottom strip. Selecting an instrument reveals a local control overlay and a small source trail. Return to FIELD overview exposes other objects.

The main advantage is judging photographic detail and mask edges. The cost is hidden branching and frequent focus changes. Choose it if full-size image judgement dominates the work. A focus action from concept A could adopt this later without replacing the document model.

### C. Process lanes

The workspace groups material, interventions and results into parallel vertical lanes. A user adds an operation in the intervention lane and draws its controls over the result. Several branches align for comparison.

The main advantage is predictable relationships and teaching. The cost is a more prescribed layout and weaker free arrangement. Lanes would be workspace containers, not execution order; only explicit edges determine processing.

These are different work patterns, not colour themes. Select one before building a functional prototype. Do not combine all three into a crowded first interface.

## Navigation and state rules

Use space-drag or middle-drag to pan, trackpad two-finger pan and pinch to zoom around the pointer. Provide visible zoom and Fit selection controls. Pointer wheel behaviour must be tested on both OS platforms. Avoid intercepting browser zoom when focus is in document controls.

Select mode uses drag for object movement. Edit trajectory and Edit mask have persistent mode labels and a Done action. Escape cancels an active drag or unfinished path before leaving the mode. Clicking through overlapped objects uses a named object list; keyboard users can select the same objects there.

One drag commits one undo step. Cancel restores the prior state. Arrow keys nudge a selected placement or selected control point; Shift uses the larger step. Numeric coordinate fields support precise changes without dragging. Zoom does not change handle hit-target size.

Connecting offers only compatible ports. A rejected connection explains the required type. Adapters such as image-to-mask must be explicit operations. A connection that creates a cycle is rejected without changing the document. Replacing an existing input is a single undoable transaction.

Delete placement removes that view. Delete operation explains its downstream effects and offers cancel or removal with visibly missing dependencies. It never silently flattens outputs. Bypass is available only when the instrument declares a valid input/output mapping.

## Honest evaluation states

States: ready, preview, updating, stale, missing input, unsupported and failed. An old successful image may remain visible during evaluation, but gets a Stale label. Export waits for the requested revision or explains failure; it cannot silently export an older cached result.

Missing assets retain their document IDs and offer relink. Unsupported instruments retain parameters and connections without executing. An aborted import or export leaves the document unchanged. GPU loss shows recovery progress and reconstructs resources from the document and assets.

## FRAME and LIVE continuity

A FRAME item references an existing output port and adds a composition transform, crop and optional mask. Editing the underlying operation affects all live placements. Make independent variation duplicates the relevant branch with new IDs. Capture snapshot explicitly stores an immutable raster with provenance.

LIVE binds time curves or signals to parameter IDs in the same operation registry. Authored values, animation and external overrides need explicit precedence and visual indicators. No arbitrary processing cycles: stateful simulation later requires declared delays, checkpointing and a deterministic clock. Scrubbing and live input replay are separate modes.

## Validation before implementation expands

Use the review walkthrough to test whether a designer distinguishes moving a result, editing a trajectory and changing a connection. Then test these distinctions with real images in the approved prototype. If people cannot reliably predict which objects update, revise the interaction before adding another instrument.

## Implemented phase 1 refinement, 9 October 2026

Region selection happens on the source photograph, with the excluded area dimmed and numeric alternatives available. Trajectory editing happens on the result. Mode guidance names the edited object and the effect. Choosing one does not alter the other. Region selection and rotation pivot are independent.

The result frame stays fixed across instrument edits and undo. Fit field changes the workspace camera; Fit artwork recalculates the result's capture rectangle. PNG export uses that visible capture rectangle. When artwork extends outside it, fit explicitly to include the full result before export. This study-level crop state is separate from the future shared-document capture object.

## Implemented authoring history

The single-study experiment now has Undo and Redo for instrument parameters, object positions, source connection, capture fitting and name. A pointer drag or numeric focus session commits one edit. Escape cancels a preview. Object labels accept keyboard arrow movement, with Shift for 10-unit steps; the Object placement inspector supplies numeric coordinates. Pan, zoom, selection, proof and manipulation mode do not consume authoring history. See [commands and boundaries](COMMANDS.md).
