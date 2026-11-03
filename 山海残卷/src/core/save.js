/* 存档：版本化 + 迁移 + 安全降级 */

import { ASCENSION_MAX } from './config.js';

const KEY = 'shanhai_scrolls_v2';

const DEFAULTS = {
  v: 2,
  runs: 0,
  wins: 0,
  bestDepth: 0,
  bestScore: 0,
  ascension: 0,
  stats: { cardsPlayed: 0, enemiesKilled: 0, damageDealt: 0, timePlayed: 0, relics: 0 },
  seen: { cards: {}, foes: {}, relics: {}, potions: {}, lore: {} },
  pages: [],
  settings: { music: 0.42, sfx: 0.8, quality: 1, shake: true, fast: false },
  firstRun: true
};

const MIGRATIONS = {
  // v1 -> v2：早期版本没有 ascension 与 seen
  1: (d) => {
    d.v = 2;
    d.ascension = d.ascension || 0;
    d.seen = d.seen || { cards: {}, foes: {}, relics: {} };
    d.seen.potions = d.seen.potions || {};
    d.pages = d.pages || [];
    return d;
  }
};

class SaveManager {
  constructor() {
    this.data = null;
    this.ok = true;
  }

  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { this.ok = false; }
    if (!raw) {
      this.data = structuredClone(DEFAULTS);
      return this.data;
    }
    try {
      let parsed = JSON.parse(raw);
      let v = parsed.v || 1;
      while (v < DEFAULTS.v) {
        const m = MIGRATIONS[v];
        if (!m) break;
        parsed = m(parsed);
        v = parsed.v;
      }
      this.data = this.sanitize(this.merge(structuredClone(DEFAULTS), parsed));
    } catch (e) {
      this.data = structuredClone(DEFAULTS);
    }
    return this.data;
  }

  /* 类型安全的深合并：默认值是权威结构，存档里类型不符/为 null 的字段一律丢弃，
     避免损坏或旧版存档把 settings 覆盖成 null 之类导致启动崩溃。 */
  merge(base, extra) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
    Object.keys(extra).forEach((k) => {
      const v = extra[k];
      if (v === undefined || v === null) return;
      const cur = base[k];
      if (Array.isArray(v)) {
        if (cur === undefined || Array.isArray(cur)) base[k] = v;
        return;
      }
      if (typeof v === 'object') {
        if (cur === undefined || (cur && typeof cur === 'object' && !Array.isArray(cur))) {
          base[k] = this.merge(cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {}, v);
        }
        return;
      }
      if (typeof v === 'number' && !Number.isFinite(v)) return;
      if (cur === undefined || typeof cur === typeof v) base[k] = v;
    });
    return base;
  }

  /* 载入后的最后一道净化：数组只留合法条目，数值夹到合理区间 */
  sanitize(d) {
    if (Array.isArray(d.pages)) d.pages = d.pages.filter((p) => typeof p === 'string');
    const s = d.settings || {};
    const clamp = (x, lo, hi, fb) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fb);
    s.music = clamp(s.music, 0, 1, 0.42);
    s.sfx = clamp(s.sfx, 0, 1, 0.8);
    s.quality = clamp(s.quality, 0, 2, 1);
    d.settings = s;
    d.ascension = clamp(d.ascension, 0, ASCENSION_MAX, 0);
    for (const k of ['runs', 'wins', 'bestDepth', 'bestScore']) d[k] = clamp(d[k], 0, 1e9, 0);
    const st = d.stats || {};
    for (const k of Object.keys(st)) st[k] = clamp(st[k], 0, 1e12, 0);
    d.stats = st;
    return d;
  }

  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { this.ok = false; }
  }

  reset() {
    this.data = structuredClone(DEFAULTS);
    this.write();
  }

  seeCard(id) { this.data.seen.cards[id] = (this.data.seen.cards[id] || 0) + 1; }
  seeFoe(id) { this.data.seen.foes[id] = (this.data.seen.foes[id] || 0) + 1; }
  seeRelic(id) { this.data.seen.relics[id] = (this.data.seen.relics[id] || 0) + 1; }
  seePotion(id) { this.data.seen.potions[id] = (this.data.seen.potions[id] || 0) + 1; }
  /* 见闻：序章 / 幕引 / 守卷对话 / 际遇等叙事时刻，跨局入《卷宗》 */
  seeLore(id) {
    if (!this.data.seen.lore) this.data.seen.lore = {};
    if (!this.data.seen.lore[id]) { this.data.seen.lore[id] = 1; this.write(); }
  }

  /* 残页是跨局收藏：读到过就永远留在图鉴里 */
  seePage(id) {
    if (!id) return;
    if (!Array.isArray(this.data.pages)) this.data.pages = [];
    if (this.data.pages.indexOf(id) < 0) {
      this.data.pages.push(id);
      this.write();
    }
  }

  recordRun(r) {
    const d = this.data;
    // runs 在 run.newRun() 里入账（含中途放弃），此处只累计战绩
    if (r.win) {
      d.wins += 1;
      if (d.ascension < ASCENSION_MAX) d.ascension += 1;
    }
    if (r.depth > d.bestDepth) d.bestDepth = r.depth;
    if (r.score > d.bestScore) d.bestScore = r.score;
    d.stats.cardsPlayed += r.cardsPlayed || 0;
    d.stats.enemiesKilled += r.kills || 0;
    d.stats.damageDealt += Math.round(r.damage || 0);
    d.stats.timePlayed += r.time || 0;
    this.write();
  }

  ascensionMods() {
    // 非线性阶梯：前几重只轻微加压，后几重才明显收紧
    const A_HP = [0, 0.04, 0.06, 0.10, 0.14, 0.18];
    const A_DMG = [0, 0.03, 0.045, 0.07, 0.095, 0.12];
    const a = Math.max(0, Math.min(ASCENSION_MAX, this.data.ascension || 0));
    return {
      enemyHp: 1 + A_HP[a],
      enemyDmg: 1 + A_DMG[a],
      healCut: a >= 4 ? 0.85 : 1
    };
  }
}

export const save = new SaveManager();
