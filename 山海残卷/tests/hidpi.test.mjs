import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HI, hidpiSize, installHiDPI } from '../src/core/hidpi.js';

function environment(width = 1600, dpr = 2) {
  const listeners = new Map();
  globalThis.window = {
    innerWidth: width, devicePixelRatio: dpr, screen: { width },
    addEventListener(name, fn) { listeners.set(name, fn); }
  };
  class Factory {
    text(x, y, value, style) {
      return { x, y, value, style, setResolution(n) { this.resolution = n; } };
    }
  }
  globalThis.Phaser = { GameObjects: { GameObjectFactory: Factory } };
  const camera = () => ({
    setSize(w, h) { this.size = [w, h]; },
    setZoom(n) { this.zoom = n; },
    centerOn(x, y) { this.center = [x, y]; }
  });
  return { listeners, Factory, camera };
}

test('loading scenes receive HiDPI cameras before preload draws their progress UI', () => {
  const { camera, Factory } = environment();
  const expected = { size: [3200, 1800], zoom: 2, center: [800, 450] };
  let preloads = 0, creates = 0;
  class LoadingScene {
    preload(value) {
      preloads++;
      for (const cam of this.cameras.cameras) {
        assert.deepEqual(cam.size, expected.size, 'preload must not draw on an unscaled camera');
        assert.equal(cam.zoom, expected.zoom);
        assert.deepEqual(cam.center, expected.center);
      }
      assert.equal(value, 'load argument');
      return 'load result';
    }
    create(value) { creates++; assert.equal(value, 'create argument'); return 'create result'; }
  }
  installHiDPI([LoadingScene]);
  const scene = new LoadingScene();
  scene.cameras = { cameras: [camera(), camera()] };
  assert.equal(scene.preload('load argument'), 'load result');
  assert.equal(scene.create('create argument'), 'create result');
  assert.equal(preloads, 1);
  assert.equal(creates, 1);
  assert.deepEqual(hidpiSize(), { width: 3200, height: 1800 });
  const text = new Factory().text(1, 2, '进度', { fontSize: 20 });
  assert.equal(text.resolution, 2);
  assert.equal(text.value, '进度');
});

test('HiDPI scale is bounded and lifecycle wrappers tolerate scenes without hooks', () => {
  for (const [width, dpr, expected] of [[800, 1, 1], [1200, 2, 1.5], [4000, 2, 2]]) {
    const { camera } = environment(width, dpr);
    class EmptyScene {}
    installHiDPI([EmptyScene]);
    const scene = new EmptyScene();
    scene.cameras = { cameras: [camera()] };
    assert.doesNotThrow(() => { scene.preload(); scene.create(); });
    assert.equal(HI.s, expected);
    assert.equal(scene.cameras.cameras[0].zoom, expected);
    assert.deepEqual(hidpiSize(), { width: Math.round(1600 * expected), height: Math.round(900 * expected) });
  }
});

test('window resizing updates active cameras and nested text after the debounce', () => {
  const { listeners, camera } = environment(1600, 1);
  class Scene {}
  installHiDPI([Scene]);
  const resized = [], resolutions = [];
  const scene = new Scene();
  scene.cameras = { cameras: [camera()] };
  const text = { type: 'Text', setResolution(n) { resolutions.push(n); } };
  scene.children = { list: [{ type: 'Container', list: [text] }] };
  scene.create();
  window.__game = {
    scale: { resize(w, h) { resized.push([w, h]); } },
    scene: { getScenes(active) { assert.equal(active, false); return [scene]; } }
  };
  const oldSetTimeout = globalThis.setTimeout, oldClearTimeout = globalThis.clearTimeout;
  const pending = new Map();
  let sequence = 0;
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 180); pending.set(++sequence, fn); return sequence; };
  globalThis.clearTimeout = id => pending.delete(id);
  try {
    window.innerWidth = 2400;
    listeners.get('resize')(); listeners.get('resize')();
    assert.equal(pending.size, 1, 'successive resize events replace the pending relayout');
    assert.equal(HI.s, 1, 'do not relayout until the debounce expires');
    [...pending.values()][0]();
    assert.equal(HI.s, 1.5);
    assert.deepEqual(resized, [[2400, 1350]]);
    assert.deepEqual(resolutions, [1.5]);
    assert.equal(scene.cameras.cameras[0].zoom, 1.5);
    pending.clear();
    window.innerWidth = 2401;
    listeners.get('resize')();
    [...pending.values()][0]();
    assert.equal(resized.length, 1, 'sub-threshold changes avoid rebuilding the canvas');
  } finally {
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  }
});

test('resize updates paused scene cameras and text before Settings resumes them', () => {
  const { listeners, camera } = environment(1600, 1);
  class Scene {}
  installHiDPI([Scene]);
  const paused = new Scene(), settings = new Scene();
  const pausedResolutions = [], activeResolutions = [], sizes = [];
  for (const [scene, resolutions] of [[paused, pausedResolutions], [settings, activeResolutions]]) {
    scene.cameras = { cameras: [camera()] };
    scene.children = { list: [{ type: 'Container', list: [
      { type: 'Text', setResolution(value) { resolutions.push(value); } }
    ] }] };
    scene.create();
  }
  window.__game = {
    scale: { resize(w, h) { sizes.push([w, h]); } },
    scene: { getScenes(activeOnly) {
      // Paused scenes still render beneath Settings but are not active.
      return activeOnly ? [settings] : [{}, { cameras: null, children: null }, paused, settings];
    } }
  };
  const oldSetTimeout = globalThis.setTimeout, oldClearTimeout = globalThis.clearTimeout;
  let callback;
  globalThis.setTimeout = fn => { callback = fn; return 1; };
  globalThis.clearTimeout = () => {};
  try {
    window.innerWidth = 2400;
    listeners.get('resize')();
    assert.doesNotThrow(() => callback(), 'unstarted/stopped scenes with no camera or display list must be harmless');
    assert.deepEqual(sizes, [[2400, 1350]]);
    for (const scene of [paused, settings]) {
      assert.equal(scene.cameras.cameras[0].zoom, 1.5);
      assert.deepEqual(scene.cameras.cameras[0].size, [2400, 1350]);
      assert.deepEqual(scene.cameras.cameras[0].center, [800, 450]);
    }
    assert.deepEqual(pausedResolutions, [1.5]);
    assert.deepEqual(activeResolutions, [1.5]);
  } finally {
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  }
});
