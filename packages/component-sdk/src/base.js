export class CoolslidesElement extends HTMLElement {
    constructor() {
        super();
        this._slideContext = null;
        this._isConnected = false;
        this._updateScheduled = false;
        this.attachShadow({ mode: 'open' });
    }
    connectedCallback() {
        if (!this._isConnected) {
            this._isConnected = true;
            this.requestUpdate();
            this.dispatchEvent(new CustomEvent('ready', { bubbles: true }));
        }
    }
    disconnectedCallback() {
        this._isConnected = false;
        if (this.teardown) {
            this.teardown();
        }
    }
    attributeChangedCallback(_name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.requestUpdate();
        }
    }
    requestUpdate() {
        if (!this._updateScheduled) {
            this._updateScheduled = true;
            queueMicrotask(() => {
                this._updateScheduled = false;
                if (this._isConnected) {
                    this.performUpdate();
                }
            });
        }
    }
    performUpdate() {
        try {
            this.update();
        }
        catch (error) {
            console.error('Error during component update:', error);
            this.dispatchEvent(new CustomEvent('error', {
                detail: error,
                bubbles: true
            }));
        }
    }
    get slideContext() {
        return this._slideContext;
    }
    set slideContext(context) {
        const oldContext = this._slideContext;
        this._slideContext = context;
        this.onSlideContextChanged(oldContext, context);
    }
    onSlideContextChanged(_oldContext, _newContext) {
        this.requestUpdate();
    }
    emit(type, detail, options) {
        const event = new CustomEvent(type, {
            detail,
            bubbles: true,
            cancelable: true,
            ...options
        });
        this.dispatchEvent(event);
    }
    css(strings, ...values) {
        return strings.reduce((result, string, i) => {
            const value = values[i] ? String(values[i]) : '';
            return result + string + value;
        }, '');
    }
    html(strings, ...values) {
        return strings.reduce((result, string, i) => {
            const value = values[i] ? String(values[i]) : '';
            return result + string + value;
        }, '');
    }
    getCSSCustomProperty(property) {
        return getComputedStyle(this).getPropertyValue(property).trim();
    }
    setCSSCustomProperty(property, value) {
        this.style.setProperty(property, value);
    }
    useTokens(tokens) {
        this.setAttribute('data-tokens-used', tokens.join(','));
    }
}
export function property(options = {}) {
    return function (target, propertyKey) {
        const attributeName = typeof options.attribute === 'string'
            ? options.attribute
            : options.attribute === false
                ? null
                : propertyKey.toLowerCase();
        if (!target.constructor.observedAttributes) {
            target.constructor.observedAttributes = [];
        }
        if (attributeName && !target.constructor.observedAttributes.includes(attributeName)) {
            target.constructor.observedAttributes.push(attributeName);
        }
        const descriptor = {
            get() {
                if (attributeName) {
                    const value = this.getAttribute(attributeName);
                    return convertFromAttribute(value, options.type);
                }
                return this[`__${propertyKey}`];
            },
            set(value) {
                const oldValue = this[propertyKey];
                this[`__${propertyKey}`] = value;
                if (options.reflect && attributeName) {
                    const attrValue = convertToAttribute(value, options.type);
                    if (attrValue !== null) {
                        this.setAttribute(attributeName, attrValue);
                    }
                    else {
                        this.removeAttribute(attributeName);
                    }
                }
                if (oldValue !== value) {
                    this.requestUpdate();
                }
            },
            configurable: true,
            enumerable: true
        };
        Object.defineProperty(target, propertyKey, descriptor);
    };
}
function convertFromAttribute(value, type) {
    if (value === null)
        return null;
    if (!type || type === String) {
        return value;
    }
    else if (type === Number) {
        return Number(value);
    }
    else if (type === Boolean) {
        return value !== null;
    }
    else if (type === Array || type === Object) {
        try {
            return JSON.parse(value);
        }
        catch {
            return null;
        }
    }
    return value;
}
function convertToAttribute(value, type) {
    if (value == null)
        return null;
    if (!type || type === String) {
        return String(value);
    }
    else if (type === Number) {
        return String(value);
    }
    else if (type === Boolean) {
        return value ? '' : null;
    }
    else if (type === Array || type === Object) {
        try {
            return JSON.stringify(value);
        }
        catch {
            return null;
        }
    }
    return String(value);
}
