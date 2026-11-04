import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { save } from '../src/core/save.js';
import { run } from '../src/core/run.js';
import { EVENTS } from '../src/data/events.js';
import { CARDS } from '../src/data/cards.js';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
beforeEach(() => { storage.clear(); save.load(); run.newRun(); });

test('fractional or corrupt difficulty cannot produce NaN battle modifiers', () => {
  for (const difficulty of [-3, 0.7, 1.5, 5.9, Infinity, NaN, '3', null, {}, []]) {
    save.data.ascension = difficulty;
    const direct = save.ascensionMods();
    assert.ok(Object.values(direct).every(Number.isFinite), String(difficulty));
    save.sanitize(save.data);
    assert.equal(Number.isInteger(save.data.ascension), true);
    assert.ok(save.data.ascension >= 0 && save.data.ascension <= 5);
    assert.ok(Object.values(save.ascensionMods()).every(Number.isFinite));
  }
});

test('loading fractional settings normalizes enum values and keeps volume fractions', () => {
  storage.set('shanhai_scrolls_v2', JSON.stringify({ v: 2, ascension: 1.5, settings: { quality: 1.8, music: 0.35, sfx: 0.65 } }));
  save.load();
  assert.equal(save.data.ascension, 1);
  assert.equal(save.data.settings.quality, 1);
  assert.equal(save.data.settings.music, 0.35);
  assert.equal(save.data.settings.sfx, 0.65);
});

test('save merge never mutates Object.prototype from malformed keys', () => {
  const field = 'shanhaiPollutionProbe';
  try {
    const hostile = JSON.parse('{"settings":{"__proto__":{"shanhaiPollutionProbe":true}}}');
    save.merge({ settings: {} }, hostile);
    assert.equal(Object.prototype[field], undefined);
    assert.equal(({})[field], undefined);
  } finally { delete Object.prototype[field]; }
});

test('selling a memory only grants gold when a card was removed', () => {
  const sell = EVENTS.find(event => event.id === 'guishi').options.find(option => option.label === '卖一段记忆');
  run.player.deck = [{ id: 'cijian', def: CARDS.cijian, up: false }];
  const before = run.player.gold;
  assert.match(sell.effect(run), /没什么可卖/);
  assert.equal(run.player.gold, before);
  assert.equal(run.player.deck.length, 1);
  run.addCard('mojian');
  assert.match(sell.effect(run), /磨剑/);
  assert.equal(run.player.gold, before + 70);
  assert.equal(run.player.deck.length, 1);
});

test('first card, foe, relic and potion discoveries survive an immediate reload', () => {
  save.seeCard('mojian');
  save.seeFoe('zhulong');
  run.grantRelic('hulu');
  run.addPotion('huichun');
  save.load();
  assert.equal(save.data.seen.cards.mojian, 1);
  assert.equal(save.data.seen.foes.zhulong, 1);
  assert.equal(save.data.seen.relics.hulu, 1);
  assert.equal(save.data.seen.potions.huichun, 1);
  assert.equal(save.data.stats.relics, 1, 'first relic write includes pickup statistics');
});

test('page hiding flushes later discovery counts and listeners install only once', () => {
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  let writes = 0;
  const original = save.write;
  save.write = function () { writes++; return original.call(this); };
  try {
    save.installPersistence(win, doc);
    save.installPersistence(win, doc);
    save.seeCard('cijian'); save.seeCard('cijian');
    const afterFirst = writes;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(writes, afterFirst, 'visible changes do not flush');
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(writes, afterFirst + 1);
    save.load();
    assert.equal(save.data.seen.cards.cijian, 2);
    win.dispatchEvent(new Event('pagehide'));
    assert.equal(writes, afterFirst + 2, 'only one installed listener');
    save.removePersistence();
    win.dispatchEvent(new Event('pagehide'));
    assert.equal(writes, afterFirst + 2);
  } finally { save.write = original; save.removePersistence?.(); }
});
