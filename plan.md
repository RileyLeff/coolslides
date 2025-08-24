Title: Coolslides Project Plan (Rev. 2025-08-24)

Overview
This plan tracks what is done, what needs fixing, and what’s next for Coolslides. We keep TOML as the single authoring format, focus on a rock‑solid IR, CLI and runtime, and deliver a pro‑first, hackable system with deterministic exports.

Guiding principles
- One authoring format: TOML for SlideDoc and DeckManifest.
- Separation of concerns: IR/TOML is canonical; runtime modular; plugins add behavior; themes/tokens handle look‑and‑feel; devserver provides author‑time conveniences.
- Infinite hackability: first‑class onAdvance, transition orchestrator, persistent stages, scoped capabilities.
- Determinism and security: import maps + lockfile with SRI; strict/offline policies degrade gracefully.

Status at a glance
- Completed:
  - A1 Capability adapters implemented and documented (docs/capabilities.md).
  - A2 CLI init/new/add/dev/validate/export implemented; templates present; lockfile skeleton created; import map detection; --open supported.
  - A4 CodeSlide v2 implemented: devserver git resolve; onAdvance stepper; export embeds resolved content; docs added.
  - A5 Math plugin initial implementation + sanitizer “allow_math” path; docs added.
  - B1 onAdvance router integration implemented.
  - Dev/demo decks: examples/basic-deck and examples/showcase working; PDF/HTML export implemented.

- In progress / requires polish:
  - A4 CodeSlide styling/overflow + syntax highlighting add‑on.
  - A5 Math plugin reliability; KaTeX packaging guidance.
  - A3 Taps/registry and lockfile SRI integration (not started).
  - B2/B3 Transition Orchestrator + StageManager (not started).
  - B6 Rooms sync for steps/fragments/transitions (partial; slide sync only).

- Hot issues to fix (high priority):
  - Poll plugin rooms interop: adapter currently sends raw JSON; devserver expects RoomMessage::Event. Messages are not round‑tripping across clients.
  - PollWidget print snapshot uses bus.emit incorrectly (emit returns void).
  - Devserver should serve deck-local theme/token assets to eliminate tokens.css 404s when using deck-local paths.
  - Docs/CLI mismatch for export html flags.
  - Lockfile schema and docs need alignment and SRI work.

-------------------------------------------------------------------------------

Milestone A: Ecosystem and Pro Developer UX

A1. Capability adapters (DONE)
- Implemented in `packages/runtime/src/plugins.ts`.
- Docs: `docs/capabilities.md`.

A2. CLI: init/new/add/dev/validate/export (DONE; add polish)
Polish/fixes
- Fix docs/DEMO and README export invocation:
  - Current CLI expects: `coolslides export html <out-dir> --strict=<bool>`.
  - Update docs to avoid `--dir` flag and use positional dir for HTML export.
- Validate that `coolslides export html` rewrites `/packages/...` to `./packages/...` (already done) and add a note that Chrome/Chromium is required for PDF.
- Ensure `coolslides init --template` copies the template import map if present and always writes `importmap.json`.

Acceptance
- Commands and flags in README.md and `docs/DEMO.md` match the CLI behavior; quick start works copy‑paste.

Files
- `README.md`, `docs/DEMO.md`.
- (optional) Minor CLI help text tweaks in `apps/cli/src/main.rs`.

A3. Marketplace “taps” (registry) + lockfile SRI (NEW)
Context
- Registry and SRI have not been implemented. `docs/taps.md` and `docs/lockfile.md` missing.
- IR Lockfile type supports integrity per resolved package, but exports don’t compute/store SRI yet.

Tasks
- Define tap manifest and index format; write `docs/taps.md`.
- Implement CLI:
  - `coolslides tap add <git-url-or-gh:org/repo>`
  - `coolslides search <query> [type:, tag:]`
  - `coolslides publish <type> <path> --tap <repo>` (build, hash assets, write manifest, open PR).
- Implement SRI hashing:
  - Compute SRI for JS/CSS in import map on export/init/add.
  - For CodeSlide external code, store blob hash and a content hash in lockfile.
- Generate and persist `.coolslides.lock` with integrity and source info; document in `docs/lockfile.md`.

Acceptance
- Can add/search a git tap; publish a sample plugin/component manifest with SRI; lockfile persists SRI and tap info; exporters honor lockfile hashes.

Files
- `apps/cli/src/main.rs` (new subcommands and helpers).
- `docs/taps.md`, `docs/lockfile.md`.

A4. CodeSlide v2 polish (ONGOING)
Context
- Core flow is implemented. Styling and UX polish pending.

Tasks
- Add props: `wrap: "on"|"off"`, `overflowX: "scroll"|"hidden"`, `fitMode: "shrink"` with min/max font sizes.
- Dim unfocused lines in steps; improve auto-scroll accuracy.
- Syntax highlighting add‑on:
  - Provide optional Prism.js/highlight.js package (e.g., `@coolslides/highlight-prism`) with theme CSS.
  - Load when present; fallback to current lightweight highlighter.

Acceptance
- Long lines don’t overflow by default; optional wrap and scroll behaviors configurable via props; stepping dims non‑highlight lines; Prism add‑on works when installed, with deterministic output on export.

Files
- `packages/components/src/slides/CodeSlide.ts`
- New package: `packages/highlight-prism` (or add-on within components).

A5. Math plugin hardening (ONGOING)
Context
- Math plugin works but intermittent non-render was observed. KaTeX packaging guidance needed.

Tasks
- Add debug logs behind a flag; ensure slide re-processing on slide:enter/leave always updates math.
- Provide guidance or optional packaging for KaTeX CSS/JS (local assets for deterministic export) and update `docs/math.md`.
- Ensure sanitizer path (`allow_math`) toggles reliably by checking deck plugins at runtime: already set in server; verify for nested/group slides.

Acceptance
- Math reliably renders in dev and in HTML/PDF export; example deck includes KaTeX assets option with fully deterministic output.

Files
- `packages/plugins-stdlib/src/math/index.ts`, `docs/math.md`.
- (optional) theme/tap packaging for KaTeX assets.

A6. Overview mode plugin (NEW)
Tasks
- Implement `@coolslides/plugins-overview`:
  - Hotkey `O` toggles an overlay with slide thumbnails; click navigates.
  - Clone slide DOM for simple thumbs; obey prefers‑reduced‑motion.

Acceptance
- Overview grid opens with `O`, shows current deck; navigation works; overlay closes cleanly.

Files
- `packages/plugins-stdlib/src/overview/*`
- Styling co-located with plugin.

A7. Rooms adapter + poll interop (FIX)
Context
- Poll plugin uses capability `rooms.ws` and sends plain `{ type: 'poll:*', ... }`. The devserver rooms expects `RoomMessage::Event` with `{ type: 'event', event: { name, data, client_id }, timestamp }`. Currently poll messages won’t propagate across clients.

Tasks
- Update `packages/runtime/src/plugins.ts` rooms adapter:
  - Wrap `send(data)` as a RoomMessage event if `data?.type` is not `'event'`:
    - `ws.send(JSON.stringify({ type: 'event', event: { name: data.type, data, client_id: 'plugin' }, timestamp: Date.now() }))`.
  - In `onMessage(cb)`, if incoming `msg.type === 'event'`, call `cb(msg.event.data ?? msg.event)` for convenience.
- Optionally expose `sendEvent(name, data)` on the adapter wrapper.
- Add a minimal note in `docs/capabilities.md` clarifying that messages go through RoomMessage::Event in devserver.

Acceptance
- Poll plugin start/stop/response propagate across tabs using the same room; results update in real time.

Files
- `packages/runtime/src/plugins.ts`
- `docs/capabilities.md`

A8. Devserver deck-local assets (FIX)
Context
- tokens.css 404s can occur when decks rely on deck-local `themes/*` rather than repo-level `/themes`. Devserver currently only serves repo `/themes`.

Tasks
- Serve the active deck directory under a prefix (e.g., `/deck`), and in dev HTML use:
  - Theme href: relative path => `/deck/<relative>`
  - Tokens href: relative path => `/deck/<relative>`
- Keep absolute paths working as-is.
- Update `generate_export_html` (dev path) to write `<link href="/deck/...">` for relative manifest paths.

Acceptance
- Editing deck-local theme and tokens is reflected in dev without 404s; both repo-level and deck-level assets work.

Files
- `apps/devserver/src/lib.rs`:
  - Add `.nest_service("/deck", ServeDir::new(deck_root))`.
  - In `generate_export_html` dev branch, prefix relative theme/tokens with `/deck/`.

-------------------------------------------------------------------------------

Milestone B: Transitions and Staging

B1. Component-level onAdvance (DONE)
- Implemented in `packages/runtime/src/router.ts`; CodeSlide uses it.

Follow-up
- Document onAdvance in component SDK docs (optional), pointing to existing `docs/transitions.md`.

B2. Transition Orchestrator (NEW)
Tasks
- New module `transitions.ts`:
  - API: `register(name, handler, matchFn?)`, `run(fromId, toId, ctx)`.
  - Default handlers: `none`, `fade`, `slide`, `zoom`, plus a wrapper that leverages `FLIPAutoAnimateManager` for auto‑animate slides.
- Router integration:
  - Await orchestrator before finalizing navigation and accepting next input.

Acceptance
- Set `transitions.default = "fade"` in a deck; fades occur globally; per-slide overrides supported.

Files
- `packages/runtime/src/transitions.ts`
- `packages/runtime/src/router.ts` (integration)

B3. StageManager (NEW)
Tasks
- Introduce `stage.ts` with:
  - `mountLayer(id, factory, zIndex)`, `getLayer`, `unmountLayer`.
  - Fixed-position container above slides; cleans up on unload; respects reduced motion.

Acceptance
- A sample layer mounts and persists across slides; unmounts cleanly.

Files
- `packages/runtime/src/stage.ts`
- `docs/transitions.md` update.

B4. 2D pan/zoom driver plugin (NEW)
Tasks
- Plugin `@coolslides/plugins-transition-2d`:
  - Read slide meta anchors (e.g., `camera2D { x, y, scale }`).
  - Tween between anchors using StageManager or DOM transforms.

Acceptance
- Demo deck shows smooth 2D camera transitions (instant when reduced motion is on).

Files
- `packages/plugins-stdlib/src/transition-2d/*`
- `docs/slide-meta.md` (anchors)

B5. Three.js transition driver plugin (NEW)
Tasks
- Plugin `@coolslides/plugins-transition-three`:
  - Mount WebGL layer with StageManager; tween camera between slide targets.

Acceptance
- Demo shows 3D camera flights between slides; DOM fade correctly synchronized.

Files
- `packages/plugins-stdlib/src/transition-three/*`
- `examples/three-demo/*`

B6. Rooms sync for steps/fragments/transitions (NEW)
Context
- Current runtime broadcasts slide changes only.

Tasks
- Emit and forward:
  - `advance:step` with `{ slideId, stepIndex }` when onAdvance consumes a step (CodeSlide).
  - Fragment updates: emit `fragment:change` and forward over rooms.
  - Transition lifecycle: `transition:begin/end { from, to, type }`.
- On audience side, ignore local navigation during an active transition.

Acceptance
- In two tabs in the same room, CodeSlide steps stay in sync; fragment reveals stay in sync; long transitions play in both.

Files
- `packages/runtime/src/init.ts` (rooms wiring and event forwarding)
- `packages/runtime/src/router.ts` (emit `fragment:change`)
- `packages/components/src/slides/CodeSlide.ts` (emit `advance:step`)

-------------------------------------------------------------------------------

Bugs and small fixes

F1. PollWidget print snapshot (FIX)
Problem
- `PollWidget.generatePrintSnapshot()` calls `this.context.bus.emit(...)` which returns void; it never retrieves results.

Fix
- Store results in plugin-managed KV (`storage.kv('poll')`) keyed by `poll:<id>:results` and have PollWidget read that if present when generating print view.
- Alternatively, emit a request event and have the plugin write results into a known DOM data attribute before print; KV approach is simpler.

Acceptance
- Print export shows latest poll results when `showResults = true`.

Files
- `packages/plugins-stdlib/src/poll/index.ts` (persist results)
- `packages/components/src/widgets/PollWidget.ts` (read persisted results for print)

F2. Rooms fragment events (ENHANCEMENT)
- Emit `fragment:change` in router and forward over rooms to improve audience sync.

Files
- `packages/runtime/src/router.ts`, `packages/runtime/src/init.ts`.

F3. Lockfile schema alignment (DOC + LINT)
- Add `docs/lockfile.md` describing fields (modelVersion, importMap, resolved with integrity). Consider removing unspecified fields like `irVersion` from generated lockfile or document it explicitly and extend IR if needed.

Files
- `docs/lockfile.md`
- `apps/cli/src/main.rs` (lockfile writer)

F4. Devserver: mount deck directory (see A8)
- Implemented as part of A8.

F5. Docs tidy
- `docs/DEMO.md`: fix export command; mention `?room=<id>`; note `?offline=1` toggle; add speaker view shortcut (Cmd/Ctrl+Shift+S).

-------------------------------------------------------------------------------

Determinism and security

Lockfile and SRI (A3)
- Hash all JS/CSS assets in import map; embed SRI in lockfile; export should embed import map and, optionally, integrity attributes when served via http(s). HTML export continues to rewrite `/packages` to `./packages` with copied assets for `file://` usage.

Exports (current)
- HTML: OK; writes `index.html`, rewrites `/packages` to `./packages`, copies package dists.
- PDF: uses Chrome/Chromium headless with virtual time budget; expands fragments and waits for fonts/images.

Strict/offline modes
- Runtime adapters degrade in offline mode; devserver strict sanitizer remains tight.

-------------------------------------------------------------------------------

Task checklist (short form)

High priority
- [ ] A7 Rooms adapter: wrap/unwrap events so poll messages propagate
- [ ] A8 Serve deck-local assets at /deck; rewrite theme/tokens links in dev HTML
- [ ] F1 PollWidget print snapshot via KV
- [ ] Docs: Fix export command in README.md and docs/DEMO.md
- [ ] A4 CodeSlide wrap/overflow/dim + auto-scroll improvements

Near-term
- [ ] A5 Math plugin reliability + KaTeX guidance
- [ ] B6 Rooms sync: `advance:step`, `fragment:change`, transition events
- [ ] F3 Lockfile docs and schema alignment

Mid-term
- [ ] A3 Taps/registry + SRI
- [ ] B2 Transition Orchestrator
- [ ] B3 StageManager
- [ ] A6 Overview mode plugin

Later
- [ ] B4 2D pan/zoom driver
- [ ] B5 Three.js driver + demo

-------------------------------------------------------------------------------

File map (where to implement)
- CLI: `apps/cli/src/main.rs` (taps, lockfile SRI, docs alignment)
- Devserver: `apps/devserver/src/lib.rs` (serve deck; dev HTML link rewrite), `rooms.rs` (unchanged; will now carry poll events)
- Runtime: 
  - `packages/runtime/src/plugins.ts` (rooms adapter fix)
  - `packages/runtime/src/router.ts` (emit fragment change)
  - `packages/runtime/src/init.ts` (rooms wiring for steps/fragments)
  - `packages/runtime/src/transitions.ts` (new), `packages/runtime/src/stage.ts` (new)
- Components: `packages/components/src/slides/CodeSlide.ts` (polish)
- Stdlib plugins: 
  - `packages/plugins-stdlib/src/poll/index.ts` (KV results)
  - `packages/plugins-stdlib/src/overview/*` (new)
  - `packages/plugins-stdlib/src/math/index.ts` (logging/retry)
- Docs: `docs/capabilities.md`, `docs/DEMO.md`, `docs/lockfile.md`, `docs/transitions.md`, `docs/taps.md`

Acceptance testing
- examples/basic-deck: dev + validate + export html/pdf succeed; tokens/theme load from deck; poll demo syncs across tabs; print shows poll results.
- examples/showcase: math renders consistently; CodeSlide steps/scroll/highlighting behave; `?room=<id>` sync works for slide changes and steps.
- Transition demos (later): 2D and Three.js examples run and export.

Notes
- Keep TOML as the only authoring format.
- Make onAdvance the primary hook for component-driven navigation.
- Transition Orchestrator + StageManager provide the substrate for advanced transitions without imposing a global big‑canvas model.