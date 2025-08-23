/**
 * Theming system with CSS custom properties and tokens
 */

import { EventBus } from './types.js';

export interface ThemeManager {
  initialize(): void;
  loadTheme(themeUrl: string): Promise<void>;
  loadTokens(tokensUrl: string): Promise<void>;
  applySlideOverrides(slideId: string, overrides: Record<string, string>): void;
  removeSlideOverrides(slideId: string): void;
}

export class CSSCustomPropertyThemeManager implements ThemeManager {
  private bus: EventBus;
  private loadedThemes = new Set<string>();
  private loadedTokens = new Set<string>();
  private slideOverrideStyles = new Map<string, HTMLStyleElement>();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  initialize(): void {
    // Listen for slide changes to apply/remove overrides
    this.bus.on('slide:enter', ({ slideId, slide }) => {
      // Remove previous overrides
      this.slideOverrideStyles.forEach((style, id) => {
        if (id !== slideId) {
          style.remove();
          this.slideOverrideStyles.delete(id);
        }
      });

      // Apply current slide overrides
      if (slide.styleOverrides && Object.keys(slide.styleOverrides).length > 0) {
        this.applySlideOverrides(slideId, slide.styleOverrides);
      }
    });

    this.bus.on('slide:leave', ({ slideId }) => {
      this.removeSlideOverrides(slideId);
    });
  }

  async loadTheme(themeUrl: string): Promise<void> {
    if (this.loadedThemes.has(themeUrl)) return;

    try {
      const response = await fetch(themeUrl);
      if (!response.ok) {
        throw new Error(`Failed to load theme: ${response.statusText}`);
      }

      const css = await response.text();
      this.injectCSS(css, `coolslides-theme-${this.hashUrl(themeUrl)}`);
      this.loadedThemes.add(themeUrl);
    } catch (error) {
      console.error(`Error loading theme from ${themeUrl}:`, error);
      throw error;
    }
  }

  async loadTokens(tokensUrl: string): Promise<void> {
    if (this.loadedTokens.has(tokensUrl)) return;

    try {
      const response = await fetch(tokensUrl);
      if (!response.ok) {
        throw new Error(`Failed to load tokens: ${response.statusText}`);
      }

      const css = await response.text();
      this.injectCSS(css, `coolslides-tokens-${this.hashUrl(tokensUrl)}`);
      this.loadedTokens.add(tokensUrl);
    } catch (error) {
      console.error(`Error loading tokens from ${tokensUrl}:`, error);
      throw error;
    }
  }

  applySlideOverrides(slideId: string, overrides: Record<string, string>): void {
    // Remove existing overrides for this slide
    this.removeSlideOverrides(slideId);

    // Validate that all override keys start with '--'
    const validOverrides: Record<string, string> = {};
    Object.entries(overrides).forEach(([key, value]) => {
      if (key.startsWith('--')) {
        validOverrides[key] = value;
      } else {
        console.warn(`Invalid style override key (must start with '--'): ${key}`);
      }
    });

    if (Object.keys(validOverrides).length === 0) return;

    // Create CSS rules for the slide
    const slideSelector = `[data-slide="${slideId}"]`;
    const cssRules = Object.entries(validOverrides)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
    
    const css = `${slideSelector} {\n${cssRules}\n}`;
    
    const styleElement = this.injectCSS(css, `coolslides-slide-overrides-${slideId}`);
    this.slideOverrideStyles.set(slideId, styleElement);
  }

  removeSlideOverrides(slideId: string): void {
    const styleElement = this.slideOverrideStyles.get(slideId);
    if (styleElement) {
      styleElement.remove();
      this.slideOverrideStyles.delete(slideId);
    }
  }

  private injectCSS(css: string, id: string): HTMLStyleElement {
    // Remove existing style element with the same id
    const existing = document.getElementById(id);
    if (existing) {
      existing.remove();
    }

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
    
    return style;
  }

  private hashUrl(url: string): string {
    // Simple hash function for creating unique IDs
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Utility functions for working with CSS custom properties
export function getCSSCustomProperty(property: string, element?: HTMLElement): string {
  const target = element || document.documentElement;
  return getComputedStyle(target).getPropertyValue(property).trim();
}

export function setCSSCustomProperty(property: string, value: string, element?: HTMLElement): void {
  const target = element || document.documentElement;
  target.style.setProperty(property, value);
}

export function removeCSSCustomProperty(property: string, element?: HTMLElement): void {
  const target = element || document.documentElement;
  target.style.removeProperty(property);
}