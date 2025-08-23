/**
 * Coolslides Standard Library Plugins
 * 
 * Collection of first-party plugins for common presentation functionality
 */

// Plugin exports
export { default as PollPlugin } from './poll/index.js';
export { default as NotesPlugin } from './notes/index.js';
export { default as TelemetryPlugin } from './telemetry/index.js';

// Plugin manifest for registry
export const STDLIB_PLUGINS = {
  'poll': {
    name: '@coolslides/plugins-poll',
    version: '1.0.0',
    description: 'Interactive audience polling with real-time results',
    capabilities: ['rooms.ws', 'storage.kv', 'ui.toast'],
    tags: ['interactive', 'audience', 'engagement'],
    module: './poll/index.js'
  },
  
  'notes': {
    name: '@coolslides/plugins-notes',
    version: '1.0.0', 
    description: 'Enhanced speaker notes with timing and categorization',
    capabilities: ['storage.kv', 'ui.notifications'],
    tags: ['speaker', 'notes', 'presentation'],
    module: './notes/index.js'
  },
  
  'telemetry': {
    name: '@coolslides/plugins-telemetry',
    version: '1.0.0',
    description: 'Analytics and performance monitoring for presentations',
    capabilities: ['network.fetch', 'storage.kv', 'telemetry.events'],
    tags: ['analytics', 'monitoring', 'performance'],
    module: './telemetry/index.js'
  }
} as const;

export type StdlibPluginId = keyof typeof STDLIB_PLUGINS;