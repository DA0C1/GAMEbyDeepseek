import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
beforeEach(() => { save.load(); run.newRun(); });
const card = id => ({ id, def: CARDS[id], up: false });

function fixture() {
  const battle = new Battle(run.player, [{ id: 'shanxiao' }]);
  battle.start();
  const scene = new BattleScene();
  scene.init({});
  fakeScene(scene);
  scene.battle = battle;
  // Keep production HUD methods and event bindings. Only unrelated hand/enemy
  // rendering is substituted so no Canvas or actual animation loop is needed.
  for (const name of ['refreshHand', 'drawEnergy', 'refreshEnemyBars', 'updateEnemyIntents', 'updateHandState']) {
    scene[name] = () => {};
  }
  scene.playerView = { x: 300, y: 500 };
  scene.playerHpT = scene.add.text(0, 0, '');
  scene.wireEvents();
  scene.refreshPiles();
  return { scene, battle };
}

function assertPiles(scene, battle, context) {
  assert.equal(scene.pileT.text,
    `抽 ${battle.drawPile.length}   弃 ${battle.discardPile.length}   耗 ${battle.exhaustPile.length}`, context);
}

test('pile HUD follows opening draw, additional draws, discard and a following turn', () => {
  const { scene, battle } = fixture();
  assertPiles(scene, battle, 'before opening draw');
  battle.update(1);
  assert.equal(battle.hand.length, 5);
  assertPiles(scene, battle, 'opening draw');
  battle.draw(2);
  assertPiles(scene, battle, 'additional card or potion draw');
  battle.discardAll();
  assertPiles(scene, battle, 'discarding every held card');
  battle.startPlayerTurn(false);
  assertPiles(scene, battle, 'next player turn');
});

test('pile HUD follows reshuffling and newly created enemy curses', () => {
  const { scene, battle } = fixture();
  battle.update(1);
  battle.hand = [];
  battle.drawPile = [];
  battle.discardPile = [card('cijian'), card('yufeng'), card('mojian')];
  scene.refreshPiles();
  battle.draw(1);
  assert.equal(battle.drawPile.length, 2);
  assert.equal(battle.discardPile.length, 0);
  assertPiles(scene, battle, 'reshuffle and draw');
  battle.addCurse(2);
  assert.equal(battle.discardPile.length, 2);
  assertPiles(scene, battle, 'enemy-created curses');
});

test('end-turn exhaustion updates the exhaust pile separately from ordinary discards', () => {
  const { scene, battle } = fixture();
  battle.update(1);
  battle.hand = [card('mihuo'), card('suishi')];
  battle.discardPile = [];
  battle.exhaustPile = [];
  scene.refreshPiles();
  battle.endTurn();
  assert.deepEqual(battle.exhaustPile.map(c => c.id), ['mihuo']);
  assert.deepEqual(battle.discardPile.map(c => c.id), ['suishi']);
  assertPiles(scene, battle, 'end-turn exhaustion');
});

test('the player HP label never displays a negative value during lethal damage events', () => {
  const { scene, battle } = fixture();
  battle.update(1);
  battle.player.hp = 1;
  battle.hurtPlayer(9);
  assert.equal(battle.phase, 'lost');
  assert.equal(battle.player.hp, 0);
  assert.equal(scene.playerHpT.text, `0 / ${battle.player.maxHp}`);
});
