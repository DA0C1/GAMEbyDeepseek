import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { CARDS } from '../src/data/cards.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
};
save.load();
const card = id => ({ id, def: CARDS[id], up: false });
function fixture(relics = []) {
  const player = run.newRun();
  player.relics = relics;
  const battle = new Battle(player, [{ id: 'shanxiao' }]);
  battle.start();
  battle.update(1);
  const enemy = battle.enemies[0];
  enemy.hp = enemy.maxHp = 1000;
  enemy.el = 'none';
  enemy.def = { ...enemy.def, traits: {} };
  enemy.move = { block: 1 };
  return battle;
}

function nextTurn(battle) {
  battle.endTurn();
  for (let i = 0; i < 3 && battle.phase === 'enemy'; i++) battle.update(1);
  assert.equal(battle.phase, 'player');
}

test('tianming bonus lasts one battle and preserves permanent act energy gains', () => {
  const battle = fixture();
  battle.player.energyMax = 4; // Permanent reward from clearing an act.
  battle.player.energy = 4;
  const destiny = card('tianming');
  battle.hand = [destiny];
  battle.playCard(destiny);
  assert.equal(battle.player.energy, 3, 'pay 2, then gain 1 immediately');
  nextTurn(battle);
  assert.equal(battle.player.energy, 5, 'bonus remains for later turns');
  const following = new Battle(battle.player, [{ id: 'shanxiao' }]);
  following.start();
  following.update(1);
  assert.equal(following.player.energyMax, 4, 'permanent act reward is not changed');
  assert.equal(following.player.energy, 4, 'temporary destiny bonus does not leak');
});

test('shigu curse hurts once per held copy on end turn, bypasses armor, and can kill', () => {
  for (const copies of [1, 2]) {
    const battle = fixture();
    battle.hand = Array.from({ length: copies }, () => card('shigu_curse'));
    battle.player.block = 100;
    const before = battle.player.hp;
    battle.endTurn();
    assert.equal(before - battle.player.hp, 2 * copies);
    assert.equal(battle.discardPile.filter(c => c.id === 'shigu_curse').length, copies);
  }
  const battle = fixture();
  battle.player.hp = 2;
  battle.hand = [card('shigu_curse')];
  let losses = 0, enemyTurns = 0;
  battle.on('lose', () => losses++).on('enemyTurnStart', () => enemyTurns++);
  battle.endTurn();
  battle.endTurn();
  assert.equal(battle.phase, 'lost');
  assert.equal(losses, 1);
  assert.equal(enemyTurns, 0);
});

test('discarding shigu during card play is not an end-turn penalty', () => {
  const battle = fixture();
  const spell = card('wanfa');
  battle.hand = [spell, card('shigu_curse')];
  const before = battle.player.hp;
  battle.playCard(spell);
  battle.endTurn();
  assert.equal(battle.player.hp, before);
});

test('wanfa damage preview counts the remaining hand exactly and never mutates it', () => {
  for (const copies of [0, 1, 2, 5]) {
    const battle = fixture();
    const spell = card('wanfa');
    const original = [spell, ...Array.from({ length: copies }, () => card('yufeng'))];
    battle.hand = original.slice();
    const preview = battle.previewDamage(spell, battle.enemies[0]);
    assert.deepEqual(battle.hand, original);
    assert.equal(battle.cardsPlayed, 0);
    const before = battle.enemies[0].hp;
    battle.playCard(spell);
    assert.equal(before - battle.enemies[0].hp, copies * 6);
    assert.equal(preview?.effective || 0, copies * 6);
  }
});

test('zhuihun bonus only triggers as the first card, and resets each turn', () => {
  for (const first of [null, 'mojian', 'cijian']) {
    const battle = fixture();
    const chase = card('zhuihun');
    battle.hand = [chase];
    if (first) {
      const opening = card(first);
      battle.hand.unshift(opening);
      battle.playCard(opening, battle.enemies[0]);
    }
    const before = battle.drawPile.length;
    battle.playCard(chase, battle.enemies[0]);
    assert.equal(before - battle.drawPile.length, first ? 0 : 2, first || 'first card');
    nextTurn(battle);
    const again = card('zhuihun');
    battle.hand = [again];
    battle.drawPile = Array.from({ length: 5 }, () => card('yufeng'));
    battle.playCard(again, battle.enemies[0]);
    assert.equal(battle.drawPile.length, 3, 'new turn restores first-card bonus');
  }
});

test('fire relics strengthen outgoing burns but never incoming burn or draw for enemies', () => {
  const battle = fixture(['zhuniao', 'fentianlu', 'liyan']);
  const beforeHand = battle.hand.length;
  battle.apply(battle.player, 'burn', 2);
  assert.equal(battle.player.buffs.burn, 2);
  assert.equal(battle.hand.length, beforeHand, 'enemy burn does not trigger liyan');
  const beforeHp = battle.player.hp;
  battle.endTurn();
  assert.equal(beforeHp - battle.player.hp, 2, 'incoming tick has no player burn bonus');
  battle.apply(battle.enemies[0], 'burn', 2);
  assert.equal(battle.enemies[0].buffs.burn, 6, '2 base + 1 feather + 2 furnace + 1 set');
  assert.equal(battle.hand.length, 1, 'outgoing burn still triggers liyan');
  const beforeEnemyHp = battle.enemies[0].hp;
  battle.enemyAct(battle.enemies[0]);
  assert.equal(beforeEnemyHp - battle.enemies[0].hp, 11, '6 stacks + 5 bonus');
});

test('taiji reflection and repeated half-damage effects expire after the enemy turn', () => {
  const battle = fixture();
  const enemy = battle.enemies[0];
  enemy.move = { dmg: 6, hits: 2 };
  battle.apply(battle.player, 'riposte', 8);
  battle.apply(battle.player, 'halve', 2);
  const before = battle.player.hp, enemyBefore = enemy.hp;
  nextTurn(battle);
  assert.equal(before - battle.player.hp, 6, 'both attacks remain halved');
  assert.equal(enemyBefore - enemy.hp, 16, 'both attacks are reflected');
  assert.equal(battle.player.buffs.riposte || 0, 0, 'damage is not a duration counter');
  assert.equal(battle.player.buffs.halve || 0, 0, 'stacking does not add future turns');
});

test('enemy multihit preview includes vulnerability applied between hits without mutating buffs', () => {
  for (const initial of [{}, { halve: 1 }, { vuln: 1 }, { vuln: 2, halve: 1 }]) {
    const battle = fixture();
    const enemy = battle.enemies[0];
    enemy.move = { dmg: 5, hits: 2, playerBuff: ['vuln', 1] };
    enemy.dmgMul = 1;
    battle.player.buffs = { ...initial };
    const predicted = battle.previewEnemyAttack(enemy);
    assert.deepEqual(battle.player.buffs, initial, 'forecast must not apply real debuffs');
    if (!Object.keys(initial).length) assert.deepEqual(predicted, [5, 8]);
    const actual = [];
    battle.on('damage', ({ amount, isPlayer }) => { if (isPlayer) actual.push(amount); });
    battle.enemyAct(enemy);
    assert.deepEqual(predicted, actual);
  }
});

test('area attack previews share one-shot relic bonuses in actual enemy order', () => {
  for (const id of ['hengsao', 'wujian', 'wanfa']) {
    for (const relics of [['chijin'], ['duanren'], ['chijin', 'duanren', 'pojunqi']]) {
      const battle = fixture(relics);
      const first = battle.enemies[0];
      const second = { ...first, uid: 'f1', buffs: {}, hp: 500, maxHp: 1000, block: 7 };
      battle.enemies.push(second);
      const spell = card(id);
      battle.hand = [spell, card('yufeng'), card('yufeng')];
      const relicBefore = battle.relics.map(relic => ({ ...relic.state }));
      const hpBefore = battle.enemies.map(enemy => enemy.hp);
      const predicted = battle.enemies.map(enemy => battle.previewDamage(spell, enemy).effective);
      assert.deepEqual(battle.relics.map(relic => relic.state), relicBefore);
      assert.deepEqual(battle.enemies.map(enemy => enemy.hp), hpBefore);
      battle.playCard(spell);
      assert.deepEqual(predicted, battle.enemies.map((enemy, index) => hpBefore[index] - enemy.hp), id + '/' + relics.join(','));
    }
  }
});

test('random-target and evadable forecasts do not promise guaranteed kills', () => {
  const battle = fixture();
  const enemy = battle.enemies[0];
  enemy.hp = 1;
  battle.enemies.push({ ...enemy, uid: 'f1', buffs: {} });
  const randomCard = card('wulei');
  battle.hand = [randomCard];
  const randomPreview = battle.previewDamage(randomCard, enemy);
  assert.equal(randomPreview.uncertain, true);
  assert.equal(randomPreview.lethal, false);
  const strike = card('cijian');
  enemy.def = { ...enemy.def, traits: { dodge: 0.3 } };
  battle.hand = [strike];
  assert.equal(battle.previewDamage(strike, enemy).lethal, false);
});

test('resolved card target is consistent for defaults and ignores stray self/area targets', () => {
  const b = fixture(['leigong']);
  const c = card('cijian'); b.hand = [c];
  b.playCard(c); // Rules select the first living enemy by default.
  assert.equal(b.enemies[0].buffs.vuln, 1);
  for (const id of ['hengsao', 'mojian']) {
    const area = fixture(['leigong']);
    const spell = card(id); area.hand = [spell];
    let eventTarget = 'unset';
    area.on('cardPlayed', ({ target }) => eventTarget = target);
    area.playCard(spell, area.enemies[0]);
    assert.equal(area.enemies[0].buffs.vuln || 0, 0);
    assert.equal(eventTarget, null);
  }
});

test('piercing attacks ignore armor but still benefit from vulnerability', () => {
  for (const [id, expected] of [['taiyi', 45], ['pofeng', 22]]) {
    const b = fixture();
    b.player.energy = 10;
    const e = b.enemies[0]; e.block = 100; e.buffs.vuln = 2;
    const c = card(id); b.hand = [c];
    const pv = b.previewDamage(c, e);
    const before = e.hp;
    b.playCard(c, e);
    assert.equal(before - e.hp, expected, id);
    assert.equal(e.block, 100, 'armor is bypassed, not consumed');
    assert.equal(pv.effective, expected);
    assert.equal(pv.blocked, 0);
  }
  const raw = fixture();
  raw.enemies[0].buffs.vuln = 2;
  assert.equal(raw.damage(raw.enemies[0], 20, { raw: true, pierce: true }), 20, 'raw potion damage remains fixed');
});
