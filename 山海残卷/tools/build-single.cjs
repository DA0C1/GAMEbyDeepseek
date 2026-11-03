'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const escapeScript = (value) => value.replace(/<\/script/gi, '<\\/script');

async function build() {
  const ai = process.argv.includes('--ai');
  const entry = ai ? 'src/testing/ai-entry.js' : 'src/main.js';
  const embedded = {};
  for (const [folder, extension, mime] of [['art', '.webp', 'image/webp'], ['audio', '.mp3', 'audio/mpeg']]) {
    for (const name of await fs.readdir(path.join(root, 'assets', folder))) {
      if (!name.endsWith(extension)) continue;
      const bytes = await fs.readFile(path.join(root, 'assets', folder, name));
      embedded[`assets/${folder}/${name}`] = `data:${mime};base64,${bytes.toString('base64')}`;
    }
  }
  const result = await esbuild.build({
    entryPoints: [path.join(root, entry)], bundle: true, format: 'iife', write: false,
    plugins: [{
      name: 'embed-game-assets',
      setup(build) {
        build.onLoad({ filter: /[\\/]core[\\/]assets\.js$/ }, async (args) => ({
          contents: `const EMBEDDED = ${JSON.stringify(embedded)};\n` + (await fs.readFile(args.path, 'utf8'))
            .replace('return `assets/art/${key}.webp`;', 'return EMBEDDED[`assets/art/${key}.webp`];')
            .replace('return `assets/audio/${key}.mp3`;', 'return EMBEDDED[`assets/audio/${key}.mp3`];'),
          loader: 'js'
        }));
      }
    }]
  });
  let html = await fs.readFile(path.join(root, ai ? 'ai-test.html' : 'index.html'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="css/style.css">', `<style>${await fs.readFile(path.join(root, 'css/style.css'), 'utf8')}</style>`);
  html = html.replace('<script src="vendor/phaser.min.js"></script>', () => `<script>${escapeScript(require('node:fs').readFileSync(path.join(root, 'vendor/phaser.min.js'), 'utf8'))}</script>`);
  html = html.replace(`<script type="module" src="${entry}"></script>`, () => `<script>${escapeScript(result.outputFiles[0].text)}</script>`);
  const output = path.join(root, 'dist', ai ? '山海残卷_AI测试版.html' : '山海残卷_单文件版.html');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
  console.log(output);
}

build().catch((error) => { console.error(error); process.exitCode = 1; });
