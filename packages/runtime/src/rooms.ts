/**
 * Simple Rooms WebSocket client for presenter/audience sync
 */

import { EventBus } from './types.js';

export interface RoomsClientOptions {
  roomId?: string;
  url?: string; // override ws url
}

export class RoomsClient {
  private bus: EventBus;
  private ws: WebSocket | null = null;
  private opts: RoomsClientOptions;
  // Track state if needed later

  constructor(bus: EventBus, opts: RoomsClientOptions = {}) {
    this.bus = bus;
    this.opts = opts;
  }

  connect(): void {
    const roomId = this.opts.roomId || this.getRoomIdFromURL() || 'default';
    const url = this.opts.url || this.computeWsUrl(`/rooms/${encodeURIComponent(roomId)}`);
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.bus.emit('rooms:open', { roomId }); };
      this.ws.onclose = () => { this.bus.emit('rooms:close', { roomId }); };
      this.ws.onerror = (e) => { this.bus.emit('rooms:error', e); };
      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          this.bus.emit('rooms:message', msg);
          if (msg.type === 'event' && msg.event) {
            this.bus.emit(`rooms:event:${msg.event.name}`, msg.event);
          }
        } catch {}
      };
    } catch (e) {
      console.warn('Rooms WS connect failed', e);
    }
  }

  sendEvent(name: string, data: any = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify({ type: 'event', event: { name, data, client_id: 'runtime' }, timestamp: Date.now() });
    this.ws.send(payload);
  }

  private computeWsUrl(path: string): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${path}`;
  }

  private getRoomIdFromURL(): string | null {
    try {
      const u = new URL(location.href);
      return u.searchParams.get('room');
    } catch { return null; }
  }
}
