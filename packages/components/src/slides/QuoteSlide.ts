/**
 * QuoteSlide Component  
 * A slide for displaying quotes with optional attribution
 */

import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'QuoteSlide',
  version: '1.0.0',
  tag: 'cs-quote-slide',
  schema: {
    type: 'object',
    required: ['quote'],
    properties: {
      quote: {
        type: 'string',
        description: 'The quote text'
      },
      author: {
        type: 'string',
        description: 'Quote author name'
      },
      attribution: {
        type: 'string',
        description: 'Additional attribution (company, book, etc.)'
      },
      style: {
        type: 'string',
        description: 'Quote style variant',
        enum: ['default', 'large', 'minimal'],
        default: 'default'
      }
    }
  },
  tokensUsed: [
    '--quote-color',
    '--quote-size',
    '--author-color',
    '--author-size',
    '--background-color',
    '--accent-color'
  ]
})
export class QuoteSlide extends CoolslidesElement {
  static observedAttributes = ['quote', 'author', 'attribution', 'style'];

  @property({ type: String, reflect: true })
  quote = '';

  @property({ type: String, reflect: true })
  author = '';

  @property({ type: String, reflect: true })
  attribution = '';

  @property({ type: String, reflect: true })
  style = 'default';

  constructor() {
    super();
    this.useTokens([
      '--quote-color',
      '--quote-size',
      '--author-color', 
      '--author-size',
      '--background-color',
      '--accent-color'
    ]);
  }

  protected update(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          min-height: 100vh;
          padding: var(--slide-padding, 2rem);
          background: var(--background-color, #ffffff);
          color: var(--text-color, #000000);
          font-family: var(--font-family, system-ui, sans-serif);
          box-sizing: border-box;
        }

        .quote-container {
          max-width: var(--content-max-width, 80ch);
          position: relative;
        }

        .quote-mark {
          font-size: var(--quote-mark-size, 4rem);
          color: var(--accent-color, #007acc);
          line-height: 0.8;
          margin-bottom: 1rem;
          font-family: Georgia, serif;
          opacity: 0.7;
        }

        .quote-text {
          font-size: var(--quote-size, 2rem);
          font-weight: var(--quote-weight, 400);
          color: var(--quote-color, var(--text-color, #000000));
          line-height: var(--quote-line-height, 1.4);
          margin: 0 0 2rem 0;
          font-style: italic;
        }

        .attribution {
          font-size: var(--author-size, 1.25rem);
          color: var(--author-color, var(--text-secondary, #666666));
          font-weight: var(--author-weight, 500);
          font-style: normal;
        }

        .author {
          margin-bottom: 0.25rem;
        }

        .source {
          font-size: 0.9em;
          opacity: 0.8;
        }

        /* Style variants */
        :host([style="large"]) .quote-text {
          font-size: var(--quote-size-large, 2.5rem);
        }

        :host([style="large"]) .quote-mark {
          font-size: var(--quote-mark-size-large, 5rem);
        }

        :host([style="minimal"]) .quote-mark {
          display: none;
        }

        :host([style="minimal"]) .quote-text {
          font-style: normal;
          position: relative;
        }

        :host([style="minimal"]) .quote-text::before {
          content: '"';
          font-size: 1.2em;
          color: var(--accent-color, #007acc);
        }

        :host([style="minimal"]) .quote-text::after {
          content: '"';
          font-size: 1.2em;
          color: var(--accent-color, #007acc);
        }

        /* Responsive design */
        @media (max-width: 768px) {
          :host {
            padding: var(--slide-padding-mobile, 1rem);
          }
          
          .quote-mark {
            font-size: var(--quote-mark-size-mobile, 3rem);
          }
          
          .quote-text {
            font-size: var(--quote-size-mobile, 1.5rem);
          }
          
          .attribution {
            font-size: var(--author-size-mobile, 1rem);
          }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .quote-mark {
            opacity: 1;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: no-preference) {
          :host {
            transition: all 0.3s ease;
          }
          
          .quote-text, .attribution {
            transition: all 0.3s ease;
          }
        }
      </style>
      
      <div class="quote-container">
        <div class="quote-mark">"</div>
        
        <blockquote class="quote-text">
          ${this.escapeHtml(this.quote)}
        </blockquote>
        
        ${this.author || this.attribution ? `
          <div class="attribution">
            ${this.author ? `<div class="author">— ${this.escapeHtml(this.author)}</div>` : ''}
            ${this.attribution ? `<div class="source">${this.escapeHtml(this.attribution)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
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
    // Clean up any resources
  }

  static async prefetch(props: Record<string, any>): Promise<void> {
    // Pre-warm any assets if needed
    console.log('Prefetching QuoteSlide with props:', props);
  }
}

// Auto-register the component
if (!customElements.get('cs-quote-slide')) {
  customElements.define('cs-quote-slide', QuoteSlide);
}