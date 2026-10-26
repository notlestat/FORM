# Review status

**12 October 2026 current implementation:** [FORM 0.2.0 FIELD/FRAME alpha](FIRST_ALPHA.md) supersedes older implementation/scope statements below. Shared editable text/shapes, artboards, grids, contact sheets, reusable AFTERIMAGE definitions and format-4 projects are implemented. CPU/build checks pass; live visual/GPU/recovery and native platform acceptance remain incomplete. Earlier proposals and evidence below are historical.

**10 October, current FIELD:** the first connected workspace and composition/recovery implementation replaces the temporary single-study UI at the default URL. [FIRST_BUILD.md](FIRST_BUILD.md) separates implementation from evidence. Its CPU tests, TypeScript and production build pass; browser control remains blocked by a saved permission. New FIELD interaction, GPU export, IndexedDB recovery and visual approval remain pending. Historical verification below applies to the older bounded prototype, retained at `?legacy=1`.

9 October 2026.

Corey approved concept A, Spatial workbench, and the four bounded phase 1 experiments. The font and interface style must follow the original FORM brief. AFTERIMAGE-first was already confirmed. A functioning study now imports photographs, renders guided exposures, supports direct trajectory/elliptical-region edits and exports tiled PNGs. See [phase 1 findings](PHASE1_RESULTS.md).

Validation completed: fifty-two automated tests (ten processing, seven trajectory, eight mask, ten project file, nine command and eight workspace tests), TypeScript/build, local rendering comparisons, direct drag/undo and 4K PNG integrity. Exploratory 8K export completed. Native macOS/Windows rendering and artistic/usability review remain open. Earlier planning checks included Markdown links, whitespace and extracted review JavaScript syntax.

The original planning HTML remains a historical three-concept proposal. Its local-file screenshot inspection was blocked, so that artifact's layout/controls must not be called browser-tested. The functioning localhost experiment has been inspected separately in Chromium and the Codex in-app browser.

The local Lavish server initially could not bind its port inside the sandbox. An authorised escalation opened the review session successfully. This proves the review session opened, not that its visual layout or controls passed inspection.

Design source: the user's written visual direction. The experiment bundles Archivo and uses neutral surfaces, a contextual inspector and restrained green handles. No supplied artwork references were available. Drawn subjects in the planning review are schematics; the experiment uses a documented public-domain photograph.

The region/trajectory refinement is implemented: region handles edit the source photograph, trajectory handles edit the result, rotation uses the image centre independently of the mask, and preview/export share a stable frame until Fit artwork is invoked. Real pointer tests covered both directions, undo and explicit fit. Updated rendering evidence is in experiments/results/region-trajectory-rendering.json.

Portable project saving/reopening is implemented and tested through actual downloads and file selection. A byte-identical roundtrip, cancelled replacement and failed-file preservation passed. See [project file scope and limits](PROJECT_FILES.md). This bounded foundation does not complete the shared FIELD graph or native persistence milestone.

The next bounded step implements a shared authoring history for parameters, placements, capture fitting, connection and name. Pointer and numeric transactions commit once; Escape restores the prior state. Browser tests verified exact placement/path/capture undo, redo, connection/export restoration, name cancellation, slider grouping and saved-state compatibility. Opening a project clears both history stacks. Independent study sources are now supported; shared graph operations remain future work. See [commands](COMMANDS.md) and [browser evidence](../experiments/results/command-history.json).

The next requested step adds one to four independent AFTERIMAGE studies. Browser checks passed for copies, separate parameters/history/presentation, source replacement isolation, additive import, the four-study bound, real file downloads and reopening. A four-study/two-source roundtrip produced identical archive entries. See [scope](MULTI_STUDY.md) and [evidence](../experiments/results/multi-study.json).

Browser permission was denied before the latest New project interaction, new strip at narrow width and staged decoded-dimension failure checks finished. Those checks remain unverified; the user preview was not refreshed after this denial. Native and artistic gates remain open. The temporary workbench design is not claimed as approved final design.

Draw trajectory is now implemented with seven passing geometry/history/file tests. Accepted strokes become one editable curve and one undo entry; cancellation/taps preserve prior state and the capture remains fixed. Corey explicitly allowed local browser testing, but a saved controller setting still denied access. Latest real-pointer and layout checks remain unverified. See [scope](DRAW_TRAJECTORY.md) and [evidence](../experiments/results/draw-trajectory.json).

Corey confirmed the drawn trajectory works. The subsequent painted subject feature has eight passing data/history/file tests, and the full 52-test suite and build pass. Alpha/orientation fixtures were added to the in-app checks but were not executed. Latest pointer, Canvas2D feather, GPU and export checks remain unverified under the saved browser block. See [scope](PAINTED_MASK.md) and [evidence](../experiments/results/painted-mask.json). AGENTS.md requires branch/PR review. The initial lack of commits/remote was resolved on 10 October by authorised GitHub setup; see [review workflow](GITHUB.md). The implementation remains unmerged.
