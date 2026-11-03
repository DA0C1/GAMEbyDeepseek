import { random } from "../core/random.js";
/* 三卷地图生成与遭遇编成 */

import { save } from '../core/save.js';

export const ACTS = [
  {
    index: 0, name: '南山经', subtitle: '第一卷', theme: 'dawn',
    pool: ['gudiao', 'zheng', 'bifang', 'huan', 'lushu', 'boyi', 'jiao'],
    elite: ['gudiaowang'], boss: 'zhulong',
    cols: 8
  },
  {
    index: 1, name: '西次经', subtitle: '第二卷', theme: 'dusk',
    pool: ['qiongqi', 'shanxiao', 'baiye', 'huan', 'lu', 'manman'],
    elite: ['jiuwei', 'xiangliu', 'jiuying'], boss: 'xingtian',
    cols: 8
  },
  {
    index: 2, name: '北山经', subtitle: '第三卷', theme: 'ink',
    pool: ['taotie', 'hundun', 'qiongqi', 'shanxiao', 'tiangou', 'baiye'],
    elite: ['jiuwei', 'xiangliu', 'yingzhao'], boss: 'dijiang',
    cols: 8
  }
];

const rnd = random;
const pick = (arr) => arr[Math.floor(random() * arr.length)];

function weightedPick(w) {
  let total = 0;
  for (const k of Object.keys(w)) total += w[k];
  let r = rnd() * total;
  for (const k of Object.keys(w)) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return Object.keys(w)[0];
}

/* 每列三条道各自的类型权重。
   上道偏险（精英多、战斗多），中道驳杂，下道偏补给（际遇 / 鬼市 / 歇脚）。
   这样「走哪条道」是一个能提前规划的决定，而不是每格重新摇一次骰子。 */
const LANE_PLAN = [
  /* 第 1 列：还在热身，上道也不该出精英 */
  [{ battle: 100 }, { battle: 72, event: 28 }, { battle: 62, event: 38 }],
  /* 第 2 列 */
  [{ elite: 26, battle: 74 }, { battle: 46, event: 30, treasure: 24 }, { battle: 40, event: 36, shop: 24 }],
  /* 第 3 列 */
  [{ elite: 44, battle: 56 }, { battle: 38, event: 22, page: 18, treasure: 22 }, { battle: 34, rest: 24, event: 42 }],
  /* 第 4 列 */
  [{ elite: 32, battle: 68 }, { elite: 22, battle: 36, event: 26, treasure: 16 }, { battle: 32, shop: 28, event: 40 }],
  /* 第 5 列 */
  [{ elite: 34, battle: 66 }, { battle: 38, page: 24, event: 26, treasure: 12 }, { battle: 36, rest: 22, event: 42 }]
];

/* 第 6 列：最后一格是「补血还是补货」，不再是整列强制歇脚 */
const LAST_COL = ['rest', 'shop'];

export function generateMap(actIndex) {
  const act = ACTS[Math.min(actIndex, ACTS.length - 1)];
  const cols = act.cols;
  const map = { act, actIndex, cols: [], nodes: [], cur: { node: null } };

  for (let c = 0; c < cols; c++) {
    let count;
    if (c === 0 || c === cols - 1) count = 1;
    else if (c === cols - 2) count = LAST_COL.length;
    else count = 3;
    const col = [];
    for (let r = 0; r < count; r++) {
      const node = {
        id: map.nodes.length, col: c, row: r, count,
        type: 'battle', cleared: false, links: [], seed: Math.floor(rnd() * 1e9)
      };
      col.push(node);
      map.nodes.push(node);
    }
    map.cols.push(col);
  }

  map.cols[cols - 1][0].type = 'boss';
  map.cols[0].forEach((n) => { n.type = 'battle'; });

  // 三条道按各自性格摇类型
  for (let c = 1; c <= cols - 3; c++) {
    const plan = LANE_PLAN[Math.min(c - 1, LANE_PLAN.length - 1)];
    map.cols[c].forEach((n) => {
      n.type = weightedPick(plan[n.row] || plan[plan.length - 1]);
    });
  }

  // 最后一格：歇脚 / 鬼市，顺序随机，免得被背下来
  const last = map.cols[cols - 2];
  const order = LAST_COL.slice().sort(() => rnd() - 0.5);
  last.forEach((n, i) => { n.type = order[i] || 'rest'; });

  const midCols = [];
  for (let c = 1; c <= cols - 3; c++) midCols.push(c);
  const has = (type) => map.nodes.some((n) => n.type === type && midCols.indexOf(n.col) >= 0);

  // 兜底只能占用「普通战斗」或「际遇」，否则会互相覆盖
  // （曾经鬼市的兜底把下道唯一的中途歇脚顶掉了）
  const ensure = (type, colOrder, laneOrder) => {
    if (has(type)) return;
    for (const pass of ['battle', 'event']) {
      for (const c of colOrder) {
        for (const r of laneOrder) {
          const n = map.cols[c] && map.cols[c][r];
          if (n && n.type === pass) { n.type = type; return; }
        }
      }
    }
  };

  const rev = midCols.slice().reverse();
  ensure('elite', rev, [0, 1, 2]);
  ensure('rest', rev, [2, 1, 0]);
  ensure('shop', rev, [2, 1, 0]);
  ensure('page', rev, [1, 2, 0]);

  linkAll(map);
  return map;
}

/* 连线：同纵向最近的两条，保证每个节点都选得动，也保证道与道之间可以横跳 */
function linkAll(map) {
  const cols = map.cols;
  for (let c = 0; c < cols.length - 1; c++) {
    const cur = cols[c];
    const next = cols[c + 1];
    cur.forEach((n) => { n.links = []; });

    if (next.length === 1) {
      cur.forEach((n) => { n.links = [0]; });
      continue;
    }
    if (cur.length === 1) {
      cur[0].links = next.map((_, i) => i);
      continue;
    }

    cur.forEach((n) => {
      const ratio = (n.row + 0.5) / cur.length;
      const scored = next.map((m, i) => ({
        i,
        d: Math.abs((m.row + 0.5) / next.length - ratio) + rnd() * 0.02
      }));
      scored.sort((a, b) => a.d - b.d);
      n.links = Array.from(new Set(scored.slice(0, 2).map((x) => x.i))).sort((a, b) => a - b);
    });

    // 反向补边：每个节点至少有一条入边，避免出现走不到的孤岛
    next.forEach((m, i) => {
      if (cur.some((n) => n.links.indexOf(i) >= 0)) return;
      const ratio = (m.row + 0.5) / next.length;
      let best = cur[0];
      let bd = 9;
      cur.forEach((n) => {
        const d = Math.abs((n.row + 0.5) / cur.length - ratio);
        if (d < bd) { bd = d; best = n; }
      });
      best.links.push(i);
      best.links.sort((a, b) => a - b);
    });
  }
}

export function availableNodes(map) {
  if (!map.cur.node) return map.cols[0];
  const n = map.cur.node;
  return (n.links || []).map((i) => map.cols[n.col + 1][i]).filter(Boolean);
}

export function genEncounter(act, type, col) {
  const mul = save.ascensionMods();
  if (type === 'boss') return [{ id: act.boss, scale: 1 }];
  if (type === 'elite') {
    // 三卷精英池复用二卷数据，末卷按卷加压（血量×1.2、伤害×1.12），保持精英 ≈2 倍常规怪的压力
    const late = act.index >= 2;
    const out = [{ id: pick(act.elite), scale: late ? 1.2 : 1, dmgMul: late ? 1.12 : 1 }];
    if (act.index >= 1 && rnd() < 0.5) out.push({ id: pick(act.pool), scale: 0.68 });
    return out;
  }
  let n = act.index === 0 ? (col <= 1 ? 1 : (rnd() < 0.5 ? 2 : 1))
    : act.index === 1 ? (rnd() < 0.55 ? 2 : 1)
      : (rnd() < 0.22 ? 3 : 2);
  n = Math.min(3, n);
  const depth = col / Math.max(1, act.cols - 1);
  // 三卷的群怪更收敛：3 怪是少数情况，且整体缩放更低
  const base = act.index === 2 ? (0.66 + depth * 0.14) : (0.74 + depth * 0.18);
  const groupMul = n > 1 ? (act.index === 2 ? 0.82 : 0.86) : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: pick(act.pool), scale: base * groupMul });
  }
  if (act.index >= 1 && n === 3 && rnd() < (act.index === 2 ? 0.12 : 0.3)) {
    out[2] = { id: pick(act.elite), scale: 0.55 };
  }
  return out;
}

export const NODE_LABEL = {
  battle: '遭遇', elite: '精英', boss: '守卷之兽',
  event: '际遇', shop: '鬼市', rest: '歇脚', treasure: '拾遗',
  page: '残页'
};
