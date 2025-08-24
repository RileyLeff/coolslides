# Math Plugin

@coolslides/plugins-math provides lightweight math processing for inline `$...$` and block `$$...$$` expressions. If KaTeX is present on the page (`window.katex`), it renders via KaTeX; otherwise it wraps content with minimal styles for readable fallback.

Enable
- Add the plugin to your deck manifest `plugins` array (ensure your import map resolves it):
  - `"/packages/plugins-stdlib/dist/math/index.js"` (monorepo dev)
  - or `"@coolslides/plugins-math"` via a tap/CDN mapping.

Sanitization and strict mode
- Devserver enables a math-friendly sanitizer automatically when the deck includes the math plugin and strict mode is off.
- Strict mode still applies a tight sanitizer; math rendering may be limited.

Export
- PDF/HTML exports include your resulting DOM. For full KaTeX output determinism, include KaTeX CSS/JS via your theme or a tap package so assets are local and hashed in the lockfile (A3).

Notes
- For best results, ship KaTeX via a tap/theme and include it in your import map.
- Fallback styles render math as monospace blocks when KaTeX is not available.

