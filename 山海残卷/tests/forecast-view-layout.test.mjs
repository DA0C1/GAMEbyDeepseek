import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { random, setSeed } from '../src/core/random.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
let storageWrites = 0;
globalThis.localStorage = { getItem: () => null, setItem() { storageWrites++; } };
afterEach(() => setSeed(null));

const centers = [830, 1110, 1380];
const card = id => ({ id, def: CARDS[id], up: false });

function widthOf(text, size) {
  return [...text].reduce((width, ch) => width + size * (
    /\s/u.test(ch) ? 0.28 : /[\u2e80-\uffff]/u.test(ch) ? 1 : /[0-9]/.test(ch) ? 0.56 : 0.6
  ), 0);
}

// A bounded test-local substitute for Phaser's advanced word wrapping. It
// measures CJK glyphs as full ems and Latin/spacing proportionally, including
// character wrapping for an overlong word. It does not render browser pixels.
function measuredLines(text, size, wrap) {
  if (!wrap?.width) return text.split('\n');
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (let word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, size) <= wrap.width) { line = next; continue; }
      if (line) { lines.push(line); line = ''; }
      if (wrap.useAdvancedWrap) {
        let part = '';
        for (const ch of word) {
          if (part && widthOf(part + ch, size) > wrap.width) { lines.push(part); part = ''; }
          part += ch;
        }
        word = part;
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

function measuredScene(battle, fontHeightScale = 1.2) {
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  const makeText = scene.add.text, makeGraphics = scene.add.graphics;
  scene.add.text = (x, y, value, style = {}) => {
    const object = makeText(x, y, String(value), style);
    object.style = style;
    object.fontSize = Number.parseFloat(style.fontSize) || 16;
    object.lines = measuredLines(object.text, object.fontSize, style.wordWrap);
    object.width = Math.max(...object.lines.map(line => widthOf(line, object.fontSize)));
    object.height = object.lines.length * object.fontSize * fontHeightScale +
      Math.max(0, object.lines.length - 1) * (style.lineSpacing || 0);
    object.originX = 0; object.originY = 0;
    object.setOrigin = function (x, y = x) { this.originX = x; this.originY = y; return this; };
    object.setPosition = function (x, y = x) { this.x = x; this.y = y; return this; };
    object.setY = function (y) { this.y = y; return this; };
    return object;
  };
  scene.add.graphics = (...args) => {
    const object = makeGraphics(...args);
    object.rects = [];
    object.clear = function () { this.rects = []; return this; };
    object.fillRoundedRect = function (x, y, width, height) {
      this.rects.push({ x, y, width, height }); return this;
    };
    return object;
  };
  scene.battle = battle;
  scene.enemyViews = battle.enemies.map((foe, i) => ({ foe, x: centers[i], y: 420, displayH: 300 }));
  return { scene, view };
}

function bounds(text) {
  return {
    left: text.x - text.width * text.originX,
    right: text.x + text.width * (1 - text.originX),
    top: text.y - text.height * text.originY,
    bottom: text.y + text.height * (1 - text.originY)
  };
}

function panels(scene) {
  return scene.dmgPreview.filter(object => object.type === 'Graphics').map(object => {
    assert.equal(object.rects.length, 1, 'a resized panel clears the previous backing rectangle');
    return object.rects[0];
  });
}

function checkPanels(scene) {
  const plates = panels(scene);
  assert.equal(plates.length, 3);
  for (const [i, plate] of plates.entries()) {
    assert.equal(plate.width, 228, 'each forecast owns a bounded panel');
    assert.equal(plate.x + plate.width / 2, centers[i]);
    if (i) assert.ok(plate.x - (plates[i - 1].x + plates[i - 1].width) >= 42,
      'neighboring three-enemy panels retain at least 42px separation');
    const texts = scene.dmgPreview.filter(object => object.type === 'Text' && object.x === centers[i]);
    const subtitle = texts.find(object => object.fontSize === 13);
    const main = texts.find(object => object.fontSize >= 34);
    assert.ok(main, 'damage number remains visible');
    const mainBox = bounds(main);
    assert.ok(mainBox.left >= plate.x && mainBox.right <= plate.x + plate.width &&
      mainBox.top >= plate.y + 8 - 1e-6 && mainBox.bottom <= plate.y + plate.height - 8 + 1e-6,
    'the measured damage number remains inside the plate');
    if (!subtitle) continue;
    assert.equal(subtitle.style.wordWrap?.width, 208);
    assert.equal(subtitle.style.wordWrap?.useAdvancedWrap, true);
    assert.equal(subtitle.originX, 0.5);
    assert.equal(subtitle.originY, 0);
    assert.ok(subtitle.width <= 208, 'measured wrapping stays within this foe’s panel');
    assert.equal(subtitle.lines.join(' ').replace(/\s/g, ''), subtitle.text.replace(/\s/g, ''),
      'wrapping preserves every qualifier');
    const box = bounds(subtitle);
    assert.ok(box.left >= plate.x + 10 && box.right <= plate.x + plate.width - 10,
      'subtitle retains horizontal panel padding');
    assert.ok(box.top >= plate.y && box.bottom <= plate.y + plate.height - 8,
      'the whole measured subtitle height fits inside its panel');
    assert.ok(box.top >= mainBox.bottom + 4 - 1e-6, 'subtitle leaves a gap below the measured number');
  }
  return plates;
}

function forecastFixture(previews) {
  const enemies = previews.map(() => ({ alive: true }));
  return { phase: 'player', enemies, previewDamage: (_card, enemy) => previews[enemies.indexOf(enemy)] };
}

test('dense qualifiers wrap within separate panels at the tightest three-enemy spacing', () => {
  const previews = [
    { total: 123, effective: 100, blocked: 23, uncertain: true, randomTarget: true,
      hits: 12, per: 10, damageByHit: [10, 13], element: { rel: -1, el: 'jin', foeEl: 'huo' },
      surge: { dmg: 0, el: 'huo', conf: { name: '火' } } },
    { total: 120, effective: 91, blocked: 29, hits: 12, per: 10, damageByHit: [10, 10],
      playerDefeated: true, element: { rel: -1, el: 'jin', foeEl: 'huo' },
      surge: { dmg: 0, el: 'shui', conf: { name: '水' } } },
    { total: 100, effective: 90, blocked: 10, uncertain: true, hits: 10, per: 10,
      damageByHit: [10, 10], element: { rel: 1, el: 'jin', foeEl: 'mu' },
      surge: { dmg: 0, el: 'jin', conf: { name: '金' } } }
  ];
  for (const heightScale of [1, 1.2]) {
    const { scene } = measuredScene(forecastFixture(previews), heightScale);
    const before = JSON.stringify(previews);
    scene.showDamagePreview(card('wulei'));
    checkPanels(scene);
    const subtitles = scene.dmgPreview.filter(object => object.fontSize === 13);
    assert.ok(subtitles.every(object => object.lines.length > 1), 'the fixture exercises real line wrapping');
    assert.match(subtitles[0].text, /随机分配 · 示例/);
    assert.match(subtitles[1].text, /自损 \/ 反噬致败/);
    assert.match(subtitles[2].text, /可能闪避 · 示例/);
    assert.match(subtitles[2].text, /金群伤/);
    assert.equal(JSON.stringify(previews), before, 'display never edits forecast data');
  }
});

test('short and absent qualifiers retain compact panels and repeated previews clean up old objects', () => {
  const previews = [
    { total: 6, hits: 1, blocked: 0 },
    { total: 12, hits: 2, per: 6, damageByHit: [6, 6], blocked: 0 },
    { total: 5, hits: 1, blocked: 0, pureOnly: true, surge: { dmg: 5 } }
  ];
  const { scene } = measuredScene(forecastFixture(previews));
  scene.showDamagePreview(card('cijian'));
  const plates = checkPanels(scene);
  const firstMain = scene.dmgPreview.find(object => object.type === 'Text' && object.x === centers[0]);
  assert.ok(plates[0].height <= firstMain.height + 28,
    'a number-only forecast grows only enough for measured font height and padding');
  const subtitles = scene.dmgPreview.filter(object => object.fontSize === 13);
  assert.equal(subtitles.length, 2);
  assert.ok(subtitles.every(object => object.lines.length === 1));
  assert.ok(plates[1].height < 110 && plates[2].height < 110, 'one-line qualifiers remain compact');
  const oldObjects = scene.dmgPreview.slice();
  scene.showDamagePreview(card('cijian'));
  assert.ok(oldObjects.every(object => object.destroyed), 'redraw destroys the previous preview');
  checkPanels(scene);
  scene.hideDamagePreview();
  assert.deepEqual(scene.dmgPreview, []);
});

test('real battle forecasts preserve combat state, save data, identities and seeded randomness when drawn', () => {
  save.load();
  setSeed(42);
  const player = run.newRun();
  const battle = new Battle(player, [{ id: 'huan' }, { id: 'zheng' }, { id: 'shanxiao' }]);
  battle.start(); battle.update(1);
  const value = card('wulei');
  battle.hand = [value];
  battle.player.energy = 10;
  battle.player.hp = battle.player.maxHp = 100;
  battle.player.buffs = { str: 2, comboDmg: 5 };
  battle.enemies.forEach(enemy => { enemy.hp = enemy.maxHp = 100; enemy.block = 9; });
  const { scene } = measuredScene(battle);
  let callbacks = 0;
  battle.on('damage', () => callbacks++).on('cardPlayed', () => callbacks++);
  const before = JSON.stringify(battle), saved = JSON.stringify(save.data), writesBefore = storageWrites;
  const hand = battle.hand, buffs = battle.player.buffs, enemies = battle.enemies.slice();
  setSeed(20261104); const expected = random(); setSeed(20261104);
  scene.showDamagePreview(value);
  checkPanels(scene);
  assert.equal(random(), expected);
  assert.equal(JSON.stringify(battle), before);
  assert.equal(JSON.stringify(save.data), saved);
  assert.equal(storageWrites, writesBefore);
  assert.equal(callbacks, 0);
  assert.equal(battle.hand, hand);
  assert.equal(battle.player.buffs, buffs);
  battle.enemies.forEach((enemy, i) => assert.equal(enemy, enemies[i]));
});
