import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { fakeScene, installFakePhaser } from './helpers/fake-scene.mjs';
import { uiButtons, flatten } from '../src/testing/ui-actions.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { POTIONS } from '../src/data/potions.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { setSeed, random } from '../src/core/random.js';
import { audio } from '../src/core/audio.js';

installFakePhaser();
const { ShopScene } = await import('../src/scenes/ShopScene.js');
const { pickCard } = await import('../src/ui/overlays.js');
const { makeButton } = await import('../src/ui/widgets.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
audio.sfx = () => {};
audio.playBgm = () => {};
beforeEach(() => { setSeed(713); save.load(); run.newRun(); run.player.gold = 1000; });

// Display geometry only. Production pickers, shop actions and metadata readers run unchanged.
function fixture(scene = {}, key = 'Test') {
  const view = fakeScene(scene);
  scene.sys = { settings: { key } };
  for (const [kind, create] of Object.entries(scene.add)) {
    scene.add[kind] = (...args) => {
      const object = create(...args);
      object.originX = 0.5; object.originY = 0.5;
      if (['zone', 'rectangle'].includes(kind)) [object.width, object.height] = args.slice(2, 4);
      if (kind === 'text') { object.width = String(args[2]).length * 14; object.height = 24; }
      if (kind === 'image') object.texture = { key: args[2] };
      object.setOrigin = function (x = 0.5, y = x) { this.originX = x; this.originY = y; return this; };
      object.getData = function (key) { return this.data?.[key]; };
      object.getBounds = function () {
        let x = this.x, y = this.y;
        for (let p = this.parentContainer; p; p = p.parentContainer) { x += p.x; y += p.y; }
        const width = this.width * this.scaleX, height = this.height * this.scaleY;
        const left = x - width * this.originX, top = y - height * this.originY;
        return { x: left, y: top, width, height, centerX: left + width / 2, centerY: top + height / 2,
          contains: (px, py) => px >= left && px <= left + width && py >= top && py <= top + height };
      };
      return object;
    };
  }
  // Phaser removes children from the scene display list when a container owns them.
  Object.defineProperty(scene.children, 'list', { get: () => view.objects.filter(o => !o.parentContainer) });
  return { scene, view };
}
const buttonFor = (scene, object) => uiButtons(scene).find(button => button.object === object);

test('real picker exposes complete card metadata and hides underlying actions', () => {
  const { scene } = fixture();
  const underlying = makeButton(scene, 20, 20, 120, 40, 'underlying', () => {});
  const cards = [{ id: 'cijian', up: true, rune: 'qing' }, { id: 'shigu_curse', up: false }];
  const before = JSON.stringify(cards);
  let chosen = null;
  const picker = pickCard(scene, { cards, title: '修　符', onPick: card => { chosen = card; } });
  const actions = uiButtons(scene);
  assert.equal(actions.some(action => action.object === underlying.zone), false);
  const choices = actions.filter(action => action.card);
  assert.deepEqual(choices.map(action => action.card.id), ['cijian', 'shigu_curse']);
  assert.equal(choices[0].card.upgraded, true);
  assert.equal(choices[0].card.cost, 0);
  assert.equal(choices[0].card.rune, 'qing');
  assert.ok(choices[0].card.runeDescription);
  assert.ok(choices[0].card.description);
  assert.match(choices[0].label, /刺剑/);
  assert.equal(JSON.stringify(cards), before);
  choices[1].object.emit('pointerdown');
  assert.ok(chosen === cards[1], 'metadata action selects the actual requested card');
  assert.equal(uiButtons(scene).some(action => action.card), false);
  assert.ok(buttonFor(scene, underlying.zone));
  picker.close();
});

test('real removal picker reports exact deck cards and removes only the chosen card', () => {
  const { scene } = fixture(new ShopScene(), 'Shop');
  run.player.deck = [{ id: 'cijian', up: true, rune: 'qing' }, { id: 'shigu_curse', up: false }];
  scene.create();
  const remove = scene.items.find(item => item.kind === 'remove');
  scene.buy(remove);
  const choices = uiButtons(scene).filter(action => action.card);
  assert.deepEqual(choices.map(action => action.card.id), ['cijian', 'shigu_curse']);
  const target = choices.find(action => action.card.id === 'shigu_curse');
  target.object.emit('pointerdown');
  assert.deepEqual(run.player.deck.map(card => card.id), ['cijian']);
  assert.equal(run.player.gold, 1000 - remove.price);
  assert.equal(buttonFor(scene, target.object), undefined, 'destroyed picker actions cannot be offered again');
});

test('shop labels identify all item kinds, update discounts, and never offer sold controls', () => {
  run.player.relics = Object.keys(RELICS).filter(id => id !== 'suanpan');
  const { scene } = fixture(new ShopScene(), 'Shop');
  scene.create();
  const getName = item => item.kind === 'card' ? CARDS[item.card.id].name
    : item.kind === 'relic' ? RELICS[item.id].name : item.kind === 'potion' ? POTIONS[item.id].name : '擦符';
  for (const item of scene.items) {
    const action = buttonFor(scene, item.btn.zone);
    assert.ok(action.label.includes(getName(item)), item.kind);
    assert.ok(action.label.includes(`${item.price} 墨`), item.kind);
    assert.equal(action.card?.id, item.card?.id);
  }
  const relic = scene.items.find(item => item.id === 'suanpan');
  const soldZone = relic.btn.zone;
  scene.buy(relic);
  assert.equal(buttonFor(scene, soldZone), undefined);
  for (const item of scene.items.filter(item => !item.bought)) {
    const action = buttonFor(scene, item.btn.zone);
    assert.ok(action.label.includes(`${Math.round(item.basePrice * 0.75)} 墨`), item.kind);
  }
  const before = JSON.stringify({ player: run.player, save: save.data });
  setSeed(59); const expectedNext = random(); setSeed(59);
  const ids = uiButtons(scene).map(action => action.id);
  for (let n = 0; n < 30; n++) assert.deepEqual(uiButtons(scene).map(action => action.id), ids);
  assert.equal(random(), expectedNext, 'UI reads do not advance game RNG');
  assert.equal(JSON.stringify({ player: run.player, save: save.data }), before);
});

test('fallback matches the longest known card ID including underscore curse IDs', () => {
  const { scene } = fixture();
  for (const texture of ['card_shigu_curse', 'card_shigu_curse_up', 'card_shigu_up', 'card_unknown']) {
    scene.add.image(300, 300, texture).setInteractive().on('pointerdown', () => {});
  }
  const actions = uiButtons(scene);
  assert.deepEqual(actions.map(action => action.card?.id), ['shigu_curse', 'shigu_curse', 'shigu', undefined]);
  assert.equal(actions[1].card.upgraded, true);
  assert.equal(actions[0].card.upgraded, false);
});

test('hidden, destroyed, disabled, and old-page actions are omitted without mutation', () => {
  const { scene, view } = fixture();
  const parent = scene.add.container(0, 0).setDepth(200);
  const child = scene.add.zone(0, 0, 100, 40).setInteractive().on('pointerdown', () => {});
  parent.add(child);
  parent.visible = false;
  assert.equal(flatten(scene).some(entry => entry.object === child), false);
  parent.visible = true; parent.alpha = 0;
  assert.equal(uiButtons(scene).length, 0);
  parent.alpha = 1; child.disableInteractive();
  assert.equal(uiButtons(scene).length, 0);
  child.setInteractive();
  assert.equal(uiButtons(scene).length, 1);
  parent.destroy();
  assert.equal(uiButtons(scene).length, 0);
  const cards = Array.from({ length: 17 }, (_, n) => ({ id: n === 16 ? 'shigu_curse' : 'cijian', up: false }));
  const picker = pickCard(scene, { cards });
  const old = uiButtons(scene).filter(action => action.card);
  assert.equal(old.length, 16);
  const next = uiButtons(scene).find(action => action.label === '›');
  assert.ok(next);
  next.object.emit('pointerdown', {}, 0, 0, { stopPropagation() {} }); view.flushTimers(40);
  const current = uiButtons(scene).filter(action => action.card);
  assert.deepEqual(current.map(action => action.card.id), ['shigu_curse']);
  assert.ok(current.every(action => !old.some(prior => prior.object === action.object)));
  scene.input.enabled = false;
  assert.deepEqual(uiButtons(scene), []);
  scene.input.enabled = true;
  scene.sys.settings.key = 'Reward'; scene.picked = true;
  assert.deepEqual(uiButtons(scene), []);
  picker.close();
});

test('event actions expose option names and consequences despite separate label depth', async () => {
  const { EventScene } = await import('../src/scenes/EventScene.js');
  const { scene } = fixture(new EventScene(), 'Event');
  let effectCalls = 0;
  scene.ev = { title: '测试际遇', text: '面对选择。', options: [
    { label: '以血换符', hint: '失去10点生命，获得符箓', effect: () => effectCalls++ },
    { label: '转身离开', hint: '不作交换', effect: () => effectCalls++ }
  ] };
  scene.buildBody({ index: 0 });
  const buttons = uiButtons(scene);
  assert.equal(buttons.length, 2);
  for (let i = 0; i < scene.ev.options.length; i++) {
    const opt = scene.ev.options[i];
    assert.ok(buttons[i].label.includes(opt.label), 'action identifies the choice');
    assert.ok(buttons[i].label.includes(opt.hint), 'action includes the visible cost/consequence');
  }
  assert.equal(effectCalls, 0, 'reading decision metadata never chooses an option');
});
