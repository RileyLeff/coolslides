export interface ComponentLifecycle {
    pause?(): void;
    resume?(): void;
    teardown?(): void;
    prefetch?(props: Record<string, any>): Promise<void>;
}
export interface ComponentManifest {
    name: string;
    version: string;
    tag: string;
    module: string;
    schema: ComponentSchema;
    tokensUsed: string[];
    capabilities?: string[];
    suggestedTransition?: string;
}
export interface ComponentSchema {
    type: 'object';
    required?: string[];
    properties: Record<string, SchemaProperty>;
    additionalProperties?: boolean;
}
export interface SchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    default?: any;
    enum?: any[];
    items?: SchemaProperty;
    properties?: Record<string, SchemaProperty>;
}
export interface ComponentEvent<T = any> extends CustomEvent<T> {
    type: 'ready' | 'change' | 'error' | string;
}
export interface PropertyOptions {
    type?: StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor;
    reflect?: boolean;
    attribute?: string | boolean;
    converter?: PropertyConverter;
}
export interface PropertyConverter {
    fromAttribute?(value: string | null, type?: any): any;
    toAttribute?(value: any, type?: any): string | null;
}
export interface SlideContext {
    slideId: string;
    currentFragment: number;
    isActive: boolean;
    isPrint: boolean;
}
