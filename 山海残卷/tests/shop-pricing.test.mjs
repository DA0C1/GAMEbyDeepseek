import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { save } from '../src/core/save.js';
import { run } from '../src/core/run.js';
import { RELICS } from '../src/data/relics.js';
import { audio } from '../src/core/audio.js';

installFakePhaser();
const { ShopScene } = await import('../src/scenes/ShopScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
audio.playBgm = () => {};
beforeEach(() => { save.load(); run.newRun(); run.player.gold = 1000; });
function shop() {
  const scene = new ShopScene();
  fakeScene(scene);
  scene.create();
  return scene;
}
function assertLabel(item) {
  assert.ok(item.btn.list.some(child => child.text === `${item.price} 墨`), 'visible price matches checkout');
}

test('buying suanpan discounts remaining stock but not its own or earlier paid price', () => {
  run.player.relics = Object.keys(RELICS).filter(id => id !== 'suanpan');
  const scene = shop();
  const cards = scene.items.filter(it => it.kind === 'card');
  const relic = scene.items.find(it => it.id === 'suanpan');
  scene.buy(cards[0]);
  scene.buy(relic);
  assert.equal(run.player.gold, 1000 - 46 - 128);
  assert.equal(cards[0].price, 46);
  assert.equal(relic.price, 128, 'the relic does not discount its own purchase');
  const remaining = scene.items.filter(it => !it.bought);
  assert.deepEqual(remaining.map(it => it.price), [44, 51, 24]);
  remaining.forEach(assertLabel);
  scene.buy(relic);
  assert.deepEqual(remaining.map(it => it.price), [44, 51, 24], 'duplicate buy does not stack discounts');
  const potion = remaining.find(it => it.kind === 'potion');
  scene.buy(potion);
  assert.equal(run.player.gold, 1000 - 46 - 128 - 24);
  assert.equal(cards[1].price, 44, 'later purchases do not compound the discount');
});

test('entering a shop with suanpan rounds once from each original base price', () => {
  run.player.relics = ['suanpan'];
  const scene = shop();
  assert.deepEqual(scene.items.map(it => it.price), [35, 44, 96, 51, 24]);
  scene.items.forEach(assertLabel);
  scene.buy(scene.items[0]);
  assert.equal(run.player.gold, 965);
  assert.deepEqual(scene.items.slice(1).map(it => it.price), [44, 96, 51, 24]);
});
