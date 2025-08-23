/**
 * Property assignment system for custom elements
 * Applies properties from JSON script tags to elements at runtime
 */

import { EventBus } from './types.js';

export class RuntimePropertyManager {
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
    
    // Listen for slide enter events to apply props
    this.bus.on('slide:enter', (data) => {
      this.applyPropsForSlide(data.slideId);
    });

    // Re-apply props when a dynamic module is loaded to ensure complex props land
    this.bus.on('module:loaded', ({ path }) => {
      const selector = `[data-slot-component][data-module="${path}"]`;
      document.querySelectorAll(selector).forEach(el => {
        this.triggerPropApplication(el as HTMLElement);
      });
      // Also reapply on currently active slide in case component definitions appeared late
      const active = document.querySelector('[data-slide][data-active]');
      if (active) {
        active.querySelectorAll('[data-props-id]').forEach(el => {
          this.triggerPropApplication(el as HTMLElement);
        });
      }
    });
  }

  initialize(): void {
    // Apply props for any currently visible slides
    this.applyPropsForAllSlides();
  }

  /**
   * Apply properties for a specific slide
   */
  applyPropsForSlide(slideId: string): void {
    const slideElement = document.querySelector(`[data-slide="${slideId}"]`);
    if (!slideElement) {
      return;
    }

    // Find all elements with data-props-id in this slide
    const elementsWithProps = slideElement.querySelectorAll('[data-props-id]');
    
    elementsWithProps.forEach((element) => {
      const propsId = element.getAttribute('data-props-id');
      if (propsId) {
        this.applyPropsToElement(element as HTMLElement, propsId);
      }
    });
  }

  /**
   * Apply properties for all slides (used during initialization)
   */
  private applyPropsForAllSlides(): void {
    const elementsWithProps = document.querySelectorAll('[data-props-id]');
    
    elementsWithProps.forEach((element) => {
      const propsId = element.getAttribute('data-props-id');
      if (propsId) {
        this.applyPropsToElement(element as HTMLElement, propsId);
      }
    });
  }

  /**
   * Apply properties to a specific element from its JSON script tag
   */
  private applyPropsToElement(element: HTMLElement, propsId: string): void {
    // Find the corresponding props script tag
    const propsScript = document.querySelector(`script[type="application/json"][data-props="${propsId}"]`);
    
    if (!propsScript || !propsScript.textContent) {
      console.warn(`No props script found for element with data-props-id="${propsId}"`);
      return;
    }

    try {
      const props = JSON.parse(propsScript.textContent);
      
      // Apply each property to the element
      Object.entries(props).forEach(([key, value]) => {
        this.applyPropertyToElement(element, key, value);
      });

      // Emit event for debugging/logging
      this.bus.emit('props:applied', { element, propsId, props });
      
    } catch (error) {
      console.error(`Failed to parse props for element with data-props-id="${propsId}":`, error);
    }
  }

  /**
   * Apply a single property to an element
   */
  private applyPropertyToElement(element: HTMLElement, key: string, value: any): void {
    // Try to set as property first (preferred for complex objects)
    if (key in element) {
      try {
        (element as any)[key] = value;
        return;
      } catch (error) {
        console.warn(`Failed to set property "${key}" on element:`, error);
      }
    }

    // Fallback to attribute for primitives
    if (this.isPrimitive(value)) {
      if (typeof value === 'boolean') {
        // Boolean attributes: presence/absence
        if (value) {
          element.setAttribute(this.camelToKebab(key), '');
        } else {
          element.removeAttribute(this.camelToKebab(key));
        }
      } else {
        // String/number attributes
        element.setAttribute(this.camelToKebab(key), String(value));
      }
    } else {
      console.warn(`Cannot set complex property "${key}" as attribute on element. Property setting failed.`);
    }
  }

  /**
   * Check if a value is a primitive that can be set as an attribute
   */
  private isPrimitive(value: any): boolean {
    return value === null || 
           value === undefined ||
           typeof value === 'string' ||
           typeof value === 'number' ||
           typeof value === 'boolean';
  }

  /**
   * Convert camelCase to kebab-case for attributes
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Manually trigger prop application for dynamic content
   */
  triggerPropApplication(element: HTMLElement): void {
    const propsId = element.getAttribute('data-props-id');
    if (propsId) {
      this.applyPropsToElement(element, propsId);
    }
  }
}
