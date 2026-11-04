import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { save } from '../src/core/save.js';
import { run } from '../src/core/run.js';
import { ACTS } from '../src/systems/mapgen.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });

function fixture() {
  const scene = new BattleScene(), view = fakeScene(scene);
  scene.init({ type: 'boss', encounter: [{ id: ACTS[0].boss }] });
  run.map = { act: ACTS[0] };
  scene.events = new EventEmitter();
  scene.time.addEvent = config => ({ ...config, remove() { this.removed = true; } });
  const graphics = scene.add.graphics;
  scene.add.graphics = (...args) => {
    const object = graphics(...args);
    object.fillGradientStyle = () => object;
    return object;
  };
  const text = scene.add.text;
  scene.add.text = (...args) => {
    const object = text(...args);
    object.setLetterSpacing = () => object;
    return object;
  };
  // Only omit unrelated renderer construction. Real create schedules the 300ms
  // intro and 620ms unlock; real modal methods, showTalk and update run unchanged.
  for (const name of ['buildEnemies', 'buildPlayerHud', 'buildHand', 'buildControls', 'drawPotions', 'refreshHand']) {
    scene[name] = () => {};
  }
  scene.create();
  const ticks = [];
  scene.battle.update = delta => ticks.push(delta);
  return { scene, view, ticks };
}

for (const modal of ['pause', 'rules', 'deck']) {
  test(`boss intro waits for ${modal} dismissal without hiding dialogue or unlocking combat`, () => {
    const { scene, view, ticks } = fixture();
    if (modal === 'deck') scene.openCodex('cards');
    else {
      scene.showPause();
      if (modal === 'rules') scene.showRules();
    }
    view.flushTimers(300);
    assert.equal(scene._dialogue, null, 'dialogue must not open behind an existing modal');
    assert.ok(scene._pendingTalk, 'intro remains pending');
    view.flushTimers(620);
    assert.equal(scene.uiLocked, true, 'animation completion cannot unlock a queued intro');
    scene.update(650, 16);
    assert.equal(ticks.length, 0, 'modal freezes combat');
    if (modal === 'deck') scene.togglePause();
    else scene.hidePause();
    assert.equal(scene._pauseLayer, null);
    assert.equal(scene._rules, null);
    assert.equal(scene._codex, null);
    scene.update(666, 16);
    assert.ok(scene._dialogue, 'pending intro opens as soon as blocking overlays close');
    assert.equal(!!scene._pendingTalk, false);
    assert.equal(ticks.length, 0, 'dialogue must open before advancing combat clock');
    scene._dialogue.close();
    assert.equal(scene.uiLocked, false);
    scene.update(682, 16);
    assert.deepEqual(ticks, [0.016], 'combat resumes only after dialogue is complete');
  });
}

test('ending a battle drops queued intro instead of showing it over the result transition', () => {
  const { scene, view } = fixture();
  scene.showPause();
  view.flushTimers(300);
  assert.ok(scene._pendingTalk);
  scene.onEnd('lose');
  assert.deepEqual(view.transitions, [['Result', { win: false }]]);
  scene.hidePause();
  scene.update(400, 16);
  assert.equal(!!scene._pendingTalk, false);
  assert.equal(scene._dialogue, null);
});

test('scene reentry clears queued boss dialogue from the previous encounter', () => {
  const { scene, view } = fixture();
  scene.showPause();
  view.flushTimers(300);
  assert.ok(scene._pendingTalk);
  // Phaser removes old scene timers/display objects on shutdown; init must also
  // discard logical pending state when reusing this same Scene instance.
  scene.events.emit('shutdown');
  scene.init({ type: 'battle', encounter: [{ id: 'shanxiao' }] });
  assert.equal(!!scene._pendingTalk, false);
  assert.equal(scene._dialogue, null);
  assert.equal(scene._pauseLayer, null);
});
