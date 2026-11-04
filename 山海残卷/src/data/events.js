import { random } from "../core/random.js";
/* 际遇：行卷途中的随机事件 */

import { PAGES } from './story.js';

export const EVENTS = [
  {
    id: 'mochi', title: '墨池',
    text: '林间有一方石池，池中不是水，是浓得化不开的墨。\n墨面微动，映出的却不是你的脸。',
    options: [
      { label: '俯身饮墨', hint: '失去 8 生命 · 获得 90 墨', effect: (R) => { if (R.hurt(8)) return '你未能完成这次尝试。'; R.gold(90); return '喉间一片苦涩，眼中却亮了几分。'; } },
      { label: '以墨洗笔', hint: '随机移除牌组中一张牌', effect: (R) => { const c = R.removeRandomCard(); return c ? '你把「' + c + '」沉入池底，它没有浮起来。' : '池水映着空空的笔。'; } },
      { label: '转身离去', hint: '', effect: () => '身后传来墨汁翻涌的声音，你没有回头。' }
    ]
  },
  {
    id: 'gubei', title: '无字古碑',
    text: '荒草间立着一块石碑，碑上无字，却有极深极细的刻痕，像是被人反复描过。',
    options: [
      { label: '拓印碑文', hint: '失去 14 生命 · 获得一件法宝', effect: (R) => { if (R.hurt(14)) return '你未能完成这次尝试。'; const r = R.addRandomRelic(); return '你以血为墨拓下碑文，纸背浮出一物：' + r + '。'; } },
      { label: '默读刻痕', hint: '升级一张随机牌', effect: (R) => { const n = R.upgradeRandom(1); return n ? '刻痕在你脑中舒展开来，一张符箓悄然改写。' : '刻痕太浅，你什么也没读懂。'; } },
      { label: '离开', hint: '', effect: () => '你绕开石碑，草叶在脚边合拢。' }
    ]
  },
  {
    id: 'bailu', title: '受伤的白鹿',
    text: '一头白鹿卧在溪边，后腿被什么东西咬穿了，血染红了半溪水。\n它看着你，没有逃。',
    options: [
      { label: '为它包扎', hint: '失去 40 墨 · 回复 28 生命', effect: (R) => { if (R.player.gold < 40) return '你摸遍全身，连一块墨都没有。白鹿轻轻闭上了眼。'; R.gold(-40); R.heal(28); return '白鹿起身，用额头碰了碰你的手，然后消失在林子里。'; } },
      { label: '取它的角', hint: '获得 160 墨 · 获得一张诅咒', effect: (R) => { R.gold(160); R.addCard('xinmo'); return '角断时它没有叫。你走出很远，仍听见溪水在响。'; } },
      { label: '悄悄离开', hint: '', effect: () => '你后退几步，白鹿的目光一直跟着你，直到树影遮住它。' }
    ]
  },
  {
    id: 'guishi', title: '鬼市',
    text: '夜里忽然出现一条街。摊子后坐着的都没有脸，只有一双手，摊在面前。\n他们不吆喝，只是等。',
    options: [
      { label: '买一页符', hint: '支付 90 墨 · 获得一张稀有符箓', effect: (R) => { if (R.player.gold < 90) return '你把口袋翻了个底朝天，摊主的手缩了回去。'; R.gold(-90); return '无脸人递来一张符，纸还是温的：' + R.addRandomCard('rare') + '。'; } },
      { label: '卖一段记忆', hint: '随机移除一张牌 · 获得 70 墨', effect: (R) => { const c = R.removeRandomCard(); if (c) R.gold(70); return c ? '「' + c + '」被收走了，你记不起它原本的样子。' : '摊主摆摆手，示意你没什么可卖的。'; } },
      { label: '不看不听', hint: '', effect: () => '你低着头走过长街，脚步声在身后一层层叠上来。' }
    ]
  },
  {
    id: 'pomiao', title: '山神庙',
    text: '半座庙塌在坡上，神像只剩半边脸，蛛网从它的眼角垂下来。\n供桌上落满灰，却有一支新点的香。',
    options: [
      { label: '供上一炷香', hint: '支付 90 墨 · 获得随机法宝', effect: (R) => { if (R.player.gold < 90) return '你连香都买不起，只能空着手站了一会儿。'; R.gold(-90); return '香灰落下的地方，多了一件东西：' + R.addRandomRelic() + '。'; } },
      { label: '在檐下歇脚', hint: '回复 18 生命', effect: (R) => { R.heal(18); return '你靠着断墙睡了一觉，梦里有人在扫地。'; } },
      { label: '拆走神像的金漆', hint: '获得 130 墨 · 失去 12 生命', effect: (R) => { if (R.hurt(12)) return '你未能完成这次尝试。'; R.gold(130); return '金漆剥落时，你听见极轻的一声叹息。'; } }
    ]
  },
  {
    id: 'duzhao', title: '毒沼',
    text: '一片泛着青紫色气泡的沼泽，雾贴着地面走。\n沼心似乎有什么在发亮。',
    options: [
      { label: '涉水取物', hint: '失去 14 生命 · 获得 220 墨', effect: (R) => { if (R.hurt(14)) return '你未能完成这次尝试。'; R.gold(220); return '你从淤泥里拖出一只沉甸甸的钱袋，皮肤上浮起细密的紫纹。'; } },
      { label: '绕行', hint: '失去 6 生命', effect: (R) => { if (R.hurt(6)) return '你未能完成这次尝试。'; return '多走了半个时辰，鞋底还是被雾浸透了。'; } },
      { label: '采集毒雾', hint: '获得一张毒系符箓', effect: (R) => { return '你用竹管封住一缕紫雾，它贴着管壁游动，像活的。随即化成一张符：' + R.addRandomCardByType('poison') + '。'; } }
    ]
  },
  {
    id: 'jianzhong', title: '剑冢',
    text: '漫山遍野插着断剑，剑身朝下，像一片倒长的林。\n风过时，它们一起发出极低的鸣响。',
    options: [
      { label: '拔起一柄', hint: '获得 2 张攻击符箓 · 失去 10 生命', effect: (R) => { if (R.hurt(10)) return '你未能完成这次尝试。'; const a = R.addRandomCardByType('attack'); const b = R.addRandomCardByType('attack'); return '剑柄上的血洗不掉，你干脆把它当成了自己的。得「' + a + '」与「' + b + '」。'; } },
      { label: '祭拜剑冢', hint: '升级一张攻击牌', effect: (R) => { const n = R.upgradeRandom(1, 'attack'); return n ? '剑鸣渐渐低下去，一柄剑认了你。' : '你拜了三拜，剑鸣渐渐低下去。'; } },
      { label: '离开', hint: '', effect: () => '走出很远，剑鸣还在耳后。' }
    ]
  },
  {
    id: 'shuoshu', title: '盲眼说书人',
    text: '一个瞎眼老人坐在路边，膝上摊着一卷空白的书。\n他听见你的脚步，就开口讲了起来——讲的是一个你从未听过、却处处熟悉的故事。',
    options: [
      { label: '听完这个故事', hint: '回复 22 生命', effect: (R) => { R.heal(22); return '故事讲完，你发现自己坐了很久，伤口已经结痂。'; } },
      { label: '请他再讲一段', hint: '支付 80 墨 · 获得随机法宝', effect: (R) => { if (R.player.gold < 80) return '你掏不出钱，老人笑了笑，把书合上。'; R.gold(-80); return '他从书页里摸出一物递给你：' + R.addRandomRelic() + '。'; } },
      { label: '离开', hint: '', effect: () => '身后的说书声没有停，讲的是另一个人。' }
    ]
  },
  {
    id: 'canjuan', title: '残卷',
    text: '一张巨大的残页铺在地上，边缘焦黑。上面画着半只异兽，墨迹还在缓慢地流动。',
    options: [
      { label: '修补残页', hint: '升级两张随机牌 · 失去 8 生命', effect: (R) => { if (R.hurt(8)) return '你未能完成这次尝试。'; const n = R.upgradeRandom(2); return n ? '你把血按在墨迹上，' + n + ' 张符箓重新清晰起来。' : '墨迹已经干了，你什么也没能留下。'; } },
      { label: '焚毁残页', hint: '获得 110 墨', effect: (R) => { R.gold(110); return '火苗窜起的瞬间，那半只异兽转过头来看了你一眼。'; } },
      { label: '绕开', hint: '', effect: () => '你从残页边缘绕过去，脚下没有留下影子。' }
    ]
  },
  {
    id: 'shixiang', title: '无名石像',
    text: '一尊两人高的石像立在路中央，没有脸，双手合在胸前。\n石缝里长出了细小的白花。',
    options: [
      { label: '跪拜', hint: '最大生命 +6 · 回复 10 生命', effect: (R) => { R.player.maxHp += 6; R.heal(10); return '你起身时，觉得骨头沉了一点，也稳了一点。'; } },
      { label: '敲碎石像', hint: '获得 180 墨 · 获得一张诅咒', effect: (R) => { R.gold(180); R.addCard('shigu_curse'); return '石像裂开时，里面是空的，只有风穿过去的声音。'; } },
      { label: '摘一朵白花', hint: '获得一张随机符箓', effect: (R) => '花摘下就枯了，掌心却留下一道符印：' + R.addRandomCard() + '。' }
    ]
  },
  {
    id: 'duanmei', title: '断眉的信', loreKey: 'event_duanmei',
    text: '一支竹管插在土里，里面卷着一张纸。\n字很潦草，起笔却和你师父一模一样。\n「师弟的徒弟：别补了。你来北边，我让你看看擦过的地方长什么样。」',
    options: [
      { label: '读下去', hint: '获得 120 墨 · 牌组多一张诅咒', effect: (R) => { R.gold(120); R.addCard('xinmo'); return '信纸背面还写着一行小字：「你师父当年也读过这封信。」你的手开始抖。'; } },
      { label: '烧掉', hint: '升级两张随机牌', effect: (R) => { const n = R.upgradeRandom(2); return n ? '火苗舔过纸角，你觉得心里有什么东西也跟着硬了一点。' : '纸烧完了，灰很轻。'; } },
      { label: '原样插回去', hint: '回复 16 生命', effect: (R) => { R.heal(16); return '你把纸卷好，塞回竹管，重新插进土里。\n风会把它带给下一个路过的人。'; } }
    ]
  },
  {
    id: 'yan', title: '一方旧砚',
    text: '石台上放着一方砚，砚池里的墨早已干成硬壳。\n砚底刻着两个字：沈砚。',
    options: [
      { label: '磨开残墨', hint: '失去 12 生命 · 获得一件法宝', effect: (R) => { if (R.hurt(12)) return '你未能完成这次尝试。'; const r = R.addRandomRelic(); return '你以自己的血化开那层墨壳。砚底浮出一物：' + r + '。'; } },
      { label: '带走砚台', hint: '获得 150 墨', effect: (R) => { R.gold(150); return '砚台比看上去重得多。你背起它，走了两步又放下——太重了，只敲下一角。'; } },
      { label: '留在原处', hint: '回复 24 生命', effect: (R) => { R.heal(24); return '你在石台边坐了很久。风穿过山谷，像有人在轻轻磨墨。'; } }
    ]
  },
  {
    id: 'wumo', title: '一瓶无墨之水',
    text: '一个摔碎的青瓷瓶，瓶底还剩一点清水。\n水落在纸上，纸上的墨就没了，纸还是纸。',
    options: [
      { label: '抹去一张符', hint: '随机移除牌组中一张牌', effect: (R) => { const c = R.removeRandomCard(); return c ? '「' + c + '」在水里散开，像从来没有存在过。' : '瓶底只剩几滴，什么也抹不掉。'; } },
      { label: '浇在自己手上', hint: '失去 20 生命 · 获得 220 墨', effect: (R) => { if (R.hurt(20)) return '你未能完成这次尝试。'; R.gold(220); return '手背上的一块旧疤不见了——连带着一小块皮肉。你换来了足够多的墨。'; } },
      { label: '倒回瓶里', hint: '', effect: () => '你小心地把水收回去。这东西不该被随便用掉。' }
    ]
  },
  {
    id: 'kongbai', title: '空白之地',
    text: '前方有一片完全空白的地方。没有山，没有墨，连影子都没有。\n你抬脚，脚落下去是实的。',
    options: [
      { label: '走进去', hint: '失去 18 生命 · 升级三张随机牌', effect: (R) => { if (R.hurt(18)) return '你未能完成这次尝试。'; R.upgradeRandom(3); return '空白里没有声音。你在里面站了一会儿，出来时，身上的符箓都变了个样子。'; } },
      { label: '扔一块石头', hint: '获得 80 墨', effect: (R) => { R.gold(80); return '石头落进去，没有响声，也没有落地。\n你等了一会儿，从空白里飘出来几张揉皱的纸。'; } },
      { label: '绕开', hint: '', effect: () => '你沿着空白的边缘走。边缘很整齐，像被人用尺子量过。' }
    ]
  },
  {
    id: 'shangren', title: '墨市掌柜', loreKey: 'event_shangren',
    text: '一个胖子坐在路边的箱子上，箱子里码着一排小瓷瓶。\n「刮下来的墨，纯的。图补不补、烧不烧，跟做买卖有什么关系？」',
    options: [
      { label: '买三瓶', hint: '支付 200 墨 · 获得一件法宝与一张稀有牌', effect: (R) => { if (R.player.gold < 200) return '胖子看了看你的口袋，摇了摇头。'; R.gold(-200); const r = R.addRandomRelic(); const c = R.addRandomCard('rare'); return '你拿到 ' + r + '，还有一张符：' + c + '。\n「下次再来啊。」他没抬头。'; } },
      { label: '问他图的事', hint: '获得 60 墨 · 失去 10 生命', effect: (R) => { if (R.hurt(10)) return '你未能完成这次尝试。'; R.gold(60); return '「图？」他笑了，「图要是没了，我这箱子里的东西就不值钱了。」\n他从袖子里摸出几张纸塞给你，算是封口费。'; } },
      { label: '走开', hint: '', effect: () => '你在他的箱子上看见一道新鲜的刮痕，很深。' }
    ]
  },
  {
    id: 'shoujuantai', title: '守卷台旧址',
    text: '半截石台，台上还留着香灰。\n这里是你小时候学写字的地方。',
    options: [
      { label: '跪下来', hint: '回复 32 生命 · 移除牌组中一张诅咒', effect: (R) => { R.heal(32); const c = R.removeRandomCard({ curseOnly: true }); return '石台很凉。你跪了一会儿，起身时觉得轻了些。' + (c ? '（「' + c + '」留在了这里。）' : ''); } },
      { label: '抄一遍旧帖', hint: '升级一张随机牌', effect: (R) => { const n = R.upgradeRandom(1); return n ? '你用手指在灰上写字。写到一半，忽然想起师父握笔的姿势。' : '灰太薄，写不成字。'; } },
      { label: '把香灰收进袖子', hint: '获得 100 墨', effect: (R) => { R.gold(100); return '香灰混着碎墨，能卖不少钱。你有点不好意思，但还是收了。'; } }
    ]
  },
  {
    id: 'busi', title: '一只不会死的兽',
    text: '一只小兽被压在石头下，压了很久。\n它还活着。图里的东西不会死，只会一直这样。',
    options: [
      { label: '搬开石头', hint: '获得一张诅咒 · 随机移除一张牌', effect: (R) => { R.addCard('shigu_curse'); const c = R.removeRandomCard(); return '石头很重。小兽爬起来，看了你一眼，一瘸一拐地走了。\n你身上多了一道印子，像被谁记了一笔。'; } },
      { label: '把它写回去', hint: '获得 130 墨', effect: (R) => { R.gold(130); return '你提笔，在它额上写了一个「静」字。它慢慢不动了，变成一小片墨迹。\n墨市的人说这种东西很值钱。'; } },
      { label: '走开', hint: '', effect: () => '你听见身后有很轻的爪子抓挠石头的声音，一直响到你走远。' }
    ]
  },
  {
    id: 'ziji', title: '自己的字迹',
    text: '崖壁上有一行字，墨色很新：\n「补到第三笔的时候，我看见了另一条路。」\n字迹是你的。可你从来没来过这里。',
    options: [
      { label: '照着描一遍', hint: '升级两张随机牌 · 失去 10 生命', effect: (R) => { if (R.hurt(10)) return '你未能完成这次尝试。'; R.upgradeRandom(2); return '你的手自己动了起来。写完之后，崖壁上多了一行字，还是你的笔迹，却写着别的什么。'; } },
      { label: '把字抹掉', hint: '获得 90 墨', effect: (R) => { R.gold(90); return '墨还没干，一擦就掉。手心里黏糊糊的，洗不干净。'; } },
      { label: '坐在崖下等', hint: '回复 20 生命', effect: (R) => { R.heal(20); return '你等了很久，没有人来。\n但你觉得，未来的某一天，会有人在这里看见你写的字。'; } }
    ]
  }
,

  {
    id: 'moyu', title: '墨雨',
    text: '天上落下黑色的雨。\n雨滴落在石头上不流，只是渗进去，石头就变黑了一点。',
    options: [
      { label: '淋着走', hint: '失去 8 生命 · 升级两张随机牌', effect: (R) => { if (R.hurt(8)) return '你未能完成这次尝试。'; const n = R.upgradeRandom(2); return n ? '墨渗进皮肤，衣服贴在身上。你觉得脑子比刚才清楚。' : '雨停了。衣服洗不干净了。'; } },
      { label: '撑开卷轴挡雨', hint: '获得 90 墨', effect: (R) => { R.gold(90); return '卷轴吸饱了墨，沉甸甸的。墨市收这个价。'; } },
      { label: '躲进岩洞', hint: '回复 12 生命', effect: (R) => { R.heal(12); return '洞里干燥。你听着外面的雨声，睡了一会儿。'; } }
    ]
  },
  {
    id: 'fendi', title: '一座无名的坟',
    text: '土堆很小，没有碑。\n坟前压着一枚残印，和你袖中那半枚，正是同一种石头。',
    options: [
      { label: '把印按回去', hint: '回复 26 生命 · 随机移除一张牌', effect: (R) => { R.heal(26); const c = R.removeRandomCard(); return '土堆轻轻塌下去一点，像有人松了口气。' + (c ? '（「' + c + '」留在了这里。）' : ''); } },
      { label: '挖开', hint: '失去 16 生命 · 获得一件法宝', effect: (R) => { if (R.hurt(16)) return '你未能完成这次尝试。'; const r = R.addRandomRelic(); return '土下只有一件东西：' + r + '。\n没有骨头。你想起师父说过，补完卷的人不留骨头。'; } },
      { label: '站一会儿就走', hint: '', effect: () => '你站了很久，直到影子偏向另一边。' }
    ]
  },
  {
    id: 'chuandan', title: '一张揭帖',
    text: '纸上写着一行字：「图是牢，兽无罪。三月十五，洗山。」\n背面画着一座山，被人从中间擦掉了一道。',
    options: [
      { label: '收进袖子', hint: '获得 60 墨 · 获得一张诅咒', effect: (R) => { R.gold(60); R.addCard('xinmo'); return '你把它折好收起来。走了两步，忽然发现自己在默念那行字。'; } },
      { label: '撕碎', hint: '升级一张随机牌', effect: (R) => { const n = R.upgradeRandom(1); return n ? '碎纸落了一地。你踩过去，觉得脚步稳了些。' : '纸屑被风吹散了。'; } },
      { label: '贴在树上', hint: '获得 30 墨', effect: (R) => { R.gold(30); return '路过的人会看见的。你也不知道自己希不希望他们看见。'; } }
    ]
  },
  {
    id: 'baiqiang', title: '一面被擦白的墙',
    text: '整面崖壁是空白的。不是没画过，是画过又被擦掉了。\n边缘还留着半座山的墨迹。',
    options: [
      { label: '伸手摸', hint: '失去 20 生命 · 获得两张稀有牌', effect: (R) => { if (R.hurt(20)) return '你未能完成这次尝试。'; const a = R.addRandomCard('rare'); const b = R.addRandomCard('rare'); return '指尖一空。你从空白里抓出两张符：' + a + '、' + b + '。\n它们原本不属于你。'; } },
      { label: '在空白上补一笔', hint: '获得三张随机牌 · 获得一张诅咒', effect: (R) => { R.addRandomCard(); R.addRandomCard(); R.addRandomCard(); R.addCard('shigu_curse'); return '你随手画了一座山。画完发现，山里已经站着什么东西了。'; } },
      { label: '绕开', hint: '回复 14 生命', effect: (R) => { R.heal(14); return '你贴着崖壁走过去，眼睛一直看着脚下。'; } }
    ]
  },
  {
    id: 'xiaoshou', title: '一只讨食的小兽',
    text: '一只巴掌大的兽蹲在路中间，两只前爪捧着，像在等谁给点什么。\n它没有影子。',
    options: [
      { label: '喂它墨', hint: '失去 50 墨 · 升级三张随机牌', effect: (R) => { if (R.player.gold < 50) return '你摸了摸口袋，它看了看，走了。'; R.gold(-50); R.upgradeRandom(3); return '它把墨舔干净，抬头看你，然后钻进了你的袖子。\n你觉得身上几张符都轻了些。'; } },
      { label: '赶走它', hint: '获得 40 墨', effect: (R) => { R.gold(40); return '它逃开时掉下一小块东西，硬硬的，能卖钱。'; } },
      { label: '蹲下来陪它', hint: '回复 18 生命', effect: (R) => { R.heal(18); return '你们蹲了很久。它忽然不见了，你也没觉得奇怪。'; } }
    ]
  },
  {
    id: 'duandao', title: '插在土里的刀',
    text: '一把没有鞘的刀，刀身很宽，刃口崩了几处。\n刀柄上缠着的布，是你师门的手法。',
    options: [
      { label: '握住刀柄', hint: '最大生命 +5 · 获得一件法宝', effect: (R) => { R.player.maxHp += 5; R.heal(5); const r = R.addRandomRelic(); return '刀很沉。你握住它的时候，听见有人在你背后叹了口气。\n刀柄里藏着：' + r + '。'; } },
      { label: '折断它', hint: '随机移除两张牌', effect: (R) => { const a = R.removeRandomCard(); const b = R.removeRandomCard(); return '刀断了，声音很脆。' + (a ? '「' + a + '」' : '') + (b ? '「' + b + '」' : '') + '也跟着散了。'; } },
      { label: '埋了', hint: '回复 20 生命 · 获得 70 墨', effect: (R) => { R.heal(20); R.gold(70); return '你把土压实，把那块布收进怀里。'; } }
    ]
  },
  {
    id: 'shengyin', title: '图外的声音',
    text: '有一个声音，从很远的地方传来，又像贴在你耳边。\n「……别补了。」',
    options: [
      { label: '回应它', hint: '失去 18 生命 · 升级两张随机牌', effect: (R) => { if (R.hurt(18)) return '你未能完成这次尝试。'; R.upgradeRandom(2); return '你张了张嘴。声音停了很久，然后说：「……好。」\n你不记得自己说了什么。'; } },
      { label: '装作没听见', hint: '获得 110 墨', effect: (R) => { R.gold(110); return '声音渐渐远了。地上多了些东西，不知道是谁留下的。'; } },
      { label: '捂住耳朵', hint: '回复 16 生命', effect: (R) => { R.heal(16); return '什么都听不见了，包括风声。这反而让人安心。'; } }
    ]
  },
  {
    id: 'jiupian', title: '第九片残页',
    text: '一片纸卡在石缝里，边缘焦黑。\n上面只有半句话：「……所以我把自己的名字擦掉了。」',
    options: [
      { label: '收下它', hint: '残页 +1（气血上限 +3） · 失去 10 生命', effect: (R) => {
        if (R.hurt(10)) return '你未能完成这次尝试。';
        const got = R.flags.pages || (R.flags.pages = []);
        const pool = PAGES.filter((q) => got.indexOf(q.id) < 0);
        if (!pool.length) return '你把它收进袖中。袖里已经装不下了。';
        const pg = pool[Math.floor(random() * pool.length)];
        R.recordPage(pg.id);
        return '你把它收进袖中，纸很烫。图上又补了一笔，你觉出手沉了些。\n残页 ' + got.length + ' / ' + PAGES.length + '：' + pg.title;
      } },
      { label: '照着写一遍', hint: '失去 12 生命 · 随机移除一张牌', effect: (R) => { if (R.hurt(12)) return '你未能完成这次尝试。'; const c = R.removeRandomCard(); return '你也擦掉了一个名字。' + (c ? '关于「' + c + '」的记忆淡了一些。' : ''); } },
      { label: '留在原处', hint: '获得 80 墨', effect: (R) => { R.gold(80); return '你把它塞回去，走开。墨市的人说这种东西很值钱——但不是所有人都想卖。'; } }
    ]
  },

  {
    id: 'xishanhui', title: '洗山会的营地', minAct: 1, loreKey: 'event_xishanhui',
    text: '林子里扎着几顶白幡。火堆旁没有人，只有一只封着的瓷瓮，瓮口用蜡封死，封泥上按着一道指痕。\n幡上无字——是被擦掉的字。',
    options: [
      { label: '凿开瓷瓮', hint: '失去 10 生命 · 获得无墨之水与 80 墨', effect: (R) => { if (R.hurt(10)) return '你未能完成这次尝试。'; R.gold(80); const ok = R.addPotion('wumo'); return ok ? '无墨之水泼在你脚边，草叶褪成透明。你把剩下的灌进随身的水囊——这就是洗山会的凭据。' : '水囊已满。你只接了最值钱的一壶，余下的任它渗进土里。'; } },
      { label: '翻看手令', hint: '升级两张随机牌', effect: (R) => { const n = R.upgradeRandom(2); return n ? '手令上只有一行：「先擦北卷，再擦南卷。最后，擦守卷的人。」\n起笔的顿挫和你师父教你的不一样——那是你自己的笔法。' : '手令上的字迹很新，你却什么也没读进去。'; } },
      { label: '烧了营地', hint: '获得一张诅咒', effect: (R) => { R.addCard('xinmo'); return '白幡烧起来没有烟。你看着火，忽然不确定烧掉的是营地，还是别的什么。'; } }
    ]
  },
  {
    id: 'juanxin', title: '卷心的低语', minAct: 2, loreKey: 'event_juanxin',
    text: '越往深处走，墨色越静。有一道声音贴着地面传来，不进耳朵，直接在骨头里响：\n「来了？先别急着补。坐。」\n是师父的声音。',
    options: [
      { label: '坐下听他说', hint: '回复 30 生命', effect: (R) => { R.heal(30); return '你们坐了很久。他讲卷里的四季：墨涨的时候是春，卷面发干是秋。\n临走时他说：「别学我。也别学你师兄。学你自己。」'; } },
      { label: '问他第三条路', hint: '失去 15 生命 · 升级三张随机牌', effect: (R) => { if (R.hurt(15)) return '你未能完成这次尝试。'; R.upgradeRandom(3); return '「改规矩的人得留下做规矩。」他顿了顿，「我走到一半才发现，我不舍得走。这不是牺牲，是私心。」\n你身上的符箓听懂了什么似的，自己变了。'; } },
      { label: '不回应', hint: '获得 120 墨', effect: (R) => { R.gold(120); return '你低头赶路。声音没有再响，只是脚边的墨，一直朝你走的方向漫开。'; } }
    ]
  }
];

export function rollEvent(exclude = [], actIndex = 0) {
  // 幕过滤：主线向际遇只在对应卷之后出现；池空时回退全集，保证节点必有内容
  let pool = EVENTS.filter((e) => exclude.indexOf(e.id) < 0 &&
    (e.minAct || 0) <= (actIndex || 0));
  if (!pool.length) pool = EVENTS.filter((e) => exclude.indexOf(e.id) < 0);
  return pool[Math.floor(random() * pool.length)] || EVENTS[0];
}
