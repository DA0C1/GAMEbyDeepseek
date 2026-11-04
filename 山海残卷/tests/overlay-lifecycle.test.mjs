import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { RELICS } from '../src/data/relics.js';
import { save } from '../src/core/save.js';
import { openOverlay } from '../src/ui/overlays.js';
import { showDialogue } from '../src/ui/dialogue.js';

installFakePhaser();
const { CodexScene } = await import('../src/scenes/CodexScene.js');
const pointerEvent = { stopPropagation() {} };

function clickLayerButton(layer, label) {
  const index = layer.list.findIndex(child => child.type === 'Text' && child.text === label);
  assert.ok(index >= 0, `missing overlay button ${label}`);
  layer.list[index + 1].emit('pointerdown', {}, 0, 0, pointerEvent);
}

test('relic overlay panels belong to content and repeated paging/closing leaves no graphics', () => {
  const scene = {}, view = fakeScene(scene);
  const relics = Object.keys(RELICS).slice(0, 9);
  assert.equal(relics.length, 9, 'exercise two pages');
  for (let cycle = 0; cycle < 3; cycle++) {
    const overlay = openOverlay(scene, { kind: 'relics', relics });
    const content = overlay.layer.list.find(child => child.type === 'Container');
    const assertOwnership = expected => {
      const graphics = content.list.filter(child => child.type === 'Graphics');
      assert.equal(graphics.length, expected * 2, 'each relic owns its panel and icon backing');
      assert.equal(view.objects.filter(object => !object.destroyed && object.type === 'Graphics' &&
        !object.parentContainer).length, 0, 'all graphics must belong to the overlay');
    };
    assertOwnership(8);
    for (let pageCycle = 0; pageCycle < 3; pageCycle++) {
      clickLayerButton(overlay.layer, '›');
      assertOwnership(1);
      clickLayerButton(overlay.layer, '‹');
      assertOwnership(8);
    }
    overlay.close();
    assert.equal(view.objects.filter(object => !object.destroyed && object.type !== 'Keyboard').length, 0);
  }
});

test('dialogue close stops its type timer and infinite hint tween and completes only once', () => {
  const scene = {}, view = fakeScene(scene);
  scene.time.addEvent = config => {
    const timer = { ...config, removed: false, remove() { this.removed = true; } };
    view.timers.push(timer);
    return timer;
  };
  let completions = 0;
  const dialogue = showDialogue(scene, { lines: ['尚未打完的一句话'], onDone: () => completions++ });
  assert.equal(view.timers.length, 1);
  assert.equal(view.tweens.filter(tween => tween.repeat === -1).length, 1);
  dialogue.close();
  dialogue.close();
  dialogue.advance();
  assert.equal(completions, 1);
  assert.equal(scene._dialogue, null);
  assert.ok(view.timers.every(timer => timer.removed), 'typing timer removed');
  assert.ok(view.tweens.filter(tween => tween.repeat === -1).every(tween => tween.canceled),
    'destroying the hint alone does not cancel a Phaser tween');
  assert.equal(view.objects.filter(object => !object.destroyed && object.type !== 'Keyboard').length, 0);
});

test('Codex tab changes and collectible details retain no abandoned display objects', () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  save.load();
  const scene = new CodexScene(), view = fakeScene(scene);
  const graphics = scene.add.graphics;
  scene.add.graphics = (...args) => {
    const object = graphics(...args);
    for (const method of ['fillGradientStyle', 'arc', 'closePath', 'fillPath']) object[method] = () => object;
    return object;
  };
  scene.init();
  scene.create();
  const outsideContent = () => view.objects.filter(object => !object.destroyed && !scene._content.includes(object));
  const initial = new Set(outsideContent());
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let tab = 0; tab < 7; tab++) {
      scene.switchTab(tab);
      scene.turnPage(1);
      scene.turnPage(-1);
      assert.deepEqual(new Set(outsideContent()), initial);
    }
  }
  const detailMethods = { cards: 'showCard', foes: 'showFoe', relics: 'showRelic',
    potions: 'showPotion', pages: 'showPage', archive: 'showArchive' };
  for (const [kind, method] of Object.entries(detailMethods)) {
    for (const entry of scene.entries[kind]) {
      scene[method](entry);
      assert.ok(scene._detail);
      scene.closeDetail();
      scene.closeDetail();
      assert.equal(scene._detail, null);
      assert.deepEqual(new Set(outsideContent()), initial, `${kind}: ${entry.id}`);
    }
  }
});
