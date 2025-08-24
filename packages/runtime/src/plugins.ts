/**
 * Minimal plugin host with capability adapters
 */

import { EventBus, RuntimeContext } from './types.js';

export type CapabilityMap = {
  // Expose as object with fetch method; keep callable form internally for compat
  'network.fetch'?: any;
  // Promise-based storage with list()
  'storage.kv'?: (ns: string) => {
    get(key: string): Promise<any>;
    set(key: string, val: any): Promise<void>;
    remove(key: string): Promise<void>;
    list(): Promise<string[]>;
  };
  // Rich notifications + toast API
  'ui.notifications'?: {
    show(message: string): void;
    notification(title: string, body?: string, opts?: any): void;
    toast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  };
  // Back-compat alias expected by some plugins
  'ui.toast'?: { toast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void };
  // WebSocket wrapper factory as expected by plugins
  'rooms.ws'?: {
    connect(roomId: string): {
      send(data: any): void;
      onMessage(cb: (data: any) => void): void;
      onClose(cb: () => void): void;
      close(): void;
    };
  };
  // Telemetry event sink
  'telemetry.events'?: { track: (name: string, props?: any) => void; identify: (id: string, props?: any) => void; page: (name: string, props?: any) => void };
};

export interface PluginModule {
  name?: string;
  capabilities?: (keyof CapabilityMap)[];
  init?: (ctx: { context: RuntimeContext; bus: EventBus; capabilities: CapabilityMap }) => Promise<void> | void;
}

export interface PluginManagerOptions {
  offline?: boolean;
}

export class PluginManager {
  private bus: EventBus;
  private context: RuntimeContext;
  private importMap: Record<string, string>;
  private opts: PluginManagerOptions;

  constructor(context: RuntimeContext, bus: EventBus, importMap: Record<string, string>, opts: PluginManagerOptions = {}) {
    this.context = context;
    this.bus = bus;
    this.importMap = importMap;
    this.opts = opts;
  }

  async loadAll(specs: string[]): Promise<void> {
    for (const spec of specs) {
      try {
        const modPath = this.importMap[spec] || spec;
        const mod = await import(modPath) as any;
        const plugin: PluginModule = (mod && (mod.default || mod)) as PluginModule;
        await this.initialize(plugin);
      } catch (e) {
        console.warn('Failed to load plugin', spec, e);
      }
    }
  }

  private async initialize(plugin: PluginModule): Promise<void> {
    const offline = !!this.opts.offline;
    const caps: CapabilityMap = {
      // Provide object form with fetch method; also keep callable behavior
      'network.fetch': offline
        ? Object.assign(
            (_input: RequestInfo, _init?: RequestInit) => Promise.reject(new Error('offline mode: network disabled')),
            { fetch: (_url: string, _init?: RequestInit) => Promise.reject(new Error('offline mode: network disabled')) }
          )
        : Object.assign(
            (input: RequestInfo, init?: RequestInit) => fetch(input, init),
            { fetch: (url: string, init?: RequestInit) => fetch(url, init) }
          ),
      'storage.kv': Object.assign(
        (ns: string) => this.makeAsyncKV(ns),
        this.makeAsyncKV('deck')
      ),
      'ui.notifications': {
        show: (m: string) => this.showToast(m),
        notification: (title: string, body?: string) => this.showToast(`${title}${body ? ': ' + body : ''}`),
        toast: (m: string) => this.showToast(m),
      },
      'ui.toast': { toast: (m: string) => this.showToast(m) },
      'rooms.ws': {
        connect: (roomId: string) => offline ? this.makeWsStub(roomId) : this.makeWsConnection(roomId),
      },
      'telemetry.events': {
        track: (name: string, props?: any) => this.bus.emit('telemetry:track', { name, props }),
        identify: (id: string, props?: any) => this.bus.emit('telemetry:identify', { id, props }),
        page: (name: string, props?: any) => this.bus.emit('telemetry:page', { name, props }),
      },
    };
    if (plugin.init) {
      const ctx: any = {
        deck: this.context.deck,
        slide: null,
        router: this.context.router,
        logger: console,
        bus: this.bus,
        capabilities: caps,
        context: this.context, // keep for back-compat
      };
      await plugin.init(ctx);
    }
  }

  private makeAsyncKV(ns: string) {
    const prefix = `coolslides:${ns}::`;
    return {
      async get(key: string) {
        const v = localStorage.getItem(prefix + key);
        try { return v ? JSON.parse(v) : null; } catch { return v; }
      },
      async set(key: string, val: any) {
        try { localStorage.setItem(prefix + key, JSON.stringify(val)); } catch { /* noop */ }
      },
      async remove(key: string) {
        localStorage.removeItem(prefix + key);
      },
      async list() {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith(prefix)) keys.push(k.slice(prefix.length));
        }
        return keys;
      }
    };
  }

  private makeWsConnection(roomId: string) {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rooms/${encodeURIComponent(roomId)}`;
    const ws = new WebSocket(url);
    const handlers: { msg?: (d: any) => void; close?: () => void } = {};
    ws.onmessage = (evt) => {
      try { handlers.msg?.(JSON.parse(evt.data)); } catch { /* noop */ }
    };
    ws.onclose = () => { handlers.close?.(); };
    return {
      send: (data: any) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); },
      onMessage: (cb: (d: any) => void) => { handlers.msg = cb; },
      onClose: (cb: () => void) => { handlers.close = cb; },
      close: () => ws.close(),
    };
  }

  private makeWsStub(_roomId: string) {
    const handlers: { msg?: (d: any) => void; close?: () => void } = {};
    // Emit a warning once
    try { console.warn('rooms.ws disabled (offline mode)'); } catch {}
    return {
      send: (_data: any) => { /* no-op */ },
      onMessage: (cb: (d: any) => void) => { handlers.msg = cb; },
      onClose: (cb: () => void) => { handlers.close = cb; },
      close: () => { try { handlers.close?.(); } catch {} },
    };
  }

  private showToast(message: string) {
    try {
      const el = document.createElement('div');
      el.textContent = message;
      el.setAttribute('style', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:6px;border:1px solid #333;z-index:2147483647;font:500 13px system-ui,sans-serif');
      document.body.appendChild(el);
      setTimeout(() => { el.remove(); }, 2000);
    } catch {}
  }
}
