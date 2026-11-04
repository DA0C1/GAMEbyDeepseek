import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { random, setSeed } from '../src/core/random.js';

let writes = 0;
globalThis.localStorage = { getItem: () => null, setItem() { writes++; } };
save.load();
const card = (id, up = false) => ({ id, def: CARDS[id], up });
function fixture(relics = [], ids = ['shanxiao']) {
  setSeed(42);
  const p = run.newRun(); p.relics = relics;
  const b = new Battle(p, ids.map(id => ({ id })));
  b.start(); b.update(1);
  p.energy = 10; p.hp = p.maxHp = 100;
  b.enemies.forEach(e => { e.el = 'none'; e.hp = e.maxHp = 100; });
  return b;
}
function compare(b, c, target = b.enemies[0]) {
  b.hand = [c, card('yufeng'), card('yufeng')];
  const before = b.enemies.map(e => e.hp);
  const previews = b.enemies.map(e => b.previewDamage(c, e));
  b.playCard(c, c.def.target === 'enemy' ? target : null);
  b.enemies.forEach((e, i) => {
    // All-target and self cards have one common resolution. Enemy-target cards
    // are compared only for the actual selected target.
    if (c.def.target === 'enemy' && e !== target) return;
    assert.equal(previews[i]?.effective || 0, before[i] - e.hp, c.id + '/' + e.id);
    assert.equal(previews[i]?.lethal || false, !e.alive, c.id + '/' + e.id + ' lethal');
  });
  return previews;
}

test('gold surge from a skill respects first-hit halving without a false lethal seal', () => {
  const b = fixture([], ['qiongqi']);
  b.enemies[0].hp = 4;
  b.brushEl = 'jin'; b.brushCount = 2;
  const [preview] = compare(b, card('mojian'));
  assert.equal(preview.total, 3);
  assert.equal(preview.lethal, false);
  assert.equal(b.enemies[0].hp, 1);
});

test('forecast resolves death splash, third-attack relics, and single-target combo damage', () => {
  const splash = fixture(['chijin', 'zhenhun'], ['shanxiao', 'shanxiao']);
  splash.enemies[0].hp = 5; splash.enemies[1].hp = 14;
  compare(splash, card('hengsao'));
  assert.equal(splash.enemies[1].alive, false);
  const third = fixture(['jianzhong']);
  third.relics[0].state.n = 2;
  third.enemies[0].buffs.vuln = 1;
  compare(third, card('cijian'));
  const combo = fixture();
  combo.player.buffs.comboDmg = 5;
  compare(combo, card('mojian'));
});

test('forecast stops multihit and area damage at the same combat terminal state', () => {
  const lethal = fixture(); lethal.enemies[0].hp = 1;
  const [pv] = compare(lethal, card('lianhuan'));
  assert.equal(pv.hits, 1);
  const reflected = fixture([], ['zheng', 'shanxiao']);
  reflected.player.hp = 1;
  reflected.enemies[1].hp = 1;
  const previews = compare(reflected, card('hengsao'));
  assert.equal(previews[0].playerDefeated, true);
  assert.equal(previews[1]?.lethal || false, false);
  assert.equal(reflected.phase, 'lost');
});

test('forecast does not advertise a surge canceled by lethal post-play combo reflection', () => {
  for (const hp of [1, 2]) {
    const battle = fixture([], ['zheng']);
    battle.player.hp = hp;
    battle.player.buffs.comboDmg = 5;
    battle.brushEl = 'shui'; battle.brushCount = 2;
    const spell = card('yufeng'); battle.hand = [spell];
    const preview = battle.previewDamage(spell, battle.enemies[0]);
    let actualSurges = 0;
    battle.on('surge', () => actualSurges++);
    battle.playCard(spell);
    assert.equal(preview.playerDefeated, hp === 1);
    assert.equal(!!preview.surge, hp > 1, 'surge metadata follows an executed surge, not a canceled call');
    assert.equal(actualSurges, hp > 1 ? 1 : 0);
    assert.equal(battle.surgeCount, actualSurges);
    if (hp > 1) assert.equal(preview.surge.el, 'shui');
  }
});

test('forecast accounts for fully absorbed hits, piercing, surge shields, and boss phase changes', () => {
  for (const id of ['cijian', 'pofeng', 'wujian', 'wanfa']) {
    const b = fixture(['chijin', 'duanren'], ['zhulong', 'shanxiao']);
    b.enemies[0].hp = 61; b.enemies[0].maxHp = 100; b.enemies[0].block = 7;
    b.enemies[1].block = 100;
    b.brushEl = 'jin'; b.brushCount = 2;
    compare(b, card(id));
  }
});

test('forecast leaves battle identity, save data, callbacks and seeded RNG untouched for every card', () => {
  for (const [id, def] of Object.entries(CARDS)) {
    for (const up of [false, true]) {
      const b = fixture(Object.keys(RELICS), ['zhulong', 'qiongqi', 'huan']);
      const c = card(id, up); c.rune = 'feng';
      b.hand = [c, card('cijian'), card('yufeng')];
      b.player.buffs = { str: 2, dex: 3, comboDmg: 5, drawOnPlay: 1 };
      b.brushEl = 'jin'; b.brushCount = 2;
      let callbacks = 0;
      b.on('damage', () => callbacks++).on('cardPlayed', () => callbacks++).on('win', () => callbacks++);
      const refs = { hand: b.hand, buffs: b.player.buffs, relics: b.relics.map(r => r.state) };
      const before = JSON.stringify(b), saved = JSON.stringify(save.data), savedWrites = writes;
      setSeed(20261104); const expected = random(); setSeed(20261104);
      for (const e of b.enemies) b.previewDamage(c, e);
      assert.equal(random(), expected, id + ' RNG');
      assert.equal(JSON.stringify(b), before, id + ' battle');
      assert.equal(JSON.stringify(save.data), saved, id + ' save');
      assert.equal(writes, savedWrites, id + ' storage');
      assert.equal(callbacks, 0, id + ' callbacks');
      assert.equal(b.hand, refs.hand); assert.equal(b.player.buffs, refs.buffs);
      b.relics.forEach((r, i) => assert.equal(r.state, refs.relics[i], id + ' relic identity'));
    }
  }
  setSeed(null);
});

test('ordinary-mode forecast never consumes host randomness and marks stochastic damage as uncertain', () => {
  const b = fixture([], ['huan', 'shanxiao']);
  const c = card('wulei'); b.hand = [c];
  const original = Math.random;
  let hostCalls = 0;
  try {
    setSeed(null);
    Math.random = () => { hostCalls++; return 0.5; };
    const one = b.previewDamage(c, b.enemies[0]);
    const two = b.previewDamage(c, b.enemies[0]);
    assert.deepEqual(one, two, 'stable representative sample, not flickering values');
    assert.equal(one.uncertain, true);
    assert.equal(one.lethal, false);
    assert.equal(hostCalls, 0);
  } finally { Math.random = original; setSeed(null); }
});

test('random combo forecasts never hide an unselected possible target or promise lethal chains', () => {
  const b = fixture([], ['shanxiao', 'shanxiao']);
  b.player.buffs.comboDmg = 5;
  const c = card('mojian'); b.hand = [c];
  b.enemies.forEach(e => e.hp = 1);
  setSeed(77);
  const previews = b.enemies.map(e => b.previewDamage(c, e));
  assert.equal(previews.every(p => p && p.uncertain && p.randomTarget && !p.lethal), true);
  assert.equal(previews.filter(p => p.total === 0).length, 1, 'one representative target is hit');
  setSeed(null);
});

test('unaffordable normal cards remain hypothetical and X cards use current energy', () => {
  const b = fixture();
  b.player.energy = 0;
  const expensive = card('fentian'); b.hand = [expensive];
  const pv = b.previewDamage(expensive, b.enemies[0]);
  assert.equal(pv.playable, false);
  assert.equal(pv.effective, 18);
  assert.equal(b.player.energy, 0);
  const x = card('fenxu'); b.hand = [x];
  assert.equal(b.previewDamage(x, b.enemies[0]), null, 'zero energy is not fabricated as X damage');
});

 test('all-target forecasts do not invent a selected enemy for post-play relics', () => {
  const b = fixture(['leigong', 'jianzhong']);
  b.relics.find(r => r.id === 'jianzhong').state.n = 2;
  b.enemies[0].hp = 16;
  const [pv] = compare(b, card('hengsao'));
  assert.equal(pv.effective, 14);
  assert.equal(pv.lethal, false);
  assert.equal(b.enemies[0].hp, 2);
});
