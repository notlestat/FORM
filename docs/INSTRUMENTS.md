# Instruments

Status, 12 October 2026: AFTERIMAGE version 2 is implemented with typed connections, editable trajectory/selection, seeds and reusable data-only definitions. Further instruments below remain proposals. Text and shapes are source materials, and contact sheets are a layout utility; neither claims full TYPE/ARCHIVE. Live rendering and artistic acceptance remain incomplete. See [current alpha](FIRST_ALPHA.md).

## Contract

An instrument describes typed inputs/outputs, versioned parameters, bounds, deterministic behaviour, backend requirements, cancellation, memory estimates and evaluation quality. It also describes what the artist can manipulate directly. Controls emit document commands; they do not contain a separate rendering algorithm.

The minimum registration contains a stable instrument ID and version, parameter schema and migrations, input/output declarations, evaluation implementation, output-region dependency function, handle bindings and diagnostics. Human labels can change without changing serialized IDs.

User-defined instruments eventually save a subgraph with named external ports and mapped parameters. A saved instrument pins its internal operation versions. Updating a library definition should offer a preview and migration, never silently alter existing artwork.

## AFTERIMAGE v0.1

The first version constructs synthetic exposures of one still photograph along an authored trajectory. It does not recover actual movement or unseen moments. Temporal displacement and video exposure accumulation are later capabilities requiring frame streams and time semantics.

Inputs: required `Image2D source`, required `Path2D trajectory`, optional `Mask2D movingRegion`. A missing mask means full-image movement. A manual closed-path mask or imported grayscale mask can supply `movingRegion`.

Outputs: `Image2D artwork` with expanded bounds. The UI can show the trajectory and sample marks, but these overlays are not baked into the output. A future exposure-geometry output should be added only for a consuming workflow.

### Artistic controls

| Parameter | Proposed range/meaning | Direct interaction |
| --- | --- | --- |
| Exposure count | 1–64, integer; final samples, not preview quality | Add/remove marks or numeric field |
| Path | Cubic segments in oriented source pixels | Points and tangent handles |
| Distribution | Monotone curve mapping 0–1 to path distance | Move sample-distribution handles |
| Anchor | Source-space point used as transform pivot | Drag labelled anchor |
| Falloff | Non-negative opacity/exposure weights along the path | Edit endpoint weights/curve |
| Orientation | Fixed, or follow tangent relative to first tangent | Rotation handle and explicit mode |
| Mask feather | Source-space distance, bounded by implementation limit | Mask-edge handle and numeric field |
| Composition mode | Ordered ghosts or normalised exposure | Named choice with visual explanation |
| Background | Original photograph or transparent | Explicit choice |
| Variation | Optional bounded positional variation and stored seed | Amplitude; Lock seed; New seed |

The range values are design proposals to benchmark, not validated capabilities. Prioritise path, count, falloff and mask before introducing more controls.

### Proposed algorithm

1. Decode orientation and establish the working colour/alpha convention described in ARCHITECTURE.
2. Rasterise the editable mask at requested resolution with declared feather support. Keep its vector source.
3. Build an arc-length lookup of the Bézier path with a bounded error tolerance independent of viewport zoom.
4. For `N > 1`, choose `t_i = i/(N-1)`, map through a monotone distribution curve and sample the path by length. For `N = 1`, use the first point with zero relative displacement. A zero-length path has a stable fixed orientation.
5. Offset each exposure by `P(t_i) - P(0)`. Rotation, if enabled, is relative to the initial tangent about the chosen anchor. Transform mask and source together. Bounds are the union of transformed extents plus feather/filter support.
6. Ordered ghosts composites premultiplied samples in documented start-to-end order. Later samples lie over earlier ones. Normalised exposure computes weighted premultiplied colour and alpha divided by the total positive weight, avoiding uncontrolled brightening. All-zero weights yield transparent output.
7. Composite the result over the selected background. Original background retains the original photograph beneath the moving subject. Transparent mode outputs the moving subject only. Removing the original subject would require a supplied clean plate or another explicit process; this version does not invent missing background.

Optional seeded offsets use stable sample indices. Disabling variation must produce the baseline exactly. A preview may use fewer samples while dragging but is labelled, and final rendering uses the authored count. Stable sampling avoids changing the overall trail every time quality changes.

This creates controllable discrete or dense exposures. It must pass an artwork review before being called useful. If it looks like weak duplicated cutouts, investigate mask quality, distribution and exposure weighting; do not conceal the limitation with decorative noise or blur presets.

### Tests that matter

Single-sample identity; zero-length path; empty/full/feathered masks; correct premultiplied edges; monotone sampling; rotated source-to-output bounds; seeded replay; transparent boundaries; no stale results after rapid edits; tile equality within tolerance. Compare mask edges against a high-contrast background and validate linear exposure weighting with known pixel values.

## Later instruments

| Instrument | Inputs → outputs | Main manual control | Research/implementation requirement |
| --- | --- | --- | --- |
| STRUCTURE | Path skeleton + constraints + optional density mask → geometry | Skeleton, exclusion zones, density anchors | Seeded constrained growth with collision/spacing rules, hierarchy and finite termination; sparse spatial indexing |
| RECONSTRUCT | Image + supplied depth or point/mesh data → spatial data or rendered image | Camera, depth scale, selection and fracture guides | Separate inferred depth from metric reconstruction; coordinate calibration, large-data loading and 3D renderer. Photogrammetry is a pipeline, not a shader |
| PRESS | Image + substrate/ink parameters → image and possibly separations | Feed direction, registration and local pressure | Material references and measured visual comparisons; model successive reproduction and local ink transfer rather than overlay texture |
| TYPE | Text + font data + paths/fields → glyph geometry/image | Baseline, glyph constraints, variable axes | Text shaping, font licensing, hinting, Unicode, editable text versus outlined glyph distinction |
| ARCHIVE | Asset collection + ordering/layout constraints → composition | Sequence, spacing, grouping and editorial rules | Stable asset metadata, linked placements, layout solver, manual overrides and typography integration |

## Cross-instrument examples

Future photograph chain: `Image source → Mask operation → Mask2D`, then image and mask feed AFTERIMAGE, whose image feeds a displacement operation with an explicit vector field. A composition references the resulting image port. Each conversion and dependency is visible and editable.

Future geometry chain: `Path skeleton → STRUCTURE → Geometry2D deformation → Graphite renderer → Image2D → composition/export`. Graphite rendering is a future material-rendering operation requiring its own visual research. Vector export can take the geometry branch before rasterisation; it cannot turn a graphite raster into genuine vectors.

The MVP exercises heterogeneous inputs with image, mask and path. It does not need six instruments to prove modularity.
