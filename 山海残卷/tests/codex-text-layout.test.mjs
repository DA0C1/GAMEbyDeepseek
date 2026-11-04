import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { ARCHIVE } from '../src/data/story.js';

installFakePhaser();
const { CodexScene } = await import('../src/scenes/CodexScene.js');
const engine = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
// Execute the actual bundled implementation, not a convenient replacement for
// Phaser's behavior. These two methods depend only on measureText and `this`.
function engineWrap(name, nextName) {
  const start = engine.indexOf(`${name}:function(`);
  assert.ok(start >= 0, `bundled ${name} found`);
  const end = engine.indexOf(`,${nextName}:function(`, start);
  assert.ok(end > start, `end of bundled ${name} found`);
  return Function(`return (${engine.slice(start + name.length + 1, end)});`)();
}
const advanced = engineWrap('advancedWordWrap', 'basicWordWrap');
const basic = engineWrap('basicWordWrap', 'getWrappedText');
const entries = ARCHIVE.flatMap(section => section.items.map(def => ({
  id: def.id, def, section: section.section, known: true
})));

// Portable CJK em-square metrics: full-width/CJK characters take one em;
// ASCII takes 0.6 em. Vertical bounds reserve 1.25 em per line, plus the
// requested line spacing. This is a conservative geometry check, not pixels.
function measure(value, size) {
  return [...value].reduce((width, character) => width + size * (character.charCodeAt(0) < 128 ? 0.6 : 1), 0);
}
function layout(text, forceBasic = false) {
  const size = parseFloat(text.style.fontSize);
  const width = text.style.wordWrap?.width;
  assert.ok(width > 0, 'text must declare its available width');
  const fn = !forceBasic && text.style.wordWrap.useAdvancedWrap ? advanced : basic;
  const output = fn.call({ splitRegExp: /\r\n|\r|\n/, letterSpacing: 0 }, text.text,
    { measureText: value => ({ width: measure(value, size) }) }, width);
  const lines = output.split(/\r\n|\r|\n/);
  return { output, lines, width: Math.max(...lines.map(line => measure(line, size))),
    height: lines.length * size * 1.25 + (lines.length - 1) * (text.style.lineSpacing || 0) };
}
const withoutWhitespace = value => value.replace(/\s/g, '');

function sceneWithTextStyles() {
  const scene = new CodexScene(), view = fakeScene(scene), panels = [];
  const addText = scene.add.text;
  scene.add.text = (...args) => {
    const text = addText(...args);
    text.style = args[3];
    return text;
  };
  const addGraphics = scene.add.graphics;
  scene.add.graphics = (...args) => {
    const graphics = addGraphics(...args);
    graphics.fillRoundedRect = (x, y, w, h) => { panels.push({ x, y, w, h }); return graphics; };
    return graphics;
  };
  scene.init();
  return { scene, view, panels };
}

function archiveBody(entry) {
  const fixture = sceneWithTextStyles();
  fixture.scene.showArchive(entry);
  const body = fixture.scene._detail.list.find(object => object.type === 'Text' && object.text === entry.def.text);
  assert.ok(body, `real body for ${entry.id}`);
  return { ...fixture, body };
}

test('bundled basic wrapping reproduces original archive clipping for both long character biographies', () => {
  for (const id of ['fig_shi', 'fig_beiying']) {
    const { body } = archiveBody(entries.find(entry => entry.id === id));
    const original = layout(body, true);
    assert.ok(original.width > body.style.wordWrap.width, `${id} baseline exceeds body width`);
    assert.ok(body.x + original.width > 1600, `${id} baseline clips beyond viewport`);
    assert.equal(withoutWhitespace(original.output), withoutWhitespace(body.text));
  }
});

test('every archive preview preserves its text and stays inside its own column', () => {
  entries.forEach((entry, index) => {
    const { scene, view } = sceneWithTextStyles();
    const col = index % 3, row = Math.floor((index % 9) / 3);
    const cellW = 1408 / 3, cellH = 566 / 3;
    const cx = 96 + col * cellW + cellW / 2, cy = 216 + row * cellH;
    scene.drawArchiveCell(entry, cx, cy, cellW, cellH);
    const expected = entry.def.text.replace(/\n+/g, ' ').slice(0, 46) + '……';
    const preview = view.objects.find(object => object.type === 'Text' && object.text === expected);
    assert.ok(preview, `real preview for ${entry.id}`);
    const bounds = layout(preview);
    assert.equal(withoutWhitespace(bounds.output), withoutWhitespace(expected), entry.id);
    assert.ok(bounds.width <= preview.style.wordWrap.width + 0.001, `${entry.id}: preview exceeds declared wrap width`);
    const nextTextStart = preview.x + cellW;
    assert.ok(preview.x + bounds.width < nextTextStart, `${entry.id}: overlaps adjacent column`);
    assert.ok(preview.y + bounds.height <= cy + cellH - 8, `${entry.id}: preview exceeds cell bottom`);
  });
});

test('all archive detail bodies preserve complete content and fit their panel', () => {
  assert.equal(entries.length, 22, 'cover every current archive entry');
  for (const entry of entries) {
    const { body, panels } = archiveBody(entry);
    const panel = panels[0], bounds = layout(body);
    assert.equal(withoutWhitespace(bounds.output), withoutWhitespace(entry.def.text), entry.id);
    assert.ok(bounds.width <= body.style.wordWrap.width + 0.001, `${entry.id}: body exceeds wrap width`);
    assert.ok(body.x + bounds.width <= panel.x + panel.w - 12, `${entry.id}: body exceeds panel right edge`);
    assert.ok(body.y + bounds.height <= panel.y + panel.h - 12,
      `${entry.id}: body bottom ${body.y + bounds.height} exceeds panel bottom ${panel.y + panel.h - 12}`);
  }
});
