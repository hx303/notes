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
                src: "https://cdn.jsdelivr.net/npm/smiles-drawer@2.3.0/dist/smiles-drawer.min.js",
                loadTime: "afterDOMReady",
                contentType: "external",
              },
              {
                script: `
(function() {
  if (typeof SmilesDrawer === 'undefined') return;
  var opts = { width: 300, height: 200, bondThickness: 2, bondLength: 20, shortBondLength: 0.8, terminalCarbons: true, explicitHydrogens: false, compactDrawing: false, fontSize: 14, overlapSensitivity: 0.42, spacingFactor: 1.2 };
  var drawer = new SmilesDrawer.Drawer(opts);
  document.querySelectorAll('pre code.language-smiles').forEach(function(block) {
    var text = block.textContent.trim();
    if (!text) return;
    var lines = text.split('\\n').filter(function(l) { return l.trim() && !l.trim().startsWith('#'); });
    if (lines.length === 0) return;
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:12px 0;';
    lines.forEach(function(smi, i) {
      var canvas = document.createElement('canvas');
      canvas.width = 300; canvas.height = 200;
      canvas.title = smi.trim();
      container.appendChild(canvas);
      try {
        SmilesDrawer.parse(smi.trim(), function(tree) {
          if (tree) drawer.draw(tree, canvas, 'light', false);
          else { canvas.style.display = 'none'; }
        });
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
