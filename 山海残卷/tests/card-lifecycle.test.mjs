import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
save.load();
const card = (id, rune) => ({ id, def: CARDS[id], up: false, ...(rune ? { rune } : {}) });
function fixture() {
  const p = run.newRun();
  const b = new Battle(p, [{ id: 'shanxiao' }]);
  b.start(); b.update(1);
  b.enemies[0].hp = b.enemies[0].maxHp = 1000;
  return b;
}

test('echo rune respects ten-card limit and normally disposes of an overflowing return', () => {
  for (const full of [false, true]) {
    for (const id of ['fuzhi', 'jifeng']) {
      const b = fixture(), echo = card(id, 'hui');
      b.hand = [echo, ...Array.from({ length: full ? 9 : 6 }, () => card('yufeng'))];
      b.drawPile = Array.from({ length: 10 }, () => card('cijian'));
      b.playCard(echo);
      assert.ok(b.hand.length <= 10);
      assert.equal(b.hand.includes(echo), !full);
      assert.equal(echo._echoUsed, true);
      if (full) assert.equal((echo.def.exhaust ? b.exhaustPile : b.discardPile).includes(echo), true);
    }
  }
});

test('unplayed mihuo exhausts at end turn but ordinary exhaust cards do not', () => {
  const b = fixture();
  const curse = card('mihuo'), ordinary = card('fuzhi');
  b.hand = [curse, ordinary];
  b.endTurn();
  assert.equal(b.exhaustPile.includes(curse), true);
  assert.equal(b.discardPile.includes(curse), false);
  assert.equal(b.discardPile.includes(ordinary), true);
});

test('discarding mihuo during card play is distinct from its end-turn exhaustion', () => {
  const b = fixture();
  const curse = card('mihuo'), spell = card('wanfa');
  b.hand = [curse, spell];
  b.playCard(spell);
  assert.equal(b.discardPile.includes(curse), true);
  assert.equal(b.exhaustPile.includes(curse), false);
});

test('nizhuan doubles existing block exactly, without adding dexterity again', () => {
  for (const block of [0, 1, 10, 50]) {
    const b = fixture(), spell = card('nizhuan');
    b.player.block = block;
    b.player.buffs.dex = 5;
    b.hand = [spell];
    b.playCard(spell);
    assert.equal(b.player.block, block * 2);
  }
});
