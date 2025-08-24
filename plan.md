Title: Coolslides Project Plan

Overview
This plan documents the next phases for Coolslides with a pro-first, hackable architecture, keeping TOML as the single authoring format. Simplicity for non‑technical users will come later via a UI; today we focus on rock-solid APIs, CLI workflows, and an ecosystem that lets pros build, share, and compose slides, components, plugins, and themes.

Guiding principles
- One authoring format: TOML (SlideDoc and DeckManifest). Avoid multiple equivalent authoring paths.
- Separation of concerns: IR/TOML is canonical; runtime is modular; plugins add behavior; themes/tokens handle look-and-feel; devserver provides author-time conveniences (e.g., git-sourced code).
- Infinite hackability: Provide primitives and extension points (onAdvance, Transition Orchestrator, StageManager, capability-scoped plugins) that let users build anything, including 2D/3D “big-canvas” style transitions, without forcing that model on everyone.
- Ecosystem-first: Git-based “taps” (registries) for components, widgets, plugins, themes/tokens, slides, templates. Determinism via a lockfile with SRI.
- Pros-first UX: CLI scaffolding and schema-derived TOML generation. A later GUI should build on the same manifests, import maps, and lockfiles.

Scope at a glance
- Marketplace (taps) and lockfile SRI
- CLI: init/new/add/publish/search; scaffold TOML from component schemas; --no-git flag
- CodeSlide v2: stepper + git-sourced ranges; robust syntax-highlighting integration
- Math plugin (KaTeX), Overview mode plugin
- Transition Orchestrator and component onAdvance hook; default transitions
- StageManager; 2D Pan/Zoom and Three.js transition drivers (plugins)
- Rooms sync for steps and transitions
- Deterministic exports (embed code content, SRI)
- Later: Component Playground, simple UI

Non-goals (now)
- Alternative authoring formats (e.g., Markdown as canonical). We keep TOML only.
- Global “slides-as-one-canvas” core. We provide a transition driver that can achieve this, but don’t impose it.

Milestones
A. Ecosystem/Dev UX foundation
B. Advanced transitions and staging
C. Polishing and later UI

Each task below includes instructions, file paths, and acceptance criteria.

-------------------------------------------------------------------------------

Milestone A: Ecosystem and Pro Developer UX

A1. Capability adapters (verify and document)
Context
- We’ve added capability adapters in packages/runtime/src/plugins.ts to align stdlib plugins and runtime.

Tasks
- Verify adapters cover:
  - 'network.fetch' as object with fetch method (and callable compat)
  - 'storage.kv' async get/set/remove/list with namespacing
  - 'ui.notifications' show/notification/toast and alias 'ui.toast'
  - 'rooms.ws' connect(roomId) -> { send, onMessage, onClose, close }
  - 'telemetry.events' track/identify/page mapped to bus
- Add docs with examples (docs/capabilities.md).
- Add smoke tests: load stdlib poll/notes/telemetry in examples/basic-deck and verify no runtime errors.

Acceptance
- All stdlib plugins initialize and run; poll responses bridge DOM->bus; telemetry emits events; notes overlay toggles and persists.

Files
- packages/runtime/src/plugins.ts
- packages/plugins-stdlib/* (for manual verification)
- docs/capabilities.md (new)

A2. CLI: init, new, add, and --no-git
Context
- CLI commands exist but are placeholders.

Tasks
- Implement coolslides init:
  - Flags: --template, --dir, --no-git
  - Creates repo structure with slides.toml, content/*.slide.toml (use schema placeholders), themes, tokens, importmap, and .coolslides.lock skeleton.
  - Starts dev server if --open passed via dev command.
- Implement coolslides new slide:
  - --component <Name>, --id <slide-id>, optional --from-schema path or registry id
  - Prompt (or accept defaults) for required props from manifest JSON schema
  - Generate content/<id>.slide.toml with filled props and commented optional props; create slot stubs.
- Implement coolslides add:
  - coolslides add component <pkg-spec>
  - coolslides add plugin <pkg-spec>
  - Update import map, lockfile, and (optionally) generate a sample slide TOML if component.
- Implement --no-git for init to skip git repo creation.

Acceptance
- From an empty dir, coolslides init creates a runnable deck; coolslides dev --open shows a preview; coolslides new slide creates TOML with schema-driven defaults; add commands add items to import map and lockfile.

Files
- apps/cli/src/main.rs
- Add helpers in apps/devserver or packages/coolslides_core if needed to load schemas.

A3. Marketplace “taps” (registry) - phase 1 (backend-less git)
Context
- Git-based taps with index.json; curated/public/private taps.

Tasks
- Define manifest schema for tap entries (docs/taps.md), including:
  - id, type (component, widget, plugin, theme, tokens, slide, template), version, description, tags, compatibility { runtime, ir }, capabilities (plugins), assets { module, styles }, demo, screenshots, license, integrity, signatures (optional).
- CLI commands:
  - coolslides tap add <git-url-or-gh:org/repo>
  - coolslides search <query> [filters: type:, tag:]
  - coolslides publish <type> <path> --tap <repo> (build, generate manifest with SRI, open PR)
- Lockfile updates:
  - .coolslides.lock: add SRI for JS/CSS; pin resolved URLs; record source tap and ref.
- Minimal index.json format for taps.

Acceptance
- Able to add a tap (local or GitHub), search it, and publish a sample component/plugin with a PR-ready manifest. Lockfile contains SRI and URLs.

Files
- apps/cli/src/main.rs (new subcommands)
- docs/taps.md (new)
- .coolslides.lock (schema documented in docs/lockfile.md)

A4. CodeSlide v2: stepper and git-sourced code ranges
Context
- We want to reference code by repo/ref/file and line ranges, not inline code in TOML.

Authoring (TOML)
[props]
title = "Routing logic"
language = "ts"
source.type = "git"
source.repo = "./"                  # local repo root (deck root by default)
source.ref = "a1b2c3d"              # branch/tag/sha
source.file = "src/router.ts"
source.lines = "120-180"            # or "1,4-6,9"
steps = [
  { highlight = "120-130", scrollTo = 120 },
  { highlight = "132-140", scrollTo = 132 },
  { highlight = "170-180", scrollTo = 170 }
]

Tasks
- Devserver API to resolve git source:
  - POST /api/code/resolve { repo, ref, file, lines }
  - Securely run git show <ref>:<path> under deck root; extract lines; return { content, blobHash }.
  - Cache by (repo, ref, file, lines).
- Runtime CodeSlide:
  - If props.source present and no embedded content, fetch from devserver; else, use embedded content.
  - Implement stepper: onAdvance(dir, ctx) that advances through steps (set highlight range, smooth scroll).
  - Emit bus 'advance:step' with index for rooms sync.
- Export:
  - During export_deck_html_from_dir, embed resolved code content into slide props as props.content and record blob hash (and SRI) in lockfile.
- Syntax highlighting:
  - Integrate Prism.js or Highlight.js as an optional addon package (e.g., @coolslides/highlight-prism). Provide themes as tap packages. Keep the simple fallback highlighter for offline minimal builds.

Acceptance
- A CodeSlide in examples/basic-deck can reference a local repo file and a specific ref; dev server resolves and displays only the requested lines; advancing steps scrolls and updates highlights; export embeds the code content and prints deterministically; rooms syncs step changes.

Files
- apps/devserver/src/lib.rs (new endpoint handler)
- packages/components/src/slides/CodeSlide.ts (props extension, onAdvance, fetching, rendering)
- packages/runtime/src/types.ts (optional: declare onAdvance in a ComponentLifecycle extension doc; runtime side just calls it if present)
- packages/coolslides_core (no IR change required; props is free-form)
- docs/codeslide.md (new)

A5. Math plugin (KaTeX)
Context
- Provide robust math typesetting.

Tasks
- Devserver markdown sanitization: allow math spans/blocks pass-through safely behind a switch (strict mode continues to sanitize).
- Plugin: @coolslides/plugins-math
  - Loads KaTeX CSS/JS; processes inline $...$ and display $$...$$ after slide render.
  - Provide plugin config in deck to enable/disable or set macros.
- Export: Ensure KaTeX CSS is included for PDF determinism.

Acceptance
- Example slide with math renders in dev and in exported HTML/PDF; strict mode behavior documented.

Files
- apps/devserver/src/lib.rs (render_markdown_to_html toggles for math or an extra pass phase)
- packages/plugins-stdlib/src (new math plugin module)
- themes/ or plugins package for KaTeX CSS (prefer packaged via tap)

A6. Overview mode plugin
Context
- Grid of slide thumbnails for fast navigation.

Tasks
- Plugin @coolslides/plugins-overview:
  - Hotkey 'O' toggles overlay with a grid of current slides.
  - Clicking a thumbnail navigates to that slide.
  - Thumbnails constructed by cloning existing slide DOM and scaling via CSS, or canvas snapshots (keep it simple first).
  - Honors prefers-reduced-motion.

Acceptance
- Pressing 'O' shows an overlay with navigable thumbnails; navigation works; overlay can be closed.

Files
- packages/plugins-stdlib/src/overview (new)
- themes/default/theme.css or plugin CSS (scoped)

-------------------------------------------------------------------------------

Milestone B: Advanced transitions and stages

B1. Component-level onAdvance hook (infinite hackability entry point)
Context
- Before advancing slide/fragment, allow the active slide’s components to handle “next/prev”.

Tasks
- Runtime router integration:
  - On key events for forward/back, call tryActiveSlideAdvance(dir) before nextFragment/nextSlide.
  - tryActiveSlideAdvance(dir): walks components in the active slide; if any expose onAdvance(dir, ctx) returning true (or resolving to true), stop; else proceed with router-based navigation.
- Provide AdvanceContext { bus, router, slideId }.

Acceptance
- CodeSlide implements onAdvance and consumes “next” while steps remain; when done, router advances to the next fragment/slide.

Files
- packages/runtime/src/router.ts (call a helper before changing fragment/slide)
- packages/components/src/slides/CodeSlide.ts (add onAdvance)

B2. Transition Orchestrator with default handlers
Context
- A pluggable transition system that selects and runs a handler between slides.

Tasks
- Orchestrator module:
  - API: register(handler, match?), run(fromId, toId, ctx)
  - Default handlers: none, fade, slide, zoom, FLIP (wrap existing FLIPAutoAnimateManager for a stock case).
  - DeckManifest.transitions.overrides can choose a handler by name per slide id.
- Router integration:
  - navigate() awaits orchestrator.run() before marking navigation complete and accepting next key.

Acceptance
- Configure default transition = 'fade' in examples/basic-deck; switching slides runs fade; switching to a slide with override='zoom' runs zoom.

Files
- packages/runtime/src/transitions.ts (new)
- packages/runtime/src/router.ts (await orchestrator)

B3. StageManager (persistent layers)
Context
- Long-running layers (e.g., canvases) used by advanced transitions.

Tasks
- StageManager API:
  - mountLayer(id, factory, zIndex?)
  - getLayer(id), unmountLayer(id)
  - Manages fixed-positioned elements appended to body, above slide content.
- Lifecycle: ensure unmount on unload, and respect prefers-reduced-motion.

Acceptance
- A sample plugin mounts a layer and animates on transition; layer persists across slides.

Files
- packages/runtime/src/stage.ts (new)
- docs/transitions.md (document Orchestrator and StageManager)

B4. 2D Pan/Zoom driver plugin
Context
- Provide a lightweight “big-canvas” style pan/zoom driver.

Tasks
- Plugin @coolslides/plugins-transition-2d:
  - Uses StageManager to mount a canvas or use CSS transforms on slides container.
  - Slide meta optionally supplies camera2D { x, y, scale } anchors; transition tweens between anchors.
  - Honors prefers-reduced-motion; short-circuits with instant change.

Acceptance
- Slides with meta.camera2D define positions; transitions tween between positions; test with a small demo deck.

Files
- packages/plugins-stdlib/src/transition-2d (new)
- docs/slide-meta.md (document anchors)

B5. Three.js transition driver plugin
Context
- Without enforcing “one big canvas” globally, allow camera flights between anchored positions specified by slides.

Tasks
- Plugin @coolslides/plugins-transition-three:
  - Uses StageManager to mount a WebGL canvas; initialises a Three.js scene and camera.
  - Slide meta.sceneTarget { position, lookAt or quaternion, fov, duration, easing }.
  - On transition between two slides with sceneTarget, tween camera; fade DOM slides as needed.
  - Respect reduced motion.
- Provide a small sample deck where next slide is “inside” the scene.

Acceptance
- Demo shows camera flights; when transition ends, next slide becomes active and DOM fades in cleanly.

Files
- packages/plugins-stdlib/src/transition-three (new)
- Example deck (examples/three-demo)

B6. Rooms sync for steps and transitions
Context
- Keep audience in sync for custom advances and long transitions.

Tasks
- Emit/consume:
  - advance:step { slideId, stepIndex } on bus and rooms
  - transition:begin/end { from, to, type } for optional audience visuals
- Ensure audience ignores local keys while a transition is running.

Acceptance
- In two tabs with same ?room, stepping CodeSlide advances both; transitions run in both.

Files
- packages/runtime/src/init.ts (rooms wiring)
- packages/runtime/src/router.ts or transitions.ts (emit events)

-------------------------------------------------------------------------------

Milestone C: Polishing and UI (later)

C1. Component Playground (devserver page)
Tasks
- Route /playground: list installed components (from manifests), a live prop editor (JSON), render preview in an iframe or inline, and a “Generate TOML” button to export a ready-to-paste slide.
- Security: sanitize/limit arbitrary code; load only installed components.

Acceptance
- Playground works for first-party components and any installed from taps; TOML snippet is accurate.

Files
- apps/devserver/src/lib.rs (new route)
- static/playground/* (assets)

C2. Simple UI (future)
- A UI wrapping CLI commands to init decks, add components/plugins, create slides from schemas, and edit props visually. Out of scope for now.

-------------------------------------------------------------------------------

Determinism and security

Lockfile (.coolslides.lock)
- Include:
  - SRI for all JS/CSS assets in import map
  - For code-sourced content: git blob hash and embedded content hash
  - Tap source info and version pins
- docs/lockfile.md explaining structure and how exports honor it

Exports
- HTML: embed import map; rewrite /packages to relative; include SRI or inline CSS
- PDF: already deterministic; ensure code content is embedded and KaTeX CSS is included when math plugin is used

Rooms and strict/offline modes
- Keep devserver strict mode toggle; runtime should refuse networked capabilities in offline mode or provide no-op shims with warnings

-------------------------------------------------------------------------------

Implementation notes and references

- Keep TOML as the only authoring format. Simplicity comes from scaffolding and UI, not by adding parallel file formats.
- onAdvance is the first-class hook that lets components consume “next/prev” before the router moves on.
- Transition Orchestrator and StageManager provide a generic substrate for users to implement advanced 2D/3D transitions—including “big-canvas” flights—without imposing that model globally.
- Themes/tokens and plugins align with the “taps” marketplace approach. Components, widgets, plugins, themes, tokens, slides, and templates should be publishable units.

-------------------------------------------------------------------------------

Task checklist (short form)

Foundation
- [ ] A1 Verify capability adapters and document capabilities
- [ ] A2 Implement CLI: init/new/add with --no-git; scaffold TOML from schemas
- [ ] A3 Taps: tap add/search/publish; index.json schema; lockfile with SRI
- [ ] A4 CodeSlide v2: devserver git resolve; onAdvance stepper; export embed; syntax highlighter addon
- [ ] A5 Math plugin (KaTeX) + sanitization switch
- [ ] A6 Overview mode plugin

Transitions
- [ ] B1 Router onAdvance integration; CodeSlide implements onAdvance
- [ ] B2 Transition Orchestrator and default handlers
- [ ] B3 StageManager (persistent layers)
- [ ] B4 2D Pan/Zoom transition driver plugin
- [ ] B5 Three.js transition driver plugin and sample deck
- [ ] B6 Rooms sync for steps and transitions

Polish
- [ ] C1 Component Playground
- [ ] C2 Simple UI (deferred)

-------------------------------------------------------------------------------

File map (where to implement)
- CLI: apps/cli/src/main.rs (+ helpers)
- Devserver: apps/devserver/src/lib.rs (routes), export.rs (no change), rooms.rs (sync events)
- Runtime: packages/runtime/src/router.ts, init.ts, transitions.ts (new), stage.ts (new), plugins.ts (adapters)
- Components: packages/components/src/slides/CodeSlide.ts (stepper, git-source), others unchanged
- Stdlib plugins: packages/plugins-stdlib/src/(math, overview, transition-2d, transition-three) (new)
- Core/IR: Keep IR as-is; embed code content in props during export (no schema change required)
- Docs: docs/capabilities.md, docs/taps.md, docs/lockfile.md, docs/codeslide.md, docs/transitions.md

Acceptance testing
- examples/basic-deck runs and exports; poll demo works; overview mode toggles; math slide renders; CodeSlide git-source demo works and exports.
- Transition demos (2D and Three.js) run in a separate examples deck.
- Rooms sync mirrors steps and transitions across tabs.

This plan is intended to be saved as plan.md at the repository root. Coding agents should use the “Tasks” and “Acceptance” sections under each milestone to implement and validate features.