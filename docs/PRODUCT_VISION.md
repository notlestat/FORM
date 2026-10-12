# Product vision

**12 October 2026 current implementation:** [FORM 0.2.0 FIELD/FRAME alpha](FIRST_ALPHA.md) supersedes older implementation/scope statements below. Shared editable text/shapes, artboards, grids, contact sheets, reusable AFTERIMAGE definitions and format-4 projects are implemented. CPU/build checks pass; live visual/GPU/recovery and native platform acceptance remain incomplete. Earlier proposals and evidence below are historical.

Status: proposal v0.1, 9 October 2026. AFTERIMAGE-first is user-confirmed. Remaining scope awaits approval.

## The creative task

FORM lets an artist place visual material, build a process around it, intervene in that process and preserve a finished composition. The experiment and the result belong to the same document. Replacing a source, adjusting a path or changing a seed should remain possible after composition.

The initial user is a designer or art director who already works with photography and wants authored movement, repetition and deformation. Creative technologists need a deeper view of the same operations. These are intended audiences from the brief, not validated customer segments.

The defining interaction hypothesis is that a process can be encountered where its effect appears. An exposure trajectory, a growth skeleton or a print-registration handle becomes the main control. A graph explains and edits relationships when needed.

## Shared environments

- FIELD holds sources, operations, output instances, references and variations in a spatial workspace.
- FRAME places those outputs into precise compositions. It stores links to outputs, together with placement and crop decisions.
- LIVE adds explicit time and signal bindings to existing parameters. It does not create a second processing system.

FIELD comes first. Its capture region is a small composition feature needed to finish work, not an implementation of the full FRAME environment. LIVE and full FRAME navigation should not appear as working features in the first release.

### Future live camera sources — user requirement, 9 October 2026

Corey wants TouchDesigner-like live camera input later in FORM: the computer's built-in camera and other connected camera inputs should become visual sources that can feed instruments and LIVE. Explore camera → mask → AFTERIMAGE → live output/capture within the shared processing system.

This is a future requirement, outside the current still-image phase 1 study. Device/source support and recording/replay need a dedicated technical experiment. Corey's wording “camera from ur screen” may refer to the screen's built-in webcam; whether screen capture is also intended remains to be clarified when this work begins.

## What makes an instrument worth keeping

An instrument must accept meaningful input, expose artistic decisions, produce useful output and interact with other processes. A compelling still result takes priority over the number of instruments or panels shipped.

For AFTERIMAGE, the artist chooses where exposures travel, where they cluster, what stays still, what overlaps and what survives at the final crop. The source remains intact. A selected output reveals the path that created it.

Every creative edit is represented as source data, parameters, geometry, connections or time bindings. Raster export is a delivery copy. It does not replace the editable project. External live systems are a qualified exception: exact replay needs recorded inputs, compatible versions and capture metadata.

## Minimum viable application

One complete task: import a photograph, define a mask, draw a path, create AFTERIMAGE, reshape the path, compare a variation, arrange a capture, save, reopen and export.

Included:

- Pan/zoom FIELD; select, move, scale and rotate visual objects.
- Local JPEG/PNG import, portable embedded assets, source replacement.
- AFTERIMAGE with a cubic Bézier trajectory, exposure count, distribution, falloff, orientation and editable mask.
- A manual closed-path mask with feathering; imported grayscale masks. Automatic segmentation is outside scope.
- Explicit typed connections; selected-object lineage and a small graph inspector.
- Linked output placements and an explicit independent variation action.
- Undo/redo, seed locking, save/load, local recovery and a rectangular capture region.
- PNG output at validated sizes, with a required 4096 × 4096 acceptance case.

Excluded from v0.1: video input, animation timeline, audio, simulation feedback, 3D, photogrammetry, typography layout, full vector editing, print separation/CMYK/PDF, all other named instruments, TouchDesigner runtime integration, third-party executable plugins, cloud accounts and collaboration.

## Creative acceptance

Before expanding scope, Corey should be able to make three materially different compositions from one permitted photograph: sparse separated exposures, a dense directional accumulation and a tightly cropped study. Each must preserve intentional negative space and a recognisable chosen anchor.

Repeat with a hard-edged object and a textured subject. Judge mask seams, tonal clipping, unwanted background duplication and whether the path controls the result as expected. A successful demonstration includes reopening a project and deliberately revising the composition. Good screenshots alone do not pass.

With 3–5 invited designers, proposed usability targets are first guided export within 15 minutes and explaining which source controls an output without opening the graph. These are evaluation goals, not established findings.

## Unknowns

The exact visual language depends on missing references. Demand, pricing and commercial positioning have not been researched. The first experiment must establish whether drawn exposure paths produce enough artistic range. Performance budgets and minimum hardware remain provisional until measured.
