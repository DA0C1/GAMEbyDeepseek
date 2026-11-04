import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { random, setSeed } from '../src/core/random.js';
import { ensureCardTexture } from '../src/ui/cardRender.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => { save.load(); run.newRun(); setSeed(null); });
const card = (id, extra = {}) => ({ id, def: CARDS[id], up: false, ...extra });

function fixture(cards = [card('cijian'), card('yufeng')]) {
  run.player.relics = ['wuxing'];
  const battle = new Battle(run.player, [{ id: 'shanxiao' }]);
  battle.start(); battle.update(1);
  battle.enemies[0].hp = battle.enemies[0].maxHp = 1000;
  battle.hand = cards;
  const scene = new BattleScene();
  scene.init({}); fakeScene(scene);
  scene.battle = battle;
  const image = scene.add.image;
  scene.add.image = (x, y, key) => {
    const object = image(x, y, key);
    object.texture = { key };
    object.setTexture = function (next) { this.texture.key = next; return this; };
    object.clearTint = function () { return this; };
    return object;
  };
  battle.on('cardPlayed', () => scene.refreshHand());
  battle.on('draw', () => scene.refreshHand());
  battle.on('turnStart', () => scene.refreshHand());
  scene.refreshHand();
  return { scene, battle };
}

test('wuxing displays zero-cost playable cards at zero energy and updates on consumption/reset', () => {
  const { scene, battle } = fixture();
  battle.player.energy = 0;
  scene.updateHandState();
  assert.ok(scene.cardViews.every(view => view.img.texture.key.endsWith('_cost0')));
  assert.ok(scene.cardViews.every(view => !view.dimmed && battle.canPlay(view.card)));
  const remaining = battle.hand[1];
  assert.equal(battle.playCard(battle.hand[0], battle.enemies[0]), true);
  let view = scene.cardViews.find(candidate => candidate.card === remaining);
  assert.equal(view.img.texture.key, 'card_yufeng');
  assert.equal(view.dimmed, true, 'discount is spent and no energy remains');
  battle.startPlayerTurn(false);
  view = scene.cardViews.find(candidate => candidate.card === remaining);
  assert.equal(view.img.texture.key, 'card_yufeng_cost0');
  assert.equal(view.dimmed, false);
});

test('qing and free cards show zero without consuming the pending wuxing discount', () => {
  for (const first of [card('cijian', { rune: 'qing' }), card('zhongpi', { free: true })]) {
    save.load(); run.newRun();
    const expensive = card('zhongpi');
    const { scene, battle } = fixture([first, expensive]);
    battle.player.energy = 1;
    scene.updateHandState();
    assert.equal(scene.cardViews[0].img.texture.key,
      first.free ? 'card_zhongpi_free' : 'card_cijian_qing');
    assert.equal(scene.cardViews[1].img.texture.key, 'card_zhongpi_cost1');
    assert.equal(battle.playCard(first, battle.enemies[0]), true);
    assert.equal(battle.relics.find(relic => relic.id === 'wuxing').state.used, false);
    assert.equal(scene.cardViews.find(view => view.card === expensive).img.texture.key, 'card_zhongpi_cost1');
    assert.equal(battle.player.energy, 1);
  }
});

test('display-cost queries preserve card data, relic state, save data and the rule RNG', () => {
  const { scene, battle } = fixture();
  const before = JSON.stringify(battle), stored = JSON.stringify(save.data);
  const cards = battle.hand.slice(), states = battle.relics.map(relic => relic.state);
  setSeed(923); const next = random(); setSeed(923);
  for (let i = 0; i < 25; i++) scene.updateHandState();
  assert.equal(random(), next);
  assert.equal(JSON.stringify(battle), before);
  assert.equal(JSON.stringify(save.data), stored);
  assert.ok(cards.every((value, index) => value === battle.hand[index]));
  assert.ok(states.every((value, index) => value === battle.relics[index].state));
  setSeed(null);
});

function canvasScene() {
  const textures = new Map();
  return {
    captured: textures,
    textures: {
      exists: key => textures.has(key),
      createCanvas(key) {
        const writes = [];
        const state = { globalAlpha: 1 };
        const context = new Proxy(state, {
          get(target, name) {
            if (name in target) return target[name];
            if (name === 'measureText') return text => ({ width: String(text).length * 12 });
            if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (name === 'fillText') return (text, x, y) => writes.push({ text, x, y, font: target.font });
            return () => {};
          }
        });
        textures.set(key, writes);
        return { getContext: () => context, refresh() {} };
      }
    }
  };
}

test('printed battle costs use isolated cache keys while base, qing, free and X labels stay intact', () => {
  const scene = canvasScene();
  const samples = [
    [card('cijian'), 0, 'card_cijian_cost0', '0'],
    [card('cijian'), undefined, 'card_cijian', '1'],
    [card('cijian', { rune: 'qing' }), 0, 'card_cijian_qing', '0'],
    [card('zhongpi', { free: true }), 0, 'card_zhongpi_free', '0'],
    [card('fenxu'), 2, 'card_fenxu', 'X'],
    [card('fenxu', { free: true }), 2, 'card_fenxu_free', '0']
  ];
  for (const [value, cost, expectedKey, expectedLabel] of samples) {
    const before = JSON.stringify(value);
    const key = ensureCardTexture(scene, value, cost);
    assert.equal(key, expectedKey);
    const writes = scene.captured.get(key).filter(write => write.x === 0 && write.y === 1 && /^800 (30|34)px /.test(write.font));
    assert.deepEqual(writes.map(write => write.text), [expectedLabel], key);
    assert.equal(JSON.stringify(value), before, 'rendering cannot alter the actual card');
  }
  const base = ensureCardTexture(scene, card('cijian'));
  assert.equal(base, 'card_cijian', 'later deck/codex rendering cannot reuse the discounted battle face');
});

test('battle X cards retain X labels while free X cards retain their explicit zero', () => {
  const { scene, battle } = fixture([card('fenxu'), card('fenxu', { free: true })]);
  battle.player.energy = 5;
  scene.updateHandState();
  assert.equal(scene.cardViews[0].img.texture.key, 'card_fenxu');
  assert.equal(scene.cardViews[1].img.texture.key, 'card_fenxu_free');
});
