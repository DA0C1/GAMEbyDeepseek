import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { audio } from '../src/core/audio.js';
import { save } from '../src/core/save.js';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';

installFakePhaser();
const { BootScene } = await import('../src/scenes/BootScene.js');

function replaceGlobal(t, key, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete globalThis[key];
  });
}

function setup(t) {
  replaceGlobal(t, 'localStorage', { getItem: () => null, setItem() {} });
  save.load();
}

function bgmScene() {
  const fades = [], sounds = [];
  return {
    fades, sounds,
    sound: {
      add(key, options) {
        const sound = {
          key, volume: options.volume, isPlaying: false,
          play() { this.isPlaying = true; },
          stop() { this.isPlaying = false; },
          destroy() { this.destroyed = true; this.isPlaying = false; },
          setVolume(volume) { this.volume = volume; return this; }
        };
        sounds.push(sound);
        return sound;
      }
    },
    cache: { audio: { exists: () => true } },
    tweens: {
      add(config) {
        const fade = { ...config, stopped: false,
          stop() { this.stopped = true; }, remove() { this.stopped = true; } };
        fades.push(fade);
        return fade;
      },
      killTweensOf(target) { fades.filter(f => f.targets === target).forEach(f => f.stop()); }
    },
    finishFades() {
      for (const fade of fades) {
        if (!fade.stopped) { fade.targets.volume = fade.volume; fade.onComplete?.(); }
      }
    }
  };
}

test('music volume changes apply before the procedural audio context has unlocked', t => {
  setup(t);
  const manager = new audio.constructor();
  const scene = bgmScene();
  manager.playBgm(scene, 'bgm_title');
  scene.finishFades();
  assert.equal(manager.ready, false);
  assert.equal(manager.bgm.volume, 0.42);
  save.data.settings.music = 0;
  manager.setVolumes();
  assert.equal(manager.bgm.volume, 0, 'MP3 mute must not depend on procedural AudioContext readiness');
});

test('a pending music fade cannot overwrite a newer volume setting', t => {
  setup(t);
  const manager = new audio.constructor();
  manager.ready = true;
  manager.sfxBus = { gain: { value: 0.8 } };
  manager.musicBus = { gain: { value: 0.42 } };
  const scene = bgmScene();
  manager.playBgm(scene, 'bgm_title');
  save.data.settings.music = 0;
  manager.setVolumes();
  scene.finishFades();
  assert.equal(manager.bgm.volume, 0, 'an older fade target must not restore sound after mute');
});

test('the first user gesture initializes sound after Boot has already shut down', t => {
  setup(t);
  let contexts = 0;
  const parameter = () => ({ value: 0 });
  class AudioContextStub {
    constructor() {
      contexts++;
      this.state = 'suspended';
      this.sampleRate = 100;
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() { return { gain: parameter(), connect() {} }; }
    createDynamicsCompressor() {
      return { threshold: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect() {} };
    }
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const windowTarget = new EventTarget();
  windowTarget.AudioContext = AudioContextStub;
  const documentTarget = new EventTarget();
  const canvas = new EventTarget();
  replaceGlobal(t, 'window', windowTarget);
  replaceGlobal(t, 'document', documentTarget);
  const previousAudio = { ...audio };
  Object.assign(audio, new audio.constructor());
  t.after(() => { audio.stopProcedural(); Object.assign(audio, previousAudio); });

  const scene = new BootScene();
  fakeScene(scene);
  scene.buildUiTextures = () => {};
  scene.input = new EventEmitter();
  scene.input.keyboard = new EventEmitter();
  scene.game = { canvas, events: new EventEmitter() };
  scene.sys = { game: scene.game, events: new EventEmitter() };
  const transitions = [];
  scene.scene.start = key => {
    transitions.push(key);
    // Phaser shuts down Boot's input plugin immediately when entering Preload.
    scene.input.removeAllListeners();
    scene.input.keyboard.removeAllListeners();
    scene.sys.events.emit('shutdown');
  };
  scene.create();
  assert.deepEqual(transitions, ['Preload']);
  assert.equal(contexts, 0, 'audio creation should wait for an actual gesture');
  for (const target of [windowTarget, documentTarget, canvas]) target.dispatchEvent(new Event('pointerdown'));
  assert.equal(audio.ready, true, 'unlock listener must survive the Boot scene transition');
  assert.equal(contexts, 1);
  for (const target of [windowTarget, documentTarget, canvas]) target.dispatchEvent(new Event('pointerdown'));
  assert.equal(contexts, 1, 'later gestures reuse the initialized audio context');
});

test('switching music destroys the old sound and cancels its pending fade', t => {
  setup(t);
  const manager = new audio.constructor(), scene = bgmScene();
  manager.playBgm(scene, 'bgm_title');
  const old = manager.bgm;
  manager.playBgm(scene, 'bgm_map');
  assert.equal(old.destroyed, true);
  assert.equal(old.isPlaying, false);
  assert.equal(scene.fades[0].stopped, true);
  assert.equal(manager.bgm.key, 'bgm_map');
  const current = manager.bgm;
  manager.playBgm(scene, 'bgm_map');
  assert.equal(manager.bgm, current, 'same playing track is reused');
  assert.equal(scene.sounds.length, 2);
  manager.stopBgm();
  assert.equal(current.destroyed, true);
});

test('same music settles at the saved volume after its original scene fade is interrupted', t => {
  setup(t);
  const manager = new audio.constructor();
  const firstScene = bgmScene(), nextScene = bgmScene();
  manager.playBgm(firstScene, 'bgm_map');
  const original = manager.bgm;
  original.volume = 0.07;
  original.seek = 12.5;
  firstScene.fades[0].stop(); // The scene's tween manager shuts down on transition.
  manager.playBgm(nextScene, 'bgm_map');
  assert.equal(manager.bgm, original, 'reuse the playing track instead of restarting it');
  assert.equal(original.seek, 12.5);
  assert.equal(original.volume, save.data.settings.music);
  assert.equal(original.isPlaying, true);
  assert.equal(nextScene.sounds.length, 0);
  manager.stopBgm();
});

test('repeated unlock installation resumes once per gesture and can be removed', t => {
  setup(t);
  // This Node runtime fails to normalize a boolean capture argument on removal;
  // browsers support it. Normalize here rather than assert against Node's quirk.
  class BrowserTarget extends EventTarget {
    removeEventListener(type, listener, options) {
      return super.removeEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
    }
  }
  const manager = new audio.constructor(), target = new BrowserTarget();
  let resumes = 0;
  manager.ready = true;
  manager.ctx = { state: 'suspended', resume() { resumes++; return Promise.resolve(); } };
  t.after(() => manager.removeUnlock());
  manager.installUnlock(target);
  manager.installUnlock(target);
  target.dispatchEvent(new Event('pointerdown'));
  assert.equal(resumes, 1);
  target.dispatchEvent(new Event('keydown'));
  assert.equal(resumes, 2);
  manager.removeUnlock();
  target.dispatchEvent(new Event('pointerdown'));
  assert.equal(resumes, 2);
});

test('missing music remembers its procedural fallback until audio unlocks', t => {
  setup(t);
  const intervals = new Map();
  let timerId = 0;
  replaceGlobal(t, 'setInterval', callback => { intervals.set(++timerId, callback); return timerId; });
  replaceGlobal(t, 'clearInterval', id => intervals.delete(id));
  const parameter = () => ({ value: 0 });
  class Context {
    constructor() { this.state = 'running'; this.sampleRate = 100; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: parameter(), connect() {} }; }
    createDynamicsCompressor() { return { threshold: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect() {} }; }
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; }
  }
  replaceGlobal(t, 'window', { AudioContext: Context });
  const manager = new audio.constructor(), scene = bgmScene();
  scene.cache.audio.exists = () => false;
  manager.playBgm(scene, 'bgm_battle');
  assert.equal(intervals.size, 0, 'no procedural timer before unlock');
  assert.equal(manager.ensure(), true);
  assert.equal(intervals.size, 1, 'unlock starts the pending fallback');
  assert.equal(manager.procMode, 'bgm_battle');
  manager.ensure();
  assert.equal(intervals.size, 1);
  manager.stopBgm();
  assert.equal(intervals.size, 0);
  manager.ensure();
  assert.equal(intervals.size, 0, 'stopped fallback must not restart on later gestures');
});

test('fallback percussion uses the music bus and scheduled beat time while normal drums remain SFX', t => {
  setup(t);
  let tick;
  replaceGlobal(t, 'setInterval', callback => { tick = callback; return 1; });
  replaceGlobal(t, 'clearInterval', () => {});
  const manager = new audio.constructor();
  const oscillators = [], gains = [];
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  manager.ready = true;
  manager.sfxBus = { gain: { value: 0.8 } };
  manager.musicBus = { gain: { value: 0 } };
  manager.ctx = {
    currentTime: 10,
    createOscillator() {
      const oscillator = { frequency: parameter(), connect() {}, start(time) { this.startTime = time; }, stop(time) { this.stopTime = time; } };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = { gain: parameter(), connect(bus) { this.bus = bus; } };
      gains.push(gain);
      return gain;
    }
  };
  manager.pluck = () => {}; // Inspect real drum routing without synthesizing string buffers.
  manager.startProcedural('bgm_battle');
  t.after(() => manager.stopProcedural());
  tick();
  const beatTime = 10.2 + 4 * (60 / 64 / 4);
  manager.ctx.currentTime = beatTime - 0.1;
  tick();
  assert.equal(oscillators.length, 1);
  assert.equal(gains[0].bus, manager.musicBus, 'muting music must also mute fallback percussion');
  assert.ok(Math.abs(oscillators[0].startTime - beatTime) < 1e-9, 'percussion must use the future beat time, not scheduler callback time');
  assert.ok(Math.abs(oscillators[0].stopTime - (beatTime + 0.18)) < 1e-9);
  manager.drum(120, 0.2, 0.3);
  assert.equal(gains[1].bus, manager.sfxBus, 'ordinary combat drums still follow SFX volume');
  assert.equal(oscillators[1].startTime, manager.ctx.currentTime);
});

test('delayed fallback callbacks skip stale beats instead of scheduling catch-up bursts', t => {
  setup(t);
  let tick;
  replaceGlobal(t, 'setInterval', callback => { tick = callback; return 1; });
  replaceGlobal(t, 'clearInterval', () => {});
  const manager = new audio.constructor();
  manager.ready = true;
  manager.ctx = { currentTime: 10 };
  const starts = [];
  manager.pluck = (_freq, _vol, _bright, when) => starts.push(when);
  manager.drum = (_low, _vol, _dur, when) => starts.push(when);
  manager.startProcedural('bgm_battle');
  t.after(() => manager.stopProcedural());
  tick();
  starts.length = 0;
  manager.ctx.currentTime = 70;
  tick();
  assert.ok(starts.every(time => time >= manager.ctx.currentTime), 'a delayed timer must never schedule voices in the past');
  assert.ok(manager.procNext >= manager.ctx.currentTime, 'scheduler must advance to the present rather than slowly drain old beats');
  let emitted = starts.length;
  for (let i = 0; i < 12; i++) {
    manager.ctx.currentTime += 0.1;
    starts.length = 0;
    tick();
    assert.ok(starts.every(time => time >= manager.ctx.currentTime));
    emitted += starts.length;
  }
  assert.ok(emitted > 0, 'music must continue producing future beats after the delay');
});

test('boss warnings emit enabled SFX but remain silent when SFX is muted', t => {
  setup(t);
  const manager = new audio.constructor();
  manager.ready = true;
  manager.ctx = { currentTime: 10 };
  const calls = [];
  for (const method of ['drum', 'bell', 'pluck', 'noiseBurst']) {
    manager[method] = (...args) => calls.push({ method, args });
  }
  manager.sfx('bossWarn');
  assert.ok(calls.length > 0, 'phase/enrage warnings must produce an audio output call');
  assert.ok(calls.every(call => call.args.every(value => typeof value !== 'number' || Number.isFinite(value))));
  calls.length = 0;
  manager.ctx.currentTime += 10;
  save.data.settings.sfx = 0;
  manager.sfx('bossWarn');
  assert.deepEqual(calls, [], 'muted SFX must not emit warning voices');
});

test('audio throttling recognizes timestamp zero and permits the exact interval boundary', t => {
  setup(t);
  const manager = new audio.constructor();
  manager.ctx = { currentTime: 0 };
  assert.equal(manager.gate('click', 40), true);
  assert.equal(manager.gate('click', 40), false, 'zero is a valid previous sound timestamp');
  manager.ctx.currentTime = 0.039999;
  assert.equal(manager.gate('click', 40), false);
  manager.ctx.currentTime = 0.04;
  assert.equal(manager.gate('click', 40), true);
  assert.equal(manager.gate('click', 40), false);
  assert.equal(manager.gate('other', 40), true, 'different sound gates remain independent');
});
