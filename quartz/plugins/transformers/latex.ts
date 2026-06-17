import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeMathjax from "rehype-mathjax/svg"
import { QuartzTransformerPlugin } from "../types"
import { KatexOptions } from "katex"
import { Options as MathjaxOptions } from "rehype-mathjax/svg"
import "katex/contrib/mhchem"

interface Options {
  renderEngine: "katex" | "mathjax"
  customMacros: MacroType
  katexOptions: Omit<KatexOptions, "macros" | "output">
  mathJaxOptions: Omit<MathjaxOptions, "macros">
}

// mathjax macros
export type Args = boolean | number | string | null
interface MacroType {
  [key: string]: string | Args[]
}

export const Latex: QuartzTransformerPlugin<Partial<Options>> = (opts) => {
  const engine = opts?.renderEngine ?? "katex"
  const macros = opts?.customMacros ?? {}
  return {
    name: "Latex",
    markdownPlugins() {
      return [remarkMath]
    },
    htmlPlugins() {
      switch (engine) {
        case "katex": {
          return [[rehypeKatex, { output: "html", macros, ...(opts?.katexOptions ?? {}) }]]
        }
        default:
        case "mathjax": {
          return [
            [
              rehypeMathjax,
              {
                ...(opts?.mathJaxOptions ?? {}),
                tex: {
                  ...(opts?.mathJaxOptions?.tex ?? {}),
                  macros,
                },
              },
            ],
          ]
        }
      }
    },
    externalResources() {
      switch (engine) {
        case "katex":
          return {
            css: [
              { content: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" },
              { content: "https://cdn.jsdelivr.net/npm/smiles-drawer@2.0.4/dist/smiles-drawer.min.css" },
            ],
            js: [
              {
                src: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/copy-tex.min.js",
                loadTime: "afterDOMReady",
                contentType: "external",
              },
              {
                src: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js",
                loadTime: "afterDOMReady",
                contentType: "external",
              },
              {
                src: "https://cdn.jsdelivr.net/npm/smiles-drawer@2.0.4/dist/smiles-drawer.min.js",
                loadTime: "afterDOMReady",
                contentType: "external",
              },
              {
                content: `
(function() {
  if (typeof SmilesDrawer === 'undefined') return;
  document.querySelectorAll('pre code.language-smiles').forEach(function(block) {
    var text = block.textContent.trim();
    if (!text || text.startsWith('#')) return;
    // Split by line, filter comments
    var lines = text.split('\\n').filter(function(l) { return l.trim() && !l.trim().startsWith('#'); });
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:12px 0;';
    lines.forEach(function(smi) {
      var canvas = document.createElement('canvas');
      canvas.width = 300; canvas.height = 200;
      container.appendChild(canvas);
      try {
        SmilesDrawer.draw({ width: 300, height: 200, bondThickness: 2, bondLength: 20, shortBondLength: 15 }, smi.trim(), canvas, 'light');
      } catch(e) { canvas.style.display = 'none'; }
    });
    block.parentElement.replaceWith(container);
  });
})();
`,
                loadTime: "afterDOMReady",
                contentType: "inline",
              },
            ],
          }
      }
    },
  }
}
