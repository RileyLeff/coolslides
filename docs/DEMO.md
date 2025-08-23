# Coolslides MVP Demo Guide

This guide shows how to run the dev server, validate a deck, and export HTML/PDF using the example deck. It also highlights the dynamic slot demo with `defer="visible"`.

## Prerequisites

- Node 18+
- Rust (stable)
- Chrome/Chromium installed (for PDF export)

## 1) Build the workspace

```bash
npm run build --workspaces
cargo build
```

Notes:
- Components TS may surface type warnings; prebuilt `dist/` is used at runtime.

## 2) Run the dev server

```bash
coolslides dev --dir examples/basic-deck --open
```

What to check:
- Navigate with arrow keys; fragment animations should work.
- Go to the slide “Live Poll Demo”. The `cs-poll` widget is loaded dynamically when visible (`defer="visible"`). You should see the widget appear only when this slide is active.

## 3) Validate the deck

From the project root:

```bash
cd examples/basic-deck
coolslides validate
```

You should see a success message; schema checks use manifests extracted from the components source.

## 4) Export HTML (offline-capable)

From the project root:

```bash
coolslides export html --dir dist
open dist/index.html  # macOS
# or: xdg-open dist/index.html (Linux), start dist\index.html (Windows)
```

What this does:
- Generates `index.html` with inlined theme/tokens CSS and an embedded import map.
- Copies `packages/*/dist` into `dist/`.
- Rewrites `/packages/...` URLs to `./packages/...` so it opens via `file://`.

Verify:
- Double-clicking `dist/index.html` should render all slides offline.
- Navigate to “Live Poll Demo”; the `cs-poll` module loads when the slide becomes visible.

## 5) Export PDF (deterministic)

```bash
coolslides export pdf --file out.pdf --profile handout --timeout 15000
```

Notes:
- The exporter inlines CSS, sets a `<base>` pointing to the deck, waits for fonts and images, and uses the virtual time budget (`--timeout`) so the content settles before printing.
- Ensure Chrome/Chromium is installed; the tool looks for common binary names/paths.

## Dynamic slot slide source

- File: `examples/basic-deck/content/poll-demo.slide.toml`
- Sequence entry is added to `examples/basic-deck/slides.toml`.
- The right slot embeds `cs-poll` via:
  - `kind = "component"`
  - `tag = "cs-poll"`
  - `module = "/packages/components/dist/widgets/PollWidget.js"`
  - `defer = "visible"`

## Troubleshooting

- If HTML export opens but components don’t render, ensure `dist/packages/...` folders exist and paths in `index.html` point to `./packages/...`.
- If PDF fails, confirm Chrome/Chromium is installed; increase `--timeout` if images/fonts are slow.
- If dev server can’t find slides, check you passed `--dir examples/basic-deck`.

