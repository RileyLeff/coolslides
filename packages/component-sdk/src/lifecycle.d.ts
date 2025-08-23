import { ComponentLifecycle } from './types.js';
export declare function registerLifecycle(element: HTMLElement, lifecycle: ComponentLifecycle): void;
export declare function getLifecycle(element: HTMLElement): ComponentLifecycle | undefined;
export declare class LifecycleManager {
    private static instance;
    private components;
    static getInstance(): LifecycleManager;
    register(element: HTMLElement): void;
    unregister(element: HTMLElement): void;
    pauseAll(): void;
    resumeAll(): void;
    teardownAll(): void;
}
export declare function onSlideEnter(callback: (element: HTMLElement) => void): void;
export declare function onSlideLeave(callback: (element: HTMLElement) => void): void;
export declare function onBeforePrint(callback: (element: HTMLElement) => void): void;
export declare function prefetchComponent(constructor: CustomElementConstructor, props: Record<string, any>): Promise<void>;
