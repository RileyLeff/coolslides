import { ComponentManifest } from './types.js';
export declare function component(manifest: Partial<ComponentManifest>): <T extends CustomElementConstructor>(constructor: T) => T;
export declare function eventHandler(eventType: string): (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export { property } from './base.js';
