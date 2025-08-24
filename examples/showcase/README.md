# Coolslides Showcase

Small deck demonstrating recent features:
- CodeSlide v2 with git-sourced code + stepper (onAdvance)
- Math plugin (inline `$...$` and block `$$...$$`)
- Poll widget + stdlib plugins (poll, notes, telemetry)

## Run The Showcase

This deck expects to run from the repository root so it can load the local packages under `/packages/*/dist`.

- Using a globally installed CLI:
  - `coolslides dev --dir examples/showcase --open`

- Without installing (run from the workspace):
  - With Cargo directly:
    - `cargo run -p coolslides -- dev --dir examples/showcase --open`
  - Or via the npm script (forwards args after \/\-\-):
    - `npm run dev -- --dir examples/showcase --open`

Notes:
- If you haven’t built the TypeScript packages yet, run `npm install` (if needed) then `npm run build` at the repo root.
- See also `npm run build --workspaces`
- CodeSlide’s git resolution uses the current repo. Ensure this repo has commits (e.g., not a fresh, uncommitted working tree) so `git show <ref>:<path>` works. The showcase points at `HEAD` of this workspace.
- You can disable network/rooms for demo purposes by appending `?offline=1` to the URL.
- Strict mode toggles sanitization; the math example relies on the math-friendly sanitizer when not strict.

## Export

- HTML: `cargo run -p coolslides -- export html --dir dist --strict=false`
  - Then open `dist/index.html`.
- PDF: `cargo run -p coolslides -- export pdf presentation.pdf`

Tip: For npm, you can also run these via `npm run build` (builds Rust + packages) and then call the CLI with `cargo run -p coolslides -- <command>`.

