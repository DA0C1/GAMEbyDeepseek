import { random } from "../core/random.js";
/* 铭刻：可附加在单张卡牌上的篆文，改变其行为 */

export const RUNES = {
  feng: {
    name: '锋', full: '锋锐', color: '#b23a2e',
    desc: '此牌造成的伤害 +3。',
    apply: 'damage'
  },
  qing: {
    name: '轻', full: '轻灵', color: '#2f6b8a',
    desc: '此牌费用 -1。',
    apply: 'cost'
  },
  hu: {
    name: '护', full: '护心', color: '#41694a',
    desc: '打出时获得 4 点护甲。',
    apply: 'after'
  },
  xun: {
    name: '迅', full: '迅捷', color: '#b98f3f',
    desc: '打出时抽 1 张牌。',
    apply: 'after'
  },
  hui: {
    name: '回', full: '回响', color: '#6b5a8a',
    desc: '每场战斗首次打出时，回到手牌。',
    apply: 'keep'
  },
  du: {
    name: '蚀', full: '蚀骨', color: '#41694a',
    desc: '打出时对目标施加 2 层中毒。',
    apply: 'after'
  }
};

export const RUNE_IDS = Object.keys(RUNES);

export function randomRune(exclude) {
  const pool = RUNE_IDS.filter((r) => !exclude || exclude.indexOf(r) < 0);
  return pool[Math.floor(random() * pool.length)];
}
