/**
 * Router and navigation for Coolslides presentations
 * Handles hash routes (#/slideId[/fragmentIndex]), keyboard navigation, and history
 */

import { EventBus, Router, RuntimeContext, SlideEnterEvent, SlideLeaveEvent } from './types.js';
import { DefaultFragmentManager } from './fragments.js';

export class SlideRouter implements Router {
  private context: RuntimeContext;
  private bus: EventBus;
  private currentSlideId: string | null = null;
  private currentFragment: number = 0;
  private slideSequence: string[] = [];
  private fragmentManager: DefaultFragmentManager;

  constructor(context: RuntimeContext, bus: EventBus) {
    this.context = context;
    this.bus = bus;
    this.fragmentManager = new DefaultFragmentManager(bus);
    // Ensure fragment styles/behavior are initialized early
    this.fragmentManager.initialize();
    this.buildSlideSequence();
    this.setupEventListeners();
    this.loadFromHash();
  }

  private buildSlideSequence(): void {
    this.slideSequence = [];
    
    for (const item of this.context.deck.sequence) {
      if (item.type === 'ref') {
        this.slideSequence.push(item.ref);
      } else if (item.type === 'group') {
        this.slideSequence.push(...item.slides);
      }
    }
  }

  private setupEventListeners(): void {
    // Hash change navigation
    window.addEventListener('hashchange', () => {
      this.loadFromHash();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      const run = async () => {
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            if (await this.tryActiveSlideAdvance('forward')) return;
            this.nextFragment() || this.nextSlide();
            break;
          case ' ':
            e.preventDefault();
            if (e.shiftKey) {
              if (await this.tryActiveSlideAdvance('backward')) return;
              this.prevFragment() || this.prevSlide();
            } else {
              if (await this.tryActiveSlideAdvance('forward')) return;
              this.nextFragment() || this.nextSlide();
            }
            break;
          case 'ArrowLeft':
            e.preventDefault();
            if (await this.tryActiveSlideAdvance('backward')) return;
            this.prevFragment() || this.prevSlide();
            break;
          case 'Home':
            e.preventDefault();
            this.firstSlide();
            break;
          case 'End':
            e.preventDefault();
            this.lastSlide();
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (await this.tryActiveSlideAdvance('forward')) return;
            this.nextFragment();
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (await this.tryActiveSlideAdvance('backward')) return;
            this.prevFragment();
            break;
          case '?':
            e.preventDefault();
            this.showKeyboardHelp();
            break;
        }
      };
      // fire-and-forget async to allow awaiting component onAdvance hooks
      run();
    });
  }

  private loadFromHash(): void {
    const hash = window.location.hash.slice(1); // Remove #
    if (!hash) {
      this.navigate(this.slideSequence[0] || '', 0);
      return;
    }

    const [slideId, fragmentStr] = hash.split('/');
    const fragment = fragmentStr ? parseInt(fragmentStr, 10) : 0;
    
    if (slideId && this.context.slides.has(slideId)) {
      this.navigate(slideId, fragment);
    }
  }

  navigate(slideId: string, fragment: number = 0): void {
    if (!this.context.slides.has(slideId)) {
      console.warn(`Slide not found: ${slideId}`);
      return;
    }

    const prevSlideId = this.currentSlideId;
    const prevFragment = this.currentFragment;
    
    // Emit leave event for previous slide
    if (prevSlideId && this.context.slides.has(prevSlideId)) {
      const leaveEvent: SlideLeaveEvent = {
        slideId: prevSlideId,
        slide: this.context.slides.get(prevSlideId)!,
        fragment: prevFragment,
      };
      this.bus.emit('slide:leave', leaveEvent);
    }

    // Update state
    this.currentSlideId = slideId;
    this.currentFragment = fragment;
    this.context.currentSlide = slideId;
    this.context.currentFragment = fragment;

    // Update URL
    const hash = fragment > 0 ? `#${slideId}/${fragment}` : `#${slideId}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }

    // Emit enter event for new slide
    const enterEvent: SlideEnterEvent = {
      slideId,
      slide: this.context.slides.get(slideId)!,
      fragment,
    };
    this.bus.emit('slide:enter', enterEvent);

    // Update DOM
    this.updateSlideDisplay();
  }

  getCurrentSlide(): string | null {
    return this.currentSlideId;
  }

  // Safety alias for plugin/runtime callers
  getCurrentSlideId(): string | null {
    return this.getCurrentSlide();
  }

  getCurrentFragment(): number {
    return this.currentFragment;
  }

  getNextSlide(): string | null {
    if (!this.currentSlideId) return null;
    
    const currentIndex = this.slideSequence.indexOf(this.currentSlideId);
    if (currentIndex === -1 || currentIndex >= this.slideSequence.length - 1) {
      return null;
    }
    
    return this.slideSequence[currentIndex + 1];
  }

  getPrevSlide(): string | null {
    if (!this.currentSlideId) return null;
    
    const currentIndex = this.slideSequence.indexOf(this.currentSlideId);
    if (currentIndex <= 0) {
      return null;
    }
    
    return this.slideSequence[currentIndex - 1];
  }

  nextSlide(): boolean {
    const next = this.getNextSlide();
    if (next) {
      this.navigate(next, 0);
      return true;
    }
    return false;
  }

  prevSlide(): boolean {
    const prev = this.getPrevSlide();
    if (prev) {
      // Navigate to the last fragment of the previous slide
      this.navigate(prev, this.getSlideFragmentCount(prev) - 1);
      return true;
    }
    return false;
  }

  firstSlide(): void {
    if (this.slideSequence.length > 0) {
      this.navigate(this.slideSequence[0], 0);
    }
  }

  lastSlide(): void {
    if (this.slideSequence.length > 0) {
      const lastSlide = this.slideSequence[this.slideSequence.length - 1];
      this.navigate(lastSlide, this.getSlideFragmentCount(lastSlide) - 1);
    }
  }

  nextFragment(): boolean {
    if (!this.currentSlideId) return false;
    
    const maxFragments = this.getSlideFragmentCount(this.currentSlideId);
    if (this.currentFragment < maxFragments - 1) {
      this.navigate(this.currentSlideId, this.currentFragment + 1);
      return true;
    }
    return false;
  }

  prevFragment(): boolean {
    if (!this.currentSlideId) return false;
    
    if (this.currentFragment > 0) {
      this.navigate(this.currentSlideId, this.currentFragment - 1);
      return true;
    }
    return false;
  }

  private getSlideFragmentCount(slideId: string): number {
    const slideElement = document.querySelector(`[data-slide="${slideId}"]`) as HTMLElement;
    if (!slideElement) {
      return 1; // Default if slide not found
    }
    return this.fragmentManager.getFragmentCount(slideElement);
  }

  private updateSlideDisplay(): void {
    if (!this.currentSlideId) return;

    // Remove active state from all slides
    document.querySelectorAll('[data-slide]').forEach(slide => {
      slide.removeAttribute('data-active');
    });

    // Set current slide as active
    const currentSlideEl = document.querySelector(`[data-slide="${this.currentSlideId}"]`);
    if (currentSlideEl) {
      currentSlideEl.setAttribute('data-active', '');
      
      // Handle fragments using the fragment manager
      this.fragmentManager.updateFragments(currentSlideEl as HTMLElement, this.currentFragment);
    }
  }

  // Try letting active slide components consume the advance
  private async tryActiveSlideAdvance(dir: 'forward' | 'backward'): Promise<boolean> {
    const slideId = this.currentSlideId;
    if (!slideId) return false;
    const activeSlideEl = document.querySelector(`[data-slide="${slideId}"]`);
    if (!activeSlideEl) return false;

    // Walk custom elements within the active slide
    const elements = Array.from(activeSlideEl.querySelectorAll('*')) as any[];
    for (const el of elements) {
      const fn = (el as any).onAdvance as any;
      if (typeof fn === 'function') {
        try {
          const consumed = fn.call(el, dir, { bus: this.bus, router: this, slideId });
          if (consumed && typeof consumed.then === 'function') {
            if (await consumed) return true;
          } else if (consumed) {
            return true;
          }
        } catch (e) {
          console.warn('onAdvance handler error:', e);
        }
      }
    }
    return false;
  }

  
  private showKeyboardHelp(): void {
    this.bus.emit('keyboard:help');
  }
}
