import { random } from "../core/random.js";
/* 法宝：被动钩子 */

export const RELICS = {
  tongjing: {
    name: '青铜镜', icon: 'moon', rarity: 'common',
    set: 'guard',
    desc: '每回合第一次打出术法牌时，获得 4 点护甲。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      cardPlayed(B, s, card) {
        if (!s.used && card && card.def.type === 'skill') { s.used = true; B.block(4); }
      }
    }
  },
  zhuniao: {
    name: '朱雀羽', icon: 'feather', rarity: 'common',
    set: 'fire',
    desc: '施加灼烧时额外 +1 层；灼烧伤害 +1。',
    hooks: {
      applyBuff(B, s, target, name) { if (name === 'burn' && target !== B.player) target.buffs.burn = (target.buffs.burn || 0) + 1; },
      burnBonus() { return 1; }
    }
  },
  xuantie: {
    name: '玄铁剑穗', icon: 'sword', rarity: 'common',
    set: 'sword',
    desc: '攻击牌造成的伤害 +2。',
    hooks: {
      calcDamage(B, s, card, dmg) { return (card && card.def.type === 'attack') ? dmg + 2 : dmg; }
    }
  },
  ruyi: {
    name: '玉如意', icon: 'star', rarity: 'common',
    set: 'art',
    desc: '每回合第一次打出术法牌时，抽 1 张牌。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      cardPlayed(B, s, card) {
        if (!s.used && card && card.def.type === 'skill') { s.used = true; B.draw(1); }
      }
    }
  },
  guijia: {
    name: '龟甲', icon: 'shield', rarity: 'common',
    set: 'guard',
    desc: '战斗开始时获得 9 点护甲。',
    hooks: { battleStart(B) { B.block(9); } }
  },
  modou: {
    name: '墨斗', icon: 'seal', rarity: 'common',
    set: 'art',
    desc: '每打出 3 张牌，抽 1 张牌。',
    hooks: {
      battleStart(B, s) { s.n = 0; },
      cardPlayed(B, s) { s.n = (s.n || 0) + 1; if (s.n % 3 === 0) B.draw(1); }
    }
  },
  fuzhidai: {
    name: '符纸袋', icon: 'talisman', rarity: 'common',
    set: 'art',
    desc: '每回合多抽 1 张牌。',
    hooks: { drawCount(B, s, n) { return n + 1; } }
  },
  tongqian: {
    name: '铜钱串', icon: 'coin', rarity: 'common',
    set: 'art',
    desc: '每场战斗胜利额外获得 18 墨。',
    hooks: { battleWin(B, s) { B.bonusGold += 18; } }
  },
  hulu: {
    name: '药师葫芦', icon: 'gourd', rarity: 'common',
    set: 'guard',
    desc: '每场战斗胜利后回复 9 点生命。',
    hooks: { battleWin(B, s) { B.outHeal += 9; } }
  },
  nianzhu: {
    name: '白骨念珠', icon: 'skull', rarity: 'common',
    set: 'poison',
    desc: '每击杀一个敌人，获得 4 点护甲。',
    hooks: { enemyKilled(B) { B.block(4); } }
  },
  chijin: {
    name: '赤金印', icon: 'seal', rarity: 'uncommon',
    set: 'sword',
    desc: '每回合第一次攻击额外造成 5 点伤害。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      calcDamage(B, s, card, dmg, target, preview) {
        if (!s.used && card && card.def.type === 'attack') {
          if (!preview) s.used = true;
          return dmg + 5;
        }
        return dmg;
      }
    }
  },
  qingyu: {
    name: '青玉案', icon: 'lotus', rarity: 'uncommon',
    set: 'art',
    desc: '最大生命 +14。',
    hooks: {
      pickup(R) { R.player.maxHp += 14; R.player.hp += 14; }
    }
  },
  pojunqi: {
    name: '破军旗', icon: 'claw', rarity: 'uncommon',
    set: 'sword',
    desc: '对生命低于 35% 的敌人造成的伤害 +40%。',
    hooks: {
      calcDamage(B, s, card, dmg, target) {
        return (target && target.hp / target.maxHp < 0.35) ? Math.round(dmg * 1.4) : dmg;
      }
    }
  },
  zhenhun: {
    name: '镇魂铃', icon: 'bell', rarity: 'uncommon',
    set: 'seal',
    desc: '敌人死亡时，其余敌人失去 8 点生命。',
    hooks: {
      enemyKilled(B, s, e) {
        B.enemies.forEach((o) => {
          if (o.alive && o !== e) B.damage(o, 8, { pierce: true, silent: true, raw: true });
        });
      }
    }
  },
  xingpan: {
    name: '星盘', icon: 'star', rarity: 'uncommon',
    set: 'art',
    desc: '每回合开始时，若手牌少于 3 张，抽 1 张。',
    hooks: { turnStart(B) { if (B.hand.length < 3) B.draw(1); } }
  },
  suanpan: {
    name: '铁算盘', icon: 'coin', rarity: 'uncommon',
    set: 'art',
    desc: '商铺中所有价格降低 25%。',
    hooks: {}
  },
  yunjin: {
    name: '云锦囊', icon: 'cloud', rarity: 'uncommon',
    set: 'guard',
    desc: '战斗开始时，获得 1 张随机攻击牌（临时）。',
    hooks: {
      battleStart(B) {
        B.addRandomAttack();
      }
    }
  },
  xueyu: {
    name: '血玉', icon: 'heart', rarity: 'uncommon',
    set: 'poison',
    desc: '每累计失去 10 点生命，获得 1 点力量（每场战斗）。',
    hooks: {
      battleStart(B, s) { s.acc = 0; },
      playerDamaged(B, s, amt) {
        s.acc = (s.acc || 0) + amt;
        while (s.acc >= 10) { s.acc -= 10; B.apply(B.player, 'str', 1); }
      }
    }
  },
  leigong: {
    name: '雷公凿', icon: 'thunder', rarity: 'uncommon',
    set: 'fire',
    desc: '每回合一次：单体攻击牌结算后，若目标仍存活，施加 1 层易伤。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      cardPlayed(B, s, card, target) {
        if (!s.used && card && card.def.type === 'attack' && target && target.alive) {
          s.used = true;
          B.apply(target, 'vuln', 1);
        }
      }
    }
  },
  shetui: {
    name: '蛇蜕', icon: 'snake', rarity: 'uncommon',
    set: 'poison',
    desc: '回合结束时若你没有护甲，获得 5 点护甲。',
    hooks: { turnEnd(B) { if (B.player.block <= 0) B.block(5); } }
  },
  bingxin: {
    name: '冰心盏', icon: 'frost', rarity: 'uncommon',
    set: 'guard',
    desc: '受到伤害时，有 45% 概率获得 1 点灵力。',
    hooks: { playerDamaged(B) { if (random() < 0.45) B.gainEnergy(1); } }
  },
  taichu: {
    name: '太初石', icon: 'mountain', rarity: 'rare',
    set: 'seal',
    desc: '每场战斗开始时获得 2 点力量。',
    hooks: { battleStart(B) { B.apply(B.player, 'str', 2); } }
  },
  jiuqiao: {
    name: '九窍玉', icon: 'lotus', rarity: 'rare',
    set: 'guard',
    desc: '每回合额外获得 1 点灵力，但最大生命 -18%。',
    hooks: {
      pickup(R) {
        R.player.maxHp = Math.max(20, Math.round(R.player.maxHp * 0.82));
        R.player.hp = Math.min(R.player.hp, R.player.maxHp);
      },
      turnStart(B) { B.gainEnergy(1); }
    }
  },
  fentianlu: {
    name: '焚天炉', icon: 'fire', rarity: 'rare',
    set: 'fire',
    desc: '施加灼烧时额外 +2 层；灼烧伤害 +2。',
    hooks: {
      applyBuff(B, s, target, name) { if (name === 'burn' && target !== B.player) target.buffs.burn = (target.buffs.burn || 0) + 2; },
      burnBonus() { return 2; }
    }
  },
  zhaohun: {
    name: '招魂幡', icon: 'talisman', rarity: 'rare',
    set: 'poison',
    desc: '每击杀一个敌人，回复 8 点生命并抽 1 张牌。',
    hooks: { enemyKilled(B) { B.heal(8); B.draw(1); } }
  },
  wuxing: {
    name: '五行轮', icon: 'star', rarity: 'rare',
    set: 'seal',
    desc: '每回合首次打出非 X 费且需要灵力的牌，费用减少 1。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      costMod(B, s, card, preview, c) {
        // 0 费牌不该白白吃掉这一回合的减费：看累计费用而非基础费用
        if (!s.used && card && (c || 0) > 0) {
          if (!preview) s.used = true;
          return -1;
        }
        return 0;
      }
    }
  },

  /* ==========================================================
     扩充法宝
     ========================================================== */
  duanren: {
    name: '断刃', icon: 'sword', rarity: 'uncommon', set: 'sword',
    desc: '每场战斗的第一次攻击，伤害翻倍。',
    hooks: {
      battleStart(B, s) { s.used = false; },
      calcDamage(B, s, card, dmg, target, preview) {
        if (!s.used && card && card.def.type === 'attack') {
          if (!preview) s.used = true;
          return dmg * 2;
        }
        return dmg;
      }
    }
  },
  jianzhong: {
    name: '剑冢', icon: 'blade', rarity: 'rare', set: 'sword',
    desc: '每打出第 3 张攻击牌，对所有敌人造成 8 点伤害。',
    hooks: {
      cardPlayed(B, s, card) {
        if (!card || card.def.type !== 'attack') return;
        s.n = (s.n || 0) + 1;
        if (s.n % 3 === 0) B.damageAll(8);
      }
    }
  },
  huozhong: {
    name: '火种', icon: 'fire', rarity: 'common', set: 'fire',
    desc: '战斗开始时，对所有敌人施加 3 层灼烧。',
    hooks: {
      battleStart(B) { B.applyAll('burn', 3); }
    }
  },
  liyan: {
    name: '离焰', icon: 'star', rarity: 'uncommon', set: 'fire',
    desc: '每回合第一次施加灼烧时，抽 1 张牌。',
    hooks: {
      turnStart(B, s) { s.used = false; },
      applyBuff(B, s, target, name) {
        if (name === 'burn' && target !== B.player && !s.used) { s.used = true; B.draw(1); }
      }
    }
  },
  dujing: {
    name: '毒经', icon: 'poison', rarity: 'uncommon', set: 'poison',
    desc: '中毒的敌人死亡时，把剩余中毒层数传给另一个敌人。',
    hooks: {
      enemyKilled(B, s, dead) {
        const n = dead && dead.buffs ? (dead.buffs.poison || 0) : 0;
        if (n <= 0) return;
        const alive = B.enemies.filter((e) => e.alive);
        if (!alive.length) return;
        B.apply(alive[0], 'poison', n);
      }
    }
  },
  fushi: {
    name: '腐尸', icon: 'skull', rarity: 'rare', set: 'poison',
    desc: '中毒 8 层以上的敌人，受到的攻击伤害 +20%。',
    hooks: {
      calcDamage(B, s, card, dmg, target) {
        if (card && card.def.type === 'attack' && target && (target.buffs.poison || 0) >= 8) {
          return Math.round(dmg * 1.2);
        }
        return dmg;
      }
    }
  },
  yinxin: {
    name: '印心', icon: 'seal', rarity: 'common', set: 'seal',
    desc: '战斗开始时，额外获得 1 点灵力。',
    hooks: {
      battleStart(B) { B.gainEnergy(1); }
    }
  },
  fengyin: {
    name: '封印', icon: 'bell', rarity: 'uncommon', set: 'seal',
    desc: '每场战斗第一次打出牌时，抽 2 张。',
    hooks: {
      battleStart(B, s) { s.used = false; },
      cardPlayed(B, s) {
        if (!s.used) { s.used = true; B.draw(2); }
      }
    }
  },
  tiejia: {
    name: '铁甲', icon: 'wall', rarity: 'uncommon', set: 'guard',
    desc: '回合结束时若护甲不低于 12，对随机敌人造成护甲六成的伤害。',
    hooks: {
      turnEnd(B) {
        if (B.player.block >= 12) B.damageRandom(Math.floor(B.player.block * 0.6), 1);
      }
    }
  },
  biji: {
    name: '手札', icon: 'talisman', rarity: 'common', set: 'art',
    desc: '每打出 5 张牌，抽 1 张并回复 1 点灵力。',
    hooks: {
      cardPlayed(B, s) {
        s.n = (s.n || 0) + 1;
        if (s.n % 5 === 0) { B.draw(1); B.gainEnergy(1); }
      }
    }
  }

};

export const RELIC_IDS = Object.keys(RELICS);

const W = { common: 54, uncommon: 33, rare: 13 };

export function rollRelic(exclude = []) {
  const pool = RELIC_IDS.filter((id) => exclude.indexOf(id) < 0);
  if (!pool.length) return null;
  let total = pool.reduce((s, id) => s + W[RELICS[id].rarity], 0);
  let r = random() * total;
  for (const id of pool) {
    r -= W[RELICS[id].rarity];
    if (r <= 0) return id;
  }
  return pool[pool.length - 1];
}


/* 套装：同一门派的三件法宝会互相呼应 */
export const RELIC_SETS = {
  sword: { name: '剑意', color: '#b23a2e', desc: '攻击牌伤害 +3' },
  fire: { name: '焚天', color: '#c65b4d', desc: '灼烧伤害 +2，施加灼烧时额外 +1 层' },
  poison: { name: '蚀骨', color: '#41694a', desc: '中毒每回合不再递减' },
  guard: { name: '不动', color: '#2f6b8a', desc: '每回合开始获得 4 点护甲' },
  art: { name: '通玄', color: '#b98f3f', desc: '每回合多抽 1 张牌' },
  seal: { name: '镇印', color: '#6b5a8a', desc: '灵力上限 +1' },

};

export const SET_NEED = 3;
