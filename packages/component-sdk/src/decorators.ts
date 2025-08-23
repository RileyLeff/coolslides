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
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (this: HTMLElement, ...args: any[]) {
      // Bind event listener when component connects
      if (!this.hasAttribute('data-event-handlers-bound')) {
        this.addEventListener(eventType, originalMethod.bind(this));
        this.setAttribute('data-event-handlers-bound', 'true');
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

// Property decorator (re-exported from base)
export { property } from './base.js';