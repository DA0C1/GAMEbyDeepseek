/* 资源清单：由 tools/prepare_art.py 产出，缺图时自动降级为程序化占位 */

export const IMAGES = [
  'bg_act1', 'bg_act2', 'bg_act3', 'bg_title', 'guardian',
  'foe_gudiao', 'foe_zheng', 'foe_bifang', 'foe_huan', 'foe_gudiaowang',
  'foe_zhulong', 'foe_qiongqi', 'foe_jiuwei', 'foe_xiangliu', 'foe_shanxiao',
  'foe_baiye', 'foe_taotie', 'foe_hundun', 'foe_xingtian', 'foe_dijiang',
  'foe_lushu', 'foe_boyi', 'foe_jiao', 'foe_lu', 'foe_manman',
  'foe_jiuying', 'foe_tiangou', 'foe_yingzhao',
  /* 守卷之兽的二阶段 */
  'foe_zhulong_2', 'foe_xingtian_2', 'foe_dijiang_2',
  /* 际遇插画（竖幅）：缺图时事件页退化为墨团替身 */
  'ev_mochi', 'ev_gubei', 'ev_bailu', 'ev_guishi', 'ev_pomiao', 'ev_duzhao',
  'ev_jianzhong', 'ev_shuoshu', 'ev_canjuan', 'ev_shixiang', 'ev_duanmei', 'ev_yan',
  'ev_wumo', 'ev_kongbai', 'ev_shangren', 'ev_shoujuantai', 'ev_busi', 'ev_ziji',
  'ev_moyu', 'ev_fendi', 'ev_chuandan', 'ev_baiqiang', 'ev_xiaoshou', 'ev_duandao',
  'ev_shengyin', 'ev_jiupian', 'ev_xishanhui', 'ev_juanxin',
  /* 场景：异兽栖息地 + 鬼市 + 歇脚 */
  'hab_ze', 'hab_lin', 'hab_huo', 'hab_shan', 'hab_huang', 'hab_xue', 'hab_kong',
  'bg_shop', 'bg_rest'
];

export const AUDIO = [
  'bgm_title', 'bgm_map', 'bgm_battle', 'bgm_boss', 'bgm_ending'
];

export function imagePath(key) {
  return `assets/art/${key}.webp`;
}

export function audioPath(key) {
  return `assets/audio/${key}.mp3`;
}
