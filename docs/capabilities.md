# Runtime Capabilities

This document describes the capability adapters exposed to plugins by the Coolslides runtime. Plugins declare the capabilities they need and receive a scoped adapter object at init time. Adapters are implemented in `packages/runtime/src/plugins.ts`.

- Capability keys map to concrete adapter implementations.
- In strict/offline modes, some capabilities may be disabled or downgraded to no‑ops (noted below). The runtime should warn rather than throw.

## Capability: `network.fetch`

- Purpose: Network access for plugins (analytics, demos). Exposed as both a callable function and an object with a `fetch` method for compatibility.
- Adapter: wraps the browser `fetch`.

Plugin usage:

```ts
export default {
  name: 'plugin-using-fetch',
  capabilities: ['network.fetch'],
  async init(ctx) {
    const net = ctx.capabilities['network.fetch'];
    // Callable form
    const res1 = await net('https://example.com/health');
    // Object method form
    const res2 = await net.fetch('https://example.com/data.json');
    const data = await res2.json();
  }
}
```

Runtime adapter (under the hood):

```ts
// packages/runtime/src/plugins.ts
'network.fetch': Object.assign(
  (input, init) => fetch(input, init),
  { fetch: (url, init) => fetch(url, init) }
)
```

Strict/offline: In offline mode, network calls should be blocked or redirected; adapters may return a rejected promise with a clear error. In strict mode with offline policy, emit a warning and no‑op.

## Capability: `storage.kv`

- Purpose: Simple namespaced key/value storage for small state and caching.
- Adapter: Async API backed by `localStorage` with JSON serialization and `list()`.

Plugin usage:

```ts
capabilities: ['storage.kv']
async init(ctx) {
  const kv = ctx.capabilities['storage.kv']('notes');
  await kv.set('session', { startedAt: Date.now() });
  const session = await kv.get('session');
  const keys = await kv.list();
  await kv.remove('session');
}
```

Runtime adapter:

```ts
'storage.kv': (ns: string) => ({
  get: async (k) => JSON.parse(localStorage.getItem(`coolslides:${ns}::${k}`) ?? 'null'),
  set: async (k, v) => localStorage.setItem(`coolslides:${ns}::${k}`, JSON.stringify(v)),
  remove: async (k) => localStorage.removeItem(`coolslides:${ns}::${k}`),
  list: async () => Object.keys(localStorage)
    .filter(k => k.startsWith(`coolslides:${ns}::`))
    .map(k => k.replace(`coolslides:${ns}::`, ''))
})
```

Strict/offline: Always available; may be cleared per session. Quota applies.

## Capability: `ui.notifications` and alias `ui.toast`

- Purpose: Lightweight presenter feedback (toasts, basic notifications).
- Adapter: Renders a minimal toast element; provides `show`, `notification`, and `toast`. `ui.toast` alias exposes `{ toast() }` for back‑compat.

Plugin usage:

```ts
capabilities: ['ui.notifications']
init(ctx) {
  const ui = ctx.capabilities['ui.notifications'];
  ui.show('Poll started!');
  ui.notification('Timing Warning', 'You are over time on this slide');
  ui.toast('Saved', 'success');
}
```

Strict/offline: Always available; visual only.

## Capability: `rooms.ws`

- Purpose: Real‑time room coordination via WebSocket for audience sync and interactivity.
- Adapter: Connects to the devserver’s `ws://…/rooms/:roomId` endpoint and returns a small wrapper.

Plugin usage:

```ts
capabilities: ['rooms.ws']
init(ctx) {
  const ws = ctx.capabilities['rooms.ws'].connect('my-room');
  ws.onMessage((msg) => {
    if (msg.type === 'poll:response') {
      // handle response
    }
  });
  ws.send({ type: 'hello', t: Date.now() });
}
```

Runtime adapter shape:

```ts
{ connect(roomId): { send(data), onMessage(cb), onClose(cb), close() } }
```

Strict/offline: In offline mode, use a stub that invokes callbacks locally and logs warnings.

## Capability: `telemetry.events`

- Purpose: Plugin‑emitted telemetry hooks that the runtime bus can observe or forward.
- Adapter: Maps to event bus emissions: `track` -> `telemetry:track`, `identify` -> `telemetry:identify`, `page` -> `telemetry:page`.

Plugin usage:

```ts
capabilities: ['telemetry.events']
init(ctx) {
  const t = ctx.capabilities['telemetry.events'];
  t.identify('presenter-123', { role: 'presenter' });
  t.page('Intro');
  t.track('slide:enter', { slideId: 'intro' });
}
```

Runtime observers can subscribe to these via the event bus if needed.

---

Notes:
- The runtime loads plugins based on `deck.plugins` entries. Module specifiers are resolved via the import map (`/api/importmap`) or can be absolute URLs/paths.
- When strict/offline modes are active, capabilities that would violate policy should degrade gracefully with warnings to the console. No hard crashes.

