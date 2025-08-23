export function component(manifest) {
    return function (constructor) {
        constructor.__coolslides_manifest = manifest;
        if (manifest.tag && !customElements.get(manifest.tag)) {
            customElements.define(manifest.tag, constructor);
        }
        return constructor;
    };
}
export function eventHandler(eventType) {
    return function (_target, _propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args) {
            if (!this.hasAttribute('data-event-handlers-bound')) {
                this.addEventListener(eventType, originalMethod.bind(this));
                this.setAttribute('data-event-handlers-bound', 'true');
            }
            return originalMethod.apply(this, args);
        };
        return descriptor;
    };
}
export { property } from './base.js';
