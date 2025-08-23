/**
 * PollWidget Component
 * Interactive polling component that works with the Poll plugin
 */

import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'PollWidget',
  version: '1.0.0',
  tag: 'cs-poll',
  schema: {
    type: 'object',
    required: ['question'],
    properties: {
      question: {
        type: 'string',
        description: 'Poll question to ask the audience'
      },
      type: {
        type: 'string',
        enum: ['multiple-choice', 'text', 'rating', 'yes-no'],
        description: 'Type of poll question',
        default: 'multiple-choice'
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Options for multiple-choice questions'
      },
      maxRating: {
        type: 'number',
        description: 'Maximum rating for rating questions',
        minimum: 1,
        maximum: 10,
        default: 5
      },
      allowMultiple: {
        type: 'boolean',
        description: 'Allow multiple selections in multiple-choice',
        default: false
      },
      anonymous: {
        type: 'boolean',
        description: 'Make responses anonymous',
        default: true
      },
      autoStart: {
        type: 'boolean',
        description: 'Start poll automatically when slide appears',
        default: true
      },
      showResults: {
        type: 'boolean',
        description: 'Show results immediately after voting',
        default: false
      }
    }
  },
  tokensUsed: [
    '--poll-background',
    '--poll-border',
    '--poll-border-radius',
    '--poll-question-color',
    '--poll-question-size',
    '--poll-option-background',
    '--poll-option-hover-background',
    '--poll-button-background',
    '--poll-button-color',
    '--poll-results-bar-color'
  ],
  capabilities: ['rooms.ws', 'storage.kv', 'ui.toast']
})
export class PollWidget extends CoolslidesElement {
  static observedAttributes = [
    'question', 'type', 'options', 'max-rating', 'allow-multiple', 
    'anonymous', 'auto-start', 'show-results'
  ];

  @property({ type: String, reflect: true })
  question = '';

  @property({ type: String, reflect: true })
  type: 'multiple-choice' | 'text' | 'rating' | 'yes-no' = 'multiple-choice';

  @property({ type: Array })
  options: string[] = [];

  @property({ type: Number, attribute: 'max-rating', reflect: true })
  maxRating = 5;

  @property({ type: Boolean, attribute: 'allow-multiple', reflect: true })
  allowMultiple = false;

  @property({ type: Boolean, reflect: true })
  anonymous = true;

  @property({ type: Boolean, attribute: 'auto-start', reflect: true })
  autoStart = true;

  @property({ type: Boolean, attribute: 'show-results', reflect: true })
  showResults = false;

  private pollActive = false;
  private hasVoted = false;
  private currentResults: any = null;

  constructor() {
    super();
    this.useTokens([
      '--poll-background',
      '--poll-border',
      '--poll-border-radius',
      '--poll-question-color',
      '--poll-question-size',
      '--poll-option-background',
      '--poll-option-hover-background',
      '--poll-button-background',
      '--poll-button-color',
      '--poll-results-bar-color'
    ]);
  }

  connectedCallback(): void {
    super.connectedCallback();
    
    // Parse options from attribute if it's a string
    if (typeof this.getAttribute('options') === 'string') {
      try {
        this.options = JSON.parse(this.getAttribute('options') || '[]');
      } catch {
        this.options = this.getAttribute('options')?.split(',').map(s => s.trim()) || [];
      }
    }

    // Listen for poll events from the plugin
    this.addEventListener('poll:start', this.onPollStart.bind(this));
    this.addEventListener('poll:stop', this.onPollStop.bind(this));
    this.addEventListener('poll:results', this.onPollResults.bind(this));
    
    this.requestUpdate();
  }

  protected async update(): Promise<void> {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 600px;
          margin: 2rem auto;
          font-family: var(--font-family, system-ui, sans-serif);
        }

        .poll-container {
          background: var(--poll-background, #ffffff);
          border: 1px solid var(--poll-border, var(--color-gray-200, #e9ecef));
          border-radius: var(--poll-border-radius, 12px);
          padding: 2rem;
          box-shadow: var(--shadow-lg, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .poll-question {
          font-size: var(--poll-question-size, 1.5rem);
          font-weight: 600;
          color: var(--poll-question-color, var(--text-color, #000000));
          margin: 0 0 1.5rem 0;
          line-height: 1.4;
        }

        .poll-status {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 1.5rem;
        }

        .poll-status.active {
          background: var(--color-green-100, #dcfce7);
          color: var(--color-green-800, #166534);
        }

        .poll-status.ended {
          background: var(--color-blue-100, #dbeafe);
          color: var(--color-blue-800, #1e40af);
        }

        .poll-options {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 2rem;
        }

        .poll-option {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: var(--poll-option-background, var(--color-gray-50, #f9fafb));
          border: 1px solid var(--color-gray-200, #e9ecef);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .poll-option:hover {
          background: var(--poll-option-hover-background, var(--color-gray-100, #f3f4f6));
          border-color: var(--color-gray-300, #d1d5db);
        }

        .poll-option.selected {
          background: var(--accent-color, #007acc);
          color: white;
          border-color: var(--accent-color, #007acc);
        }

        .poll-option input {
          margin-right: 0.75rem;
          transform: scale(1.2);
        }

        .poll-option-text {
          flex: 1;
          font-weight: 500;
        }

        .poll-rating {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }

        .poll-rating-button {
          width: 3rem;
          height: 3rem;
          border: 2px solid var(--color-gray-300, #d1d5db);
          border-radius: 50%;
          background: var(--color-gray-50, #f9fafb);
          font-weight: 600;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .poll-rating-button:hover {
          border-color: var(--accent-color, #007acc);
          background: var(--color-blue-50, #eff6ff);
        }

        .poll-rating-button.selected {
          background: var(--accent-color, #007acc);
          color: white;
          border-color: var(--accent-color, #007acc);
        }

        .poll-text-input {
          width: 100%;
          min-height: 4rem;
          padding: 1rem;
          border: 1px solid var(--color-gray-300, #d1d5db);
          border-radius: 8px;
          font-family: inherit;
          font-size: 1rem;
          resize: vertical;
          margin-bottom: 2rem;
        }

        .poll-text-input:focus {
          outline: none;
          border-color: var(--accent-color, #007acc);
          box-shadow: 0 0 0 3px var(--color-blue-100, #dbeafe);
        }

        .poll-actions {
          display: flex;
          gap: 1rem;
          justify-content: space-between;
          align-items: center;
        }

        .poll-button {
          padding: 0.75rem 2rem;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .poll-button.primary {
          background: var(--poll-button-background, var(--accent-color, #007acc));
          color: var(--poll-button-color, white);
        }

        .poll-button.primary:hover {
          background: var(--accent-color-dark, #0066aa);
        }

        .poll-button.primary:disabled {
          background: var(--color-gray-300, #d1d5db);
          cursor: not-allowed;
        }

        .poll-button.secondary {
          background: transparent;
          color: var(--text-secondary, #666666);
          border: 1px solid var(--color-gray-300, #d1d5db);
        }

        .poll-button.secondary:hover {
          background: var(--color-gray-50, #f9fafb);
        }

        .poll-results {
          margin-top: 2rem;
        }

        .poll-results-header {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-color, #000000);
        }

        .poll-result-item {
          margin-bottom: 1rem;
        }

        .poll-result-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .poll-result-bar {
          height: 2rem;
          background: var(--color-gray-200, #e9ecef);
          border-radius: 1rem;
          overflow: hidden;
          position: relative;
        }

        .poll-result-fill {
          height: 100%;
          background: var(--poll-results-bar-color, var(--accent-color, #007acc));
          border-radius: inherit;
          transition: width 0.5s ease;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 0.75rem;
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .poll-text-responses {
          max-height: 20rem;
          overflow-y: auto;
        }

        .poll-text-response {
          background: var(--color-gray-50, #f9fafb);
          border: 1px solid var(--color-gray-200, #e9ecef);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 0.75rem;
          font-style: italic;
        }

        .poll-text-more {
          text-align: center;
          color: var(--text-secondary, #666666);
          font-style: italic;
          padding: 1rem;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .poll-container {
            padding: 1.5rem;
          }

          .poll-rating {
            gap: 0.25rem;
          }

          .poll-rating-button {
            width: 2.5rem;
            height: 2.5rem;
            font-size: 1rem;
          }

          .poll-actions {
            flex-direction: column;
            gap: 0.75rem;
          }

          .poll-button {
            width: 100%;
          }
        }

        /* Print support */
        @media print {
          .poll-container {
            border: 1px solid #000;
            box-shadow: none;
          }

          .poll-button {
            display: none;
          }

          .poll-options {
            display: none;
          }

          .poll-results {
            display: block !important;
          }
        }
      </style>
      
      <div class="poll-container">
        <h2 class="poll-question">${this.escapeHtml(this.question)}</h2>
        
        <div class="poll-status ${this.pollActive ? 'active' : 'ended'}">
          ${this.pollActive ? 'Voting Active' : this.hasVoted ? 'Vote Submitted' : 'Poll Ended'}
        </div>

        ${this.renderPollContent()}
        
        ${this.currentResults ? this.renderResults() : ''}
      </div>
    `;

    this.setupEventListeners();
  }

  private renderPollContent(): string {
    if (!this.pollActive || this.hasVoted) {
      return '';
    }

    switch (this.type) {
      case 'multiple-choice':
        return `
          <div class="poll-options">
            ${this.options.map((option, index) => `
              <label class="poll-option" data-value="${option}">
                <input type="${this.allowMultiple ? 'checkbox' : 'radio'}" 
                       name="poll-answer" value="${option}" data-index="${index}">
                <span class="poll-option-text">${this.escapeHtml(option)}</span>
              </label>
            `).join('')}
          </div>
          ${this.renderActions()}
        `;

      case 'yes-no':
        return `
          <div class="poll-options">
            <label class="poll-option" data-value="yes">
              <input type="radio" name="poll-answer" value="yes">
              <span class="poll-option-text">Yes</span>
            </label>
            <label class="poll-option" data-value="no">
              <input type="radio" name="poll-answer" value="no">
              <span class="poll-option-text">No</span>
            </label>
          </div>
          ${this.renderActions()}
        `;

      case 'rating':
        return `
          <div class="poll-rating">
            ${Array.from({ length: this.maxRating }, (_, i) => `
              <button class="poll-rating-button" data-rating="${i + 1}">
                ${i + 1}
              </button>
            `).join('')}
          </div>
          ${this.renderActions()}
        `;

      case 'text':
        return `
          <textarea class="poll-text-input" 
                    placeholder="Enter your response..."
                    maxlength="500"></textarea>
          ${this.renderActions()}
        `;

      default:
        return '<p>Unsupported poll type</p>';
    }
  }

  private renderActions(): string {
    return `
      <div class="poll-actions">
        <button class="poll-button primary" id="submit-vote" disabled>
          Submit Vote
        </button>
        ${this.showResults ? `
          <button class="poll-button secondary" id="toggle-results">
            Show Results
          </button>
        ` : ''}
      </div>
    `;
  }

  private renderResults(): string {
    if (!this.currentResults) return '';

    const { totalResponses, results } = this.currentResults;

    return `
      <div class="poll-results">
        <div class="poll-results-header">
          Results (${totalResponses} responses)
        </div>
        ${this.renderResultsContent(results)}
      </div>
    `;
  }

  private renderResultsContent(results: any): string {
    switch (this.type) {
      case 'multiple-choice':
      case 'yes-no':
        const total = Object.values(results as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        return Object.entries(results as Record<string, number>)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .map(([option, count]) => {
            const percentage = total > 0 ? ((count as number) / total * 100).toFixed(1) : '0';
            return `
              <div class="poll-result-item">
                <div class="poll-result-label">
                  <span>${this.escapeHtml(option)}</span>
                  <span>${count} (${percentage}%)</span>
                </div>
                <div class="poll-result-bar">
                  <div class="poll-result-fill" style="width: ${percentage}%">
                    ${percentage}%
                  </div>
                </div>
              </div>
            `;
          }).join('');

      case 'rating':
        const ratingData = results as { average: number; responses: number[] };
        return `
          <div class="poll-result-item">
            <div class="poll-result-label">
              <span>Average Rating</span>
              <span>${ratingData.average.toFixed(1)} / ${this.maxRating}</span>
            </div>
          </div>
          ${Array.from({ length: this.maxRating }, (_, i) => {
            const rating = i + 1;
            const count = ratingData.responses.filter(r => r === rating).length;
            const percentage = ratingData.responses.length > 0 ? 
              (count / ratingData.responses.length * 100).toFixed(1) : '0';
            return `
              <div class="poll-result-item">
                <div class="poll-result-label">
                  <span>${rating} ★</span>
                  <span>${count}</span>
                </div>
                <div class="poll-result-bar">
                  <div class="poll-result-fill" style="width: ${percentage}%">
                    ${percentage}%
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        `;

      case 'text':
        const textResponses = results as string[];
        return `
          <div class="poll-text-responses">
            ${textResponses.slice(0, 10).map(response => `
              <div class="poll-text-response">"${this.escapeHtml(response)}"</div>
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
    if (!this.shadowRoot) return;

    const submitButton = this.shadowRoot.querySelector('#submit-vote') as HTMLButtonElement;
    const inputs = this.shadowRoot.querySelectorAll('input, textarea');
    const resultsToggle = this.shadowRoot.querySelector('#toggle-results') as HTMLButtonElement;
    
    // Enable submit button when answer is selected
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        if (submitButton) {
          submitButton.disabled = !this.hasValidAnswer();
        }
      });
    });

    // Handle submit
    submitButton?.addEventListener('click', () => {
      const answer = this.getSelectedAnswer();
      if (answer !== null) {
        this.submitVote(answer);
      }
    });

    // Handle results toggle
    resultsToggle?.addEventListener('click', () => {
      const resultsDiv = this.shadowRoot!.querySelector('.poll-results') as HTMLElement;
      if (resultsDiv) {
        const isVisible = resultsDiv.style.display !== 'none';
        resultsDiv.style.display = isVisible ? 'none' : 'block';
        resultsToggle.textContent = isVisible ? 'Show Results' : 'Hide Results';
      }
    });

    // Handle rating buttons
    const ratingButtons = this.shadowRoot.querySelectorAll('.poll-rating-button');
    ratingButtons.forEach(button => {
      button.addEventListener('click', () => {
        ratingButtons.forEach(b => b.classList.remove('selected'));
        button.classList.add('selected');
        if (submitButton) {
          submitButton.disabled = false;
        }
      });
    });

    // Handle option clicks
    const optionLabels = this.shadowRoot.querySelectorAll('.poll-option');
    optionLabels.forEach(label => {
      label.addEventListener('click', () => {
        if (!this.allowMultiple) {
          optionLabels.forEach(l => l.classList.remove('selected'));
        }
        label.classList.toggle('selected');
      });
    });
  }

  private hasValidAnswer(): boolean {
    if (!this.shadowRoot) return false;

    switch (this.type) {
      case 'multiple-choice':
      case 'yes-no':
        return this.shadowRoot.querySelector('input:checked') !== null;
      
      case 'rating':
        return this.shadowRoot.querySelector('.poll-rating-button.selected') !== null;
      
      case 'text':
        const textarea = this.shadowRoot.querySelector('.poll-text-input') as HTMLTextAreaElement;
        return textarea && textarea.value.trim().length > 0;
      
      default:
        return false;
    }
  }

  private getSelectedAnswer(): string | string[] | number | null {
    if (!this.shadowRoot) return null;

    switch (this.type) {
      case 'multiple-choice':
        if (this.allowMultiple) {
          const checked = Array.from(this.shadowRoot.querySelectorAll('input:checked')) as HTMLInputElement[];
          return checked.map(input => input.value);
        } else {
          const checked = this.shadowRoot.querySelector('input:checked') as HTMLInputElement;
          return checked ? checked.value : null;
        }

      case 'yes-no':
        const checked = this.shadowRoot.querySelector('input:checked') as HTMLInputElement;
        return checked ? checked.value : null;

      case 'rating':
        const selected = this.shadowRoot.querySelector('.poll-rating-button.selected');
        return selected ? parseInt(selected.getAttribute('data-rating') || '0', 10) : null;

      case 'text':
        const textarea = this.shadowRoot.querySelector('.poll-text-input') as HTMLTextAreaElement;
        return textarea ? textarea.value.trim() : null;

      default:
        return null;
    }
  }

  private submitVote(answer: string | string[] | number): void {
    // Dispatch custom event with vote data
    this.dispatchEvent(new CustomEvent('poll:vote', {
      detail: {
        questionId: `poll-${Date.now()}`,
        answer: answer,
        responderId: this.generateResponderId(),
        timestamp: Date.now()
      },
      bubbles: true
    }));

    this.hasVoted = true;
    this.requestUpdate();
  }

  private generateResponderId(): string {
    if (this.anonymous) {
      return `anon-${Math.random().toString(36).substr(2, 9)}`;
    } else {
      return `user-${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  private onPollStart(event: Event): void {
    this.pollActive = true;
    this.hasVoted = false;
    this.requestUpdate();
  }

  private onPollStop(event: Event): void {
    this.pollActive = false;
    this.requestUpdate();
  }

  private onPollResults(event: CustomEvent): void {
    this.currentResults = event.detail;
    this.requestUpdate();
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Component lifecycle
  pause(): void {
    // Pause any animations if needed
  }

  resume(): void {
    // Resume any animations if needed
  }

  teardown(): void {
    // Cleanup if needed
  }

  static async prefetch(props: Record<string, any>): Promise<void> {
    console.log('Prefetched PollWidget with props:', props);
  }
}

// Auto-register the component
if (!customElements.get('cs-poll')) {
  customElements.define('cs-poll', PollWidget);
}