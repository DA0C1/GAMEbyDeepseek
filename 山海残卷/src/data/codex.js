/* 图鉴统计：标题页与图鉴共用，避免两边各写一份总数 */

import { CARDS } from './cards.js';
import { FOES } from './enemies.js';
import { RELICS } from './relics.js';
import { POTIONS } from './potions.js';
import { PAGES } from './story.js';

export function codexTotals() {
  const cards = Object.keys(CARDS).filter((id) => CARDS[id].rarity !== 'curse').length;
  return {
    cards,
    foes: Object.keys(FOES).length,
    relics: Object.keys(RELICS).length,
    potions: Object.keys(POTIONS).length,
    pages: PAGES.length,
    all: cards + Object.keys(FOES).length + Object.keys(RELICS).length +
      Object.keys(POTIONS).length + PAGES.length
  };
}

/* 传入 save.data */
export function codexKnown(data) {
  if (!data) return 0;
  const seen = data.seen || {};
  const hits = (ids, table, skip) => (ids || []).filter((id) => {
    const d = table[id];
    if (!d) return false;
    if (skip && skip(d)) return false;
    return true;
  }).length;
  const cards = hits(Object.keys(seen.cards || {}), CARDS, (d) => d.rarity === 'curse');
  const foes = hits(Object.keys(seen.foes || {}), FOES);
  const relics = hits(Object.keys(seen.relics || {}), RELICS);
  const potions = hits(Object.keys(seen.potions || {}), POTIONS);
  const pages = (Array.isArray(data.pages) ? data.pages : []).filter((id) => PAGES.some((p) => p.id === id)).length;
  return cards + foes + relics + potions + pages;
}

export function codexPercent(data) {
  const total = codexTotals().all;
  if (!total) return 0;
  return Math.min(100, Math.round((codexKnown(data) / total) * 100));
}
