import { random } from "../core/random.js";
/* 药水：不占灵力、不占出牌次数的一次性道具 */

export const POTIONS = {
  chixiao: {
    name: '赤霄散', icon: 'fire', color: '#b23a2e', target: 'weakest',
    desc: '对生命最低的敌人造成 20 点伤害，无视护甲。',
    use(B, t) { if (t) B.damage(t, 20, { pierce: true, raw: true }); }
  },
  xuanbing: {
    name: '玄冰露', icon: 'shield', color: '#2f6b8a', target: 'self',
    desc: '获得 15 点护甲。',
    use(B) { B.block(15); }
  },
  huichun: {
    name: '回春丹', icon: 'lotus', color: '#4a7a52', target: 'self',
    desc: '回复 25 点生命。',
    use(B) { B.heal(25); }
  },
  juling: {
    name: '聚灵汤', icon: 'talisman', color: '#b98f3f', target: 'self',
    desc: '立即获得 2 点灵力。',
    use(B) { B.gainEnergy(2); }
  },
  fenxin: {
    name: '焚心散', icon: 'fire', color: '#c65b4d', target: 'all',
    desc: '对所有敌人施加 5 层灼烧。',
    use(B) { B.applyAll('burn', 5); }
  },
  fogu: {
    name: '腐骨水', icon: 'poison', color: '#41694a', target: 'all',
    desc: '对所有敌人施加 5 层中毒。',
    use(B) { B.applyAll('poison', 5); }
  },
  jifeng: {
    name: '疾风丸', icon: 'wind', color: '#6d6152', target: 'self',
    desc: '抽 3 张牌。',
    use(B) { B.draw(3); }
  },
  dali: {
    name: '大力散', icon: 'claw', color: '#8b2a20', target: 'self',
    desc: '获得 3 点力量。',
    use(B) { B.apply(B.player, 'str', 3); }
  },
  huxin: {
    name: '护心丹', icon: 'moon', color: '#6b5a8a', target: 'self',
    desc: '本回合受到的伤害减半。',
    use(B) { B.apply(B.player, 'halve', 1); }
  },
  wumo: {
    name: '无墨之水', icon: 'water', color: '#4a6a78', target: 'self',
    desc: '洗山会擦图用的水。解除你身上的一切减益，并获得 6 点护甲。',
    use(B) {
      const bf = B.player.buffs;
      bf.weak = 0; bf.vuln = 0; bf.poison = 0; bf.burn = 0;
      B.block(6);
    }
  }
};

export const POTION_IDS = Object.keys(POTIONS);
export const POTION_MAX = 3;

/* 权重：治疗与防御常见，力量与减伤稀有 */
const WEIGHT = {
  huichun: 22, xuanbing: 20, juling: 14,
  chixiao: 16, fogu: 11, fenxin: 11, jifeng: 10, dali: 7, huxin: 7, wumo: 6
};

export function rollPotion(exclude = []) {
  const pool = POTION_IDS.filter((id) => exclude.indexOf(id) < 0);
  if (!pool.length) return null;
  const total = pool.reduce((s, id) => s + (WEIGHT[id] || 8), 0);
  let r = random() * total;
  for (const id of pool) {
    r -= (WEIGHT[id] || 8);
    if (r <= 0) return id;
  }
  return pool[0];
}
