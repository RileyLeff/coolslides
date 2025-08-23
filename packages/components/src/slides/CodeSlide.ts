/**
 * CodeSlide Component
 * A slide for displaying syntax-highlighted code
 */

import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'CodeSlide',
  version: '1.0.0',
  tag: 'cs-code-slide',
  schema: {
    type: 'object',
    required: ['code'],
    properties: {
      title: {
        type: 'string',
        description: 'Optional slide title'
      },
      code: {
        type: 'string',
        description: 'Code content to highlight'
      },
      language: {
        type: 'string',
        description: 'Programming language for syntax highlighting',
        default: 'javascript'
      },
      theme: {
        type: 'string',
        description: 'Syntax highlighting theme',
        enum: ['github', 'monokai', 'solarized-dark', 'solarized-light', 'vs-code'],
        default: 'github'
      },
      lineNumbers: {
        type: 'boolean',
        description: 'Show line numbers',
        default: true
      },
      highlightLines: {
        type: 'string',
        description: 'Comma-separated line numbers to highlight (e.g., "1,3-5,8")'
      },
      fontSize: {
        type: 'string',
        description: 'Font size for code',
        default: 'medium'
      },
      maxHeight: {
        type: 'string',
        description: 'Maximum height of code block'
      }
    }
  },
  tokensUsed: [
    '--title-color',
    '--title-size',
    '--background-color',
    '--code-font-family',
    '--code-font-size',
    '--code-line-height',
    '--code-background',
    '--code-border-radius'
  ],
  capabilities: ['network.fetch'] // For loading syntax highlighting assets
})
export class CodeSlide extends CoolslidesElement {
  static observedAttributes = [
    'title', 'code', 'language', 'theme', 'line-numbers', 
    'highlight-lines', 'font-size', 'max-height'
  ];

  @property({ type: String, reflect: true })
  title = '';

  @property({ type: String, reflect: true })
  code = '';

  @property({ type: String, reflect: true })
  language = 'javascript';

  @property({ type: String, reflect: true })
  theme = 'github';

  @property({ type: Boolean, attribute: 'line-numbers', reflect: true })
  lineNumbers = true;

  @property({ type: String, attribute: 'highlight-lines', reflect: true })
  highlightLines = '';

  @property({ type: String, attribute: 'font-size', reflect: true })
  fontSize = 'medium';

  @property({ type: String, attribute: 'max-height', reflect: true })
  maxHeight = '';

  private highlighter: SyntaxHighlighter | null = null;

  constructor() {
    super();
    this.useTokens([
      '--title-color',
      '--title-size',
      '--background-color',
      '--code-font-family',
      '--code-font-size', 
      '--code-line-height',
      '--code-background',
      '--code-border-radius'
    ]);
  }

  async connectedCallback(): void {
    super.connectedCallback();
    
    // Initialize syntax highlighter
    this.highlighter = new SyntaxHighlighter();
    await this.highlighter.initialize();
    
    this.requestUpdate();
  }

  protected async update(): Promise<void> {
    if (!this.shadowRoot || !this.highlighter) return;

    // Highlight the code
    const highlightedCode = await this.highlighter.highlight(
      this.code,
      this.language,
      {
        theme: this.theme,
        lineNumbers: this.lineNumbers,
        highlightLines: this.parseHighlightLines(this.highlightLines)
      }
    );

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

        .code-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--code-background, #f8f9fa);
          border-radius: var(--code-border-radius, 8px);
          overflow: hidden;
          border: 1px solid var(--color-gray-200, #e9ecef);
          ${this.maxHeight ? `max-height: ${this.maxHeight};` : ''}
        }

        .code-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: var(--color-gray-100, #f1f3f4);
          border-bottom: 1px solid var(--color-gray-200, #e9ecef);
          font-size: 0.875rem;
          color: var(--text-secondary, #666666);
        }

        .language-label {
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .code-content {
          flex: 1;
          overflow: auto;
          font-family: var(--code-font-family, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace);
          font-size: var(--code-font-size, ${this.getFontSize()});
          line-height: var(--code-line-height, 1.5);
        }

        .code-content pre {
          margin: 0;
          padding: 1rem;
          overflow: visible;
        }

        .code-content code {
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          background: none;
          padding: 0;
        }

        /* Line number styles */
        .line-numbers {
          display: table;
          width: 100%;
        }

        .line-numbers .line {
          display: table-row;
        }

        .line-numbers .line-number {
          display: table-cell;
          user-select: none;
          padding-right: 1rem;
          text-align: right;
          color: var(--text-muted, #888888);
          font-variant-numeric: tabular-nums;
          border-right: 1px solid var(--color-gray-200, #e9ecef);
        }

        .line-numbers .line-content {
          display: table-cell;
          padding-left: 1rem;
          width: 100%;
        }

        /* Highlighted line styles */
        .line.highlighted {
          background: var(--accent-color, #007acc);
          color: white;
        }

        .line.highlighted .line-number {
          background: var(--accent-color, #007acc);
          color: white;
          border-right-color: rgba(255, 255, 255, 0.3);
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

          .code-content {
            font-size: calc(var(--code-font-size, 1rem) * 0.875);
          }

          .line-numbers .line-number {
            padding-right: 0.5rem;
          }

          .line-numbers .line-content {
            padding-left: 0.5rem;
          }
        }

        /* Print support */
        @media print {
          .code-container {
            border: 1px solid #000;
          }

          .code-content {
            font-size: 10pt !important;
          }
        }

        /* Syntax theme styles */
        ${this.getThemeStyles()}
      </style>
      
      <div class="container">
        ${this.title ? `<h1 class="title">${this.escapeHtml(this.title)}</h1>` : ''}
        
        <div class="code-container">
          <div class="code-header">
            <span class="language-label">${this.language}</span>
            <span>${this.code.split('\\n').length} lines</span>
          </div>
          
          <div class="code-content">
            <pre><code>${highlightedCode}</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  private parseHighlightLines(highlightLines: string): number[] {
    if (!highlightLines.trim()) return [];

    const lines: number[] = [];
    const parts = highlightLines.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        // Range like "3-5"
        const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            lines.push(i);
          }
        }
      } else {
        // Single line like "1"
        const line = parseInt(trimmed, 10);
        if (!isNaN(line)) {
          lines.push(line);
        }
      }
    }

    return lines;
  }

  private getFontSize(): string {
    const sizes = {
      small: '0.875rem',
      medium: '1rem', 
      large: '1.125rem',
      'x-large': '1.25rem'
    };
    return sizes[this.fontSize as keyof typeof sizes] || sizes.medium;
  }

  private getThemeStyles(): string {
    // Basic theme styles - in a real implementation, these would be comprehensive
    switch (this.theme) {
      case 'monokai':
        return `
          .code-content { background: #272822; color: #f8f8f2; }
          .code-header { background: #3e3d32; color: #a6e22e; }
        `;
      case 'solarized-dark':
        return `
          .code-content { background: #002b36; color: #839496; }
          .code-header { background: #073642; color: #586e75; }
        `;
      case 'solarized-light':
        return `
          .code-content { background: #fdf6e3; color: #657b83; }
          .code-header { background: #eee8d5; color: #93a1a1; }
        `;
      case 'vs-code':
        return `
          .code-content { background: #1e1e1e; color: #d4d4d4; }
          .code-header { background: #2d2d30; color: #cccccc; }
        `;
      default: // github
        return `
          .code-content { background: #f8f9fa; color: #24292e; }
          .code-header { background: #f1f3f4; color: #586069; }
        `;
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
    // Pause any animations if needed
  }

  resume(): void {
    // Resume any animations if needed
  }

  teardown(): void {
    this.highlighter?.dispose();
  }

  static async prefetch(props: Record<string, any>): Promise<void> {
    // Pre-warm syntax highlighting assets
    const highlighter = new SyntaxHighlighter();
    await highlighter.initialize();
    highlighter.dispose();
    
    console.log('Prefetched CodeSlide with props:', props);
  }
}

// Simple syntax highlighter implementation
class SyntaxHighlighter {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // In a real implementation, this would load syntax highlighting libraries
    // For now, we'll use a simple client-side highlighter
    this.initialized = true;
  }

  async highlight(
    code: string, 
    language: string, 
    options: {
      theme?: string;
      lineNumbers?: boolean;
      highlightLines?: number[];
    } = {}
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Simple syntax highlighting - in production, use a library like Prism.js or highlight.js
    let highlightedCode = this.basicSyntaxHighlight(code, language);

    if (options.lineNumbers) {
      highlightedCode = this.addLineNumbers(highlightedCode, options.highlightLines || []);
    }

    return highlightedCode;
  }

  private basicSyntaxHighlight(code: string, language: string): string {
    // Very basic syntax highlighting patterns
    let highlighted = this.escapeHtml(code);

    switch (language.toLowerCase()) {
      case 'javascript':
      case 'typescript':
      case 'js':
      case 'ts':
        highlighted = highlighted
          .replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|from|default)\b/g, 
            '<span class="keyword">$1</span>')
          .replace(/'([^']*?)'/g, '<span class="string">\'$1\'</span>')
          .replace(/"([^"]*?)"/g, '<span class="string">"$1"</span>')
          .replace(/\/\/.*$/gm, '<span class="comment">$&</span>')
          .replace(/\/\*[\s\S]*?\*\//g, '<span class="comment">$&</span>');
        break;
      
      case 'python':
      case 'py':
        highlighted = highlighted
          .replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|yield|async|await)\b/g, 
            '<span class="keyword">$1</span>')
          .replace(/'([^']*?)'/g, '<span class="string">\'$1\'</span>')
          .replace(/"([^"]*?)"/g, '<span class="string">"$1"</span>')
          .replace(/#.*$/gm, '<span class="comment">$&</span>');
        break;

      case 'rust':
      case 'rs':
        highlighted = highlighted
          .replace(/\b(fn|let|mut|const|struct|enum|impl|trait|if|else|match|for|while|loop|return|use|mod|pub|crate)\b/g, 
            '<span class="keyword">$1</span>')
          .replace(/'([^']*?)'/g, '<span class="string">\'$1\'</span>')
          .replace(/"([^"]*?)"/g, '<span class="string">"$1"</span>')
          .replace(/\/\/.*$/gm, '<span class="comment">$&</span>')
          .replace(/\/\*[\s\S]*?\*\//g, '<span class="comment">$&</span>');
        break;

      default:
        // Generic highlighting
        highlighted = highlighted
          .replace(/'([^']*?)'/g, '<span class="string">\'$1\'</span>')
          .replace(/"([^"]*?)"/g, '<span class="string">"$1"</span>');
    }

    return highlighted;
  }

  private addLineNumbers(code: string, highlightLines: number[]): string {
    const lines = code.split('\\n');
    const numberedLines = lines.map((line, index) => {
      const lineNumber = index + 1;
      const isHighlighted = highlightLines.includes(lineNumber);
      const highlightClass = isHighlighted ? ' highlighted' : '';
      
      return `<div class="line${highlightClass}">
        <span class="line-number">${lineNumber}</span>
        <span class="line-content">${line}</span>
      </div>`;
    });

    return `<div class="line-numbers">${numberedLines.join('')}</div>`;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  dispose(): void {
    this.initialized = false;
  }
}

// Auto-register the component
if (!customElements.get('cs-code-slide')) {
  customElements.define('cs-code-slide', CodeSlide);
}