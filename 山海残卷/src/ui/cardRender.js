/* 卡牌纹理：一次性绘制到 CanvasTexture，运行时只做变换 */

import { CARD, FONT } from '../core/config.js';
import { CARDS, cardName, cardText } from '../data/cards.js';
import { RUNES } from '../data/runes.js';
import { ELEMENTS, elOf } from '../data/elements.js';
import { drawIcon } from './icons.js';

export const RARITY = {
  basic: { edge: '#8a7e6c', band: '#8a7e6c', glow: 'rgba(138,126,108,0.30)', label: '' },
  common: { edge: '#4a4038', band: '#4a4038', glow: 'rgba(74,64,56,0.22)', label: '' },
  uncommon: { edge: '#2f6b8a', band: '#2f6b8a', glow: 'rgba(47,107,138,0.30)', label: '青' },
  rare: { edge: '#b98f3f', band: '#b98f3f', glow: 'rgba(185,143,63,0.42)', label: '金' },
  curse: { edge: '#6b2b2b', band: '#5a2a24', glow: 'rgba(107,43,43,0.34)', label: '咒' }
};

const TYPE_COLOR = {
  attack: '#b23a2e',
  skill: '#2f6b8a',
  power: '#b98f3f',
  curse: '#5a2a24'
};
const TYPE_LABEL = { attack: '攻', skill: '术', power: '法', curse: '咒' };

/* 描述里的关键词配色：按流派区分，长词优先 */
const KEYWORDS = [
  ['灼烧', '#b23a2e'], ['中毒', '#41694a'], ['易伤', '#8b2a20'],
  ['虚弱', '#6d6152'], ['力量', '#b23a2e'], ['敏捷', '#41694a'],
  ['护甲', '#2f6b8a'], ['灵力', '#b98f3f'], ['抽', '#b98f3f'],
  ['消耗', '#6d6152'], ['荆棘', '#5c5347'], ['反击', '#b23a2e'],
  ['中毒层数', '#41694a'], ['生命', '#8b2a20'], ['最大生命', '#8b2a20'],
  ['每回合', '#b98f3f']
].sort((a, b) => b[0].length - a[0].length);

function kwColor(word) {
  for (const [k, c] of KEYWORDS) {
    if (word.indexOf(k) === 0) return c;
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* 以粗淡墨 + 细浓墨双描，模拟毛笔的墨韵 */
function inkIcon(ctx, name, cx, cy, size, color, weight) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  drawIcon(ctx, name, cx, cy + 2, size * 1.03, color, weight * 2.4);
  ctx.restore();
  ctx.save();
  drawIcon(ctx, name, cx, cy, size, color, weight);
  ctx.restore();
}

/* 不规则墨晕：一圈抖动的闭合曲线 */
function blot(ctx, cx, cy, r, seed, alpha, color) {
  const n = 26;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 3 + seed) * 0.09 + Math.sin(a * 5 - seed * 1.7) * 0.06;
    const x = cx + Math.cos(a) * r * wob;
    const y = cy + Math.sin(a) * r * wob * 0.94;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paint(ctx, card, displayCost) {
  const W = CARD.texW;
  const H = CARD.texH;
  const d = card.def;
  const rar = RARITY[d.rarity] || RARITY.common;
  const typeCol = TYPE_COLOR[d.type] || TYPE_COLOR.skill;
  const cx = W / 2;

  ctx.clearRect(0, 0, W, H);

  // ---------- 纸底 ----------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fdf9ef');
  bg.addColorStop(0.5, '#f8f0de');
  bg.addColorStop(1, '#ece0c8');
  roundRect(ctx, 2, 2, W - 4, H - 4, 10);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  roundRect(ctx, 2, 2, W - 4, H - 4, 10);
  ctx.clip();

  // 纸纹
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(122,100,66,0.045)' : 'rgba(255,255,255,0.055)';
    ctx.fillRect(x, y, Math.random() > 0.7 ? 2 : 1, 1);
  }
  // 纸纤维
  ctx.strokeStyle = 'rgba(120,98,64,0.05)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 22; i++) {
    const y = Math.random() * H;
    ctx.beginPath();
    ctx.moveTo(Math.random() * W * 0.4, y);
    ctx.lineTo(Math.random() * W * 0.4 + W * 0.6, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }

  // 顶部类型色带（渐变淡出）
  const band = ctx.createLinearGradient(0, 0, 0, 62);
  band.addColorStop(0, typeCol);
  band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = band;
  ctx.fillRect(2, 2, W - 4, 62);
  ctx.globalAlpha = 1;

  // 底部沉色
  const bot = ctx.createLinearGradient(0, H - 150, 0, H);
  bot.addColorStop(0, 'rgba(120,100,68,0)');
  bot.addColorStop(1, 'rgba(120,100,68,0.09)');
  ctx.fillStyle = bot;
  ctx.fillRect(2, H - 150, W - 4, 148);

  // 边缘暗角
  const vg = ctx.createRadialGradient(cx, H * 0.42, H * 0.28, cx, H * 0.5, H * 0.78);
  vg.addColorStop(0, 'rgba(90,72,44,0)');
  vg.addColorStop(1, 'rgba(90,72,44,0.11)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  // ---------- 边框 ----------
  // 外框（双线，古籍装帧感）
  ctx.strokeStyle = rar.edge;
  ctx.lineWidth = 2.6;
  ctx.globalAlpha = d.rarity === 'common' || d.rarity === 'basic' ? 0.55 : 0.85;
  roundRect(ctx, 3.5, 3.5, W - 7, H - 7, 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = rar.edge;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  roundRect(ctx, 9.5, 9.5, W - 19, H - 19, 7);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (d.rarity === 'rare') {
    // 金框
    ctx.strokeStyle = 'rgba(185,143,63,0.55)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, 15.5, 15.5, W - 31, H - 31, 5);
    ctx.stroke();
    // 四角云纹
    const corner = (x, y, fx, fy) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(fx, fy);
      ctx.strokeStyle = '#b98f3f';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.quadraticCurveTo(0, 0, 18, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, 20);
      ctx.quadraticCurveTo(5, 5, 20, 5);
      ctx.stroke();
      ctx.restore();
    };
    corner(22, 22, 1, 1);
    corner(W - 22, 22, -1, 1);
    corner(22, H - 22, 1, -1);
    corner(W - 22, H - 22, -1, -1);
  }

  // ---------- 名称 ----------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameStr = cardName(card);
  const nameSize = nameStr.length > 4 ? 34 : 40;
  ctx.font = `700 ${nameSize}px ${FONT.song}`;
  ctx.fillStyle = '#1e1a16';
  ctx.fillText(nameStr, cx + 3, 66);

  // ---------- 图标区 ----------
  const artY = 198;

  // 墨晕底：中心极淡的洇开
  const halo = ctx.createRadialGradient(cx, artY - 6, 8, cx, artY, 118);
  halo.addColorStop(0, 'rgba(60,52,40,0.055)');
  halo.addColorStop(0.55, 'rgba(60,52,40,0.03)');
  halo.addColorStop(1, 'rgba(60,52,40,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, artY - 130, W, 260);

  // 五行归属
  const elId = elOf(card);
  const el = elId ? ELEMENTS[elId] : null;

  // 细圆圈（极淡，像界画的月洞）
  ctx.save();
  ctx.strokeStyle = el ? el.color : 'rgba(90,78,60,0.16)';
  ctx.globalAlpha = el ? 0.30 : 1;
  ctx.lineWidth = el ? 1.4 : 1;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(cx, artY, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  inkIcon(ctx, d.icon, cx, artY, 172, '#201c17', 1.55);

  // 五行小字：压在圆顶
  if (el) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fdfaf3';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(cx, artY - 96, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = el.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = el.color;
    ctx.font = `700 19px ${FONT.song}`;
    ctx.fillText(el.name, cx, artY - 95);
    ctx.restore();
  }

  // ---------- 费用印 ----------
  // 轻铭刻 -1 费要烙进卡面，否则显示与实际扣费不一致；
  // X 费不吃轻铭刻（costOf 对 X 费直接返回全部灵力）
  let cost = card.free ? 0 : d.cost;
  if (cost >= 0 && card.rune === 'qing') cost = Math.max(0, cost - 1);
  if (Number.isFinite(displayCost) && displayCost >= 0 && d.cost >= 0) cost = displayCost;
  ctx.save();
  ctx.translate(44, 44);
  // 八角印章底
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const r = i % 2 === 0 ? 25 : 22;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const cg = ctx.createLinearGradient(-14, -14, 14, 14);
  if (d.rarity === 'curse') {
    cg.addColorStop(0, '#4a3a30');
    cg.addColorStop(1, '#2e241e');
  } else {
    cg.addColorStop(0, '#c65b4d');
    cg.addColorStop(1, '#8b2a20');
  }
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,248,236,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#fdfaf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (cost < 0) {
    // X 费：画一个略小的 X
    ctx.font = `800 30px ${FONT.mono}`;
    ctx.fillText('X', 0, 1);
  } else {
    ctx.font = `800 34px ${FONT.mono}`;
    ctx.fillText(String(cost), 0, 1);
  }
  ctx.restore();

  // X 费：印章下方补一行极小说明
  if (cost < 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(139,42,32,0.62)';
    ctx.font = `600 13px ${FONT.hei}`;
    ctx.textAlign = 'center';
    ctx.fillText('耗尽', 44, 82);
    ctx.restore();
  }

  // ---------- 类型角标 ----------
  ctx.save();
  ctx.translate(W - 42, 42);
  ctx.fillStyle = typeCol;
  ctx.globalAlpha = 0.82;
  ctx.font = `600 25px ${FONT.song}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TYPE_LABEL[d.type] || '', 0, 0);
  ctx.restore();

  // ---------- 描述区 ----------
  // 分隔线
  ctx.save();
  ctx.strokeStyle = 'rgba(90,78,60,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 290);
  ctx.lineTo(W - 34, 290);
  ctx.stroke();
  ctx.fillStyle = 'rgba(185,143,63,0.5)';
  ctx.beginPath();
  ctx.arc(cx, 290, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const txt = cardText(card);
  // 用最宽字重测量；长描述缩小字号，而不是挤到图案或底部标记上。
  const maxW = W - 52;
  const blockTop = 292, blockBottom = H - 30;
  let fontSize = 23, lineH = 32, lines = [];
  for (; fontSize >= 14; fontSize--) {
    ctx.font = `700 ${fontSize}px ${FONT.hei}`;
    lineH = Math.round(fontSize * 32 / 23);
    lines = [];
    let line = '';
    for (const ch of txt) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      if (ctx.measureText(line + ch).width > maxW && line !== '') { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    if (lines.length * lineH <= blockBottom - blockTop || fontSize === 14) break;
  }
  ctx.textBaseline = 'top';
  let ty = blockTop + (blockBottom - blockTop - lines.length * lineH) / 2;
  for (const ln of lines) {
    let lw = 0;
    ctx.font = `700 ${fontSize}px ${FONT.hei}`;
    for (const ch of ln) lw += ctx.measureText(ch).width;
    let tx = cx - lw / 2;

    ctx.textAlign = 'left';
    let i = 0;
    while (i < ln.length) {
      const rest = ln.slice(i);
      let matched = null;
      let matchedColor = null;
      for (const [k, col] of KEYWORDS) {
        if (rest.indexOf(k) === 0 && (!matched || k.length > matched.length)) {
          matched = k; matchedColor = col;
        }
      }
      if (matched) {
        ctx.font = `500 ${fontSize}px ${FONT.hei}`;
        ctx.fillStyle = matchedColor;
        ctx.fillText(matched, tx, ty);
        tx += ctx.measureText(matched).width;
        i += matched.length;
        continue;
      }
      const ch = ln[i];
      if (/[0-9+\-]/.test(ch)) {
        ctx.font = `700 ${fontSize}px ${FONT.hei}`;
        ctx.fillStyle = '#b23a2e';
      } else {
        ctx.font = `500 ${fontSize}px ${FONT.hei}`;
        ctx.fillStyle = '#3a342c';
      }
      ctx.fillText(ch, tx, ty);
      tx += ctx.measureText(ch).width;
      i++;
    }
    ty += lineH;
  }

  // ---------- 底部标记 ----------
  const marks = [];
  if (d.exhaust) marks.push('消耗');
  if (d.rarity === 'rare') marks.push('金');
  if (d.rarity === 'uncommon') marks.push('青');
  if (marks.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(90,78,60,0.5)';
    ctx.font = `500 17px ${FONT.hei}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(marks.join('  ·  '), cx, H - 22);
    ctx.restore();
  }

  // 已升级：右上角金印
  if (card.up) {
    ctx.save();
    ctx.translate(W - 30, 30);
    ctx.rotate(0.06);
    ctx.fillStyle = 'rgba(185,143,63,0.9)';
    ctx.fillRect(-15, -15, 30, 30);
    ctx.fillStyle = '#fdf9ef';
    ctx.font = `700 20px ${FONT.song}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('升', 0, 1);
    ctx.restore();
  }

  // 铭刻：右下角篆印
  const rune = card.rune ? RUNES[card.rune] : null;
  if (rune) {
    ctx.save();
    ctx.translate(W - 40, H - 40);
    ctx.fillStyle = rune.color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(253,250,243,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fdfaf3';
    ctx.font = `700 20px ${FONT.song}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rune.name, 0, 1);
    ctx.restore();
  }

  // 咒：整卡蒙一层暗
  if (d.rarity === 'curse') {
    ctx.save();
    roundRect(ctx, 2, 2, W - 4, H - 4, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(58,32,26,0.10)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

const cache = new Map();

export function ensureCardTexture(scene, card, displayCost) {
  let key = 'card_' + card.id + (card.up ? '_up' : '') + (card.rune ? '_' + card.rune : '') + (card.free ? '_free' : '');
  if (!card.def) {
    const d = CARDS[card.id];
    if (!d) return 'card_cijian';
    card = { ...card, def: d };
  }
  // 战斗费用只参与显示与纹理缓存，不写进逻辑卡牌或牌组/图鉴。
  const baseCost = card.free ? 0 : card.def.cost < 0 ? card.def.cost
    : Math.max(0, card.def.cost - (card.rune === 'qing' ? 1 : 0));
  if (Number.isFinite(displayCost) && displayCost >= 0 && card.def.cost >= 0 && displayCost !== baseCost) {
    key += '_cost' + displayCost;
  }
  if (cache.has(key) && scene.textures.exists(key)) return key;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, CARD.texW, CARD.texH);
    if (!tex) return 'card_cijian';
    paint(tex.getContext(), card, displayCost);
    tex.refresh();
  }
  cache.set(key, true);
  return key;
}
