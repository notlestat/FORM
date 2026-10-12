# FORM

Experimental creative environment: place sources, connect processes, shape their outputs and compose artwork.

FORM 0.2.0 implements connected FIELD authoring and a minimum FRAME composition environment on `codex/first-alpha-frame`. AFTERIMAGE remains the first instrument. The expanded alpha adds editable Archivo text and geometric shapes, artboards with layout guides, proportionate group fitting, editable contact sheets, reusable AFTERIMAGE definitions and format-4 portable projects. See [alpha scope and test guide](docs/FIRST_ALPHA.md). Earlier interactions were accepted provisionally by Corey; this build still needs live visual/interaction and recovery review.

## Run

```sh
npm ci
npm run dev -- --port 5174 --strictPort
```

Open [the local FIELD preview](http://127.0.0.1:5174/). The older bounded study remains available at [Legacy study](http://127.0.0.1:5174/?legacy=1); it saves version 2 files. The default app saves format 4 and reads formats 1–4 by explicit migration. Legacy and older FIELD builds cannot open format 4.

1. Place a JPEG/PNG photograph, select it, then Create AFTERIMAGE.
2. Select the output. Draw a trajectory over it or edit its handles/numeric points.
3. Select Selection mode and edit the input photograph's coverage: ellipse, painted subject, closed boundary or imported luminance mask.
4. Linked copy places the same output again. Vary copies the editable upstream branch so it can develop independently.
5. Move, scale or rotate artwork. Shift-click images or Objects entries to select several; drag the selection together or use Align selection in the inspector. With three or more artworks, Distribute selection offers equal gaps or equal centres on either axis. Use Layer order to arrange overlaps and Opacity % to blend each placement. Mark the placements you want to include in export. The board stays an open canvas.
6. In FRAME, add an artboard, place Text/Rectangle/Ellipse using Place material, and fit selected artwork inside its margins. Select its label or Objects entry to export exact artboard dimensions. Make contact sheet creates linked copies with editable captions.
7. Save a portable `.form` file, reopen it, then export a transparent PNG at a 2K or 4K long edge.

Process stations arrange the dependency diagram; artwork placement changes the composition and export. Space + drag pans; wheel pans; pinch/Cmd/Ctrl + wheel zooms; F fits the selection. Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z or Ctrl+Y redoes; Escape cancels a gesture. Numeric controls provide precise alternatives. Delete/Backspace removes the selection; typing fields retain normal editing. Hold Shift while dragging a size handle to preserve current proportions. Rotation uses the artwork centre for both the handle and numeric control and supports continuous full turns. Export fits the included artwork automatically, independently of the viewport and proof background.

Local recovery keeps a browser-stored project snapshot after edits settle. A previous snapshot is offered for review on startup. Save a downloaded `.form` file for a portable copy; browser storage can be cleared and is not a backup.

## Verify

```sh
npm test
npm run build
git diff --check
```

120 CPU tests pass as of 12 October 2026. Technical checks in the inspector can compare same-browser composition tiles after browser access is restored. That comparison does not establish cross-device GPU equivalence.

The interface follows the written brief: self-hosted Archivo, restrained monochrome surfaces, thin rules, direct handles and contextual panels. Visual references have not been supplied; Corey accepted the preceding interface provisionally; the expanded alpha controls await review. The initial public-domain marble-head fixture is credited in [experiment instructions](experiments/README.md).

## Project references

- [Expanded alpha and test guide](docs/FIRST_ALPHA.md)
- [Artwork spacing](docs/ARTWORK_SPACING.md), [Artwork alignment](docs/ARTWORK_ALIGNMENT.md), [Artwork composition](docs/ARTWORK_COMPOSITION.md), [First FIELD build](docs/FIRST_BUILD.md), [architecture](docs/ARCHITECTURE.md), [design system](docs/DESIGN_SYSTEM.md)
- [Product vision](docs/PRODUCT_VISION.md), [interaction design](docs/INTERACTION_DESIGN.md), [roadmap](docs/ROADMAP.md)
- [Instruments](docs/INSTRUMENTS.md), [TouchDesigner bridge](docs/TOUCHDESIGNER.md), [research](docs/RESEARCH.md)
- [Historical phase 1 evidence](docs/PHASE1_RESULTS.md), [review status](docs/REVIEW_STATUS.md), [GitHub workflow](docs/GITHUB.md)
- [Original three-concept planning review](.lavish/form-plan/index.html)

Advanced FRAME typography/vector export, LIVE, camera/screen capture, further instruments, arbitrary custom subgraphs, TouchDesigner integration and native macOS/Windows hosting remain future milestones. No native platform support or complete acceptance pass is claimed.

Source is public at [notlestat/FORM](https://github.com/notlestat/FORM). Pull requests target `main`; merging requires Corey's explicit approval.
