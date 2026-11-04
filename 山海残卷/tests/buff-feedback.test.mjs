import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
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

function fixture(relics = []) {
  const p = run.newRun();
  p.relics = relics.slice();
  const b = new Battle(p, [{ id: 'shanxiao' }]);
  b.start();
  b.update(1);
  const enemy = b.enemies[0];
  enemy.hp = enemy.maxHp = 1000;
  enemy.el = 'none';
  enemy.def = { ...enemy.def, traits: {} };
  enemy.move = { block: 1 };
  const events = [];
  b.on('buff', event => events.push(event));
  return { b, p, enemy, events };
}

test('burn feedback reports the complete gain after relic and set bonuses', () => isolated(() => {
  const profiles = [
    { relics: [], extra: 0, damageBonus: 0 },
    { relics: ['zhuniao'], extra: 1, damageBonus: 1 },
    { relics: ['fentianlu'], extra: 2, damageBonus: 2 },
    { relics: ['zhuniao', 'fentianlu'], extra: 3, damageBonus: 3 },
    { relics: ['zhuniao', 'fentianlu', 'liyan'], extra: 4, damageBonus: 5 }
  ];
  for (const { relics, extra, damageBonus } of profiles) {
    for (const initial of [0, 4]) {
      const { b, enemy, events } = fixture(relics);
      enemy.buffs.burn = initial;
      const expected = 2 + extra;
      for (let i = 1; i <= 2; i++) {
        b.apply(enemy, 'burn', 2);
        assert.equal(enemy.buffs.burn, initial + expected * i, `${relics}: actual stack total`);
        assert.equal(events.length, i);
        assert.equal(events.at(-1).target, enemy);
        assert.equal(events.at(-1).name, 'burn');
        assert.equal(events.at(-1).stacks, expected, `${relics}: displayed delta, not accumulated total`);
      }
      b.enemyAct(enemy);
      assert.equal(1000 - enemy.hp, initial + expected * 2 + damageBonus,
        'reporting the real gain must not change burn damage');
    }
  }
}));

test('toxic poison feedback includes its bonus while incoming poison remains unchanged', () => isolated(() => {
  const { b, p, enemy, events } = fixture();
  p.buffs.toxic = 3;
  enemy.buffs.poison = 4;
  b.apply(enemy, 'poison', 2);
  assert.equal(enemy.buffs.poison, 9);
  assert.equal(events.at(-1).stacks, 5);
  p.buffs.poison = 1;
  b.apply(p, 'poison', 2);
  assert.equal(p.buffs.poison, 3);
  assert.equal(events.at(-1).stacks, 2);
}));

test('incoming burn and immune targets do not inherit outgoing fire bonuses or feedback', () => isolated(() => {
  const { b, p, enemy, events } = fixture(['zhuniao', 'fentianlu', 'liyan']);
  const handSize = b.hand.length;
  p.buffs.burn = 4;
  b.apply(p, 'burn', 2);
  assert.equal(p.buffs.burn, 6);
  assert.equal(events.at(-1).stacks, 2);
  assert.equal(b.hand.length, handSize, 'incoming burns do not trigger liyan');
  enemy.def = { ...enemy.def, traits: { immune: ['burn', 'poison'] } };
  enemy.buffs.burn = 4;
  b.apply(enemy, 'burn', 2);
  b.apply(enemy, 'poison', 2);
  assert.equal(events.length, 1, 'immune applications emit no success feedback');
  assert.equal(enemy.buffs.burn, 4);
  assert.equal(enemy.buffs.poison || 0, 0);
  assert.equal(b.hand.length, handSize);
}));

test('actual event deltas do not change the positional applyBuff hook argument', () => isolated(() => {
  const { b, enemy, events } = fixture(['zhuniao', 'fentianlu', 'liyan']);
  let received;
  b.relics.push({ id: 'feedback-probe', state: {}, def: { hooks: {
    applyBuff(_battle, _state, target, name, stacks) { received = { target, name, stacks }; }
  } } });
  b.apply(enemy, 'burn', 2);
  assert.equal(received.target, enemy);
  assert.equal(received.name, 'burn');
  assert.equal(received.stacks, 3, 'existing hook contract receives base plus set contribution');
  assert.equal(events.at(-1).stacks, 6, 'the separate event reports all actual contributions');
}));

test('BattleScene displays real burn gains and baoyan removal instead of plus zero', () => isolated(() => {
  const { b, p, enemy, events } = fixture(['zhuniao', 'fentianlu', 'liyan']);
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  scene.battle = b;
  scene.enemyViews = [];
  // Retain the real event listener and floating-text renderer. The rest of the
  // scene need not build art, hand textures or HUD widgets for this assertion.
  for (const method of ['refreshBuffs', 'refreshHand', 'refreshPiles', 'drawEnergy',
    'updateEnemyIntents', 'refreshPlayerHud', 'refreshEnemyBars']) scene[method] = () => {};
  scene.wireEvents();
  const labels = () => view.objects.filter(object => object.type === 'Text').map(object => object.text);
  enemy.buffs.burn = 4;
  b.apply(enemy, 'burn', 2);
  assert.ok(labels().includes('灼烧 +6'));
  b.apply(p, 'burn', 2);
  assert.ok(labels().includes('灼烧 +2'));
  const spell = { id: 'baoyan', def: CARDS.baoyan, up: false };
  b.hand = [spell];
  p.energy = 2;
  const hp = enemy.hp;
  assert.equal(b.playCard(spell, enemy), true);
  assert.equal(hp - enemy.hp, 50, 'ten burn stacks keep the existing five-times attack');
  assert.equal(enemy.buffs.burn || 0, 0);
  assert.equal(events.at(-1).stacks, 0, 'explicit removal retains its established event contract');
  assert.ok(labels().includes('灼烧 已清除'));
  assert.ok(!labels().includes('灼烧 +0'));
}));
