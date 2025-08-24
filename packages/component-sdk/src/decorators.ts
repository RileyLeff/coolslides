/**
 * Decorators for Coolslides components
 */

import { ComponentManifest } from './types.js';

// Class decorator to define component metadata
export function component(manifest: Partial<ComponentManifest>) {
  return function <T extends CustomElementConstructor>(constructor: T) {
    // Store manifest on the constructor
    (constructor as any).__coolslides_manifest = manifest;
    
    // Auto-register the custom element if tag is provided
    if (manifest.tag && !customElements.get(manifest.tag)) {
      customElements.define(manifest.tag, constructor);
    }
    
    return constructor;
  };
}

// Method decorator for event handlers
export function eventHandler(eventType: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const handlerKey = `__coolslides_bound_${propertyKey}`;

    const connected = target.connectedCallback;
    target.connectedCallback = function (...args: any[]) {
      // Ensure prior connectedCallback logic runs
      if (typeof connected === 'function') {
        connected.apply(this, args);
      }
      // Bind once per instance
      if (!this[handlerKey]) {
        this[handlerKey] = descriptor.value.bind(this);
        this.addEventListener(eventType, this[handlerKey]);
      }
    };

    const disconnected = target.disconnectedCallback;
    target.disconnectedCallback = function (...args: any[]) {
      try {
        if (this[handlerKey]) {
          this.removeEventListener(eventType, this[handlerKey]);
          this[handlerKey] = null;
        }
      } finally {
        if (typeof disconnected === 'function') {
          disconnected.apply(this, args);
        }
      }
    };

    return descriptor;
  };
}

// Property decorator (re-exported from base)
export { property } from './base.js';
