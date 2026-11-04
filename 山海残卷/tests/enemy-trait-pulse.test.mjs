import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });

// Expose webpack's lazy module loader instead of invoking Phaser's browser/game
// entry. All tween building, start-value capture, interpolation and yoyo updates
// below execute the actual vendored engine, without a DOM or browser.
const vendor = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
const builderId = Number(vendor.match(/\bTweenBuilder:i\((\d+)\)/)?.[1]);
assert.ok(builderId);
const lazyVendor = vendor.replace(/i\(\d+\)\}\)\(\)\)\);\s*$/, 'i})()));');
assert.notEqual(lazyVendor, vendor);
const sandbox = { module: { exports: {} }, exports: {} };
runInNewContext(lazyVendor, sandbox);
const buildTween = sandbox.module.exports(builderId);

function actualTweenManager() {
  const active = new Set(), records = [];
  const manager = {
    timeScale: 1,
    add(config) {
      const tween = buildTween(manager, config);
      tween.reset();
      active.add(tween); records.push({ config, tween });
      return tween;
    },
    remove(tween) { active.delete(tween); },
    killTweensOf(target) {
      const targets = Array.isArray(target) ? target : [target];
      for (const tween of [...active]) {
        if (targets.some(item => tween.hasTarget(item))) { active.delete(tween); tween.destroy(); }
      }
    },
    advance(delta) {
      for (const tween of [...active]) {
        if (!active.has(tween)) continue;
        if (tween.update(delta)) { active.delete(tween); tween.destroy(); }
      }
    },
    finish(milliseconds) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += 10) manager.advance(Math.min(10, milliseconds - elapsed));
    },
    active, records
  };
  return manager;
}
function size(key) {
  const bytes = readFileSync(new URL(`../assets/art/${key}.webp`, import.meta.url));
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
  return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
}
function fixture() {
  const scene = new BattleScene(); scene.init({ type: 'boss' }); fakeScene(scene);
  const manager = actualTweenManager(); scene.tweens = manager;
  const battle = new Battle(run.player, [{ id: 'zhulong' }], { boss: true }); battle.start(); scene.battle = battle;
  for (const name of ['updateEnemyTraits', 'updateEnemyIntents', 'refreshEnemyBars']) scene[name] = () => {};
  scene.textures.get = key => ({ getSourceImage: () => size(key) });
  const key = 'foe_zhulong', source = size(key), img = scene.add.image(0, 0, key);
  img.width = source.width; img.height = source.height; img.texture = { key };
  img.setTexture = next => { Object.assign(img, size(next)); img.texture = { key: next }; return img; };
  img.setDisplaySize = (w, h) => { img.scaleX = w / img.width; img.scaleY = h / img.height; return img; };
  img.setDisplaySize(source.width * 430 / source.height, 430);
  const container = scene.add.container(1120, 267).add(img);
  const hpBar = scene.add.graphics(), intent = scene.add.container(0, -209);
  for (const object of [hpBar, intent]) object.setVisible = value => { object.visible = value; return object; };
  container.add([hpBar, intent]);
  for (const object of [container, img, hpBar, intent]) object.scene = scene;
  const enemy = battle.enemies[0];
  const view = { foe: enemy, img, container, hpBar, intent, x: 1120, y: 267,
    displayW: img.width * img.scaleX, displayH: 430 };
  scene.enemyViews = [view]; scene.wireEvents();
  return { scene, battle, view, img, enemy, manager,
    trait: () => battle.emit('trait', { target: enemy, text: '反噬 1' }),
    phase: () => battle.emit('bossPhase', { enemy, phase: { name: '二相', line: '' } }) };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('actual Phaser yoyo semantics reproduce the old inflated-start baseline', () => {
  const manager = actualTweenManager(), target = { scaleX: 0.5 };
  manager.add({ targets: target, scaleX: target.scaleX * 1.04, duration: 90, yoyo: true });
  manager.advance(0); manager.advance(90);
  near(target.scaleX, 0.52);
  manager.add({ targets: target, scaleX: target.scaleX * 1.04, duration: 90, yoyo: true });
  manager.advance(0); manager.finish(400);
  near(target.scaleX, 0.52, 'old overlapping tweens permanently retain four percent growth');
});

test('overlapping real trait pulses always return to the original artwork scale', () => {
  const f = fixture(), baseX = f.img.scaleX, baseY = f.img.scaleY;
  for (let cycle = 0; cycle < 5; cycle++) {
    f.trait(); f.manager.advance(0); f.manager.advance(90);
    f.trait(); f.manager.advance(0); f.manager.finish(400);
    near(f.img.scaleX, baseX); near(f.img.scaleY, baseY);
  }
});

test('restarting a trait pulse does not cancel an independent artwork alpha tween', () => {
  const f = fixture(); let completed = 0;
  f.img.alpha = 0;
  const fade = f.manager.add({ targets: f.img, alpha: 0.94, duration: 400, onComplete: () => completed++ });
  f.trait(); f.manager.advance(0); f.manager.advance(90);
  f.trait();
  assert.ok(f.manager.active.has(fade), 'only the prior scale pulse should be removed');
  f.manager.advance(0); f.manager.finish(600);
  near(f.img.alpha, 0.94); assert.equal(completed, 1);
});

test('phase art swap clears earlier pulses and later pulses adopt the new fitted baseline', () => {
  const f = fixture();
  f.trait(); f.manager.advance(0); f.manager.advance(90);
  f.phase(); f.manager.advance(0); f.manager.finish(130);
  // Another trait during phase fade must not later restore the old texture's
  // scale after the phase image has been fitted at the 260ms midpoint.
  f.trait(); f.manager.advance(0); f.manager.finish(700);
  assert.equal(f.img.texture.key, 'foe_zhulong_2');
  const source = size('foe_zhulong_2');
  const expected = Math.min(f.view.displayW / source.width, f.view.displayH / source.height);
  near(f.img.scaleX, expected); near(f.img.scaleY, expected);
  near(f.img.alpha, 0.94);
  f.trait(); f.manager.advance(0); f.manager.finish(300);
  near(f.img.scaleX, expected); near(f.img.scaleY, expected);
});

test('enemy death cancels its current pulse before disposing the artwork', () => {
  const f = fixture(), base = f.img.scaleX;
  f.trait(); f.manager.advance(0); f.manager.advance(90);
  f.enemy.alive = false;
  f.battle.emit('enemyDeath', { enemy: f.enemy });
  near(f.img.scaleX, base);
  assert.equal([...f.manager.active].some(tween => tween.hasTarget(f.img)), false);
  f.manager.advance(0); f.manager.finish(900);
  near(f.img.scaleX, base);
  assert.equal(f.img.destroyed, true);
});
