export function debounce(func, wait, immediate = false) {
    let timeout = null;
    return ((...args) => {
        const later = () => {
            timeout = null;
            if (!immediate)
                func.apply(null, args);
        };
        const callNow = immediate && !timeout;
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(later, wait);
        if (callNow) {
            return func.apply(null, args);
        }
    });
}
export function throttle(func, wait) {
    let inThrottle = false;
    return ((...args) => {
        if (!inThrottle) {
            const result = func.apply(null, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), wait);
            return result;
        }
    });
}
export function classNames(...args) {
    const classes = [];
    args.forEach(arg => {
        if (!arg)
            return;
        if (typeof arg === 'string') {
            classes.push(arg);
        }
        else if (typeof arg === 'object') {
            Object.entries(arg).forEach(([key, value]) => {
                if (value) {
                    classes.push(key);
                }
            });
        }
    });
    return classes.join(' ');
}
export function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
export function getCSSCustomProperty(property, element) {
    const target = element || document.documentElement;
    return getComputedStyle(target).getPropertyValue(property).trim();
}
export function setCSSCustomProperty(property, value, element) {
    const target = element || document.documentElement;
    target.style.setProperty(property, value);
}
export function matchesMediaQuery(query) {
    return window.matchMedia(query).matches;
}
export function createMediaQueryWatcher(query, callback) {
    const mediaQuery = window.matchMedia(query);
    const handler = (e) => callback(e.matches);
    mediaQuery.addEventListener('change', handler);
    callback(mediaQuery.matches);
    return () => mediaQuery.removeEventListener('change', handler);
}
export function prefersReducedMotion() {
    return matchesMediaQuery('(prefers-reduced-motion: reduce)');
}
export function trapFocus(element) {
    const focusableElements = element.querySelectorAll('a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const handleTabKey = (e) => {
        if (e.key !== 'Tab')
            return;
        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        }
        else {
            if (document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    };
    element.addEventListener('keydown', handleTabKey);
    return () => element.removeEventListener('keydown', handleTabKey);
}
export function createIntersectionObserver(callback, options) {
    return new IntersectionObserver(callback, {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
    });
}
export function createResizeObserver(callback) {
    return new ResizeObserver(callback);
}
export function requestAnimationFrame() {
    return new Promise(resolve => {
        window.requestAnimationFrame(resolve);
    });
}
export function nextAnimationFrame() {
    return requestAnimationFrame().then(() => requestAnimationFrame());
}
export function isHTMLElement(node) {
    return node.nodeType === Node.ELEMENT_NODE;
}
export function isCustomElement(element) {
    return element.tagName.includes('-');
}
