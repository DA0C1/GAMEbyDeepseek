import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { EVENTS } from '../src/data/events.js';
import { RELICS } from '../src/data/relics.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });
const option = (id, index = 0) => EVENTS.find(event => event.id === id).options[index];
const snapshot = () => ({
  maxHp: run.player.maxHp, gold: run.player.gold,
  deck: run.player.deck.map(c => ({ id: c.id, up: c.up })),
  relics: [...run.player.relics], potions: [...run.player.potions], pages: [...run.flags.pages]
});

test('lethal relic-event costs cannot be rescued by the reward relic pickup hook', () => {
  for (const [id, index] of [['gubei', 0], ['yan', 0], ['fendi', 1]]) {
    run.newRun();
    run.player.hp = 1;
    // The only eligible reward is qingyu, whose pickup normally adds14 HP.
    run.player.relics = Object.keys(RELICS).filter(id => id !== 'qingyu');
    const before = snapshot();
    option(id, index).effect(run);
    assert.equal(run.player.hp, 0, id);
    assert.deepEqual(snapshot(), before, `${id}: lethal cost must stop reward mutations`);
  }
});

test('a lethal page-event cost cannot revive the player or collect a page', () => {
  for (let hp = 1; hp <= 10; hp++) {
    run.newRun();
    run.player.hp = hp;
    const before = snapshot();
    option('jiupian').effect(run);
    assert.equal(run.player.hp, 0, `HP ${hp}`);
    assert.equal(run.player.alive, false, `HP ${hp}`);
    assert.deepEqual(snapshot(), before, `HP ${hp}`);
    assert.deepEqual(save.data.pages, [], `HP ${hp}: no cross-run discovery`);
  }
});

test('page-event cost at the nonlethal boundary still grants its page and HP bonus', () => {
  run.player.hp = 11;
  const maxHp = run.player.maxHp;
  option('jiupian').effect(run);
  assert.equal(run.player.hp, 4);
  assert.equal(run.player.alive, true);
  assert.equal(run.player.maxHp, maxHp + 3);
  assert.equal(run.flags.pages.length, 1);
  assert.equal(save.data.pages.length, 1);
});

test('all health-cost options stop gold, card, potion, upgrade and removal rewards when lethal', () => {
  const cases = [
    ['mochi', 0], ['pomiao', 2], ['duzhao', 0], ['duzhao', 1], ['jianzhong', 0],
    ['canjuan', 0], ['wumo', 1], ['kongbai', 0], ['shangren', 1], ['ziji', 0],
    ['moyu', 0], ['baiqiang', 0], ['shengyin', 0], ['jiupian', 1], ['xishanhui', 0], ['juanxin', 1]
  ];
  for (const [id, index] of cases) {
    run.newRun();
    run.player.hp = 1;
    const before = snapshot();
    option(id, index).effect(run);
    assert.equal(run.player.hp, 0, id);
    assert.deepEqual(snapshot(), before, id);
  }
});

test('surviving a relic-event cost still receives the normal reward', () => {
  run.player.hp = 30;
  run.player.relics = Object.keys(RELICS).filter(id => id !== 'qingyu');
  const maxHp = run.player.maxHp;
  option('gubei').effect(run);
  assert.ok(run.player.relics.includes('qingyu'));
  assert.equal(run.player.maxHp, maxHp + 14);
  assert.equal(run.player.hp, 30, '30 minus14 cost plus14 pickup');
});
