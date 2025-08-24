Here’s a comprehensive review of what you’ve built, with specific issues, risks, and concrete fixes. I’ve grouped items by severity and area so you can prioritize.

Top-priority functional mismatches and bugs
- Plugin capability surface is inconsistent with your stdlib plugins (breaks poll/notes/telemetry)
  - Mismatched capability names and shapes:
    - Poll plugin expects 'ui.toast' with toast(), but PluginManager exposes 'ui.notifications' with show(). No adapter exists.
    - Poll plugin expects 'rooms.ws' to be a { connect(roomId) -> connection } factory; PluginManager provides a RoomsClient instance instead.
    - Storage: plugins expect async StorageCapability with get/set/remove/list returning Promises; PluginManager provides a synchronous localStorage wrapper with get/set/remove only.
    - Telemetry plugin expects capabilities['network.fetch'].fetch(url, options); PluginManager provides a function under 'network.fetch' (callable), not an object. It also expects 'telemetry.events'.track(), but PluginManager exposes emit().
    - Notes plugin uses 'ui.notifications'.notification(), but PluginManager exposes only show(message).
  - Result: stdlib plugins won’t work as intended (or at all) even if they load.
  - Fix (minimal, safe adapters in PluginManager):
    - Provide aliasing and shape adapters:
      - 'ui.toast': { toast: (msg, type) => this.showToast(msg) }
      - 'ui.notifications': expose both show(message) and notification(title, body, opts)
      - 'network.fetch': expose an object with fetch: (url, init) => fetch(url, init) and keep function form for backward compat
      - 'telemetry.events': implement { track, identify, page } that emit on the bus (e.g., bus.emit('telemetry:track', {name, props}))
      - 'rooms.ws': expose a thin wrapper object with connect(roomId) that returns { send(), onMessage(cb), onClose(cb), close() } backed by a new WebSocket constructed from RoomsClient.computeWsUrl or by RoomsClient itself (add a method to RoomsClient to “attach” arbitrary channels/rooms)
      - 'storage.kv': return Promise-based methods and implement list() by enumerating prefixed keys in localStorage (still sync internally)
    - Alternatively, align plugins to the runtime’s current capability shapes, but the adapter approach lets you keep plugins decoupled.

- Poll plugin and PollWidget don’t communicate
  - PollWidget dispatches DOM CustomEvents ('poll:vote') on the element; PollPlugin subscribes to bus-level events ('poll:response', 'poll:start', etc.). There’s no bridge.
  - PollPlugin tries to discover a poll from slide.slots (IR), but it never receives audience votes from the widget.
  - Fix: Bridge DOM -> bus. Example:
    - In runtime initialization (or a small “poll bridge” helper), add:
      document.addEventListener('poll:vote', (e: any) => bus.emit('poll:response', { response: e.detail }));
    - Optionally forward 'poll:start', 'poll:stop' bus events to DOM if needed.
    - Or change PollWidget to bus.emit via a runtime API made available to components.

- Lazy loading behavior is undermined
  - You call moduleLoader.preloadAllSlotComponents() at startup, which eagerly loads all slot modules even when defer="visible". preloadAllSlotComponents uses loadComponent() which doesn’t observe visibility.
  - You do have observeVisible() in preloadSlideComponents, but preloadAllSlotComponents runs first and defeats it.
  - Fix:
    - Remove preloadAllSlotComponents() or change it to honor 'visible' by using observeVisible() instead of loadComponent() for that case.
    - Recommended: rely on per-slide observation (preloadSlideComponents) and skip the global preloader to actually defer work.

- Speaker view timer doesn’t work (and targets the wrong document)
  - You create SpeakerTimer but never call timer.start(). Also SpeakerTimer.updateDisplay() updates elements in the main window (document.querySelectorAll('#timer')) instead of the speakerWindow document.
  - Fix:
    - Call this.timer.start() after initializeSpeakerWindow().
    - Pass speakerWindow.document into SpeakerTimer:
      class SpeakerTimer { constructor(private doc: Document) {} ... this.doc.querySelector('#timer') ... }
      And create with new SpeakerTimer(this.speakerWindow.document).

- Conflicting keyboard shortcuts for speaker view
  - init.ts binds Cmd/Ctrl+Shift+S; DefaultSpeakerView binds Cmd/Ctrl+S. Pick one and document it; remove the other to avoid confusion.

High-impact correctness/usability issues
- QuoteSlide prop mismatch in example deck
  - examples/basic-deck/content/quote-example.slide.toml uses [props] style = "default". The component expects variant (default | large | minimal). style is ignored.
  - Fix: change to variant = "default".

- CodeSlide HTML and rendering problems
  - When lineNumbers is true, addLineNumbers() returns a div layout, but you inject it inside <pre><code>...</code></pre>, which is invalid; many browsers will sanitize or break layout.
  - this.code.split('\\n').length counts literal backslash-n. Should be '\n'.
  - Your highlighter adds spans with class="keyword|string|comment", but there’s no CSS for those classes in getThemeStyles(). Users will see no syntax color.
  - Fix:
    - If lineNumbers is enabled, render the numbered lines outside the code tag:
      <div class="code-content"> ${lineNumbersHtml ? lineNumbersHtml : `<pre><code>${highlighted}</code></pre>`} </div>
    - Count lines with this.code.split('\n').length
    - Add minimal CSS for .keyword, .string, .comment per theme, or integrate a battle‑tested highlighter (Prism.js/Highlight.js). For a static site use-case, pre-highlighting is also OK.

- Event decorator binds lazily and only once incorrectly
  - component-sdk/src/decorators.ts eventHandler adds the DOM listener the first time the method is called, not when the component connects. This is surprising and can miss events.
  - Fix: wrap/augment connectedCallback in the decorator to addEventListener(eventType, boundMethod) once on connection.

- Notes plugin event handler cleanup leaks
  - You add a keydown listener with a bound function but remove it using the unbound reference in teardown(), so it won’t be removed. Store the bound handler on the instance and remove that.
  - The close button in notes overlay removes the DOM node but doesn’t call plugin.hideNotesOverlay(); your notesOverlay field will still reference a dead element. Call back into the plugin (e.g., wire the button to dispatch a custom event or bind click handler in code).

- Telemetry plugin typing/runtime issues and capability usage
  - Uses NodeJS.Timeout in a browser lib (tsconfig lib doesn’t include Node). Without @types/node, this won’t type-check. Use number | ReturnType<typeof setInterval>.
  - Expects capabilities with .fetch() and .track(), which don’t exist as provided (see top section). Fix via adapters noted above.

Architecture and integration suggestions
- Define a formal Capability Contract and implement adapters centrally
  - Publish a tiny “capabilities” schema (types) used by both PluginManager and stdlib plugins.
  - In PluginManager, create adapter shims so plugins can depend on one stable surface and your runtime can map to browser APIs/RoomsClient gracefully.
  - Example capability mapping:
    - network.fetch: { fetch(url, init) } => wraps window.fetch
    - storage.kv(ns): Promise-based get/set/remove/list on top of localStorage (namespaced)
    - ui.notifications: { show(message), notification(title, body, opts), toast(message, type) }
    - rooms.ws: { connect(roomId) -> { send, onMessage, onClose, close } }
    - telemetry.events: { track, identify, page } => bus emit now, real backend later

- Unify bus vs DOM events for components
  - Decide: either your plugins listen to DOM CustomEvents (bubbled) or everything uses the EventBus. If you want plugins to be framework-agnostic and not DOM-coupled, add a small bridge (as above) so components’ DOM events become bus events.

- Remove duplicate type definitions drift risk
  - You now have a Rust IR and a TS mirror (packages/runtime/src/types.ts). Consider generating TS types from the Rust schemas (schemars) at build time to prevent divergence (modelVersion naming, etc.). You already generate JSON Schemas in core; you can generate TS types from those.

- Dynamic module loader
  - Respect defer="visible" everywhere (including preloadAllSlotComponents), not just inside preloadSlideComponents.
  - Consider adding threshold/rootMargin configuration if slides are virtualized/animated.

- Speaker view
  - Consider rendering current/next slide previews by cloning nodes but beware of script tags or event handlers. You currently clone innerHTML which loses custom element state. If you only need a visual preview, that’s fine; otherwise, consider a safe render pipeline or a “thumbnail renderer” mode.

Polish and UX improvements
- PollWidget (textarea best practices)
  - Add spellcheck and possibly minlength, required attributes, and use HTML validity APIs to gate submit:
    - textarea.checkValidity() and element.reportValidity() can be used to prevent submission and show UI if constraints fail; see MDN for HTMLTextAreaElement validity behavior [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement).
  - Consider readonly vs disabled semantics if you later lock the widget mid-slide; readonly still submits value, disabled does not; see MDN on <textarea> attributes [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/textarea).
  - When you read the user input, ensure you use the .value property on the textarea element; reminding because devs sometimes expect getElementById to return the value directly [stackoverflow.com](https://stackoverflow.com/questions/45322363/textarea-return-value-is-always-null).

- Keyboard help consistency
  - Router emits keyboard:help, init emits help:show. Standardize on one bus event.

- Theme/token loading
  - loadTheme/loadTokens fetch and inject CSS. Consider idempotent checks and integrity or CSP for deterministic exports.

- Dev reload overlay
  - Your “reload:prepare” overlay is appended on DOMContentLoaded; if a reload prepare event fires very early, it’s fine (you guard creation), but consider appending immediately if document.readyState !== 'loading' to ensure it actually shows.

- CLI validate and exports
  - You already copy package dists and rewrite /packages/ to ./packages/ for offline HTML. Consider adding SRI hash calculation (you mention it in README) and pinning versions in the export’s import map.

Concrete code changes (snippets)
- PluginManager capability adapters (example sketch)
  - network.fetch to object form:
    'network.fetch': { fetch: (url: string, init?: RequestInit) => fetch(url, init) },
  - telemetry.events:
    'telemetry.events': {
      track: (name: string, props?: any) => this.bus.emit('telemetry:track', { name, props }),
      identify: (id: string, props?: any) => this.bus.emit('telemetry:identify', { id, props }),
      page: (name: string, props?: any) => this.bus.emit('telemetry:page', { name, props }),
    }
  - storage.kv (Promise-based, add list):
    'storage.kv': (ns: string) => {
      const prefix = `coolslides:${ns}::`;
      return {
        async get(k) { const v = localStorage.getItem(prefix + k); try { return v ? JSON.parse(v) : null; } catch { return v; } },
        async set(k, val) { localStorage.setItem(prefix + k, JSON.stringify(val)); },
        async remove(k) { localStorage.removeItem(prefix + k); },
        async list() {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            if (key.startsWith(prefix)) keys.push(key.slice(prefix.length));
          }
          return keys;
        }
      };
    }
  - ui:
    'ui.notifications': {
      show: (m: string) => this.showToast(m),
      notification: (title: string, body?: string) => this.showToast(`${title}${body ? ': ' + body : ''}`),
      toast: (m: string) => this.showToast(m)
    }
  - rooms.ws (wrapper):
    'rooms.ws': {
      connect: (roomId: string) => {
        const url = (this.rooms as any).computeWsUrl ? (this.rooms as any).computeWsUrl(`/rooms/${encodeURIComponent(roomId)}`) : 
                    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rooms/${encodeURIComponent(roomId)}`;
        const ws = new WebSocket(url);
        const handlers: { msg?: (d:any)=>void; close?: ()=>void } = {};
        ws.onmessage = (evt) => { try { handlers.msg?.(JSON.parse(evt.data)); } catch {} };
        ws.onclose = () => handlers.close?.();
        return {
          send: (data: any) => ws.readyState === WebSocket.OPEN ? ws.send(JSON.stringify(data)) : undefined,
          onMessage: (cb: (d:any)=>void) => { handlers.msg = cb; },
          onClose: (cb: ()=>void) => { handlers.close = cb; },
          close: () => ws.close()
        };
      }
    }

- Bridge PollWidget DOM events to bus in init.ts
  - After creating the bus:
    document.addEventListener('poll:vote', (e: any) => bus.emit('poll:response', { response: e.detail }), { capture: true });

- Fix CodeSlide counting and block structure
  - Replace this.code.split('\\n').length with this.code.split('\n').length.
  - When lineNumbers is on, wrap output outside <code>, e.g.:
    const body = options.lineNumbers ? numberedHtml : `<pre><code>${highlighted}</code></pre>`;
    and inject body directly into .code-content.

- Speaker view timer
  - After initializeSpeakerWindow(): this.timer = new SpeakerTimer(this.speakerWindow.document); this.timer.start();
  - In SpeakerTimer, store the doc and query inside that doc to update #timer.

- Event decorator
  - In eventHandler decorator, hook into connectedCallback and add/remove listeners there rather than waiting for the method to be called the first time.

Smaller correctness touches
- DynamicModuleLoader resolveModulePath: if you return an absolute URL for relative specifiers with basePath = location.origin, you’ll end up with "https://host/./path"; that’s fine, but ensure you don’t double-prefix already absolute paths that start with '/' (return them as-is).
- RoomsClient: consider minimal heartbeat/ping to keep connections warm and a reconnection strategy (you already warn on errors).
- Accessibility
  - PollWidget: associate labels with inputs via for/id as well as wrapping, and add aria-live on results for immediate feedback. Add aria-disabled when locked.
  - Keyboard nav for PollWidget rating buttons should support arrow keys.

What’s solid
- The IR and server-side HTML generation are well thought out (schema-validated, ergonomic TOML forms, good sanitization split with strict mode).
- Runtime primitives (router, fragments, theming, module loader) are cohesive, and the room sync path presenter→audience is simple and robust.
- Export paths for HTML/PDF are pragmatic and the HTML export is offline-capable with import maps rewritten.

Quick QA checklist after fixes
- Defer visible confirmed: poll widget code only loads when the slide is active (use DevTools network).
- Poll end-to-end: click an option → 'poll:vote' DOM → bus 'poll:response' → PollPlugin response handling → results render in PollWidget.
- SpeakerView: timer counts up; next/prev control messages work; current/next previews update upon navigation.
- CodeSlide line numbers render with valid HTML and syntax colors visible.
- QuoteSlide variant respected in example deck.
- Plugins load without capability errors; telemetry tracks and stores through storage.kv adapter.

References
- HTMLTextAreaElement validity and constraint behavior: [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement)
- The textarea element attributes (readonly vs disabled, spellcheck): [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/textarea)
- Reminder on getting textarea value programmatically: [stackoverflow.com](https://stackoverflow.com/questions/45322363/textarea-return-value-is-always-null)
