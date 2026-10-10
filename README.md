# FORM

Experimental creative environment: place sources, connect processes, shape their outputs and compose artwork.

The first FIELD build is implemented on `codex/field-first-build`. AFTERIMAGE is the first instrument. It includes shared source/path/selection connections, independent variations, linked artwork copies, transformable composition, portable projects and local recovery. **Live interaction, GPU output and restart recovery still need verification.** See [first-build scope and evidence](docs/FIRST_BUILD.md).

## Run

```sh
npm ci
npm run dev -- --port 5174 --strictPort
```

Open [the local FIELD preview](http://127.0.0.1:5174/). The older bounded study remains available at [Legacy study](http://127.0.0.1:5174/?legacy=1); it saves version 2 files. FIELD saves version 3 and reads versions 1–3. Legacy cannot open version 3.

1. Place a JPEG/PNG photograph, select it, then Create AFTERIMAGE.
2. Select the output. Draw a trajectory over it or edit its handles/numeric points.
3. Select Selection mode and edit the input photograph's coverage: ellipse, painted subject, closed boundary or imported luminance mask.
4. Linked copy places the same output again. Vary copies the editable upstream branch so it can develop independently.
5. Move, scale or rotate artwork. Mark the placements you want to include in export. The board stays an open canvas.
6. Save a portable `.form` file, reopen it, then export a transparent PNG at a 2K or 4K long edge.

Process stations arrange the dependency diagram; artwork placement changes the composition and export. Space + drag pans; wheel pans; pinch/Cmd/Ctrl + wheel zooms; F fits the selection. Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z or Ctrl+Y redoes; Escape cancels a gesture. Numeric controls provide precise alternatives. Delete/Backspace removes the selection; typing fields retain normal editing. Hold Shift while dragging a size handle to preserve current proportions. Export fits the included artwork automatically, independently of the viewport and proof background.

Local recovery keeps a browser-stored project snapshot after edits settle. A previous snapshot is offered for review on startup. Save a downloaded `.form` file for a portable copy; browser storage can be cleared and is not a backup.

## Verify

```sh
npm test
npm run build
git diff --check
```

78 CPU tests pass as of 10 October 2026. Technical checks in the inspector can compare same-browser composition tiles after browser access is restored. That comparison does not establish cross-device GPU equivalence.

The interface follows the written brief: self-hosted Archivo, restrained monochrome surfaces, thin rules, direct handles and contextual panels. Visual references have not been supplied; the interface still needs Corey's visual approval. The initial public-domain marble-head fixture is credited in [experiment instructions](experiments/README.md).

## Project references

- [First FIELD build](docs/FIRST_BUILD.md), [architecture](docs/ARCHITECTURE.md), [design system](docs/DESIGN_SYSTEM.md)
- [Product vision](docs/PRODUCT_VISION.md), [interaction design](docs/INTERACTION_DESIGN.md), [roadmap](docs/ROADMAP.md)
- [Instruments](docs/INSTRUMENTS.md), [TouchDesigner bridge](docs/TOUCHDESIGNER.md), [research](docs/RESEARCH.md)
- [Historical phase 1 evidence](docs/PHASE1_RESULTS.md), [review status](docs/REVIEW_STATUS.md), [GitHub workflow](docs/GITHUB.md)
- [Original three-concept planning review](.lavish/form-plan/index.html)

FRAME, LIVE, camera/screen capture, further instruments, TouchDesigner integration and native macOS/Windows hosting remain future milestones. No native platform support or complete acceptance pass is claimed.

Source is public at [notlestat/FORM](https://github.com/notlestat/FORM). Pull requests target `main`; merging requires Corey's explicit approval.
