/**
 * TypeScript types matching the Rust IR v1 data model
 */

export interface SpeakerNote {
  content: string;
  timestamp?: string;
  noteType: 'general' | 'timing' | 'technical' | 'transition';
  style?: Record<string, string>;
}

export interface SlideDoc {
  modelVersion: string;
  id: string;
  component: ComponentSpec;
  props: Record<string, any>;
  slots?: Record<string, Slot>;
  tags?: string[];
  styleOverrides?: Record<string, string>;
  locale?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  notes?: SpeakerNote[];
}

export interface ComponentSpec {
  name: string;
  versionReq: string;
}

export interface DeckManifest {
  modelVersion: string;
  title: string;
  theme: string;
  tokens?: string;
  plugins: string[];
  notes?: Record<string, string>;
  transitions: TransitionConfig;
  sequence: DeckItem[];
  conditions?: ConditionConfig;
  print?: PrintConfig;
}

export interface TransitionConfig {
  default: string;
  overrides?: Record<string, string>;
}

export interface ConditionConfig {
  includeTags?: string[];
  excludeIds?: string[];
}

export interface PrintConfig {
  expandFragments?: boolean;
  pageNumbers?: boolean;
  footerTemplate?: string;
}

export type DeckItem = 
  | { type: 'ref'; ref: string }
  | { type: 'group'; name: string; transition?: string; slides: string[] };

export type Slot = 
  | { kind: 'markdown'; value: string }
  | { 
      kind: 'component'; 
      tag: string; 
      module: string; 
      props?: Record<string, any>; 
      defer?: 'eager' | 'visible' | 'idle';
      slotId?: string;
      printFallback?: PrintFallback;
    };

export type PrintFallback = 
  | { kind: 'image'; src: string };

export interface Lockfile {
  modelVersion: string;
  resolved: ResolvedDependencies;
  importMap: ImportMap;
  timestamp: string;
}

export interface ResolvedDependencies {
  components: Record<string, ResolvedPackage>;
  plugins: Record<string, ResolvedPackage>;
}

export interface ResolvedPackage {
  version: string;
  url: string;
  integrity?: string;
}

export interface ImportMap {
  imports: Record<string, string>;
}

// Runtime types
export interface RuntimeContext {
  deck: DeckManifest;
  slides: Map<string, SlideDoc>;
  currentSlide: string | null;
  currentFragment: number;
  router: Router;
  bus: EventBus;
}

export interface Router {
  navigate(slideId: string, fragment?: number): void;
  getCurrentSlide(): string | null;
  // Alias used by some plugins; keep both for compatibility
  getCurrentSlideId(): string | null;
  getCurrentFragment(): number;
  getNextSlide(): string | null;
  getPrevSlide(): string | null;
  nextSlide(): boolean;
  prevSlide(): boolean;
  firstSlide(): void;
  lastSlide(): void;
  nextFragment(): boolean;
  prevFragment(): boolean;
}

export interface EventBus {
  emit(event: string, data?: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

// Component lifecycle
export interface ComponentLifecycle {
  pause?(): void;
  resume?(): void;
  teardown?(): void;
  prefetch?(props: Record<string, any>): Promise<void>;
}

// Events
export interface SlideEnterEvent {
  slideId: string;
  slide: SlideDoc;
  fragment: number;
}

export interface SlideLeaveEvent {
  slideId: string;
  slide: SlideDoc;
  fragment: number;
}
