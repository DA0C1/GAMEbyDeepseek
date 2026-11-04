import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';
import { setSeed, withIsolatedRandom } from '../src/core/random.js';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';

function restoreProperty(object, name, descriptor) {
  if (descriptor) Object.defineProperty(object, name, descriptor);
  else delete object[name];
}

const phaserBeforeImport = Object.getOwnPropertyDescriptor(globalThis, 'Phaser');
let BattleScene;
try {
  installFakePhaser();
  ({ BattleScene } = await import('../src/scenes/BattleScene.js'));
} finally {
  restoreProperty(globalThis, 'Phaser', phaserBeforeImport);
}

function isolated(check) {
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const phaserBefore = Object.getOwnPropertyDescriptor(globalThis, 'Phaser');
  const soundBefore = Object.getOwnPropertyDescriptor(audio, 'sfx');
  const dataBefore = save.data, okBefore = save.ok, runBefore = { ...run };
  const errorBefore = console.error, errors = [];
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, writable: true, value: { getItem: () => null, setItem() {} }
    });
    installFakePhaser();
    audio.sfx = () => {};
    console.error = (...args) => errors.push(args.map(String).join(' '));
    return withIsolatedRandom(() => {
      setSeed(20261104);
      save.load();
      check();
      assert.deepEqual(errors, [], 'battle event callbacks must not swallow an error');
    });
  } finally {
    save.data = dataBefore;
    save.ok = okBefore;
    Object.assign(run, runBefore);
    console.error = errorBefore;
    restoreProperty(globalThis, 'localStorage', storageBefore);
    restoreProperty(globalThis, 'Phaser', phaserBefore);
    restoreProperty(audio, 'sfx', soundBefore);
  }
}

function fixture(ids = ['baiye', 'shanxiao']) {
  const b = new Battle(run.newRun(), ids.map(id => ({ id })));
  b.start();
  b.update(1);
  const events = [];
  b.on('heal', event => events.push(event));
  const [healer, ally] = b.enemies;
  assert.equal(healer.move.special, 'healAll', 'use the real first baiye move without overriding its data');
  return { b, healer, ally, events };
}

test('real baiye group healing reports the capped gain and skips full-health allies', () => isolated(() => {
  const { b, healer, ally, events } = fixture();
  healer.hp -= 1;
  const allyHp = ally.hp;
  b.enemyAct(healer);
  assert.equal(healer.hp, healer.maxHp);
  assert.equal(ally.hp, allyHp);
  assert.deepEqual(events.map(event => [event.target, event.amount]), [[healer, 1]]);
}));

test('a full-health baiye group emits no healing success events', () => isolated(() => {
  const { b, healer, events } = fixture();
  b.enemyAct(healer);
  assert.deepEqual(events, []);
  assert.ok(b.enemies.every(enemy => enemy.hp === enemy.maxHp));
}));

test('normal baiye healing preserves the four-point aura and ten-point group heal', () => isolated(() => {
  const { b, healer, ally, events } = fixture();
  healer.hp -= 15;
  ally.hp -= 20;
  const healerHp = healer.hp, allyHp = ally.hp;
  b.enemyAct(healer);
  assert.equal(healer.hp - healerHp, 10);
  assert.equal(ally.hp - allyHp, 14);
  assert.deepEqual(events.map(event => [event.target, event.amount]), [
    [ally, 4], [healer, 10], [ally, 10]
  ], 'the passive ally heal and active group heal retain their original order and amounts');
}));

test('group healing never revives or emits healing for a defeated enemy', () => isolated(() => {
  const { b, healer, ally, events } = fixture(['baiye', 'shanxiao', 'shanxiao']);
  const dead = b.enemies[2];
  b.damage(dead, dead.hp, { raw: true, pierce: true });
  assert.equal(dead.alive, false);
  healer.hp -= 15;
  ally.hp -= 20;
  b.enemyAct(healer);
  assert.equal(dead.hp, 0);
  assert.equal(dead.alive, false);
  assert.ok(events.every(event => event.target !== dead));
  assert.ok(events.length > 0, 'living injured enemies still receive healing');
}));

test('BattleScene renders only the actual positive baiye healing amount', () => isolated(() => {
  const { b, healer } = fixture();
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  scene.battle = b;
  scene.enemyViews = [];
  for (const method of ['refreshBuffs', 'refreshHand', 'refreshPiles', 'drawEnergy',
    'updateEnemyIntents', 'refreshPlayerHud', 'refreshEnemyBars']) scene[method] = () => {};
  scene.wireEvents();
  healer.hp -= 1;
  b.enemyAct(healer);
  const healingLabels = view.objects.filter(object => object.type === 'Text' && /^\+\d+$/.test(object.text))
    .map(object => object.text);
  assert.deepEqual(healingLabels, ['+1'], 'full-health enemies have no fake +10 or +0 popup');
}));
