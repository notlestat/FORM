# Multiple AFTERIMAGE studies

Implemented 9 October 2026 after Corey requested the next build step.

## Workflow

1. Duplicate study copies the selected photograph, parameters, placements, capture and presentation into an independent variation.
2. Import photograph adds a study with fresh instrument settings. Replace source changes only the selected study.
3. Select a thumbnail to edit that study in FIELD. The strip keeps the other results available for comparison.
4. Study name labels that variation; Project name labels the containing file.
5. Save project includes every study. Open restores the selected study, all photographs and retained authoring/presentation.
6. New project starts one fresh study using the selected photograph. Export the current project first to keep its variations; unsaved changes trigger the replacement dialog.

The current bound is four studies. Import and Duplicate become unavailable at four; Replace source and New project remain available. There is no Remove study yet.

## Independence and rendering

Each study owns its authoring commands, up to 80 history entries, source connection, geometry, explicit capture and presentation. Switching preserves session history. A duplicate starts with a fresh history. Replacing an image resets only its study's history. Opening a file starts fresh histories for all studies.

Project naming, importing, duplicating and starting a project are outside per-study authoring undo. Save before an asset/project replacement when you need to return. Undo history is not serialized.

One study is actively evaluated and edited at a time. The strip uses cached, reduced previews; opening regenerates them sequentially. Original images are deduplicated by hash in the file and shared as immutable source data. This does not add shared graph connections, linked copies, simultaneous FIELD branches or multiple instruments.

Camera, editing mode and proof surface are retained separately for each study. Resize preserves the view; Fit field is explicit. Fit artwork changes the authored export frame and is undoable within that study. Export 4K PNG exports the selected study.

The interface extends FORM's existing Archivo typography, neutral surfaces and thin rules. It remains the temporary workbench, rather than an approved final interface. FRAME, LIVE, native hosting and the requested future camera inputs remain later work.

## Evidence and remaining checks

Browser checks passed for distinct previews, independent parameters, switching with preserved history/presentation, replacement isolation, additive imports, the four-study limit and save/reopen. Four studies using two distinct source files roundtripped with every archive entry identical at a fixed viewport. The second source is a generated test pattern; this does not establish photographic quality across multiple source images.

The final New project interaction, new strip at narrow width and the staged decoded-dimension failure check were interrupted by denied browser permission. They are implemented but not claimed as browser-verified. See [evidence](../experiments/results/multi-study.json). File/version tests pass; native platform and artistic review gates remain open.
