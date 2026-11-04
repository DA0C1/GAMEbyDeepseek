'use strict';
// Complements (does not replace) the real-browser portable smoke test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const assets = [];
for (const [folder, extension, mime] of [['art', '.webp', 'image/webp'], ['audio', '.mp3', 'audio/mpeg']]) {
  for (const filename of fs.readdirSync(path.join(root, 'assets', folder))) {
    if (!filename.endsWith(extension)) continue;
    assets.push({ name: filename, data: `data:${mime};base64,${fs.readFileSync(path.join(root, 'assets', folder, filename)).toString('base64')}` });
  }
}
for (const ai of [false, true]) {
  const filename = ai ? '山海残卷_AI测试版.html' : '山海残卷_单文件版.html';
  const html = fs.readFileSync(path.join(root, 'dist', filename), 'utf8');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, filename + ': no external script tags');
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["']/i, filename + ': no external stylesheets');
  assert.match(html, /<style>/, filename + ': styles embedded');
  for (const asset of assets) assert.ok(html.includes(asset.data), filename + ': exact embedded bytes for ' + asset.name);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2, filename + ': engine and game scripts present');
  scripts.forEach((match, index) => new vm.Script(match[1], { filename: filename + ':script-' + index }));
  assert.equal(html.includes('window.__aiTest ='), ai, filename + ': AI interface isolated to test edition');
  console.log(`PASS static ${ai ? 'AI' : 'normal'} portable: ${assets.length} exact assets, inline styles/scripts, JavaScript syntax`);
}
console.log('Static checks do not verify browser rendering, audio decoding, or gameplay. Run npm run test:portable in a supported browser environment.');
