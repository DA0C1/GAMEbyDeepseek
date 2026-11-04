import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

installFakePhaser();
Phaser.BlendModes = { NORMAL: 0, ADD: 1 };
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });

// Use this build's actual dispatch order: GameObject pointerdown first, then
// Scene pointerdown unless propagation was stopped. Cards are manually hit-
// tested and therefore absent from the engine's interactive-object hit list.
const engine = readFileSync(new URL('../vendor/phaser.min.js', import.meta.url), 'utf8');
const start = engine.indexOf('processDownEvents:function(');
const end = engine.indexOf(',getDragState:function(', start);
assert.ok(start >= 0 && end > start);
const dispatchDown = Function('d', `return (${engine.slice(start + 'processDownEvents:'.length, end)});`)({
  GAMEOBJECT_POINTER_DOWN: 'pointerdown', GAMEOBJECT_DOWN: 'gameobjectdown',
  POINTER_DOWN: 'pointerdown', POINTER_DOWN_OUTSIDE: 'pointerdownoutside'
});

function sourceSize() {
  const bytes = readFileSync(new URL('../assets/art/foe_shanxiao.webp', import.meta.url));
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
  return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
}

function fixture({ select = true, coverId = 'cijian', coverIndex = 4 } = {}) {
  const scene = new BattleScene(), view = fakeScene(scene);
  scene.init({});
  scene.input = Object.assign(new EventEmitter(), { keyboard: new EventEmitter(), enabled: true });
  scene.textures.get = () => ({ getSourceImage: sourceSize });
  for (const [name, factory] of Object.entries(scene.add)) {
    scene.add[name] = (...args) => {
      const object = factory(...args);
      object.scene = scene;
      object.texture = { key: args[2] };
      for (const method of ['fillEllipse', 'strokeEllipse', 'arc', 'closePath', 'fillPath', 'setStroke', 'clearTint']) {
        object[method] = () => object;
      }
      object.setVisible = value => { object.visible = value; return object; };
      object.setY = y => { object.y = y; return object; };
      object.setTexture = key => { object.texture = { key }; return object; };
      if (name === 'container' && args[2]) object.add(args[2]);
      return object;
    };
  }
  const battle = new Battle(run.player, [{ id: 'shanxiao' }]);
  battle.start(); battle.update(1);
  battle.hand = Array.from({ length: 5 }, (_, index) => {
    const id = index === coverIndex ? coverId : 'cijian';
    return { id, def: CARDS[id], up: false };
  });
  battle.energy = 3;
  scene.battle = battle;
  scene.uiLocked = false;
  scene.buildEnemies();
  scene.refreshHand();
  scene.buildControls();
  for (const name of ['drawEnergy', 'refreshPlayerHud', 'refreshEnemyBars', 'refreshPiles']) scene[name] = () => {};
  function finish(duration) {
    for (const tween of view.tweens.filter(t => !t.completed && !t.canceled && t.duration === duration)) {
      tween.completed = true;
      for (const key of ['x', 'y', 'rot', 'scale']) {
        if (typeof tween[key] === 'number') tween.targets[key] = tween[key];
      }
      tween.onUpdate?.();
      tween.onComplete?.();
    }
  }
  finish(180);
  const selected = scene.cardViews[0], cover = scene.cardViews[coverIndex];
  if (select) {
    const point = { worldX: selected.x, worldY: selected.y };
    scene.onPointerDown(point);
    scene.onPointerUp(point);
    finish(150);
    assert.equal(scene.selected, selected, 'real click-to-target selection');
  }
  scene.onPointerMove({ worldX: cover.x, worldY: cover.y });
  finish(170);
  assert.equal(cover.hovered, true);
  const enemy = scene.enemyViews[0];
  const canvas = {};
  const input = scene.input;
  input._eventData = { cancelled: false };
  input._eventContainer = { stopPropagation() { input._eventData.cancelled = true; } };
  input.isActive = () => true;
  input.manager = { game: { canvas } };
  function click(x, y) {
    const pointer = { worldX: x, worldY: y, downElement: canvas };
    assert.ok(Math.abs(x - enemy.x) <= enemy.displayW / 2 && Math.abs(y - enemy.y) <= enemy.displayH / 2,
      'point must genuinely intersect the interactive enemy image');
    input._temp = [enemy.img];
    dispatchDown.call(input, pointer);
    return pointer;
  }
  return { scene, battle, selected, cover, enemy, click };
}

for (const [name, coverIndex, point, manualHit] of [
  ['enemy image only', 4, [1192, 475], false],
  ['enemy image and manual foe bounds', 3, [1010, 460], true]
]) {
  test(`visible card occludes ${name} when an attack is selected`, () => {
    const f = fixture({ coverIndex });
    assert.equal(f.scene.cardAt(...point), f.cover);
    assert.equal(!!f.scene.foeAt(...point), manualHit);
    assert.equal(f.cover.img.input, undefined, 'CardView image is not engine-interactive');
    assert.ok(f.cover.container.depth > f.enemy.container.depth);
    const hp = f.enemy.foe.hp;
    f.click(...point);
    assert.equal(f.battle.cardsPlayed, 0);
    assert.equal(f.enemy.foe.hp, hp);
    assert.ok(f.battle.hand.includes(f.selected.card));
    assert.equal(f.scene.selected, null, 'visible hand click cancels old targeting instead of attacking through it');
  });
}

test('scene-level selected hit testing also prioritizes a visible card over foe bounds', () => {
  const f = fixture({ coverIndex: 3 });
  f.scene.onPointerDown({ worldX: 1010, worldY: 460 });
  assert.equal(f.battle.cardsPlayed, 0);
  assert.equal(f.scene.selected, null);
});

test('an exposed enemy image plays the selected attack once and consumes its pointer event', () => {
  const f = fixture();
  assert.equal(f.scene.cardAt(1120, 300), null);
  f.click(1120, 300);
  assert.equal(f.battle.cardsPlayed, 1);
  assert.equal(f.battle.hand.includes(f.selected.card), false);
  assert.equal(f.scene.input._eventData.cancelled, true, 'successful object hit must not re-enter global input');
});

test('without a selected attack an overlapping hand click still begins card drag', () => {
  const f = fixture({ select: false });
  f.click(1192, 475);
  assert.equal(f.battle.cardsPlayed, 0);
  assert.equal(f.scene.dragging, f.cover);
});

test('unplayable curse and unaffordable dimmed cards still occlude an enemy', () => {
  const curse = Object.keys(CARDS).find(id => CARDS[id].unplayable);
  const expensive = Object.keys(CARDS).find(id => CARDS[id].cost > 3 && !CARDS[id].unplayable);
  assert.ok(curse && expensive);
  for (const coverId of [curse, expensive]) {
    const f = fixture({ coverId });
    // Leaving hover dims the unplayable card immediately, while its return
    // tween still leaves visible art over the enemy until the next frame.
    f.scene.onPointerMove({ worldX: 20, worldY: 20 });
    assert.equal(f.cover.dimmed, true);
    assert.equal(f.battle.canPlay(f.cover.card), false);
    assert.equal(f.scene.cardAt(1192, 475), f.cover);
    f.click(1192, 475);
    assert.equal(f.battle.cardsPlayed, 0, coverId);
    assert.ok(f.battle.hand.includes(f.selected.card), coverId);
  }
});

test('blocked battle input cannot play through an exposed enemy object', () => {
  const f = fixture();
  f.scene.uiLocked = true;
  f.click(1120, 300);
  assert.equal(f.battle.cardsPlayed, 0);
  assert.ok(f.battle.hand.includes(f.selected.card));
});
