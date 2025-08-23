const componentLifecycles = new WeakMap();
export function registerLifecycle(element, lifecycle) {
    componentLifecycles.set(element, lifecycle);
}
export function getLifecycle(element) {
    return componentLifecycles.get(element);
}
export class LifecycleManager {
    constructor() {
        this.components = new Set();
    }
    static getInstance() {
        if (!LifecycleManager.instance) {
            LifecycleManager.instance = new LifecycleManager();
        }
        return LifecycleManager.instance;
    }
    register(element) {
        this.components.add(element);
    }
    unregister(element) {
        this.components.delete(element);
    }
    pauseAll() {
        this.components.forEach(element => {
            const lifecycle = getLifecycle(element);
            if (lifecycle?.pause) {
                try {
                    lifecycle.pause();
                }
                catch (error) {
                    console.error('Error pausing component:', error);
                }
            }
        });
    }
    resumeAll() {
        this.components.forEach(element => {
            const lifecycle = getLifecycle(element);
            if (lifecycle?.resume) {
                try {
                    lifecycle.resume();
                }
                catch (error) {
                    console.error('Error resuming component:', error);
                }
            }
        });
    }
    teardownAll() {
        this.components.forEach(element => {
            const lifecycle = getLifecycle(element);
            if (lifecycle?.teardown) {
                try {
                    lifecycle.teardown();
                }
                catch (error) {
                    console.error('Error tearing down component:', error);
                }
            }
        });
        this.components.clear();
    }
}
export function onSlideEnter(callback) {
    document.addEventListener('coolslides:slide:enter', (event) => {
        const slideElement = event.detail.slideElement;
        const components = slideElement.querySelectorAll('[is]');
        components.forEach(callback);
    });
}
export function onSlideLeave(callback) {
    document.addEventListener('coolslides:slide:leave', (event) => {
        const slideElement = event.detail.slideElement;
        const components = slideElement.querySelectorAll('[is]');
        components.forEach(callback);
    });
}
export function onBeforePrint(callback) {
    document.addEventListener('coolslides:before:print', (event) => {
        const slideElement = event.detail.slideElement;
        const components = slideElement.querySelectorAll('[is]');
        components.forEach(callback);
    });
}
export async function prefetchComponent(constructor, props) {
    if ('prefetch' in constructor && typeof constructor.prefetch === 'function') {
        try {
            await constructor.prefetch(props);
        }
        catch (error) {
            console.error('Error prefetching component:', error);
        }
    }
}
