/**
 * TitleSlide Component
 * A simple title slide with main title and optional subtitle
 */

import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'TitleSlide',
  version: '1.0.0',
  tag: 'cs-title-slide',
  schema: {
    type: 'object',
    required: ['title'],
    properties: {
      title: {
        type: 'string',
        description: 'Main title text'
      },
      subtitle: {
        type: 'string',
        description: 'Optional subtitle text'
      },
      alignment: {
        type: 'string',
        description: 'Text alignment',
        enum: ['left', 'center', 'right'],
        default: 'center'
      }
    }
  },
  tokensUsed: [
    '--title-color',
    '--title-size',
    '--subtitle-color', 
    '--subtitle-size',
    '--background-color',
    '--accent-color'
  ]
})
export class TitleSlide extends CoolslidesElement {
  static observedAttributes = ['title', 'subtitle', 'alignment'];

  @property({ type: String, reflect: true })
  title = '';

  @property({ type: String, reflect: true })
  subtitle = '';

  @property({ type: String, reflect: true })
  alignment = 'center';

  constructor() {
    super();
    this.useTokens([
      '--title-color',
      '--title-size', 
      '--subtitle-color',
      '--subtitle-size',
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
          align-items: ${this.alignment === 'left' ? 'flex-start' : this.alignment === 'right' ? 'flex-end' : 'center'};
          text-align: ${this.alignment};
          min-height: 100vh;
          padding: var(--slide-padding, 2rem);
          background: var(--background-color, #ffffff);
          color: var(--text-color, #000000);
          font-family: var(--font-family, system-ui, sans-serif);
          box-sizing: border-box;
        }

        .title {
          font-size: var(--title-size, 3.5rem);
          font-weight: var(--title-weight, 700);
          color: var(--title-color, var(--text-color, #000000));
          margin: 0 0 1rem 0;
          line-height: var(--title-line-height, 1.2);
          max-width: var(--content-max-width, 80ch);
        }

        .subtitle {
          font-size: var(--subtitle-size, 1.5rem);
          font-weight: var(--subtitle-weight, 400);
          color: var(--subtitle-color, var(--text-secondary, #666666));
          margin: 0;
          line-height: var(--subtitle-line-height, 1.4);
          max-width: var(--content-max-width, 80ch);
        }

        .subtitle:empty {
          display: none;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          :host {
            padding: var(--slide-padding-mobile, 1rem);
          }
          
          .title {
            font-size: var(--title-size-mobile, 2.5rem);
          }
          
          .subtitle {
            font-size: var(--subtitle-size-mobile, 1.25rem);
          }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .title {
            font-weight: 800;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: no-preference) {
          :host {
            transition: all 0.3s ease;
          }
          
          .title, .subtitle {
            transition: all 0.3s ease;
          }
        }
      </style>
      
      <h1 class="title">${this.escapeHtml(this.title)}</h1>
      ${this.subtitle ? `<p class="subtitle">${this.escapeHtml(this.subtitle)}</p>` : ''}
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
    // Pause any animations or timers if needed
  }

  resume(): void {
    // Resume any animations or timers if needed
  }

  teardown(): void {
    // Clean up any resources
  }

  static async prefetch(props: Record<string, any>): Promise<void> {
    // Pre-warm any assets if needed
    // For title slide, there's typically nothing to prefetch
    console.log('Prefetching TitleSlide with props:', props);
  }
}

// Auto-register the component
if (!customElements.get('cs-title-slide')) {
  customElements.define('cs-title-slide', TitleSlide);
}