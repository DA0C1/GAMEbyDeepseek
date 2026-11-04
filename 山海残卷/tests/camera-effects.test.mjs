import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HI, installHiDPI } from '../src/core/hidpi.js';
import { zoomPunch } from '../src/core/fx.js';

function cameraScene() {
  const tweens = [];
  const camera = {
    zoom: 1, setSize() {}, setZoom(n) { this.zoom = n; }, centerOn() {}
  };
  const scene = {
    cameras: { main: camera, cameras: [camera] }, children: { list: [] },
    tweens: {
      add(config) { tweens.push(config); return { stop() { config.canceled = true; } }; },
      killTweensOf(target) { tweens.filter(tween => tween.targets === target).forEach(tween => { tween.canceled = true; }); }
    }
  };
  const finish = () => {
    for (const tween of tweens) {
      if (!tween.canceled && !tween.completed) { tween.completed = true; tween.onComplete?.(); }
    }
  };
  return { scene, camera, tweens, finish };
}

test('camera punch returns to its original scale and permits later impacts', () => {
  const { scene, camera, tweens, finish } = cameraScene();
  camera.zoom = 1.5;
  zoomPunch(scene);
  zoomPunch(scene);
  assert.equal(tweens.length, 1, 'overlapping hits do not accumulate zoom');
  camera.zoom = 1.514;
  finish();
  assert.equal(camera.zoom, 1.5);
  assert.equal(camera._zoomPunch, false);
  zoomPunch(scene);
  assert.equal(tweens.length, 2);
});

test('HiDPI resize cancels a paused camera punch instead of restoring obsolete zoom on resume', t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldPhaser = Object.getOwnPropertyDescriptor(globalThis, 'Phaser');
  const oldTimeout = globalThis.setTimeout, oldClear = globalThis.clearTimeout, oldScale = HI.s;
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldPhaser) Object.defineProperty(globalThis, 'Phaser', oldPhaser); else delete globalThis.Phaser;
    globalThis.setTimeout = oldTimeout; globalThis.clearTimeout = oldClear; HI.s = oldScale;
  });
  const events = new Map();
  globalThis.window = { innerWidth: 1600, devicePixelRatio: 1, screen: { width: 1600 }, addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.Phaser = { GameObjects: { GameObjectFactory: class { text() { return { setResolution() {} }; } } } };
  installHiDPI([]);
  const { scene, camera, tweens, finish } = cameraScene();
  window.__game = { scale: { resize() {} }, scene: { getScenes(activeOnly) { assert.equal(activeOnly, false); return [scene]; } } };
  let resize;
  globalThis.setTimeout = callback => { resize = callback; return 1; };
  globalThis.clearTimeout = () => {};
  zoomPunch(scene);
  camera.zoom = 1.014;
  window.innerWidth = 2400;
  events.get('resize')();
  resize();
  assert.equal(camera.zoom, 1.5);
  assert.equal(tweens[0].canceled, true, 'resizing invalidates the old punch baseline');
  assert.equal(camera._zoomPunch, false);
  finish();
  assert.equal(camera.zoom, 1.5, 'resuming the scene must not restore scale1');
  zoomPunch(scene);
  assert.equal(tweens.length, 2, 'new impacts are still available at the resized scale');
  finish();
  assert.equal(camera.zoom, 1.5);
});
