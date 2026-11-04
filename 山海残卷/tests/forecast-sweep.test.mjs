import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { setSeed, random } from '../src/core/random.js';

// Broad numeric parity, distinct from the targeted rule and purity fixtures.
// A seeded preview sees the same random stream as actual play without advancing
// it. Uncertain ordinary-mode outcomes are still not guaranteed by this test.
test('880 seeded card scenarios match actual resolution with UI target semantics', t => {
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: () => null, setItem() {} }
  });
  save.load();
  t.after(() => {
    setSeed(null);
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else delete globalThis.localStorage;
  });
  const foes = ['zhulong', 'qiongqi', 'huan', 'zheng', 'shanxiao', 'bifang'];
  const runes = ['feng', 'qing', 'hu', 'xun', 'hui', 'du', null];
  const cardIds = Object.keys(CARDS).filter(id => !CARDS[id].unplayable);
  const seenRunes = new Set(), seenCounts = new Set();
  let cases = 0, comparisons = 0;
  for (let seed = 0; seed < 10; seed++) {
    for (const id of cardIds) {
      setSeed(seed * 1000 + cases++);
      const player = run.newRun();
      player.relics = Object.keys(RELICS).filter(() => random() < 0.35);
      const encounter = Array.from({ length: 1 + Math.floor(random() * 3) },
        () => ({ id: foes[Math.floor(random() * foes.length)] }));
      const battle = new Battle(player, encounter);
      battle.start();
      battle.update(1);
      player.hp = 1 + Math.floor(random() * 100);
      player.maxHp = 100;
      player.energy = 8;
      player.buffs = {
        str: Math.floor(random() * 5), dex: Math.floor(random() * 5),
        weak: random() < 0.3 ? 2 : 0,
        comboDmg: random() < 0.3 ? 5 : 0,
        drawOnPlay: random() < 0.3 ? 1 : 0,
        toxic: random() < 0.3 ? 2 : 0
      };
      player.block = Math.floor(random() * 20);
      battle.enemies.forEach(enemy => {
        enemy.hp = 1 + Math.floor(random() * 50);
        enemy.maxHp = 100;
        enemy.block = Math.floor(random() * 20);
        enemy.buffs = {
          vuln: random() < 0.3 ? 2 : 0,
          burn: Math.floor(random() * 5), poison: Math.floor(random() * 10)
        };
      });
      battle.relics.forEach(relic => {
        if (relic.id === 'jianzhong') relic.state.n = Math.floor(random() * 3);
      });
      const card = {
        id, def: CARDS[id], up: random() < 0.5,
        rune: runes[Math.floor(random() * runes.length)]
      };
      seenRunes.add(card.rune);
      seenCounts.add(encounter.length);
      battle.hand = [card, ...Array.from({ length: Math.floor(random() * 9) },
        () => ({ id: 'cijian', def: CARDS.cijian }))];
      if (random() < 0.3) {
        battle.brushEl = ['jin', 'mu', 'huo', 'shui', 'tu'][Math.floor(random() * 5)];
        battle.brushCount = 2;
      }
      const selected = battle.enemies[Math.floor(random() * battle.enemies.length)];
      const targets = card.def.target === 'enemy' ? [selected] : battle.enemies;
      const before = targets.map(enemy => enemy.hp);
      const previews = targets.map(enemy => battle.previewDamage(card, enemy));
      assert.equal(battle.playCard(card, card.def.target === 'enemy' ? selected : null), true);
      targets.forEach((enemy, i) => {
        const context = `seed ${seed}, ${id}, ${enemy.id}, rune ${card.rune}`;
        assert.equal(previews[i]?.effective || 0, before[i] - enemy.hp, context);
        if (!previews[i]?.uncertain) {
          assert.equal(previews[i]?.lethal || false, !enemy.alive, context + ' lethal');
        }
        comparisons++;
      });
    }
  }
  assert.equal(cases, cardIds.length * 10);
  assert.ok(comparisons >= cases);
  assert.deepEqual([...seenRunes].sort(), [...runes].sort());
  assert.deepEqual([...seenCounts].sort(), [1, 2, 3]);
});
