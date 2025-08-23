/**
 * Dynamic module loader for slot components
 * Handles loading and defining custom elements on demand
 */

import { EventBus } from './types.js';

export interface ModuleLoaderOptions {
  /** Base path for resolving relative module paths */
  basePath?: string;
  /** Import map for module resolution */
  importMap?: Record<string, string>;
}

export class DynamicModuleLoader {
  private bus: EventBus;
  private options: ModuleLoaderOptions;
  private loadedModules = new Set<string>();
  private loadingPromises = new Map<string, Promise<void>>();

  constructor(bus: EventBus, options: ModuleLoaderOptions = {}) {
    this.bus = bus;
    this.options = options;
    
    // Listen for slide enter events to preload slot components
    this.bus.on('slide:enter', (data) => {
      this.preloadSlideComponents(data.slideId);
    });
  }

  /**
   * Load and define a component module
   */
  async loadComponent(modulePath: string, tag: string, defer?: 'eager' | 'visible' | 'idle'): Promise<void> {
    // Check if component is already defined
    if (customElements.get(tag)) {
      return;
    }

    // Use defer strategy
    switch (defer) {
      case 'idle':
        if ('requestIdleCallback' in window) {
          return new Promise((resolve) => {
            requestIdleCallback(() => {
              this.loadModule(modulePath).then(resolve);
            });
          });
        } else {
          // Fallback for browsers without requestIdleCallback
          return new Promise((resolve) => {
            setTimeout(() => {
              this.loadModule(modulePath).then(resolve);
            }, 0);
          });
        }
      
      case 'visible':
        // For now, treat visible same as eager - proper intersection observer implementation
        // would require DOM element to observe
        return this.loadModule(modulePath);
        
      case 'eager':
      default:
        return this.loadModule(modulePath);
    }
  }

  /**
   * Preload all components for a given slide
   */
  private async preloadSlideComponents(slideId: string): Promise<void> {
    const slideElement = document.querySelector(`[data-slide="${slideId}"]`);
    if (!slideElement) {
      return;
    }

    // Find all slot components in this slide
    const slotComponents = slideElement.querySelectorAll('[data-slot-component]');
    const loadPromises: Promise<void>[] = [];

    slotComponents.forEach((element) => {
      const module = element.getAttribute('data-module');
      const tag = element.tagName.toLowerCase();
      const defer = element.getAttribute('data-defer') as 'eager' | 'visible' | 'idle' | null;
      
      if (module && tag) {
        loadPromises.push(this.loadComponent(module, tag, defer || 'eager'));
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load a module by path
   */
  private async loadModule(modulePath: string): Promise<void> {
    const resolvedPath = this.resolveModulePath(modulePath);
    
    // Check if already loaded
    if (this.loadedModules.has(resolvedPath)) {
      return;
    }

    // Check if already loading
    if (this.loadingPromises.has(resolvedPath)) {
      return this.loadingPromises.get(resolvedPath)!;
    }

    // Start loading
    const loadPromise = this.doLoadModule(resolvedPath);
    this.loadingPromises.set(resolvedPath, loadPromise);

    try {
      await loadPromise;
      this.loadedModules.add(resolvedPath);
      this.bus.emit('module:loaded', { path: resolvedPath });
    } catch (error) {
      console.error(`Failed to load module ${resolvedPath}:`, error);
      this.bus.emit('module:error', { path: resolvedPath, error });
      throw error;
    } finally {
      this.loadingPromises.delete(resolvedPath);
    }
  }

  /**
   * Actually perform the module import
   */
  private async doLoadModule(modulePath: string): Promise<void> {
    try {
      await import(modulePath);
    } catch (error) {
      // Try with .js extension if not present
      if (!modulePath.endsWith('.js') && !modulePath.endsWith('.ts')) {
        try {
          await import(`${modulePath}.js`);
          return;
        } catch (jsError) {
          // Throw original error if .js version also fails
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Resolve module path using import map and base path
   */
  private resolveModulePath(modulePath: string): string {
    // First try import map resolution
    if (this.options.importMap && this.options.importMap[modulePath]) {
      return this.options.importMap[modulePath];
    }

    // Check for relative paths
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      if (this.options.basePath) {
        return new URL(modulePath, this.options.basePath).href;
      }
    }

    // Return as-is for absolute URLs or bare specifiers
    return modulePath;
  }

  /**
   * Preload all slot components from the current DOM
   */
  async preloadAllSlotComponents(): Promise<void> {
    const slotComponents = document.querySelectorAll('[data-slot-component]');
    const loadPromises: Promise<void>[] = [];

    slotComponents.forEach((element) => {
      const module = element.getAttribute('data-module');
      const tag = element.tagName.toLowerCase();
      const defer = element.getAttribute('data-defer') as 'eager' | 'visible' | 'idle' | null;
      
      if (module && tag) {
        loadPromises.push(this.loadComponent(module, tag, defer || 'eager'));
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Get loading status for debugging
   */
  getLoadingStatus(): { loaded: string[]; loading: string[] } {
    return {
      loaded: Array.from(this.loadedModules),
      loading: Array.from(this.loadingPromises.keys())
    };
  }
}