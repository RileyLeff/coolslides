# CodeSlide v2

CodeSlide supports inline code via `props.code` or external, git‑sourced code via `props.source` during development. Exports embed the resolved content into `props.content` for deterministic builds.

Props
- title: optional string
- code: inline string (fallback if no source/content)
- content: string injected during export when source is used
- source: object (dev‑only resolution)
  - type: "git"
  - repo: string (default "./"; local deck root only)
  - ref: string (branch/tag/sha)
  - file: string (path relative to repo root)
  - lines: string (line spec, e.g., "120-180" or "1,4-6,9")
- language: string (default "javascript")
- theme: string (github|monokai|solarized-dark|solarized-light|vs-code)
- lineNumbers: boolean (default true)
- highlightLines: string (e.g., "1,3-5")
- steps: array of { highlight?: string; scrollTo?: number }

Devserver API
- POST `/api/code/resolve` with JSON `{ ref, file, lines?, repo? }`
- Returns `{ content, blobHash }`
- Security: only local repositories; path traversal is rejected; commands run under the deck root (`git -C <deck>`)

Stepper
- The component implements `onAdvance(dir, ctx)` and applies step highlights and smooth scroll.
- Router integration (calling `onAdvance`) is added in milestone B1.

Export
- During HTML/PDF export, the server resolves `source` and embeds the result into `props.content`.
- Lockfile hashing is planned in A3; for now content embedding ensures deterministic output.

