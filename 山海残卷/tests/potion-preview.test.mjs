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

test('potion completion refreshes the active card forecast for buffs, cleanses and killed targets', () => {
  for (const [potion, id, interaction] of [
    ['dali', 'cijian', 'selected'],
    ['fogu', 'shigu', 'hovered'],
    ['wumo', 'cijian', 'dragging'],
    ['chixiao', 'cijian', 'selected']
  ]) {
    const battle = new Battle(run.player, [{ id: 'shanxiao' }, { id: 'shanxiao' }]);
    battle.start(); battle.update(1);
    const card = { id, def: CARDS[id], up: false };
    battle.hand = [card];
    battle.player.potions = [potion];
    battle.player.buffs = potion === 'wumo' ? { weak: 2 } : {};
    if (potion === 'chixiao') battle.enemies[0].hp = 1;
    const scene = new BattleScene();
    scene.init({});
    fakeScene(scene);
    scene.battle = battle;
    scene.uiLocked = false;
    const cardView = { card, updateState() {}, setLayout() {}, apply() {}, container: scene.add.container() };
    scene.cardViews = [cardView];
    scene[interaction] = cardView;
    scene.tweens.killTweensOf = () => {};
    for (const method of ['drawPotions', 'refreshPlayerHud', 'refreshEnemyBars', 'updateEnemyIntents', 'refreshBuffs', 'floatText', 'drawEnergy', 'refreshPiles']) scene[method] = () => {};
    let displayed;
    const currentForecast = () => battle.enemies.filter(enemy => enemy.alive).map(enemy => ({
      enemy, total: battle.previewDamage(card, enemy)?.total
    }));
    scene.showDamagePreview = shownCard => {
      assert.equal(shownCard, card);
      displayed = currentForecast();
    };
    scene.hideDamagePreview = () => { displayed = []; };
    scene.wireEvents();
    scene.showDamagePreview(card);
    const before = displayed.map(value => value.total);
    scene.usePotionAt(0);
    assert.equal(battle.player.potions.length, 0, `${potion} must actually be consumed`);
    const expected = currentForecast();
    assert.notDeepEqual(expected.map(value => value.total), before, `${potion} fixture must change the forecast`);
    assert.deepEqual(displayed, expected, `${potion} must redraw the existing ${interaction} preview`);
  }
});

test('zero additional golden surge damage is rendered as group damage rather than card draw', () => {
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  const enemy = { alive: true };
  const card = { id: 'cijian', def: CARDS.cijian, up: false };
  scene.enemyViews = [{ foe: enemy, x: 930, y: 420, displayH: 300 }];
  // A target killed by the base hit contributes no further surge damage, while
  // the golden group-damage effect still occurs against other living targets.
  scene.battle = {
    phase: 'player', enemies: [enemy],
    previewDamage: () => ({ total: 6, lethal: true, hits: 1, blocked: 0,
      surge: { el: 'jin', dmg: 0, conf: { name: '金' } } })
  };
  scene.showDamagePreview(card);
  const labels = view.objects.filter(object => !object.destroyed && object.type === 'Text').map(object => object.text);
  assert.ok(labels.some(label => label.includes('金群伤')), 'golden surge retains its group-damage meaning at zero additional damage');
  assert.ok(labels.every(label => !label.includes('金抽牌')));
});
