/**
 * Base class for Coolslides custom element components
 */

import { ComponentLifecycle, SlideContext, ComponentEvent } from './types.js';

export abstract class CoolslidesElement extends HTMLElement implements ComponentLifecycle {
  private _slideContext: SlideContext | null = null;
  private _isConnected = false;
  private _updateScheduled = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this._isConnected) {
      this._isConnected = true;
      this.requestUpdate();
      this.dispatchEvent(new CustomEvent('ready', { bubbles: true }));
    }
  }

  disconnectedCallback(): void {
    this._isConnected = false;
    if (this.teardown) {
      this.teardown();
    }
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue) {
      this.requestUpdate();
    }
  }

  // Lifecycle methods (optional implementation)
  pause?(): void;
  resume?(): void;
  teardown?(): void;
  
  static async prefetch?(props: Record<string, any>): Promise<void>;

  // Update system
  protected requestUpdate(): void {
    if (!this._updateScheduled) {
      this._updateScheduled = true;
      queueMicrotask(() => {
        this._updateScheduled = false;
        if (this._isConnected) {
          this.performUpdate();
        }
      });
    }
  }

  protected performUpdate(): void {
    try {
      this.update();
    } catch (error) {
      console.error('Error during component update:', error);
      this.dispatchEvent(new CustomEvent('error', { 
        detail: error,
        bubbles: true 
      }) as ComponentEvent);
    }
  }

  protected abstract update(): void;

  // Slide context management
  get slideContext(): SlideContext | null {
    return this._slideContext;
  }

  set slideContext(context: SlideContext | null) {
    const oldContext = this._slideContext;
    this._slideContext = context;
    this.onSlideContextChanged(oldContext, context);
  }

  protected onSlideContextChanged(
    _oldContext: SlideContext | null, 
    _newContext: SlideContext | null
  ): void {
    // Override in subclasses if needed
    this.requestUpdate();
  }

  // Utility methods
  protected emit<T = any>(type: string, detail?: T, options?: Partial<CustomEventInit<T>>): void {
    const event = new CustomEvent(type, {
      detail,
      bubbles: true,
      cancelable: true,
      ...options
    }) as ComponentEvent<T>;
    
    this.dispatchEvent(event);
  }

  protected css(strings: TemplateStringsArray, ...values: any[]): string {
    return strings.reduce((result, string, i) => {
      const value = values[i] ? String(values[i]) : '';
      return result + string + value;
    }, '');
  }

  protected html(strings: TemplateStringsArray, ...values: any[]): string {
    return strings.reduce((result, string, i) => {
      const value = values[i] ? String(values[i]) : '';
      return result + string + value;
    }, '');
  }

  // CSS custom property helpers
  protected getCSSCustomProperty(property: string): string {
    return getComputedStyle(this).getPropertyValue(property).trim();
  }

  protected setCSSCustomProperty(property: string, value: string): void {
    this.style.setProperty(property, value);
  }

  // Token-based styling support
  protected useTokens(tokens: string[]): void {
    // Mark this component as using specific design tokens
    this.setAttribute('data-tokens-used', tokens.join(','));
  }
}

// Property decorator implementation
export function property(options: {
  type?: any;
  reflect?: boolean;
  attribute?: string | boolean;
} = {}) {
  return function (target: any, propertyKey: string) {
    const attributeName = typeof options.attribute === 'string' 
      ? options.attribute 
      : options.attribute === false 
        ? null 
        : propertyKey.toLowerCase();

    // Ensure observedAttributes exists
    if (!target.constructor.observedAttributes) {
      target.constructor.observedAttributes = [];
    }
    
    if (attributeName && !target.constructor.observedAttributes.includes(attributeName)) {
      target.constructor.observedAttributes.push(attributeName);
    }

    // Create property descriptor
    const descriptor: PropertyDescriptor = {
      get(this: CoolslidesElement) {
        if (attributeName) {
          const value = this.getAttribute(attributeName);
          return convertFromAttribute(value, options.type);
        }
        return (this as any)[`__${propertyKey}`];
      },
      
      set(this: CoolslidesElement, value: any) {
        const oldValue = (this as any)[propertyKey];
        (this as any)[`__${propertyKey}`] = value;
        
        if (options.reflect && attributeName) {
          const attrValue = convertToAttribute(value, options.type);
          if (attrValue !== null) {
            this.setAttribute(attributeName, attrValue);
          } else {
            this.removeAttribute(attributeName);
          }
        }
        
        if (oldValue !== value) {
          this.requestUpdate();
        }
      },
      
      configurable: true,
      enumerable: true
    };

    Object.defineProperty(target, propertyKey, descriptor);
  };
}

function convertFromAttribute(value: string | null, type?: any): any {
  if (value === null) return null;
  
  if (!type || type === String) {
    return value;
  } else if (type === Number) {
    return Number(value);
  } else if (type === Boolean) {
    return value !== null;
  } else if (type === Array || type === Object) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  
  return value;
}

function convertToAttribute(value: any, type?: any): string | null {
  if (value == null) return null;
  
  if (!type || type === String) {
    return String(value);
  } else if (type === Number) {
    return String(value);
  } else if (type === Boolean) {
    return value ? '' : null;
  } else if (type === Array || type === Object) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  
  return String(value);
}