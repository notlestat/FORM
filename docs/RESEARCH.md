# Technology research

Checked 9 October 2026 against the official documentation linked below. Documentation establishes available APIs, not FORM's measured performance. Exact dependency versions should be chosen and locked during the approved setup; no packages have been installed.

Research access note: Agent Reach's Exa route returned `ERA_NEGOTIATION_FAILED`. Research continued through web search and official documentation. Several `docs.derivative.ca` pages returned 403; the equivalent official `derivative.ca/UserGuide` pages were readable.

## Candidate evaluation

| Candidate | Evidence | FORM recommendation and limitation |
| --- | --- | --- |
| React / TypeScript | React documents subscribing to external stores through `useSyncExternalStore`. [R01] | Use for controls and command adapters. Keep pointer-rate rendering and large buffers outside component state. Runtime validation is still required. |
| Zustand | Vanilla `createStore` exposes get/set/subscribe APIs without requiring a React component. [R02] | Use small stores for UI state and published document snapshots; mutations go through commands. It supplies neither graph evaluation nor a complete history system. |
| PixiJS | v8 provides WebGL/WebGPU renderers and currently recommends WebGL for production. Canvas fallback is listed as coming soon. [R03] | First 2D renderer candidate, explicitly requesting/checking WebGL2. No assumption of a Canvas fallback or free backend parity. |
| SVG | Resolution-independent vector description integrated with the DOM. [R04] | Editable overlay geometry and later vector serialization. Own geometry data independently; large path collections need benchmarking rather than one DOM element per segment. |
| Canvas 2D | Maximum dimensions/area depend on environment; canvas is a bitmap without semantic object information. [R05] | Useful for bounded masks, previews and reference tests. Not the document model or a guaranteed huge-image exporter. |
| Three.js | `WebGPURenderer` selects WebGPU and can fall back to WebGL2. [R06] | Defer until a 3D instrument. Its fallback does not prove arbitrary FORM shaders or texture exchange work across backends. |
| WebGL2 | Device limits, float render targets and readback costs require deliberate handling. [R07] | Initial GPU adapter. Probe formats and limits once, budget resources and avoid interactive readback. |
| WebGPU | Provides compute and rendering; availability remains environment-dependent and secure-context requirements apply. [R08] Safari 26 introduced support, so a blanket claim that Safari lacks WebGPU would be wrong. [R09] | Keep backend contracts ready for it, without writing two implementations immediately. Verify actual WKWebView/device capabilities, not a browser name. |
| TypeScript / WASM | WASM interacts with JavaScript through modules and linear memory. [R10] | Start algorithms in TypeScript workers. Consider Rust/WASM for measured geometry/encoding hotspots; account for transfer, copies, cancellation and toolchain costs. WASM is not automatically faster. |
| React Flow / custom | React Flow notes frequent node updates and component rerenders as performance concerns. [R11] | Custom FIELD selection/manipulation; optional later graph view over core data. React Flow must never become the processing engine. |
| Tauri | Windows uses WebView2; macOS uses system WKWebView. [R12] Capabilities constrain access to native commands. [R13] | Candidate desktop shell. Verify both webviews early; no promise that a browser prototype alone proves desktop feasibility. |
| Native Rust | Tauri can host narrow native services. [R13] | Files, validated IPC and later OSC/texture bridge adapters where needed. Rust is not necessary for every operation. A WebView does not grant native texture import automatically. |

## Browser and high-resolution limits

OffscreenCanvas can separate canvas work from the document and run in workers, but the exact renderer and browser combination still needs testing. It is an optimisation option, not a prerequisite. [R14]

Browser filesystem features vary and require capability checks. A download/upload path should remain the portable baseline; origin-private storage is recovery storage, not a user-visible project backup. [R15]

A file's compressed size is not its decoded memory cost. Query GPU dimensions, budget source/proxy/target allocations and preflight export. There is no universal safe maximum image size. A tiled output strategy must also address source texture size, effect footprints and PNG encoding memory. These are proposed engineering responses to the documented limits, not library guarantees.

## What research does not settle

- Minimum supported OS versions, GPUs and browsers; test actual target machines.
- Whether Pixi's initial rendering backend can meet photographic quality and colour requirements without excessive custom work.
- Half-float target/blending behaviour on each supported device.
- Actual sample count, interaction latency and export throughput for AFTERIMAGE.
- A low-copy path from native shared textures into the chosen presentation architecture.
- Installed TouchDesigner version, user licence, third-party `.tox` rights or access.
- Which provided visual references should determine instrument behaviour. None have arrived.

## Source register

All links below were accessed or returned as readable official documentation in this session. Source statements above are deliberately narrow; product decisions elsewhere are proposals.

- R01. [React external store subscription](https://react.dev/reference/react/useSyncExternalStore)
- R02. [Zustand vanilla store](https://zustand.docs.pmnd.rs/reference/apis/create-store.html)
- R03. [PixiJS renderers](https://pixijs.com/8.x/guides/components/renderers)
- R04. [MDN SVG](https://developer.mozilla.org/en-US/docs/Web/SVG)
- R05. [MDN canvas element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)
- R06. [Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
- R07. [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- R08. [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- R09. [WebKit Safari 26.2, including Safari 26 WebGPU history](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)
- R10. [MDN WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API)
- R11. [React Flow performance](https://reactflow.dev/learn/advanced-use/performance)
- R12. [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)
- R13. [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- R14. [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- R15. [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)

TouchDesigner-specific evidence is recorded alongside its integration plan in [TOUCHDESIGNER.md](TOUCHDESIGNER.md).
