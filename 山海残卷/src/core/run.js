import { random } from "./random.js";
import { CARDS } from '../data/cards.js';
import { RELICS } from '../data/relics.js';
/* 单局运行状态：玩家、牌组、进度、统计 */

import { save } from './save.js';
import { POTION_MAX } from '../data/potions.js';

export const run = {
  active: false,
  player: null,
  map: null,
  actIndex: 0,
  node: null,
  depth: 0,
  startTime: 0,
  stats: null,
  flags: null,

  newRun() {
    const deck = this.buildStarterDeck();
    this.player = {
      name: '守卷人',
      hp: 78,
      maxHp: 78,
      gold: 99,
      energyMax: 3,
      block: 0,
      buffs: {},
      deck,
      relics: [],
      potions: [],
      alive: true
    };
    this.actIndex = 0;
    this.depth = 0;
    this.node = null;
    this.map = null;
    this.startTime = Date.now();
    this.flags = { pages: [], choice: null, kills: 0 };
    this.stats = {
      kills: 0, cardsPlayed: 0, damage: 0, floors: 0,
      elites: 0, healed: 0, goldEarned: 0
    };
    this.active = true;
    save.data.runs += 1;
    save.write();
    return this.player;
  },

  buildStarterDeck() {
    const d = [];
    const push = (id, n) => { for (let i = 0; i < (n || 1); i++) d.push({ id, up: false, def: CARDS[id] }); };
    push('cijian', 4);
    push('yufeng', 3);
    push('pozhang', 1);
    push('mojian', 1);
    push('lianhuan', 1);
    push('huoyan', 1);
    push('yuhua', 1);
    return d;
  },

  removeCardAt(idx) {
    if (idx < 0 || idx >= this.player.deck.length) return null;
    return this.player.deck.splice(idx, 1)[0];
  },

  engrave(card, runeId) {
    if (!card || card.rune) return false;
    card.rune = runeId;
    return true;
  },

  /* ---------- 药水 ---------- */
  addPotion(id) {
    if (!id) return false;
    const list = this.player.potions;
    if (list.length >= POTION_MAX) return false;
    list.push(id);
    save.seePotion && save.seePotion(id);
    return true;
  },

  dropPotion(idx) {
    if (idx < 0 || idx >= this.player.potions.length) return;
    this.player.potions.splice(idx, 1);
  },

  /* 获得法宝的唯一入口：去重 + 拾取钩子 + 图鉴记录 */
  grantRelic(id) {
    if (!id || !RELICS[id]) return false;
    const p = this.player;
    if (!p || p.relics.indexOf(id) >= 0) return false;
    p.relics.push(id);
    save.data.stats.relics = (save.data.stats.relics || 0) + 1;
    save.seeRelic(id);
    const inst = { id, def: RELICS[id], state: {} };
    if (RELICS[id].hooks && RELICS[id].hooks.pickup) {
      try { RELICS[id].hooks.pickup(this, inst, {}); } catch (e) {
        console.error('[relic pickup]', id, e);
      }
    }
    return true;
  },

  addRelic(id) {
    return this.grantRelic(id);
  },

  previewHeal(n) {
    const p = this.player;
    const cut = save.ascensionMods().healCut || 1;
    return Math.min(Math.max(0, p.maxHp - p.hp), Math.max(0, Math.round(n * cut)));
  },

  heal(n) {
    const real = this.previewHeal(n);
    this.player.hp += real;
    this.stats.healed += real;
    return real;
  },

  hurt(n) {
    const p = this.player;
    p.hp = Math.max(0, p.hp - n);
    if (p.hp <= 0) p.alive = false;
    return p.hp <= 0;
  },

  gold(n) {
    this.player.gold = Math.max(0, this.player.gold + n);
    if (n > 0) this.stats.goldEarned += n;
  },

  score() {
    const s = this.stats;
    return Math.round(
      this.depth * 200 + s.kills * 14 + s.elites * 90 +
      (this.player ? this.player.relics.length * 40 : 0) +
      (this.flags && this.flags.pages.length ? this.flags.pages.length * 60 : 0) +
      // 结余墨折分：让「省着花」与「花在刀刃上」都有意义，缓解局末滞留
      (this.player ? this.player.gold * 0.3 : 0)
    );
  },

  // depth 按「卷号 × 10 + 列号」保存，不是连续楼层计数。
  depthLabel(depth = this.depth) {
    const value = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
    return value ? `第 ${Math.floor(value / 10) || 1} 卷 · 第 ${(value % 10) + 1} 层` : '尚未入卷';
  },

  elapsed() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  },

  /* ---------- 事件/商店用到的辅助 ---------- */
  removeRandomCard(opts = {}) {
    const deck = this.player.deck.filter((c) => {
      const d = c.def || CARDS[c.id];
      if (!d) return false;
      if (opts.curseOnly) return d.rarity === 'curse';
      return d.rarity !== 'curse' && d.rarity !== 'basic';
    });
    if (!deck.length) return null;
    const target = deck[Math.floor(random() * deck.length)];
    const idx = this.player.deck.indexOf(target);
    if (idx >= 0) this.player.deck.splice(idx, 1);
    return this.cardNameOf(target);
  },

  cardNameOf(c) {
    return (c.def ? c.def.name : '') + (c.up ? '+' : '');
  },

  upgradeRandom(n, type) {
    const pool = this.player.deck.filter((c) => c.def && !c.up && c.def.rarity !== 'curse' &&
      Object.keys(c.def.up || {}).length > 0 && (!type || c.def.type === type));
    let count = 0;
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(random() * pool.length);
      pool[idx].up = true;
      pool.splice(idx, 1);
      count++;
    }
    return count;
  },

  /* 收下一张残页：本局计数 + 跨局图鉴。
     补笔：图愈全，守卷人的身形愈实——每页气血上限 +3（选路的真实收益） */
  recordPage(id) {
    if (!id) return;
    if (!this.flags.pages) this.flags.pages = [];
    if (this.flags.pages.indexOf(id) >= 0) return;
    this.flags.pages.push(id);
    if (this.player) {
      this.player.maxHp += 3;
      this.player.hp += 3;
    }
    save.seePage(id);
  },

  addCard(id, up) {
    this.player.deck.push({ id, up: !!up, def: CARDS[id] });
    return this.player.deck[this.player.deck.length - 1];
  },

  addRandomCard(rarity) {
    const pool = Object.keys(CARDS).filter((id) => {
      const r = CARDS[id].rarity;
      if (r === 'basic' || r === 'curse') return false;
      if (rarity && r !== rarity) return false;
      return true;
    });
    const id = pool[Math.floor(random() * pool.length)];
    this.player.deck.push({ id, up: false, def: CARDS[id] });
    return CARDS[id].name;
  },

  addRandomCardByType(kind) {
    let pool = Object.keys(CARDS).filter((id) => {
      const d = CARDS[id];
      if (d.rarity === 'basic' || d.rarity === 'curse') return false;
      if (kind === 'attack') return d.type === 'attack';
      if (kind === 'poison') return d.icon === 'poison' || d.icon === 'needle';
      return true;
    });
    if (!pool.length) pool = Object.keys(CARDS).filter((id) => CARDS[id].rarity === 'common');
    const id = pool[Math.floor(random() * pool.length)];
    this.player.deck.push({ id, up: false, def: CARDS[id] });
    return CARDS[id].name;
  },

  addRandomRelic() {
    const exclude = this.player.relics.slice();
    const pool = Object.keys(RELICS).filter((id) => exclude.indexOf(id) < 0);
    if (!pool.length) return '空无一物';
    const id = pool[Math.floor(random() * pool.length)];
    this.grantRelic(id);
    return RELICS[id].name;
  }
};
