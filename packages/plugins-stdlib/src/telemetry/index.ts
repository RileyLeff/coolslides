/**
 * Telemetry Plugin for Coolslides
 * Analytics and performance monitoring for presentations
 */

export interface PluginContext {
  deck: any;
  slide: any;
  router: any;
  logger: any;
  bus: any;
  capabilities?: {
    'network.fetch'?: NetworkCapability;
    'storage.kv'?: StorageCapability;
    'telemetry.events'?: TelemetryCapability;
  };
}

export interface NetworkCapability {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

export interface StorageCapability {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface TelemetryCapability {
  track(event: string, properties?: Record<string, any>): void;
  identify(userId: string, properties?: Record<string, any>): void;
  page(name: string, properties?: Record<string, any>): void;
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: string;
  slideId?: string;
  data: Record<string, any>;
  sessionId: string;
}

export interface PerformanceMetrics {
  slideLoadTime: number;
  transitionTime: number;
  renderTime: number;
  memoryUsage?: number;
  componentLoadTime?: Record<string, number>;
}

export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  batchSize: number;
  flushInterval: number;
  collectPerformance: boolean;
  collectInteractions: boolean;
  collectErrors: boolean;
  privacy: 'full' | 'anonymous' | 'minimal';
}

class TelemetryPlugin {
  private context!: PluginContext;
  private config: TelemetryConfig;
  private sessionId: string;
  private events: TelemetryEvent[] = [];
  private performanceObserver: PerformanceObserver | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private slideStartTime: number | null = null;
  private lastInteractionTime: number = Date.now();

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = {
      enabled: true,
      batchSize: 50,
      flushInterval: 30000, // 30 seconds
      collectPerformance: true,
      collectInteractions: true,
      collectErrors: true,
      privacy: 'anonymous',
      ...config
    };
    
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async init(ctx: PluginContext): Promise<void> {
    this.context = ctx;
    
    if (!this.config.enabled) {
      this.context.logger.info('Telemetry plugin disabled');
      return;
    }

    this.setupEventListeners();
    this.setupPerformanceMonitoring();
    this.setupErrorTracking();
    this.setupInteractionTracking();
    this.startFlushTimer();
    
    // Track session start
    this.trackEvent('session:start', {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      deckId: this.context.deck?.id,
      deckTitle: this.context.deck?.title
    });
    
    this.context.logger.info('Telemetry plugin initialized');
  }

  private setupEventListeners(): void {
    this.context.bus.on('slide:enter', this.onSlideEnter.bind(this));
    this.context.bus.on('slide:leave', this.onSlideLeave.bind(this));
    this.context.bus.on('fragment:change', this.onFragmentChange.bind(this));
    this.context.bus.on('animation:start', this.onAnimationStart.bind(this));
    this.context.bus.on('animation:end', this.onAnimationEnd.bind(this));
    this.context.bus.on('component:load', this.onComponentLoad.bind(this));
    this.context.bus.on('component:error', this.onComponentError.bind(this));
    
    // Browser events
    window.addEventListener('beforeunload', this.onBeforeUnload.bind(this));
    window.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private setupPerformanceMonitoring(): void {
    if (!this.config.collectPerformance || !window.PerformanceObserver) return;
    
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.trackPerformanceEntry(entry);
        }
      });
      
      // Observe different types of performance entries
      this.performanceObserver.observe({ 
        entryTypes: ['measure', 'navigation', 'resource', 'paint'] 
      });
      
    } catch (error) {
      this.context.logger.warn('Performance monitoring setup failed:', error);
    }
  }

  private setupErrorTracking(): void {
    if (!this.config.collectErrors) return;
    
    window.addEventListener('error', (event) => {
      this.trackEvent('error:javascript', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.trackEvent('error:promise', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      });
    });
  }

  private setupInteractionTracking(): void {
    if (!this.config.collectInteractions) return;
    
    // Track keyboard interactions
    document.addEventListener('keydown', (event) => {
      this.lastInteractionTime = Date.now();
      
      // Only track navigation keys
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key)) {
        this.trackEvent('interaction:keyboard', {
          key: event.key,
          slideId: this.context.router.getCurrentSlideId()
        });
      }
    });
    
    // Track mouse/touch interactions
    ['click', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        this.lastInteractionTime = Date.now();
        
        const target = event.target as HTMLElement;
        const slideElement = target.closest('[data-slide]');
        
        if (slideElement) {
          this.trackEvent('interaction:pointer', {
            type: eventType,
            slideId: slideElement.getAttribute('data-slide'),
            targetTag: target.tagName.toLowerCase(),
            targetClass: target.className
          });
        }
      });
    });
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.config.flushInterval);
  }

  public onSlideEnter(event: { slideId: string; slide: any }): void {
    this.slideStartTime = Date.now();
    
    this.trackEvent('slide:enter', {
      slideId: event.slideId,
      slideTitle: event.slide?.title,
      timestamp: this.slideStartTime
    });
  }

  public onSlideLeave(event: { slideId: string; slide: any }): void {
    if (this.slideStartTime) {
      const duration = Date.now() - this.slideStartTime;
      
      this.trackEvent('slide:leave', {
        slideId: event.slideId,
        duration: duration,
        timestamp: Date.now()
      });
      
      this.slideStartTime = null;
    }
  }

  public onFragmentChange(event: { slideId: string; fragmentIndex: number }): void {
    this.trackEvent('fragment:change', {
      slideId: event.slideId,
      fragmentIndex: event.fragmentIndex
    });
  }

  private onAnimationStart(event: { type: string; slideId: string }): void {
    this.trackEvent('animation:start', {
      animationType: event.type,
      slideId: event.slideId,
      timestamp: Date.now()
    });
  }

  private onAnimationEnd(event: { type: string; slideId: string; duration: number }): void {
    this.trackEvent('animation:end', {
      animationType: event.type,
      slideId: event.slideId,
      duration: event.duration,
      timestamp: Date.now()
    });
  }

  private onComponentLoad(event: { component: string; loadTime: number; slideId: string }): void {
    this.trackEvent('component:load', {
      component: event.component,
      loadTime: event.loadTime,
      slideId: event.slideId
    });
  }

  private onComponentError(event: { component: string; error: string; slideId: string }): void {
    this.trackEvent('component:error', {
      component: event.component,
      error: event.error,
      slideId: event.slideId
    });
  }

  private onBeforeUnload(): void {
    // Flush any remaining events
    this.flushEvents(true);
    
    // Track session end
    this.trackEvent('session:end', {
      duration: Date.now() - parseInt(this.sessionId.split('-')[1]),
      eventsTracked: this.events.length
    });
  }

  private onVisibilityChange(): void {
    const eventType = document.hidden ? 'tab:hidden' : 'tab:visible';
    this.trackEvent(eventType, {
      slideId: this.context.router.getCurrentSlideId()
    });
  }

  private onResize(): void {
    this.trackEvent('viewport:resize', {
      width: window.innerWidth,
      height: window.innerHeight,
      slideId: this.context.router.getCurrentSlideId()
    });
  }

  private trackPerformanceEntry(entry: PerformanceEntry): void {
    if (entry.entryType === 'measure') {
      this.trackEvent('performance:measure', {
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime
      });
    } else if (entry.entryType === 'paint') {
      this.trackEvent('performance:paint', {
        name: entry.name,
        startTime: entry.startTime
      });
    } else if (entry.entryType === 'resource') {
      const resourceEntry = entry as PerformanceResourceTiming;
      this.trackEvent('performance:resource', {
        name: resourceEntry.name,
        duration: resourceEntry.duration,
        transferSize: resourceEntry.transferSize,
        encodedBodySize: resourceEntry.encodedBodySize
      });
    }
  }

  private trackEvent(type: string, data: Record<string, any> = {}): void {
    if (!this.config.enabled) return;
    
    const event: TelemetryEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: type,
      slideId: data.slideId || this.context.router?.getCurrentSlideId(),
      data: this.sanitizeData(data),
      sessionId: this.sessionId
    };
    
    this.events.push(event);
    
    // Flush if batch size reached
    if (this.events.length >= this.config.batchSize) {
      this.flushEvents();
    }
    
    // Also send to telemetry capability if available
    if (this.context.capabilities?.['telemetry.events']) {
      this.context.capabilities['telemetry.events'].track(type, data);
    }
  }

  private sanitizeData(data: Record<string, any>): Record<string, any> {
    if (this.config.privacy === 'minimal') {
      // Only keep essential data
      const allowedKeys = ['slideId', 'duration', 'timestamp', 'type'];
      return Object.fromEntries(
        Object.entries(data).filter(([key]) => allowedKeys.includes(key))
      );
    }
    
    if (this.config.privacy === 'anonymous') {
      // Remove potentially identifying information
      const sanitized = { ...data };
      delete sanitized.userAgent;
      delete sanitized.filename;
      delete sanitized.stack;
      return sanitized;
    }
    
    // Full data collection
    return data;
  }

  private async flushEvents(synchronous: boolean = false): Promise<void> {
    if (this.events.length === 0) return;
    
    const eventsToFlush = [...this.events];
    this.events = [];
    
    // Store locally first
    if (this.context.capabilities?.['storage.kv']) {
      try {
        const storage = this.context.capabilities['storage.kv'];
        const existingEvents = await storage.get('telemetry:events') || [];
        await storage.set('telemetry:events', [...existingEvents, ...eventsToFlush]);
      } catch (error) {
        this.context.logger.warn('Failed to store telemetry events locally:', error);
      }
    }
    
    // Send to remote endpoint if configured
    if (this.config.endpoint && this.context.capabilities?.['network.fetch']) {
      try {
        const payload = {
          sessionId: this.sessionId,
          events: eventsToFlush,
          metadata: {
            timestamp: Date.now(),
            userAgent: this.config.privacy === 'full' ? navigator.userAgent : undefined,
            deckId: this.context.deck?.id
          }
        };
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        
        const request = this.context.capabilities['network.fetch'].fetch(this.config.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        
        if (synchronous) {
          await request;
        } else {
          // Fire and forget for async
          request.catch((error: any) => {
            this.context.logger.warn('Failed to send telemetry events:', error);
          });
        }
        
      } catch (error) {
        this.context.logger.warn('Failed to send telemetry events:', error);
        
        // Put events back if sending failed
        this.events.unshift(...eventsToFlush);
      }
    }
  }

  public getSessionSummary(): any {
    return {
      sessionId: this.sessionId,
      startTime: parseInt(this.sessionId.split('-')[1]),
      eventsCount: this.events.length,
      lastActivity: this.lastInteractionTime,
      config: this.config
    };
  }

  public async exportData(): Promise<any[]> {
    if (!this.context.capabilities?.['storage.kv']) return [];
    
    try {
      const storage = this.context.capabilities['storage.kv'];
      return await storage.get('telemetry:events') || [];
    } catch (error) {
      this.context.logger.warn('Failed to export telemetry data:', error);
      return [];
    }
  }

  public async clearData(): Promise<void> {
    if (!this.context.capabilities?.['storage.kv']) return;
    
    try {
      const storage = this.context.capabilities['storage.kv'];
      await storage.remove('telemetry:events');
      this.events = [];
    } catch (error) {
      this.context.logger.warn('Failed to clear telemetry data:', error);
    }
  }

  public updateConfig(newConfig: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (!this.config.enabled && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    } else if (this.config.enabled && !this.flushTimer) {
      this.startFlushTimer();
    }
  }

  teardown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
    
    // Final flush
    this.flushEvents(true);
    
    this.context.logger.info('Telemetry plugin teardown complete');
  }
}

// Plugin export
export default {
  name: '@coolslides/plugins-telemetry',
  version: '1.0.0',
  capabilities: ['network.fetch', 'storage.kv', 'telemetry.events'],
  hooks: ['init', 'onSlideEnter', 'onSlideLeave', 'onFragmentChange'],
  
  async init(ctx: PluginContext, config?: Partial<TelemetryConfig>): Promise<void> {
    const plugin = new TelemetryPlugin(config);
    await plugin.init(ctx);
    
    // Store plugin instance for lifecycle management
    (ctx as any).__telemetryPlugin = plugin;
  },
  
  async onSlideEnter(ctx: PluginContext, event: { slideId: string; slide: any }): Promise<void> {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    if (plugin) {
      plugin.onSlideEnter(event);
    }
  },
  
  async onSlideLeave(ctx: PluginContext, event: { slideId: string; slide: any }): Promise<void> {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    if (plugin) {
      plugin.onSlideLeave(event);
    }
  },
  
  async onFragmentChange(ctx: PluginContext, event: { slideId: string; fragmentIndex: number }): Promise<void> {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    if (plugin) {
      plugin.onFragmentChange(event);
    }
  },
  
  // Utility methods for external access
  getSessionSummary(ctx: PluginContext): any {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    return plugin ? plugin.getSessionSummary() : null;
  },
  
  async exportData(ctx: PluginContext): Promise<any[]> {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    return plugin ? await plugin.exportData() : [];
  },
  
  async clearData(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    if (plugin) {
      await plugin.clearData();
    }
  },
  
  updateConfig(ctx: PluginContext, config: Partial<TelemetryConfig>): void {
    const plugin = (ctx as any).__telemetryPlugin as TelemetryPlugin;
    if (plugin) {
      plugin.updateConfig(config);
    }
  }
};