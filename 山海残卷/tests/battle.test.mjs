import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
};
save.load();

function fixture(relics = []) {
  const player = run.newRun();
  player.relics = relics;
  player.hp = 40;
  const battle = new Battle(player, [{ id: 'shanxiao' }, { id: 'qiongqi' }]);
  battle.start();
  return battle;
}

function defeat(battle, enemy) {
  battle.damage(enemy, enemy.maxHp * 10, { raw: true, pierce: true, silent: true });
  battle.checkWin();
}

test('victory invokes gourd and coin rewards once, before the win event', () => {
  const battle = fixture(['hulu', 'tongqian']);
  let wins = 0;
  let ends = 0;
  let rewardAtWin;
  let endResult;
  battle.on('win', () => {
    wins++;
    rewardAtWin = { heal: battle.outHeal, gold: battle.bonusGold };
  });
  battle.on('end', (result) => { endResult = result; ends++; });
  defeat(battle, battle.enemies[0]);
  assert.equal(battle.outHeal, 0, 'one defeated enemy is not a battle victory');
  defeat(battle, battle.enemies[1]);
  battle.checkWin();
  battle.update(2);
  battle.update(2);
  assert.equal(wins, 1);
  assert.equal(ends, 1);
  assert.equal(endResult, 'win');
  assert.deepEqual(rewardAtWin, { heal: 9, gold: 18 });
  assert.equal(battle.outHeal, 9);
  assert.equal(battle.bonusGold, 18);
  assert.equal(run.heal(battle.outHeal), 9);
  assert.equal(run.player.hp, 49);
});

test('defeat does not award victory relics', () => {
  const battle = fixture(['hulu', 'tongqian']);
  battle.lose();
  battle.update(2);
  battle.checkWin();
  assert.equal(battle.outHeal, 0);
  assert.equal(battle.bonusGold, 0);
});

test('post-battle healing respects maximum health and ascension reduction', () => {
  fixture(['hulu']);
  run.player.hp = run.player.maxHp - 2;
  assert.equal(run.heal(9), 2);
  run.player.hp = 40;
  const mods = save.ascensionMods;
  try {
    save.ascensionMods = () => ({ healCut: 0.85 });
    assert.equal(run.heal(9), 8);
  } finally { save.ascensionMods = mods; }
});

test('battle inputs are blocked by every modal, including pointer release', async () => {
  globalThis.Phaser = { Scene: class {} };
  const { BattleScene } = await import('../src/scenes/BattleScene.js');
  for (const flag of ['_dialogue', '_codex', '_rules', '_pauseLayer']) {
    const scene = new BattleScene();
    scene.init({});
    scene.uiLocked = false;
    scene.battle = { phase: 'player' };
    scene[flag] = {};
    scene.dragging = {};
    assert.equal(scene.isInputBlocked(), true, flag);
    // Any accidental dispatch would access the missing card/battle methods and fail.
    scene.onPointerDown({ worldX: 800, worldY: 700 });
    scene.onPointerMove({ worldX: 800, worldY: 500 });
    scene.onPointerUp({ worldX: 800, worldY: 500 });
    scene.endTurn();
    scene.usePotionAt(0);
    scene.playCard({}, {});
    scene.onEnemyClick({ alive: true });
  }
});
