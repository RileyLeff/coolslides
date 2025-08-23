/**
 * Notes Plugin for Coolslides
 * Enhanced speaker notes with timing, categorization, and progressive disclosure
 */

export interface PluginContext {
  deck: any;
  slide: any;
  router: any;
  logger: any;
  bus: any;
  capabilities?: {
    'storage.kv'?: StorageCapability;
    'ui.notifications'?: UICapability;
  };
}

export interface StorageCapability {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface UICapability {
  toast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  notification(title: string, body?: string, options?: any): void;
}

export interface SpeakerNote {
  content: string;
  timestamp?: string;
  noteType: 'general' | 'timing' | 'technical' | 'transition';
  style?: Record<string, string>;
}

export interface NoteSession {
  sessionId: string;
  startTime: number;
  slideNotes: Record<string, SpeakerNote[]>;
  timingData: Record<string, number[]>;
  practice: boolean;
}

class NotesPlugin {
  private context!: PluginContext;
  private currentSession: NoteSession | null = null;
  private slideStartTime: number | null = null;
  private notesOverlay: HTMLElement | null = null;
  private keyboardShortcuts: Map<string, () => void> = new Map();

  async init(ctx: PluginContext): Promise<void> {
    this.context = ctx;
    
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    
    // Load previous session data
    await this.loadSession();
    
    this.context.logger.info('Notes plugin initialized');
  }

  private setupEventListeners(): void {
    this.context.bus.on('slide:enter', this.onSlideEnter.bind(this));
    this.context.bus.on('slide:leave', this.onSlideLeave.bind(this));
    this.context.bus.on('presentation:start', this.onPresentationStart.bind(this));
    this.context.bus.on('presentation:end', this.onPresentationEnd.bind(this));
    
    // Listen for note display requests
    this.context.bus.on('notes:show', this.showNotesOverlay.bind(this));
    this.context.bus.on('notes:hide', this.hideNotesOverlay.bind(this));
    this.context.bus.on('notes:toggle', this.toggleNotesOverlay.bind(this));
  }

  private setupKeyboardShortcuts(): void {
    this.keyboardShortcuts.set('n', () => this.toggleNotesOverlay());
    this.keyboardShortcuts.set('t', () => this.showTimingInfo());
    this.keyboardShortcuts.set('p', () => this.togglePracticeMode());
    
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Only handle if no modifier keys and not in input
    if (event.metaKey || event.ctrlKey || event.altKey || 
        event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const handler = this.keyboardShortcuts.get(event.key.toLowerCase());
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  public async onSlideEnter(event: { slideId: string; slide: any }): Promise<void> {
    this.slideStartTime = Date.now();
    
    // Record slide timing if in session
    if (this.currentSession) {
      const timings = this.currentSession.timingData[event.slideId] || [];
      this.currentSession.timingData[event.slideId] = timings;
    }

    // Update notes overlay if visible
    if (this.notesOverlay) {
      this.updateNotesDisplay(event.slideId, event.slide);
    }

    // Show timing warning if slide has exceeded recommended time
    await this.checkSlideTimingWarning(event.slideId, event.slide);
  }

  public async onSlideLeave(event: { slideId: string; slide: any }): Promise<void> {
    if (this.slideStartTime && this.currentSession) {
      const duration = Date.now() - this.slideStartTime;
      const timings = this.currentSession.timingData[event.slideId] || [];
      timings.push(duration);
      this.currentSession.timingData[event.slideId] = timings;
      
      // Save updated session
      await this.saveSession();
    }
  }

  public onPresentationStart(): void {
    this.startNewSession();
  }

  public async onPresentationEnd(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.practice = false;
      await this.saveSession();
      
      // Show session summary
      this.showSessionSummary();
    }
  }

  private startNewSession(practice: boolean = false): void {
    this.currentSession = {
      sessionId: `session-${Date.now()}`,
      startTime: Date.now(),
      slideNotes: {},
      timingData: {},
      practice
    };
  }

  private async loadSession(): Promise<void> {
    if (!this.context.capabilities?.['storage.kv']) return;
    
    try {
      const storage = this.context.capabilities['storage.kv'];
      const sessionData = await storage.get('notes:currentSession');
      
      if (sessionData) {
        this.currentSession = sessionData;
      }
    } catch (error) {
      this.context.logger.warn('Failed to load notes session:', error);
    }
  }

  private async saveSession(): Promise<void> {
    if (!this.currentSession || !this.context.capabilities?.['storage.kv']) return;
    
    try {
      const storage = this.context.capabilities['storage.kv'];
      await storage.set('notes:currentSession', this.currentSession);
    } catch (error) {
      this.context.logger.warn('Failed to save notes session:', error);
    }
  }

  private async checkSlideTimingWarning(slideId: string, slide: any): Promise<void> {
    if (!slide.notes) return;
    
    // Look for timing notes
    const timingNotes = slide.notes.filter((note: SpeakerNote) => note.noteType === 'timing');
    if (timingNotes.length === 0) return;

    // Check if we have previous timing data for this slide
    const previousTimings = this.currentSession?.timingData[slideId] || [];
    if (previousTimings.length === 0) return;

    // Calculate average time spent on this slide
    const averageTime = previousTimings.reduce((a, b) => a + b, 0) / previousTimings.length;
    
    // Parse timing expectations from notes (e.g., "2 minutes", "30 seconds")
    const timingNote = timingNotes[0];
    const expectedTime = this.parseTimingFromNote(timingNote.content);
    
    if (expectedTime && averageTime > expectedTime * 1.2) { // 20% buffer
      if (this.context.capabilities?.['ui.notifications']) {
        this.context.capabilities['ui.notifications'].notification(
          'Timing Warning',
          `You typically spend ${Math.round(averageTime / 1000)}s on this slide (expected: ${Math.round(expectedTime / 1000)}s)`,
          { icon: '⏰' }
        );
      }
    }
  }

  private parseTimingFromNote(content: string): number | null {
    // Simple parsing for common time formats
    const minutesMatch = content.match(/(\d+)\s*minutes?/i);
    if (minutesMatch) {
      return parseInt(minutesMatch[1]) * 60 * 1000;
    }
    
    const secondsMatch = content.match(/(\d+)\s*seconds?/i);
    if (secondsMatch) {
      return parseInt(secondsMatch[1]) * 1000;
    }
    
    return null;
  }

  private toggleNotesOverlay(): void {
    if (this.notesOverlay) {
      this.hideNotesOverlay();
    } else {
      this.showNotesOverlay();
    }
  }

  private showNotesOverlay(): void {
    if (this.notesOverlay) return; // Already shown
    
    this.notesOverlay = document.createElement('div');
    this.notesOverlay.className = 'coolslides-notes-overlay';
    this.notesOverlay.innerHTML = this.renderNotesOverlay();
    
    document.body.appendChild(this.notesOverlay);
    
    // Close on escape key
    const closeHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hideNotesOverlay();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
    
    // Update with current slide
    const currentSlideId = this.context.router.getCurrentSlideId();
    const currentSlide = currentSlideId ? this.context.deck.slides?.find((s: any) => s.id === currentSlideId) : null;
    
    if (currentSlide) {
      this.updateNotesDisplay(currentSlideId, currentSlide);
    }
  }

  private hideNotesOverlay(): void {
    if (this.notesOverlay && this.notesOverlay.parentNode) {
      this.notesOverlay.parentNode.removeChild(this.notesOverlay);
      this.notesOverlay = null;
    }
  }

  private renderNotesOverlay(): string {
    return `
      <style>
        .coolslides-notes-overlay {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 400px;
          max-height: calc(100vh - 40px);
          background: rgba(26, 26, 26, 0.95);
          color: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          overflow-y: auto;
        }

        .notes-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .notes-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .notes-close {
          background: none;
          border: none;
          color: #888;
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }

        .notes-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .slide-info {
          font-size: 12px;
          color: #888;
          margin-bottom: 16px;
        }

        .speaker-note {
          margin-bottom: 16px;
          padding: 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-left: 3px solid #007acc;
        }

        .speaker-note.note-timing { border-left-color: #ff6b35; }
        .speaker-note.note-technical { border-left-color: #f7931e; }
        .speaker-note.note-transition { border-left-color: #7b68ee; }

        .note-timestamp {
          font-size: 11px;
          color: #007acc;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .note-content {
          line-height: 1.4;
          font-size: 14px;
        }

        .timing-info {
          margin-top: 16px;
          padding: 12px;
          background: rgba(0, 122, 204, 0.1);
          border-radius: 8px;
          font-size: 12px;
        }

        .timing-label {
          font-weight: 600;
          color: #007acc;
          margin-bottom: 4px;
        }

        .no-notes {
          color: #666;
          font-style: italic;
          text-align: center;
          padding: 20px;
        }

        .keyboard-hints {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 11px;
          color: #888;
          line-height: 1.3;
        }
      </style>
      
      <div class="notes-header">
        <h3 class="notes-title">Speaker Notes</h3>
        <button class="notes-close" onclick="this.closest('.coolslides-notes-overlay').remove()">×</button>
      </div>
      
      <div class="slide-info" id="slide-info">Loading...</div>
      <div class="notes-content" id="notes-content">Loading...</div>
      
      <div class="keyboard-hints">
        <strong>Shortcuts:</strong> N = Toggle notes, T = Timing info, P = Practice mode
      </div>
    `;
  }

  private updateNotesDisplay(slideId: string, slide: any): void {
    if (!this.notesOverlay) return;
    
    const slideInfoEl = this.notesOverlay.querySelector('#slide-info');
    const notesContentEl = this.notesOverlay.querySelector('#notes-content');
    
    if (!slideInfoEl || !notesContentEl) return;
    
    // Update slide info
    slideInfoEl.textContent = `Slide: ${slideId}`;
    
    // Update notes content
    const notes = slide.notes || [];
    
    if (notes.length === 0) {
      notesContentEl.innerHTML = '<div class="no-notes">No notes for this slide</div>';
      return;
    }
    
    const notesHtml = notes.map((note: SpeakerNote) => `
      <div class="speaker-note note-${note.noteType}">
        ${note.timestamp ? `<div class="note-timestamp">${note.timestamp}</div>` : ''}
        <div class="note-content">${this.escapeHtml(note.content)}</div>
      </div>
    `).join('');
    
    // Add timing info if available
    let timingHtml = '';
    if (this.currentSession?.timingData[slideId]) {
      const timings = this.currentSession.timingData[slideId];
      const average = timings.reduce((a, b) => a + b, 0) / timings.length;
      
      timingHtml = `
        <div class="timing-info">
          <div class="timing-label">Historical Timing</div>
          <div>Average: ${Math.round(average / 1000)}s (${timings.length} presentations)</div>
        </div>
      `;
    }
    
    notesContentEl.innerHTML = notesHtml + timingHtml;
  }

  private showTimingInfo(): void {
    if (!this.currentSession) {
      if (this.context.capabilities?.['ui.notifications']) {
        this.context.capabilities['ui.notifications'].notification(
          'No Session Data',
          'Start a presentation to track timing information',
          { icon: '⏱️' }
        );
      }
      return;
    }
    
    const totalSlides = Object.keys(this.currentSession.timingData).length;
    const totalTime = Object.values(this.currentSession.timingData)
      .flat()
      .reduce((sum, time) => sum + time, 0);
    
    const averagePerSlide = totalSlides > 0 ? totalTime / totalSlides : 0;
    
    if (this.context.capabilities?.['ui.notifications']) {
      this.context.capabilities['ui.notifications'].notification(
        'Timing Summary',
        `Slides visited: ${totalSlides}\nTotal time: ${Math.round(totalTime / 1000 / 60)}m\nAverage per slide: ${Math.round(averagePerSlide / 1000)}s`,
        { icon: '📊' }
      );
    }
  }

  private togglePracticeMode(): void {
    if (!this.currentSession) {
      this.startNewSession(true);
    } else {
      this.currentSession.practice = !this.currentSession.practice;
    }
    
    const mode = this.currentSession?.practice ? 'Practice' : 'Presentation';
    if (this.context.capabilities?.['ui.notifications']) {
      this.context.capabilities['ui.notifications'].notification(
        `${mode} Mode`,
        this.currentSession?.practice ? 
          'Timing data will be saved for practice analysis' : 
          'Timing data will be included in presentation metrics',
        { icon: this.currentSession?.practice ? '📝' : '🎯' }
      );
    }
  }

  private showSessionSummary(): void {
    if (!this.currentSession) return;
    
    const sessionDuration = Date.now() - this.currentSession.startTime;
    const slidesVisited = Object.keys(this.currentSession.timingData).length;
    
    console.log('Session Summary:', {
      sessionId: this.currentSession.sessionId,
      duration: Math.round(sessionDuration / 1000 / 60),
      slidesVisited,
      practice: this.currentSession.practice
    });
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  teardown(): void {
    this.hideNotesOverlay();
    document.removeEventListener('keydown', this.handleKeydown);
    
    if (this.currentSession) {
      this.saveSession();
    }
    
    this.context.logger.info('Notes plugin teardown complete');
  }
}

// Plugin export
export default {
  name: '@coolslides/plugins-notes',
  version: '1.0.0',
  capabilities: ['storage.kv', 'ui.notifications'],
  hooks: ['init', 'onSlideEnter', 'onSlideLeave', 'onPresentationStart', 'onPresentationEnd'],
  
  async init(ctx: PluginContext): Promise<void> {
    const plugin = new NotesPlugin();
    await plugin.init(ctx);
    
    // Store plugin instance for lifecycle management
    (ctx as any).__notesPlugin = plugin;
  },
  
  async onSlideEnter(ctx: PluginContext, event: { slideId: string; slide: any }): Promise<void> {
    const plugin = (ctx as any).__notesPlugin as NotesPlugin;
    if (plugin) {
      await plugin.onSlideEnter(event);
    }
  },
  
  async onSlideLeave(ctx: PluginContext, event: { slideId: string; slide: any }): Promise<void> {
    const plugin = (ctx as any).__notesPlugin as NotesPlugin;
    if (plugin) {
      await plugin.onSlideLeave(event);
    }
  },
  
  async onPresentationStart(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__notesPlugin as NotesPlugin;
    if (plugin) {
      plugin.onPresentationStart();
    }
  },
  
  async onPresentationEnd(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__notesPlugin as NotesPlugin;
    if (plugin) {
      await plugin.onPresentationEnd();
    }
  }
};