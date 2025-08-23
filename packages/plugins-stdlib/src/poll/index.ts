/**
 * Poll Plugin for Coolslides
 * Interactive polling with real-time results
 */

export interface PluginContext {
  deck: any;
  slide: any;
  router: any;
  logger: any;
  bus: any;
  capabilities?: {
    'rooms.ws'?: WebSocketCapability;
    'storage.kv'?: StorageCapability;
    'ui.toast'?: UICapability;
  };
}

export interface WebSocketCapability {
  connect(roomId: string): WebSocketConnection;
}

export interface WebSocketConnection {
  send(data: any): void;
  onMessage(callback: (data: any) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}

export interface StorageCapability {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface UICapability {
  toast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  qr(data: string): void;
}

export interface PollQuestion {
  id: string;
  question: string;
  type: 'multiple-choice' | 'text' | 'rating' | 'yes-no';
  options?: string[];
  maxRating?: number;
  allowMultiple?: boolean;
  anonymous?: boolean;
}

export interface PollResponse {
  questionId: string;
  answer: string | string[] | number;
  responderId: string;
  timestamp: number;
}

export interface PollResults {
  questionId: string;
  totalResponses: number;
  results: Record<string, number> | string[] | { average: number; responses: number[] };
}

class PollPlugin {
  private context!: PluginContext;
  private currentPoll: PollQuestion | null = null;
  private responses: Map<string, PollResponse[]> = new Map();
  private websocket: WebSocketConnection | null = null;
  private pollWidget: PollWidget | null = null;

  async init(ctx: PluginContext): Promise<void> {
    this.context = ctx;
    
    // Register event listeners
    this.context.bus.on('slide:enter', this.onSlideEnter.bind(this));
    this.context.bus.on('slide:leave', this.onSlideLeave.bind(this));
    this.context.bus.on('poll:start', this.onPollStart.bind(this));
    this.context.bus.on('poll:stop', this.onPollStop.bind(this));
    this.context.bus.on('poll:response', this.onPollResponse.bind(this));

    // Connect to WebSocket for real-time polling
    if (this.context.capabilities?.['rooms.ws']) {
      this.connectToRoom();
    }

    this.context.logger.info('Poll plugin initialized');
  }

  async onSlideEnter(event: { slideId: string; slide: any }): Promise<void> {
    // Check if slide contains a poll
    const pollData = this.extractPollData(event.slide);
    if (pollData) {
      this.startPoll(pollData);
    }
  }

  async onSlideLeave(_event: { slideId: string; slide: any }): Promise<void> {
    if (this.currentPoll) {
      this.stopPoll();
    }
  }

  async onBeforePrint(): Promise<void> {
    // Generate static poll results for print
    if (this.currentPoll && this.pollWidget) {
      await this.pollWidget.generatePrintSnapshot();
    }
  }

  private extractPollData(slide: any): PollQuestion | null {
    // Look for poll data in slide slots or props
    const slots = slide.slots || {};
    const pollSlot = Object.values(slots).find((slot: any) => 
      slot.kind === 'component' && slot.tag === 'cs-poll'
    );

    if (pollSlot) {
      const props = (pollSlot as any).props || {};
      return {
        id: `poll-${slide.id}-${Date.now()}`,
        question: props.question || 'Poll Question',
        type: props.type || 'multiple-choice',
        options: props.options || [],
        maxRating: props.maxRating || 5,
        allowMultiple: props.allowMultiple || false,
        anonymous: props.anonymous !== false,
      };
    }

    return null;
  }

  private async startPoll(poll: PollQuestion): Promise<void> {
    this.currentPoll = poll;
    this.responses.set(poll.id, []);

    // Create poll widget
    this.pollWidget = new PollWidget(poll, this.context);
    await this.pollWidget.mount();

    // Broadcast poll start to room
    if (this.websocket) {
      this.websocket.send({
        type: 'poll:start',
        poll: poll,
        timestamp: Date.now(),
      });
    }

    // Store poll in local storage for persistence
    if (this.context.capabilities?.['storage.kv']) {
      const storage = this.context.capabilities['storage.kv'];
      await storage.set(`poll:${poll.id}`, poll);
    }

    this.context.logger.info(`Started poll: ${poll.question}`);
    
    if (this.context.capabilities?.['ui.toast']) {
      this.context.capabilities['ui.toast'].toast('Poll started! Audience can now vote.', 'info');
    }
  }

  private async stopPoll(): Promise<void> {
    if (!this.currentPoll) return;

    const results = this.calculateResults(this.currentPoll.id);
    
    // Update poll widget with results
    if (this.pollWidget) {
      this.pollWidget.showResults(results);
    }

    // Broadcast poll stop to room
    if (this.websocket) {
      this.websocket.send({
        type: 'poll:stop',
        pollId: this.currentPoll.id,
        results: results,
        timestamp: Date.now(),
      });
    }

    this.context.logger.info(`Stopped poll: ${this.currentPoll.question}`);
    
    if (this.context.capabilities?.['ui.toast']) {
      this.context.capabilities['ui.toast'].toast(
        `Poll ended. ${results.totalResponses} responses received.`, 
        'success'
      );
    }

    this.currentPoll = null;
  }

  private async onPollStart(event: { poll: PollQuestion }): Promise<void> {
    // Handle poll start from other sources
    if (!this.currentPoll) {
      this.currentPoll = event.poll;
    }
  }

  private async onPollStop(event: { pollId: string }): Promise<void> {
    // Handle poll stop from other sources
    if (this.currentPoll?.id === event.pollId) {
      await this.stopPoll();
    }
  }

  private async onPollResponse(event: { response: PollResponse }): Promise<void> {
    if (!this.currentPoll || event.response.questionId !== this.currentPoll.id) {
      return;
    }

    // Store response
    const responses = this.responses.get(this.currentPoll.id) || [];
    responses.push(event.response);
    this.responses.set(this.currentPoll.id, responses);

    // Update widget with new response
    if (this.pollWidget) {
      const results = this.calculateResults(this.currentPoll.id);
      this.pollWidget.updateResults(results);
    }

    // Broadcast to other clients
    if (this.websocket) {
      this.websocket.send({
        type: 'poll:response:received',
        response: event.response,
        timestamp: Date.now(),
      });
    }
  }

  private calculateResults(pollId: string): PollResults {
    const responses = this.responses.get(pollId) || [];
    const poll = this.currentPoll;

    if (!poll) {
      return { questionId: pollId, totalResponses: 0, results: {} };
    }

    const results: PollResults = {
      questionId: pollId,
      totalResponses: responses.length,
      results: {},
    };

    switch (poll.type) {
      case 'multiple-choice':
      case 'yes-no':
        const counts: Record<string, number> = {};
        responses.forEach(response => {
          const answers = Array.isArray(response.answer) ? response.answer : [response.answer];
          answers.forEach(answer => {
            counts[answer as string] = (counts[answer as string] || 0) + 1;
          });
        });
        results.results = counts;
        break;

      case 'rating':
        const ratings = responses.map(r => r.answer as number).filter(r => typeof r === 'number');
        const average = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
        results.results = { average, responses: ratings };
        break;

      case 'text':
        results.results = responses.map(r => r.answer as string);
        break;
    }

    return results;
  }

  private connectToRoom(): void {
    if (!this.context.capabilities?.['rooms.ws']) return;

    const roomId = `poll-room-${this.context.slide?.id || 'default'}`;
    this.websocket = this.context.capabilities['rooms.ws'].connect(roomId);

    this.websocket.onMessage((data) => {
      if (data.type === 'poll:response' && this.currentPoll) {
        this.onPollResponse({ response: data.response });
      }
    });

    this.websocket.onClose(() => {
      this.websocket = null;
      // Attempt to reconnect after a delay
      setTimeout(() => this.connectToRoom(), 5000);
    });
  }

  teardown(): void {
    if (this.websocket) {
      this.websocket.close();
    }
    
    if (this.pollWidget) {
      this.pollWidget.unmount();
    }

    this.context.logger.info('Poll plugin teardown complete');
  }
}

class PollWidget {
  private poll: PollQuestion;
  private context: PluginContext;
  private element: HTMLElement | null = null;

  constructor(poll: PollQuestion, context: PluginContext) {
    this.poll = poll;
    this.context = context;
  }

  async mount(): Promise<void> {
    this.element = document.createElement('div');
    this.element.className = 'coolslides-poll-widget';
    this.element.innerHTML = this.renderPoll();
    
    // Add to current slide
    const slideElement = document.querySelector(`[data-slide="${this.context.slide?.id}"]`);
    if (slideElement) {
      slideElement.appendChild(this.element);
    }

    this.setupEventListeners();
  }

  unmount(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  showResults(results: PollResults): void {
    if (!this.element) return;
    
    this.element.innerHTML = this.renderResults(results);
  }

  updateResults(results: PollResults): void {
    const resultsElement = this.element?.querySelector('.poll-results');
    if (resultsElement) {
      resultsElement.innerHTML = this.renderResultsContent(results);
    }
  }

  async generatePrintSnapshot(): Promise<void> {
    // Generate static version for print
    if (!this.element) return;

    const results = this.context.bus.emit('poll:get-results', { pollId: this.poll.id });
    this.element.classList.add('poll-print-version');
    this.element.innerHTML = this.renderResults(results);
  }

  private renderPoll(): string {
    return `
      <div class="poll-container">
        <div class="poll-header">
          <h3 class="poll-question">${this.poll.question}</h3>
          <div class="poll-status">Voting active</div>
        </div>
        
        <div class="poll-content">
          ${this.renderPollInputs()}
        </div>
        
        <div class="poll-actions">
          <button class="poll-submit" disabled>Submit Vote</button>
          <button class="poll-results-toggle">Show Results</button>
        </div>
        
        <div class="poll-results" style="display: none;"></div>
      </div>
    `;
  }

  private renderPollInputs(): string {
    switch (this.poll.type) {
      case 'multiple-choice':
        return this.poll.options?.map((option, index) => `
          <label class="poll-option">
            <input type="${this.poll.allowMultiple ? 'checkbox' : 'radio'}" 
                   name="poll-answer" value="${option}" data-index="${index}">
            <span class="poll-option-text">${option}</span>
          </label>
        `).join('') || '';

      case 'yes-no':
        return `
          <label class="poll-option">
            <input type="radio" name="poll-answer" value="yes">
            <span class="poll-option-text">Yes</span>
          </label>
          <label class="poll-option">
            <input type="radio" name="poll-answer" value="no">
            <span class="poll-option-text">No</span>
          </label>
        `;

      case 'rating':
        const maxRating = this.poll.maxRating || 5;
        return `
          <div class="poll-rating">
            ${Array.from({ length: maxRating }, (_, i) => `
              <button class="poll-rating-button" data-rating="${i + 1}">
                ${i + 1}
              </button>
            `).join('')}
          </div>
        `;

      case 'text':
        return `
          <textarea class="poll-text-input" 
                    placeholder="Enter your response..."
                    maxlength="500"></textarea>
        `;

      default:
        return '<p>Unsupported poll type</p>';
    }
  }

  private renderResults(results: PollResults): string {
    return `
      <div class="poll-container poll-results-view">
        <div class="poll-header">
          <h3 class="poll-question">${this.poll.question}</h3>
          <div class="poll-status">Results (${results.totalResponses} responses)</div>
        </div>
        
        <div class="poll-results">
          ${this.renderResultsContent(results)}
        </div>
      </div>
    `;
  }

  private renderResultsContent(results: PollResults): string {
    switch (this.poll.type) {
      case 'multiple-choice':
      case 'yes-no':
        const counts = results.results as Record<string, number>;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        
        return Object.entries(counts)
          .sort(([, a], [, b]) => b - a)
          .map(([option, count]) => {
            const percentage = total > 0 ? (count / total * 100).toFixed(1) : '0';
            return `
              <div class="poll-result-item">
                <div class="poll-result-label">${option}</div>
                <div class="poll-result-bar">
                  <div class="poll-result-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="poll-result-stats">${count} (${percentage}%)</div>
              </div>
            `;
          }).join('');

      case 'rating':
        const ratingData = results.results as { average: number; responses: number[] };
        return `
          <div class="poll-rating-results">
            <div class="poll-average-rating">
              Average: ${ratingData.average.toFixed(1)} / ${this.poll.maxRating || 5}
            </div>
            <div class="poll-rating-distribution">
              ${Array.from({ length: this.poll.maxRating || 5 }, (_, i) => {
                const rating = i + 1;
                const count = ratingData.responses.filter(r => r === rating).length;
                const percentage = ratingData.responses.length > 0 ? 
                  (count / ratingData.responses.length * 100).toFixed(1) : '0';
                return `
                  <div class="poll-rating-bar">
                    <span>${rating}★</span>
                    <div class="poll-result-bar">
                      <div class="poll-result-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span>${count}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;

      case 'text':
        const textResponses = results.results as string[];
        return `
          <div class="poll-text-responses">
            ${textResponses.slice(0, 10).map(response => `
              <div class="poll-text-response">"${response}"</div>
            `).join('')}
            ${textResponses.length > 10 ? `
              <div class="poll-text-more">
                ... and ${textResponses.length - 10} more responses
              </div>
            ` : ''}
          </div>
        `;

      default:
        return '<p>No results available</p>';
    }
  }

  private setupEventListeners(): void {
    if (!this.element) return;

    // Submit button
    const submitButton = this.element.querySelector('.poll-submit') as HTMLButtonElement;
    const inputs = this.element.querySelectorAll('input, textarea');
    
    // Enable submit button when answer is selected
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        submitButton.disabled = !this.hasValidAnswer();
      });
    });

    // Submit vote
    submitButton?.addEventListener('click', () => {
      const answer = this.getSelectedAnswer();
      if (answer !== null) {
        this.submitVote(answer);
      }
    });

    // Results toggle
    const resultsToggle = this.element.querySelector('.poll-results-toggle');
    resultsToggle?.addEventListener('click', () => {
      const resultsDiv = this.element!.querySelector('.poll-results') as HTMLElement;
      const isVisible = resultsDiv.style.display !== 'none';
      resultsDiv.style.display = isVisible ? 'none' : 'block';
      (resultsToggle as HTMLButtonElement).textContent = isVisible ? 'Show Results' : 'Hide Results';
    });

    // Rating buttons
    const ratingButtons = this.element.querySelectorAll('.poll-rating-button');
    ratingButtons.forEach(button => {
      button.addEventListener('click', () => {
        ratingButtons.forEach(b => b.classList.remove('selected'));
        button.classList.add('selected');
        submitButton.disabled = false;
      });
    });
  }

  private hasValidAnswer(): boolean {
    switch (this.poll.type) {
      case 'multiple-choice':
      case 'yes-no':
        return this.element!.querySelector('input:checked') !== null;
      
      case 'rating':
        return this.element!.querySelector('.poll-rating-button.selected') !== null;
      
      case 'text':
        const textarea = this.element!.querySelector('.poll-text-input') as HTMLTextAreaElement;
        return textarea && textarea.value.trim().length > 0;
      
      default:
        return false;
    }
  }

  private getSelectedAnswer(): string | string[] | number | null {
    switch (this.poll.type) {
      case 'multiple-choice':
        if (this.poll.allowMultiple) {
          const checked = Array.from(this.element!.querySelectorAll('input:checked')) as HTMLInputElement[];
          return checked.map(input => input.value);
        } else {
          const checked = this.element!.querySelector('input:checked') as HTMLInputElement;
          return checked ? checked.value : null;
        }

      case 'yes-no':
        const checked = this.element!.querySelector('input:checked') as HTMLInputElement;
        return checked ? checked.value : null;

      case 'rating':
        const selected = this.element!.querySelector('.poll-rating-button.selected');
        return selected ? parseInt(selected.getAttribute('data-rating') || '0', 10) : null;

      case 'text':
        const textarea = this.element!.querySelector('.poll-text-input') as HTMLTextAreaElement;
        return textarea ? textarea.value.trim() : null;

      default:
        return null;
    }
  }

  private submitVote(answer: string | string[] | number): void {
    const response: PollResponse = {
      questionId: this.poll.id,
      answer: answer,
      responderId: this.generateResponderId(),
      timestamp: Date.now(),
    };

    // Emit poll response event
    this.context.bus.emit('poll:response', { response });

    // Disable form after submission
    const inputs = this.element!.querySelectorAll('input, textarea, button');
    inputs.forEach(input => {
      (input as HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement).disabled = true;
    });

    // Show confirmation
    const submitButton = this.element!.querySelector('.poll-submit') as HTMLButtonElement;
    submitButton.textContent = 'Vote Submitted!';
    submitButton.classList.add('submitted');
  }

  private generateResponderId(): string {
    // Generate anonymous responder ID
    if (this.poll.anonymous) {
      return `anon-${Math.random().toString(36).substr(2, 9)}`;
    } else {
      // In a real implementation, this would use actual user ID
      return `user-${Math.random().toString(36).substr(2, 9)}`;
    }
  }
}

// Plugin export
export default {
  name: '@coolslides/plugins-poll',
  version: '1.0.0',
  capabilities: ['rooms.ws', 'storage.kv', 'ui.toast'],
  hooks: ['init', 'onSlideEnter', 'onSlideLeave', 'onBeforePrint'],
  
  async init(ctx: PluginContext): Promise<void> {
    const plugin = new PollPlugin();
    await plugin.init(ctx);
    
    // Store plugin instance for lifecycle management
    (ctx as any).__pollPlugin = plugin;
  },

  async onSlideEnter(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__pollPlugin as PollPlugin;
    if (plugin) {
      await plugin.onSlideEnter({ slideId: ctx.slide.id, slide: ctx.slide });
    }
  },

  async onSlideLeave(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__pollPlugin as PollPlugin;
    if (plugin) {
      await plugin.onSlideLeave({ slideId: ctx.slide.id, slide: ctx.slide });
    }
  },

  async onBeforePrint(ctx: PluginContext): Promise<void> {
    const plugin = (ctx as any).__pollPlugin as PollPlugin;
    if (plugin) {
      await plugin.onBeforePrint();
    }
  }
};