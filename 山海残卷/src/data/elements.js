/* 五行：卡牌的属性归属，连续同属相可「成势」 */

export const ELEMENTS = {
  jin: {
    id: 'jin', name: '金', full: '金 · 锋锐', color: '#b98f3f', glyph: '金',
    beats: 'mu', generates: 'shui',
    /* 成势：对所有敌人造成 5 点伤害 */
    boon: '对所有敌人造成 5 点伤害',
    desc: '剑刃与破甲。金克木，金生水。'
  },
  mu: {
    id: 'mu', name: '木', full: '木 · 生蚀', color: '#4a7a52', glyph: '木',
    beats: 'tu', generates: 'huo',
    boon: '对所有敌人施加 2 层中毒',
    desc: '草木、风与蛊毒。木克土，木生火。'
  },
  shui: {
    id: 'shui', name: '水', full: '水 · 不动', color: '#2f6b8a', glyph: '水',
    beats: 'huo', generates: 'mu',
    boon: '获得 8 点护甲',
    desc: '镜、月、柔劲与寒江。水克火，水生木。'
  },
  huo: {
    id: 'huo', name: '火', full: '火 · 焚天', color: '#b23a2e', glyph: '火',
    beats: 'jin', generates: 'tu',
    boon: '对所有敌人施加 3 层灼烧',
    desc: '焦土、雷火与星陨。火克金，火生土。'
  },
  tu: {
    id: 'tu', name: '土', full: '土 · 通玄', color: '#8a7350', glyph: '土',
    beats: 'shui', generates: 'jin',
    boon: '抽 1 张牌',
    desc: '山岳、符印与守一。土克水，土生金。'
  }
};

/* 卡牌 → 五行 */
export const CARD_EL = {
  /* 金 · 剑刃、破甲与机关兵刃 */
  cijian: 'jin', hengsao: 'jin', lianhuan: 'jin', zhongpi: 'jin',
  fanshou: 'jin', pojun: 'jin', taiyi: 'jin', wujian: 'jin',
  pojia: 'jin', pozhang: 'jin', jianyu: 'jin', mojian: 'jin',
  qianji: 'jin', jianxin: 'jin', duanhun: 'jin', lianji: 'jin',
  pofeng: 'jin', zhuihun: 'jin',

  /* 木 · 毒、生息、风 */
  duzhen: 'mu', gudu: 'mu', wangu: 'mu', shigu: 'mu', duwu: 'mu',
  yuhua: 'mu', huichun: 'mu', jiuzhuan: 'mu', tunshi: 'mu', shouxin: 'mu',
  jifeng: 'mu', shengzhang: 'mu', chunfeng: 'mu', manyan: 'mu',
  kumu: 'mu', duyin: 'mu', shengji: 'mu',

  /* 水 · 护甲、镜、月、柔劲 */
  mengyan: 'shui', jieli: 'shui', yufeng: 'shui', tiebushan: 'shui',
  jinzhong: 'shui', jingji: 'shui', xuangui: 'shui', tiebi: 'shui',
  jinghua: 'shui', jingjie: 'shui', canyue: 'shui', yinxiang: 'shui',
  lianqi: 'shui', jingmian: 'shui', hanjiang: 'shui', nizhuan: 'shui',
  ningqi: 'shui', yeyou: 'shui', jijing: 'shui',

  /* 火 · 灼烧、雷、星、血 */
  huoyan: 'huo', ranhun: 'huo', fentian: 'huo', liaoyuan: 'huo',
  yinlei: 'huo', tianlei: 'huo', wulei: 'huo', xingyun: 'huo',
  xueji: 'huo', xuemuo: 'huo', liuguang: 'huo', zhuoxin: 'huo',
  baoyan: 'huo', leihuo: 'huo', fenxu: 'huo', yujin: 'huo',

  /* 土 · 山岳、符印、术数、守一 */
  suishi: 'tu', budong: 'tu', taiji: 'tu', ningshen: 'tu',
  fuzhi: 'tu', xushi: 'tu', tianji: 'tu', wuxiang: 'tu',
  wanfa: 'tu', zhouyin: 'tu', fuyao: 'tu', shouyi: 'tu',
  guanxiang: 'tu', tongxuan: 'tu', xiangshu: 'tu', wuxinggui: 'tu',
  qiankun: 'tu', tianming: 'tu',

  /* 诅咒不参与成势 */
  xinmo: null, shigu_curse: null, mihuo: null
};

export function elOf(card) {
  if (!card) return null;
  if (typeof card === 'string') return CARD_EL[card] || null;
  const id = card.id || (card.def && card.def.id) || null;
  return (id && CARD_EL[id]) || null;
}

/* 成势所需张数 */
export const COMBO_NEED = 3;

/* 相克系数：卡牌五行克目标五行 / 被目标所克 */
export const KE_MULT = 1.3;
export const BEI_MULT = 0.9;

/* 两张牌的五行关系：1 = 克制，-1 = 被克，0 = 无关 */
export function relationOf(cardEl, foeEl) {
  if (!cardEl || !foeEl) return 0;
  const a = ELEMENTS[cardEl];
  const b = ELEMENTS[foeEl];
  if (!a || !b) return 0;
  if (a.beats === foeEl) return 1;
  if (b.beats === cardEl) return -1;
  return 0;
}

export function relationMult(rel) {
  if (rel > 0) return KE_MULT;
  if (rel < 0) return BEI_MULT;
  return 1;
}

/* 相生：前一张的五行是否生出这一张 */
export function generatesOf(el) {
  return el && ELEMENTS[el] ? ELEMENTS[el].generates : null;
}
