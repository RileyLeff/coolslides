/**
 * Auto-animate v1 (FLIP) implementation
 * Opt-in per slide via data-auto-animate
 */

import { EventBus } from './types.js';

export interface AutoAnimateManager {
  initialize(): void;
  handleSlideTransition(fromSlide: HTMLElement | null, toSlide: HTMLElement): void;
}

interface AnimationConfig {
  duration: number;
  easing: string;
  delay: number;
  unmatchedBehavior: 'fade' | 'slide' | 'none';
}

interface ElementPair {
  from: HTMLElement;
  to: HTMLElement;
  fromRect: DOMRect;
  toRect: DOMRect;
}

export class FLIPAutoAnimateManager implements AutoAnimateManager {
  private bus: EventBus;
  private lastFromSlide: HTMLElement | null = null;
  private animating = false;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  initialize(): void {
    // Listen for slide transitions
    this.bus.on('slide:enter', ({ slideId }) => {
      const slideElement = document.querySelector(`[data-slide="${slideId}"]`) as HTMLElement;
      if (slideElement?.hasAttribute('data-auto-animate')) {
        this.handleSlideTransition(this.lastFromSlide, slideElement);
      }
      this.lastFromSlide = slideElement;
    });

    // Add base styles for auto-animate
    this.injectAutoAnimateStyles();
  }

  handleSlideTransition(fromSlide: HTMLElement | null, toSlide: HTMLElement): void {
    if (!toSlide.hasAttribute('data-auto-animate')) return;
    if (!fromSlide?.hasAttribute('data-auto-animate')) return;
    if (this.animating) return;

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.handleReducedMotion(fromSlide, toSlide);
      return;
    }

    this.performFLIPAnimation(fromSlide, toSlide);
  }

  private async performFLIPAnimation(fromSlide: HTMLElement, toSlide: HTMLElement): Promise<void> {
    this.animating = true;

    // Get animation configuration
    const config = this.getAnimationConfig(toSlide);
    
    // Find matching elements between slides
    const pairs = this.findMatchingElements(fromSlide, toSlide);
    
    if (pairs.length === 0) {
      this.animating = false;
      return;
    }

    // FLIP: First - Record initial positions (already done in findMatchingElements)
    
    // FLIP: Last - Elements are now in their final positions
    // Force layout calculation
    toSlide.style.display = 'block';
    await this.nextFrame();
    
    // Update final positions
    pairs.forEach(pair => {
      pair.toRect = pair.to.getBoundingClientRect();
    });

    // FLIP: Invert - Move elements back to their initial positions
    pairs.forEach(pair => {
      const deltaX = pair.fromRect.left - pair.toRect.left;
      const deltaY = pair.fromRect.top - pair.toRect.top;
      const deltaW = pair.fromRect.width / pair.toRect.width;
      const deltaH = pair.fromRect.height / pair.toRect.height;

      // Apply initial transform
      pair.to.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
      pair.to.style.transformOrigin = 'top left';
    });

    // Force another layout
    await this.nextFrame();

    // FLIP: Play - Animate to final positions
    const animations = pairs.map(pair => {
      pair.to.style.transition = this.createTransition(config);
      pair.to.style.transform = 'translate(0px, 0px) scale(1, 1)';
      
      return new Promise<void>(resolve => {
        const cleanup = () => {
          pair.to.style.transition = '';
          pair.to.style.transform = '';
          pair.to.style.transformOrigin = '';
          resolve();
        };

        // Use both transitionend and timeout as fallback
        const timeoutId = setTimeout(cleanup, config.duration + 100);
        pair.to.addEventListener('transitionend', () => {
          clearTimeout(timeoutId);
          cleanup();
        }, { once: true });
      });
    });

    // Handle unmatched elements
    this.animateUnmatchedElements(fromSlide, toSlide, pairs, config);

    // Wait for all animations to complete
    await Promise.all(animations);
    
    this.animating = false;
    this.bus.emit('auto-animate:complete');
  }

  private handleReducedMotion(fromSlide: HTMLElement, toSlide: HTMLElement): void {
    // Simple fade transition for reduced motion
    fromSlide.style.opacity = '0';
    toSlide.style.opacity = '1';
    toSlide.style.transition = 'opacity 150ms ease';
    
    setTimeout(() => {
      fromSlide.style.opacity = '';
      toSlide.style.opacity = '';
      toSlide.style.transition = '';
    }, 150);
  }

  private findMatchingElements(fromSlide: HTMLElement, toSlide: HTMLElement): ElementPair[] {
    const pairs: ElementPair[] = [];
    
    // Find elements with matching data-id attributes
    const fromElements = fromSlide.querySelectorAll('[data-id]') as NodeListOf<HTMLElement>;
    
    fromElements.forEach(fromEl => {
      const id = fromEl.getAttribute('data-id');
      if (!id) return;
      
      const toEl = toSlide.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement;
      if (!toEl) return;

      // Skip if elements are identical
      if (fromEl.isEqualNode(toEl)) return;

      pairs.push({
        from: fromEl,
        to: toEl,
        fromRect: fromEl.getBoundingClientRect(),
        toRect: toEl.getBoundingClientRect()
      });
    });

    return pairs;
  }

  private getAnimationConfig(slide: HTMLElement): AnimationConfig {
    const duration = parseInt(slide.getAttribute('data-auto-animate-duration') || '300', 10);
    const easing = slide.getAttribute('data-auto-animate-easing') || 'ease-out';
    const delay = parseInt(slide.getAttribute('data-auto-animate-delay') || '0', 10);
    const unmatchedBehavior = (slide.getAttribute('data-auto-animate-unmatched') || 'fade') as AnimationConfig['unmatchedBehavior'];

    return { duration, easing, delay, unmatchedBehavior };
  }

  private createTransition(config: AnimationConfig): string {
    return `transform ${config.duration}ms ${config.easing} ${config.delay}ms`;
  }

  private animateUnmatchedElements(
    fromSlide: HTMLElement, 
    toSlide: HTMLElement, 
    pairs: ElementPair[], 
    config: AnimationConfig
  ): void {
    if (config.unmatchedBehavior === 'none') return;

    const matchedFromIds = new Set(pairs.map(p => p.from.getAttribute('data-id')));
    const matchedToIds = new Set(pairs.map(p => p.to.getAttribute('data-id')));

    // Animate out unmatched elements from previous slide
    const unmatchedFrom = fromSlide.querySelectorAll('[data-id]') as NodeListOf<HTMLElement>;
    unmatchedFrom.forEach(el => {
      const id = el.getAttribute('data-id');
      if (id && !matchedFromIds.has(id)) {
        this.animateUnmatchedOut(el, config);
      }
    });

    // Animate in unmatched elements in new slide
    const unmatchedTo = toSlide.querySelectorAll('[data-id]') as NodeListOf<HTMLElement>;
    unmatchedTo.forEach(el => {
      const id = el.getAttribute('data-id');
      if (id && !matchedToIds.has(id)) {
        this.animateUnmatchedIn(el, config);
      }
    });
  }

  private animateUnmatchedOut(element: HTMLElement, config: AnimationConfig): void {
    if (config.unmatchedBehavior === 'fade') {
      element.style.transition = `opacity ${config.duration}ms ${config.easing}`;
      element.style.opacity = '0';
    } else if (config.unmatchedBehavior === 'slide') {
      element.style.transition = `transform ${config.duration}ms ${config.easing}`;
      element.style.transform = 'translateX(-100px)';
    }
  }

  private animateUnmatchedIn(element: HTMLElement, config: AnimationConfig): void {
    if (config.unmatchedBehavior === 'fade') {
      element.style.opacity = '0';
      element.style.transition = `opacity ${config.duration}ms ${config.easing} ${config.delay}ms`;
      
      requestAnimationFrame(() => {
        element.style.opacity = '1';
      });
    } else if (config.unmatchedBehavior === 'slide') {
      element.style.transform = 'translateX(100px)';
      element.style.transition = `transform ${config.duration}ms ${config.easing} ${config.delay}ms`;
      
      requestAnimationFrame(() => {
        element.style.transform = 'translateX(0)';
      });
    }
  }

  private injectAutoAnimateStyles(): void {
    const styleId = 'coolslides-auto-animate-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-auto-animate] {
        /* Ensure smooth transitions */
        will-change: transform;
      }
      
      [data-auto-animate] [data-id] {
        /* Prepare elements for animation */
        backface-visibility: hidden;
      }
      
      /* Auto-animate specific transitions */
      .auto-animate-fade-in {
        opacity: 0;
        transition: opacity 300ms ease-out;
      }
      
      .auto-animate-fade-in.active {
        opacity: 1;
      }
      
      .auto-animate-slide-in {
        transform: translateX(100px);
        transition: transform 300ms ease-out;
      }
      
      .auto-animate-slide-in.active {
        transform: translateX(0);
      }
    `;
    
    document.head.appendChild(style);
  }

  private async nextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }
}