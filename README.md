# Coolslides

> Pro-grade, hackable, web-native slide platform with schema-validated IR, framework-agnostic components, and deterministic exports.

## Overview

Coolslides is a modern presentation platform designed for developers, workshop instructors, and engineering teams. It provides a deterministic authoring loop with hot reload development, structured content models, and secure plugin architecture.

## Key Features

- **Schema-Validated IR**: JSON-based intermediate representation with Rust type safety
- **Framework-Agnostic Components**: Custom Elements with Svelte→CE authoring path  
- **Capability-Scoped Plugins**: Secure plugin system with strict/offline modes
- **Deterministic Exports**: Reproducible HTML/PDF output with SRI hashes
- **Developer Experience**: Hot reload, validation, speaker view, accessibility built-in

## Quick Start

```bash
# Initialize a new slide deck
coolslides init my-presentation --template svelte-ce

# Start development server
cd my-presentation
coolslides dev --open

# Validate deck
coolslides validate

# Export to HTML
coolslides export --html dist/

# Export to PDF  
coolslides export --pdf presentation.pdf --profile handout
```

## Project Structure

```
coolslides/
├── apps/
│   ├── cli/                 # Rust CLI binary
│   └── devserver/           # Development server with WebSocket rooms
├── packages/
│   ├── runtime/             # TypeScript presentation runtime
│   ├── component-sdk/       # SDK for building components
│   ├── components/          # First-party slide components
│   └── plugins-stdlib/      # Standard plugin library
├── themes/
│   └── default/             # Default theme with tokens
└── examples/
    └── basic-deck/          # Example presentation
```

## Architecture

### IR v1 Data Model

All content is stored in a schema-validated JSON format:

- **SlideDoc**: Individual slide definition with component, props, and slots
- **DeckManifest**: Overall presentation configuration and sequence
- **Lockfile**: Resolved dependencies with integrity hashes

### TOML Authoring

For `slides.toml`, the `sequence` accepts ergonomic shorthand in addition to the canonical discriminated form. All inputs normalize to canonical JSON with `type`:

- Ref (canonical): `type = "ref"`, `ref = "intro"`
- Ref (shorthand): a plain string `"intro"` or a table `{ ref = "intro" }`
- Group (canonical): `type = "group"`, `name = "Basics"`, `slides = ["a", "b"]`
- Group (shorthand): a table `{ name = "Basics", slides = ["a", "b"] }` (optional `transition`)

Mixing strings and tables in the `sequence` array is allowed in TOML; the runtime/dev APIs always emit the canonical JSON shape.

### Component System

Components are Custom Elements with lifecycle management:

```typescript
import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'MySlide',
  tag: 'cs-my-slide', 
  schema: { /* JSON Schema */ }
})
export class MySlide extends CoolslidesElement {
  @property({ type: String }) 
  title = '';
  
  protected update() {
    // Render implementation
  }
}
```

### Plugin Architecture

Plugins declare required capabilities and get scoped access:

```javascript
export default {
  name: 'my-plugin',
  capabilities: ['network.fetch', 'storage.kv'],
  
  async init(ctx) {
    const data = await ctx.capabilities.network.fetch('/api/data');
    await ctx.capabilities.storage.kv('deck').set('cache', data);
  }
}
```

## Development Status

**v0.1 (Current)**: Foundation with IR types, CLI structure, runtime, and basic components
- ✅ Rust workspace with IR v1 types and JSON Schema generation
- ✅ TypeScript runtime with router, fragments, theming, speaker view  
- ✅ Component SDK with Custom Element base classes
- ✅ TitleSlide, TwoColSlide, QuoteSlide components
- ✅ Default theme with comprehensive token system
- 🚧 CLI command implementations (init, dev, validate, export)

**Planned**:
- **v0.2**: Auto-animate, PDF export, rooms, syntax highlighting
- **v0.3**: Plugin API, capability gates, import map resolution  
- **v0.4**: WASM components, accessibility lints, performance budgets

## Contributing

This is an implementation of the [Coolslides specification](specification.md). The codebase follows the spec's architecture for capability-scoped plugins, framework-agnostic components, and deterministic builds.

## License

MIT License - see [LICENSE](LICENSE) for details.
