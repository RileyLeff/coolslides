/**
 * Speaker view functionality
 * Separate window/route with current/next slide preview, notes, timer, and controls
 */

import { EventBus, RuntimeContext, SpeakerNote } from './types.js';

export interface SpeakerView {
  open(): void;
  close(): void;
  isOpen(): boolean;
  update(): void;
}

export class DefaultSpeakerView implements SpeakerView {
  private context: RuntimeContext;
  private bus: EventBus;
  private speakerWindow: Window | null = null;
  private timer: SpeakerTimer | null = null;

  constructor(context: RuntimeContext, bus: EventBus) {
    this.context = context;
    this.bus = bus;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.bus.on('slide:enter', () => {
      if (this.isOpen()) {
        this.update();
      }
    });

    // Handle keyboard shortcut to open speaker view
    document.addEventListener('keydown', (e) => {
      if (e.key === 's' && e.metaKey) { // Cmd/Ctrl + S
        e.preventDefault();
        this.toggle();
      }
    });
  }

  open(): void {
    if (this.speakerWindow && !this.speakerWindow.closed) {
      this.speakerWindow.focus();
      return;
    }

    const width = 1200;
    const height = 800;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    this.speakerWindow = window.open(
      '',
      'coolslides-speaker-view',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!this.speakerWindow) {
      console.error('Failed to open speaker view window. Check popup blocker settings.');
      return;
    }

    this.initializeSpeakerWindow();
    this.timer = new SpeakerTimer();
    this.update();
  }

  close(): void {
    if (this.speakerWindow) {
      this.speakerWindow.close();
      this.speakerWindow = null;
    }
    
    if (this.timer) {
      this.timer.stop();
      this.timer = null;
    }
  }

  isOpen(): boolean {
    return this.speakerWindow !== null && !this.speakerWindow.closed;
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  update(): void {
    if (!this.isOpen()) return;

    const currentSlideId = this.context.currentSlide;
    const currentSlide = currentSlideId ? this.context.slides.get(currentSlideId) : null;
    const nextSlideId = this.context.router.getNextSlide();
    const nextSlide = nextSlideId ? this.context.slides.get(nextSlideId) : null;

    // Update current slide preview
    this.updateSlidePreview('current', currentSlide, currentSlideId);
    
    // Update next slide preview
    this.updateSlidePreview('next', nextSlide, nextSlideId);
    
    // Update speaker notes
    this.updateSpeakerNotes(currentSlideId);
    
    // Update progress
    this.updateProgress();
  }

  private initializeSpeakerWindow(): void {
    if (!this.speakerWindow) return;

    const doc = this.speakerWindow.document;
    doc.title = `Coolslides Speaker View - ${this.context.deck.title}`;
    
    doc.head.innerHTML = `
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Coolslides Speaker View</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          margin: 0;
          padding: 20px;
          background: #1a1a1a;
          color: #ffffff;
          display: grid;
          grid-template-areas: 
            "header header"
            "current next"
            "notes notes"
            "controls controls";
          grid-template-rows: auto 1fr auto auto;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          height: 100vh;
          box-sizing: border-box;
        }
        
        .header {
          grid-area: header;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #333;
        }
        
        .slide-preview {
          background: #2a2a2a;
          border-radius: 8px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          min-height: 300px;
        }
        
        .current-slide {
          grid-area: current;
        }
        
        .next-slide {
          grid-area: next;
        }
        
        .slide-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
          color: #888;
        }
        
        .slide-content {
          flex: 1;
          background: #fff;
          border-radius: 4px;
          transform: scale(0.5);
          transform-origin: top left;
          width: 200%;
          height: 200%;
          overflow: hidden;
        }
        
        .notes {
          grid-area: notes;
          background: #2a2a2a;
          border-radius: 8px;
          padding: 20px;
          max-height: 200px;
          overflow-y: auto;
        }

        .speaker-note {
          margin-bottom: 12px;
          padding: 12px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border-left: 4px solid #007acc;
        }

        .speaker-note.note-timing {
          border-left-color: #ff6b35;
        }

        .speaker-note.note-technical {
          border-left-color: #f7931e;
        }

        .speaker-note.note-transition {
          border-left-color: #7b68ee;
        }

        .note-timestamp {
          font-size: 12px;
          color: #007acc;
          font-weight: 600;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .note-content {
          line-height: 1.4;
          font-size: 14px;
        }
        
        .controls {
          grid-area: controls;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          border-top: 1px solid #333;
        }
        
        .timer {
          font-size: 24px;
          font-weight: 600;
        }
        
        .progress {
          flex: 1;
          margin: 0 20px;
          background: #333;
          height: 4px;
          border-radius: 2px;
          overflow: hidden;
        }
        
        .progress-bar {
          height: 100%;
          background: #007acc;
          transition: width 0.3s ease;
        }
        
        .quick-controls button {
          background: #007acc;
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          margin-left: 8px;
          cursor: pointer;
        }
        
        .quick-controls button:hover {
          background: #005a9e;
        }
      </style>
    `;

    doc.body.innerHTML = `
      <div class="header">
        <h1>${this.context.deck.title}</h1>
        <div class="timer" id="timer">00:00:00</div>
      </div>
      
      <div class="slide-preview current-slide">
        <div class="slide-title">Current Slide</div>
        <div class="slide-content" id="current-preview"></div>
      </div>
      
      <div class="slide-preview next-slide">
        <div class="slide-title">Next Slide</div>
        <div class="slide-content" id="next-preview"></div>
      </div>
      
      <div class="notes">
        <h3>Speaker Notes</h3>
        <div id="speaker-notes">No notes for this slide.</div>
      </div>
      
      <div class="controls">
        <div class="quick-controls">
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'first'}, '*')">First</button>
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'prev'}, '*')">Previous</button>
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'next'}, '*')">Next</button>
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'last'}, '*')">Last</button>
        </div>
        
        <div class="progress">
          <div class="progress-bar" id="progress-bar"></div>
        </div>
        
        <div class="quick-controls">
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'toggle-strict'}, '*')">Toggle Strict</button>
          <button onclick="window.opener.postMessage({type: 'speaker-control', action: 'toggle-offline'}, '*')">Toggle Offline</button>
        </div>
      </div>
    `;

    // Handle window close
    this.speakerWindow.addEventListener('beforeunload', () => {
      this.close();
    });

    // Handle control messages
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'speaker-control') {
        this.handleSpeakerControl(e.data.action);
      }
    });
  }

  private updateSlidePreview(type: 'current' | 'next', slide: any, slideId: string | null): void {
    if (!this.speakerWindow) return;

    const previewId = type === 'current' ? 'current-preview' : 'next-preview';
    const previewElement = this.speakerWindow.document.getElementById(previewId);
    
    if (!previewElement) return;

    if (!slide || !slideId) {
      previewElement.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">No slide</div>';
      return;
    }

    // Clone the slide from the main window for preview
    const mainSlideElement = document.querySelector(`[data-slide="${slideId}"]`);
    if (mainSlideElement) {
      previewElement.innerHTML = mainSlideElement.innerHTML;
    } else {
      previewElement.innerHTML = `<div style="color: #666; text-align: center; padding: 40px;">Slide: ${slideId}</div>`;
    }
  }

  private updateSpeakerNotes(slideId: string | null): void {
    if (!this.speakerWindow) return;

    const notesElement = this.speakerWindow.document.getElementById('speaker-notes');
    if (!notesElement) return;

    if (!slideId) {
      notesElement.innerHTML = '<p style="color: #666; font-style: italic;">No slide selected.</p>';
      return;
    }

    const slide = this.context.slides.get(slideId);
    const notes = slide?.notes || [];
    
    if (notes.length === 0) {
      notesElement.innerHTML = '<p style="color: #666; font-style: italic;">No notes for this slide.</p>';
      return;
    }

    // Render structured speaker notes
    const notesHtml = notes.map((note: SpeakerNote) => `
      <div class="speaker-note note-${note.noteType}" style="${this.getNoteCssStyle(note.style)}">
        ${note.timestamp ? `<div class="note-timestamp">${note.timestamp}</div>` : ''}
        <div class="note-content">${this.escapeHtml(note.content)}</div>
      </div>
    `).join('');

    notesElement.innerHTML = notesHtml;
  }

  private getNoteCssStyle(style?: Record<string, string>): string {
    const baseStyle = {
      'margin-bottom': '12px',
      'padding': '12px',
      'border-radius': '6px',
      'border-left': '4px solid var(--accent-color, #007acc)',
      'background': 'rgba(255, 255, 255, 0.05)'
    };

    if (style) {
      Object.assign(baseStyle, style);
    }

    return Object.entries(baseStyle)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private updateProgress(): void {
    if (!this.speakerWindow) return;

    const progressBar = this.speakerWindow.document.getElementById('progress-bar');
    if (!progressBar) return;

    // TODO: Calculate actual progress based on slide sequence
    const progress = 50; // Placeholder
    (progressBar as HTMLElement).style.width = `${progress}%`;
  }

  private handleSpeakerControl(action: string): void {
    switch (action) {
      case 'first':
        this.context.router.firstSlide();
        break;
      case 'prev':
        this.context.router.prevSlide();
        break;
      case 'next':
        this.context.router.nextSlide();
        break;
      case 'last':
        this.context.router.lastSlide();
        break;
      case 'toggle-strict':
        this.bus.emit('mode:toggle-strict');
        break;
      case 'toggle-offline':
        this.bus.emit('mode:toggle-offline');
        break;
    }
  }
}

class SpeakerTimer {
  private startTime: number | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  start(): void {
    if (this.startTime) return; // Already started
    
    this.startTime = Date.now();
    this.intervalId = setInterval(() => {
      this.updateDisplay();
    }, 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(): void {
    this.stop();
    this.startTime = null;
  }

  private updateDisplay(): void {
    if (!this.startTime) return;

    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    const display = `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    
    // Update timer display in speaker window
    const timerElements = document.querySelectorAll('#timer');
    timerElements.forEach(el => {
      el.textContent = display;
    });
  }
}