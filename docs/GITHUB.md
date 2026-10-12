# GitHub review workflow

12 October 2026: the expanded FORM 0.2.0 alpha is on `codex/first-alpha-frame`, based on spacing head `a84b830`. [Alpha scope and testing](FIRST_ALPHA.md) covers shared FRAME, editable text/shapes, artboards, contact sheets, reusable AFTERIMAGE definitions and format-4 migration. It inherits the existing unmerged feature stack; main still has initialization only. A main-target draft PR will carry the complete implementation for review. No merge is authorized.

[Draft PR #5](https://github.com/notlestat/FORM/pull/5) is open/unmerged, with spacing implementation at `ab230f0`. The current spacing step is on `codex/artwork-spacing`, based on alignment/fix head `85840d88a7fe78ae5841551d1c89576e2160c12b`. It adds size-aware equal gaps and equal centres, with 99 CPU tests/build passing. [Scope and evidence](ARTWORK_SPACING.md). The earlier unmerged PRs are inherited context; the new spacing review starts after that head.

[Draft PR #4](https://github.com/notlestat/FORM/pull/4) is open/unmerged, with the arrangement implementation at `fa6a1d9`. The preceding arrangement step is on `codex/artwork-alignment`, based on composition head `f43b5239df98199a903c8f64ffbc2bc0e4eb877d`. It implements multi-selection, collective movement/deletion and six alignments; 93 CPU tests/build pass. [Scope and evidence](ARTWORK_ALIGNMENT.md). It inherits the still-unmerged prototype, FIELD and composition PRs; new alignment review starts after that composition head.

[Draft PR #3](https://github.com/notlestat/FORM/pull/3) is open against `main`, with the composition implementation at `3d89f8a`. The preceding composition step is on `codex/artwork-composition`, based on FIELD commit `5aac947b97e79956e3c6752f488758a2d88d4883`. It adds placement layer order and opacity with 84 CPU tests/build passing. [Composition scope](ARTWORK_COMPOSITION.md) records remaining live checks.

[Draft PR #2](https://github.com/notlestat/FORM/pull/2) remains open against `main` for the first connected FIELD build. No PR is merged. Since `main` still contains only initialization, the composition branch also inherits the complete prototype and FIELD implementation. The new review should assess composition against PR #2's head while treating the full main-target diff as inherited context.

10 October 2026.

Repository: [notlestat/FORM](https://github.com/notlestat/FORM), public at Corey's explicit request.

The first `main` commit contains repository initialization and the development workflow. The complete AFTERIMAGE prototype is on `codex/painted-subject-mask` in [PR #1](https://github.com/notlestat/FORM/pull/1), open for review and unmerged. Because the local project had no previous commits, the first implementation PR includes the whole prototype, not only the latest painted selection.

The implementation includes guided photographic exposures, source selections, direct trajectory drawing, per-study undo/redo, up to four independent studies, portable `.form` projects and tiled transparent PNG export. Planning documents and recorded experiment evidence are included.

Local validation on 10 October passed all 52 tests and the TypeScript/production build. Live painted brush, Canvas2D feathering, GPU orientation/alpha and exported edges still need verification. Native platform checks and final interface approval remain open. See [selection scope](PAINTED_MASK.md) and [review status](REVIEW_STATUS.md).

Pull requests target `main`. No merge is authorised without Corey's explicit approval.
