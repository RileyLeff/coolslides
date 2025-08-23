/**
 * Runtime initialization and setup
 */

import { SimpleEventBus } from './event-bus.js';
import { SlideRouter } from './router.js';
import { DefaultFragmentManager } from './fragments.js';
import { FLIPAutoAnimateManager } from './auto-animate.js';
import { CSSCustomPropertyThemeManager } from './theming.js';
import { DefaultSpeakerView } from './speaker-view.js';
import { RuntimeContext, DeckManifest, SlideDoc } from './types.js';

let initialized = false;
let runtimeContext: RuntimeContext | null = null;

export async function init(deck?: DeckManifest, slides?: SlideDoc[]): Promise<RuntimeContext> {
  if (initialized && runtimeContext) {
    return runtimeContext;
  }

  // Create event bus
  const bus = new SimpleEventBus();

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

  const fragmentManager = new DefaultFragmentManager(bus);
  fragmentManager.initialize();

  const autoAnimateManager = new FLIPAutoAnimateManager(bus);
  autoAnimateManager.initialize();

  const themeManager = new CSSCustomPropertyThemeManager(bus);
  themeManager.initialize();

  const speakerView = new DefaultSpeakerView(context, bus);

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
      bus.emit('help:show');
    }
  });
}

export function getRuntimeContext(): RuntimeContext | null {
  return runtimeContext;
}

export function isInitialized(): boolean {
  return initialized;
}