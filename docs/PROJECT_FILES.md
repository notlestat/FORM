# Project files

**12 October 2026 current implementation:** [FORM 0.2.0 FIELD/FRAME alpha](FIRST_ALPHA.md) supersedes older implementation/scope statements below. Shared editable text/shapes, artboards, grids, contact sheets, reusable AFTERIMAGE definitions and format-4 projects are implemented. CPU/build checks pass; live visual/GPU/recovery and native platform acceptance remain incomplete. Earlier proposals and evidence below are historical.

**FIELD format 3, 10 October:** the default app now embeds a typed graph, independent source/path/selection objects, linked artwork placements, capture, camera and explicit colour policy. It reads formats 1/2 by migration and writes format 3. Browser IndexedDB recovery is implemented but not live-verified. See [FIRST_BUILD.md](FIRST_BUILD.md) for current limits and evidence. The older study format documented below remains available in the legacy app.

Implemented 9 October 2026 for one to four AFTERIMAGE studies in a project.

## Save and reopen

Project name names the whole file; Study name names the selected variation. Save project downloads `<project-name>.form` with every study and its original photograph embedded. Open project selects that file again; dropping a `.form` file onto FIELD also opens it. Moving or deleting a separate photograph does not break the saved project. Handling stays local in the browser.

Each study retains its path, elliptical region, exposure settings, seed, source connection, three workspace positions, capture frame, camera, manipulation mode and proof surface. The selected study is retained too. Previews and export are regenerated from the original images and parameters. Proof backgrounds are presentation only; PNG export retains transparency.

If work differs from the last export, Open and New project offer Save current project, Keep current project or replacement. Saving downloads all current studies and leaves the choice open. Cancel keeps current work. All embedded images are checked and decoded before the current project is replaced. Invalid files leave authored state intact.

Opening starts fresh authoring histories. Switching studies preserves their histories during the session; replacing a photograph resets only that study's history. The file retains current edits, not undo stacks. See [multiple studies](MULTI_STUDY.md) and [editing commands](COMMANDS.md).

The checkpoint means a download was requested, not that the browser verified durable storage. Check Downloads. There is no autosave, recovery journal or native filesystem adapter. Window resizing preserves the camera; Fit field explicitly changes the view.

## Version 2 format

A ZIP containing stored entries only:

- `manifest.json`: format/instrument versions and document SHA-256/length.
- `document.json`: project identity/name, selected study ID and one to four study records.
- `assets/<sha256>.jpg` or `.png`: one original image per distinct content hash.

Each study wraps the existing version 1 study schema. Source, operation and output IDs are scoped within that study; this is not a shared graph. Duplicate studies share immutable original image bytes while their authoring records remain independent. Preview images, textures, object URLs and undo stacks are not serialized.

`src/core/workspace.ts` owns validation, duplication, version handling and packaging. `src/core/project.ts` retains the single-study schema and bounded ZIP reader. React owns file selection, image decoding and applying a fully prepared project. Unknown future formats and unsupported required instruments are rejected without overwriting the original.

## Compatibility and limits

Version 1 files still open as a single study with their exact authored records and original bytes retained. Subsequent Save downloads version 2; the selected original file is not rewritten. The legacy codec keeps its three-entry, 26 MiB package limit.

Version 2 permits three to six entries, up to four studies, a 64 MiB package and 60 MiB of unique images. Each image is capped at 24 MiB, 4096px per edge and 16 million pixels; metadata entries are capped at 128 KiB. Texture limits are checked against the active renderer. Actual decoded dimensions must match metadata for every image, including inactive studies. Decoding uses the browser and is not a hardened image decoder.

The loader checks ZIP layout/paths, entry counts and bounds, duplicate/overlapping data, CRCs, hashes, image signatures, study ownership/selection, conflicting shared-asset metadata, references, finite coordinates, parameter ranges, square capture and supported versions. Compressed entries, archive comments and extra files are unsupported. Nothing is extracted to disk.

## Verification

The full suite has 52 tests: ten processing, seven trajectory, eight mask, ten single-study file, nine command and eight workspace tests. Workspace tests cover detached copies, deduplicated assets, multiple sources, exact roundtrip, version 1 migration, identity/selection validation, limits and corrupt/missing/unexpected assets.

Actual browser downloads verified two independent variations and a four-study/two-source project. Reopening and resaving the four-study file at a fixed viewport produced byte-identical archive entries. Corrupt CRC data was rejected while the existing four studies remained intact. Retained fixture-only files: [two studies](../experiments/results/two-studies.form), [four studies](../experiments/results/four-studies.form), and [evidence](../experiments/results/multi-study.json).

Browser access was subsequently denied before the latest New project, narrow layout and decoded-dimension failure checks finished. Those checks remain unverified for this milestone. Earlier single-study dimension-failure evidence remains historical in [project-roundtrip.json](../experiments/results/project-roundtrip.json). Native interrupted-write and cross-platform rendering tests remain open.

Painted selection records require AFTERIMAGE instrument version 2. Existing ellipse-only files remain instrument version 1; container versions are unchanged. The manifest must match the highest required study instrument version. Current automated coverage is 52 tests, including eight mask tests. See [painted-mask compatibility](PAINTED_MASK.md).
