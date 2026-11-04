import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { flash, EL_HEX } from '../src/core/fx.js';
import { W, H, DEPTH } from '../src/core/config.js';

// Execute the actual vendored converter and its Color dependencies, without
// booting Phaser's DOM/renderer. A permissive fake converter hid the original bug.
const vendor = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
const modules = new Map();
function vendorRequire(id) {
  if (modules.has(id)) return modules.get(id).exports;
  const key = [...vendor.matchAll(/(?:\{|,)(\d+(?:e\d+)?):/g)].find(match => Number(match[1]) === id)?.[1];
  const source = key && vendor.match(new RegExp(`(?:\\{|,)${key}:(.*?)(?=,\\d+(?:e\\d+)?:)`, 's'))?.[1];
  assert.ok(source, `vendored Phaser module ${id} exists`);
  const module = { exports: {} };
  modules.set(id, module);
  vm.runInNewContext(`(${source})`)(module, module.exports, vendorRequire);
  return module.exports;
}
const HexStringToColor = vendorRequire(70238);

function sceneHarness() {
  const rectangles = [], tweens = [];
  let cameraReads = 0;
  const scene = {
    add: {
      rectangle(x, y, width, height, fillColor, fillAlpha) {
        const object = {
          x, y, width, height, fillColor, fillAlpha, alpha: 1, destroyed: false,
          setScrollFactor(value) { this.scrollFactor = value; return this; },
          setDepth(value) { this.depth = value; return this; },
          setAlpha(value) { this.alpha = value; return this; },
          destroy() { this.destroyed = true; }
        };
        rectangles.push(object);
        return object;
      }
    },
    tweens: { add(config) { tweens.push(config); } },
    get cameras() {
      cameraReads++;
      throw new Error('flash must not access or mutate native camera effects');
    }
  };
  return { scene, rectangles, tweens, get cameraReads() { return cameraReads; } };
}

function withPhaser(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Phaser');
  globalThis.Phaser = { Display: { Color: { HexStringToColor } } };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Phaser', previous);
    else delete globalThis.Phaser;
  });
}

test('vendored HexStringToColor rejects numbers, so numeric surge colors must bypass it', t => {
  withPhaser(t);
  assert.throws(() => HexStringToColor(EL_HEX.huo), /replace/);
  assert.equal(Object.keys(EL_HEX).length, 5);
  for (const [element, color] of Object.entries(EL_HEX)) {
    const h = sceneHarness();
    const veil = flash(h.scene, color, 0.16, 240);
    assert.ok(veil, `${element} must create a visible flash instead of silently catching a converter error`);
    assert.equal(h.rectangles.length, 1);
    assert.equal(veil.fillColor, color);
    assert.equal(veil.fillAlpha * veil.alpha, 0.16);
    assert.equal(h.cameraReads, 0);
    assert.deepEqual([veil.x, veil.y, veil.width, veil.height], [W / 2, H / 2, W, H]);
    assert.equal(veil.scrollFactor, 0);
    assert.ok(veil.depth > DEPTH.hud);
    assert.ok(veil.depth < DEPTH.overlay - 4, 'surge blot and glyph remain above the flash');
    assert.equal(h.tweens.length, 1);
    const tween = h.tweens[0];
    assert.equal(tween.targets, veil);
    assert.equal(tween.alpha, 0);
    assert.equal(tween.duration, 240);
    assert.equal(veil.destroyed, false);
    tween.onComplete();
    assert.equal(veil.destroyed, true);
  }
});

test('flash accepts string colors with the actual Phaser parser', t => {
  withPhaser(t);
  for (const [input, expected] of [['#b23a2e', EL_HEX.huo], ['0x2f6b8a', EL_HEX.shui], ['#abc', 0xaabbcc]]) {
    const h = sceneHarness();
    assert.equal(flash(h.scene, input).fillColor, expected);
    assert.equal(h.cameraReads, 0);
  }
});

test('flash defaults and alpha limits preserve translucency without changing camera effects', t => {
  withPhaser(t);
  const defaults = sceneHarness();
  const veil = flash(defaults.scene);
  assert.equal(veil.fillColor, 0xb23a2e);
  assert.equal(veil.alpha, 0.3);
  assert.equal(defaults.tweens[0].duration, 220);
  for (const [input, expected] of [[2, 1], [NaN, 0.3], [Infinity, 0.3]]) {
    const h = sceneHarness();
    assert.equal(flash(h.scene, EL_HEX.mu, input).alpha, expected);
    assert.equal(h.cameraReads, 0);
  }
  for (const input of [0, -0.5]) {
    const h = sceneHarness();
    assert.equal(flash(h.scene, EL_HEX.mu, input), null);
    assert.equal(h.rectangles.length, 0);
    assert.equal(h.tweens.length, 0);
    assert.equal(h.cameraReads, 0);
  }
});
