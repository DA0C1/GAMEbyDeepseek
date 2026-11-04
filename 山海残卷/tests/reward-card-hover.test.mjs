import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { save } from '../src/core/save.js';
import { run } from '../src/core/run.js';

installFakePhaser();
const { RewardScene } = await import('../src/scenes/RewardScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); });

function fixture() {
  const scene = new RewardScene(), view = fakeScene(scene);
  const image = scene.add.image;
  scene.add.image = (...args) => {
    const object = image(...args);
    // Match Phaser: setting display size changes scale, not source dimensions.
    object.width = 306; object.height = 429;
    object.setDisplaySize = (width, height) => {
      object.scaleX = width / object.width;
      object.scaleY = height / object.height;
      return object;
    };
    return object;
  };
  scene.init({});
  scene.showCards();
  const cards = view.objects.filter(object => object.type === 'Image' && object.data?.aiCard);
  const finish = () => {
    for (const tween of view.tweens.filter(tween => !tween.completed && !tween.canceled)) {
      tween.completed = true;
      const targets = Array.isArray(tween.targets) ? tween.targets : [tween.targets];
      for (const target of targets) {
        for (const key of ['scaleX', 'scaleY']) if (typeof tween[key] === 'number') target[key] = tween[key];
      }
      tween.onComplete?.();
    }
  };
  return { cards, finish };
}
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('leaving a reward card before its hover tween finishes restores its base size', () => {
  const { cards, finish } = fixture();
  for (const card of cards) {
    const base = { x: card.scaleX, y: card.scaleY };
    card.emit('pointerover');
    card.emit('pointerout');
    finish();
    closeTo(card.scaleX, base.x);
    closeTo(card.scaleY, base.y);
  }
});

test('repeated reward hover interruptions never compound scaling', () => {
  const { cards, finish } = fixture();
  const card = cards[0], base = { x: card.scaleX, y: card.scaleY };
  for (let cycle = 0; cycle < 20; cycle++) {
    card.emit('pointerover');
    card.emit('pointerout');
    finish();
    closeTo(card.scaleX, base.x);
    closeTo(card.scaleY, base.y);
    card.emit('pointerover');
    finish();
    closeTo(card.scaleX, base.x * 1.04);
    closeTo(card.scaleY, base.y * 1.04);
    // A repeated entry must target the original baseline, not current×1.04.
    card.emit('pointerover');
    finish();
    closeTo(card.scaleX, base.x * 1.04);
    card.emit('pointerout');
    finish();
    closeTo(card.scaleX, base.x);
  }
});
