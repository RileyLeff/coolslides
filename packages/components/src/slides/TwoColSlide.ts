/**
 * TwoColSlide Component
 * A two-column layout slide with configurable content areas
 */

import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'TwoColSlide',
  version: '1.0.0',
  tag: 'cs-two-col-slide',
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Optional slide title'
      },
      leftWidth: {
        type: 'string',
        description: 'Width of left column (CSS value)',
        default: '50%'
      },
      rightWidth: {
        type: 'string', 
        description: 'Width of right column (CSS value)',
        default: '50%'
      },
      gap: {
        type: 'string',
        description: 'Gap between columns (CSS value)',
        default: '2rem'
      },
      verticalAlign: {
        type: 'string',
        description: 'Vertical alignment of columns',
        enum: ['top', 'center', 'bottom'],
        default: 'top'
      }
    }
  },
  tokensUsed: [
    '--title-color',
    '--title-size',
    '--background-color',
    '--text-color',
    '--column-gap'
  ]
})
export class TwoColSlide extends CoolslidesElement {
  static observedAttributes = ['title', 'left-width', 'right-width', 'gap', 'vertical-align'];

  @property({ type: String, reflect: true })
  title = '';

  @property({ type: String, attribute: 'left-width', reflect: true })
  leftWidth = '50%';

  @property({ type: String, attribute: 'right-width', reflect: true })
  rightWidth = '50%';

  @property({ type: String, reflect: true })
  gap = '2rem';

  @property({ type: String, attribute: 'vertical-align', reflect: true })
  verticalAlign = 'top';

  constructor() {
    super();
    this.useTokens([
      '--title-color',
      '--title-size',
      '--background-color', 
      '--text-color',
      '--column-gap'
    ]);
  }

  protected update(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100vh;
          padding: var(--slide-padding, 2rem);
          background: var(--background-color, #ffffff);
          color: var(--text-color, #000000);
          font-family: var(--font-family, system-ui, sans-serif);
          box-sizing: border-box;
        }

        .container {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: var(--content-max-width, 100%);
          margin: 0 auto;
        }

        .title {
          font-size: var(--title-size, 2.5rem);
          font-weight: var(--title-weight, 600);
          color: var(--title-color, var(--text-color, #000000));
          margin: 0 0 2rem 0;
          line-height: var(--title-line-height, 1.2);
        }

        .title:empty {
          display: none;
          margin: 0;
        }

        .columns {
          display: flex;
          flex: 1;
          gap: var(--column-gap, ${this.gap});
          align-items: ${this.getAlignItemsValue()};
        }

        .column-left {
          flex: 0 0 ${this.leftWidth};
          min-width: 0;
        }

        .column-right {
          flex: 0 0 ${this.rightWidth};
          min-width: 0;
        }

        ::slotted(*) {
          margin-top: 0;
        }

        ::slotted(*:last-child) {
          margin-bottom: 0;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          :host {
            padding: var(--slide-padding-mobile, 1rem);
          }

          .title {
            font-size: var(--title-size-mobile, 2rem);
            margin-bottom: 1.5rem;
          }

          .columns {
            flex-direction: column;
            gap: var(--column-gap-mobile, 1.5rem);
          }

          .column-left,
          .column-right {
            flex: 1 1 auto;
          }
        }

        /* Print support */
        @media print {
          :host {
            page-break-inside: avoid;
            min-height: auto;
          }
        }
      </style>
      
      <div class="container">
        ${this.title ? `<h1 class="title">${this.escapeHtml(this.title)}</h1>` : ''}
        
        <div class="columns">
          <div class="column-left">
            <slot name="left"></slot>
          </div>
          
          <div class="column-right">
            <slot name="right"></slot>
          </div>
        </div>
      </div>
    `;
  }

  private getAlignItemsValue(): string {
    switch (this.verticalAlign) {
      case 'center': return 'center';
      case 'bottom': return 'flex-end';
      default: return 'flex-start';
    }
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
    // Pause any animations in slotted content
    this.querySelectorAll('[data-pauseable]').forEach(element => {
      if ('pause' in element && typeof element.pause === 'function') {
        element.pause();
      }
    });
  }

  resume(): void {
    // Resume any animations in slotted content
    this.querySelectorAll('[data-pauseable]').forEach(element => {
      if ('resume' in element && typeof element.resume === 'function') {
        element.resume();
      }
    });
  }

  teardown(): void {
    // Clean up any resources in slotted content
    this.querySelectorAll('[data-teardown]').forEach(element => {
      if ('teardown' in element && typeof element.teardown === 'function') {
        element.teardown();
      }
    });
  }

  static async prefetch(props: Record<string, any>): Promise<void> {
    // Pre-warm any assets if needed
    console.log('Prefetching TwoColSlide with props:', props);
  }
}

// Auto-register the component
if (!customElements.get('cs-two-col-slide')) {
  customElements.define('cs-two-col-slide', TwoColSlide);
}