/**
 * Math Plugin (lightweight)
 *
 * Processes $...$ (inline) and $$...$$ (block) sequences after slide render.
 * If window.katex is present, uses katex.render; otherwise wraps content for styling.
 */

type Ctx = {
  bus: any;
};

function renderInline(el: HTMLElement, expr: string) {
  const katex = (window as any).katex;
  if (katex && typeof katex.render === 'function') {
    try { katex.render(expr, el, { throwOnError: false, displayMode: false }); return; } catch {}
  }
  el.innerHTML = `<span class="math-inline">${escapeHtml(expr)}</span>`;
}

function renderBlock(el: HTMLElement, expr: string) {
  const katex = (window as any).katex;
  if (katex && typeof katex.render === 'function') {
    try { katex.render(expr, el, { throwOnError: false, displayMode: true }); return; } catch {}
  }
  el.innerHTML = `<div class="math-block">${escapeHtml(expr)}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function processMathIn(node: Element) {
  // Convert text nodes with $...$ or $$...$$ into math elements
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const toReplace: Array<{ text: Text, frag: DocumentFragment }> = [];

  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const val = text.nodeValue || '';
    if (!val.includes('$')) continue;
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < val.length) {
      if (val[i] === '$') {
        const isBlock = i + 1 < val.length && val[i+1] === '$';
        const delim = isBlock ? '$$' : '$';
        const start = i + delim.length;
        const end = val.indexOf(delim, start);
        if (end > start) {
          const expr = val.slice(start, end);
          const span = document.createElement(isBlock ? 'div' : 'span');
          if (isBlock) span.className = 'math-block'; else span.className = 'math-inline';
          if (isBlock) renderBlock(span, expr.trim()); else renderInline(span, expr.trim());
          frag.appendChild(span);
          i = end + delim.length;
          continue;
        }
      }
      // regular text chunk until next $
      const next = val.indexOf('$', i);
      const end = next === -1 ? val.length : next;
      frag.appendChild(document.createTextNode(val.slice(i, end)));
      i = end;
    }
    toReplace.push({ text, frag });
  }

  for (const { text, frag } of toReplace) {
    if (text.parentNode) text.parentNode.replaceChild(frag, text);
  }
}

function injectDefaultStyles() {
  if (document.getElementById('coolslides-math-styles')) return;
  const style = document.createElement('style');
  style.id = 'coolslides-math-styles';
  style.textContent = `.math-inline { font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace); padding: 0 2px; background: rgba(0,0,0,.05); border-radius: 3px; }
.math-block { font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace); padding: 8px 10px; background: rgba(0,0,0,.04); border-radius: 4px; margin: 6px 0; display: block; }`;
  document.head.appendChild(style);
}

export default {
  name: '@coolslides/plugins-math',
  capabilities: [],
  init(ctx: Ctx) {
    injectDefaultStyles();
    // Process current and future slides
    const handle = ({ slideId }: { slideId: string }) => {
      const root = document.querySelector(`[data-slide="${slideId}"]`);
      if (root) processMathIn(root);
    };
    ctx.bus.on('slide:enter', handle);
    // Also process any slide already in DOM on init
    document.querySelectorAll('[data-slide]').forEach(el => processMathIn(el));
  }
};

