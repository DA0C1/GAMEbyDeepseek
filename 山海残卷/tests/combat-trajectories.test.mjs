import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';
import { CARDS } from '../src/data/cards.js';
import { FOES } from '../src/data/enemies.js';
import { RELICS } from '../src/data/relics.js';
import { POTIONS } from '../src/data/potions.js';
import { getSeed, setSeed, random, withIsolatedRandom } from '../src/core/random.js';

// Bounded regression distilled from 35,000 exploratory finite-HP battles:
// 120,258 turns, 395,996 plays, 84,116 potion uses, no stalled trajectories.
test('300 finite-HP trajectories conserve cards and finish with one stable result', t => {
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const seedBefore = getSeed(), dataBefore = save.data, runBefore = { ...run };
  const errorBefore = console.error;
  const errors = [];
  t.after(() => {
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else delete globalThis.localStorage;
    console.error = errorBefore;
    save.data = dataBefore;
    Object.assign(run, runBefore);
    // withIsolatedRandom restores the complete RNG state, even on assertion failure.
    // This fallback also restores the seed mode if setup exits before that scope.
    if (getSeed() !== seedBefore) setSeed(seedBefore);
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true, value: { getItem: () => null, setItem() {} }
  });
  console.error = (...args) => errors.push(args.map(String).join(' '));
  save.load();
  const ids = Object.keys(CARDS), foes = Object.keys(FOES), relics = Object.keys(RELICS);
  const potions = Object.keys(POTIONS), runes = ['feng', 'qing', 'hu', 'xun', 'hui', 'du'];
  const pick = values => values[Math.floor(random() * values.length)];
  const totals = { wins: 0, losses: 0, turns: 0, multiTurn: 0, plays: 0, potions: 0 };
  const profiles = [
    { name: 'normal', start: 0, injured: false, relicRate: 0.1, ascension: 0 },
    { name: 'injured', start: 10000, injured: true, relicRate: 0.1, ascension: 0 },
    { name: 'high-relic', start: 20000, injured: true, relicRate: 0.35, ascension: 0 },
    { name: 'highest-ascension', start: 25000, injured: true, relicRate: 0.35, ascension: 5 }
  ];

  withIsolatedRandom(() => {
    for (const profile of profiles) {
      for (let offset = 0; offset < 75; offset++) {
        const seed = profile.start + offset;
        setSeed(seed);
        save.data.ascension = profile.ascension;
        const player = run.newRun();
        if (offset % 3 !== 0) {
          player.deck = Array.from({ length: 12 + Math.floor(random() * 15) }, () => ({
            id: pick(ids), up: random() < 0.3,
            rune: random() < 0.2 ? pick(runes) : null
          }));
        }
        player.deck.forEach((card, i) => { card.qaTag = i; });
        for (const id of relics.filter(() => random() < profile.relicRate)) run.grantRelic(id);
        if (profile.injured) player.hp = 1 + Math.floor(random() * player.maxHp);
        player.potions = Array.from({ length: 3 }, () => pick(potions));
        const encounter = Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({ id: pick(foes) }));
        const permanentDeck = JSON.stringify(player.deck);
        const tagsExpected = player.deck.map(card => card.qaTag);
        const battle = new Battle(player, encounter);
        let wins = 0, losses = 0, ends = 0, actions = 0;
        battle.on('win', () => wins++).on('lose', () => losses++).on('end', () => ends++);
        const context = `${profile.name}, seed ${seed}, foes ${encounter.map(e => e.id).join(',')}`;
        const verify = () => {
          const label = `${context}, turn ${battle.turn}, action ${actions}`;
          const piles = [...battle.hand, ...battle.drawPile, ...battle.discardPile, ...battle.exhaustPile];
          const originalTags = piles.filter(card => !card.temp).map(card => card.qaTag).sort((a, b) => a - b);
          assert.deepEqual(originalTags, tagsExpected, label + ': original card conservation');
          assert.equal(new Set(piles).size, piles.length, label + ': duplicate card references');
          assert.equal(JSON.stringify(player.deck), permanentDeck, label + ': permanent deck unchanged');
          assert.ok(battle.hand.length <= 10, label + ': hand cap');
          assert.ok(Number.isFinite(player.hp) && player.hp >= 0 && player.hp <= player.maxHp, label + ': player HP');
          assert.ok(Number.isFinite(player.energy) && player.energy >= 0, label + ': energy');
          assert.ok(Number.isFinite(player.block) && player.block >= 0, label + ': block');
          assert.equal(player.alive, player.hp > 0, label + ': player alive');
          for (const enemy of battle.enemies) {
            // Enemy HP intentionally retains overkill for damage/forecast accounting.
            assert.ok(Number.isFinite(enemy.hp) && enemy.hp <= enemy.maxHp, label + ': enemy HP');
            assert.ok(Number.isFinite(enemy.block) && enemy.block >= 0, label + ': enemy block');
            assert.equal(enemy.alive, enemy.hp > 0, label + ': enemy alive');
          }
          if (battle.phase === 'won') {
            assert.equal(battle.aliveEnemies().length, 0, label + ': victory requires all foes dead');
            assert.equal(player.alive, true, label + ': victorious player alive');
          }
          if (battle.phase === 'lost') assert.equal(player.alive, false, label + ': defeated player dead');
          assert.ok(wins + losses <= 1 && ends <= 1, label + ': unique result');
          assert.deepEqual(errors, [], label + ': no swallowed card/relic/event errors');
        };
        battle.start();
        battle.update(1);
        verify();
        while (!battle.finished && actions < 3000 && battle.turn <= 100) {
          actions++;
          if (battle.phase === 'player') {
            if (player.potions.length && random() < 0.18) {
              const before = player.potions.length;
              assert.equal(battle.usePotion(0), true, context);
              assert.equal(player.potions.length, before - 1, context + ': potion consumed once');
              totals.potions++;
            } else {
              const playable = battle.hand.filter(card => battle.canPlay(card));
              if (playable.length && random() < 0.93) {
                assert.equal(battle.playCard(pick(playable), pick(battle.aliveEnemies())), true, context);
                totals.plays++;
              } else battle.endTurn();
            }
          } else battle.update(1);
          verify();
        }
        assert.equal(battle.finished, true, context + ': bounded trajectory must terminate');
        assert.equal(wins + losses, 1, context + ': exactly one win/loss');
        assert.equal(ends, 1, context + ': exactly one end');
        const snapshot = () => JSON.stringify({
          player, enemies: battle.enemies, hand: battle.hand, draw: battle.drawPile,
          discard: battle.discardPile, exhaust: battle.exhaustPile, phase: battle.phase, turn: battle.turn
        });
        const terminal = snapshot();
        battle.endTurn();
        assert.equal(battle.usePotion(0), false, context);
        const staleCard = battle.hand[0] || battle.discardPile[0] || battle.exhaustPile[0];
        assert.equal(battle.playCard(staleCard, battle.enemies[0]), false, context);
        battle.update(100);
        battle.update(100);
        verify();
        assert.equal(snapshot(), terminal, context + ': terminal inputs leave state unchanged');
        assert.equal(ends, 1, context + ': no repeated end');
        totals.wins += wins;
        totals.losses += losses;
        totals.turns += battle.turn;
        totals.multiTurn += Number(battle.turn > 1);
      }
    }
  });
  assert.equal(totals.wins + totals.losses, 300);
  assert.ok(totals.wins > 0 && totals.losses > 0, 'exercise both terminal outcomes');
  assert.ok(totals.multiTurn >= 150 && totals.turns > 600, 'exercise repeated turn lifecycles');
  assert.ok(totals.plays > 1000 && totals.potions > 100, 'exercise real cards and potions');
  t.diagnostic(JSON.stringify(totals));
});
