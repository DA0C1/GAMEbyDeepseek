import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });

function assetSize(key) {
  const bytes = readFileSync(new URL(`../assets/art/${key}.webp`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', 'current art uses an extended WebP header');
  return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
}

function fixture(id, missing = false) {
  const battle = new Battle(run.player, [{ id }], { boss: true });
  battle.start();
  const scene = new BattleScene();
  scene.init({ type: 'boss' });
  const view = fakeScene(scene);
  scene.battle = battle;
  // The phase event's image transition remains real; unrelated forecast/HUD
  // renderers do not need to run to verify the art's source/display geometry.
  for (const name of ['updateEnemyTraits', 'updateEnemyIntents', 'refreshEnemyBars']) scene[name] = () => {};
  const originalKey = `foe_${id}`, nextKey = `${originalKey}_2`;
  const original = assetSize(originalKey), next = assetSize(nextKey);
  scene.textures.exists = key => !(missing && key === nextKey);
  scene.textures.get = key => ({ getSourceImage: () => key === nextKey ? next : original });
  const img = scene.add.image(0, 0, originalKey);
  img.width = original.width; img.height = original.height;
  img.texture = { key: originalKey };
  img.mutations = [];
  img.setTexture = key => {
    img.mutations.push(key);
    img.texture = { key };
    const dimensions = key === nextKey ? next : original;
    img.width = dimensions.width; img.height = dimensions.height;
    return img;
  };
  img.setDisplaySize = (width, height) => {
    img.scaleX = width / img.width;
    img.scaleY = height / img.height;
    return img;
  };
  Object.defineProperties(img, {
    displayWidth: { get: () => img.width * img.scaleX },
    displayHeight: { get: () => img.height * img.scaleY }
  });
  const scale = Math.min(430 / original.height, 560 / original.width);
  const displayW = original.width * scale, displayH = original.height * scale;
  img.setDisplaySize(displayW, displayH);
  const container = scene.add.container(1120, 482 - displayH / 2).add(img);
  const hpBar = scene.add.graphics(), intent = scene.add.container(0, -displayH / 2 + 6);
  for (const object of [hpBar, intent]) object.setVisible = value => { object.visible = value; return object; };
  container.add([hpBar, intent]);
  const enemy = battle.enemies[0];
  const enemyView = { foe: enemy, img, container, hpBar, intent, x: container.x, y: container.y,
    displayW, displayH, barY: displayH / 2 + 6 };
  scene.enemyViews = [enemyView];
  scene.wireEvents();
  const phase = () => battle.emit('bossPhase', { enemy, phase: { name: '二相', line: '' } });
  return { battle, view, img, enemy, enemyView, next, originalKey, nextKey, phase };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const id of ['zhulong', 'xingtian', 'dijiang']) {
  test(`${id} phase artwork preserves its source ratio inside the original view bounds`, () => {
    const f = fixture(id);
    const { enemyView: ev, img } = f;
    const layoutBefore = { width: ev.displayW, height: ev.displayH, x: ev.x, y: ev.y,
      barY: ev.barY, intentX: ev.intent.x, intentY: ev.intent.y };
    f.phase();
    assert.equal(img.texture.key, f.originalKey, 'phase image switches only after fade out');
    f.view.completeTweens(260);
    assert.equal(img.texture.key, f.nextKey);
    near(img.displayWidth / img.displayHeight, f.next.width / f.next.height);
    near(img.scaleX, img.scaleY);
    assert.ok(img.displayWidth <= layoutBefore.width + 1e-8);
    assert.ok(img.displayHeight <= layoutBefore.height + 1e-8);
    assert.ok(Math.abs(img.displayWidth - layoutBefore.width) < 1e-8 ||
      Math.abs(img.displayHeight - layoutBefore.height) < 1e-8, 'contain fit fills one limiting dimension');
    assert.deepEqual({ width: ev.displayW, height: ev.displayH, x: ev.x, y: ev.y,
      barY: ev.barY, intentX: ev.intent.x, intentY: ev.intent.y }, layoutBefore,
    'phase art must not shift combat hit/health/intent anchors');
  });
}

test('missing phase artwork keeps original texture and dimensions with the existing flash fallback', () => {
  const f = fixture('zhulong', true);
  const before = { width: f.img.displayWidth, height: f.img.displayHeight };
  f.phase();
  assert.ok(f.view.tweens.some(tween => tween.targets === f.img && tween.duration === 120 && tween.repeat === 3));
  f.view.completeTweens(260);
  f.view.completeTweens(120);
  assert.equal(f.img.texture.key, f.originalKey);
  assert.deepEqual(f.img.mutations, []);
  near(f.img.displayWidth, before.width);
  near(f.img.displayHeight, before.height);
});

test('death before phase fade completion cancels the pending texture replacement', () => {
  const f = fixture('zhulong');
  f.phase();
  const phaseFade = f.view.tweens.find(tween => tween.targets === f.img && tween.duration === 260);
  assert.ok(phaseFade);
  f.enemy.alive = false;
  f.battle.emit('enemyDeath', { enemy: f.enemy });
  assert.equal(phaseFade.canceled, true);
  f.view.completeTweens(260);
  assert.equal(f.img.texture.key, f.originalKey);
  assert.deepEqual(f.img.mutations, []);
});
