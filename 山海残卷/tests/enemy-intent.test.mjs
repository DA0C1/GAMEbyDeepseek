import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { FOES, pickMove } from '../src/data/enemies.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { random, setSeed } from '../src/core/random.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
save.load();
function fixture(id = 'zhulong') {
  const p = run.newRun(); p.hp = p.maxHp = 1000;
  const b = new Battle(p, [{ id }]); b.start(); b.update(1);
  return b;
}

test('intent forecasts a boss phase caused by poison before its action, including new strength', () => {
  const b = fixture(), e = b.enemies[0];
  e.hp = 86; e.maxHp = 140; e.turn = 1; e.move = pickMove(e);
  e.buffs.poison = 10;
  assert.equal(e.move.name, '瞑目');
  const pv = b.previewEnemyIntent(e);
  assert.equal(pv.phaseChange, true);
  assert.equal(pv.move.name, '灼野');
  assert.deepEqual(pv.damageByHit, [9, 9]);
  assert.equal(e.move.name, '瞑目', 'forecast does not actually switch phase');
  let acted;
  b.on('enemyMove', ({ move }) => acted = move);
  b.enemyAct(e);
  assert.deepEqual(pv.move, acted);
});

test('intent predicts lethal damage-over-time rather than an action that will not occur', () => {
  const b = fixture('shanxiao'), e = b.enemies[0];
  e.hp = 5; e.buffs.poison = 5;
  const pv = b.previewEnemyIntent(e);
  assert.equal(pv.move, null);
  assert.equal(pv.willDie, true);
  assert.deepEqual(pv.damageByHit, []);
  let actions = 0;
  b.on('enemyMove', () => actions++);
  b.enemyAct(e);
  assert.equal(actions, 0);
});

test('intent preparation matches actual moves and attack numbers for every foe without mutating state', () => {
  for (const id of Object.keys(FOES)) {
    for (const dots of [0, 5, 25]) {
      const b = fixture(id), e = b.enemies[0];
      e.hp = Math.ceil(e.maxHp * 0.65); e.buffs = { poison: dots, burn: dots, weak: 1 };
      b.player.buffs = { vuln: 1, halve: 1 };
      const before = JSON.stringify(b), saved = JSON.stringify(save.data);
      setSeed(91); const expected = random(); setSeed(91);
      const pv = b.previewEnemyIntent(e);
      assert.equal(random(), expected);
      assert.equal(JSON.stringify(b), before, id);
      assert.equal(JSON.stringify(save.data), saved, id);
      let actualMove = null;
      const hits = [];
      b.on('enemyMove', ({ move }) => actualMove = move);
      const hurt = b.hurtPlayer;
      b.hurtPlayer = function (amount, opt = {}) {
        if (!opt.raw) hits.push(this.incomingDamage(amount));
        return hurt.call(this, amount, opt);
      };
      b.enemyAct(e);
      assert.deepEqual(pv.move, actualMove, id + ' move');
      assert.deepEqual(pv.damageByHit, hits, id + ' damage');
    }
  }
  setSeed(null);
});
