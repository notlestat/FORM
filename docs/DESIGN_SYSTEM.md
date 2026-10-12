# Design system

Status, 12 October 2026: the written FORM direction continues in FIELD/FRAME. Archivo Variable, neutral surfaces, restrained green selection, thin rules and contextual controls remain in use. src/field/style.css defines the current interface. FRAME artboards have explicit exportable backgrounds; dark proof remains a viewing aid. No new visual references were supplied. The expanded controls require live review.

## Direction

A restrained editorial workspace where the artwork carries the visual complexity. Align controls and labels; allow asymmetric arrangement inside FIELD. Use negative space to separate activities. Technical information is visible when it explains a dependency, parameter or rendering state.

Use a light neutral workspace by default, with a dark proofing option for luminous imagery. Theme changes affect interface surfaces only. Artwork colours, capture background and exports never change with the UI theme.

## Provisional tokens

The experiment uses closely related light tokens: field #e4e5df, paper #f4f4ef, ink #242823, rules #c5c9bf and active #326545. It currently offers a dark artwork proof surface, not a complete dark interface theme.

| Role | Light | Dark |
| --- | --- | --- |
| Workspace | `#e9e9e4` | `#181a19` |
| Panel | `#f6f6f2` | `#232624` |
| Primary text | `#171a18` | `#f0f1eb` |
| Secondary text | `#535b54` | `#b2b9b0` |
| Dividers | `#c1c6be` | `#525a53` |
| Active/focus | `#285b42` | `#b4d9a5` |

A muted green distinguishes editable handles and active dependencies. Black/white still carry most of the interface. State also uses text, icon shape or line style. Never rely on colour alone.

The phase 1 interface uses Archivo Variable, locally bundled through @fontsource-variable/archivo. Its compact grotesque forms suit the editorial/industrial brief; regular labels and a heavier FORM wordmark establish hierarchy. The SIL Open Font License is retained in public/Archivo-OFL.txt. Technical reports use system monospace. The earlier concept review used system fonts. Reference review may still refine the production typeface. Do not use condensed display type for controls.

Proposed UI sizes: 13–14px labels, 12px metadata, 16px primary controls, 1.4 line height. Review-document display headings can be larger; do not copy them into the app. Test 200% UI scaling. Smaller SVG labels in overview diagrams require a full-size layout for implementation review.

## Layout

Use a 4px spacing base, mostly 8/16/24px gaps. Top command strip approximately 44px; contextual inspector 256–320px; status line approximately 28px. These are prototypes to test on a 1280 × 800 laptop, not hard-coded minimums. The canvas gets remaining space. Panels collapse intentionally at narrow sizes; a mobile authoring product is outside the first release.

Thin rules separate controls. Square or subtly rounded edges suit the tools. Avoid a card around every concept, an icon wall or ornamental crosshairs. A grid is an optional alignment aid, not permanent background decoration.

## Component behaviour

- Object labels name the material or output; a selected label can reveal provenance and status.
- Contextual manipulation menus list only compatible actions. An empty compatibility set explains why.
- Numeric controls support typing, stepping and units; sliders supplement them.
- Path handles have a small visible centre and at least a 24px invisible hit area. Keyboard and numeric alternatives remain available.
- Connectors label port semantics on focus. Dashed lines indicate a proposed connection; solid lines indicate a committed one.
- Inspectors group artistic controls first, then source links and technical diagnostics.
- FIELD has no fixed capture box. FRAME artboard labels and outlines differ from artwork selection; column/margin guides never export.
- Modal dialogs are reserved for file operations, consequential deletion and unresolved relinking. Normal manipulation stays on canvas.

## Accessibility and motion

The canvas needs a parallel semantic object list and focusable commands. Provide accessible names, a predictable focus order, Escape behaviour, focus return from dialogs and live announcements for save/error states. Drag operations need keyboard/numeric alternatives. Verify text contrast at WCAG AA targets and focus boundaries in both themes.

Cursor/handle feedback is immediate. Selection fades may use 80–120ms; panel changes 120–160ms. Avoid inertia that prevents precise stopping. Respect reduced motion and never animate an artwork parameter merely to decorate the UI. Performance previews must not move the user's view.

## Reference review still required

When artwork references arrive, examine control density, crop, type scale and whether the interface gives the work enough room. Review visual judgement using real photographs. Schematic silhouettes in the current proposal are explanatory drawings, not an aesthetic target or proof of AFTERIMAGE quality.
