/**
 * Router and navigation for Coolslides presentations
 * Handles hash routes (#/slideId[/fragmentIndex]), keyboard navigation, and history
 */

import { EventBus, Router, RuntimeContext, SlideEnterEvent, SlideLeaveEvent } from './types.js';

export class SlideRouter implements Router {
  private context: RuntimeContext;
  private bus: EventBus;
  private currentSlideId: string | null = null;
  private currentFragment: number = 0;
  private slideSequence: string[] = [];

  constructor(context: RuntimeContext, bus: EventBus) {
    this.context = context;
    this.bus = bus;
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
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          this.nextFragment() || this.nextSlide();
          break;
        case ' ':
          e.preventDefault();
          if (e.shiftKey) {
            this.prevFragment() || this.prevSlide();
          } else {
            this.nextFragment() || this.nextSlide();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
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
          this.nextFragment();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.prevFragment();
          break;
        case '?':
          e.preventDefault();
          this.showKeyboardHelp();
          break;
      }
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

  private getSlideFragmentCount(_slideId: string): number {
    // TODO: Calculate fragment count based on slide content
    // For now, assume each slide has at least 1 fragment
    return 1;
  }

  private updateSlideDisplay(): void {
    if (!this.currentSlideId) return;

    // Hide all slides
    document.querySelectorAll('[data-slide]').forEach(slide => {
      (slide as HTMLElement).style.display = 'none';
    });

    // Show current slide
    const currentSlideEl = document.querySelector(`[data-slide="${this.currentSlideId}"]`);
    if (currentSlideEl) {
      (currentSlideEl as HTMLElement).style.display = 'block';
      
      // Handle fragments
      this.updateFragments(currentSlideEl as HTMLElement);
    }
  }

  private updateFragments(slideElement: HTMLElement): void {
    const fragments = slideElement.querySelectorAll('[data-fragment]');
    
    fragments.forEach((fragment, index) => {
      const fragmentEl = fragment as HTMLElement;
      const isVisible = index <= this.currentFragment;
      
      if (isVisible) {
        fragmentEl.classList.add('fragment-visible');
        fragmentEl.classList.remove('fragment-hidden');
      } else {
        fragmentEl.classList.add('fragment-hidden');
        fragmentEl.classList.remove('fragment-visible');
      }
    });
  }

  private showKeyboardHelp(): void {
    this.bus.emit('keyboard:help');
  }
}