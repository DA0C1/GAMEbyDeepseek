import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeButton } from '../src/ui/widgets.js';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { audio } from '../src/core/audio.js';
installFakePhaser();
audio.sfx = () => {};

test('the first button click is accepted even within the first 320ms', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 0 } });
  t.after(() => Object.defineProperty(globalThis, 'performance', original));
  const scene = {}, view = fakeScene(scene);
  let calls = 0;
  const button = makeButton(scene, 0, 0, 100, 50, 'test', () => calls++);
  button.zone.emit('pointerdown');
  view.flushTimers(40);
  assert.equal(calls, 1);
});

test('destroying a button cancels its queued action and swallows pointer propagation', () => {
  const scene = {}, view = fakeScene(scene);
  let calls = 0, stopped = 0;
  const button = makeButton(scene, 0, 0, 100, 50, 'test', () => calls++);
  button.zone.emit('pointerdown', {}, 0, 0, { stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  button.destroy();
  view.flushTimers(40);
  assert.equal(calls, 0);
  assert.equal(button.zone.destroyed, true);
});
