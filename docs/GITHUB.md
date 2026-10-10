# GitHub review workflow

[Draft PR #2](https://github.com/notlestat/FORM/pull/2) is open against `main`, verified at implementation commit `64af62f957d0c3836096f349d920752e117c5d2a`. It contains the connected FIELD build and inherited prototype. No PR is merged. Remaining live verification is explicit in the draft and [FIRST_BUILD.md](FIRST_BUILD.md).

The next implementation is on `codex/field-first-build`: the first connected FIELD workspace, composition and recovery. [First-build evidence](FIRST_BUILD.md) records 76 passing CPU tests and the live checks still pending. Because PR #1 is unmerged and `main` contains only initialization, this branch inherits the full prototype; its new PR targets `main` with that full scope. No merge is authorised.

10 October 2026.

Repository: [notlestat/FORM](https://github.com/notlestat/FORM), public at Corey's explicit request.

The first `main` commit contains repository initialization and the development workflow. The complete AFTERIMAGE prototype is on `codex/painted-subject-mask` in [PR #1](https://github.com/notlestat/FORM/pull/1), open for review and unmerged. Because the local project had no previous commits, the first implementation PR includes the whole prototype, not only the latest painted selection.

The implementation includes guided photographic exposures, source selections, direct trajectory drawing, per-study undo/redo, up to four independent studies, portable `.form` projects and tiled transparent PNG export. Planning documents and recorded experiment evidence are included.

Local validation on 10 October passed all 52 tests and the TypeScript/production build. Live painted brush, Canvas2D feathering, GPU orientation/alpha and exported edges still need verification. Native platform checks and final interface approval remain open. See [selection scope](PAINTED_MASK.md) and [review status](REVIEW_STATUS.md).

Pull requests target `main`. No merge is authorised without Corey's explicit approval.
