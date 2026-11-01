// Builds the web app into ONE self-contained HTML file (dist/card-club.html)
// for previewing as a Claude artifact. React loads from cdnjs; everything else
// (app code, engine, CSS) is inlined.
//
// When the project moves to GitHub this script is replaced by a normal Vite build.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REACT_VERSION = '18.3.1';
// --inline-react: bundle React into the file too, so it works with no internet (the version to download and share).
// --site: the website / installable app (GitHub Pages): React inlined, plus the
// manifest, icons and offline support, written to site/.
const SITE = process.argv.includes('--site');
const INLINE = SITE || process.argv.includes('--inline-react');
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const VERSION = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;

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
  define: { 'process.env.NODE_ENV': '"production"', __SITE__: String(SITE), __VERSION__: JSON.stringify(VERSION) },
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(root, 'apps/web/src/design/styles.css'), 'utf8');

const siteHead = SITE ? `
<meta name="description" content="Take 2, Hold'em, Hearts, Gin Rummy and more: play the club's members, or your friends and family online.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Card Club">
<meta name="cardclub-version" content="${VERSION}">` : '';

const html = `<title>Card Club</title>${siteHead}
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

if (SITE) {
  const dir = resolve(root, 'site');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(resolve(root, 'apps/web/public'), dir, { recursive: true });
  writeFileSync(resolve(dir, 'sw.js'), readFileSync(resolve(root, 'apps/web/public/sw.js'), 'utf8').replaceAll('__VERSION__', VERSION));
  writeFileSync(resolve(dir, 'index.html'), `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${html}`);
  writeFileSync(resolve(dir, '.nojekyll'), '');
  console.log(`site/ (version ${VERSION})  index.html ${(html.length / 1024).toFixed(1)} KB`);
  process.exit(0);
}

mkdirSync(resolve(root, 'dist'), { recursive: true });
const out = INLINE ? 'dist/card-club.test.html' : 'dist/card-club.html';
writeFileSync(resolve(root, out), INLINE ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${html}` : html);
console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB`);
