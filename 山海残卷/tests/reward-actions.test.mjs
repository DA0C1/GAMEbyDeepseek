import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
installFakePhaser();
const { RewardScene } = await import('../src/scenes/RewardScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};

test('treasure grants one reward, marks its node cleared, and returns to the map once', () => {
  save.load(); run.newRun();
  const node = { type: 'treasure', cleared: false };
  run.map = { cur: { node } };
  const scene = new RewardScene(), view = fakeScene(scene);
  scene.init({ treasure: true }); scene.create();
  assert.equal(node.cleared, true);
  assert.equal(run.player.relics.length, 1);
  assert.ok(run.player.gold >= 149 && run.player.gold <= 188);
  const gold = run.player.gold;
  scene.showTreasure();
  assert.equal(run.player.gold, gold);
  assert.equal(run.player.relics.length, 1);
  view.button('收起').zone.emit('pointerdown');
  const pending = view.timers.find(timer => timer.delay === 40);
  pending.callback(); pending.callback();
  view.flushTimers(380);
  assert.deepEqual(view.transitions, [['Map']]);
  assert.equal(scene.input.enabled, false);
});

test('elite victory healing feedback reports the actual capped and difficulty-adjusted gain', async () => {
  const { BattleScene } = await import('../src/scenes/BattleScene.js');
  for (const [ascension, missing, expected] of [[0, 30, 6], [4, 30, 5], [0, 1, 1], [4, 0, 0]]) {
    save.load(); run.newRun(); save.data.ascension = ascension;
    run.player.hp = run.player.maxHp - missing;
    const before = run.player.hp;
    const scene = new BattleScene(); scene.init({ type: 'elite' });
    const view = fakeScene(scene);
    scene.battle = { damageDealt: 0, cardsPlayed: 0, bonusGold: 0, outHeal: 0 };
    const messages = [];
    scene.floatText = (_x, _y, text) => messages.push(text);
    scene.onEnd('win');
    assert.equal(run.player.hp - before, expected);
    assert.deepEqual(messages.filter(text => text.startsWith('啖 肉')), expected ? ['啖 肉 +' + expected] : []);
    assert.equal(run.stats.elites, 1);
    scene.onEnd('win');
    assert.equal(run.stats.elites, 1, 'replayed terminal callback grants nothing twice');
    view.flushTimers(420);
    assert.equal(view.transitions.length, 1);
    assert.equal(view.transitions[0][0], 'Reward');
  }
});
