/**
 * Utility functions for component development
 */

// Debounce utility for performance
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): T {
  let timeout: number | null = null;
  
  return ((...args: Parameters<T>): ReturnType<T> | void => {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(null, args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = window.setTimeout(later, wait);
    
    if (callNow) {
      return func.apply(null, args);
    }
  }) as T;
}

// Throttle utility
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let inThrottle = false;
  
  return ((...args: Parameters<T>): ReturnType<T> | void => {
    if (!inThrottle) {
      const result = func.apply(null, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), wait);
      return result;
    }
  }) as T;
}

// CSS class utility
export function classNames(...args: (string | Record<string, boolean> | undefined | null)[]): string {
  const classes: string[] = [];
  
  args.forEach(arg => {
    if (!arg) return;
    
    if (typeof arg === 'string') {
      classes.push(arg);
    } else if (typeof arg === 'object') {
      Object.entries(arg).forEach(([key, value]) => {
        if (value) {
          classes.push(key);
        }
      });
    }
  });
  
  return classes.join(' ');
}

// Safe HTML escaping
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// CSS custom property helpers
export function getCSSCustomProperty(property: string, element?: HTMLElement): string {
  const target = element || document.documentElement;
  return getComputedStyle(target).getPropertyValue(property).trim();
}

export function setCSSCustomProperty(property: string, value: string, element?: HTMLElement): void {
  const target = element || document.documentElement;
  target.style.setProperty(property, value);
}

// Media query helpers
export function matchesMediaQuery(query: string): boolean {
  return window.matchMedia(query).matches;
}

export function createMediaQueryWatcher(query: string, callback: (matches: boolean) => void): () => void {
  const mediaQuery = window.matchMedia(query);
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  
  mediaQuery.addEventListener('change', handler);
  
  // Call immediately with current state
  callback(mediaQuery.matches);
  
  // Return cleanup function
  return () => mediaQuery.removeEventListener('change', handler);
}

// Reduced motion detection
export function prefersReducedMotion(): boolean {
  return matchesMediaQuery('(prefers-reduced-motion: reduce)');
}

// Focus management
export function trapFocus(element: HTMLElement): () => void {
  const focusableElements = element.querySelectorAll(
    'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
  ) as NodeListOf<HTMLElement>;
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  };
  
  element.addEventListener('keydown', handleTabKey);
  
  return () => element.removeEventListener('keydown', handleTabKey);
}

// Intersection observer helper
export function createIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver {
  return new IntersectionObserver(callback, {
    threshold: 0.1,
    rootMargin: '50px',
    ...options
  });
}

// Resize observer helper
export function createResizeObserver(
  callback: (entries: ResizeObserverEntry[]) => void
): ResizeObserver {
  return new ResizeObserver(callback);
}

// Animation helpers
export function requestAnimationFrame(): Promise<number> {
  return new Promise(resolve => {
    window.requestAnimationFrame(resolve);
  });
}

export function nextAnimationFrame(): Promise<number> {
  return requestAnimationFrame().then(() => requestAnimationFrame());
}

// Type guards
export function isHTMLElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function isCustomElement(element: Element): boolean {
  return element.tagName.includes('-');
}