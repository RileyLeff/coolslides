Here’s a self‑contained, implementation‑ready specification you can hand to a coding agent. It’s opinionated, scoped for a v0.1–v0.4 arc, and includes precise contracts, file formats, APIs, and acceptance criteria.

0. Project identity

Name: Coolslides
Purpose: Pro‑grade, hackable, web‑native slide platform with a schema‑validated IR, framework‑agnostic components, capability‑scoped plugins, and deterministic exports.
Target users: Developer speakers, workshop instructors, engineering teams, tech companies with design systems.
Out of scope for first releases: Hosted SaaS editor, centralized marketplace, WebRTC TURN hosting, arbitrary third‑party plugin sandboxing in iframes (optional later).
Goals and non‑goals
Goals
Deterministic authoring loop: init → dev (hot reload) → validate → export (HTML/PDF).
Structured content model (JSON IR) with JSON Schema validation generated from Rust types, identical in CLI and runtime.
Framework‑agnostic component model via Custom Elements; Svelte→Custom Elements as the default authoring path.
Secure, capability‑scoped plugin API (rooms, network, storage, ui, scheduler) with strict/offline modes.
Local “rooms” for presenter/audience interaction; deterministic record/replay for demos.
High‑quality base runtime: fragments, auto‑animate v1 (FLIP), theming via tokens, accessibility, speaker view.
Reproducible builds with lockfile → import map resolution.
Non‑goals (v0.x)
Rich GUI editor (beyond schema‑to‑form prototype).
WebRTC TURN/hosted realtime service.
Centralized registry with signatures (plan for later).
2. Repository structure (monorepo)

apps/
cli/ (Rust binary “coolslides”)
devserver/ (Rust, Axum; rooms WS, preview, export harness)
packages/
runtime/ (TS/ESM; router, fragments, auto‑animate, theming, slots, speaker view)
component‑sdk/ (TS helpers, lifecycle/types, capability client, print snapshot helpers)
components/ (first‑party slides/widgets; Svelte→CE)
plugins‑stdlib/ (notes, poll, syntax‑highlight, telemetry off by default)
tooling/ (schema generators, importers, release scripts)
templates/
svelte‑ce/ (end‑user scaffold)
vanilla‑ce/ (no framework, plain CE starter)
docs/
examples/
live‑poll, code‑slide, wasm‑demo, handout‑export
.github/
workflows/ci.yml (lint, build, e2e export matrix)
3. Packages and versioning

Crates
coolslides_cli (bin)
coolslides_core (IR types, schema, validation, import map resolver)
coolslides_server (devserver, rooms, export harness)
NPM
@coolslides/runtime
@coolslides/component‑sdk
@coolslides/components
@coolslides/plugins‑stdlib
Versioning: semver; 0.x can change. IR modelVersion is independent and migration‑gated.
4. File layout in an end‑user project

slides.toml (DeckManifest)
content/*.slide.(toml|json)
components/
src/slides/*.svelte
src/widgets/*.svelte
dist/**/*.js (compiled CE bundles)
registry/*.component.json (manifests)
themes/default/{tokens.json,tokens.css,theme.css,print.css}
plugins/* (optional ESM manifests + code)
runtime/{index.html,main.ts}
.slides/{lock.json,cache/*}
package.json (only if building components locally)
vite.config.ts, svelte.config.js
5. Command‑line interface and behavior

coolslides init [--template svelte‑ce|vanilla‑ce] [--dir path]
Scaffolds minimal working deck with two slides and a theme. Exit 0 on success.
coolslides new <ComponentName> --id <slideId> [--from-schema path or registry id]
Creates content/<slideId>.slide.toml with required props per schema.
coolslides dev [--open] [--port 5173] [--host 0.0.0.0] [--strict] [--seed N]
Starts Axum devserver, hot reloads content/components, exposes Presenter and Audience URLs with QR codes.
Strict: disables external network and sensors by default; can be toggled in UI per capability.
coolslides validate [--format json|text] [--strict]
Validates IR files and assets, prints diagnostics with CS codes.
coolslides export --html <dir> [--strict]
coolslides export --pdf <file> [--profile handout|archival] [--scale 1..2] [--timeout ms]
Uses headless Chromium/Playwright invoked by server harness; runs print lifecycle.
coolslides add component pkg@range | plugin pkg@range
Resolves via npm or file: URLs; updates .slides/lock.json and import map.
coolslides doctor [pdf|rooms|env]
Runs environment diagnostics, prints actionable checks.
Exit codes

0 success; 1 validation or runtime error; 2 usage error; 3 environment missing (e.g., browser not found).
6. IR v1 data model (canonical JSON; TOML/YAML transcode at edges)

SlideDoc
modelVersion: “1.0” (string)
id: string (unique within deck)
component: { name: string, versionReq: string }
props: object (validated against component schema)
slots: map<string, Slot>
tags?: string[]
styleOverrides?: map<string, string> (CSS variables)
locale?: string (BCP 47)
dir?: “ltr” | “rtl” | “auto”
DeckManifest
modelVersion: “1.0”
title: string
theme: string (URL/path to CSS)
tokens?: string (URL/path to tokens.css)
plugins: string[] (paths or package IDs)
notes?: map<slideId, string> (Markdown)
transitions: { default: string, overrides?: map<slideId, string> }
sequence: DeckItem[] (Ref or Group)
conditions?: { includeTags?: string[], excludeIds?: string[] }
print?: { expandFragments?: boolean, pageNumbers?: boolean, footerTemplate?: string }
DeckItem (discriminated)
{ ref: “slideId” }
{ group: “name”, transition?: string, slides: string[] }
Slot (discriminated)
{ kind: “markdown”, value: string }
{ kind: “component”, tag: string, module: string, props?: object, defer?: “eager”|“visible”|“idle”, slotId?: string, printFallback?: { kind: “image”, src: string } }
Lockfile (.slides/lock.json)
modelVersion: “1.0”
resolved: { components: map<name, { version: string, url: string, integrity?: string }>, plugins: map<name, { version: string, url: string, integrity?: string }> }
importMap: { imports: map<string, string> }
timestamp: ISO8601
Validation rules

Unique slide ids; sequence must reference known ids.
Component version resolution must converge to one version per name.
styleOverrides keys must start with “--”.
slot.kind must be supported by the target component’s manifest.
printFallback required for known dynamic canvases when exporting in strict handout mode.
7. JSON Schema generation and sync

Source of truth: Rust types in coolslides_core with serde + schemars derives.
Schema publishing: generate to packages/component‑sdk/schemas and docs/schemas.
Runtime uses the same JSON Schema (bundled) for client‑side form validation in the future editor prototype.
8. Components (Custom Elements) contract

Authoring
Svelte default: svelte:options customElement tag=”cs‑…”; expose typed props; dispatch CustomEvent for outputs.
Vanilla CE template also provided.
Inputs
Properties for structured data; attributes for simple primitives (optional).
Outputs (CustomEvent)
“ready”, “change”, “error”.
Lifecycle (optional but recommended)
pause(): void
resume(): void
teardown(): void
Prefetch (static)
prefetch(props): Promise<void> for warming assets/workers.
Styling
CSS variables only; no hardcoded design values; adhere to tokens.
Manifest (registry/*.component.json)
name: string
version: semver
tag: string (e.g., cs‑two‑col)
module: string (default ESM path for export)
schema: JSON Schema (props + slot contracts)
tokensUsed: string[] (CSS vars)
capabilities?: string[] (if requiring host APIs)
suggestedTransition?: string
9. Runtime (TypeScript/ESM)

Router and navigation
Hash routes (#/slideId[/fragmentIndex]), arrow keys, space/shift+space, home/end, click/tap, touch.
Fragments
data‑fragment on elements; sequential reveal; export expands when configured.
Auto‑animate v1 (FLIP)
Opt‑in per slide via data‑auto‑animate.
Pair elements by data‑id; fallbacks only for transforms/opacity; reduced‑motion: fade or none.
Per‑slide/element overrides: duration, easing, delay, unmatched behavior.
Lifecycle
onSlideEnter/onSlideLeave events; mount/unmount slots; pause/resume hooks.
Preloading
Look‑ahead prefetch of next/prev slide assets and modules; defer honors “visible|idle”.
Theming
tokens.css loaded first; theme.css applies values; per‑slide overrides via styleOverrides attached on slide root.
Accessibility
ARIA landmarks, focus management across fragments, reduced motion preference, keyboard help overlay “?”.
Speaker view
Separate window/route with current/next slide preview, notes, timer, progress, and quick toggles (strict/offline).
10. Plugin system

PluginMeta (manifest.json)
name, version, entry (ESM), capabilities: string[], hooks: string[]
Hooks (all optional)
init(ctx)
onSlideEnter(ctx)
onSlideLeave(ctx)
onBeforePrint(ctx)
Context (readonly)
deck, slide, router, logger, bus (pub/sub)
capabilities: object with granted APIs only; undefined if not granted.
Capabilities (scoped)
network.fetch(allowedOrigins?: string[]) → Response
rooms.ws(roomId): Duplex channel (send/subscribe)
storage.kv(scope: “deck”|“slide”): async get/set/remove/list
sensors.{camera|mic|screen}: prompt→MediaStream
scheduler.setInterval(fn, ms, {lifecycle: “slide”|“deck”})
ui.{toast,dialog,qr}
print.snapshot(node): Promise<string> (data URL)
Security model
Capabilities must be declared in manifest; runtime grants per deck in dev, prompts on sensitive scopes in strict/production.
CSP defaults: default‑src ‘self’; script‑src ‘self’; connect‑src ‘self’ plus allowed origins based on capabilities; style‑src ‘self’ ‘unsafe‑inline’ during dev only.
Offline/strict mode: disables external fetch; rooms replay only; sensors disabled unless explicitly allowed.
11. Rooms service (devserver, WS)

Endpoints
GET /presenter → Presenter UI (QR for Audience URL)
GET /audience → Audience UI (room join)
WS /rooms/:roomId
Roles
presenter (full API), audience (limited)
Messages (JSON lines)
{type:“join”, role:“presenter”|“audience”, clientId}
{type:“event”, event:{name:string, data:any}, ts:number}
{type:“state”, data:any, ts:number} (optional sync)
{type:“ack”, id:string}
Limits and reliability
Max payload 64 KB; rate limit 30 msgs/sec/client; backpressure with drop policy for low‑priority events.
Record/replay
Record to .slides/rooms/<session>.jsonl (ordered, monotonic timestamps).
Replay mode re‑emits events with same timing (or time‑compressed).
Auth
v0.x: shared roomId (UUIDv4) + role token from presenter URL.
Later: ephemeral signed tokens.
12. Export and print

HTML export
Copies runtime, components, plugins, assets; generates an import map from lockfile; inlines minimal boot script; emits strict CSP and SRI hashes.
PDF export
Profiles
handout: expand fragments; snapshot canvases; reduce motion; page numbers, optional appendix of links/QRs.
archival: attempt to preserve animation frames (first frame), higher image quality.
Engine: Playwright Chromium by default; configurable path.
Steps
Launch → open presenter route → navigate slides → emit onBeforePrint → freeze animations → snapshot canvases → emulate print media → page.pdf.
Configurable options
printBackground, scale (0.7–1.3), margin presets, timeout per slide.
Fonts
Default open‑licensed font set bundled; font subsetting for export; warn on missing or unembeddable fonts.
13. Performance budgets and diagnostics

Budgets (warn in dev, fail in strict)
Per‑slide total assets ≤ 1.5 MB (configurable)
Single image ≤ 500 KB (suggest WebP/AVIF)
JS parse budget for a slide’s widgets ≤ 200 KB minified
Debug overlay
FPS, active plugins/capabilities, preload queue, asset sizes.
Build‑time highlighting (syntect) by default; client‑side optional.
14. Accessibility and i18n

Lint checks
Token‑based color contrast ≥ WCAG AA; fragment order maintains focus; headings start at h1 per slide.
i18n
Deck locale with per‑slide overrides; dir support; avoid text in images where possible.
15. Security hardening (export)

CSP: strict nonces/hashes for inline boot; connect‑src allowlist from capabilities; img/media from bundled assets only in strict/offline.
SRI: attach integrity hashes for component/plugin bundles.
Trusted Types: enabled in strict export; runtime APIs use safe sinks.
Optional sandbox mode: iframe untrusted plugins with postMessage bridge (flagged experimental).
16. Import map and resolution

Lockfile → import map at build/export; es‑module‑shims included when necessary.
Version convergence
One resolved version per component/plugin name; if ranges conflict, fail validate with remediation steps (vendor or pin).
17. Telemetry (opt‑in only, off by default)

CLI can emit anonymous usage counters (commands, success/failure) if opted in.
Runtime: no telemetry by default; stdlib telemetry plugin demonstrates opt‑in pattern.
18. Testing and CI

Unit tests
IR parsing/validation; schema round‑trip; import map resolver; capability gate logic.
Integration tests
Devserver hot reload; plugin lifecycle; rooms local echo; PDF export harness health.
E2E
examples/ decks: open in headless browser, step fragments, assert DOM states, export PDFs, image snapshot of key slides.
Matrix
Linux (Ubuntu), macOS, Windows; Node LTS; Rust stable; Playwright bundled Chromium.
Artifacts
Store PDFs and PNG snapshots; compare for regressions with per‑slide tolerances.
19. Documentation plan

docs/
Getting started (content author; component author)
IR reference with schemas
Component authoring guide (Svelte→CE and vanilla CE)
Plugin API and capability glossary
Theming and tokens
Export/PDF cookbook
Security model and CSP presets
Rooms and deterministic replay guide
Performance and budgets
Troubleshooting (doctor checks)
20. Roadmap and acceptance criteria

v0.1 (M0 Bootstrap)
IR v1 types + JSON Schema generation
CLI: init, dev, validate, export html
Runtime: router, fragments, theming, basic navigation
Components: TitleSlide, TwoColSlide, QuoteSlide
Theme: default light/dark tokens + theme.css
Accept: init→dev under 5s cold; validate passes; export html opens offline; 3 example decks build
v0.2 (M1 Interactivity)
Auto‑animate v1 with data‑id pairing + reduced‑motion fallback
PDF export with handout profile; syntect code highlighting
Speaker view + notes support in IR
Rooms v1 (WS broadcast), record/replay
Widgets: Poll + stdlib plugin
Accept: PDF export success in CI across 3 OS; rooms record/replay deterministically; poll works with 10 local clients
v0.3 (M2 Extensibility)
Plugin API v1 (rooms, network, storage, ui, scheduler, print.snapshot)
Capability prompts and strict/offline modes
Lockfile→import map generation; SRI in export
Components: CodeSlide, MediaSlide, LiveDemoSlot
Importers: reveal.md (subset) → IR
Accept: capability gates enforced; import a reveal deck with ≥70% fidelity; export strict blocks undeclared network
v0.4 (M3 Power/Polish)
WASM component template (Worker + snapshot)
Accessibility lints; perf overlay; budgets enforcement
Optional iframe sandbox mode (experimental)
Themes: second “Pro” theme; Tailwind config generator from tokens
Accept: a11y lints catch contrast/focus issues; budgets warn/fail appropriately; WASM demo exports with snapshot
21. Error codes and diagnostics (examples)

CS1001: Slide id duplicated: <id>
CS1002: Unknown component name/version: <name>@<range>
CS1003: Slot kind not supported by component: <slot> (<kind>)
CS2001: Version ranges cannot converge for <name>
CS3001: External network requested in strict/offline mode: <url>
CS4001: PDF export timeout on slide <id>
CS5001: Plugin capability denied: <capability>
Diagnostics include path, suggestion, and remediation links.
22. Example minimal artifacts (abridged)
Slide (TOML)
modelVersion = "1.0"
id = "intro"
[component]
name = "TitleSlide"
versionReq = "^1"
[props]
title = "Coolslides"
subtitle = "Pro‑grade, hackable slides"
[styleOverrides]
"--title-size" = "64px"

Deck manifest (TOML)
modelVersion = "1.0"
title = "My Talk"
theme = "themes/default/theme.css"
plugins = ["plugins/poll/manifest.json"]
[transitions]
default = "slide"
[[sequence]]
ref = "intro"

Component manifest (JSON)
{
"name": "TitleSlide",
"version": "1.0.0",
"tag": "cs-title-slide",
"module": "/components/dist/slides/TitleSlide.js",
"schema": { "type": "object", "required": ["title"], "properties": { "title": { "type": "string" }, "subtitle": { "type": "string" } } },
"tokensUsed": ["--title-size", "--accent"]
}

Plugin manifest (JSON)
{
"name": "@coolslides/plugins-poll",
"version": "1.0.0",
"entry": "./index.js",
"capabilities": ["rooms.ws", "storage.kv", "ui.toast"],
"hooks": ["init", "onSlideEnter", "onSlideLeave", "onBeforePrint"]
}

Lockfile (JSON)
{
"modelVersion": "1.0",
"resolved": {
"components": { "TitleSlide": { "version": "1.0.0", "url": "/components/dist/slides/TitleSlide.js", "integrity": "sha256-..." } },
"plugins": { "@coolslides/plugins-poll": { "version": "1.0.0", "url": "/plugins/poll/index.js", "integrity": "sha256-..." } }
},
"importMap": { "imports": { "@coolslides/runtime/": "/runtime/" } },
"timestamp": "2025-08-23T00:00:00Z"
}

23. Security threat model (v0.x)

Threats
XSS via plugin or markdown slot → mitigated with capability gates, Trusted Types (strict), sanitization of markdown, CSP.
Supply chain tampering of components/plugins → mitigated with lockfile pinning, SRI in export.
Network exfiltration during conference → mitigated with offline/strict modes and connect‑src allowlists.
Residual risks
Dev mode CSP relaxed; authors must not trust unvetted plugins/components.
24. Performance guidance (author‑facing)

Prefer transforms/opacity for animations; avoid layout‑thrashing on auto‑animate.
Use defer: “visible|idle” for interactive widgets.
Preload only next slide’s heavy assets; avoid global preloads.
Budget tips: SVG over PNG when appropriate; AVIF/WebP; code‑split widgets.
25. Importers (v0.3 scope)

reveal.md importer:
Parse frontmatter and sections; map to Title/TwoCol/MarkdownSlide where feasible; extract code blocks and speaker notes; emit a report of unmapped features (plugins, custom JS).
slidev importer (stretch):
Parse Markdown; map frontmatter to DeckManifest; embed as markdown slots.
26. Devserver API (for tooling/editor integration)

GET /api/deck → resolved DeckManifest JSON
GET /api/slide/:id → resolved SlideDoc JSON
POST /api/rooms/:roomId/record/start|stop
GET /api/rooms/:roomId/dump → JSONL
GET /healthz → { ok: true }
27. Environment configuration

CLI respects env vars:
COOLSLIDES_DEV_PORT, COOLSLIDES_BROWSER_PATH (export), COOLSLIDES_STRICT=1
HTTP_PROXY/HTTPS_PROXY honored for export fetches
Fonts dir: configurable via COOLSLIDES_FONTS_DIR
28. Contribution and quality bars

Every new component/plugin must include:
Manifest, schema, example slide, docs.
Accessibility notes and tokensUsed list.
Tests: mount in runtime, export snapshot, validate schema.
Every new capability must ship:
Security review notes, CSP changes, offline/strict behavior, tests.
