import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { audio } from '../src/core/audio.js';
import { Battle } from '../src/systems/battle.js';
import { availableNodes } from '../src/systems/mapgen.js';
import { setSeed, withIsolatedRandom, random } from '../src/core/random.js';
import { RELICS } from '../src/data/relics.js';

// Production scene actions and callbacks execute unchanged. The adapter substitutes
// rendering, a manually advanced timer queue, and instant dialogue clicks, not rules.
// This is progression coverage, not a browser/rendering check or a balance test.
function mount(scene) {
  const view = fakeScene(scene);
  scene.textures.get = () => ({ getSourceImage: () => ({ width: 100, height: 100 }) });
  for (const key of Object.keys(scene.add)) {
    const create = scene.add[key];
    scene.add[key] = (...args) => {
      const object = create(...args);
      for (const name of ['setVisible', 'setTexture', 'clearTint', 'setRotation', 'setPosition', 'setX', 'setY']) {
        object[name] = function () { return this; };
      }
      return object;
    };
  }
  const keyboard = scene.input.keyboard;
  scene.input = Object.assign(scene.add.zone(), { enabled: true, keyboard });
  scene.time.addEvent = () => ({ remove() {} });
  scene.cameras.main.setZoom = () => {};
  scene.cameras.main.zoom = 1;
  return view;
}

function pump(scene, view) {
  // Nested fades/effects schedule more callbacks. Real gameplay never advances
  // automatically here: only the callbacks registered by production scenes do.
  for (let i = 0; i < 8; i++) {
    view.flushTimers();
    view.completeTweens();
    let advances = 0;
    while (scene._dialogue && advances++ < 100) scene._dialogue.advance();
    assert.equal(scene._dialogue || null, null, 'dialogue must close within its bound');
  }
}

function restoreProperties(object, properties) {
  for (const key of Reflect.ownKeys(object)) {
    if (!Object.hasOwn(properties, key)) delete object[key];
  }
  Object.defineProperties(object, properties);
}

test('12 bounded campaigns traverse production scene progression and finish once', async t => {
  const globals = Object.fromEntries(['Phaser', 'localStorage', 'performance']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const runBefore = Object.getOwnPropertyDescriptors(run);
  const saveBefore = Object.getOwnPropertyDescriptors(save);
  const audioBefore = Object.getOwnPropertyDescriptors(audio);
  const errorBefore = console.error;
  t.after(() => {
    for (const [key, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    restoreProperties(run, runBefore);
    restoreProperties(save, saveBefore);
    restoreProperties(audio, audioBefore);
    console.error = errorBefore;
  });
  installFakePhaser();
  Phaser.BlendModes = { NORMAL: 0, MULTIPLY: 1 };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true, value: { getItem: () => null, setItem() {} }
  });
  let now = 1000;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true, value: { now: () => now }
  });
  audio.sfx = audio.playBgm = audio.stopBgm = () => {};
  const errors = [];
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const classes = {};
  for (const name of ['Map', 'Battle', 'Reward', 'Rest', 'Shop', 'Event', 'Story', 'Ending', 'Result']) {
    classes[name] = (await import(`../src/scenes/${name}Scene.js`))[`${name}Scene`];
  }
  const pick = values => values[Math.floor(random() * values.length)];
  const click = (view, label) => {
    now += 1000;
    const button = view.button(label);
    assert.ok(button, `button ${label} exists`);
    button.zone.emit('pointerdown');
  };
  const totals = { runs: 0, wins: 0, losses: 0, battles: 0, turns: 0, transitions: 0 };
  const acts = new Set(), nodeTypes = new Set(), events = new Set();

  // This restores the entire prior RNG stream on success or failure, not merely
  // the initial seed. All seeded campaign work is synchronous inside this scope.
  withIsolatedRandom(() => {
    for (const seed of [0, 1, 2, 3, 4, 5, 60, 61, 62, 63, 64, 65]) {
      setSeed(seed);
      save.load();
      run.newRun();
      const initialRuns = save.data.runs;
      const powered = seed >= 60;
      if (powered) {
        // Strong-but-finite fixture for late-act coverage: ordinary card/relic
        // definitions and pickup hooks, no immortality or free energy overrides.
        // Seeds 0–5 retain the ordinary unmodified starter character.
        for (const id of Object.keys(RELICS)) run.grantRelic(id);
        run.player.deck = [];
        for (let i = 0; i < 10; i++) {
          const card = run.addCard(i % 2 ? 'lianhuan' : 'hengsao', true);
          run.engrave(card, 'qing');
        }
      }
      let route = ['Story', { kind: 'act' }], steps = 0;
      let previousDepth = 0, expectedKills = 0, terminalResults = 0;
      while (route && steps++ < 130) {
        const [name, data] = route;
        const context = `seed ${seed}, ${powered ? 'strong fixture' : 'starter'}, ${name}, act ${run.actIndex}, depth ${run.depth}`;
        totals.transitions++;
        const scene = new classes[name]();
        scene.init?.(data || {});
        const view = mount(scene);
        route = null;

        if (name === 'Map') {
          for (const method of ['layout', 'drawTitle', 'drawLinks', 'drawNodes', 'drawLegend', 'drawHud', 'bindNodeInput']) {
            scene[method] = () => {};
          }
          scene.create();
          acts.add(run.actIndex);
          const choices = availableNodes(run.map);
          assert.ok(choices.length, context + ': map has a next node');
          const node = pick(choices);
          assert.equal(node.cleared, false, context + ': no cleared-node revisit');
          nodeTypes.add(node.type);
          scene.enterNode(node);
          assert.equal(run.depth, (run.actIndex + 1) * 10 + node.col, context);
          assert.ok(run.depth > previousDepth, context + ': depth progresses');
          previousDepth = run.depth;
        } else if (name === 'Battle') {
          scene.act = run.map.act;
          const battle = scene.battle = new Battle(run.player, scene.encounter, { boss: scene.nodeType === 'boss' });
          for (const method of ['refreshHand', 'drawEnergy', 'refreshPlayerHud', 'refreshEnemyBars',
            'updateEnemyIntents', 'floatText', 'hideIntentGlow', 'refreshBuffs', 'hideDamagePreview',
            'hideIntentTip', 'updateEnemyTraits', 'refreshPiles', 'updateHandState', 'drawPotions',
            'showDamagePreview', 'playSurge']) scene[method] = () => {};
          scene.enemyViews = battle.enemies.map(foe => ({
            foe, x: 900, y: 400, displayW: 200, displayH: 200,
            img: scene.add.image(), container: scene.add.container(),
            hpBar: scene.add.graphics(), intent: scene.add.container()
          }));
          // Keep real event wiring: enemy-death statistics and onEnd rewards are
          // part of the integration under test, not manually simulated outcomes.
          scene.wireEvents();
          battle.on('enemyDeath', () => expectedKills++);
          battle.start();
          battle.update(1);
          let actions = 0;
          while (!battle.finished && actions++ < 2000) {
            if (battle.phase === 'player') {
              if (run.player.potions.length && random() < 0.25) battle.usePotion(0);
              else {
                const cards = battle.hand.filter(card => battle.canPlay(card));
                if (cards.length && random() < 0.97) battle.playCard(pick(cards), battle.aliveEnemies()[0]);
                else battle.endTurn();
              }
            } else battle.update(1);
          }
          assert.equal(battle.finished, true, context + ': battle terminates');
          totals.battles++;
          totals.turns += battle.turn;
          assert.equal(run.stats.kills, expectedKills, context + ': kill statistics match deaths');
        } else if (name === 'Reward') {
          scene.create();
          if (scene.isTreasure) click(view, '收起');
          else if (random() < 0.3) click(view, '跳过');
          else {
            const image = view.objects.find(object => object.type === 'Image' && object.data?.aiCard);
            assert.ok(image, context + ': card choice exists');
            image.emit('pointerdown');
          }
        } else if (name === 'Rest') {
          scene.create();
          if (random() < 0.5) scene.doHeal(Math.round(run.player.maxHp * 0.36));
          else {
            if (random() < 0.5) scene.doUpgrade();
            else scene.doEngrave();
            const picker = view.pickers()[0];
            if (picker) {
              const content = picker.list.find(object => object.type === 'Container');
              if (content.list.some(object => object.type === 'Zone' && object.listeners.pointerdown)) view.pickFirst(picker);
              else { view.cancelPicker(picker); scene.leave(); }
            } else scene.leave();
          }
        } else if (name === 'Shop') {
          scene.create();
          for (const item of scene.items.filter(item => item.kind !== 'remove' && item.price <= run.player.gold)) {
            if (random() < 0.4) scene.buy(item);
          }
          scene.leave();
        } else if (name === 'Event') {
          scene.create();
          events.add(scene.ev.id);
          scene.choose(pick(scene.ev.options));
          pump(scene, view);
          scene.input.emit('pointerdown');
        } else if (name === 'Story') {
          scene.create();
          now += 1000;
          const button = view.objects.find(object => object.type === 'Container' && object.zone && !object.destroyed);
          assert.ok(button, context + ': story continuation exists');
          button.zone.emit('pointerdown');
        } else if (name === 'Ending') {
          scene.create();
          const button = view.objects.find(object => object.type === 'Container' && object.zone?.input?.enabled);
          assert.ok(button, context + ': an ending is unlocked');
          now += 1000;
          button.zone.emit('pointerdown');
          pump(scene, view);
          click(view, '回山门');
          totals.wins++;
          terminalResults++;
        } else if (name === 'Result') {
          scene.create();
          scene.leave(false);
          totals.losses++;
          terminalResults++;
        } else assert.fail(context + ': unexpected scene');

        pump(scene, view);
        assert.deepEqual(errors, [], context + ': no swallowed engine errors');
        assert.equal(view.transitions.length, 1, context + ': exactly one outgoing transition');
        route = view.transitions[0];
        if (route[0] === 'Title') route = null;
        if (route?.[0] === 'Map' && run.map?.cur.node) {
          assert.equal(run.map.cur.node.cleared, true, context + ': clear node before returning');
        }
        const player = run.player;
        assert.ok(Number.isFinite(player.hp) && player.hp >= 0 && player.hp <= player.maxHp, context + ': HP bounds');
        assert.equal(player.alive, player.hp > 0, context + ': alive state');
        assert.ok(Number.isFinite(player.gold) && player.gold >= 0, context + ': gold bounds');
        assert.ok(player.potions.length <= 3, context + ': potion cap');
        assert.equal(new Set(player.relics).size, player.relics.length, context + ': distinct relics');
        assert.equal(new Set(run.flags.pages).size, run.flags.pages.length, context + ': distinct pages');
        assert.equal(save.data.runs, initialRuns, context + ': no accidental run restart');
      }
      assert.equal(route, null, `seed ${seed}: campaign terminates within bound`);
      assert.equal(terminalResults, 1, `seed ${seed}: one campaign result`);
      assert.equal(run.active, false, `seed ${seed}: terminal run inactive`);
      totals.runs++;
    }
  });
  assert.equal(totals.runs, 12);
  assert.ok(totals.wins > 0 && totals.losses > 0, 'both victory and defeat covered');
  assert.deepEqual([...acts].sort(), [0, 1, 2], 'all acts reached');
  assert.deepEqual([...nodeTypes].sort(), ['battle', 'boss', 'elite', 'event', 'page', 'rest', 'shop', 'treasure']);
  assert.ok(events.size >= 5 && totals.battles >= 20 && totals.turns > totals.battles, 'non-vacuous campaign coverage');
  t.diagnostic(JSON.stringify({ ...totals, eventKinds: events.size }));
});
