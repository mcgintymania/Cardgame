// Builds the web app into ONE self-contained HTML file (dist/card-club.html)
// for previewing as a Claude artifact. React loads from cdnjs; everything else
// (app code, engine, CSS) is inlined.
//
// When the project moves to GitHub this script is replaced by a normal Vite build.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REACT_VERSION = '18.3.1';
// --inline-react: bundle React into the file too, so it works with no internet (the version to download and share).
const INLINE = process.argv.includes('--inline-react');

// Map bare React imports to the UMD globals loaded from the CDN.
const reactGlobals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (args) => ({ path: args.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, (args) => ({
      contents: args.path.startsWith('react-dom') ? 'module.exports = window.ReactDOM' : 'module.exports = window.React',
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: [resolve(root, 'apps/web/src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  write: false,
  plugins: INLINE ? [] : [reactGlobals],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(root, 'apps/web/src/design/styles.css'), 'utf8');

const html = `<title>Card Club</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#16110e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Limelight&family=Barlow+Semi+Condensed:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap">
<style>
${css}
</style>
<div id="root"><div class="boot">Shuffling…</div></div>
${INLINE ? '' : `<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT_VERSION}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT_VERSION}/umd/react-dom.production.min.js"></script>`}
<script>
${js}
</script>
`;

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = INLINE ? 'dist/card-club.test.html' : 'dist/card-club.html';
writeFileSync(resolve(root, out), INLINE ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${html}` : html);
console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB`);
