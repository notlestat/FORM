# FORM first alpha — FIELD and FRAME

12 October 2026. Implementation on `codex/first-alpha-frame`, based on the accepted spacing branch at `a84b830`. This completes a broader composition milestone against the original FORM brief. It is not completion of every long-term environment and instrument in that brief.

## Implemented

- FIELD keeps its open spatial canvas, typed source/process connections, authored trajectories and subject selections, seeded AFTERIMAGE, independent variations and linked copies.
- FRAME uses the same document, graph and placements. Artboards have exact pixel sizes, positions, paper/transparent backgrounds and optional margin/column/gutter guides. Switching environments does not copy or flatten artwork.
- Editable Archivo text supports multiline content, word wrapping, size, weight, tracking, line height, alignment and ink colour in a bounded box. Text below the box is clipped. Grapheme-aware character spacing is implemented; complex-script shaping, glyph outlines, advanced kerning and font import are not.
- Rectangle and ellipse materials have editable dimensions, fill and outline. Their authoring settings remain editable; output/export is rasterized. They and text are typed image sources compatible with AFTERIMAGE.
- Materials use existing selection, centre rotation, Shift-proportional sizing, opacity, stacking and alignment. Linked copies share content; Vary makes independently editable copies.
- Group fitting maps selected artwork into an artboard's margins while preserving rotation, reflection and relative proportions. Existing scale limits still apply.
- Make contact sheet creates a new artboard containing linked copies and editable text captions. Originals stay in place. Changes to a process update its sheet copies. This is a composition utility, not the full proposed ARCHIVE instrument.
- FRAME artboard PNGs use exact dimensions up to 8192 per edge, optional paper background and the existing tiled sRGB pipeline. Cropping includes artwork marked In export; other artboard backgrounds and layout guides are omitted. References marked excluded still appear while composing but are omitted from exports. Blank artboards can export. All included outputs currently evaluate before an artboard capture; a broken included output outside the artboard can prevent export.
- Save instrument downloads a data-only `.form-instrument` containing AFTERIMAGE version 2, parameters/seed, connected trajectory, ellipse/painted/closed selection and optional operation frame. Select a rendered source and use Place material → Load instrument to apply a separate copy. Source coordinates/frame scale with source dimensions; jitter scales by the mean of X/Y factors. Settings exceeding established limits fail atomically. Imported image masks require the portable `.form` project instead of silently disappearing. This is a reusable single-instrument definition, not arbitrary subgraph plugins or executable code.
- Portable `.form` format 4 saves materials, graph, placements, artboards and original embedded photographs. Formats 1/2/3 migrate explicitly; future formats and version mismatches fail. Original files remain unchanged. Older app builds cannot open format 4.
- Existing authoring undo/redo and local recovery also cover materials/artboards. Contact sheet construction and instrument application commit as single undoable actions.

## Use

1. Continue an existing `.form` project or place a photograph and create AFTERIMAGE in FIELD.
2. Place material → Text/Rectangle/Ellipse adds artwork; select it to edit its content and transforms.
3. Switch to FRAME, use Add artboard in Objects (or Place material → Artboard), and choose a size or edit dimensions.
4. Select artwork and use Fit to artboard in the inspector. Compose images, type and shapes with the normal selection/transform controls.
5. Select an artboard in Objects or by its label. F fits its boundary; drag its label or edit X/Y to move its crop boundary. Artwork stays in place when the boundary moves.
6. Export artboard PNG captures that crop. Save/open `.form` retains the editable document. A4 preset is 2480 × 3508 pixels; PNG output does not embed print resolution or CMYK.
7. Select up to 12 artworks and Make contact sheet to build an editable study collection. The document's existing 32-placement/48-node budgets may permit fewer when a project is already populated; exceeding a budget preserves existing work.
8. Select an AFTERIMAGE, open Reusable instrument, and Save instrument. Select another rendered visual source and Load instrument to reuse it.

## Evidence and outstanding acceptance

120 automated CPU tests pass on 12 October, including original processing/geometry/package coverage and new material validation, wrapping, artboard grids, transformed group fitting, independent copies, contact sheet identity/history, format 3→4 migration, definition scaling/validation and failed-application atomicity. Full output: `experiments/results/first-alpha-tests.txt`. A Sol source review found and repaired generated-name limits in contact sheets and instrument outputs; maximum-length regressions were proven failing before repair, then passed. The bounded alpha re-review found no unresolved defects; it does not constitute a complete review of the entire inherited main-target diff. TypeScript/production build and diff whitespace check pass. The existing shared dependency chunk size advisory remains.

These checks do not prove browser pixels or interactions. Agent access to the local preview remains blocked by saved browser permission. No workaround browser was used. Live Archivo/shape rasterization, board crop/background/alpha/tile equivalence, new controls/discoverability, and save/reopen/restart recovery need a permitted browser pass and Corey's review. User acceptance of preceding steps does not imply acceptance of this build. Native macOS/Windows rendering remains untested.

The local preview runs on http://127.0.0.1:5174/. No deployment or merge is part of this milestone.

## Original brief coverage

| Brief requirement | Current evidence |
| --- | --- |
| Connected spatial FIELD | Implemented shared graph and editable artwork |
| First excellent instrument | AFTERIMAGE implemented; aesthetic and device acceptance incomplete |
| Precision FRAME | Minimum shared composition with type, shapes, grids and artboard raster capture implemented |
| ARCHIVE/contact sheets | Editable layout utility implemented; full archive instrument future |
| Custom instruments | Portable single-AFTERIMAGE definition implemented; arbitrary subgraphs/plugins future |
| LIVE/time/audio/video | Future; no placeholder environment shown |
| STRUCTURE/PRESS/TYPE/RECONSTRUCT | Future dedicated instrument work; text material does not claim TYPE |
| Camera/screen capture | Recorded future live-source requirement |
| TouchDesigner | Bridge architecture proposal only; no live connection claimed |
| Native desktop/GPU support | Browser implementation; native hosting and device acceptance future |
