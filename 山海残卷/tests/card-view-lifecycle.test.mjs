import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';

installFakePhaser();
const { BattleScene } = await import('../src/scenes/BattleScene.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
beforeEach(() => { save.load(); run.newRun(); });

function fixture(rune, id = 'yufeng', fillers = 0) {
  const card = { id, def: CARDS[id], up: false, ...(rune ? { rune } : {}) };
  const battle = new Battle(run.player, [{ id: 'shanxiao' }]);
  battle.start();
  battle.update(1);
  battle.hand = [card, ...Array.from({ length: fillers }, () => ({ id: 'yufeng', def: CARDS.yufeng, up: false }))];
  battle.drawPile = fillers ? Array.from({ length: 10 }, () => ({ id: 'cijian', def: CARDS.cijian, up: false })) : [];
  battle.discardPile = [];
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);

  // Supply the small Image/Container surface used by the real CardView. Keep
  // rendering adapters here so the shared scene helper remains unchanged.
  const image = scene.add.image;
  scene.add.image = (x, y, key) => {
    const object = image(x, y, key);
    object.texture = { key };
    object.setTexture = function (next) { this.texture.key = next; return this; };
    object.clearTint = function () { return this; };
    return object;
  };
  const container = scene.add.container;
  scene.add.container = (x, y, children) => {
    const object = container(x, y);
    if (children) object.add(children);
    return object;
  };
  for (const method of ['drawEnergy', 'refreshPlayerHud', 'refreshEnemyBars', 'refreshPiles', 'hideDamagePreview']) {
    scene[method] = () => {};
  }
  scene.battle = battle;
  scene.uiLocked = false;
  battle.on('cardPlayed', () => scene.refreshHand());
  battle.on('draw', () => scene.refreshHand());
  scene.refreshHand();
  return { scene, view, battle, card };
}

test('echoed card retains a playable view after its original flight animation finishes', () => {
  const { scene, view, battle, card } = fixture('hui');
  const original = scene.cardViews[0];
  scene.playCard(original, null);
  assert.deepEqual(battle.hand, [card], 'echo returns the same logical card');
  view.completeTweens(280);

  assert.equal(scene.cardViews.length, 1, 'returned card must not vanish with the old flight view');
  const returned = scene.cardViews[0];
  assert.equal(returned.card, card);
  assert.notEqual(returned, original, 'returning card owns a fresh view');
  assert.equal(original.container.destroyed, true);
  assert.equal(returned.container.destroyed, false);
  assert.equal(!!returned.removing, false);
  assert.equal(battle.canPlay(returned.card), true);

  // Play the returned view through the same UI entry point. Echo is once per
  // battle, so this second flight leaves no stale or duplicate hand view.
  scene.playCard(returned, null);
  view.completeTweens(280);
  assert.equal(battle.hand.length, 0);
  assert.equal(scene.cardViews.length, 0);
  assert.equal(battle.discardPile.filter(c => c === card).length, 1);
});

test('ordinary played cards finish their flight without resurrecting a hand view', () => {
  const { scene, view, battle, card } = fixture();
  const original = scene.cardViews[0];
  scene.playCard(original, null);
  view.completeTweens(280);
  scene.refreshHand();
  assert.equal(battle.hand.length, 0);
  assert.equal(scene.cardViews.length, 0);
  assert.equal(original.container.destroyed, true);
  assert.equal(battle.discardPile.filter(c => c === card).length, 1);
});

test('echo card views match the logical hand when drawing or creating cards fills the hand', () => {
  for (const id of ['jifeng', 'fuzhi']) {
    for (const fillers of [6, 9]) {
      const { scene, view, battle, card } = fixture('hui', id, fillers);
      const original = scene.cardViews[0];
      scene.playCard(original, null);
      view.completeTweens(280);
      view.completeTweens(220);
      const context = `${id}, initial hand ${fillers + 1}`;
      assert.ok(battle.hand.length <= 10, context);
      assert.deepEqual(scene.cardViews.map(v => v.card), battle.hand, context);
      assert.ok(scene.cardViews.every(v => !v.removing && !v.container.destroyed), context);
      assert.equal(original.container.destroyed, true, context);
      assert.equal(battle.hand.includes(card), fillers < 9, context);
      assert.equal(new Set(scene.cardViews).size, scene.cardViews.length, context);
    }
  }
});

test('ending the turn immediately clears discarded views and stale interaction references', () => {
  const { scene, view, battle } = fixture(undefined, 'yufeng', 2);
  // Use production event wiring, rather than adding a test-only discard handler.
  battle._h = {};
  scene.wireEvents();
  const original = scene.cardViews.slice();
  scene.selected = original[0];
  scene.hovered = original[1];
  original[1].hovered = true;
  scene.dragging = original[2];
  original[2].dragging = true;
  scene.endTurn();
  assert.equal(battle.phase, 'enemy');
  assert.equal(battle.hand.length, 0);
  assert.equal(scene.cardViews.length, 0, 'old cards cannot remain visible throughout enemy turn');
  assert.equal(scene.selected, null);
  assert.equal(scene.hovered, null);
  assert.equal(scene.dragging, null);
  view.completeTweens(220);
  assert.ok(original.every(cardView => cardView.container.destroyed));
  // Hover/layout tweens may still deliver their callbacks after discard fades.
  assert.doesNotThrow(() => {
    for (const tween of view.tweens) tween.onUpdate?.();
    original.forEach(cardView => { cardView.updateState(); cardView.apply(); cardView.destroy(); });
  });
});

test('unplayable curses report their rule instead of insufficient energy', () => {
  for (const id of ['xinmo', 'shigu_curse', 'mihuo']) {
    const { scene, battle } = fixture(undefined, id);
    battle.player.energy = 10;
    const messages = [];
    scene.floatText = (_x, _y, text) => messages.push(text);
    const cardView = scene.cardViews[0];
    scene.onPointerDown({ worldX: cardView.x, worldY: cardView.y });
    assert.deepEqual(messages, ['无法打出'], id);
    assert.equal(scene.dragging, null, id);
    assert.equal(battle.hand.length, 1, id);
    assert.equal(battle.player.energy, 10, id);
  }
  const { scene, battle } = fixture(undefined, 'yufeng');
  battle.player.energy = 0;
  const messages = [];
  scene.floatText = (_x, _y, text) => messages.push(text);
  const cardView = scene.cardViews[0];
  scene.onPointerDown({ worldX: cardView.x, worldY: cardView.y });
  assert.deepEqual(messages, ['灵力不足']);
});

test('hover and pointer-down choose the visible raised card instead of a covered neighbor', () => {
  const { scene } = fixture(undefined, 'cijian', 1);
  const [raised, covered] = scene.cardViews;
  raised.hovered = true;
  scene.hovered = raised;
  raised.y = raised.baseY - 70;
  raised.scale = 1.24;
  raised.rot = 0;
  raised.apply();
  const pointer = { worldX: 820, worldY: 620 };
  assert.ok(raised.hit(pointer.worldX, pointer.worldY));
  assert.ok(covered.hit(pointer.worldX, pointer.worldY));
  assert.ok(raised.container.depth > covered.container.depth);
  scene.onPointerMove(pointer);
  assert.ok(scene.hovered === raised, 'hover must not jump to a card hidden beneath the raised card');
  scene.onPointerDown(pointer);
  assert.ok(scene.dragging === raised, 'clicking the visible card must not play its covered neighbor');
});

test('hit-test depth ties use current hand order and reshuffles update actual render order', () => {
  const { scene, battle } = fixture(undefined, 'cijian', 2);
  battle.hand.reverse();
  scene.refreshHand();
  const stack = scene.cardViews;
  stack.forEach(cardView => {
    cardView.x = 800; cardView.y = 700; cardView.rot = 0; cardView.scale = 1;
    cardView.apply();
  });
  assert.ok(stack[0].container.depth < stack[1].container.depth);
  assert.ok(stack[1].container.depth < stack[2].container.depth,
    'new hand order must be reflected in rendering, not only the hit-test array');
  stack.forEach(cardView => cardView.container.setDepth(40));
  scene.onPointerDown({ worldX: 800, worldY: 700 });
  assert.ok(scene.dragging === stack[2], 'equal-depth cards use the current rightmost/last hand card');
});

test('a selected card remains raised after pointer hover leaves it', () => {
  const { scene } = fixture(undefined, 'cijian', 1);
  const [selected, ordinary] = scene.cardViews;
  scene.selected = selected;
  selected.hovered = false;
  selected.apply();
  ordinary.apply();
  assert.ok(selected.container.depth > ordinary.container.depth,
    'selection remains visually above ordinary cards even without pointer hover');
  scene.clearSelection();
  assert.ok(selected.container.depth < ordinary.container.depth,
    'clearing selection restores normal hand depth without waiting for another layout');
});

test('click selection keeps its raised pose after hover leaves and returns home on cancellation', () => {
  const { scene, view } = fixture(undefined, 'cijian', 1);
  const [cardView] = scene.cardViews;
  // Execute only CardView pose tween endpoints. Rendering and easing remain
  // stubbed, while the real pointer/selection methods decide what to animate.
  scene.tweens.killTweensOf = target => {
    for (const tween of view.tweens) {
      if (tween.targets === target || (Array.isArray(tween.targets) && tween.targets.includes(target))) {
        tween.canceled = true;
      }
    }
  };
  const finishPose = () => {
    for (const tween of view.tweens) {
      if (tween.targets !== cardView || tween.completed || tween.canceled) continue;
      tween.completed = true;
      for (const key of ['x', 'y', 'rot', 'scale']) {
        if (typeof tween[key] === 'number') cardView[key] = tween[key];
      }
      tween.onUpdate?.();
      tween.onComplete?.();
    }
  };
  finishPose();
  const pointer = { worldX: cardView.x, worldY: cardView.y };
  scene.onPointerMove(pointer);
  scene.onPointerDown(pointer);
  scene.onPointerUp(pointer);
  finishPose();
  assert.ok(scene.selected === cardView);
  assert.equal(cardView.y, cardView.baseY - 70);
  assert.equal(cardView.scale, 1.24);
  scene.onPointerMove({ worldX: 50, worldY: 50 });
  finishPose();
  assert.ok(scene.selected === cardView);
  assert.equal(cardView.y, cardView.baseY - 70, 'leaving hover cannot lower a selected card');
  assert.equal(cardView.scale, 1.24);
  scene.clearSelection();
  finishPose();
  assert.equal(scene.selected, null);
  assert.equal(cardView.x, cardView.baseX);
  assert.equal(cardView.y, cardView.baseY, 'canceling selection returns a touch-selected card home');
  assert.equal(cardView.rot, cardView.baseRot);
  assert.equal(cardView.scale, 1);
});

test('drag start cancels pending hand and hover tweens before following the pointer', () => {
  const { scene, view } = fixture(undefined, 'cijian', 1);
  const cardView = scene.cardViews[0];
  const pointer = { worldX: cardView.x, worldY: cardView.y };
  scene.onPointerMove(pointer);
  const pending = view.tweens.filter(tween => tween.targets === cardView && !tween.completed && !tween.canceled);
  assert.ok(pending.length > 0, 'fixture contains an unfinished hover pose');
  scene.onPointerDown(pointer);
  assert.ok(pending.every(tween => tween.canceled), 'old hand poses cannot keep writing during drag');
  scene.onPointerMove({ worldX: 870, worldY: 500 });
  assert.equal(cardView.x, 870);
  assert.equal(cardView.y, 440);
  assert.equal(cardView.container.x, 870);
  assert.equal(cardView.container.y, 440);
});

test('playing a card cancels its old pose tween before its outgoing container flight', () => {
  const { scene, view, battle } = fixture(undefined, 'yufeng');
  const cardView = scene.cardViews[0];
  scene.onPointerMove({ worldX: cardView.x, worldY: cardView.y });
  const pending = view.tweens.filter(tween => tween.targets === cardView && !tween.completed && !tween.canceled);
  assert.ok(pending.length > 0);
  scene.playCard(cardView, null);
  assert.equal(battle.hand.length, 0);
  assert.ok(pending.every(tween => tween.canceled), 'CardView.apply cannot overwrite the outgoing container flight');
  const flight = view.tweens.find(tween => tween.targets === cardView.container && tween.duration === 280);
  assert.ok(flight && !flight.canceled);
  view.completeTweens(280);
  assert.equal(cardView.destroyed, true);
});

test('canceled mouse and touch drags clear stale targeting and allow the next hover to lift again', () => {
  for (const input of ['mouse', 'touch']) {
    const { scene, view, battle, card } = fixture(undefined, 'cijian');
    const cardView = scene.cardViews[0];
    let forecastVisible = false;
    scene.showDamagePreview = () => { forecastVisible = true; scene.dmgPreview = [{}]; };
    scene.hideDamagePreview = () => { forecastVisible = false; scene.dmgPreview = []; };
    const finishPose = () => {
      for (const tween of view.tweens) {
        if (tween.targets !== cardView || tween.completed || tween.canceled) continue;
        tween.completed = true;
        for (const key of ['x', 'y', 'rot', 'scale']) {
          if (typeof tween[key] === 'number') cardView[key] = tween[key];
        }
        tween.onUpdate?.();
        tween.onComplete?.();
      }
    };
    finishPose();
    const start = { worldX: cardView.x, worldY: cardView.y };
    if (input === 'mouse') scene.onPointerMove(start);
    scene.onPointerDown(start);
    const invalidDrop = { worldX: 500, worldY: 820 };
    scene.onPointerMove(invalidDrop);
    assert.equal(forecastVisible, true, `${input}: dragging displays a forecast`);
    battle.player.energy = 0;
    scene.onPointerUp(invalidDrop);
    finishPose();
    assert.equal(scene.dragging, null, input);
    assert.equal(scene.hovered, null, `${input}: no stale scene hover survives cancellation`);
    assert.equal(scene.selected, null, input);
    assert.equal(cardView.hovered, false, input);
    assert.equal(forecastVisible, false, `${input}: a canceled gesture has no lingering forecast`);
    assert.equal(cardView.dimmed, true, `${input}: restored non-hovered card reflects its current affordability`);
    assert.equal(cardView.x, cardView.baseX, input);
    assert.equal(cardView.y, cardView.baseY, input);
    assert.equal(cardView.scale, 1, input);
    assert.ok(battle.hand.includes(card), `${input}: cancellation does not play the card`);
    scene.onPointerMove({ worldX: cardView.x, worldY: cardView.y });
    finishPose();
    assert.ok(scene.hovered === cardView, input);
    assert.equal(cardView.hovered, true, `${input}: next hover is recognized as new`);
    assert.equal(cardView.scale, 1.24, `${input}: next hover lifts normally`);
    assert.equal(forecastVisible, true, `${input}: next hover shows a fresh forecast`);
  }
});

function wirePointerEvents(scene, gameEvents = new EventEmitter()) {
  scene.input = Object.assign(new EventEmitter(), { keyboard: new EventEmitter(), enabled: true });
  scene.events = new EventEmitter();
  scene.game = { events: gameEvents };
  scene.sys = { game: scene.game };
  scene.buildControls();
}

test('outside release and focus loss cancel real wired drag/selection without playing a card', () => {
  for (const trigger of ['pointerupoutside', 'blur', 'hidden', 'touchcancel']) {
    for (const interaction of ['drag', 'selection']) {
      const { scene, battle, card } = fixture(undefined, 'cijian');
      const cardView = scene.cardViews[0];
      wirePointerEvents(scene);
      scene.enemyViews = [{ foe: battle.enemies[0], x: 1100, y: 300, displayH: 300 }];
      scene.highlightTarget = () => {};
      let previewVisible = false;
      scene.showDamagePreview = () => { previewVisible = true; scene.dmgPreview = [{}]; };
      scene.hideDamagePreview = () => { previewVisible = false; scene.dmgPreview = []; };
      const pointer = { worldX: cardView.x, worldY: cardView.y };
      scene.input.emit('pointermove', pointer);
      scene.input.emit('pointerdown', pointer);
      if (interaction === 'selection') {
        scene.input.emit('pointerup', pointer);
        assert.ok(scene.selected === cardView, 'fixture enters the click-to-target mode');
      } else {
        scene.input.emit('pointermove', { worldX: 1100, worldY: 300 });
        assert.ok(scene.dragging === cardView, 'fixture holds an active drag');
      }
      const beforeHp = battle.enemies[0].hp, beforeEnergy = battle.player.energy;
      assert.equal(previewVisible, true);
      // Even if supplied coordinates overlap an enemy, releasing off-canvas is
      // cancellation, not a targeted drop. Blur cleanup is independent of locks.
      if (trigger === 'pointerupoutside') scene.input.emit(trigger, { worldX: 1100, worldY: 300 });
      else if (trigger === 'touchcancel') {
        scene.uiLocked = interaction === 'selection';
        scene.input.emit('pointerup', { worldX: 1100, worldY: 300, wasCanceled: true });
      }
      else { scene.uiLocked = true; scene.game.events.emit(trigger); }
      const label = `${trigger}/${interaction}`;
      assert.equal(scene.dragging, null, label);
      assert.equal(scene.hovered, null, label);
      assert.equal(scene.selected, null, label);
      assert.equal(cardView.dragging, false, label);
      assert.equal(cardView.hovered, false, label);
      assert.equal(previewVisible, false, label);
      assert.ok(battle.hand.includes(card), label + ': card stays in hand');
      assert.equal(battle.player.energy, beforeEnergy, label + ': no energy spent');
      assert.equal(battle.enemies[0].hp, beforeHp, label + ': no attack fired');
      scene.events.emit('shutdown');
    }
  }
});

test('game focus listeners are removed on shutdown and do not accumulate across battle entries', () => {
  const gameEvents = new EventEmitter();
  let canceled = 0;
  for (let entry = 0; entry < 4; entry++) {
    const { scene } = fixture(undefined, 'cijian');
    const cancel = scene.cancelCardInteraction.bind(scene);
    scene.cancelCardInteraction = () => { canceled++; cancel(); };
    wirePointerEvents(scene, gameEvents);
    for (const event of ['blur', 'hidden']) assert.equal(gameEvents.listenerCount(event), 1, `entry ${entry}: one active ${event} listener`);
    gameEvents.emit('blur');
    gameEvents.emit('hidden');
    assert.equal(canceled, 2 * (entry + 1));
    scene.events.emit('shutdown');
    for (const event of ['blur', 'hidden']) assert.equal(gameEvents.listenerCount(event), 0, `entry ${entry}: no ${event} listener retains stopped scene`);
    gameEvents.emit('blur');
    gameEvents.emit('hidden');
    assert.equal(canceled, 2 * (entry + 1), 'stopped scenes no longer receive focus callbacks');
  }
});

test('all-target UI entry points ignore incidental enemy selections for hooks and card flight', () => {
  for (const suppliedTarget of [false, true]) {
    const { scene, view, battle } = fixture(undefined, 'hengsao');
    battle.player.relics = ['leigong', 'jianzhong'];
    battle.relics = [
      { id: 'leigong', def: RELICS.leigong, state: { used: false } },
      { id: 'jianzhong', def: RELICS.jianzhong, state: { n: 2 } }
    ];
    const enemy = battle.enemies[0];
    enemy.el = 'none'; enemy.hp = 16; enemy.maxHp = 100;
    const cardView = scene.cardViews[0];
    let eventTarget;
    battle.on('cardPlayed', ({ target }) => { eventTarget = target; });
    scene.playCard(cardView, suppliedTarget ? enemy : null);
    assert.equal(enemy.hp, 2, 'six base damage plus eight third-attack damage');
    assert.equal(enemy.alive, true, 'incidental target cannot add vulnerability before third-attack damage');
    assert.equal(enemy.buffs.vuln || 0, 0);
    assert.equal(battle.relics[0].state.used, false);
    assert.equal(eventTarget, null, 'the engine reports the actual all-target semantics');
    const flight = view.tweens.find(tween => tween.targets === cardView.container && tween.duration === 280);
    assert.ok(flight);
    assert.equal(flight.x, 800, 'all-target cards use the common central flight');
    assert.equal(flight.y, 420);
  }
});

test('a replacement pointer-down cannot leave the previous card marked as dragging', () => {
  const { scene, battle } = fixture(undefined, 'cijian', 1);
  wirePointerEvents(scene);
  const [first, second] = scene.cardViews;
  scene.input.emit('pointerdown', { worldX: first.x, worldY: first.y });
  assert.ok(scene.dragging === first);
  assert.equal(first.dragging, true);
  // A second mouse button, hybrid mouse/touch, or an interrupted input sequence
  // can produce another down before an up. Only one card may own the gesture.
  scene.input.emit('pointerdown', { worldX: second.x, worldY: second.y });
  assert.equal(first.dragging, false, 'old view cannot retain the drag depth/pose flag');
  assert.ok(scene.dragging === second);
  assert.equal(second.dragging, true);
  assert.equal(battle.hand.length, 2, 'replacing a drag does not play either card');
  scene.input.emit('pointerupoutside', {});
  assert.equal(first.dragging, false);
  assert.equal(second.dragging, false);
  scene.events.emit('shutdown');
});

test('all battle control hit zones stay inside the logical canvas', () => {
  const scene = new BattleScene();
  scene.init({});
  const view = fakeScene(scene);
  const zone = scene.add.zone;
  scene.add.zone = (x, y, width, height) => {
    const object = zone(x, y, width, height);
    // Preserve the actual constructor geometry; rendering is not exercised.
    object.width = width;
    object.height = height;
    return object;
  };
  scene.buildControls();
  for (const label of ['结束回合', '暂停', '牌组', '法宝']) {
    const button = view.button(label);
    assert.ok(button, label + ': real control exists');
    const hit = button.zone;
    assert.ok(hit.input.enabled, label + ': hit zone is active');
    assert.ok(hit.x >= 0 && hit.y >= 0, label + ': starts inside canvas');
    assert.ok(hit.x + hit.width <= 1600, label + ': right edge is inside canvas');
    assert.ok(hit.y + hit.height <= 900, label + ': bottom edge is inside canvas');
  }
});
