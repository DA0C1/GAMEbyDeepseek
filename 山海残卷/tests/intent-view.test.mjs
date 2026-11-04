import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { pickMove } from '../src/data/enemies.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
beforeEach(() => { save.load(); run.newRun(); });

function fixture(id) {
  const battle = new Battle(run.player, [{ id }]);
  battle.start(); battle.update(1);
  const scene = new BattleScene();
  scene.init({});
  fakeScene(scene);
  scene.battle = battle;
  scene.refreshEnemyBars = () => {};
  scene.refreshPlayerHud = () => {};
  const icons = [];
  scene.iconTexture = name => { icons.push(name); return name; };
  const enemy = battle.enemies[0];
  const view = { foe: enemy, intent: scene.add.container(0, 0), x: 900, y: 400 };
  scene.enemyViews = [view];
  scene.wireEvents();
  return { scene, battle, enemy, view, icons };
}

test('HP damage redraws imminent poison phase intent even before the actual phase changes', () => {
  const { scene, battle, enemy, view, icons } = fixture('zhulong');
  enemy.hp = 100; enemy.maxHp = 140; enemy.turn = 1;
  enemy.move = pickMove(enemy); enemy.buffs.poison = 10;
  assert.equal(enemy.move.name, '瞑目');
  scene.drawIntent(view);
  assert.equal(icons.at(-1), 'shield');
  battle.damage(enemy, 10, { raw: true, pierce: true });
  assert.equal(enemy.hp, 90);
  assert.equal(!!enemy._phase2, false, 'this hit itself does not change the live boss phase');
  assert.equal(enemy.move.name, '瞑目', 'live move remains unchanged until poison ticks');
  assert.equal(icons.at(-1), 'sword', 'damage event must refresh the displayed upcoming move');
  assert.ok(view.intent.list.some(item => item.text === '9×2'));
  const forecast = battle.previewEnemyIntent(enemy);
  assert.match(scene.intentTipLines(forecast.move, enemy, forecast).join('\n'), /毒 \/ 灼烧将触发新阶段/);
});

test('lethal poison intent displays a death label and explains that no action is expected', () => {
  const { scene, battle, enemy, view, icons } = fixture('shanxiao');
  enemy.hp = 5; enemy.buffs.poison = 5;
  scene.drawIntent(view);
  assert.equal(icons.at(-1), 'skull');
  assert.ok(view.intent.list.some(item => item.text === '将亡'));
  const forecast = battle.previewEnemyIntent(enemy);
  assert.equal(forecast.move, null);
  assert.match(scene.intentTipLines({}, enemy, forecast).join('\n'), /行动前致死/);
  assert.equal(enemy.hp, 5, 'drawing an intent never consumes the real poison tick');
  assert.equal(enemy.alive, true);
});

test('cleansing vulnerability with wumo immediately refreshes attack intent numbers', () => {
  const { scene, battle, enemy, view } = fixture('shanxiao');
  scene.drawPotions = () => {};
  battle.player.buffs.vuln = 2;
  battle.player.potions = ['wumo'];
  scene.drawIntent(view);
  assert.ok(view.intent.list.some(item => item.text === '12×2'));
  assert.equal(battle.usePotion(0), true);
  assert.equal(battle.player.buffs.vuln, 0);
  assert.ok(view.intent.list.some(item => item.text === '8×2'),
    'cleansing directly changes buffs, so the potion event must redraw intents');
  assert.deepEqual(battle.previewEnemyIntent(enemy).damageByHit, [8, 8]);
});

test('enemy healing immediately clears stale poison-death and imminent-phase intents', () => {
  {
    const { scene, battle, enemy, view, icons } = fixture('gudiao');
    enemy.hp = 5; enemy.maxHp = 30; enemy.buffs.poison = 5;
    scene.drawIntent(view);
    assert.equal(icons.at(-1), 'skull');
    assert.ok(view.intent.list.some(item => item.text === '将亡'));
    battle.healEnemies(10);
    assert.equal(enemy.hp, 15);
    assert.equal(battle.previewEnemyIntent(enemy).willDie, false);
    assert.equal(icons.at(-1), 'sword', 'healing redraws the surviving enemy attack');
    assert.ok(!view.intent.list.some(item => item.text === '将亡'));
  }
  {
    const { scene, battle, enemy, view, icons } = fixture('zhulong');
    enemy.hp = 90; enemy.maxHp = 140; enemy.turn = 1;
    enemy.move = pickMove(enemy); enemy.buffs.poison = 10;
    scene.drawIntent(view);
    assert.equal(icons.at(-1), 'sword');
    assert.equal(battle.previewEnemyIntent(enemy).phaseChange, true);
    battle.healEnemies(10);
    const forecast = battle.previewEnemyIntent(enemy);
    assert.equal(enemy.hp, 100);
    assert.equal(!!enemy._phase2, false, 'healing does not change the live phase');
    assert.equal(forecast.phaseChange, false);
    assert.equal(forecast.move.type, 'defend');
    assert.equal(icons.at(-1), 'shield', 'healing removes the now-impossible poison phase forecast');
    assert.ok(view.intent.list.some(item => item.text === '+' + forecast.move.block));
  }
});
