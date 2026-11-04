import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { EVENTS } from '../src/data/events.js';
import { CARDS, upgradeDiff } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { POTIONS } from '../src/data/potions.js';
import { RUNES } from '../src/data/runes.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';
import { setSeed, withIsolatedRandom } from '../src/core/random.js';

installFakePhaser();
const { EventScene } = await import('../src/scenes/EventScene.js');
const { RestScene } = await import('../src/scenes/RestScene.js');
const { ShopScene } = await import('../src/scenes/ShopScene.js');
const engine = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
function engineWrap(name, nextName) {
  const start = engine.indexOf(`${name}:function(`);
  const end = engine.indexOf(`,${nextName}:function(`, start);
  assert.ok(start >= 0 && end > start, `bundled ${name} is available`);
  return Function(`return (${engine.slice(start + name.length + 1, end)});`)();
}
const advanced = engineWrap('advancedWordWrap', 'basicWordWrap');
const basic = engineWrap('basicWordWrap', 'getWrappedText');
const compact = value => String(value).replace(/\s/g, '');
const widthOf = (value, size) => [...String(value)].reduce((sum, ch) => sum + size * (ch.charCodeAt(0) < 128 ? 0.6 : 1), 0);

// Real scene methods and the bundled Phaser wrapping algorithms, with portable
// CJK em-square text metrics. This checks geometry, not browser-rendered pixels.
function fixture(scene, lineHeight = 1.3) {
  const view = fakeScene(scene), panels = [], rules = [];
  const addText = scene.add.text;
  scene.add.text = (x, y, value, style) => {
    const node = addText(x, y, value, style);
    node.style = style;
    node.originX = 0; node.originY = 0;
    node.setOrigin = function (x = 0.5, y = x) { this.originX = x; this.originY = y; return this; };
    node.setText = function (value) {
      this.text = String(value);
      const size = parseFloat(this.style.fontSize), wrap = this.style.wordWrap;
      const output = wrap?.width ? (wrap.useAdvancedWrap ? advanced : basic).call(
        { splitRegExp: /\r\n|\r|\n/, letterSpacing: 0 }, this.text,
        { measureText: text => ({ width: widthOf(text, size) }) }, wrap.width) : this.text;
      this.lines = output.split(/\r\n|\r|\n/);
      this.width = Math.max(...this.lines.map(line => widthOf(line, size)));
      this.height = this.lines.length * size * lineHeight + (this.lines.length - 1) * (style.lineSpacing || 0);
      return this;
    };
    node.setText(value);
    return node;
  };
  const addGraphics = scene.add.graphics;
  scene.add.graphics = (...args) => {
    const node = addGraphics(...args);
    node.fillRoundedRect = (x, y, w, h) => { panels.push({ x, y, w, h }); return node; };
    node.lineBetween = (x1, y1, x2, y2) => { rules.push({ x1, y1, x2, y2 }); return node; };
    return node;
  };
  return { scene, view, panels, rules };
}
function assertWrapped(node, label) {
  assert.ok(node, `${label}: text exists`);
  assert.equal(node.style.wordWrap?.useAdvancedWrap, true, `${label}: Chinese wrapping is enabled`);
  assert.ok(node.width <= node.style.wordWrap.width + 0.001, `${label}: text exceeds its column`);
  assert.equal(compact(node.lines.join('')), compact(node.text), `${label}: all content is retained`);
}
const topOf = node => node.y - node.height * node.originY;
const bottomOf = node => topOf(node) + node.height;
function withState(callback) {
  const old = { storage: globalThis.localStorage, run: { ...run }, save: save.data, sfx: audio.sfx };
  return withIsolatedRandom(() => {
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    audio.sfx = () => {};
    try { return callback(); }
    finally {
      globalThis.localStorage = old.storage;
      Object.assign(run, old.run);
      save.data = old.save;
      audio.sfx = old.sfx;
    }
  });
}
function resetRun(seed, profile) {
  save.load(); setSeed(seed); run.newRun();
  if (profile === 'rich') run.player.gold = 10000;
  if (profile === 'lethal') run.player.hp = 1;
}

test('all event bodies wrap fully without colliding with options or their footer', () => {
  for (const lineHeight of [1, 1.3]) for (const event of EVENTS) {
    const { scene, view } = fixture(new EventScene(), lineHeight);
    scene.ev = event;
    scene.buildBody({ index: 0 });
    const body = view.objects.find(node => node.text === event.text);
    assertWrapped(body, event.id);
    assert.ok(bottomOf(body) + 40 <= scene.optY, `${event.id}: body collides with choices`);
    const buttons = scene.optionNodes.filter(node => node?.zone);
    assert.equal(buttons.length, event.options.length);
    const lastBottom = buttons.at(-1).y + 64;
    assert.ok(lastBottom + 10 <= topOf(scene.footNote), `${event.id}: choices collide with footer`);
    assert.ok(bottomOf(scene.footNote) < 760, `${event.id}: footer leaves the event panel`);
  }
});

test('real event outcomes including lethal costs fit before the continue prompt', () => withState(() => {
  let checked = 0;
  for (const lineHeight of [1.3]) for (const event of EVENTS) for (const option of event.options) {
    for (const profile of ['normal', 'rich', 'lethal']) {
      resetRun(173 + checked, profile);
      const { scene, view, rules } = fixture(new EventScene(), lineHeight);
      scene.ev = event; scene._chosen = false;
      scene.buildBody({ index: 0 });
      const previous = new Set(view.objects);
      scene.choose(option);
      view.flushTimers(240);
      const result = view.objects.find(node => !previous.has(node) && node.type === 'Text' && node.style.wordWrap);
      const hint = view.objects.find(node => node.text === '— 点击继续行卷 —' || node.text === '— 点击，回到卷外 —');
      const label = `${event.id}/${option.label}/${profile}`;
      assertWrapped(result, label);
      assert.ok(bottomOf(result) + 20 <= topOf(hint), `${label}: result collides with continue prompt`);
      assert.ok(rules.at(-1).y1 + 10 <= topOf(hint), `${label}: divider collides with continue prompt`);
      checked++;
    }
  }
  assert.equal(checked, EVENTS.reduce((sum, event) => sum + event.options.length, 0) * 3);
}));

test('all current rest upgrade and rune result messages fit inside the result panel', () => {
  const messages = ['气力回复，伤口收拢。\n气血 78 / 78'];
  for (const [id, def] of Object.entries(CARDS)) {
    const differences = upgradeDiff({ id, def, up: false });
    const line = differences.map(value => `${value.label} ${value.from} → ${value.to}`).join('、');
    messages.push(`「${def.name}」${line ? line + '。' : ''}\n笔画重写，锋芒更盛。`);
  }
  for (const rune of Object.values(RUNES)) messages.push(`朱笔落下，「${rune.full}」二字没入纸背。\n${rune.desc}`);
  for (const lineHeight of [1, 1.3]) for (const message of messages) {
    const { scene, view, panels } = fixture(new RestScene(), lineHeight);
    scene.showResult(message);
    const body = view.objects.find(node => node.text === message), panel = panels[0];
    assertWrapped(body, message);
    assert.ok(topOf(body) >= panel.y + 12 && bottomOf(body) <= panel.y + panel.h - 12, 'rest result stays in panel');
  }
});

test('every shop relic and potion description fits between its name and purchase area', () => {
  const items = [
    ...Object.keys(RELICS).map(id => ({ kind: 'relic', id, price: 128 })),
    ...Object.keys(POTIONS).map(id => ({ kind: 'potion', id, price: 32 })),
    { kind: 'remove', price: 68 }
  ];
  for (const lineHeight of [1, 1.3]) for (const item of items) {
    const { scene, view } = fixture(new ShopScene(), lineHeight);
    scene.renderItem({ ...item }, 300, 220, 224, 314);
    const desc = view.objects.find(node => node.type === 'Text' && node.style.wordWrap);
    const name = view.objects.find(node => node.type === 'Text' && node.y === 390);
    assertWrapped(desc, item.id || item.kind);
    assert.ok(bottomOf(name) + 4 <= topOf(desc), `${item.id}: name collides with description`);
    assert.ok(bottomOf(desc) < 634, `${item.id}: description collides with purchase area`);
  }
});
