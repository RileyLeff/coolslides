/**
 * Fragment system for sequential reveal of content
 * Supports data-fragment attributes on elements
 */

import { EventBus } from './types.js';

export interface FragmentManager {
  initialize(): void;
  updateFragments(slideElement: HTMLElement, currentFragment: number): void;
  getFragmentCount(slideElement: HTMLElement): number;
}

export class DefaultFragmentManager implements FragmentManager {
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  initialize(): void {
    // Initialize fragment styles
    this.injectFragmentStyles();
  }

  updateFragments(slideElement: HTMLElement, currentFragment: number): void {
    const fragments = this.getFragmentElements(slideElement);
    
    fragments.forEach((fragment) => {
      const fragmentIndex = this.getFragmentIndex(fragment);
      const isVisible = fragmentIndex <= currentFragment;
      
      this.setFragmentVisibility(fragment, isVisible, fragmentIndex === currentFragment);
    });
  }

  getFragmentCount(slideElement: HTMLElement): number {
    const fragments = this.getFragmentElements(slideElement);
    if (fragments.length === 0) return 1; // At least one "fragment" (the whole slide)
    
    // Find the highest fragment index
    let maxIndex = 0;
    fragments.forEach(fragment => {
      const index = this.getFragmentIndex(fragment);
      maxIndex = Math.max(maxIndex, index);
    });
    
    return maxIndex + 1;
  }

  private getFragmentElements(slideElement: HTMLElement): HTMLElement[] {
    return Array.from(slideElement.querySelectorAll('[data-fragment]'));
  }

  private getFragmentIndex(fragment: HTMLElement): number {
    const indexAttr = fragment.getAttribute('data-fragment');
    if (indexAttr && !isNaN(Number(indexAttr))) {
      return Number(indexAttr);
    }
    
    // If no explicit index, use document order starting from 0
    const allFragments = this.getFragmentElements(fragment.closest('[data-slide]') as HTMLElement);
    return allFragments.indexOf(fragment);
  }

  protected setFragmentVisibility(fragment: HTMLElement, isVisible: boolean, isActive: boolean): void {
    fragment.classList.remove('fragment-hidden', 'fragment-visible', 'fragment-active');
    
    if (isVisible) {
      fragment.classList.add('fragment-visible');
      if (isActive) {
        fragment.classList.add('fragment-active');
      }
    } else {
      fragment.classList.add('fragment-hidden');
    }

    // Emit fragment events
    if (isActive) {
      this.bus.emit('fragment:show', { element: fragment, index: this.getFragmentIndex(fragment) });
    }
  }

  private injectFragmentStyles(): void {
    const styleId = 'coolslides-fragment-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-fragment] {
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      .fragment-hidden {
        opacity: 0;
        transform: translateY(20px);
        pointer-events: none;
      }
      
      .fragment-visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      
      .fragment-active {
        /* Highlight styles for the currently revealed fragment */
      }
      
      /* Respect reduced motion preferences */
      @media (prefers-reduced-motion: reduce) {
        [data-fragment] {
          transition: opacity 0.15s ease;
        }
        
        .fragment-hidden {
          transform: none;
          opacity: 0;
        }
        
        .fragment-visible {
          transform: none;
          opacity: 1;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Fragment animation types
export type FragmentAnimation = 
  | 'fade-in'
  | 'slide-up' 
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out';

export interface FragmentOptions {
  animation?: FragmentAnimation;
  delay?: number;
  duration?: number;
}

// Advanced fragment manager with custom animations
export class AdvancedFragmentManager extends DefaultFragmentManager {
  protected setFragmentVisibility(fragment: HTMLElement, isVisible: boolean, isActive: boolean): void {
    const animation = fragment.getAttribute('data-fragment-animation') as FragmentAnimation || 'fade-in';
    const delay = parseInt(fragment.getAttribute('data-fragment-delay') || '0', 10);
    const duration = parseInt(fragment.getAttribute('data-fragment-duration') || '300', 10);
    
    fragment.style.transitionDelay = `${delay}ms`;
    fragment.style.transitionDuration = `${duration}ms`;
    
    fragment.classList.remove('fragment-hidden', 'fragment-visible', 'fragment-active');
    fragment.classList.remove(...this.getAnimationClasses());
    
    if (isVisible) {
      fragment.classList.add('fragment-visible', animation);
      if (isActive) {
        fragment.classList.add('fragment-active');
      }
    } else {
      fragment.classList.add('fragment-hidden', animation);
    }
  }

  private getAnimationClasses(): string[] {
    return [
      'fade-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 
      'zoom-in', 'zoom-out'
    ];
  }
}