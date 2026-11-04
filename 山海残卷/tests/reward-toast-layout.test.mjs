import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { POTIONS } from '../src/data/potions.js';
import { W, H } from '../src/core/config.js';

installFakePhaser();
const { RewardScene } = await import('../src/scenes/RewardScene.js');
const { BattleScene } = await import('../src/scenes/BattleScene.js');
const engine = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
// Run the actual bundled wrapping functions without starting a browser. Only
// font measurement and vertical metrics are portable CJK geometry substitutes.
function engineWrap(name, nextName) {
  const start = engine.indexOf(`${name}:function(`);
  const end = engine.indexOf(`,${nextName}:function(`, start);
  assert.ok(start >= 0 && end > start, `bundled ${name} found`);
  return Function(`return (${engine.slice(start + name.length + 1, end)});`)();
}
const advanced = engineWrap('advancedWordWrap', 'basicWordWrap');
const basic = engineWrap('basicWordWrap', 'getWrappedText');
function measureWidth(value, size) {
  return [...value].reduce((width, ch) => width + size * (
    /\s/u.test(ch) ? 0.28 : /[\u2e80-\uffff]/u.test(ch) ? 1 : /[0-9]/.test(ch) ? 0.56 : 0.6
  ), 0);
}
function textLayout(value, style, heightScale, forceBasic = false) {
  const size = Number.parseFloat(style.fontSize), wrap = style.wordWrap;
  let output = value;
  if (wrap?.width) {
    const fn = !forceBasic && wrap.useAdvancedWrap ? advanced : basic;
    output = fn.call({ splitRegExp: /\r\n|\r|\n/, letterSpacing: 0 }, value,
      { measureText: text => ({ width: measureWidth(text, size) }) }, wrap.width);
  }
  const lines = output.split(/\r\n|\r|\n/);
  return { lines, output, width: Math.max(...lines.map(line => measureWidth(line, size))),
    height: lines.length * size * heightScale + Math.max(0, lines.length - 1) * (style.lineSpacing || 0) };
}
function measuredRendering(scene, heightScale) {
  const view = fakeScene(scene);
  const makeText = scene.add.text, makeGraphics = scene.add.graphics;
  scene.add.text = (x, y, value, style) => {
    const text = makeText(x, y, value, style);
    text.style = style;
    Object.assign(text, textLayout(value, style, heightScale));
    text.originX = 0; text.originY = 0;
    text.setOrigin = function (x, y = x) { this.originX = x; this.originY = y; return this; };
    return text;
  };
  scene.add.graphics = (...args) => {
    const graphics = makeGraphics(...args);
    graphics.rects = [];
    graphics.fillRoundedRect = function (x, y, width, height) {
      this.rects.push({ x, y, width, height }); return this;
    };
    return graphics;
  };
  return view;
}
function fixture(id, heightScale) {
  const scene = new RewardScene();
  scene.init({ potion: id });
  const view = measuredRendering(scene, heightScale);
  scene.showPotionDrop();
  const toast = view.objects.find(object => object.type === 'Container');
  const panel = toast?.list.find(object => object.type === 'Graphics')?.rects[0];
  const name = toast?.list.find(object => object.text === POTIONS[id].name);
  const description = toast?.list.find(object => object.text === POTIONS[id].desc);
  return { scene, view, toast, panel, name, description };
}
const withoutWhitespace = value => value.replace(/\s/g, '');

test('wumo reproduces original basic-wrap width and fixed-height toast overflow', () => {
  const value = POTIONS.wumo.desc;
  const style = { fontSize: '12px', wordWrap: { width: 268, useAdvancedWrap: true } };
  const oldLayout = textLayout(value, style, 1, true);
  assert.ok(oldLayout.width > 268, 'basic wrapping cannot split the long Chinese clause');
  const correctedWrap = textLayout(value, style, 1);
  assert.equal(correctedWrap.lines.length, 2);
  assert.ok(8 + correctedWrap.height > 26,
    'even a one-em font overflows the original y=8 description / y=26 panel bottom');
  assert.equal(withoutWhitespace(correctedWrap.output), withoutWhitespace(value));
});

test('all potion reward toasts fit complete wrapped text with measured padding and no name overlap', () => {
  assert.equal(Object.keys(POTIONS).length, 10, 'all current potions are covered');
  for (const heightScale of [1, 1.3]) {
    for (const [id, def] of Object.entries(POTIONS)) {
      const before = JSON.stringify(def);
      const { toast, panel, name, description, view } = fixture(id, heightScale);
      const label = `${id}, font height ${heightScale}em`;
      assert.ok(toast && panel && name && description, `${label}: real toast content exists`);
      assert.equal(description.style.wordWrap.useAdvancedWrap, true);
      assert.equal(description.style.wordWrap.width, 268);
      assert.equal(withoutWhitespace(description.output), withoutWhitespace(def.desc), `${label}: full text retained`);
      assert.ok(description.width <= 268, `${label}: wrapped description stays within available width`);
      assert.ok(description.y >= name.y + name.height + 4 - 1e-6, `${label}: measured name/body gap`);
      for (const text of [name, description]) {
        assert.ok(text.x >= panel.x + 10 && text.x + text.width <= panel.x + panel.width - 10,
          `${label}: text has horizontal panel padding`);
        assert.ok(text.y >= panel.y + 10 && text.y + text.height <= panel.y + panel.height - 10 + 1e-6,
          `${label}: complete measured text has vertical panel padding`);
      }
      assert.equal(panel.width, 340);
      assert.equal(toast.x, W / 2);
      assert.equal(JSON.stringify(def), before, `${label}: display does not mutate potion data`);
      const entrance = view.tweens.find(tween => tween.targets === toast);
      assert.equal(entrance.y, 618);
      assert.equal(entrance.duration, 420);
      view.completeTweens(420);
      const fade = view.tweens.find(tween => tween.targets === toast && tween.duration === 500);
      assert.ok(fade, 'existing fade is still scheduled');
      assert.equal(fade.delay, 2600);
      // Check initial, settled and exiting positions, not only the static anchor.
      for (const y of [toast.y, entrance.y, fade.y]) {
        assert.ok(toast.x + panel.x >= 0 && toast.x + panel.x + panel.width <= W);
        assert.ok(y + panel.y >= 0 && y + panel.y + panel.height <= H);
        assert.ok(y + panel.y > 566, `${label}: toast stays below reward cards`);
        assert.ok(y + panel.y + panel.height <= H - 110 - 20,
          `${label}: toast keeps at least 20px clearance above the skip button`);
      }
      view.completeTweens(500);
      assert.ok(toast.destroyed, `${label}: fade completion removes the toast`);
    }
  }
});

test('wumo reproduces the original fixed-height battle tooltip overflow', () => {
  const style = { fontSize: '13px', lineSpacing: 4, wordWrap: { width: 268, useAdvancedWrap: true } };
  const body = textLayout(POTIONS.wumo.desc, style, 1.3);
  assert.equal(body.lines.length, 2);
  assert.ok(40 + body.height > 72, 'two measured lines exceed the original 72px tooltip');
});

test('all battle potion tooltips contain measured text and replace previous tooltips cleanly', () => {
  for (const heightScale of [1, 1.3]) {
    const scene = new BattleScene();
    scene.init({});
    measuredRendering(scene, heightScale);
    let previous = null;
    for (const [id, def] of Object.entries(POTIONS)) {
      for (const x of [438, 502, 566, W - 40]) {
        const before = JSON.stringify(def), label = `${id} at x=${x}, font height ${heightScale}em`;
        scene.showPotionTip(x, 104, def);
        if (previous) assert.ok(previous.destroyed, `${label}: previous tooltip is removed`);
        const tip = scene.potionTip;
        const panel = tip.list.find(object => object.type === 'Graphics')?.rects[0];
        const name = tip.list.find(object => object.text === def.name);
        const description = tip.list.find(object => object.text === def.desc);
        assert.ok(panel && name && description, `${label}: real tooltip content exists`);
        assert.equal(panel.width, 300);
        assert.equal(description.style.wordWrap.useAdvancedWrap, true);
        assert.equal(description.style.wordWrap.width, 268);
        assert.equal(withoutWhitespace(description.output), withoutWhitespace(def.desc));
        assert.ok(description.width <= 268);
        assert.ok(description.y >= name.y + name.height + 4 - 1e-6, `${label}: measured name/body gap`);
        for (const text of [name, description]) {
          assert.ok(text.x >= panel.x + 12 && text.x + text.width <= panel.x + panel.width - 12,
            `${label}: text keeps horizontal padding`);
          assert.ok(text.y >= panel.y + 12 && text.y + text.height <= panel.y + panel.height - 12 + 1e-6,
            `${label}: measured text keeps vertical padding`);
        }
        assert.ok(panel.x >= 0 && panel.x + panel.width <= W - 20, `${label}: right-edge clamp remains effective`);
        assert.ok(panel.y >= 0 && panel.y + panel.height <= H, `${label}: tooltip remains inside viewport`);
        assert.equal(JSON.stringify(def), before, `${label}: display does not mutate potion data`);
        previous = tip;
      }
    }
    scene.hidePotionTip();
    assert.ok(previous.destroyed);
    assert.equal(scene.potionTip, null);
  }
});
