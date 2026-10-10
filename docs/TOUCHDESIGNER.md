# TouchDesigner integration

Status: research-backed proposal, 9 October 2026. FORM remains independently useful. No integration, licence, installed TouchDesigner runtime or hardware compatibility has been tested here.

## Separate control from images

| Route | Official evidence | Proposed use and boundary |
| --- | --- | --- |
| WebSocket | Web Server DAT accepts browser clients, HTTP/WebSockets and binary data. [T01] WebSocket DAT connects to a server. [T02] | First route: FORM is client, a user-opened TouchDesigner bridge component is server. Parameter/status messages first, bounded image previews later. Do not attempt to connect two clients directly. |
| OSC | TouchDesigner OSC CHOPs use UDP. [T03] | Later native helper or Tauri service sends/receives UDP. Standard browser JavaScript needs a bridge. Use for sampled control, with sequence/time and loss policy. |
| Syphon / Spout | TouchDesigner exposes local texture sharing on macOS/Windows; its documented output formats and hardware restrictions differ. [T04] | Native adapters, same machine. Not a browser feature or a cross-network image protocol. Validate real OS/GPU combinations. |
| TouchEngine | Loads `.tox` components in another application. Requires installed TouchDesigner/TouchPlayer and a paid licence for external use; SDK links exist for Windows/macOS. [T05] | Later native host adapter and isolated engine process. Not a pure JavaScript `.tox` interpreter. |
| `.tox` component | Engine COMP exposes supported inputs/outputs and custom parameters; not every parameter kind transfers. [T06] | Define an explicit mapping contract for chosen components. Do not promise automatic wrapping of every network. |

## First feasible bridge, after the standalone slice

FORM's browser client connects to a bridge `.tox` that the user loads into a running TouchDesigner project. The bridge uses Web Server DAT and callbacks, with a narrow registry of exposed controls. It does not evaluate arbitrary received Python or expose arbitrary operator paths.

Proposed protocol v1:

- `hello`: protocol version, session ID, supported types and limits.
- `describe`: stable instrument/parameter IDs, labels, types, ranges and read/write permissions.
- `set`: parameter ID, value, sequence number and document transaction ID.
- `ack` / `state`: accepted value and revision; distinguish UI echoes using an origin ID.
- `subscribe`: chosen telemetry at a negotiated rate.
- `error`, `ping`, `disconnect`: actionable status and reconnect handling.

Set bounded payload sizes, schema validation and per-parameter coalescing. Initial control-rate target is 30 updates/second during dragging, plus a reliable final value. The exact target must be measured. Pulse/event messages need IDs and deduplication rather than coalescing. Standard browser WebSocket has no automatic backpressure, so application-level bounded queues are required. [T07]

Bind explicitly to loopback; the documented Web Server DAT default can listen on all interfaces. Validate origin and a per-session pairing token; do not store credentials in exported artwork. Browser origin and secure/mixed-content behaviour must be tested for localhost development, Tauri's origin and any future hosted client. Keep network hosting outside the first bridge scope.

Reconnect asks for current remote state and reports discrepancies before taking control again. Do not blindly replay old pulses. A disconnected live input remains visibly stale. A still capture stores the received frame and provenance, rather than claiming a later rerun will recreate it.

## Image exchange stages

1. Bounded preview: request/response or binary WebSocket frame with dimensions, format, colour/alpha metadata, sequence and timestamp. Start with an encoded 512px preview at a proposed 5 fps, only after measuring encoding and decode costs. One in-flight preview, newest-frame policy. This is not a production texture path.
2. Native sharing: platform bridge receives Syphon or Spout, then a measured presentation path. Possible designs include CPU staging into the WebView, a native composited view, or a future native renderer. Each has different copies, latency and UI integration costs. No zero-copy claim until demonstrated.
3. Embedded engine: TouchEngine host loads permitted `.tox`, enumerates supported parameters/data types and maps them to FORM ports. Pin component hash, runtime version, licence availability and asset dependencies. Test unload, crash, timeout and reload without losing FORM's document.

For every image path, measure end-to-end latency, copies, dropped frames, resolution, precision, alpha and colour behaviour. Texture sharing across different GPU APIs/devices may require conversions or may be unavailable. Syphon/Spout alone does not resolve the browser texture-import problem.

## Licensing and distribution

Derivative says embedding TouchEngine has no royalty, while external execution needs an eligible paid licence and installed runtime. [T05] Its licensing table distinguishes non-commercial/educational use from paid projects, which require appropriate commercial licensing. [T08] Treat this as a current documentation summary, not a distribution clearance.

Before release, confirm SDK redistribution terms, installer requirements and the exact target use with Derivative. Verify each `.tox` author's licence and external dependencies separately. Owning a TouchDesigner licence does not establish permission to redistribute another author's component. Pricing is outside this plan and has not been quoted.

## Bridge acceptance and fallback

A later bridge milestone passes when a slider controls a declared remote parameter, state returns correctly, malformed messages are rejected, queues stay bounded and disconnect/reconnect is recoverable. A subsequent preview milestone must meet a declared latency budget on both platforms. If native texture exchange fails, ship the documented control bridge only and keep FORM's rendering independent.

## Official sources

- T01. [Web Server DAT](https://derivative.ca/UserGuide/Web_Server_DAT)
- T02. [WebSocket DAT](https://derivative.ca/UserGuide/WebSocket_DAT)
- T03. [OSC In CHOP](https://derivative.ca/UserGuide/OSC_In_CHOP)
- T04. [Syphon Spout Out TOP](https://derivative.ca/UserGuide/Syphon_Spout_Out_TOP). The page currently notes Nvidia/AMD for Windows Spout output, and different precision limits for Syphon and Spout. Treat this as a test-matrix constraint specific to the documented integration, not a universal statement about every Spout implementation.
- T05. [TouchEngine and SDK links](https://docs.derivative.ca/TouchEngine)
- T06. [Engine COMP](https://derivative.ca/UserGuide/Engine_COMP)
- T07. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- T08. [Derivative licensing](https://docs.derivative.ca/Licensing)
