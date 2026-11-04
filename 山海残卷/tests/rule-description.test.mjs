import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { Battle } from '../src/systems/battle.js';
import { CARDS, cardText } from '../src/data/cards.js';
import { POTIONS } from '../src/data/potions.js';
import { RELICS } from '../src/data/relics.js';
import { run } from '../src/core/run.js';
import { save } from '../src/core/save.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
beforeEach(() => save.load());
const card = (id, up = false) => ({ id, def: CARDS[id], up });

function fixture(relics = [], enemyCount = 1) {
  const player = run.newRun();
  player.relics = relics;
  const battle = new Battle(player, Array.from({ length: enemyCount }, () => ({ id: 'shanxiao' })));
  battle.start();
  battle.update(1);
  player.energy = 20;
  for (const enemy of battle.enemies) {
    enemy.hp = enemy.maxHp = 1000;
    enemy.el = 'none';
    enemy.def = { ...enemy.def, traits: {} };
    enemy.move = { block: 1 };
  }
  return battle;
}

test('baoyan describes its minimum base damage and retains its existing burn multiplier', () => {
  for (const up of [false, true]) {
    for (const burn of [0, 2]) {
      const b = fixture(), c = card('baoyan', up), enemy = b.enemies[0];
      assert.match(cardText(c), /至少\s*4/);
      b.hand = [c];
      enemy.buffs.burn = burn;
      assert.equal(b.playCard(c, enemy), true);
      assert.equal(1000 - enemy.hp, Math.max(4, burn * (up ? 7 : 5)));
      assert.equal(enemy.buffs.burn || 0, 0);
    }
  }
});

test('xiangshu upgraded description exposes the extra draw without changing its base version', () => {
  const baseText = cardText(card('xiangshu'));
  const upgradedText = cardText(card('xiangshu', true));
  assert.match(baseText, /等量/);
  assert.match(upgradedText, /额外.*1\s*张/);
  assert.notEqual(upgradedText, baseText);
  assert.doesNotMatch(upgradedText, /\{[a-z0-9]+\}/i);
  for (const up of [false, true]) {
    const b = fixture(), c = card('xiangshu', up);
    b.hand = [c, card('yufeng'), card('yufeng')];
    b.drawPile = Array.from({ length: 10 }, () => card('yufeng'));
    assert.equal(b.playCard(c), true);
    assert.equal(b.hand.length, up ? 3 : 2);
  }
  assert.match(cardText(card('cijian', true)), /9/, 'ordinary upgraded cards retain variable substitution');
});

test('jingjie and huxin describe attack reduction while burn remains unreduced', () => {
  for (const source of ['jingjie', 'huxin']) {
    const b = fixture();
    if (source === 'jingjie') {
      const c = card(source);
      assert.match(cardText(c), /攻击伤害.*减半/);
      b.hand = [c];
      assert.equal(b.playCard(c), true);
    } else {
      assert.match(POTIONS[source].desc, /攻击伤害.*减半/);
      b.player.potions = [source];
      assert.equal(b.usePotion(0), true);
    }
    assert.equal(b.hurtPlayer(8), 4, 'ordinary incoming attacks are halved');
    b.player.buffs.burn = 8;
    const before = b.player.hp;
    b.endTurn();
    assert.equal(before - b.player.hp, 8, 'established raw burn damage bypasses attack reduction');
  }
});

test('leigong describes the surviving single-target trigger and its once-per-turn limit', () => {
  const desc = RELICS.leigong.desc;
  for (const term of ['每回合', '一次', '单体', '存活']) assert.ok(desc.includes(term), term);
  const b = fixture(['leigong'], 2);
  const opening = card('hengsao'), lethal = card('cijian');
  const firstEligible = card('cijian'), subsequent = card('cijian');
  b.hand = [opening, lethal, firstEligible, subsequent];
  assert.equal(b.playCard(opening), true);
  assert.ok(b.enemies.every(enemy => !enemy.buffs.vuln), 'area attacks do not invent a single target');
  b.enemies[0].hp = 1;
  assert.equal(b.playCard(lethal, b.enemies[0]), true);
  assert.equal(b.relics[0].state.used, false, 'a killed target does not use the surviving-target trigger');
  assert.equal(b.playCard(firstEligible, b.enemies[1]), true);
  assert.equal(b.enemies[1].buffs.vuln, 1);
  assert.equal(b.playCard(subsequent, b.enemies[1]), true);
  assert.equal(b.enemies[1].buffs.vuln, 1, 'later eligible cards do not retrigger this turn');
});

test('wuxing describes and preserves the first positive non-X discount', () => {
  assert.match(RELICS.wuxing.desc, /非\s*X\s*费/i);
  assert.match(RELICS.wuxing.desc, /需要灵力|正费用|费用大于\s*0/);
  const b = fixture(['wuxing']);
  const zero = card('pozhang'), x = card('fenxu'), paid = card('zhongpi');
  b.hand = [zero, x, paid];
  b.player.energy = 3;
  assert.equal(b.playCard(zero, b.enemies[0]), true);
  assert.equal(b.relics[0].state.used, false);
  assert.equal(b.costOf(x, true), 3);
  assert.equal(b.playCard(x), true);
  assert.equal(b.player.energy, 0);
  assert.equal(b.relics[0].state.used, false, 'X-cost cards bypass the discount');
  b.gainEnergy(1);
  assert.equal(b.costOf(paid, true), 1);
  assert.equal(b.playCard(paid, b.enemies[0]), true);
  assert.equal(b.player.energy, 0);
  assert.equal(b.relics[0].state.used, true);
});

test('hulu describes victory healing and never awards it on defeat', () => {
  assert.match(RELICS.hulu.desc, /胜利/);
  const won = fixture(['hulu']);
  won.damage(won.enemies[0], 1000, { raw: true, pierce: true });
  assert.equal(won.phase, 'won');
  assert.equal(won.outHeal, 9);
  const lost = fixture(['hulu']);
  lost.lose();
  assert.equal(lost.outHeal, 0);
});

test('qiankun describes non-X copies and does not create an unusable X-cost copy', () => {
  assert.match(cardText(card('qiankun')), /非\s*X\s*费/i);
  for (const attackId of ['fenxu', 'cijian']) {
    const b = fixture(), copySpell = card('qiankun'), attack = card(attackId);
    b.hand = [copySpell, attack];
    assert.equal(b.playCard(copySpell), true);
    const copies = b.hand.filter(candidate => candidate !== attack);
    assert.equal(copies.length, attackId === 'fenxu' ? 0 : 1);
    if (copies.length) {
      assert.equal(copies[0].id, attackId);
      assert.equal(b.costOf(copies[0], true), 0);
    }
  }
});
