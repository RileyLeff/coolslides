/**
 * Component lifecycle utilities and helpers
 */

import { ComponentLifecycle } from './types.js';

// Global registry for lifecycle management
const componentLifecycles = new WeakMap<HTMLElement, ComponentLifecycle>();

export function registerLifecycle(element: HTMLElement, lifecycle: ComponentLifecycle): void {
  componentLifecycles.set(element, lifecycle);
}

export function getLifecycle(element: HTMLElement): ComponentLifecycle | undefined {
  return componentLifecycles.get(element);
}

// Lifecycle event dispatcher
export class LifecycleManager {
  private static instance: LifecycleManager;
  private components = new Set<HTMLElement>();

  static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager();
    }
    return LifecycleManager.instance;
  }

  register(element: HTMLElement): void {
    this.components.add(element);
  }

  unregister(element: HTMLElement): void {
    this.components.delete(element);
  }

  pauseAll(): void {
    this.components.forEach(element => {
      const lifecycle = getLifecycle(element);
      if (lifecycle?.pause) {
        try {
          lifecycle.pause();
        } catch (error) {
          console.error('Error pausing component:', error);
        }
      }
    });
  }

  resumeAll(): void {
    this.components.forEach(element => {
      const lifecycle = getLifecycle(element);
      if (lifecycle?.resume) {
        try {
          lifecycle.resume();
        } catch (error) {
          console.error('Error resuming component:', error);
        }
      }
    });
  }

  teardownAll(): void {
    this.components.forEach(element => {
      const lifecycle = getLifecycle(element);
      if (lifecycle?.teardown) {
        try {
          lifecycle.teardown();
        } catch (error) {
          console.error('Error tearing down component:', error);
        }
      }
    });
    this.components.clear();
  }
}

// Slide transition lifecycle hooks
export function onSlideEnter(callback: (element: HTMLElement) => void): void {
  document.addEventListener('coolslides:slide:enter', (event: Event) => {
    const slideElement = (event as CustomEvent).detail.slideElement;
    const components = slideElement.querySelectorAll('[is]') as NodeListOf<HTMLElement>;
    components.forEach(callback);
  });
}

export function onSlideLeave(callback: (element: HTMLElement) => void): void {
  document.addEventListener('coolslides:slide:leave', (event: Event) => {
    const slideElement = (event as CustomEvent).detail.slideElement;
    const components = slideElement.querySelectorAll('[is]') as NodeListOf<HTMLElement>;
    components.forEach(callback);
  });
}

// Print lifecycle helpers
export function onBeforePrint(callback: (element: HTMLElement) => void): void {
  document.addEventListener('coolslides:before:print', (event: Event) => {
    const slideElement = (event as CustomEvent).detail.slideElement;
    const components = slideElement.querySelectorAll('[is]') as NodeListOf<HTMLElement>;
    components.forEach(callback);
  });
}

// Prefetch helper for component assets
export async function prefetchComponent(
  constructor: CustomElementConstructor, 
  props: Record<string, any>
): Promise<void> {
  if ('prefetch' in constructor && typeof constructor.prefetch === 'function') {
    try {
      await constructor.prefetch(props);
    } catch (error) {
      console.error('Error prefetching component:', error);
    }
  }
}