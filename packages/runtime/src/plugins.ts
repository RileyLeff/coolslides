/**
 * Minimal plugin host with capability adapters
 */

import { EventBus, RuntimeContext } from './types.js';
import { RoomsClient } from './rooms.js';

export type CapabilityMap = {
  'network.fetch'?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  'storage.kv'?: (ns: string) => { get(key: string): any; set(key: string, val: any): void; remove(key: string): void };
  'ui.notifications'?: { show(message: string): void };
  'rooms.ws'?: RoomsClient;
  'telemetry.events'?: { emit: (name: string, data?: any) => void };
};

export interface PluginModule {
  name?: string;
  capabilities?: (keyof CapabilityMap)[];
  init?: (ctx: { context: RuntimeContext; bus: EventBus; capabilities: CapabilityMap }) => Promise<void> | void;
}

export class PluginManager {
  private bus: EventBus;
  private context: RuntimeContext;
  private importMap: Record<string, string>;
  private rooms: RoomsClient;

  constructor(context: RuntimeContext, bus: EventBus, importMap: Record<string, string>, rooms: RoomsClient) {
    this.context = context;
    this.bus = bus;
    this.importMap = importMap;
    this.rooms = rooms;
  }

  async loadAll(specs: string[]): Promise<void> {
    for (const spec of specs) {
      try {
        const modPath = this.importMap[spec] || spec;
        const mod = await import(modPath) as any as PluginModule;
        await this.initialize(mod);
      } catch (e) {
        console.warn('Failed to load plugin', spec, e);
      }
    }
  }

  private async initialize(plugin: PluginModule): Promise<void> {
    const caps: CapabilityMap = {
      'network.fetch': (input: RequestInfo, init?: RequestInit) => fetch(input, init),
      'storage.kv': (ns: string) => this.makeKV(ns),
      'ui.notifications': { show: (m: string) => this.showToast(m) },
      'rooms.ws': this.rooms,
      'telemetry.events': { emit: (name: string, data?: any) => this.bus.emit(`telemetry:${name}`, data) },
    };
    if (plugin.init) {
      await plugin.init({ context: this.context, bus: this.bus, capabilities: caps });
    }
  }

  private makeKV(ns: string) {
    const prefix = `coolslides:${ns}::`;
    return {
      get: (key: string) => {
        const v = localStorage.getItem(prefix + key);
        try { return v ? JSON.parse(v) : null; } catch { return v; }
      },
      set: (key: string, val: any) => {
        try { localStorage.setItem(prefix + key, JSON.stringify(val)); } catch { /* noop */ }
      },
      remove: (key: string) => { localStorage.removeItem(prefix + key); },
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

