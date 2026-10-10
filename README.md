# FORM

Experimental creative environment. Spatial workbench A and four bounded phase 1 experiments approved on 9 October 2026.

**AFTERIMAGE phase 1 is running.** Import photographs, guide exposures along trajectories, adjust elliptical regions, compare up to four independent studies, save/reopen a portable `.form` project and export the selected study as a transparent 4K PNG. See [phase 1 findings](docs/PHASE1_RESULTS.md) for measured results and remaining gates.

The repository was empty at inspection: an existing `.git` directory on `main`, no commits, application code, dependencies, assets or project instructions. No supplied Pinterest boards or artwork references were available. The review illustrations describe interactions; they are not examples of an implemented instrument's output.

## Start here

Open [.lavish/form-plan/index.html](.lavish/form-plan/index.html) for three interface concepts, a FIELD walkthrough and the proposed approval scope. It works as a local HTML file. Lavish adds annotations and queued feedback.

1. [Product vision](docs/PRODUCT_VISION.md)
2. [Interaction design](docs/INTERACTION_DESIGN.md)
3. [Architecture](docs/ARCHITECTURE.md)
4. [Instruments](docs/INSTRUMENTS.md)
5. [Roadmap, acceptance tests and risks](docs/ROADMAP.md)
6. [Design system](docs/DESIGN_SYSTEM.md)
7. [Technology research and sources](docs/RESEARCH.md)
8. [TouchDesigner bridge](docs/TOUCHDESIGNER.md)
9. [Proposed architecture decisions](docs/DECISIONS.md)
10. [Review and validation status](docs/REVIEW_STATUS.md)

Recommendation: spatial workbench interaction, AFTERIMAGE first, a shared TypeScript document and evaluator, React controls and PixiJS WebGL2 rendering. Test Tauri on macOS and Windows before committing to a desktop release architecture. Start with bounded experiments after approval, then one complete FIELD workflow.

## Run and verify

```sh
npm ci
npm run dev -- --port 5174 --strictPort
```

Open http://127.0.0.1:5174. Use Region to select pixels on the source photograph, then Trajectory to guide their movement on the result. The result frame stays fixed while editing. Fit artwork explicitly includes the current full result; export uses the frame shown, so use Fit artwork if an edit extends beyond it. Drag object labels to arrange the field. Space + drag pans; pinch zooms; F fits. Precise controls provide numeric path and region alternatives. Undo and Redo cover instrument edits, placements, source connection, Fit artwork and the study name. Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z or Ctrl+Y redoes. Object placement provides numeric coordinates. Focus an object label and use arrow keys to move it; Shift moves by 10. Escape cancels an active edit. See [editing commands](docs/COMMANDS.md).

```sh
npm test
npm run build
```

Open technical checks → Run checks in the app for local rendering comparisons. [Experiment instructions](experiments/README.md) describe repeatable checks. [Actual 4K output](experiments/results/afterimage-4096.png) is retained.

The interface follows the written FORM brief: self-hosted Archivo, neutral surfaces, thin rules, restrained handles and an artwork-led spatial layout. The public-domain photograph is a fixture. No Pinterest boards or artwork references have been supplied.

Duplicate study makes an independent variation. Import photograph adds a study; Replace source changes the selected study. Select a result in the comparison strip to edit it. Each study retains its settings, capture, presentation and session history. New project starts again with the selected photograph. See [multiple studies](docs/MULTI_STUDY.md).

Save project downloads all studies and embeds each distinct original image once. Open restores the project; older single-study files remain supported. Keep the downloaded file; there is no autosave yet. See [project files](docs/PROJECT_FILES.md).

Each study contains one source, operation and output, with its own validated authoring history. The bounded workspace evaluates one selected study. General graph editing, shared operations, FRAME, LIVE and native hosting remain planned. Review the creative and platform gates before promoting this study into the FIELD application.

Draw trajectory lets you sketch movement over the selected result, release to apply a smooth curve, then refine its handles. Each stroke is one undo step; Escape cancels. Detailed loops and sharp corners are simplified. See [drawing scope and checks](docs/DRAW_TRAJECTORY.md).

Painted subject selection now lets you paint and erase the source pixels that repeat. Choose Painted subject under Selection shape, then paint on the photograph. Each stroke is undoable; Save/Open retains the editable mask. See [selection scope, bounds and remaining rendering checks](docs/PAINTED_MASK.md).

The [public GitHub repository](https://github.com/notlestat/FORM) was established on 10 October. The complete prototype is proposed in [PR #1](https://github.com/notlestat/FORM/pull/1) on `codex/painted-subject-mask`; the initial `main` commit contains repository setup only. See [GitHub review workflow](docs/GITHUB.md).
