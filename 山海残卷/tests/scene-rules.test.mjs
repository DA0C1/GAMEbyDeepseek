import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

globalThis.Phaser = { Scene: class {} };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
save.load();
const { TitleScene } = await import('../src/scenes/TitleScene.js');

test('title accepts one new run per transition and preserves the first prologue', () => {
  const scene = new TitleScene();
  scene.init();
  scene.input = { enabled: true };
  const pending = [], transitions = [];
  scene.cameras = { main: { fadeOut() {} } };
  scene.time = { delayedCall(ms, callback) { pending.push(callback); } };
  scene.scene = { start(...args) { transitions.push(args); } };
  save.data.firstRun = true;
  const before = save.data.runs;
  scene.startRun();
  scene.startRun();
  scene.startRun();
  assert.equal(save.data.runs, before + 1);
  assert.equal(scene.input.enabled, false);
  assert.equal(pending.length, 1);
  pending[0]();
  assert.deepEqual(transitions, [['Story', { kind: 'prologue' }]]);
  scene.init();
  scene.startRun();
  assert.equal(save.data.runs, before + 2, 'returning to title permits another run');
});

test('healing preview matches actual healing at all difficulties and near full HP', () => {
  const previous = save.data.ascension;
  try {
    for (const ascension of [0, 4, 5]) {
      save.data.ascension = ascension;
      for (const missing of [0, 2, 50]) {
        run.newRun();
        run.player.hp = run.player.maxHp - missing;
        const amount = Math.round(run.player.maxHp * 0.36);
        const before = run.player.hp;
        const expected = Math.min(missing, Math.round(amount * (ascension >= 4 ? 0.85 : 1)));
        assert.equal(run.previewHeal(amount), expected);
        assert.equal(run.player.hp, before, 'preview is read-only');
        assert.equal(run.heal(amount), expected);
        assert.equal(run.player.hp - before, expected);
      }
    }
  } finally { save.data.ascension = previous; }
});
