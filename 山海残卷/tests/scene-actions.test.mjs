import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { save } from '../src/core/save.js';
import { run } from '../src/core/run.js';
import { audio } from '../src/core/audio.js';
import { Battle } from '../src/systems/battle.js';

installFakePhaser();
const { RestScene } = await import('../src/scenes/RestScene.js');
const { ShopScene } = await import('../src/scenes/ShopScene.js');
const { ResultScene } = await import('../src/scenes/ResultScene.js');
const { BattleScene } = await import('../src/scenes/BattleScene.js');
const { pickCard, openRules } = await import('../src/ui/overlays.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
audio.playBgm = () => {};
audio.stopBgm = () => {};

beforeEach(() => { save.load(); run.newRun(); });

test('rest accepts only one pending picker and only one reward', () => {
  const scene = new RestScene(), view = fakeScene(scene);
  scene.create();
  // Two callbacks from different buttons can already be queued in the same frame.
  scene.doUpgrade();
  scene.doEngrave();
  const pickers = view.pickers();
  assert.equal(pickers.length, 1, 'a pending upgrade must block a second engrave picker');
  view.pickFirst(pickers[0]);
  scene.doEngrave();
  scene.doHeal(30);
  assert.equal(run.player.deck.filter(c => c.up).length, 1);
  assert.equal(run.player.deck.filter(c => c.rune).length, 0);
  assert.equal(view.pickers().length, 0, 'completed rest cannot open another picker');
});

test('canceling a rest picker permits a different rest action', () => {
  const scene = new RestScene(), view = fakeScene(scene);
  scene.create();
  run.player.hp -= 30;
  scene.doUpgrade();
  view.cancelPicker(view.pickers()[0]);
  scene.doHeal(20);
  assert.equal(run.player.hp, run.player.maxHp - 10);
  assert.equal(scene.done, true);
});

test('shop pending removal cannot race another purchase into negative gold', () => {
  const scene = new ShopScene(), view = fakeScene(scene);
  scene.create();
  const remove = scene.items.find(it => it.kind === 'remove');
  const card = scene.items.find(it => it.kind === 'card');
  const before = run.player.deck.length;
  assert.equal(run.player.gold, 99);
  scene.buy(remove);
  scene.buy(card);
  view.pickFirst(view.pickers()[0]);
  assert.ok(run.player.gold >= 0, 'pending removal must not overdraw the available gold');
  assert.equal(remove.bought, true);
  assert.equal(card.bought, false, 'another purchase must wait until the picker closes');
  assert.equal(run.player.deck.length, before - 1);
  assert.equal(run.player.gold, 99 - remove.price);
});

test('shop cancellation does not charge gold or leave the shop locked', () => {
  const scene = new ShopScene(), view = fakeScene(scene);
  scene.create();
  const remove = scene.items.find(it => it.kind === 'remove');
  const card = scene.items.find(it => it.kind === 'card');
  scene.buy(remove);
  view.cancelPicker(view.pickers()[0]);
  assert.equal(run.player.gold, 99);
  scene.buy(card);
  assert.equal(card.bought, true);
  assert.equal(run.player.gold, 99 - card.price);
});

test('result retry and title callbacks queued together commit one navigation', t => {
  t.mock.method(performance, 'now', () => 1000);
  const scene = new ResultScene(), view = fakeScene(scene);
  scene.init({ win: false });
  scene.create();
  const before = save.data.runs;
  // Real makeButton listeners enqueue both callbacks before either can lock input.
  view.button('再入卷').zone.emit('pointerdown');
  view.button('回山门').zone.emit('pointerdown');
  view.flushTimers(40);
  view.completeTweens(380);
  assert.equal(save.data.runs, before + 1);
  assert.equal(run.active, true, 'the ignored title callback must not abandon the new run');
  assert.deepEqual(view.transitions, [['Map', { fresh: true }]]);
});

test('ESC cancels a picker, removes its listener, and allows another choice', () => {
  const scene = new RestScene(), view = fakeScene(scene);
  scene.create();
  scene.doUpgrade();
  assert.equal(scene.input.keyboard.listenerCount('keydown-ESC'), 1);
  scene.input.keyboard.emit('keydown-ESC');
  assert.equal(view.pickers().length, 0);
  assert.equal(scene.input.keyboard.listenerCount('keydown-ESC'), 0);
  assert.equal(run.player.deck.filter(c => c.up).length, 0);
  scene.doEngrave();
  view.pickFirst(view.pickers()[0]);
  assert.equal(run.player.deck.filter(c => c.rune).length, 1);
  assert.equal(scene.input.keyboard.listenerCount('keydown-ESC'), 0);
});

test('a saved card callback cannot select twice or select after cancellation', () => {
  for (const closeBy of ['pick', 'cancel', 'destroy']) {
    const scene = new RestScene(), view = fakeScene(scene);
    let picked = 0, canceled = 0, stopped = 0;
    const picker = pickCard(scene, {
      cards: [run.player.deck[0]], title: '修　符',
      onPick: () => picked++, onCancel: () => canceled++
    });
    const content = picker.layer.list.find(child => child.type === 'Container');
    const zone = content.list.find(child => child.type === 'Zone');
    // Deliberately retain the actual handler: input queued before close can still
    // reach a callback, even though destruction prevents fresh object events.
    const callback = zone.listeners.pointerdown[0];
    const click = () => callback({}, 0, 0, { stopPropagation() { stopped++; } });
    if (closeBy === 'pick') click();
    else if (closeBy === 'cancel') picker.close();
    else picker.layer.destroy(true);
    click();
    click();
    assert.equal(picked, closeBy === 'pick' ? 1 : 0, closeBy);
    assert.equal(canceled, closeBy === 'cancel' ? 1 : 0, closeBy);
    assert.equal(scene.input.keyboard.listenerCount('keydown-ESC'), 0, closeBy);
    assert.ok(stopped >= 2, 'picker card clicks stop propagation');
    assert.equal(view.pickers().length, 0);
  }
});

test('a stale rules close callback cannot orphan a newly opened rules overlay', () => {
  const scene = {}, view = fakeScene(scene);
  let closed = 0;
  const open = () => {
    scene.rules = openRules(scene, { onClose() { scene.rules = null; closed++; } });
    return scene.rules;
  };
  const original = open();
  // The button can already have queued this callback when ESC closes the layer.
  const delayedClose = original.close;
  original.close();
  const fresh = open();
  delayedClose();
  assert.equal(closed, 1);
  assert.equal(scene.rules, fresh, 'stale close must not clear the fresh overlay handle');
  assert.equal(fresh.layer.destroyed, false);
  fresh.close();
  assert.equal(closed, 2);
  assert.equal(scene.rules, null);
  assert.ok(view.objects.filter(o => o.type === 'Container').every(o => o.destroyed));
});

test('repeated pause opening and closing removes its footer with the overlay', () => {
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  scene.battle = { turn: 1, phase: 'player' };
  const footer = 'ESC 或点击「继续」返回战斗';
  for (let i = 0; i < 2; i++) {
    scene.showPause();
    assert.equal(view.objects.filter(o => !o.destroyed && o.text === footer).length, 1);
    scene.hidePause();
    assert.equal(view.objects.filter(o => !o.destroyed && o.text === footer).length, 0);
  }
});

test('high-depth rules own the close hit zone above their click blocker', () => {
  const scene = {}, view = fakeScene(scene);
  const rules = openRules(scene, { depth: 140 });
  const close = view.button('知道了');
  const blocker = rules.layer.list.find(o => o.type === 'Zone');
  assert.equal(rules.layer.depth, 140);
  assert.equal(close.zone.parentContainer, rules.layer);
  assert.ok(rules.layer.list.indexOf(close.zone) > rules.layer.list.indexOf(blocker));
  let stopped = 0;
  blocker.emit('pointerdown', {}, 0, 0, { stopPropagation() { stopped++; } });
  assert.equal(stopped, 1, 'fullscreen rules blocker consumes its clicks');
  rules.close();
  assert.equal(close.zone.destroyed, true);
});

test('boss phase wire event redraws the changed enemy intent immediately', () => {
  const battle = new Battle(run.player, [{ id: 'zhulong' }], { boss: true });
  battle.start();
  battle.update(1);
  const scene = new BattleScene();
  scene.init({});
  fakeScene(scene);
  scene.battle = battle;
  scene.updateEnemyTraits = () => {};
  scene.refreshEnemyBars = () => {};
  const observed = [];
  scene.updateEnemyIntents = () => observed.push(battle.enemies[0].move);
  scene.wireEvents();
  const enemy = battle.enemies[0];
  const before = enemy.move;
  battle.damage(enemy, Math.ceil(enemy.maxHp * 0.6), { raw: true, pierce: true });
  assert.notEqual(enemy.move, before, 'fixture must cross the phase threshold');
  assert.ok(observed.includes(enemy.move), 'new intent is redrawn during the phase event');
});

test('shop revalidates gold and card membership before charging a pending removal', () => {
  for (const invalidate of ['gold', 'card']) {
    save.load(); run.newRun();
    const scene = new ShopScene(), view = fakeScene(scene);
    scene.create();
    const remove = scene.items.find(it => it.kind === 'remove');
    scene.buy(remove);
    const picker = view.pickers()[0];
    if (invalidate === 'gold') run.player.gold = 0;
    else run.player.deck.shift();
    const before = { gold: run.player.gold, cards: run.player.deck.length };
    view.pickFirst(picker);
    assert.equal(run.player.gold, before.gold);
    assert.equal(run.player.deck.length, before.cards);
    assert.equal(remove.bought, false);
  }
});

test('shop does not charge for an unavailable potion slot or duplicate relic', () => {
  const scene = new ShopScene(), view = fakeScene(scene);
  scene.create();
  run.player.gold = 999;
  const potion = scene.items.find(it => it.kind === 'potion');
  run.player.potions = ['huichun', 'juling', 'dali'];
  scene.buy(potion);
  assert.equal(run.player.gold, 999);
  assert.equal(potion.bought, false);
  const relic = scene.items.find(it => it.kind === 'relic');
  run.player.relics.push(relic.id);
  scene.buy(relic);
  assert.equal(run.player.gold, 999);
  assert.equal(relic.bought, false);
});

test('story continue accepts one map generation and transition until scene reentry', async t => {
  const { StoryScene } = await import('../src/scenes/StoryScene.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 1000;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'performance', previous);
    else delete globalThis.performance;
  });
  const scene = new StoryScene();
  for (let visit = 0; visit < 2; visit++) {
    scene.init({ kind: 'act' });
    const view = fakeScene(scene);
    scene.create();
    const button = view.button('入卷');
    assert.ok(button);
    button.zone.emit('pointerdown');
    view.flushTimers(40);
    const firstMap = run.map;
    assert.ok(firstMap);
    now += 320; // Accepted by makeButton, still inside the 380ms transition wipe.
    button.zone.emit('pointerdown');
    view.flushTimers(40);
    assert.equal(run.map, firstMap, 'a second accepted click cannot replace the generated map');
    assert.equal(scene.input.enabled, false);
    view.completeTweens(380);
    assert.deepEqual(view.transitions, [['Map']], 'only one transition may finish');
    now += 1000;
  }
});
