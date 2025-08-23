/**
 * Coolslides Runtime
 * Main entry point for the presentation runtime
 */

export * from './router.js';
export * from './fragments.js';
export * from './auto-animate.js';
export * from './theming.js';
export * from './speaker-view.js';
export * from './props.js';
export * from './module-loader.js';
export * from './types.js';

// Initialize runtime when imported
if (typeof window !== 'undefined') {
  import('./init.js').then(({ init }) => {
    init();
  });
}