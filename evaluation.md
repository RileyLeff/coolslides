Short version: TOML support isn’t gone, but it’s narrower than before. The code now requires the “tagged” form for enum-like data in TOML (e.g., [[sequence]] type = "ref", ref = "intro"). Older untagged TOML shapes that likely worked before are no longer accepted. The repo acknowledges this and left a TODO to add back compatibility. If your decks relied on the previous untagged TOML, they’ll fail to parse until that compatibility layer is added.

What the repo is actually doing today

IR and JSON shape
DeckItem in Rust is now a tagged enum with #[serde(tag = "type", rename_all = "camelCase")], and for the ref variant the field is renamed to "ref". That yields canonical JSON like {"type":"ref","ref":"intro"}.
This aligns with the TS runtime types and the router (the runtime expects item.type === 'ref' and item.ref).
TOML parsing path
The dev server and CLI load slides.toml and *.slide.toml via toml::from_str into the Rust structs.
DeckItem currently relies on the tagged representation in TOML too. The example deck uses it (examples/basic-deck/slides.toml shows [[sequence]] type = "ref", ref = "intro"), so examples work.
There’s an explicit TODO in packages/coolslides_core/src/ir.rs: “Custom deserializer for DeckItem to support both tagged JSON and untagged TOML. For now, using standard tagged serialization.” That’s the regression point: older TOML shapes are no longer accepted.
What likely broke compared to earlier TOML

Untagged “presence-based” TOML: e.g., [[sequence]] ref = "intro" (with no type), or groups described only by name/slides/transition without a type key.
Possibly very terse forms like sequence = ["intro","features"] (strings only). With the current derive this will fail because each sequence item must be a table having type/ref (or group).
Is this just a docs mismatch or a real runtime break?

It’s a real break for projects that used the prior TOML shapes. The example deck and README don’t call this out, so the break can be surprising. JSON output and the browser runtime are fine; the issue is on the TOML-to-IR ingest path.
Recommended fix (small, targeted, safe)
Add a custom Deserialize impl for DeckItem that accepts all of these shapes:

Tagged ref: { type = "ref", ref = "intro" }
Presence-based ref (no type): { ref = "intro" }
String-only ref: "intro"
Tagged group: { type = "group", name = "...", slides = ["a","b"], transition? }
Presence-based group (no type): { name = "...", slides = [...], transition? }
Sketch (keep Serialize derived; replace only Deserialize with a custom impl):

Change the derive on DeckItem to: #[derive(Debug, Clone, Serialize, JsonSchema)]
Implement Deserialize manually by first deserializing into a serde value and then normalizing:
If it’s a string => DeckItem::Ref { slide_id: s }
If it’s a map and has type = "ref" => read ref
If it’s a map and has type = "group" => read group fields
If it’s a map with "ref" but no "type" => interpret as Ref
If it’s a map with "slides" (and likely "name") but no "type" => interpret as Group
Otherwise error with a helpful message
Add unit tests that parse all five shapes. This preserves canonical JSON and restores backwards-compatible TOML.

Why this is the right place to fix it

The CLI and dev server both deserialize DeckManifest via toml::from_str; once DeckItem is tolerant, everything else “just works” (including validation and the HTTP API that emits the canonical JSON).
Runtime and API don’t need changes—they already operate on the canonical tagged JSON.
Other nits I noticed while reviewing (unrelated to TOML, but worth tracking)

Plugin API mismatch: plugins-stdlib/telemetry calls context.router.getCurrentSlideId(), but the runtime Router exposes getCurrentSlide(). If you wire plugins later, this will throw. Either add getCurrentSlideId() to the Router or update the plugin to use getCurrentSlide().
Fragments: DefaultFragmentManager.initialize() is never called by SlideRouter (router constructs it but doesn’t call initialize). The theme CSS already defines the fragment classes, so visuals still work, but if you intended fragment-specific injected styles, call initialize() once (similar to auto-animate/theme/props managers).
Import map and dist assets: the dev server serves /packages/*/dist, but the README quick start doesn’t ensure those packages are built. You’ll need npm run build --workspaces (or similar) before starting the server, or serve source via a bundler in dev mode. Otherwise the runtime import of /packages/runtime/dist/index.js will 404.
Concrete next steps to de-risk TOML immediately

Implement the DeckItem custom deserializer as above and add tests for all accepted shapes.
Update README’s “IR v1 Data Model” to document the canonical JSON and the accepted TOML variants, with a note that untagged TOML is supported for compatibility but tagged is preferred.
Optional: add a “coolslides validate --fix” or “coolslides doctor” step that rewrites sequence entries in slides.toml into the canonical tagged form. That lets teams move forward while staying lenient.
Keep the API returning canonical JSON only—this is already consistent across server and runtime.