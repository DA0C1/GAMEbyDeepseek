import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { CARDS } from '../src/data/cards.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
save.load();
function fixture(ids = ['zheng', 'shanxiao'], relics = []) {
  const p = run.newRun();
  p.relics = relics;
  const battle = new Battle(p, ids.map(id => ({ id })));
  battle.start();
  battle.update(1);
  battle.enemies.forEach(e => { e.el = 'none'; });
  return battle;
}
const card = id => ({ id, def: CARDS[id], up: false });

test('lethal enemy thorns stops remaining area hits and kill-heal relic effects', () => {
  const battle = fixture(undefined, ['zhaohun']);
  battle.player.hp = 1;
  battle.enemies[0].hp = 100;
  battle.enemies[1].hp = 1;
  const attack = card('hengsao');
  attack.rune = 'hui';
  battle.hand = [attack];
  let losses = 0, drawsAfterDefeat = 0;
  battle.on('lose', () => losses++);
  battle.on('draw', () => { if (battle.phase === 'lost') drawsAfterDefeat++; });
  assert.equal(battle.playCard(attack), true);
  assert.equal(battle.phase, 'lost');
  assert.equal(battle.player.hp, 0);
  assert.equal(battle.player.alive, false);
  assert.equal(battle.enemies[1].alive, true, 'second target is not hit after defeat');
  assert.equal(battle.enemies[1].hp, 1);
  assert.equal(battle.hand.length, 0, 'echo rune cannot return a card after defeat');
  assert.equal(battle.discardPile.filter(c => c === attack).length, 1);
  assert.equal(drawsAfterDefeat, 0);
  assert.equal(losses, 1);
});

test('lifesteal cannot heal a defeated player, but still heals a victorious player', () => {
  for (const dangerous of [true, false]) {
    const battle = fixture([dangerous ? 'zheng' : 'shanxiao']);
    battle.player.hp = 1;
    battle.enemies[0].hp = 1;
    const attack = card('tunshi');
    battle.hand = [attack];
    battle.playCard(attack, battle.enemies[0]);
    assert.equal(battle.phase, dangerous ? 'lost' : 'won');
    assert.equal(battle.player.hp, dangerous ? 0 : 13);
    assert.equal(battle.enemies[0].alive, false, 'the triggering hit still resolves its enemy death');
  }
});

test('lethal blood sacrifice cannot grant energy, draw, buffs, or surge after defeat', () => {
  const battle = fixture(['shanxiao']);
  battle.player.hp = 1;
  const sacrifice = card('xueji');
  assert.ok(sacrifice.def, 'known sacrifice card');
  sacrifice.rune = 'hu';
  battle.hand = [sacrifice];
  const drawBefore = battle.drawPile.length;
  const energyBefore = battle.player.energy;
  battle.playCard(sacrifice);
  assert.equal(battle.phase, 'lost');
  assert.equal(battle.player.energy, energyBefore - sacrifice.def.cost);
  assert.equal(battle.drawPile.length, drawBefore);
  assert.equal(battle.player.block, 0);
  battle.heal(50);
  battle.apply(battle.player, 'str', 10);
  battle.gainEnergy(10);
  assert.equal(battle.player.hp, 0);
  assert.equal(battle.player.buffs.str || 0, 0);
});

test('raw damage crosses boss phase threshold once and lethal hits do not transform', () => {
  for (const raw of [true, false]) {
    const battle = fixture(['zhulong']);
    const boss = battle.enemies[0];
    boss.maxHp = 140;
    boss.hp = 86;
    boss.block = 20;
    let phases = 0;
    battle.on('bossPhase', () => phases++);
    battle.damage(boss, 10, { raw, pierce: true, noThorns: true });
    assert.equal(boss._phase2, true);
    assert.equal(boss.buffs.str, 2);
    assert.equal(boss.block, 0);
    battle.damage(boss, 1, { raw, pierce: true, noThorns: true });
    assert.equal(phases, 1);
  }
  const battle = fixture(['zhulong']);
  const boss = battle.enemies[0];
  battle.damage(boss, 10000, { raw: true, pierce: true });
  assert.equal(boss._phase2, undefined);
});

test('boss poison phase transition changes the move before its next attack', () => {
  const battle = fixture(['zhulong']);
  const boss = battle.enemies[0];
  boss.maxHp = 140;
  boss.hp = 86;
  boss.buffs.poison = 10;
  boss.move = { name: 'old phase move', block: 10 };
  let chosen, used;
  battle.on('bossPhase', () => { chosen = boss.move; });
  battle.on('enemyMove', ({ move }) => { used = move; });
  battle.enemyAct(boss);
  assert.equal(boss._phase2, true);
  assert.ok(chosen);
  assert.equal(used, chosen, 'phase-two move selected during poison tick must be used');
});

test('pause, rules, deck and dialogue freeze combat time until dismissed', async () => {
  globalThis.Phaser = { Scene: class {} };
  const { BattleScene } = await import('../src/scenes/BattleScene.js');
  for (const overlay of ['_pauseLayer', '_rules', '_codex', '_dialogue']) {
    const battle = fixture(['shanxiao']);
    battle.enemies[0].move = { dmg: 20 };
    battle.player.hp = 10;
    battle.endTurn();
    const scene = new BattleScene();
    scene.battle = battle;
    scene[overlay] = {};
    const timer = battle.enemyTimer;
    for (let i = 0; i < 30; i++) scene.update(i * 1000, 1000);
    assert.equal(battle.player.hp, 10, overlay);
    assert.equal(battle.enemyTimer, timer, overlay + ' cannot consume combat time');
    scene[overlay] = null;
    scene.update(31000, 1000);
    assert.equal(battle.phase, 'lost', 'combat resumes when overlay closes');
  }
});

test('defeat and abandonment record current battle stats only once without victory rewards', async () => {
  globalThis.Phaser = { Scene: class {} };
  const { BattleScene } = await import('../src/scenes/BattleScene.js');
  run.newRun();
  run.stats.damage = 20;
  run.stats.cardsPlayed = 3;
  const gold = run.player.gold;
  const scene = new BattleScene();
  scene.battle = { damageDealt: 100, cardsPlayed: 8, bonusGold: 18, outHeal: 9 };
  const transitions = [];
  scene.scene = { start(...args) { transitions.push(args); } };
  scene.onEnd('lose');
  scene.onEnd('lose');
  assert.equal(run.stats.damage, 120);
  assert.equal(run.stats.cardsPlayed, 11);
  assert.equal(run.player.gold, gold);
  assert.deepEqual(transitions, [['Result', { win: false }]]);
});

test('lethal post-play combo or surge cannot return an echo card after defeat', () => {
  for (const [id, source] of [['yufeng', 'combo'], ['fuzhi', 'combo'], ['mojian', 'surge']]) {
    const b = fixture(['zheng']);
    b.player.hp = 1; b.enemies[0].hp = 100;
    const c = card(id); c.rune = 'hui'; b.hand = [c];
    if (source === 'combo') b.player.buffs.comboDmg = 5;
    else { b.brushEl = 'jin'; b.brushCount = 2; }
    let returned = 0;
    b.on('echoReturn', () => returned++);
    b.playCard(c);
    assert.equal(b.phase, 'lost', source);
    assert.equal(returned, 0, source);
    assert.equal(b.hand.includes(c), false, source);
    assert.equal((c.def.exhaust ? b.exhaustPile : b.discardPile).filter(x => x === c).length, 1);
  }
});
