# Roadmap

**10 October update:** Corey authorised the complete first FIELD build. The shared-graph vertical slice, composition, format-3 persistence and browser recovery are now implemented on `codex/field-first-build`. [Current scope and acceptance evidence](FIRST_BUILD.md) supersedes the phase-1-only boundary and older implementation status below. Integrated live/GPU/recovery verification remains pending; this is not a native desktop acceptance pass.

Status: phase 1 approved and underway, 9 October 2026. Local implementation and results are recorded in [PHASE1_RESULTS.md](PHASE1_RESULTS.md). No dates are promised before the technical and creative experiments establish scope.

## Approval boundary

Corey approved Spatial workbench A and the four bounded phase 1 experiments. The original design review uses schematic illustrations; the phase 1 study now renders actual photographic exposures.

Approved scope: concept A, spatial workbench, and phase 1 technical/creative experiments only. Review those results before authorising the full FIELD vertical slice. The user's brief explicitly requires approval before major implementation and review of interface proposals first.

## Phases and dependencies

| Phase | Scope | Exit evidence | Depends on |
| --- | --- | --- | --- |
| 0, this delivery | Product, architecture, concepts, risk and source register | Six requested docs plus research/bridge/decisions; inspectable three-concept review | Written brief; references still missing |
| 1, approved / underway | AFTERIMAGE quality study; browser/Tauri renderer checks; export-memory experiment; interaction trial | Real-image comparisons, measured environment matrix, tile/reference comparison, chosen interaction | Concept approval and permitted image fixtures |
| 2 | Shared document, commands, FIELD placement and connected AFTERIMAGE | Complete ten-item workflow below; correct undo and incremental evaluation | Phase 1 creative and technical pass |
| 3 | Save/recovery/export hardening and desktop alpha | Portable projects, corrupt-file handling, context-loss recovery, macOS/Windows QA | Phase 2 |
| 4 | Artist-led refinement and minimum FRAME | Several finished works; precise composition that remains linked | Standalone alpha proves useful |
| 5 | WebSocket TouchDesigner control bridge; optional preview experiment | Protocol and reconnection tests; measured latency | Stable instrument contract; available runtime/licence |
| 6 | LIVE, one further instrument, native texture/TouchEngine studies as justified | Separate acceptance review for each capability | Validated user need and phase-specific design |

Phases 5 and 6 are future options, not commitments to add every capability. FRAME typography, TYPE and live media require dedicated shaping, colour and timing work.

## Phase 1 experiments

| ID | Question | Experiment | Pass / decision if it fails |
| --- | --- | --- | --- |
| S1 | Does AFTERIMAGE produce useful artwork? | Permitted portrait, hard-edged object, texture; varied trajectory, mask and weighting | Corey approves range and edge quality; otherwise revise instrument before UI expansion |
| S2 | Can the render path run where needed? | Same small image/mask/accumulation fixture in browser and actual Tauri webviews on both OSes | Record formats, limits, loss/recovery and visual comparisons; narrow support or reconsider backend |
| S3 | Can high-resolution output avoid seams/OOM? | Tile/untiled match at 2K; required 4096² export; exploratory 8192² with working-set log | Accurate 4K output and bounded allocations; revise export/source limits before broad implementation |
| S4 | Is spatial editing understandable? | User distinguishes placement drag, trajectory edit and connection change | Clear prediction of affected outputs; revise concept if relationships stay confusing |

Do not create a sprawling app during these experiments. Keep temporary evaluators and benchmark fixtures replaceable. Record findings in the decision log before promoting code.

## Ten-item vertical-slice acceptance

| Brief requirement | Demonstration | Verification |
| --- | --- | --- |
| 1. Infinite canvas | Pan/zoom, fit selection, objects far from origin | Transform round trips; no zoom-dependent drift |
| 2. Import photographs | JPEG/PNG, orientation, cancelled/failed import | Known fixtures including corrupt and oversized inputs |
| 3. Move/transform | Translate, scale, rotate; numeric alternative | Undo restores exact authored transform |
| 4. Procedural visual object | AFTERIMAGE output from real source and authored path | Algorithm tests plus human artwork review |
| 5. Connect operation | Explicit source/path/mask input links | Type mismatch and cycle rejected without mutation |
| 6. Update outputs | Change count/path/source; dependent outputs update | Unrelated branch stays cached; obsolete results discarded |
| 7. Direct manipulation | Drag path points over selected output | Screen/source coordinate and transaction tests |
| 8. Deterministic regeneration | Locked seed, save/reopen and reevaluate | Exact authored/CPU geometry equality; GPU tolerance measured |
| 9. Save/reopen | Portable `.form` after moving original source file | Asset hashes, missing versions, migration and interrupted-save tests |
| 10. Finished export | Explicit capture region at 4096 × 4096 | Correct crop, alpha, dimensions, colour, tiles and current revision |

All ten must pass as one user journey. Separate disconnected demos do not constitute the prototype.

## Performance targets, not measurements

Start with a 2048px-long-edge proxy, 24 exposures, one active output and 20 FIELD placements at a 1440 × 900 viewport. Record hardware, OS, browser/webview, DPR and backend for every result. Test a current Apple Silicon Mac and a Windows integrated-GPU laptop before claiming desktop coverage; add a discrete GPU for native sharing later.

Provisional targets: p95 pan/zoom frame ≤16.7ms with cached outputs; p95 edit-to-visible preview ≤100ms; refined preview ≤500ms after release; no unexplained allocation growth across 100 edit/undo cycles. These are design budgets to accept or revise after S2, not release promises. Export throughput is measured in S3 before setting a target.

Collect CPU timing, GPU timing where supported, estimated texture/buffer bytes, process memory, cancelled jobs, cache hits and end-to-end latency. Use warm/cold runs and at least 30 repeated interactions. Browser heap alone does not describe GPU or native memory.

## Major risks

| Risk | Severity | Trigger / mitigation | Decision owner |
| --- | --- | --- | --- |
| Weak photographic results | Critical | S1 fails artist review; narrow/rework masking and accumulation | Corey + instrument work |
| Spatial dependency confusion | High | S4 users cannot predict edits; revise explicit connection/selection rules | Interaction design |
| Webview/backend differences | High | S2 fails on target OS; support matrix or renderer decision changes | Architecture |
| Large sources/export memory | High | S3 exceeds budgets; tile source as well as output, restrict unsupported sizes visibly | Engine/export |
| Gamma, alpha or mask seams | High | Reference comparisons fail; explicit colour/alpha contract and overlap tests | Rendering |
| Save corruption or migration loss | Critical | Interrupted/corrupt fixtures; atomic writes, schema validation, retained originals | Document/storage |
| Stale/racing evaluation | High | Rapid edits publish wrong output; revision tagging and cancellation | Engine |
| Native texture transfer cost | High, later | Bridge latency/copies too high; control-only integration or renderer rethink | Native integration |
| Licensing/runtime assumptions | High, later | Required runtime/rights unavailable; gate component execution and distribution | Release review |
| Premature expansion | High | Additional instrument starts before useful complete workflow | Product scope |

## Test strategy

Unit/property tests target graph validity, dependency invalidation, coordinate inversion, curve sampling, command inverses, version migration and malformed-data rejection. Raster tests use small known inputs, edge cases and declared cross-device tolerances. Integration tests cover import → edit → vary → save → reopen → export and failed/cancelled paths. Human review judges useful artwork and discoverability.

Before desktop alpha, test context loss, disk-full/permission failures, missing assets, unknown instruments, cancelled export, large decompressed packages and recovery after restart. Test keyboard-only selection/manipulation and both themes. Native signing/notarisation, Windows signing/installer behaviour and updates need a release checklist once the distribution model is chosen.

## Immediate review decisions

Concept A and the four phase 1 experiments are approved. Review their actual results before the shared-document FIELD milestone. Supply visual references and a small set of permitted photographs before judging the instrument's artistic quality. Budget, minimum OS/hardware, typography and eventual commercial distribution remain open.

## Current bounded document step

After the interaction refinement, Corey requested the next build step. The single AFTERIMAGE study now saves/reopens a portable `.form` file, retaining embedded photograph, exact parameters/seed, connection, placements, capture and presentation. Real downloaded-file equality and rejected-file preservation are verified in [project file evidence](../experiments/results/project-roundtrip.json). General graph editing, full command history and native atomic save/recovery remain separate work; the ten-step FIELD journey above is not complete.

## Current command step

Corey requested the next build step after save/reopen worked. Before adding more objects, the current study now routes parameters, placements, capture, source connection and name through validated authoring commands. Pointer/numeric previews commit as one history entry and cancel without replacing the redo branch. Exact undo/redo and file compatibility are verified. Source replacement resets history; multi-object graph commands, incremental evaluation and native gates remain open. See [implemented scope](COMMANDS.md).

## Current multi-study step

Corey requested the next build step after authoring history worked. The bounded workspace now supports up to four independent AFTERIMAGE studies, comparison previews, additive photograph imports, duplication and portable saving of all studies with deduplicated assets. Per-study history/presentation survives switching; version 1 files migrate explicitly. See [implemented scope](MULTI_STUDY.md).

This does not declare phase 2 complete: shared graph connections, general commands, incremental evaluation, native persistence/platform tests and broader artwork review remain open. Browser access was denied before the final New project/narrow-layout/dimension-failure checks for this milestone.

## Current drawn trajectory step

The next requested step strengthens direct artistic control: draw movement over the AFTERIMAGE result, retain one editable curve and commit it as one undo action. Seven algorithm/history/file tests bring the suite to 44. This remains bounded AFTERIMAGE work; shared FIELD graph, native hosts and creative quality gates remain open. Browser approval was renewed, but a saved controller permission block still prevents real pointer verification. See [scope](DRAW_TRAJECTORY.md).

## Current painted subject step

After Corey confirmed drawn trajectories worked, the next bounded step adds manual paint/erase selection on source photographs. Brush strokes are editable, independently duplicated, undoable and portable. Eight tests bring the suite to 52. Rendering/export plumbing and in-app GPU fixtures are implemented; brush interaction, feathering and pixel/export checks are not yet verified through browser control. See [scope](PAINTED_MASK.md).

The development workflow requires a feature branch and a pull request before merging. This work is on codex/painted-subject-mask. No commits or GitHub remote existed at initial inspection. On 10 October Corey authorised repository creation, pushing and a PR, then requested public visibility. [GitHub review workflow](GITHUB.md) records the initialization baseline and complete-prototype review scope. No merge is authorised.


## Composition continuation, 10 October

After Corey reported the preceding build works for now and asked to continue, the next bounded step adds artwork layer order and opacity within FIELD. This begins precise composition controls without claiming a separate FRAME environment or passing the native/runtime gates. [Scope and evidence](ARTWORK_COMPOSITION.md).
