import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { random, setSeed, withIsolatedRandom } from '../src/core/random.js';

const card = id => ({ id, def: CARDS[id], up: false });

// Keep these focused fixtures from changing their host's save, run, storage or RNG.
function isolated(check) {
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dataBefore = save.data, okBefore = save.ok, runBefore = { ...run };
  let writes = 0;
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, writable: true,
      value: { getItem: () => null, setItem() { writes++; } }
    });
    return withIsolatedRandom(() => {
      setSeed(20261104);
      save.load();
      return check(() => writes);
    });
  } finally {
    save.data = dataBefore;
    save.ok = okBefore;
    Object.assign(run, runBefore);
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else delete globalThis.localStorage;
  }
}

function fixture(relics = ['liyan'], player = null) {
  const p = player || run.newRun();
  p.relics = relics.slice();
  p.deck = Array.from({ length: 20 }, () => card('yufeng'));
  const b = new Battle(p, [{ id: 'shanxiao' }, { id: 'shanxiao' }]);
  let draws = 0;
  b.on('draw', () => draws++);
  b.start();
  b.update(1);
  p.energy = 10;
  for (const enemy of b.enemies) {
    enemy.hp = enemy.maxHp = 1000;
    enemy.el = 'none';
    enemy.def = { ...enemy.def, traits: {} };
    enemy.move = { block: 1 };
  }
  return { b, draws: () => draws };
}

function nextTurn(b) {
  const turn = b.turn;
  b.endTurn();
  for (let i = 0; i < 10 && b.phase === 'enemy'; i++) b.update(1);
  assert.equal(b.phase, 'player');
  assert.equal(b.turn, turn + 1);
}

test('huozhong consumes liyan first-turn allowance in either relic order', () => isolated(() => {
  for (const relics of [['huozhong', 'liyan'], ['liyan', 'huozhong']]) {
    const { b, draws } = fixture(relics);
    assert.equal(b.phase, 'player');
    assert.equal(b.turn, 1);
    assert.equal(draws(), 6, 'five normal draws plus one startup burn draw across two enemies');
    b.apply(b.enemies[0], 'burn', 1);
    b.apply(b.enemies[1], 'burn', 1);
    assert.equal(draws(), 6, 'more burns in turn one cannot draw a second time');
    nextTurn(b);
    const before = draws();
    b.apply(b.enemies[0], 'burn', 1);
    b.apply(b.enemies[1], 'burn', 1);
    assert.equal(draws() - before, 1, 'the next turn has its own single allowance');
  }
}));

test('ordinary liyan burn triggers once per turn and ignores incoming or immune burns', () => isolated(() => {
  const { b, draws } = fixture();
  const initial = draws();
  b.apply(b.player, 'burn', 1);
  b.enemies[0].def = { ...b.enemies[0].def, traits: { immune: ['burn'] } };
  b.apply(b.enemies[0], 'burn', 1);
  assert.equal(draws(), initial, 'incoming or resisted burns do not use the outgoing-burn trigger');
  b.apply(b.enemies[1], 'burn', 1);
  assert.equal(draws(), initial + 1);
  b.apply(b.enemies[1], 'burn', 1);
  assert.equal(draws(), initial + 1);
  nextTurn(b);
  const before = draws();
  b.apply(b.enemies[1], 'burn', 1);
  b.apply(b.enemies[1], 'burn', 1);
  assert.equal(draws() - before, 1);
}));

test('a full hand keeps the ten-card cap and consumes that turn liyan allowance', () => isolated(() => {
  const { b, draws } = fixture();
  b.hand = Array.from({ length: 10 }, () => card('yufeng'));
  const before = draws();
  b.apply(b.enemies[0], 'burn', 1);
  assert.equal(b.hand.length, 10);
  assert.equal(draws(), before);
  b.discardPile.push(b.hand.pop());
  b.apply(b.enemies[0], 'burn', 1);
  assert.equal(b.hand.length, 9, 'opening space does not create a second first-burn trigger');
  nextTurn(b);
  const next = draws();
  b.apply(b.enemies[0], 'burn', 1);
  assert.equal(draws(), next + 1);
  assert.ok(b.hand.length <= 10);
}));

test('burn forecasts preserve liyan allowance, live objects, callbacks, save and rule RNG', () => isolated(writes => {
  for (const relics of [['liyan'], ['huozhong', 'liyan'], ['liyan', 'huozhong']]) {
    const { b, draws } = fixture(relics);
    const spell = card('huoyan');
    b.hand = [spell];
    const relic = b.relics.find(candidate => candidate.id === 'liyan');
    const state = relic.state, hand = b.hand, enemy = b.enemies[0];
    const snapshot = JSON.stringify(b), saved = JSON.stringify(save.data);
    const beforeWrites = writes(), beforeDraws = draws();
    const expectedRandom = withIsolatedRandom(() => random());
    for (let i = 0; i < 5; i++) {
      assert.equal(b.previewDamage(spell, enemy).effective, 10);
      b.previewEnemyIntent(enemy);
    }
    assert.equal(JSON.stringify(b), snapshot);
    assert.equal(JSON.stringify(save.data), saved);
    assert.equal(writes(), beforeWrites);
    assert.equal(draws(), beforeDraws);
    assert.equal(relic.state, state);
    assert.equal(b.hand, hand);
    assert.equal(b.enemies[0], enemy);
    assert.equal(random(), expectedRandom);
    assert.equal(b.playCard(spell, enemy), true);
    assert.equal(draws() - beforeDraws, relics.includes('huozhong') ? 0 : 1,
      'forecast neither consumes an unused allowance nor restores an already used one');
  }
}));

test('liyan starts a fresh allowance in a new battle with the same player', () => isolated(() => {
  for (const relics of [['liyan'], ['huozhong', 'liyan']]) {
    const first = fixture(relics);
    first.b.apply(first.b.enemies[0], 'burn', 1);
    const second = fixture(relics, first.b.player);
    assert.notEqual(second.b.relics.find(r => r.id === 'liyan').state,
      first.b.relics.find(r => r.id === 'liyan').state);
    const before = second.draws();
    second.b.apply(second.b.enemies[0], 'burn', 1);
    assert.equal(second.draws() - before, relics.includes('huozhong') ? 0 : 1);
    assert.equal(second.draws(), 6, 'each battle gets one turn-one burn draw');
  }
}));
