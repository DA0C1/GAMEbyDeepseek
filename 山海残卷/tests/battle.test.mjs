import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { CARDS } from '../src/data/cards.js';

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

test('end-turn relic victory stays terminal and rewards only once', () => {
  const battle = fixture(['tiejia', 'hulu', 'tongqian']);
  battle.update(1);
  defeat(battle, battle.enemies[0]);
  battle.enemies[1].hp = 1;
  battle.player.block = 20;
  battle.player.hp = 1;
  battle.player.buffs.burn = 2;
  let wins = 0, ends = 0, enemyTurns = 0;
  battle.on('win', () => wins++);
  battle.on('end', () => ends++);
  battle.on('enemyTurnStart', () => enemyTurns++);
  battle.endTurn();
  assert.equal(battle.phase, 'won');
  for (let i = 0; i < 6; i++) battle.update(1);
  assert.equal(wins, 1);
  assert.equal(ends, 1);
  assert.equal(enemyTurns, 0);
  assert.equal(battle.player.alive, true, 'no further end-turn damage after victory');
  assert.equal(battle.outHeal, 9);
  assert.equal(battle.bonusGold, 18);
});

test('an enemy killed by reflection stops its remaining hits and cannot lifesteal', () => {
  const battle = fixture();
  battle.update(1);
  const enemy = battle.enemies[0];
  enemy.def = { ...enemy.def, traits: { lifesteal: 1 } };
  enemy.hp = 1;
  enemy.move = { dmg: 5, hits: 3, block: 10, selfBuff: ['str', 2] };
  battle.player.buffs.thorns = 2;
  const before = battle.player.hp;
  battle.enemyAct(enemy);
  assert.equal(before - battle.player.hp, 5, 'only the hit before reflection lands');
  assert.equal(enemy.alive, false);
  assert.ok(enemy.hp <= 0, 'a defeated enemy cannot heal itself');
  assert.equal(enemy.block, 0);
  assert.equal(enemy.buffs.str || 0, 0);
  assert.equal(battle.enemies[1].alive, true);
});

test('feng engraving preserves strength gained from the card and damage relics', () => {
  for (const id of ['mojian', 'cijian']) {
    const battle = fixture(['xueyu']);
    battle.update(1);
    battle.player.buffs.str = 2;
    const card = { id, def: CARDS[id], up: false, rune: 'feng' };
    battle.hand = [card];
    const enemy = battle.enemies[0];
    enemy.def = { ...enemy.def, traits: { thorns: 10 } };
    enemy.el = 'none';
    const before = enemy.hp;
    assert.equal(battle.playCard(card, enemy), true);
    assert.equal(battle.player.buffs.str, id === 'mojian' ? 4 : 3);
    if (id === 'cijian') assert.equal(before - enemy.hp, 11, '6 base + 2 strength + 3 engraving');
  }
});

test('player vulnerability increases attacks before reduction and armor, but not raw damage', () => {
  const battle = fixture();
  battle.update(1);
  battle.player.buffs.vuln = 2;
  assert.equal(battle.hurtPlayer(10), 15);
  battle.player.buffs.halve = 1;
  battle.player.block = 3;
  assert.equal(battle.hurtPlayer(10), 5, '15 vulnerability, ceil-half to 8, then 3 armor');
  assert.equal(battle.hurtPlayer(4, { raw: true }), 4);
});

test('one vulnerability stack survives until the next full enemy attack turn', () => {
  const battle = fixture();
  battle.update(1);
  const [first, second] = battle.enemies;
  first.move = { playerBuff: ['vuln', 1] };
  second.move = { block: 1 };
  battle.endTurn();
  for (let i = 0; i < 3; i++) battle.update(1);
  assert.equal(battle.phase, 'player');
  assert.equal(battle.player.buffs.vuln, 1);
  first.move = { dmg: 10 };
  first.dmgMul = 1;
  first.buffs = {};
  second.move = { block: 1 };
  const before = battle.player.hp;
  battle.endTurn();
  for (let i = 0; i < 3; i++) battle.update(1);
  assert.equal(before - battle.player.hp, 15);
  assert.equal(battle.player.buffs.vuln || 0, 0);
});

test('simultaneous end-turn damage records defeat once without restarting its timer', () => {
  const battle = fixture();
  battle.update(1);
  battle.player.hp = 1;
  battle.player.buffs.burn = 2;
  battle.player.buffs.bloodpact = 2;
  let losses = 0;
  battle.on('lose', () => losses++);
  battle.endTurn();
  battle.update(0.5);
  const remaining = battle.timer;
  battle.lose();
  assert.equal(battle.timer, remaining);
  assert.equal(losses, 1);
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
