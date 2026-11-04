import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle, BUFFS } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { FOES, traitTags } from '../src/data/enemies.js';
import { RELICS, RELIC_SETS } from '../src/data/relics.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { setSeed, withIsolatedRandom } from '../src/core/random.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
const engine = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
const start = engine.indexOf('advancedWordWrap:function(');
const end = engine.indexOf(',basicWordWrap:function(', start);
assert.ok(start >= 0 && end > start);
const wrap = Function(`return (${engine.slice(start + 'advancedWordWrap:'.length, end)});`)();
const widthOf = (value, size) => [...String(value)].reduce((width, ch) => width + size * (ch.charCodeAt(0) < 128 ? 0.6 : 1), 0);

function isolated(callback) {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const old = { data: save.data, ok: save.ok, run: { ...run } };
  return withIsolatedRandom(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
      value: { getItem: () => null, setItem() {} } });
    try { save.load(); setSeed(0); run.newRun(); return callback(); }
    finally {
      if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
      else delete globalThis.localStorage;
      save.data = old.data; save.ok = old.ok; Object.assign(run, old.run);
    }
  });
}

// Display primitives only: actual HUD construction, status iteration and potion
// zones run unchanged. Em-square metrics are geometry checks, not visual QA.
function renderHud(battle, fontHeight = 1.3) {
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  scene.battle = battle;
  const addGraphics = scene.add.graphics;
  scene.add.graphics = (...args) => {
    const node = addGraphics(...args); node.rects = [];
    node.clear = function () { this.rects = []; return this; };
    node.fillRoundedRect = function (x, y, w, h) { this.rects.push({ x, y, w, h }); return this; };
    for (const method of ['fillEllipse', 'strokeEllipse']) node[method] = function () { return this; };
    return node;
  };
  const addText = scene.add.text;
  scene.add.text = (x, y, value, style) => {
    const node = addText(x, y, value, style); node.style = style;
    node.originX = node.originY = 0;
    node.setOrigin = function (x = 0.5, y = x) { this.originX = x; this.originY = y; return this; };
    node.setStroke = function () { return this; };
    node.setText = function (text) {
      this.text = String(text);
      const size = parseFloat(style.fontSize), wrapping = style.wordWrap;
      this.wrapped = wrapping?.width ? wrap.call({ splitRegExp: /\r\n|\r|\n/, letterSpacing: 0 }, this.text,
        { measureText: value => ({ width: widthOf(value, size) }) }, wrapping.width) : this.text;
      const lines = this.wrapped.split(/\r\n|\r|\n/);
      this.width = Math.max(...lines.map(line => widthOf(line, size)));
      this.height = lines.length * size * fontHeight + (lines.length - 1) * (style.lineSpacing || 0);
      return this;
    };
    node.setText(value); return node;
  };
  const addZone = scene.add.zone;
  scene.add.zone = (x, y, w, h) => {
    const node = addZone(x, y, w, h); node.width = w; node.height = h; return node;
  };
  scene.buildPlayerHud();
  scene.drawPotions();
  return { scene, view };
}
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function verifyLayout(scene, expected) {
  const panel = scene.hudPanel.rects[0];
  assert.ok(panel && panel.x === 54 && panel.w === 356, 'original HUD horizontal bounds stay unchanged');
  const icons = scene.buffLayer.list.filter(node => node.type === 'Graphics').map(node => ({
    ...node.rects[0], x: node.rects[0].x + scene.buffLayer.x, y: node.rects[0].y + scene.buffLayer.y
  }));
  assert.equal(icons.length, expected, 'every active known status is visible');
  const rows = new Map();
  for (const icon of icons) {
    assert.equal(icon.w, 30); assert.equal(icon.h, 30);
    assert.ok(icon.x >= panel.x + 12 && icon.x + icon.w <= panel.x + panel.w - 12, 'status stays inside HUD width');
    assert.ok(icon.y >= panel.y && icon.y + icon.h <= panel.y + panel.h - 12, 'status stays inside HUD height');
    rows.set(icon.y, (rows.get(icon.y) || 0) + 1);
  }
  assert.ok([...rows.values()].every(count => count <= 9), 'at most nine icons per row');
  assert.equal(rows.size, Math.ceil(expected / 9));
  for (let i = 0; i < icons.length; i++) for (let j = i + 1; j < icons.length; j++) {
    assert.equal(intersects(icons[i], icons[j]), false, 'status cells do not overlap');
  }
  const potionZones = scene.potionLayer.list.filter(node => node.type === 'Zone');
  for (const zone of potionZones) for (const icon of icons) {
    assert.equal(intersects(icon, { x: zone.x, y: zone.y, w: zone.width, h: zone.height }), false,
      'status icons must not cover a usable potion');
  }
  if (scene.hudSetT) {
    const label = scene.hudSetT;
    assert.equal(label.style.wordWrap.useAdvancedWrap, true);
    assert.equal(label.style.wordWrap.width, 312);
    assert.ok(label.width <= 312);
    assert.equal(label.wrapped.replace(/\s/g, ''), label.text.replace(/\s/g, ''));
    for (const set of Object.keys(scene.battle.activeSets)) assert.ok(label.text.includes(RELIC_SETS[set].name));
    const buffBottom = Math.max(scene.buffLayer.y + 30, ...icons.map(icon => icon.y + icon.h));
    assert.ok(label.y >= buffBottom + 14, 'resonance text follows the actual buff rows');
    assert.ok(label.y + label.height <= panel.y + panel.h - 12 + 1e-6, 'complete resonance text fits the panel');
  }
  return { panel, icons };
}

test('zero, nine, ten and all statuses fit without covering potions or six-set resonance text', () => isolated(() => {
  const keys = Object.keys(BUFFS);
  assert.equal(keys.length, 17, 'all current visible status kinds are covered');
  for (const fontHeight of [1, 1.3]) for (const allSets of [false, true]) for (const count of [0, 9, 10, keys.length]) {
    run.newRun(); run.player.relics = allSets ? Object.keys(RELICS) : [];
    run.player.potions = ['huichun', 'dali', 'huxin'];
    const battle = new Battle(run.player, [{ id: 'zhulong' }]);
    run.player.buffs = Object.fromEntries(keys.slice(0, count).map((key, i) => [key, i + 1]));
    const before = JSON.stringify(run.player);
    const { scene } = renderHud(battle, fontHeight);
    verifyLayout(scene, count);
    assert.equal(JSON.stringify(run.player), before, 'layout does not mutate game state');
  }
}));

test('buff removal destroys old icons and shrinks the HUD back to its minimum', () => isolated(() => {
  run.player.potions = ['huichun'];
  const battle = new Battle(run.player, [{ id: 'zhulong' }]);
  run.player.buffs = Object.fromEntries(Object.keys(BUFFS).map(key => [key, 3]));
  const { scene } = renderHud(battle);
  const original = [...scene.buffLayer.list], expanded = verifyLayout(scene, 17).panel.h;
  run.player.buffs = { str: 2, weak: 0, poison: -1, unknown: 4 };
  scene.drawPlayerBuffs();
  assert.ok(original.every(node => node.destroyed), 'old status graphics, icons and counters are destroyed');
  const reduced = verifyLayout(scene, 1).panel.h;
  assert.ok(reduced < expanded);
  assert.equal(reduced, 146);
  const remaining = [...scene.buffLayer.list];
  run.player.buffs = {};
  scene.drawPlayerBuffs();
  assert.ok(remaining.every(node => node.destroyed));
  verifyLayout(scene, 0);
  assert.equal(scene.hudPanel.rects[0].h, 146);
}));

test('a legal turn-one card sequence reaches eleven buffs while keeping a usable potion clear', () => isolated(() => {
  const ids = ['jianyu', 'duwu', 'jingji', 'taiji', 'jijing', 'xushi', 'xuemuo', 'shouxin', 'qianji',
    'shengji', 'yeyou', 'tianming', ...Array(5).fill('ningshen'), ...Array(2).fill('tongxuan')];
  run.player.deck = ids.map(id => ({ id, def: CARDS[id], up: true }));
  for (const id of ['fuzhidai', 'ruyi', 'modou', 'yinxin', 'jiuqiao', 'wuxing']) run.grantRelic(id);
  run.player.potions = ['juling', 'juling', 'huichun'];
  const battle = new Battle(run.player, [{ id: 'zhulong' }]);
  battle.start(); battle.update(1);
  assert.equal(battle.usePotion(0), true); assert.equal(battle.usePotion(0), true);
  for (const id of ['ningshen', 'ningshen', 'jianyu', 'ningshen', 'jijing', 'jingji', 'tongxuan', 'ningshen',
    'tongxuan', 'yeyou', 'ningshen', 'shouxin', 'qianji', 'xushi', 'xuemuo', 'shengji', 'taiji']) {
    const card = battle.hand.find(card => card.id === id);
    assert.ok(card, `${id} was genuinely drawn`);
    assert.equal(battle.canPlay(card), true, `${id} has sufficient energy`);
    assert.equal(battle.playCard(card, null), true);
  }
  assert.equal(battle.turn, 1); assert.equal(battle.phase, 'player');
  assert.equal(run.player.hp, 64); assert.equal(run.player.energy, 12);
  assert.equal(battle.enemies[0].alive, true);
  assert.deepEqual(run.player.potions, ['huichun']);
  const { scene } = renderHud(battle);
  verifyLayout(scene, 11);
  assert.equal(scene.potionLayer.list.filter(node => node.type === 'Zone').length, 1);
}));

test('the weak-immunity trait uses the same human-readable language as other immunity tags', () => {
  assert.deepEqual(traitTags(FOES.lu), ['免疫虚弱']);
  assert.ok(traitTags(FOES.bifang).includes('免疫火'));
  assert.ok(traitTags(FOES.xiangliu).includes('免疫毒'));
});
