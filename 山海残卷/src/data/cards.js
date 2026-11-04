import { random } from "../core/random.js";
/* 符箓卡池：数据 + 查询/升级/抽取 */

let uidSeq = 0;

const D = (o) => o;

export const CARDS = {
  /* ---------- 基础 ---------- */
  cijian: D({
    name: '刺剑式', type: 'attack', cost: 1, rarity: 'basic', icon: 'sword', target: 'enemy',
    text: '造成 {d} 点伤害。', vars: { d: 6 }, up: { d: 9 },
    play(B, t, v) { B.damage(t, v.d); }
  }),
  yufeng: D({
    name: '御风诀', type: 'skill', cost: 1, rarity: 'basic', icon: 'wind', target: 'self',
    text: '获得 {b} 点护甲。', vars: { b: 5 }, up: { b: 8 },
    play(B, t, v) { B.block(v.b); }
  }),
  pozhang: D({
    name: '破绽', type: 'skill', cost: 0, rarity: 'basic', icon: 'eye', target: 'enemy',
    text: '施加 {n} 层易伤。', vars: { n: 2 }, up: { n: 3 },
    play(B, t, v) { B.apply(t, 'vuln', v.n); }
  }),

  /* ---------- 剑 ---------- */
  hengsao: D({
    name: '横扫', type: 'attack', cost: 1, rarity: 'common', icon: 'blade', target: 'all',
    text: '对所有敌人造成 {d} 点伤害。', vars: { d: 6 }, up: { d: 9 },
    play(B, t, v) { B.damageAll(v.d); }
  }),
  lianhuan: D({
    name: '连环斩', type: 'attack', cost: 1, rarity: 'common', icon: 'sword', target: 'enemy', multi: 'n',
    text: '造成 {d} 点伤害 {n} 次。', vars: { d: 4, n: 2 }, up: { d: 4, n: 3 },
    play(B, t, v) { for (let i = 0; i < v.n && t.alive; i++) B.damage(t, v.d); }
  }),
  zhongpi: D({
    name: '重劈', type: 'attack', cost: 2, rarity: 'common', icon: 'blade', target: 'enemy',
    text: '造成 {d} 点伤害。', vars: { d: 17 }, up: { d: 24 },
    play(B, t, v) { B.damage(t, v.d); }
  }),
  mojian: D({
    name: '磨剑', type: 'skill', cost: 1, rarity: 'common', icon: 'sword', target: 'self',
    text: '获得 {n} 点力量。', vars: { n: 2 }, up: { n: 3 },
    play(B, t, v) { B.apply(B.player, 'str', v.n); }
  }),
  fanshou: D({
    name: '反手剑', type: 'attack', cost: 1, rarity: 'common', icon: 'sword', target: 'enemy',
    text: '造成 {d} 点伤害。若手牌中没有其它攻击牌，改为 {d2} 点。', vars: { d: 9, d2: 16 }, up: { d: 12, d2: 21 },
    play(B, t, v) {
      const alone = B.hand.filter((c) => c !== B.playingCard && c.def.type === 'attack').length === 0;
      B.damage(t, alone ? v.d2 : v.d);
    },
    dmgOf(B, t, v, card) {
      return B.hand.filter((c) => c !== card && c.def.type === 'attack').length === 0 ? v.d2 : v.d;
    }
  }),
  suishi: D({
    name: '碎石', type: 'attack', cost: 2, rarity: 'common', icon: 'mountain', target: 'enemy',
    text: '造成 {d} 点伤害。消耗。', vars: { d: 24 }, up: { d: 32 }, exhaust: true,
    play(B, t, v) { B.damage(t, v.d); }
  }),
  pojun: D({
    name: '破军', type: 'attack', cost: 3, rarity: 'uncommon', icon: 'claw', target: 'enemy',
    text: '造成 {d} 点伤害，施加 {n} 层易伤。', vars: { d: 22, n: 2 }, up: { d: 28, n: 3 },
    play(B, t, v) { B.damage(t, v.d); if (t.alive) B.apply(t, 'vuln', v.n); }
  }),
  canyue: D({
    name: '残月', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'moon', target: 'enemy',
    text: '造成 {d} 点伤害 {n} 次。若目标生命低于一半，改为 {n2} 次。',
    vars: { d: 7, n: 2, n2: 3 }, up: { d: 9, n: 2, n2: 4 },
    play(B, t, v) {
      const times = (t.hp / t.maxHp < 0.5) ? v.n2 : v.n;
      for (let i = 0; i < times && t.alive; i++) B.damage(t, v.d);
    },
    hitsOf(B, t, v) { return (t.hp / t.maxHp < 0.5) ? (v.n2 || v.n) : (v.n || 1); }
  }),
  wujian: D({
    name: '万剑归宗', type: 'attack', cost: 3, rarity: 'rare', icon: 'star', target: 'all', multi: 'n',
    text: '对所有敌人造成 {d} 点伤害 {n} 次。消耗。', vars: { d: 6, n: 3 }, up: { d: 8, n: 3 }, exhaust: true,
    play(B, t, v) { for (let i = 0; i < v.n; i++) B.damageAll(v.d); }
  }),
  taiyi: D({
    name: '太一剑', type: 'attack', cost: 3, rarity: 'rare', icon: 'sword', target: 'enemy', pierce: true,
    text: '造成 {d} 点伤害，无视护甲。', vars: { d: 30 }, up: { d: 38 },
    play(B, t, v) { B.damage(t, v.d, { pierce: true }); }
  }),
  jianyu: D({
    name: '剑域', type: 'skill', cost: 2, rarity: 'rare', icon: 'blade', target: 'self',
    text: '获得 {s} 点力量与 {x} 点敏捷。消耗。', vars: { s: 3, x: 3 }, up: { s: 5, x: 5 }, exhaust: true,
    play(B, t, v) { B.apply(B.player, 'str', v.s); B.apply(B.player, 'dex', v.x); }
  }),
  jianxin: D({
    name: '剑心通明', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'sword', target: 'self',
    text: '获得 {n} 点力量，抽 {c} 张牌。', vars: { n: 3, c: 1 }, up: { n: 4, c: 2 },
    play(B, t, v) { B.apply(B.player, 'str', v.n); B.draw(v.c); }
  }),

  /* ---------- 火 ---------- */
  huoyan: D({
    name: '火焰符', type: 'attack', cost: 2, rarity: 'common', icon: 'fire', target: 'enemy',
    text: '造成 {d} 点伤害，施加 {b} 层灼烧。', vars: { d: 10, b: 3 }, up: { d: 14, b: 4 },
    play(B, t, v) { B.damage(t, v.d); if (t.alive) B.apply(t, 'burn', v.b); }
  }),
  ranhun: D({
    name: '燃魂', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'fire', target: 'all',
    text: '对所有敌人施加 {b} 层灼烧。', vars: { b: 4 }, up: { b: 6 },
    play(B, t, v) { B.applyAll('burn', v.b); }
  }),
  fentian: D({
    name: '焚天', type: 'attack', cost: 4, rarity: 'rare', icon: 'fire', target: 'all',
    text: '对所有敌人造成 {d} 点伤害，施加 {b} 层灼烧。消耗。', vars: { d: 18, b: 5 }, up: { d: 24, b: 7 }, exhaust: true,
    play(B, t, v) { B.damageAll(v.d); B.applyAll('burn', v.b); }
  }),
  liaoyuan: D({
    name: '燎原', type: 'attack', cost: 1, rarity: 'uncommon', icon: 'fire', target: 'enemy',
    text: '造成 {d} 点伤害。目标每有 1 层灼烧，伤害 +2。', vars: { d: 5 }, up: { d: 8 },
    play(B, t, v) { B.damage(t, v.d + (t.buffs.burn || 0) * 2); },
    dmgOf(B, t, v) { return v.d + (t.buffs.burn || 0) * 2; }
  }),

  /* ---------- 雷 ---------- */
  yinlei: D({
    name: '引雷', type: 'attack', cost: 2, rarity: 'common', icon: 'thunder', target: 'enemy',
    text: '造成 {d} 点伤害。若目标有易伤，伤害 +{x}。', vars: { d: 12, x: 8 }, up: { d: 16, x: 10 },
    play(B, t, v) { B.damage(t, v.d + ((t.buffs.vuln || 0) > 0 ? v.x : 0)); },
    dmgOf(B, t, v) { return v.d + ((t.buffs.vuln || 0) > 0 ? v.x : 0); }
  }),
  tianlei: D({
    name: '天雷咒', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'thunder', target: 'enemy',
    text: '造成 {d} 点伤害。消耗。', vars: { d: 21 }, up: { d: 28 }, exhaust: true,
    play(B, t, v) { B.damage(t, v.d); }
  }),
  wulei: D({
    name: '五雷正法', type: 'attack', cost: 3, rarity: 'uncommon', icon: 'thunder', target: 'all', multi: 'n', randomTarget: true,
    text: '对随机敌人造成 {d} 点伤害 {n} 次。', vars: { d: 6, n: 5 }, up: { d: 8, n: 6 },
    play(B, t, v) { B.damageRandom(v.d, v.n); }
  }),

  /* ---------- 毒 ---------- */
  duzhen: D({
    name: '毒针', type: 'attack', cost: 1, rarity: 'common', icon: 'needle', target: 'enemy',
    text: '造成 {d} 点伤害，施加 {n} 层中毒。', vars: { d: 5, n: 4 }, up: { d: 7, n: 6 },
    play(B, t, v) { B.damage(t, v.d); if (t.alive) B.apply(t, 'poison', v.n); }
  }),
  gudu: D({
    name: '蛊毒', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'poison', target: 'enemy',
    text: '施加 {n} 层中毒。', vars: { n: 9 }, up: { n: 13 },
    play(B, t, v) { B.apply(t, 'poison', v.n); }
  }),
  wangu: D({
    name: '万蛊噬心', type: 'skill', cost: 3, rarity: 'rare', icon: 'poison', target: 'all',
    text: '对所有敌人施加 {n} 层中毒。消耗。', vars: { n: 12 }, up: { n: 16 }, exhaust: true,
    play(B, t, v) { B.applyAll('poison', v.n); }
  }),
  shigu: D({
    name: '蚀骨钉', type: 'attack', cost: 1, rarity: 'uncommon', icon: 'needle', target: 'enemy',
    text: '造成 {d} 点伤害。目标每有 3 层中毒，额外 +2 伤害。', vars: { d: 6 }, up: { d: 9 },
    play(B, t, v) { B.damage(t, v.d + Math.floor((t.buffs.poison || 0) / 3) * 2); },
    dmgOf(B, t, v) { return v.d + Math.floor((t.buffs.poison || 0) / 3) * 2; }
  }),
  duwu: D({
    name: '毒雾', type: 'skill', cost: 2, rarity: 'rare', icon: 'poison', target: 'self',
    text: '对所有敌人施加 {n} 层中毒；此后每当你施加中毒，额外 +2 层。', vars: { n: 3 }, up: { n: 4 },
    play(B, t, v) { B.applyAll('poison', v.n); B.apply(B.player, 'toxic', 2); }
  }),

  /* ---------- 守 ---------- */
  tiebushan: D({
    name: '绵骨功', type: 'skill', cost: 2, rarity: 'common', icon: 'water', target: 'self',
    text: '获得 {b} 点护甲。', vars: { b: 13 }, up: { b: 18 },
    play(B, t, v) { B.block(v.b); }
  }),
  jinzhong: D({
    name: '水镜罩', type: 'skill', cost: 1, rarity: 'common', icon: 'moon', target: 'self',
    text: '获得 {b} 点护甲，抽 {c} 张牌。', vars: { b: 7, c: 1 }, up: { b: 10, c: 1 },
    play(B, t, v) { B.block(v.b); B.draw(v.c); }
  }),
  jingji: D({
    name: '逆鳞甲', type: 'skill', cost: 1, rarity: 'common', icon: 'claw', target: 'self',
    text: '获得 {b} 点护甲与 {n} 点荆棘。', vars: { b: 6, n: 2 }, up: { b: 9, n: 3 },
    play(B, t, v) { B.block(v.b); B.apply(B.player, 'thorns', v.n); }
  }),
  xuangui: D({
    name: '玄龟甲', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'shield', target: 'self',
    text: '获得 {b} 点护甲。消耗。', vars: { b: 20 }, up: { b: 27 }, exhaust: true,
    play(B, t, v) { B.block(v.b); }
  }),
  tiebi: D({
    name: '回澜壁', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'wall', target: 'self',
    text: '获得 {b} 点护甲与 {n} 点荆棘。', vars: { b: 13, n: 4 }, up: { b: 18, n: 6 },
    play(B, t, v) { B.block(v.b); B.apply(B.player, 'thorns', v.n); }
  }),
  budong: D({
    name: '不动如山', type: 'skill', cost: 3, rarity: 'rare', icon: 'mountain', target: 'self',
    text: '获得 {b} 点护甲，抽 {c} 张牌。消耗。', vars: { b: 30, c: 2 }, up: { b: 40, c: 2 }, exhaust: true,
    play(B, t, v) { B.block(v.b); B.draw(v.c); }
  }),
  jieli: D({
    name: '借力打力', type: 'attack', cost: 1, rarity: 'uncommon', icon: 'water', target: 'enemy',
    text: '造成相当于当前护甲六成的伤害（至少 {m} 点）。', vars: { m: 6 }, up: { m: 9 },
    play(B, t, v) { B.damage(t, Math.max(v.m, Math.floor(B.player.block * 0.6))); },
    dmgOf(B, t, v) { return Math.max(v.m, Math.floor(B.player.block * 0.6)); }
  }),
  taiji: D({
    name: '太极', type: 'skill', cost: 2, rarity: 'rare', icon: 'taiji', target: 'self',
    text: '获得 {b} 点护甲。本回合每次受到攻击，反弹 {n} 点伤害。消耗。',
    vars: { b: 12, n: 8 }, up: { b: 18, n: 12 }, exhaust: true,
    play(B, t, v) { B.block(v.b); B.apply(B.player, 'riposte', v.n); }
  }),
  jinghua: D({
    name: '镜花', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'moon', target: 'self',
    text: '获得等同于上次受到伤害的护甲（至少 6）。消耗。', vars: {}, up: {}, exhaust: true,
    play(B) { B.block(Math.max(6, B.lastTaken || 6)); }
  }),
  jingjie: D({
    name: '镜界', type: 'skill', cost: 2, rarity: 'rare', icon: 'moon', target: 'self',
    text: '本回合受到的攻击伤害减半。消耗。', vars: {}, up: {}, exhaust: true,
    play(B) { B.apply(B.player, 'halve', 1); }
  }),
  yinxiang: D({
    name: '回响', type: 'skill', cost: 0, rarity: 'uncommon', icon: 'bell', target: 'self',
    text: '复制手牌中的一张攻击牌加入手牌。消耗。', vars: {}, up: {}, exhaust: true,
    play(B) { B.copyAttack(); }
  }),

  /* ---------- 灵 ---------- */
  ningshen: D({
    name: '凝神', type: 'skill', cost: 0, rarity: 'common', icon: 'talisman', target: 'self',
    text: '获得 {e} 点灵力。消耗。', vars: { e: 2 }, up: { e: 3 }, exhaust: true,
    play(B, t, v) { B.gainEnergy(v.e); }
  }),
  fuzhi: D({
    name: '符纸', type: 'skill', cost: 0, rarity: 'common', icon: 'talisman', target: 'self',
    text: '抽 {c} 张牌。消耗。', vars: { c: 2 }, up: { c: 3 }, exhaust: true,
    play(B, t, v) { B.draw(v.c); }
  }),
  jifeng: D({
    name: '疾风步', type: 'skill', cost: 0, rarity: 'common', icon: 'wind', target: 'self',
    text: '抽 {c} 张牌。', vars: { c: 1 }, up: { c: 2 },
    play(B, t, v) { B.draw(v.c); }
  }),
  xushi: D({
    name: '蓄势', type: 'skill', cost: 0, rarity: 'common', icon: 'talisman', target: 'self',
    text: '下回合获得 {e} 点额外灵力。消耗。', vars: { e: 2 }, up: { e: 3 }, exhaust: true,
    play(B, t, v) { B.apply(B.player, 'energyNext', v.e); }
  }),
  liuguang: D({
    name: '流光', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'star', target: 'self',
    text: '抽 {c} 张牌，获得 {e} 点灵力。', vars: { c: 2, e: 1 }, up: { c: 3, e: 1 },
    play(B, t, v) { B.draw(v.c); B.gainEnergy(v.e); }
  }),
  tianji: D({
    name: '天机', type: 'skill', cost: 1, rarity: 'rare', icon: 'star', target: 'self',
    text: '抽 {c} 张牌。消耗。', vars: { c: 4 }, up: { c: 5 }, exhaust: true,
    play(B, t, v) { B.draw(v.c); }
  }),
  wuxiang: D({
    name: '无相', type: 'skill', cost: 2, rarity: 'rare', icon: 'cloud', target: 'self',
    text: '获得 {e} 点灵力，抽 {c} 张牌。消耗。', vars: { e: 1, c: 3 }, up: { e: 2, c: 3 }, exhaust: true,
    play(B, t, v) { B.gainEnergy(v.e); B.draw(v.c); }
  }),

  /* ---------- 血 ---------- */
  xueji: D({
    name: '血祭', type: 'skill', cost: 0, rarity: 'uncommon', icon: 'heart', target: 'self',
    text: '失去 {h} 点生命，获得 {e} 点灵力，抽 {c} 张牌。', vars: { h: 6, e: 2, c: 2 }, up: { h: 4, e: 2, c: 2 },
    play(B, t, v) { B.loseHp(v.h); B.gainEnergy(v.e); B.draw(v.c); }
  }),
  tunshi: D({
    name: '吞噬', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'skull', target: 'enemy',
    text: '造成 {d} 点伤害。若击杀目标，回复 {h} 点生命。', vars: { d: 11, h: 12 }, up: { d: 16, h: 16 },
    play(B, t, v) { B.damage(t, v.d); if (!t.alive) B.heal(v.h); }
  }),
  xuemuo: D({
    name: '血魔', type: 'skill', cost: 2, rarity: 'rare', icon: 'heart', target: 'self',
    text: '获得 {n} 点力量。每回合结束失去 2 点生命。', vars: { n: 6 }, up: { n: 8 },
    play(B, t, v) { B.apply(B.player, 'str', v.n); B.apply(B.player, 'bloodpact', 2); }
  }),

  /* ---------- 咒 ---------- */
  pojia: D({
    name: '破甲', type: 'skill', cost: 1, rarity: 'common', icon: 'eye', target: 'enemy',
    text: '施加 {n} 层易伤。', vars: { n: 4 }, up: { n: 5 },
    play(B, t, v) { B.apply(t, 'vuln', v.n); }
  }),
  fuyao: D({
    name: '缚妖', type: 'skill', cost: 1, rarity: 'common', icon: 'chain', target: 'enemy',
    text: '施加 {n} 层虚弱。', vars: { n: 2 }, up: { n: 3 },
    play(B, t, v) { B.apply(t, 'weak', v.n); }
  }),
  zhouyin: D({
    name: '咒印', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'seal', target: 'enemy',
    text: '施加 {v} 层易伤与 {w} 层虚弱。消耗。', vars: { v: 3, w: 3 }, up: { v: 4, w: 4 }, exhaust: true,
    play(B, t, v) { B.apply(t, 'vuln', v.v); B.apply(t, 'weak', v.w); }
  }),

  /* ---------- 疗 ---------- */
  huichun: D({
    name: '回春', type: 'skill', cost: 1, rarity: 'common', icon: 'heart', target: 'self',
    text: '回复 {h} 点生命。', vars: { h: 9 }, up: { h: 12 },
    play(B, t, v) { B.heal(v.h); }
  }),
  jiuzhuan: D({
    name: '九转还魂', type: 'skill', cost: 2, rarity: 'rare', icon: 'lotus', target: 'self',
    text: '回复 {h} 点生命。消耗。', vars: { h: 26 }, up: { h: 34 }, exhaust: true,
    play(B, t, v) { B.heal(v.h); }
  }),
  shouxin: D({
    name: '守心', type: 'skill', cost: 1, rarity: 'common', icon: 'lotus', target: 'self',
    text: '获得 {b} 点护甲。下回合多抽 2 张牌。', vars: { b: 6 }, up: { b: 9 },
    play(B, t, v) { B.block(v.b); B.apply(B.player, 'drawNext', 2); }
  }),

  /* ---------- 综合 ---------- */
  qianji: D({
    name: '千机', type: 'skill', cost: 2, rarity: 'rare', icon: 'star', target: 'self',
    text: '本回合每打出一张牌，对随机敌人造成 {d} 点伤害。', vars: { d: 5 }, up: { d: 8 },
    play(B, t, v) { B.apply(B.player, 'comboDmg', v.d); }
  }),
  wanfa: D({
    name: '万法归一', type: 'attack', cost: 3, rarity: 'rare', icon: 'talisman', target: 'all',
    text: '弃掉所有手牌，每弃 1 张对全体造成 {d} 点伤害。', vars: { d: 6 }, up: { d: 8 },
    play(B, t, v) {
      const n = B.hand.length;
      B.discardAll();
      for (let i = 0; i < n; i++) B.damageAll(v.d);
    },
    hitsOf(B) { return B.hand.length; }
  }),
  xingyun: D({
    name: '星陨', type: 'attack', cost: 3, rarity: 'rare', icon: 'star', target: 'all',
    text: '对所有敌人造成 {d} 点伤害。若场上只有 1 个敌人，改为 {d2} 点。',
    vars: { d: 12, d2: 30 }, up: { d: 16, d2: 40 },
    play(B, t, v) {
      const n = B.enemies.filter((e) => e.alive).length;
      B.damageAll(n <= 1 ? v.d2 : v.d);
    },
    dmgOf(B, t, v) { return B.enemies.filter((e) => e.alive).length <= 1 ? v.d2 : v.d; }
  }),
  mengyan: D({
    name: '梦魇', type: 'attack', cost: 1, rarity: 'uncommon', icon: 'eye', target: 'enemy',
    text: '造成 {d} 点伤害。若目标处于虚弱，抽 1 张牌。', vars: { d: 8 }, up: { d: 11 },
    play(B, t, v) { B.damage(t, v.d); if ((t.buffs.weak || 0) > 0) B.draw(1); }
  }),
  yuhua: D({
    name: '羽化', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'feather', target: 'self',
    text: '获得 {n} 点敏捷与 {b} 点护甲。', vars: { n: 2, b: 5 }, up: { n: 3, b: 7 },
    play(B, t, v) { B.apply(B.player, 'dex', v.n); B.block(v.b); }
  }),
  lianqi: D({
    name: '练气', type: 'skill', cost: 1, rarity: 'common', icon: 'cloud', target: 'self',
    text: '获得 {n} 点敏捷。', vars: { n: 2 }, up: { n: 3 },
    play(B, t, v) { B.apply(B.player, 'dex', v.n); }
  }),

  /* ---------- 诅咒 ---------- */
  xinmo: D({
    name: '心魔', type: 'curse', cost: 0, rarity: 'curse', icon: 'eye', target: 'none',
    text: '无法打出。占据手牌。', vars: {}, up: {}, unplayable: true,
    play() {}
  }),
  shigu_curse: D({
    name: '蚀骨', type: 'curse', cost: 0, rarity: 'curse', icon: 'skull', target: 'none',
    text: '无法打出。回合结束时失去 2 点生命。', vars: {}, up: {}, unplayable: true,
    play() {}
  }),
  mihuo: D({
    name: '迷惑', type: 'curse', cost: 1, rarity: 'curse', icon: 'cloud', target: 'none',
    text: '无法打出。回合结束时消耗。', vars: {}, up: {}, unplayable: true, exhaust: true, exhaustAtTurnEnd: true,
    play() {}
  }),

  /* ==========================================================
     扩充：金 · 斩与追
     ========================================================== */
  duanhun: D({
    name: '断魂', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'sword', target: 'enemy',
    text: '造成 {d} 点伤害。若目标生命低于三成，改为 {d2} 点。',
    vars: { d: 11, d2: 24 }, up: { d: 15, d2: 30 },
    play(B, t, v) { B.damage(t, (t.hp / t.maxHp < 0.3) ? v.d2 : v.d); },
    dmgOf(B, t, v) { return (t.hp / t.maxHp < 0.3) ? v.d2 : v.d; }
  }),
  lianji: D({
    name: '连击', type: 'attack', cost: 1, rarity: 'common', icon: 'blade', target: 'enemy',
    text: '造成 {d} 点伤害。本回合每打出过一张攻击牌，伤害 +{x}。',
    vars: { d: 4, x: 2 }, up: { d: 6, x: 3 },
    play(B, t, v) { B.damage(t, v.d + Math.max(0, B.turnAttacks - 1) * v.x); },
    dmgOf(B, t, v) { return v.d + Math.max(0, B.turnAttacks - 1) * v.x; }
  }),
  pofeng: D({
    name: '破风', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'wind', target: 'enemy', pierce: true, multi: 'n',
    text: '造成 {d} 点伤害 {n} 次，无视护甲。',
    vars: { d: 7, n: 2 }, up: { d: 9, n: 2 },
    play(B, t, v) { for (let i = 0; i < v.n && t.alive; i++) B.damage(t, v.d, { pierce: true }); }
  }),
  zhuihun: D({
    name: '追魂', type: 'attack', cost: 1, rarity: 'uncommon', icon: 'needle', target: 'enemy',
    text: '造成 {d} 点伤害。若本回合尚未打出过其它牌，抽 {c} 张。',
    vars: { d: 9, c: 2 }, up: { d: 12, c: 2 },
    play(B, t, v) { B.damage(t, v.d); if (B.turnCardsPlayed === 1) B.draw(v.c); }
  }),

  /* ==========================================================
     扩充：木 · 生与蚀
     ========================================================== */
  shengzhang: D({
    name: '生长', type: 'skill', cost: 1, rarity: 'common', icon: 'lotus', target: 'self',
    text: '获得 {n} 点荆棘。', vars: { n: 4 }, up: { n: 6 },
    play(B, t, v) { B.apply(B.player, 'thorns', v.n); }
  }),
  chunfeng: D({
    name: '春风', type: 'skill', cost: 1, rarity: 'common', icon: 'feather', target: 'self',
    text: '回复 {h} 点生命，获得 {b} 点护甲。', vars: { h: 6, b: 4 }, up: { h: 9, b: 6 },
    play(B, t, v) { B.heal(v.h); B.block(v.b); }
  }),
  manyan: D({
    name: '蔓延', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'poison', target: 'all',
    text: '对所有敌人施加 {n} 层中毒。已中毒的改为 {n2} 层。',
    vars: { n: 5, n2: 9 }, up: { n: 6, n2: 11 },
    play(B, t, v) {
      B.enemies.forEach((e) => {
        if (!e.alive) return;
        B.apply(e, 'poison', (e.buffs.poison || 0) > 0 ? v.n2 : v.n);
      });
    }
  }),
  kumu: D({
    name: '枯木盾', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'wall', target: 'enemy',
    text: '获得 {b} 点护甲。目标每有 2 层中毒，额外 +3。',
    vars: { b: 9 }, up: { b: 12 },
    play(B, t, v) {
      const poison = (t && t.buffs.poison) || 0;
      B.block(v.b + Math.floor(poison / 2) * 3);
    }
  }),
  duyin: D({
    name: '毒引', type: 'skill', cost: 1, rarity: 'rare', icon: 'skull', target: 'enemy',
    text: '使目标的中毒层数翻倍（至少按 {m} 层算）。消耗。', vars: { m: 4 }, up: { m: 5 }, exhaust: true,
    play(B, t, v) {
      const n = Math.max(v.m, (t && t.buffs.poison) || 0);
      B.apply(t, 'poison', n);
    }
  }),
  shengji: D({
    name: '生息', type: 'skill', cost: 2, rarity: 'rare', icon: 'heart', target: 'self',
    text: '回复 {h} 点生命，此后每回合开始回复 {r} 点。', vars: { h: 8, r: 2 }, up: { h: 11, r: 3 },
    play(B, t, v) { B.heal(v.h); B.apply(B.player, 'regen', v.r); }
  }),

  /* ==========================================================
     扩充：水 · 守与转
     ========================================================== */
  jingmian: D({
    name: '镜面', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'moon', target: 'self',
    text: '获得 {b} 点护甲。若本回合未受伤，抽 {c} 张。',
    vars: { b: 7, c: 1 }, up: { b: 10, c: 2 },
    play(B, t, v) { B.block(v.b); if (!B.playerHurtThisTurn) B.draw(v.c); }
  }),
  hanjiang: D({
    name: '寒江', type: 'skill', cost: 2, rarity: 'uncommon', icon: 'water', target: 'all',
    text: '对所有敌人施加 {n} 层虚弱。', vars: { n: 3 }, up: { n: 4 },
    play(B, t, v) { B.applyAll('weak', v.n); }
  }),
  shouyi: D({
    name: '守一', type: 'skill', cost: 2, rarity: 'common', icon: 'shield', target: 'self',
    text: '获得 {b} 点护甲，抽 {c} 张牌。', vars: { b: 11, c: 1 }, up: { b: 15, c: 1 },
    play(B, t, v) { B.block(v.b); B.draw(v.c); }
  }),
  nizhuan: D({
    name: '逆转', type: 'skill', cost: 2, rarity: 'rare', icon: 'taiji', target: 'self',
    text: '当前护甲翻倍。', vars: {}, up: {},
    play(B, t, v) { B.block(B.player.block, { ignoreDex: true }); }
  }),

  /* ==========================================================
     扩充：火 · 燃与爆
     ========================================================== */
  zhuoxin: D({
    name: '灼心', type: 'attack', cost: 1, rarity: 'common', icon: 'fire', target: 'enemy',
    text: '造成 {d} 点伤害，施加 {b} 层灼烧，抽 {c} 张。',
    vars: { d: 5, b: 2, c: 1 }, up: { d: 8, b: 3, c: 1 },
    play(B, t, v) { B.damage(t, v.d); if (t.alive) B.apply(t, 'burn', v.b); B.draw(v.c); }
  }),
  baoyan: D({
    name: '爆炎', type: 'attack', cost: 2, rarity: 'rare', icon: 'fire', target: 'enemy',
    text: '造成目标灼烧层数 {m} 倍的伤害（基础值至少 4），然后清除其灼烧。',
    vars: { m: 5 }, up: { m: 7 },
    play(B, t, v) {
      const burn = (t && t.buffs.burn) || 0;
      B.damage(t, Math.max(4, burn * v.m));
      if (t && t.buffs.burn) { delete t.buffs.burn; B.emit('buff', { target: t, name: 'burn', stacks: 0 }); }
    },
    dmgOf(B, t, v) { return Math.max(4, ((t && t.buffs.burn) || 0) * v.m); }
  }),
  leihuo: D({
    name: '雷火', type: 'attack', cost: 2, rarity: 'uncommon', icon: 'thunder', target: 'enemy', multi: 'n',
    text: '造成 {d} 点伤害 {n} 次，每次施加 1 层灼烧。',
    vars: { d: 4, n: 3 }, up: { d: 5, n: 4 },
    play(B, t, v) {
      for (let i = 0; i < v.n && t.alive; i++) { B.damage(t, v.d); if (t.alive) B.apply(t, 'burn', 1); }
    }
  }),
  fenxu: D({
    name: '焚墟', type: 'attack', cost: -1, rarity: 'rare', icon: 'star', target: 'all',
    text: '消耗全部灵力。对所有敌人造成 X 倍 {m} 点伤害，并施加 X 层灼烧。消耗。',
    vars: { m: 4 }, up: { m: 6 }, exhaust: true,
    play(B, t, v) {
      const x = B.lastX || 0;
      if (x <= 0) return;
      B.damageAll(x * v.m);
      B.applyAll('burn', x);
    },
    dmgOf(B, t, v) { return Math.max(4, (B.lastX || 0) * v.m); }
  }),
  yujin: D({
    name: '余烬', type: 'skill', cost: 0, rarity: 'uncommon', icon: 'fire', target: 'enemy',
    text: '若目标有灼烧，抽 {c} 张并回复 {e} 点灵力。消耗。',
    vars: { c: 1, e: 1 }, up: { c: 2, e: 1 }, exhaust: true,
    play(B, t, v) {
      if (t && (t.buffs.burn || 0) > 0) { B.draw(v.c); B.gainEnergy(v.e); }
    }
  }),

  /* ==========================================================
     扩充：土 · 术与变
     ========================================================== */
  guanxiang: D({
    name: '观想', type: 'skill', cost: 1, rarity: 'common', icon: 'talisman', target: 'self',
    text: '抽 {c} 张牌。', vars: { c: 2 }, up: { c: 3 },
    play(B, t, v) { B.draw(v.c); }
  }),
  ningqi: D({
    name: '凝气', type: 'skill', cost: -1, rarity: 'uncommon', icon: 'cloud', target: 'self',
    text: '消耗全部灵力，获得 X 倍 {m} 点护甲。',
    vars: { m: 7 }, up: { m: 9 },
    play(B, t, v) { B.block((B.lastX || 0) * v.m); }
  }),
  tongxuan: D({
    name: '通玄', type: 'skill', cost: 1, rarity: 'uncommon', icon: 'seal', target: 'self',
    text: '抽 {c} 张牌，回复 {e} 点灵力。消耗。',
    vars: { c: 3, e: 1 }, up: { c: 4, e: 1 }, exhaust: true,
    play(B, t, v) { B.draw(v.c); B.gainEnergy(v.e); }
  }),
  xiangshu: D({
    name: '象数', type: 'skill', cost: 1, rarity: 'rare', icon: 'star', target: 'self',
    text: '将手牌洗回牌库，然后抽等量的牌。',
    textUp: '将手牌洗回牌库，然后抽等量的牌，并额外抽 {c} 张。', vars: { c: 0 }, up: { c: 1 },
    play(B, t, v) {
      const n = B.hand.length + (v.c || 0);
      B.hand.slice().forEach((c) => { B.drawPile.push(c); });
      B.hand.length = 0;
      for (let i = B.drawPile.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const tmp = B.drawPile[i]; B.drawPile[i] = B.drawPile[j]; B.drawPile[j] = tmp;
      }
      B.emit('discardAll');
      B.draw(n);
    }
  }),
  wuxinggui: D({
    name: '五行归元', type: 'skill', cost: 3, rarity: 'rare', icon: 'taiji', target: 'self',
    text: '抽 {c} 张牌，回复 {e} 点灵力。消耗。',
    vars: { c: 5, e: 2 }, up: { c: 6, e: 3 }, exhaust: true,
    play(B, t, v) { B.draw(v.c); B.gainEnergy(v.e); }
  }),
  qiankun: D({
    name: '乾坤', type: 'skill', cost: 2, rarity: 'rare', icon: 'chain', target: 'self',
    text: '复制手牌中一张随机非 X 费攻击牌，复制品本回合免费。',
    vars: {}, up: {},
    play(B, t, v) {
      // X 费攻击牌不复制：免费复制品会以 0 层灵力空转
      const attacks = B.hand.filter((c) => c.def.type === 'attack' && c.def.cost >= 0);
      if (!attacks.length) return;
      const src = attacks[Math.floor(random() * attacks.length)];
      B.hand.push({ ...src, uid: 'qk' + random(), temp: true, free: true });
      B.emit('draw');
    }
  }),

  /* ==========================================================
     扩充：通用
     ========================================================== */
  yeyou: D({
    name: '夜游', type: 'skill', cost: 0, rarity: 'uncommon', icon: 'cloud', target: 'self',
    text: '本回合每打出一张牌，抽 1 张。消耗。', vars: {}, up: {}, exhaust: true,
    play(B, t, v) { B.apply(B.player, 'drawOnPlay', 1); }
  }),
  jijing: D({
    name: '寂静', type: 'skill', cost: 1, rarity: 'rare', icon: 'moon', target: 'self',
    text: '本回合受到的攻击伤害减半。消耗。', vars: {}, up: {}, exhaust: true,
    play(B, t, v) { B.apply(B.player, 'halve', 1); }
  }),
  tianming: D({
    name: '天命', type: 'skill', cost: 2, rarity: 'rare', icon: 'seal', target: 'self',
    text: '本场战斗中灵力上限 +1。消耗。', vars: {}, up: {}, exhaust: true,
    play(B, t, v) { B.apply(B.player, 'energyMax', 1); B.gainEnergy(1); }
  })
};

export function makeCard(id, up) {
  if (!CARDS[id]) id = 'cijian';
  uidSeq += 1;
  return { uid: uidSeq, id, up: !!up, def: CARDS[id] };
}

export function cardDef(card) { return CARDS[card.id] || CARDS.cijian; }

export function cardVars(card) {
  const d = cardDef(card);
  return card.up ? Object.assign({}, d.vars, d.up) : Object.assign({}, d.vars);
}

export function cardName(card) {
  const d = cardDef(card);
  return d.name + (card.up ? '+' : '');
}

export function cardText(card) {
  const d = cardDef(card);
  let t = card.up && d.textUp ? d.textUp : d.text;
  const v = cardVars(card);
  Object.keys(v).forEach((k) => { t = t.split('{' + k + '}').join(v[k]); });
  return t;
}

/* 升级差值：给修符界面显示「伤害 6 → 9」 */
const DIFF_NOUNS = [
  ['张牌', '抽牌'], ['张', '抽牌'], ['伤害', '伤害'], ['护甲', '护甲'], ['生命', '生命'], ['灵力', '灵力'],
  ['中毒', '中毒'], ['灼烧', '灼烧'], ['易伤', '易伤'], ['虚弱', '虚弱'], ['荆棘', '荆棘'],
  ['力量', '力量'], ['敏捷', '敏捷'], ['回春', '回春']
];
/* 文本里看不出语义时按变量名兜底 */
const KEY_NOUN = { d2: '条件伤害', n2: '段数', x: '额外伤害', m: '伤害', r: '回春', c: '多抽' };

export function upgradeDiff(card) {
  const d = cardDef(card);
  if (!d || !d.up) return [];
  const base = cardVars({ ...card, up: false });
  const up = cardVars({ ...card, up: true });
  const out = [];
  Object.keys(d.up).forEach((k) => {
    const a = base[k];
    const b = up[k];
    if (a === undefined || b === undefined || a === b) return;
    const ph = '{' + k + '}';
    const idx = (d.text || '').indexOf(ph);
    const after = idx >= 0 ? (d.text || '').slice(idx + ph.length, idx + ph.length + 8) : '';
    const before = idx >= 0 ? (d.text || '').slice(Math.max(0, idx - 8), idx) : '';

    let label = null;
    if (before.includes('反弹')) label = '反弹';
    if (!label && k === 'n2' && before.includes('已中毒')) label = '已中毒';
    // 先看占位符紧跟的字，再看兜底映射，最后才看前面的字
    if (!label) for (const [needle, name] of DIFF_NOUNS) {
      if (after.includes(needle)) { label = name; break; }
    }
    if (!label && after.includes('次')) label = '段数';
    if (!label && after.includes('倍')) label = '倍率';
    // 「改为 {n2} 层」这类：紧跟的是“层”，名词其实在前面
    if (!label && after.includes('层')) {
      for (const [needle, name] of DIFF_NOUNS) {
        if (before.includes(needle)) { label = name; break; }
      }
    }
    if (!label && KEY_NOUN[k]) label = KEY_NOUN[k];
    if (!label) {
      for (const [needle, name] of DIFF_NOUNS) {
        if (before.includes(needle)) { label = name; break; }
      }
    }
    if (!label) label = '数值';

    out.push({ key: k, label, from: a, to: b });
  });
  return out;
}

export function canUpgrade(card) {
  const d = cardDef(card);
  if (card.up) return false;
  if (d.rarity === 'curse') return false;
  return Object.keys(d.up || {}).length > 0;
}

export const CARD_POOL = Object.keys(CARDS).filter((id) => {
  const r = CARDS[id].rarity;
  return r !== 'basic' && r !== 'curse';
});

export function rollRewards(n, opt = {}) {
  const weights = { common: 60, uncommon: 30, rare: 9 };
  const pool = CARD_POOL.filter((id) => !(opt.noRare && CARDS[id].rarity === 'rare'));
  const picked = [];
  let guard = 0;
  while (picked.length < n && guard++ < 200) {
    const total = pool.reduce((s, id) => s + (weights[CARDS[id].rarity] || 8), 0);
    let r = random() * total;
    let chosen = pool[0];
    for (const id of pool) {
      r -= (weights[CARDS[id].rarity] || 8);
      if (r <= 0) { chosen = id; break; }
    }
    if (picked.indexOf(chosen) < 0) picked.push(chosen);
  }
  // 没有升级数据的牌不能被「已升级」奖励误标
  return picked.map((id) => makeCard(id, opt.upgraded &&
    Object.keys(CARDS[id].up || {}).length > 0 && random() < 0.3));
}
