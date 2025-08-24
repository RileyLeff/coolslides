# Transitions and onAdvance Hook

Before advancing slides or fragments, the runtime asks the active slide’s components if they want to consume the action via an `onAdvance` hook. This enables components like CodeSlide to implement internal steppers.

Component hook
- Signature: `onAdvance(dir: 'forward' | 'backward', ctx) => boolean | Promise<boolean>`
- Context: `{ bus, router, slideId }`
- Return `true` (or resolve to `true`) to consume the advance; return `false` to let the router proceed normally.

Router behavior
- Keyboard events (→, ←, Space, ↑, ↓) first call `onAdvance` on components within the active slide.
- If no component consumes the event, the router performs its default fragment/slide navigation.

Notes
- Keep handlers fast. If returning a Promise, resolve quickly to avoid sluggish key handling.
- Use `ctx.bus` for emitting events (e.g., `advance:step`) and `ctx.router` for navigation if needed.

