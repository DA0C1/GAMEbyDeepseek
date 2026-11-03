/* 山海异兽：数据、意图、AI */

/* 七处栖息地：战斗取景与图鉴共用 */
export const HABITATS = {
  ze: '大泽', lin: '密林', huo: '火原', shan: '山岭',
  huang: '荒谷', xue: '雪岭', kong: '空界'
};

/* 特性标签：战斗立绘下的红字与图鉴共用同一套说法 */
export function traitTags(def) {
  const tr = def.traits;
  const out = [];
  if (!tr) return out;
  if (tr.thorns) out.push('反噬 ' + tr.thorns);
  if (tr.dodge) out.push('闪身 ' + Math.round(tr.dodge * 100) + '%');
  if (tr.evasion) out.push('幻影 ' + Math.round(tr.evasion * 100) + '%');
  if (tr.firstHitHalved) out.push('卸力');
  if (tr.immune) out.push('免疫' + tr.immune.map((x) => ({ poison: '毒', burn: '火' }[x] || x)).join('/'));
  if (tr.enrage) out.push('狂暴');
  if (tr.regen) out.push('自愈');
  if (tr.lifesteal) out.push('噬血');
  if (tr.aura) out.push('气场');
  if (tr.healAllies) out.push('庇护');
  if (tr.chaos) out.push('混沌');
  if (tr.onAttack) out.push('愈战');
  return out;
}

export const FOES = {
  gudiao: {
    name: '蛊雕', title: '其状如雕而有角', el: 'jin', img: 'foe_gudiao', tier: 1, kind: 'normal', hab: 'shan',
    hp: [42, 48], size: 300, lore: '鹿吴之山，其音如婴儿之啼。',
    moves: [
      { name: '啄击', type: 'attack', dmg: 7, hits: 1 },
      { name: '尖啸', type: 'attack_debuff', dmg: 4, hits: 1, playerBuff: ['weak', 1] },
      { name: '盘旋', type: 'defend', block: 7 }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  zheng: {
    name: '狰', title: '其状如赤豹，五尾一角', el: 'huo', img: 'foe_zheng', tier: 1, kind: 'normal', hab: 'shan',
    hp: [48, 54], size: 300, lore: '章莪之山，音如击石。',
    traits: { thorns: 1 },
    moves: [
      { name: '利爪', type: 'attack', dmg: 5, hits: 2 },
      { name: '猛扑', type: 'attack', dmg: 11, hits: 1 },
      { name: '蓄力', type: 'buff', selfBuff: ['str', 2] }
    ],
    ai: (e, turn) => [0, 1, 0, 2][turn % 4]
  },
  bifang: {
    name: '毕方', title: '其状如鹤，一足，赤文', el: 'huo', img: 'foe_bifang', tier: 1, kind: 'normal', hab: 'huo',
    hp: [40, 46], size: 300, lore: '见则其邑有讹火。',
    traits: { immune: ['burn'], aura: ['burn', 1] },
    moves: [
      { name: '火羽', type: 'attack_debuff', dmg: 6, hits: 1, playerBuff: ['burn', 2] },
      { name: '烈焰', type: 'attack_debuff', dmg: 10, hits: 1, playerBuff: ['burn', 3] },
      { name: '腾焰', type: 'buff', selfBuff: ['str', 3] }
    ],
    ai: (e, turn) => [0, 1, 0, 2][turn % 4]
  },
  huan: {
    name: '讙', title: '其状如狸，一目三尾', el: 'shui', img: 'foe_huan', tier: 1, kind: 'normal', hab: 'ze',
    hp: [52, 58], size: 290, lore: '其音如夺百声，可以御凶。',
    traits: { dodge: 0.3 },
    moves: [
      { name: '扑咬', type: 'attack', dmg: 9, hits: 1 },
      { name: '蜷身', type: 'defend', block: 9 },
      { name: '乱抓', type: 'attack', dmg: 4, hits: 3 }
    ],
    ai: (e, turn) => [0, 1, 2][turn % 3]
  },
  gudiaowang: {
    name: '蛊雕王', title: '群雕之首', el: 'jin', img: 'foe_gudiaowang', tier: 1, kind: 'elite', hab: 'shan',
    hp: [92, 98], size: 400, lore: '角生双枝，啼声可裂石。',
    traits: { enrage: { at: 0.5, str: 4 } },
    moves: [
      { name: '裂石啼', type: 'attack_debuff', dmg: 9, hits: 1, playerBuff: ['weak', 2] },
      { name: '双翼斩', type: 'attack', dmg: 6, hits: 2 },
      { name: '整羽', type: 'defend', block: 12, selfBuff: ['str', 1] }
    ],
    ai: (e, turn) => [0, 1, 0, 2][turn % 4]
  },
  zhulong: {
    name: '烛龙', title: '视为昼，瞑为夜', el: 'huo', img: 'foe_zhulong', tier: 1, kind: 'boss', hab: 'huo',
    hp: [140, 140], size: 560, lore: '钟山之神，身长千里，人面蛇身而赤。',
    moves: [
      { name: '烛照', type: 'attack', dmg: 13, hits: 1 },
      { name: '瞑目', type: 'defend', block: 16, selfBuff: ['str', 2] },
      { name: '焚夜', type: 'attack_debuff', dmg: 17, hits: 1, playerBuff: ['burn', 3] }
    ],
    ai: (e, turn) => [0, 1, 0, 2, 1][turn % 5],
    phases: [
      {
        at: 0.6, name: '焚 夜', line: '烛龙睁开了第二只眼。',
        str: 2,
        moves: [
          { name: '焚夜', type: 'attack_debuff', dmg: 13, hits: 1, playerBuff: ['burn', 4] },
          { name: '灼野', type: 'attack', dmg: 7, hits: 2 },
          { name: '长明', type: 'defend', block: 18, selfBuff: ['str', 2] }
        ]
      }
    ],
  },

  qiongqi: {
    name: '穷奇', title: '其状如虎，有翼', el: 'jin', img: 'foe_qiongqi', tier: 2, kind: 'normal', hab: 'shan',
    hp: [64, 72], size: 320, lore: '食人从首始，音如嗥狗。',
    traits: { firstHitHalved: true },
    moves: [
      { name: '虎噬', type: 'attack', dmg: 13, hits: 1 },
      { name: '翼击', type: 'attack', dmg: 6, hits: 2 },
      { name: '咆哮', type: 'debuff', playerBuff: ['vuln', 2], selfBuff: ['str', 1] }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  jiuwei: {
    name: '九尾', title: '青丘之狐，其音如婴儿', el: 'shui', img: 'foe_jiuwei', tier: 2, kind: 'elite', hab: 'lin',
    hp: [108, 116], size: 430, lore: '能食人；食者不蛊。',
    traits: { enrage: { at: 0.45, str: 2 }, evasion: 0.15 },
    moves: [
      { name: '魅影', type: 'attack_debuff', dmg: 7, hits: 2, special: 'curse' },
      { name: '尾舞', type: 'attack', dmg: 5, hits: 3 },
      { name: '惑心', type: 'debuff', playerBuff: ['weak', 2], selfBuff: ['dex', 2], special: 'curse' }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  xiangliu: {
    name: '相柳', title: '九首人面，蛇身而青', el: 'mu', img: 'foe_xiangliu', tier: 2, kind: 'elite', hab: 'ze',
    hp: [104, 112], size: 440, lore: '所抵之处，厥为泽溪。',
    traits: { immune: ['poison'], aura: ['poison', 1] },
    moves: [
      { name: '毒牙', type: 'attack_debuff', dmg: 8, hits: 1, playerBuff: ['poison', 3] },
      { name: '九首', type: 'attack', dmg: 5, hits: 3 },
      { name: '毒沼', type: 'debuff', playerBuff: ['poison', 5], block: 8 }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  shanxiao: {
    name: '山魈', title: '其状如人，面赤', el: 'tu', img: 'foe_shanxiao', tier: 2, kind: 'normal', hab: 'lin',
    hp: [72, 80], size: 330, lore: '见人则笑，其行如风。',
    traits: { onAttack: ['str', 1] },
    moves: [
      { name: '撕扯', type: 'attack', dmg: 8, hits: 2 },
      { name: '怪笑', type: 'debuff', playerBuff: ['weak', 2] },
      { name: '跃击', type: 'attack', dmg: 15, hits: 1 }
    ],
    ai: (e, turn) => [0, 2, 1, 0][turn % 4]
  },
  baiye: {
    name: '白鵺', title: '其状如雉，文首白翼', el: 'mu', img: 'foe_baiye', tier: 2, kind: 'normal', hab: 'lin',
    hp: [58, 64], size: 290, lore: '食之已嗌痛，可以已痸。',
    traits: { healAllies: 4 },
    moves: [
      { name: '啄羽', type: 'attack', dmg: 7, hits: 1 },
      { name: '清鸣', type: 'buff', special: 'healAll', selfBuff: ['dex', 2] },
      { name: '振翅', type: 'defend', block: 12 }
    ],
    ai: (e, turn) => [1, 0, 2, 0][turn % 4]
  },

  taotie: {
    name: '饕餮', title: '有首无身，食人未咽', el: 'tu', img: 'foe_taotie', tier: 3, kind: 'normal', hab: 'huang',
    hp: [96, 106], size: 350, lore: '贪食无厌，终于自噬其身。',
    traits: { lifesteal: 0.35 },
    moves: [
      { name: '巨噬', type: 'attack', dmg: 13, hits: 1, selfBuff: ['str', 1] },
      { name: '吞噬', type: 'buff', selfBuff: ['str', 3], block: 8 },
      { name: '咀嚼', type: 'attack', dmg: 7, hits: 2 }
    ],
    ai: (e, turn) => [0, 1, 2][turn % 3]
  },
  hundun: {
    name: '混沌', title: '无面目，六足四翼', el: 'tu', img: 'foe_hundun', tier: 3, kind: 'normal', hab: 'kong',
    hp: [110, 120], size: 340, lore: '帝江散入北山的残形，无窍而歌。',
    traits: { chaos: true },
    moves: [
      { name: '无序', type: 'attack', dmg: 9, hits: 2 },
      { name: '混蒙', type: 'debuff', playerBuff: ['vuln', 2], selfBuff: ['str', 1] },
      { name: '聚形', type: 'defend', block: 16, selfBuff: ['str', 2] }
    ],
    ai: (e, turn) => [0, 1, 2][turn % 3]
  },
  xingtian: {
    name: '刑天', title: '以乳为目，以脐为口', el: 'jin', img: 'foe_xingtian', tier: 3, kind: 'boss', hab: 'shan',
    hp: [185, 185], size: 560, lore: '与帝至此争神，帝断其首。乃以乳为目，以脐为口，操干戚以舞。',
    moves: [
      { name: '干戚舞', type: 'attack', dmg: 10, hits: 2 },
      { name: '盾守', type: 'defend', block: 18, selfBuff: ['str', 2] },
      { name: '开山', type: 'attack', dmg: 22, hits: 1 },
      { name: '怒', type: 'buff', selfBuff: ['str', 3] }
    ],
    ai: (e, turn) => [0, 1, 0, 2, 3][turn % 5],
    phases: [
      {
        at: 0.5, name: '断 首', line: '刑天把斧举过头顶。颈上什么也没有。',
        str: 3,
        moves: [
          { name: '干戚之舞', type: 'attack', dmg: 7, hits: 3 },
          { name: '开天', type: 'attack', dmg: 22, hits: 1 },
          { name: '不周', type: 'buff', selfBuff: ['str', 2] }
        ]
      }
    ],
  },
  dijiang: {
    name: '帝江', title: '状如黄囊，赤如丹火', el: 'tu', img: 'foe_dijiang', tier: 3, kind: 'boss', hab: 'kong',
    hp: [300, 300], size: 580, lore: '浑敦无面目，识歌舞。',
    moves: [
      { name: '鼓歌', type: 'attack', dmg: 10, hits: 3 },
      { name: '浑敦', type: 'debuff', playerBuff: ['weak', 2], block: 16 },
      { name: '赤火', type: 'attack_debuff', dmg: 16, hits: 1, playerBuff: ['burn', 4] },
      { name: '旋舞', type: 'attack', dmg: 7, hits: 4 }
    ],
    ai: (e, turn) => {
      const r = e.hp / e.maxHp;
      if (r > 0.66) return [0, 2, 1][turn % 3];
      if (r > 0.33) return [0, 3, 2, 1][turn % 4];
      return [3, 2, 3, 0][turn % 4];
    },
    phases: [
      {
        at: 0.55, name: '开 窍', line: '帝江身上裂开七个孔。',
        str: 2,
        moves: [
          { name: '浑敦', type: 'attack_debuff', dmg: 10, hits: 1, playerBuff: ['weak', 2] },
          { name: '凿窍', type: 'attack', dmg: 6, hits: 4 },
          { name: '七日', type: 'buff', block: 16, selfBuff: ['str', 2] }
        ]
      }
    ]
  },

  /* ==========================================================
     扩充异兽
     ========================================================== */
  lushu: {
    name: '鹿蜀', title: '其状如马而白首，其文如虎', el: 'mu', img: 'foe_lushu', tier: 1, kind: 'normal', hab: 'lin',
    hp: [44, 50], size: 300, lore: '杻阳之山，其音如谣，佩之宜子孙。',
    moves: [
      { name: '踏歌', type: 'attack', dmg: 8, hits: 1 },
      { name: '咏谣', type: 'buff', selfBuff: ['str', 2], block: 6 },
      { name: '回顾', type: 'defend', block: 9 }
    ],
    ai: (e, turn) => [0, 2, 0, 1][turn % 4]
  },
  boyi: {
    name: '猼訑', title: '羊身九尾四耳，目在背上', el: 'mu', img: 'foe_boyi', tier: 1, kind: 'normal', hab: 'lin',
    hp: [46, 52], size: 300, lore: '基山之上，佩之不畏。',
    moves: [
      { name: '四耳', type: 'attack', dmg: 3, hits: 4 },
      { name: '九尾扫', type: 'attack_debuff', dmg: 5, hits: 2, playerBuff: ['vuln', 1] },
      { name: '竖毛', type: 'defend', block: 10 }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  jiao: {
    name: '狡', title: '状如犬而豹文，其角如牛', el: 'jin', img: 'foe_jiao', tier: 1, kind: 'normal', hab: 'shan',
    hp: [38, 44], size: 290, lore: '玉山之下，见则其国大穰。',
    traits: { evasion: 0.2 },
    moves: [
      { name: '疾冲', type: 'attack', dmg: 9, hits: 1 },
      { name: '折返', type: 'attack', dmg: 5, hits: 2 },
      { name: '磨牙', type: 'buff', selfBuff: ['str', 2] }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  lu: {
    name: '鯥', title: '鱼身蛇尾而有翼', el: 'shui', img: 'foe_lu', tier: 2, kind: 'normal', hab: 'ze',
    hp: [58, 64], size: 310, lore: '柢山多水，冬死而夏生。',
    traits: { immune: ['weak'] },
    moves: [
      { name: '寒潮', type: 'attack_debuff', dmg: 8, hits: 1, playerBuff: ['weak', 2] },
      { name: '冰封', type: 'attack_debuff', dmg: 6, hits: 1, playerBuff: ['vuln', 2] },
      { name: '潜渊', type: 'defend', block: 14 }
    ],
    ai: (e, turn) => [0, 2, 1, 2][turn % 4]
  },
  manman: {
    name: '蛮蛮', title: '其状如凫，一翼一目', el: 'shui', img: 'foe_manman', tier: 2, kind: 'normal', hab: 'ze',
    hp: [40, 46], size: 280, lore: '崇吾之山，相得乃飞。',
    traits: { healAllies: 3 },
    moves: [
      { name: '并翼', type: 'attack', dmg: 6, hits: 2 },
      { name: '相呼', type: 'buff', selfBuff: ['str', 2], block: 8 },
      { name: '比飞', type: 'attack', dmg: 9, hits: 1 }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  },
  jiuying: {
    name: '九婴', title: '九首水火之怪', el: 'huo', img: 'foe_jiuying', tier: 2, kind: 'elite', hab: 'ze',
    hp: [104, 112], size: 400, lore: '凶水之上，九首各吐水火。',
    traits: { regen: 3 },
    moves: [
      { name: '九口', type: 'attack', dmg: 4, hits: 4 },
      { name: '水火', type: 'attack_debuff', dmg: 10, hits: 1, playerBuff: ['burn', 2] },
      { name: '婴啼', type: 'debuff', playerBuff: ['weak', 2], block: 10 },
      { name: '再生', type: 'buff', selfBuff: ['str', 2] }
    ],
    ai: (e, turn) => [0, 1, 2, 3][turn % 4]
  },
  tiangou: {
    name: '天狗', title: '状如狸而白首，其音如榴榴', el: 'shui', img: 'foe_tiangou', tier: 3, kind: 'normal', hab: 'xue',
    hp: [72, 80], size: 320, lore: '阴山之上，可以御凶，亦能噬月。',
    traits: { lifesteal: 0.3 },
    moves: [
      { name: '噬月', type: 'attack', dmg: 14, hits: 1 },
      { name: '夺声', type: 'attack_debuff', dmg: 8, hits: 1, playerBuff: ['weak', 2] },
      { name: '蹲守', type: 'defend', block: 16 }
    ],
    ai: (e, turn) => [0, 2, 1, 0][turn % 4]
  },
  yingzhao: {
    name: '英招', title: '马身人面，虎文鸟翼', el: 'mu', img: 'foe_yingzhao', tier: 3, kind: 'elite', hab: 'lin',
    hp: [120, 130], size: 410, lore: '槐江之山，司天帝之园圃。',
    traits: { onAttack: ['str', 1] },
    moves: [
      { name: '马踏', type: 'attack', dmg: 6, hits: 3 },
      { name: '虎纹', type: 'buff', selfBuff: ['str', 2], block: 8 },
      { name: '天马行空', type: 'attack', dmg: 18, hits: 1 }
    ],
    ai: (e, turn) => [0, 1, 2, 0][turn % 4]
  }

};

export function pickMove(foe) {
  const d = FOES[foe.id];
  const ph = foe.phase || 1;
  const phaseDef = (d.phases && d.phases[ph - 2]) || null;
  const moves = (phaseDef && phaseDef.moves) || d.moves;
  let idx = 0;
  try { idx = d.ai ? d.ai(foe, foe.turn, ph) : 0; } catch (e) { idx = 0; }
  if (idx < 0 || idx >= moves.length) idx = 0;
  foe.moveIndex = idx;
  return moves[idx];
}
