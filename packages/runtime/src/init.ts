/**
 * Runtime initialization and setup
 */

import { SimpleEventBus } from './event-bus.js';
import { SlideRouter } from './router.js';
import { FLIPAutoAnimateManager } from './auto-animate.js';
import { CSSCustomPropertyThemeManager } from './theming.js';
import { DefaultSpeakerView } from './speaker-view.js';
import { RuntimePropertyManager } from './props.js';
import { DynamicModuleLoader } from './module-loader.js';
import { RuntimeContext, DeckManifest, SlideDoc } from './types.js';
import { RoomsClient } from './rooms.js';
import { PluginManager } from './plugins.js';

let initialized = false;
let runtimeContext: RuntimeContext | null = null;

export async function init(deck?: DeckManifest, slides?: SlideDoc[]): Promise<RuntimeContext> {
  if (initialized && runtimeContext) {
    return runtimeContext;
  }

  // Create event bus
  const bus = new SimpleEventBus();
  // Bridge DOM poll events to bus for plugins
  document.addEventListener('poll:vote', (e: any) => {
    try { bus.emit('poll:response', { response: e.detail }); } catch {}
  }, { capture: true });
  // Bridge bus poll lifecycle events to DOM components
  bus.on('poll:start', (event: any) => {
    document.querySelectorAll('cs-poll').forEach((el) => {
      try { el.dispatchEvent(new CustomEvent('poll:start', { detail: event })); } catch {}
    });
  });
  bus.on('poll:stop', (event: any) => {
    document.querySelectorAll('cs-poll').forEach((el) => {
      try { el.dispatchEvent(new CustomEvent('poll:stop', { detail: event })); } catch {}
    });
  });
  bus.on('poll:results', (event: any) => {
    document.querySelectorAll('cs-poll').forEach((el) => {
      try { el.dispatchEvent(new CustomEvent('poll:results', { detail: event })); } catch {}
    });
  });

  // Load deck manifest and slides if not provided
  let deckData = deck;
  let slideData = slides;
  
  if (!deckData || !slideData) {
    try {
      const loadedData = await loadDeckData();
      deckData = deckData || loadedData.deck;
      slideData = slideData || loadedData.slides;
    } catch (error) {
      console.error('Failed to load deck data:', error);
      throw error;
    }
  }

  // Create slides map
  const slidesMap = new Map<string, SlideDoc>();
  slideData.forEach(slide => slidesMap.set(slide.id, slide));

  // Create runtime context
  const context: RuntimeContext = {
    deck: deckData,
    slides: slidesMap,
    currentSlide: null,
    currentFragment: 0,
    router: null as any, // Will be set below
    bus,
  };

  // Create and initialize managers
  const router = new SlideRouter(context, bus);
  context.router = router;


  const autoAnimateManager = new FLIPAutoAnimateManager(bus);
  autoAnimateManager.initialize();

  const themeManager = new CSSCustomPropertyThemeManager(bus);
  themeManager.initialize();

  const speakerView = new DefaultSpeakerView(context, bus);

  const propertyManager = new RuntimePropertyManager(bus);
  propertyManager.initialize();
  // Re-apply props shortly after to catch components that register after runtime loads
  setTimeout(() => {
    try { propertyManager.initialize(); } catch {}
  }, 100);

  // Initialize module loader for dynamic components
  new DynamicModuleLoader(bus, {
    basePath: window.location.origin,
    importMap: await loadImportMap()
  });
  const importMap = await loadImportMap();
  const offline = getOfflineFlag();
  
  // Rooms client (room from ?room= or default)
  const rooms = new RoomsClient(bus, {});
  if (!offline) {
    rooms.connect();
  } else {
    console.warn('Rooms disabled (offline mode)');
  }
  // Forward navigation events to room for basic sync
  bus.on('slide:enter', ({ slideId, fragment }) => {
    try { rooms.sendEvent('slide:change', { slideId, fragment }); } catch {}
  });
  
  // Plugin manager (load deck.plugins if provided)
  const pluginManager = new PluginManager(context, bus, importMap, { offline });
  if (Array.isArray(deckData.plugins) && deckData.plugins.length) {
    try { await pluginManager.loadAll(deckData.plugins); } catch (e) { console.warn('Plugins init failed', e); }
  }
  
  // Follow remote navigation events from rooms (basic audience sync)
  bus.on('rooms:event:slide:change', (evt: any) => {
    try {
      const { slideId, fragment } = evt.data || {};
      if (typeof slideId === 'string') {
        const current = router.getCurrentSlide();
        const currentFrag = router.getCurrentFragment();
        if (current !== slideId || currentFrag !== (fragment || 0)) {
          router.navigate(slideId, fragment || 0);
        }
      }
    } catch {}
  });
  
  // Rely on per-slide preloading; avoid global eager loading that breaks defer="visible"
  // await moduleLoader.preloadAllSlotComponents();

  // Load theme and tokens
  if (deckData.theme) {
    try {
      await themeManager.loadTheme(deckData.theme);
    } catch (error) {
      console.warn('Failed to load theme:', error);
    }
  }

  if (deckData.tokens) {
    try {
      await themeManager.loadTokens(deckData.tokens);
    } catch (error) {
      console.warn('Failed to load tokens:', error);
    }
  }

  // Set up global keyboard shortcuts
  setupGlobalKeyboardShortcuts(bus, speakerView);

  // Mark as initialized
  initialized = true;
  runtimeContext = context;

  // Emit initialization complete
  bus.emit('runtime:initialized', context);

  return context;
}

async function loadDeckData(): Promise<{ deck: DeckManifest; slides: SlideDoc[] }> {
  // Try to load from dev server API first
  try {
    const deckResponse = await fetch('/api/deck');
    if (deckResponse.ok) {
      const deck = await deckResponse.json();
      
      // Load all slides
      const slides: SlideDoc[] = [];
      for (const item of deck.sequence) {
        if (item.type === 'ref') {
          const slideResponse = await fetch(`/api/slide/${item.ref}`);
          if (slideResponse.ok) {
            slides.push(await slideResponse.json());
          }
        } else if (item.type === 'group') {
          for (const slideId of item.slides) {
            const slideResponse = await fetch(`/api/slide/${slideId}`);
            if (slideResponse.ok) {
              slides.push(await slideResponse.json());
            }
          }
        }
      }
      
      return { deck, slides };
    }
  } catch (error) {
    console.debug('Dev server not available, looking for static data');
  }

  // Fallback to static data or embedded data
  const deckElement = document.querySelector('script[type="application/json"][data-deck]');
  const slidesElement = document.querySelector('script[type="application/json"][data-slides]');

  if (deckElement && slidesElement) {
    const deck = JSON.parse(deckElement.textContent || '{}');
    const slides = JSON.parse(slidesElement.textContent || '[]');
    return { deck, slides };
  }

  throw new Error('Could not load deck data from dev server or static sources');
}

async function loadImportMap(): Promise<Record<string, string>> {
  try {
    const response = await fetch('/api/importmap');
    if (response.ok) {
      const data = await response.json();
      return data.imports || {};
    }
  } catch (error) {
    console.debug('Could not load import map from server');
  }
  
  // Fallback to embedded import map
  const importMapElement = document.querySelector('script[type="importmap"]');
  if (importMapElement && importMapElement.textContent) {
    try {
      const importMap = JSON.parse(importMapElement.textContent);
      return importMap.imports || {};
    } catch (error) {
      console.warn('Failed to parse embedded import map');
    }
  }
  
  return {};
}

function setupGlobalKeyboardShortcuts(bus: SimpleEventBus, speakerView: DefaultSpeakerView): void {
  document.addEventListener('keydown', (e) => {
    // Speaker view toggle (Cmd/Ctrl + Shift + S)
    if (e.key === 'S' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      speakerView.toggle();
    }

    // Help overlay (?)
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      bus.emit('keyboard:help');
    }
  });
}

function getOfflineFlag(): boolean {
  try {
    const u = new URL(location.href);
    const v = u.searchParams.get('offline');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function getRuntimeContext(): RuntimeContext | null {
  return runtimeContext;
}

export function isInitialized(): boolean {
  return initialized;
}
