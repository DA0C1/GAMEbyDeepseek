import { random, withIsolatedRandom } from "../core/random.js";
/* 战斗规则（纯逻辑，通过事件通知表现层） */

import { CARDS, cardVars } from '../data/cards.js';
import { FOES, pickMove } from '../data/enemies.js';
import { RELICS, RELIC_SETS, SET_NEED } from '../data/relics.js';
import { ELEMENTS, elOf, COMBO_NEED, relationOf, relationMult, generatesOf } from '../data/elements.js';
import { POTIONS } from '../data/potions.js';
import { save } from '../core/save.js';

class Emitter {
  constructor() { this._h = {}; }
  on(k, fn) { (this._h[k] = this._h[k] || []).push(fn); return this; }
  emit(k, ...args) {
    const list = this._h[k];
    if (!list) return;
    for (const fn of list) {
      try { fn(...args); } catch (e) { console.error('[battle] ' + k + ': ' + (e && e.stack ? e.stack : e)); }
    }
  }
}

export const BUFFS = {
  str: { name: '力量', icon: 'sword', color: '#b23a2e' },
  dex: { name: '敏捷', icon: 'feather', color: '#41694a' },
  weak: { name: '虚弱', icon: 'wind', color: '#8a7e6c' },
  vuln: { name: '易伤', icon: 'eye', color: '#b23a2e' },
  poison: { name: '中毒', icon: 'poison', color: '#41694a' },
  burn: { name: '灼烧', icon: 'fire', color: '#b23a2e' },
  thorns: { name: '荆棘', icon: 'claw', color: '#5c5347' },
  riposte: { name: '反击', icon: 'sword', color: '#b23a2e' },
  halve: { name: '镜界', icon: 'moon', color: '#2f6b8a' },
  energyMax: { name: '天命', icon: 'seal', color: '#b98f3f' },
  energyNext: { name: '蓄势', icon: 'talisman', color: '#b98f3f' },
  drawNext: { name: '守心', icon: 'lotus', color: '#41694a' },
  comboDmg: { name: '千机', icon: 'star', color: '#b98f3f' },
  drawOnPlay: { name: '连笔', icon: 'talisman', color: '#b98f3f' },
  toxic: { name: '毒雾', icon: 'poison', color: '#41694a' },
  bloodpact: { name: '血契', icon: 'heart', color: '#8b2a20' },
  regen: { name: '回春', icon: 'lotus', color: '#4a7a52' }
};

export class Battle extends Emitter {
  constructor(player, encounter, opt = {}) {
    super();
    this.player = player;
    this.enemies = [];
    this.hand = [];
    this.drawPile = [];
    this.discardPile = [];
    this.exhaustPile = [];
    this.relics = [];
    this.phase = 'intro';
    this.turn = 1;
    this.introT = 0;
    this.timer = 0;
    this.enemyQueue = [];
    this.enemyTimer = 0;
    this._vulnAtEnemyStart = 0;
    this.playingCard = null;
    this.lastTaken = 0;
    this.bonusGold = 0;
    this.outHeal = 0;
    this.damageDealt = 0;
    this.cardsPlayed = 0;
    // X 费牌实际消耗的灵力；本回合已打出的攻击牌数
    this.lastX = 0;
    this.turnAttacks = 0;
    this.turnCardsPlayed = 0;
    this.playerHurtThisTurn = false;
    // 笔意：连续同五行属性累积，满 3 张触发成势
    this.brushEl = null;
    this.brushCount = 0;
    this.chainEl = null;
    this.chainDrawn = 0;
    this.surgeCount = 0;
    this.finished = false;
    this.result = null;
    this.isBoss = !!opt.boss;
    this.noReward = !!opt.noReward;

    const mul = save.ascensionMods();
    encounter.forEach((spec, i) => {
      const d = FOES[spec.id];
      if (!d) return;
      const base = Math.floor(d.hp[0] + random() * (d.hp[1] - d.hp[0] + 1));
      const hp = Math.max(1, Math.round(base * (spec.scale || 1) * mul.enemyHp));
      const foe = {
        uid: 'f' + i, id: spec.id, def: d, name: d.name,
        hp, maxHp: hp, block: 0, buffs: {}, alive: true,
        turn: 0, move: null, moveIndex: 0, slot: i,
        dmgMul: (spec.dmgMul || 1) * mul.enemyDmg, shake: 0, flash: 0, deadT: 0
      };
      foe.move = pickMove(foe);
      this.enemies.push(foe);
      save.seeFoe(spec.id);
    });

    player.relics.forEach((rid) => {
      const def = RELICS[rid];
      if (def) this.relics.push({ id: rid, def, state: {}, used: false, n: 0, acc: 0 });
    });

    // 套装统计
    this.activeSets = {};
    const counts = {};
    this.relics.forEach((r) => {
      if (r.def.set) counts[r.def.set] = (counts[r.def.set] || 0) + 1;
    });
    Object.keys(counts).forEach((k) => {
      if (counts[k] >= SET_NEED && RELIC_SETS[k]) this.activeSets[k] = counts[k];
    });
    this.setCounts = counts;
  }

  /* ---------------- 初始化 ---------------- */
  start() {
    // 增益/护甲只属于单场战斗：上一场的力量、中毒、荆棘不能带进下一场
    this.player.buffs = {};
    this.player.block = 0;
    this.player.alive = true;
    this.drawPile = this.shuffleDeck(this.player.deck);
    this.phase = 'intro';
    this.introT = 0;
  }

  shuffleDeck(deck) {
    const a = deck.map((c) => ({ ...c, def: CARDS[c.id] }));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  relicHook(name, ...args) {
    for (const r of this.relics) {
      if (this.phase === 'lost' || this.finished) break;
      const h = r.def.hooks && r.def.hooks[name];
      if (h) {
        try { h(this, r.state, ...args); } catch (e) { console.error('[relic]', r.id, e); }
      }
    }
  }

  /* 药水：不占灵力、不占出牌次数 */
  usePotion(idx) {
    if (this.phase !== 'player' || this.finished) return false;
    const list = this.player.potions || [];
    const id = list[idx];
    if (!id) return false;
    const def = POTIONS[id];
    if (!def) return false;

    let t = null;
    const alive = this.enemies.filter((e) => e.alive);
    if (def.target === 'weakest') {
      if (!alive.length) return false;
      t = alive.reduce((a, b) => (a.hp <= b.hp ? a : b));
    } else if (def.target === 'all') {
      if (!alive.length) return false;
    }

    list.splice(idx, 1);
    try {
      def.use(this, t);
    } catch (e) {
      console.error('[potion] ' + id + ': ' + (e && e.stack ? e.stack : e));
    }
    this.emit('potion', { id, def, target: t });
    this.checkWin();
    return true;
  }

  /* 五行相克：卡牌五行 vs 目标五行 */
  elementMult(card, target, forceEl) {
    const el = forceEl || (card ? elOf(card) : null);
    // 允许实例级覆盖（药水/事件临时改属性）；'none' 表示剥离属性
    const raw = target ? (target.el || (target.def && target.def.el)) : null;
    const foeEl = raw === 'none' ? null : raw;
    if (!el || !foeEl) return { rel: 0, mult: 1, el: null, foeEl };
    const rel = relationOf(el, foeEl);
    return { rel, mult: relationMult(rel), el, foeEl };
  }

  /* 成势：按五行给一次额外效果 */
  resolveSurge(el, target) {
    if (this.phase === 'lost' || !this.player.alive || this.finished) return;
    const conf = ELEMENTS[el];
    if (!conf) return;
    this.surgeCount += 1;
    const alive = this.enemies.filter((e) => e.alive);

    if (el === 'jin') {
      // 成势在 playingCard 清空之后结算，属性要显式传
      alive.forEach((e) => this.damage(e, 5, { pure: true, el }));
    } else if (el === 'mu') {
      alive.forEach((e) => this.apply(e, 'poison', 2));
    } else if (el === 'huo') {
      alive.forEach((e) => this.apply(e, 'burn', 3));
    } else if (el === 'shui') {
      this.block(8);
    } else if (el === 'tu') {
      this.draw(1);
    }

    this.emit('surge', { el, conf });
  }

  _cloneForSimulation() {
    // 不调用构造器：构造器会掷初始血量、写入图鉴并消耗随机数。
    // memo 保留牌堆/队列等共享引用关系，定义中的函数是只读的。
    const memo = new Map();
    const clone = (value) => {
      if (!value || typeof value !== 'object') return value;
      if (memo.has(value)) return memo.get(value);
      const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
      memo.set(value, copy);
      for (const key of Object.keys(value)) {
        if (value === this && key === '_h') continue;
        copy[key] = clone(value[key]);
      }
      return copy;
    };
    const sim = clone(this);
    sim._h = {};
    sim._simulation = true;
    return { sim, copies: memo };
  }

  /* 出牌预演走同一套结算规则，但只操作隔离副本。 */
  previewDamage(card, target) {
    if (!card?.def || card.def.unplayable || !target?.alive || !this.hand.includes(card)) return null;
    if (this.phase !== 'player' || this.finished) return null;

    const { sim, copies } = this._cloneForSimulation();
    const simCard = copies.get(card), simTarget = copies.get(target);
    if (!simTarget) return null;

    // 灵力不足的普通牌仍可查看假设打出的结果；X 费永远使用当前灵力。
    const playable = this.canPlay(card);
    sim.canPlay = (candidate) => !candidate.def.unplayable;
    let uncertain = false, randomTarget = false, surge = null;
    const records = [], stack = [];
    let inSurge = false;
    sim.on('block', ({ target: t, amount, gain }) => {
      const hit = stack[stack.length - 1];
      if (hit && hit.target === t && !gain) hit.blocked += amount;
    });
    sim.on('damage', ({ target: t, amount }) => {
      const hit = stack[stack.length - 1];
      if (hit && hit.target === t) hit.effective += amount;
    });
    sim.damage = function (t, amount, opt = {}) {
      if (!t || !t.alive || t.hp <= 0 || this.phase === 'lost' || !this.player.alive || this.finished) return 0;
      const traits = t.def?.traits;
      if (!opt.raw && (traits?.dodge || traits?.evasion)) uncertain = true;
      const hit = { target: t, effective: 0, blocked: 0, surge: inSurge };
      records.push(hit);
      stack.push(hit);
      try { return Battle.prototype.damage.call(this, t, amount, opt); }
      finally { stack.pop(); }
    };
    sim.damageRandom = function (amount, times) {
      if (this.aliveEnemies().length > 1) { randomTarget = true; uncertain = true; }
      return Battle.prototype.damageRandom.call(this, amount, times);
    };
    sim.on('surge', ({ el, conf }) => { surge = { el, conf, dmg: 0 }; });
    sim.resolveSurge = function (el, t) {
      inSurge = true;
      try { return Battle.prototype.resolveSurge.call(this, el, t); }
      finally { inSurge = false; }
    };

    withIsolatedRandom(() => sim.playCard(simCard, card.def.target === 'enemy' ? simTarget : null));
    const hits = records.filter(hit => hit.target === simTarget);
    if (!hits.length && !randomTarget) return null;
    const damageByHit = hits.map(hit => hit.effective + hit.blocked);
    const total = damageByHit.reduce((sum, value) => sum + value, 0);
    const blocked = hits.reduce((sum, hit) => sum + hit.blocked, 0);
    if (surge) surge.dmg = hits.filter(hit => hit.surge)
      .reduce((sum, hit) => sum + hit.effective + hit.blocked, 0);
    return {
      per: damageByHit[0] || 0, hits: hits.length, damageByHit,
      total, blocked, effective: total - blocked,
      lethal: !uncertain && !simTarget.alive,
      playerDefeated: !uncertain && !sim.player.alive,
      uncertain, randomTarget, playable, surge,
      pureOnly: card.def.type !== 'attack', element: this.elementMult(card, target)
    };
  }

  /* preview=true 时只做预算，不消耗「每回合/每场一次」类法宝 */
  calcDamage(card, dmg, target, preview = false) {
    let d = dmg;
    if (this.activeSets.sword && card && card.def.type === 'attack') d += 3;
    for (const r of this.relics) {
      const h = r.def.hooks && r.def.hooks.calcDamage;
      if (h) {
        const out = h(this, r.state, card, d, target, preview);
        if (typeof out === 'number') d = out;
      }
    }
    return d;
  }

  burnBonus() {
    let b = 0;
    if (this.activeSets.fire) b += 2;
    for (const r of this.relics) {
      const h = r.def.hooks && r.def.hooks.burnBonus;
      if (h) b += h(this, r.state) || 0;
    }
    return b;
  }

  drawCount() {
    let n = 5;
    if (this.activeSets.art) n += 1;
    for (const r of this.relics) {
      const h = r.def.hooks && r.def.hooks.drawCount;
      if (h) n = h(this, r.state, n);
    }
    return n;
  }

  /* preview=true 时只查询费用，不消耗「每回合首次」类法宝 */
  costOf(card, preview = false) {
    // 复制品可能被标记为本回合免费
    if (card.free) return 0;
    // X 费：消耗当前全部灵力
    if (card.def.cost < 0) return this.player.energy;
    let c = card.def.cost;
    if (card.rune === 'qing') c -= 1;
    for (const r of this.relics) {
      const h = r.def.hooks && r.def.hooks.costMod;
      if (h) {
        // 第 5 参传入累计费用：减费类法宝可判断「这一刀砍在几费上」，
        // 避免把每回合一次的减费浪费在已经被铭刻减到 0 的牌上
        const out = h(this, r.state, card, preview, Math.max(0, c));
        if (typeof out === 'number') c += out;
      }
    }
    return Math.max(0, c);
  }

  // 永久破卷奖励与本场的天命/套装加成分开，避免临时上限污染后续战斗。
  energyMax() {
    return this.player.energyMax + (this.player.buffs.energyMax || 0) + (this.activeSets.seal ? 1 : 0);
  }

  /* ---------------- 回合 ---------------- */
  startPlayerTurn(first) {
    this.phase = 'player';
    const p = this.player;
    p.block = 0;

    // 「本回合免费」只在当回合有效：跨回合（含被弃置后洗回）必须清掉，
    // 否则乾坤的免费复制品会整场战斗 0 费
    const clearFree = (c) => { if (c.free) delete c.free; };
    this.hand.forEach(clearFree);
    this.drawPile.forEach(clearFree);
    this.discardPile.forEach(clearFree);

    let energy = this.energyMax();
    if (!first && p.buffs.energyNext) {
      energy += p.buffs.energyNext;
      delete p.buffs.energyNext;
    }
    p.energy = energy;

    if (first) this.relicHook('battleStart');
    if (this.activeSets.guard) this.block(4);
    this.turnAttacks = 0;
    this.turnCardsPlayed = 0;
    this.playerHurtThisTurn = false;
    this.chainEl = null;
    this.chainDrawn = 0;

    // 回春：每回合开始回血
    if (p.buffs.regen > 0 && p.hp < p.maxHp) {
      this.heal(p.buffs.regen);
      this.emit('regenTick', { amount: p.buffs.regen });
    }

    if (p.buffs.poison > 0) {
      const pd = p.buffs.poison;
      this.hurtPlayer(pd, { raw: true });
      p.buffs.poison -= 1;
      if (p.buffs.poison <= 0) delete p.buffs.poison;
      this.emit('poisonTick', { target: p, amount: pd });
    }
    // 中毒可能致死：此时不应继续抽牌/开启回合
    if (this.phase === 'lost') return;

    // 异兽狂暴：血量跌破阈值时永久强化
    this.enemies.forEach((e) => {
      if (!e.alive) return;
      const tr = e.def && e.def.traits;
      if (tr && tr.enrage && !e._enraged && e.hp / e.maxHp <= tr.enrage.at) {
        e._enraged = true;
        this.apply(e, 'str', tr.enrage.str);
        this.emit('enrage', { enemy: e, str: tr.enrage.str });
      }
    });

    this.relicHook('turnStart');

    let n = this.drawCount();
    if (p.buffs.drawNext) {
      n += p.buffs.drawNext;
      delete p.buffs.drawNext;
    }
    this.draw(n);

    this.emit('turnStart', { turn: this.turn, first: !!first });
  }

  endTurn() {
    if (this.phase !== 'player' || this.finished) return;
    const p = this.player;

    // 只结算结束回合时仍留在手里的诅咒，卡牌效果中的弃牌不受影响。
    const heldCurses = this.hand.filter((card) => card.id === 'shigu_curse').length;
    this.discardAll({ endTurn: true });
    this.relicHook('turnEnd');
    // 铁甲等回合末效果可能已经击败最后一只异兽，不能再进入敌方回合。
    if (this.phase === 'won' || this.phase === 'lost') return;

    if (heldCurses) this.hurtPlayer(heldCurses * 2, { raw: true });
    if (this.phase === 'lost') return;

    if (p.buffs.burn > 0) {
      const bd = p.buffs.burn;
      this.hurtPlayer(bd, { raw: true });
      this.emit('burnTick', { target: p, amount: bd });
    }
    if (p.buffs.bloodpact > 0) this.hurtPlayer(p.buffs.bloodpact, { raw: true });

    // 「本回合」类增益在回合结束时失效
    delete p.buffs.comboDmg;
    delete p.buffs.drawOnPlay;

    if (p.buffs.weak > 0) {
      p.buffs.weak -= 1;
      if (p.buffs.weak <= 0) delete p.buffs.weak;
    }

    if (!p.alive) { this.lose(); return; }

    this.phase = 'enemy';
    this._vulnAtEnemyStart = p.buffs.vuln || 0;
    this.enemyQueue = this.enemies.filter((e) => e.alive).slice();
    this.enemyTimer = 0.45;
    this.emit('enemyTurnStart');
  }

  update(dt) {
    if (this.introT < 1) this.introT += dt * 2.2;

    if (this.phase === 'intro') {
      if (this.introT >= 1) this.startPlayerTurn(true);
      return;
    }

    if (this.phase === 'enemy') {
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        if (this.enemyQueue.length) {
          const e = this.enemyQueue.shift();
          if (e.alive) {
            this.enemyAct(e);
            this.enemyTimer = 0.66;
          } else {
            this.enemyTimer = 0.1;
          }
        } else {
          this.endEnemyTurn();
        }
      }
      return;
    }

    if (this.phase === 'won' || this.phase === 'lost') {
      this.timer -= dt;
      if (this.timer <= 0 && !this.finished) {
        this.finished = true;
        this.emit('end', this.phase === 'won' ? 'win' : 'lose');
      }
    }
  }

  prepareEnemyAction(e) {
    if (!e.alive || e.hp <= 0 || this.phase === 'won' || this.phase === 'lost' || this.finished) return false;
    // 异兽护甲只维持到它自己的下一个回合（否则会永久叠加）
    if (e.block > 0) {
      e.block = 0;
      this.emit('block', { target: e, amount: 0, gain: false });
    }

    if (e.buffs.poison > 0) {
      this.damage(e, e.buffs.poison, { pierce: true, raw: true, silent: true, noThorns: true });
      if (!this.activeSets.poison) {
        e.buffs.poison -= 1;
        if (e.buffs.poison <= 0) delete e.buffs.poison;
      }
    }
    if (e.buffs.burn > 0) {
      this.damage(e, e.buffs.burn + this.burnBonus(), { pierce: true, raw: true, silent: true, noThorns: true });
    }
    if (!e.alive) { this.checkWin(); return false; }

    e.turn += 1;

    // 异兽特性：自愈 / 毒雾光环 / 疗愈同伴
    const tr = e.def && e.def.traits;
    if (tr) {
      if (tr.regen && e.hp < e.maxHp) {
        const h = Math.min(tr.regen, e.maxHp - e.hp);
        e.hp += h;
        this.emit('heal', { target: e, amount: h });
      }
      if (tr.aura) this.apply(this.player, tr.aura[0], tr.aura[1]);
      if (tr.healAllies) {
        this.enemies.forEach((o) => {
          if (o !== e && o.alive && o.hp < o.maxHp) {
            const h = Math.min(tr.healAllies, o.maxHp - o.hp);
            o.hp += h;
            this.emit('heal', { target: o, amount: h });
          }
        });
      }
    }

    return this.player.alive && this.phase !== 'lost';
  }

  enemyAct(e) {
    if (!this.prepareEnemyAction(e)) return;
    const tr = e.def && e.def.traits;
    // 中毒/灼烧也可能触发二阶段，先完成回合初结算再读取新的意图。
    const mv = e.move || pickMove(e);
    if (mv) {
      this.emit('enemyMove', { enemy: e, move: mv });

      let dealt = 0;
      if (mv.dmg) {
        const dmg = Math.round((mv.dmg * (e.dmgMul || 1) + (e.buffs.str || 0)) * ((e.buffs.weak || 0) > 0 ? 0.75 : 1));
        for (let i = 0; i < (mv.hits || 1); i++) {
          if (!this.player.alive || !e.alive) break;
          dealt += this.hurtPlayer(dmg);
          if (mv.playerBuff) this.apply(this.player, mv.playerBuff[0], mv.playerBuff[1]);
          if (this.player.buffs.thorns > 0 && e.alive) {
            this.damage(e, this.player.buffs.thorns, { pierce: true, raw: true, silent: true, noThorns: true });
          }
          if (this.player.buffs.riposte > 0 && e.alive) {
            this.damage(e, this.player.buffs.riposte, { pierce: true, raw: true, noThorns: true });
          }
        }
      }
      // 反伤会在连击中途击杀攻击者；尸体不能继续吸血、加甲或施放后续效果。
      if (!e.alive || !this.player.alive) return;
      if (tr && dealt > 0) {
        if (tr.lifesteal) {
          const h = Math.min(Math.round(dealt * tr.lifesteal), e.maxHp - e.hp);
          if (h > 0) { e.hp += h; this.emit('heal', { target: e, amount: h }); }
        }
        if (tr.onAttack) this.apply(e, tr.onAttack[0], tr.onAttack[1]);
        if (tr.chaos) {
          const pool = ['weak', 'vuln', 'poison', 'burn'];
          const pick = pool[Math.floor(random() * pool.length)];
          this.apply(this.player, pick, 1 + Math.floor(random() * 2));
        }
      }
      if (mv.block) this.enemyBlock(e, mv.block);
      if (mv.selfBuff && mv.selfBuff[1] > 0) this.apply(e, mv.selfBuff[0], mv.selfBuff[1]);
      if (mv.playerBuff && !mv.dmg) this.apply(this.player, mv.playerBuff[0], mv.playerBuff[1]);
      if (mv.special === 'curse') this.addCurse(1);
      if (mv.special === 'healAll') this.healEnemies(10);
    }

    // 异兽身上的减益在它行动结束后递减：虚弱要先生效，再掉一层
    ['weak', 'vuln'].forEach((k) => {
      if (e.buffs[k]) {
        e.buffs[k] -= 1;
        if (e.buffs[k] <= 0) delete e.buffs[k];
      }
    });

    e.move = pickMove(e);
    this.checkWin();
  }

  endEnemyTurn() {
    if (this.checkWin()) return;
    if (!this.player.alive) { this.lose(); return; }
    // 这两种效果只属于本回合。反击的数值是伤害，不是剩余回合数。
    delete this.player.buffs.riposte;
    delete this.player.buffs.halve;
    // 本轮刚施加的易伤要留给下一次敌方回合，避免一层易伤还没受击就过期。
    if (this._vulnAtEnemyStart > 0 && this.player.buffs.vuln > 0) {
      this.player.buffs.vuln -= 1;
      if (this.player.buffs.vuln <= 0) delete this.player.buffs.vuln;
    }
    this.turn += 1;
    this.startPlayerTurn(false);
  }

  /* ---------------- 数值 ---------------- */
  damage(target, amount, opt = {}) {
    if (!target || this.phase === 'lost' || !this.player.alive || this.finished) return 0;
    const isPlayer = target === this.player;
    if (!isPlayer && (!target.alive || target.hp <= 0)) return 0;
    if (isPlayer && target.hp <= 0) return 0;

    let dmg = amount;
    const card = this.playingCard;
    let elInfo = null;

    if (!isPlayer && !opt.raw) {
      // pure：只算护甲与特性，不吃力量/虚弱/易伤/套装（成势这类固定附加伤害用）
      if (!opt.pure) {
        const p = this.player;
        dmg += (p.buffs.str || 0);
        if (card && card.rune === 'feng') dmg += 3;
        if (p.buffs.weak > 0) dmg *= 0.75;
        if (target.buffs.vuln > 0) dmg *= 1.5;
        dmg = this.calcDamage(card, dmg, target);
      }
      // 相克：五行克目标则增益，被目标所克则减伤
      elInfo = this.elementMult(card, target, opt.el);
      if (elInfo.mult !== 1) dmg *= elInfo.mult;
    }
    dmg = Math.max(0, Math.round(dmg));

    // 异兽特性：闪避 / 卸力
    if (!isPlayer && !opt.raw && target.def && target.def.traits) {
      const tr = target.def.traits;
      if (tr.dodge && random() < tr.dodge) {
        this.emit('trait', { target, text: '闪身' });
        return 0;
      }
      if (tr.evasion && random() < tr.evasion) {
        this.emit('trait', { target, text: '幻影' });
        return 0;
      }
      if (tr.firstHitHalved && !target._halvedOnce) {
        target._halvedOnce = true;
        dmg = Math.max(1, Math.ceil(dmg / 2));
        this.emit('trait', { target, text: '卸力' });
      }
    }

    let blocked = 0;
    if (!opt.pierce && target.block > 0) {
      blocked = Math.min(target.block, dmg);
      target.block -= blocked;
      dmg -= blocked;
      if (blocked > 0) this.emit('block', { target, amount: blocked });
    }

    if (dmg > 0) {
      target.hp -= dmg;
      if (!isPlayer) {
        this.damageDealt += dmg;
        target.shake = 1;
        target.flash = 1;
      }
      this.emit('damage', { target, amount: dmg, isPlayer, blocked, el: elInfo });
    }

    // Boss 阶段转换
    if (!isPlayer && target.def && target.def.phases && !target._phase2 && target.hp > 0) {
      const ph = target.def.phases[0];
      if (ph && target.hp / target.maxHp <= ph.at) {
        target._phase2 = true;
        target.phase = 2;
        if (ph.str) this.apply(target, 'str', ph.str);
        target.block = 0;
        target.move = pickMove(target);
        this.emit('bossPhase', { enemy: target, phase: ph });
      }
    }

    // 异兽特性：反噬（持续性伤害与反伤不再触发反噬）
    if (!isPlayer && dmg > 0 && !opt.noThorns && target.def && target.def.traits && target.def.traits.thorns) {
      this.hurtPlayer(target.def.traits.thorns, { raw: true });
      this.emit('trait', { target, text: '反噬 ' + target.def.traits.thorns });
    }

    if (!isPlayer && target.hp <= 0 && target.alive) {
      target.alive = false;
      target.deadT = 0;
      this.emit('enemyDeath', { enemy: target });
      this.relicHook('enemyKilled', target);
      this.checkWin();
    }
    return dmg;
  }

  // 护甲前的单段受击数值，由实战、意图提示与 AI 可读状态共用。
  incomingDamage(amount, buffs = this.player.buffs) {
    let dmg = Math.round(amount);
    if (buffs.vuln > 0) dmg = Math.round(dmg * 1.5);
    if (buffs.halve > 0) dmg = Math.ceil(dmg / 2);
    return dmg;
  }

  // 先预演异兽行动前的毒/灼烧、阶段转换与光环。只针对该异兽当前状态，
  // 前序敌人的行动仍可能改变结果；不会推进真实回合、随机数或图鉴。
  previewEnemyIntent(enemy) {
    const empty = { move: null, damageByHit: [], totalDamage: 0, phaseChange: false, willDie: false };
    if (!enemy?.alive || enemy.hp <= 0) return empty;
    const { sim, copies } = this._cloneForSimulation();
    const foe = copies.get(enemy);
    if (!foe) return empty;
    return withIsolatedRandom(() => {
      const ready = sim.prepareEnemyAction(foe);
      const move = ready ? (foe.move || pickMove(foe)) : null;
      const damageByHit = move ? sim.previewEnemyAttack(foe, move) : [];
      return { move, damageByHit,
        totalDamage: damageByHit.reduce((sum, value) => sum + value, 0),
        phaseChange: !!foe._phase2 && !enemy._phase2,
        willDie: !foe.alive, conditional: true };
    });
  }

  // 连击中每段附带的易伤会影响下一段，不能简单显示首段 × 段数。
  previewEnemyAttack(enemy, move = enemy.move) {
    if (!move || !move.dmg) return [];
    const buffs = { ...this.player.buffs };
    const base = Math.round((move.dmg * (enemy.dmgMul || 1) + (enemy.buffs.str || 0))
      * (enemy.buffs.weak > 0 ? 0.75 : 1));
    const damage = [];
    for (let i = 0; i < (move.hits || 1); i++) {
      damage.push(this.incomingDamage(base, buffs));
      if (move.playerBuff) {
        const [name, stacks] = move.playerBuff;
        buffs[name] = (buffs[name] || 0) + stacks;
      }
    }
    return damage;
  }

  hurtPlayer(amount, opt = {}) {
    const p = this.player;
    if (!p.alive) return 0;
    let dmg = opt.raw ? Math.round(amount) : this.incomingDamage(amount);

    let blocked = 0;
    if (!opt.raw && p.block > 0) {
      blocked = Math.min(p.block, dmg);
      p.block -= blocked;
      dmg -= blocked;
      if (blocked > 0) this.emit('block', { target: p, amount: blocked });
    }
    if (dmg > 0) {
      p.hp -= dmg;
      this.lastTaken = dmg;
      this.playerHurtThisTurn = true;
      this.relicHook('playerDamaged', dmg);
      this.emit('damage', { target: p, amount: dmg, isPlayer: true, blocked });
    }
    p.hp = Math.max(0, p.hp);
    if (p.hp <= 0) { p.alive = false; this.lose(); }
    return dmg;
  }

  block(n, { ignoreDex = false } = {}) {
    if (this.phase === 'lost' || !this.player.alive || this.finished) return;
    const p = this.player;
    const v = n + (ignoreDex ? 0 : (p.buffs.dex || 0));
    p.block += v;
    this.emit('block', { target: p, amount: v, gain: true });
  }

  enemyBlock(e, n) {
    e.block += n;
    this.emit('block', { target: e, amount: n, gain: true });
  }

  heal(n) {
    if (this.phase === 'lost' || !this.player.alive || this.finished) return 0;
    const p = this.player;
    const cut = save.ascensionMods().healCut || 1;
    const real = Math.max(0, Math.round(n * cut));
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + real);
    if (p.hp > before) this.emit('heal', { target: p, amount: p.hp - before });
  }

  loseHp(n) { this.hurtPlayer(n, { raw: true }); }

  gainEnergy(n) {
    if (this.phase === 'lost' || !this.player.alive || this.finished) return;
    this.player.energy += n;
    this.emit('energy', { amount: n });
  }

  draw(n) {
    if (this.phase === 'lost' || !this.player.alive || this.finished) return;
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= 10) break;
      if (!this.drawPile.length) {
        if (!this.discardPile.length) break;
        this.drawPile = this.shuffleDeck(this.discardPile);
        this.discardPile = [];
        this.emit('reshuffle');
      }
      const c = this.drawPile.pop();
      if (c) {
        this.hand.push(c);
        this.emit('draw', { card: c });
      }
    }
  }

  discardAll({ endTurn = false } = {}) {
    while (this.hand.length) {
      const card = this.hand.pop();
      (endTurn && card.def.exhaustAtTurnEnd ? this.exhaustPile : this.discardPile).push(card);
    }
    this.emit('discardAll');
  }

  apply(target, name, stacks) {
    if (!target || stacks <= 0 || this.phase === 'lost' || !this.player.alive || this.finished) return;
    if (target !== this.player && !target.alive) return;
    const tr = target.def && target.def.traits;
    if (tr && tr.immune && tr.immune.indexOf(name) >= 0) return;
    let s = stacks;
    if (name === 'poison' && target !== this.player) s += (this.player.buffs.toxic || 0);
    if (name === 'burn' && target !== this.player && this.activeSets.fire) s += 1;
    target.buffs[name] = (target.buffs[name] || 0) + s;
    this.relicHook('applyBuff', target, name, s);
    this.emit('buff', { target, name, stacks: s });
  }

  applyAll(name, stacks) {
    this.enemies.forEach((e) => { if (e.alive) this.apply(e, name, stacks); });
  }

  damageAll(amount) {
    this.enemies.forEach((e) => { if (e.alive) this.damage(e, amount); });
  }

  damageRandom(amount, times) {
    for (let i = 0; i < times; i++) {
      const alive = this.enemies.filter((e) => e.alive);
      if (!alive.length) return;
      this.damage(alive[Math.floor(random() * alive.length)], amount);
    }
  }

  healEnemies(n) {
    this.enemies.forEach((e) => {
      if (e.alive) {
        e.hp = Math.min(e.maxHp, e.hp + n);
        this.emit('heal', { target: e, amount: n });
      }
    });
  }

  addCurse(n) {
    for (let i = 0; i < n; i++) {
      const id = ['xinmo', 'shigu_curse', 'mihuo'][Math.floor(random() * 3)];
      const c = { uid: 'curse' + random(), id, up: false, def: CARDS[id], temp: true };
      // 只污染本场战斗的抽牌堆，不写进 run 的常驻牌组
      this.discardPile.push(c);
    }
    this.emit('curse', { n });
  }

  copyAttack() {
    if (this.hand.length >= 10) return;
    const attacks = this.hand.filter((c) => c.def.type === 'attack');
    if (!attacks.length) return;
    const src = attacks[Math.floor(random() * attacks.length)];
    const copy = { ...src, uid: 'copy' + random(), temp: true };
    this.hand.push(copy);
    this.emit('draw', { card: copy });
  }

  addRandomAttack() {
    if (this.hand.length >= 10) return;
    const pool = Object.keys(CARDS).filter((id) => CARDS[id].type === 'attack' && CARDS[id].rarity !== 'curse' && CARDS[id].rarity !== 'basic');
    const id = pool[Math.floor(random() * pool.length)];
    const c = { uid: 'tmp' + random(), id, up: false, def: CARDS[id], temp: true };
    this.hand.push(c);
    this.emit('draw', { card: c });
  }

  /* ---------------- 出牌 ---------------- */
  canPlay(card) {
    if (this.phase !== 'player' || this.finished) return false;
    if (!card || card.def.unplayable) return false;
    if (card.def.cost < 0 && !card.free && this.player.energy <= 0) return false;
    return this.player.energy >= this.costOf(card, true);
  }

  playCard(card, target) {
    if (!this.canPlay(card)) return false;
    const idx = this.hand.indexOf(card);
    if (idx < 0) return false;

    // 先确定目标：避免扣掉灵力与手牌后才发现没有可打的目标
    let t = card.def.target === 'enemy' ? target : null;
    if (card.def.target === 'enemy') {
      if (!t || !t.alive) t = this.enemies.find((e) => e.alive);
      if (!t) return false;
    }

    const cost = this.costOf(card);
    this.lastX = card.def.cost < 0 ? cost : 0;
    this.player.energy -= cost;
    this.hand.splice(idx, 1);
    if (card.def.type === 'attack') this.turnAttacks += 1;

    this.playingCard = card;
    this.cardsPlayed += 1;
    this.turnCardsPlayed += 1;
    if (!this._simulation) save.seeCard(card.id);

    // 笔意：同属相连，三张成势
    const el = elOf(card);
    let surge = false;
    if (el) {
      if (this.brushEl === el) this.brushCount += 1;
      else { this.brushEl = el; this.brushCount = 1; }
      if (this.brushCount >= COMBO_NEED) {
        surge = true;
        this.brushCount = 0;
        this.brushEl = null;
      }
    } else {
      this.brushEl = null;
      this.brushCount = 0;
    }
    this.emit('brush', { el, count: this.brushCount, surge });

    // 相生：相邻两张按「金生水、水生木、木生火、火生土、土生金」出牌
    let sheng = false;
    const chainFrom = this.chainEl;
    if (el) {
      if (chainFrom && generatesOf(chainFrom) === el && this.chainDrawn < 2) {
        this.chainDrawn += 1;
        sheng = true;
      }
      this.chainEl = el;
    } else {
      this.chainEl = null;
    }

    try {
      card.def.play(this, t, cardVars(card));
    } catch (e) {
      console.error('[card]', card.id, e);
    }

    this.playingCard = null;

    // 牌的本体可能被反噬或自损击杀。只收妥已打出的牌，不再回手、
    // 抽牌、成势或触发法宝；胜利时的吞噬治疗等正常击杀收益仍保留。
    if (this.phase === 'lost' || !this.player.alive) {
      (card.def.exhaust || card.temp ? this.exhaustPile : this.discardPile).push(card);
      this.emit('cardPlayed', { card, target: t, cost });
      return true;
    }

    // 铭刻·其余
    if (card.rune === 'hu') this.block(4);
    if (card.rune === 'xun') this.draw(1);
    if (card.rune === 'du' && t && t.alive) this.apply(t, 'poison', 2);
    if (sheng) {
      this.draw(1);
      this.emit('xiangsheng', { el, from: chainFrom });
    }

    if (this.player.buffs.comboDmg > 0) this.damageRandom(this.player.buffs.comboDmg, 1);
    // 连笔：本回合每打出一张牌抽 1 张
    if (this.player.buffs.drawOnPlay > 0) this.draw(this.player.buffs.drawOnPlay);

    // 成势：三张同属，落一笔大的
    if (surge) this.resolveSurge(el, t);

    let keep = false;
    if (card.rune === 'hui' && !card._echoUsed && this.player.alive && this.phase !== 'lost') {
      card._echoUsed = true;
      // 抽牌等后续效果可能已补满手牌，回响不能突破十张上限。
      if (this.hand.length < 10) {
        keep = true;
        this.hand.push(card);
        this.emit('echoReturn', { card });
      }
    }
    if (!keep) {
      if (card.def.exhaust || card.temp) this.exhaustPile.push(card);
      else this.discardPile.push(card);
    }

    this.relicHook('cardPlayed', card, t);
    this.emit('cardPlayed', { card, target: t, cost });

    this.checkWin();
    return true;
  }

  checkWin() {
    if (this.finished || this.phase === 'won') return this.phase === 'won';
    if (this.phase === 'lost') return false;
    if (!this.enemies.some((e) => e.alive)) {
      this.phase = 'won';
      this.timer = 1.0;
      this.relicHook('battleWin');
      this.emit('win');
      return true;
    }
    return false;
  }

  lose() {
    if (this.finished || this.phase === 'won' || this.phase === 'lost') return;
    this.phase = 'lost';
    this.timer = 1.4;
    this.player.alive = false;
    this.emit('lose');
  }

  aliveEnemies() { return this.enemies.filter((e) => e.alive); }
}
