import { ComponentLifecycle, SlideContext } from './types.js';
export declare abstract class CoolslidesElement extends HTMLElement implements ComponentLifecycle {
    private _slideContext;
    private _isConnected;
    private _updateScheduled;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void;
    pause?(): void;
    resume?(): void;
    teardown?(): void;
    static prefetch?(props: Record<string, any>): Promise<void>;
    protected requestUpdate(): void;
    protected performUpdate(): void;
    protected abstract update(): void;
    get slideContext(): SlideContext | null;
    set slideContext(context: SlideContext | null);
    protected onSlideContextChanged(_oldContext: SlideContext | null, _newContext: SlideContext | null): void;
    protected emit<T = any>(type: string, detail?: T, options?: Partial<CustomEventInit<T>>): void;
    protected css(strings: TemplateStringsArray, ...values: any[]): string;
    protected html(strings: TemplateStringsArray, ...values: any[]): string;
    protected getCSSCustomProperty(property: string): string;
    protected setCSSCustomProperty(property: string, value: string): void;
    protected useTokens(tokens: string[]): void;
}
export declare function property(options?: {
    type?: any;
    reflect?: boolean;
    attribute?: string | boolean;
}): (target: any, propertyKey: string) => void;
