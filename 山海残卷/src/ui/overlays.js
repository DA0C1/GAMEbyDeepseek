/* 全屏浮层：牌组 / 法宝 / 残页 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { audio } from '../core/audio.js';
import { CARDS, upgradeDiff } from '../data/cards.js';
import { RELICS } from '../data/relics.js';
import { ensureCardTexture } from './cardRender.js';
import { drawIcon } from './icons.js';
import { text, makeButton } from './widgets.js';

const OVERLAY_BG = 0x0d0b08;

function hex(color) {
  return Phaser.Display.Color.HexStringToColor(color).color;
}

/* 浮层内的按钮：图形 + 文字 + 命中区一起加入图层 */
function layerButton(scene, layer, x, y, w, h, label, onClick, opt = {}) {
  const g = scene.add.graphics();
  const t = scene.add.text(x + w / 2, y + h / 2, label, {
    fontFamily: opt.font || FONT.song,
    fontSize: (opt.size || 18) + 'px',
    color: '#f3ecdc'
  }).setOrigin(0.5);
  const z = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  layer.add([g, t, z]);

  const paint = (hover) => {
    g.clear();
    g.fillStyle(hover ? 0x3a3228 : 0x241f18, hover ? 0.95 : 0.7);
    g.fillRoundedRect(x, y, w, h, 3);
    g.lineStyle(1.2, hover ? 0xb98f3f : 0x6d6152, hover ? 0.9 : 0.5);
    g.strokeRoundedRect(x, y, w, h, 3);
    t.setColor(hover ? PAL.goldLight : '#cabfa9');
  };
  paint(false);
  z.on('pointerover', () => { paint(true); audio.sfx('hover'); });
  z.on('pointerout', () => paint(false));
  z.on('pointerdown', (_pointer, _x, _y, event) => {
    event.stopPropagation();
    audio.sfx('click');
    onClick();
  });
  return { paint };
}

/**
 * 打开浮层
 * cfg: { kind: 'cards'|'relics', cards?: [], relics?: [], onClose? }
 */
export function openOverlay(scene, cfg) {
  const layer = scene.add.container(0, 0).setDepth(DEPTH.overlay + 10);
  let page = 0;

  // 遮罩
  const bg = scene.add.graphics();
  bg.fillStyle(OVERLAY_BG, 0.985);
  bg.fillRect(0, 0, W, H);
  layer.add(bg);

  // 吞掉所有点击
  const blocker = scene.add.zone(W / 2, H / 2, W, H).setInteractive();
  blocker.on('pointerdown', (_pointer, _x, _y, event) => event.stopPropagation());
  blocker.on('pointerup', (_pointer, _x, _y, event) => event.stopPropagation());
  layer.add(blocker);

  // 边框装帧
  const frame = scene.add.graphics();
  frame.lineStyle(1, 0xb98f3f, 0.22);
  frame.strokeRect(40, 40, W - 80, H - 80);
  frame.lineStyle(1, 0xb98f3f, 0.12);
  frame.strokeRect(48, 48, W - 96, H - 96);
  layer.add(frame);

  const isCards = cfg.kind === 'cards';
  const items = isCards ? (cfg.cards || []) : (cfg.relics || []);

  const titleT = scene.add.text(W / 2, 72, isCards ? '牌　组' : '法　宝', {
    fontFamily: FONT.song, fontSize: '38px', color: '#f6efdf'
  }).setOrigin(0.5);
  const subT = scene.add.text(W / 2, 112,
    isCards ? `共 ${items.length} 张` : `共 ${items.length} 件 · 皆为被动生效`,
    { fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(202,191,169,0.7)' }).setOrigin(0.5);
  layer.add([titleT, subT]);

  const content = scene.add.container(0, 0);
  layer.add(content);

  /* ---------- 渲染主体 ---------- */
  let pages = 1;
  let pageLabel = null;

  const renderCards = () => {
    const cols = 8, rows = 3;
    const per = cols * rows;
    pages = Math.max(1, Math.ceil(items.length / per));
    page = Math.min(page, pages - 1);

    const cw = 150, ch = 210, gapX = 16, gapY = 16;
    const totalW = cols * cw + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 148;

    const slice = items.slice(page * per, page * per + per);
    slice.forEach((card, i) => {
      const def = card.def || CARDS[card.id];
      if (!def) return;
      const probe = { ...card, def };
      const key = ensureCardTexture(scene, probe);
      const cx = startX + (i % cols) * (cw + gapX) + cw / 2;
      const cy = startY + Math.floor(i / cols) * (ch + gapY) + ch / 2;
      const img = scene.add.image(cx, cy, key).setDisplaySize(cw, ch);
      content.add(img);
    });
  };

  const renderRelics = () => {
    const cols = 2;
    const per = 8;
    pages = Math.max(1, Math.ceil(items.length / per));
    page = Math.min(page, pages - 1);

    const iw = 660, ih = 148, gapX = 40, gapY = 18;
    const startX = (W - (cols * iw + gapX)) / 2;
    const startY = 158;
    const slice = items.slice(page * per, page * per + per);

    slice.forEach((rid, i) => {
      const def = RELICS[rid];
      if (!def) return;
      const x = startX + (i % cols) * (iw + gapX);
      const y = startY + Math.floor(i / cols) * (ih + gapY);

      const g = scene.add.graphics();
      g.fillStyle(0xf7efdd, 0.06);
      g.fillRoundedRect(x, y, iw, ih, 4);
      g.lineStyle(1, 0xb98f3f, 0.24);
      g.strokeRoundedRect(x, y, iw, ih, 4);
      // 左侧朱砂竖线
      g.fillStyle(0xb23a2e, 0.7);
      g.fillRect(x, y + 16, 2, ih - 32);

      // 图标
      const iconCv = scene.textures.exists('relic_' + rid) ? null : null;
      const ig = scene.add.graphics();
      ig.fillStyle(0x241f18, 0.9);
      ig.fillCircle(x + 62, y + ih / 2, 34);
      ig.lineStyle(1.2, 0xb98f3f, 0.55);
      ig.strokeCircle(x + 62, y + ih / 2, 34);
      content.add(ig);

      const iconKey = 'ri_' + rid + '_' + (def.icon || 'star');
      if (!scene.textures.exists(iconKey)) {
        const tex = scene.textures.createCanvas(iconKey, 120, 120);
        if (tex) {
          const ictx = tex.getContext();
          drawIcon(ictx, def.icon || 'star', 60, 60, 68, '#e2c489', 1.5);
          tex.refresh();
        }
      }
      if (scene.textures.exists(iconKey)) {
        const im = scene.add.image(x + 62, y + ih / 2, iconKey).setDisplaySize(68, 68);
        content.add(im);
      }

      const nameT = scene.add.text(x + 118, y + 26, def.name, {
        fontFamily: FONT.song, fontSize: '26px', color: '#f3ecdc'
      });
      const descT = scene.add.text(x + 118, y + 68, def.desc, {
        fontFamily: FONT.hei, fontSize: '16px', color: 'rgba(202,191,169,0.86)',
        wordWrap: { width: iw - 150 }, lineSpacing: 6
      });
      content.add([nameT, descT]);
    });
  };

  const render = () => {
    content.removeAll(true);
    if (isCards) renderCards(); else renderRelics();
    if (pageLabel) pageLabel.setText(`${page + 1} / ${pages}`);
  };

  render();

  /* ---------- 分页 ---------- */
  if (pages > 1) {
    const py = H - 76;
    layerButton(scene, layer, W / 2 - 150, py, 76, 40, '‹', () => {
      page = (page - 1 + pages) % pages;
      render();
    }, { size: 24 });
    pageLabel = scene.add.text(W / 2, py + 20, `${page + 1} / ${pages}`, {
      fontFamily: FONT.mono, fontSize: '17px', color: '#cabfa9'
    }).setOrigin(0.5);
    layer.add(pageLabel);
    layerButton(scene, layer, W / 2 + 74, py, 76, 40, '›', () => {
      page = (page + 1) % pages;
      render();
    }, { size: 24 });
  } else {
    // 占位，保持 render 内引用安全
    pageLabel = null;
  }

  /* ---------- 关闭 ---------- */
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    layer.destroy(true);
    if (cfg.onClose) cfg.onClose();
  };
  layerButton(scene, layer, W - 230, 62, 148, 44, '关闭 ×', close, { size: 19 });
  layerButton(scene, layer, W - 230, H - 76, 148, 44, '返回游戏', close, { size: 18 });
  layer.add(scene.add.text(W / 2, H - 16, '按 ESC 或点击「关闭 ×」「返回游戏」退出', {
    fontFamily: FONT.hei, fontSize: '14px', color: '#cabfa9'
  }).setOrigin(0.5));

  return { close, layer };
}


/**
 * 从牌组中挑一张牌：用于升级 / 铭刻 / 移除
 * cfg: { cards, title, subtitle, filter(card)->bool, onPick(card), onCancel }
 */
export function pickCard(scene, cfg) {
  const layer = scene.add.container(0, 0).setDepth(DEPTH.overlay + 20);
  const cards = (cfg.cards || []).filter((c) => !cfg.filter || cfg.filter(c));

  const bg = scene.add.graphics();
  bg.fillStyle(OVERLAY_BG, 0.985);
  bg.fillRect(0, 0, W, H);
  layer.add(bg);
  const blocker = scene.add.zone(W / 2, H / 2, W, H).setInteractive();
  layer.add(blocker);

  const frame = scene.add.graphics();
  frame.lineStyle(1, 0xb98f3f, 0.24);
  frame.strokeRect(40, 40, W - 80, H - 80);
  layer.add(frame);

  const t1 = scene.add.text(W / 2, 76, cfg.title || '择 一 张', {
    fontFamily: FONT.song, fontSize: '36px', color: '#f6efdf'
  }).setOrigin(0.5);
  const t2 = scene.add.text(W / 2, 116, cfg.subtitle || '', {
    fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(202,191,169,0.72)'
  }).setOrigin(0.5);
  layer.add([t1, t2]);

  let page = 0;
  const cols = 8, rows = 2, per = cols * rows;
  const pages = Math.max(1, Math.ceil(cards.length / per));
  const content = scene.add.container(0, 0);
  layer.add(content);
  let pageT = null;

  const showUp = !!cfg.upgradePreview;
  const render = () => {
    content.removeAll(true);
    // 升级预览要腾出一行写「伤害 6 → 9」，卡面略缩
    const cw = showUp ? 150 : 168;
    const ch = showUp ? 210 : 236;
    const gapX = showUp ? 14 : 16;
    const gapY = showUp ? 58 : 22;
    const totalW = cols * cw + (cols - 1) * gapX;
    const sx = (W - totalW) / 2;
    const sy = showUp ? 156 : 168;
    const slice = cards.slice(page * per, page * per + per);

    slice.forEach((card, i) => {
      const def = card.def || CARDS[card.id];
      if (!def) return;
      const probe = { id: card.id, up: card.up, def, rune: card.rune };
      const key = ensureCardTexture(scene, probe);
      const cx = sx + (i % cols) * (cw + gapX) + cw / 2;
      const cy = sy + Math.floor(i / cols) * (ch + gapY) + ch / 2;
      const img = scene.add.image(cx, cy, key).setDisplaySize(cw, ch);
      content.add(img);

      if (showUp) {
        const diffs = upgradeDiff(card);
        if (diffs.length) {
          const lines = diffs.map((d) => `${d.label} ${d.from} → ${d.to}`);
          const dt = scene.add.text(cx, cy + ch / 2 + 13, lines.join('\n'), {
            fontFamily: FONT.hei, fontSize: '13px', color: '#ecd3a1',
            align: 'center', lineSpacing: 4, wordWrap: { width: cw + 34 }
          }).setOrigin(0.5, 0);
          content.add(dt);
        }
      }

      const z = scene.add.zone(cx - cw / 2, cy - ch / 2, cw, ch).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      content.add(z);
      z.on('pointerover', () => {
        img.setScale(img.scaleX * 1.06, img.scaleY * 1.06);
        audio.sfx('hover');
      });
      z.on('pointerout', () => img.setScale(cw / img.width, ch / img.height));
      z.on('pointerdown', () => {
        audio.sfx('click');
        layer.destroy(true);
        if (cfg.onPick) cfg.onPick(card);
      });
    });

    if (pageT) pageT.setText(`${page + 1} / ${pages}`);
  };

  if (cards.length === 0) {
    const empty = scene.add.text(W / 2, H / 2, cfg.emptyText || '没有可选的符箓', {
      fontFamily: FONT.hei, fontSize: '20px', color: 'rgba(202,191,169,0.7)'
    }).setOrigin(0.5);
    layer.add(empty);
  }

  render();

  if (pages > 1) {
    const py = H - 152;
    layerButton(scene, layer, W / 2 - 160, py, 76, 40, '‹', () => {
      page = (page - 1 + pages) % pages; render();
    }, { size: 24 });
    pageT = scene.add.text(W / 2, py + 18, `${page + 1} / ${pages}`, {
      fontFamily: FONT.mono, fontSize: '17px', color: '#cabfa9'
    }).setOrigin(0.5);
    layer.add(pageT);
    layerButton(scene, layer, W / 2 + 84, py, 76, 40, '›', () => {
      page = (page + 1) % pages; render();
    }, { size: 24 });
  }

  const cancel = () => {
    layer.destroy(true);
    if (cfg.onCancel) cfg.onCancel();
  };
  layerButton(scene, layer, W / 2 - 80, H - 76, 160, 44, '作　罢', cancel, { size: 19 });

  return { close: cancel, layer };
}

/* ==========================================================
   要诀速查
   ========================================================== */
const RULES = [
  {
    title: '出　牌',
    lines: [
      '起手抽 5 张，每回合 3 点灵力（破一卷 +1）。',
      '点牌再点敌人，或把牌直接拖到目标身上。',
      '护甲回合结束清零，灵力不累积。',
      '左上三格是药水：点击即用，不占灵力。'
    ]
  },
  {
    title: '意　图',
    lines: [
      '异兽头顶的图标，是它下回合要做的事。',
      '数字即伤害，盾形是格挡，箭头是增益。',
      '先看清意图，再决定是挡还是抢攻。'
    ]
  },
  {
    title: '五　行',
    lines: [
      '三张同属相连即「成势」：金群伤、木群毒、',
      '水护甲、火群烧、土抽牌。',
      '·顺相生链出牌（金→水→木→火→土），抽 1 张，',
      '·每回合至多 2 次。',
      '克异兽之属 ×1.3，被其所克 ×0.9，悬停可预览。'
    ]
  },
  {
    title: '异　兽',
    lines: [
      '多数异兽带专属特性，逼你换解法。',
      '反噬弹伤、闪身落空、免疫让你整套失效。',
      '特性写在名字下方，朱砂小字。'
    ]
  },
  {
    title: '铭　刻',
    lines: [
      '歇脚处可为一张符箓刻一道篆文。',
      '锋 +3 伤 · 轻 −1 费 · 护 +4 甲',
      '迅 抽一 · 回 回手 · 蚀 附毒',
      '刻什么，决定这张牌在牌组里的角色。'
    ]
  },
  {
    title: '法　宝',
    lines: [
      '三十六件法宝分六套，被动生效。',
      '剑意 / 焚天 / 蚀骨 / 不动 / 通玄 / 镇印',
      '集齐同套三件触发共鸣——最稳的强度来源。'
    ]
  }
];

export function openRules(scene, opt = {}) {
  const layer = scene.add.container(0, 0).setDepth(opt.depth || (DEPTH.overlay + 10));

  // 纸面底：与全局浅色水墨保持一致，不做夜间黑板
  const bg = scene.add.graphics();
  bg.fillStyle(0xf4ecdb, 0.995);
  bg.fillRect(0, 0, W, H);
  bg.fillStyle(0xe3d5ba, 0.5);
  bg.fillRect(0, 0, W, 96);
  bg.fillStyle(0x1d1a17, 0.05);
  bg.fillRect(0, 96, W, 1);
  layer.add(bg);

  const blocker = scene.add.zone(W / 2, H / 2, W, H).setInteractive();
  layer.add(blocker);

  const frame = scene.add.graphics();
  frame.lineStyle(1, 0x1d1a17, 0.16);
  frame.strokeRect(40, 40, W - 80, H - 80);
  frame.lineStyle(2, 0xb23a2e, 0.45);
  [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]]
    .forEach(([x, y, sx, sy]) => {
      frame.beginPath(); frame.moveTo(x, y); frame.lineTo(x + 26 * sx, y); frame.strokePath();
      frame.beginPath(); frame.moveTo(x, y); frame.lineTo(x, y + 26 * sy); frame.strokePath();
    });
  layer.add(frame);

  const t1 = scene.add.text(W / 2, 88, '要　诀', {
    fontFamily: FONT.song, fontSize: '38px', color: '#1d1a17'
  }).setOrigin(0.5);
  t1.setShadow(0, 3, 'rgba(60,44,26,0.18)', 8, false, true);
  const t2 = scene.add.text(W / 2, 134, '六件事，知道就能活久一点', {
    fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(58,52,44,0.66)'
  }).setOrigin(0.5);
  layer.add([t1, t2]);

  const colW = 486;
  const cols = [W / 2 - colW - 20, W / 2 + 20];
  const rowY = [168, 358, 548];
  const rowH = 180;
  const NUMERALS = ['一', '二', '三', '四', '五', '六'];

  RULES.forEach((rule, i) => {
    const cx = cols[i % 2];
    const cy = rowY[Math.floor(i / 2)];

    const g = scene.add.graphics();
    g.fillStyle(0x2a2118, 0.05);
    g.fillRoundedRect(cx + 3, cy + 4, colW, rowH, 4);
    g.fillStyle(0xfdf9ef, 0.94);
    g.fillRoundedRect(cx, cy, colW, rowH, 4);
    g.lineStyle(1, 0x1d1a17, 0.2);
    g.strokeRoundedRect(cx, cy, colW, rowH, 4);
    // 左侧朱砂书脊
    g.fillStyle(0xb23a2e, 0.9);
    g.fillRect(cx, cy + 18, 3, 30);
    layer.add(g);

    const num = scene.add.text(cx + colW - 26, cy + 16, NUMERALS[i], {
      fontFamily: FONT.song, fontSize: '30px', color: 'rgba(29,26,23,0.1)'
    }).setOrigin(1, 0);
    const title = scene.add.text(cx + 22, cy + 20, rule.title, {
      fontFamily: FONT.song, fontSize: '22px', color: '#1d1a17'
    });
    layer.add([num, title]);

    let ly = cy + 58;
    rule.lines.forEach((ln) => {
      const emph = ln.charAt(0) === '·';
      const t = scene.add.text(cx + 22, ly, emph ? ln.slice(1) : ln, {
        fontFamily: FONT.hei, fontSize: '14px',
        color: emph ? 'rgba(139,42,32,0.92)' : 'rgba(58,52,44,0.82)',
        wordWrap: { width: colW - 44 }, lineSpacing: 4
      });
      layer.add(t);
      ly += t.height + 5;
    });
  });

  const tip = scene.add.text(W / 2, H - 122,
    '五行相生：金生水 · 水生木 · 木生火 · 火生土 · 土生金　　相克：金克木 · 木克土 · 土克水 · 水克火 · 火克金', {
      fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(58,52,44,0.6)'
    }).setOrigin(0.5);
  layer.add(tip);

  const close = () => {
    layer.destroy(true);
    if (opt.onClose) opt.onClose();
  };
  const okBtn = makeButton(scene, W / 2 - 90, H - 104, 180, 48, '知　道　了', close,
    { size: 18, font: FONT.song, depth: DEPTH.overlay + 12 });
  layer.add(okBtn);

  return { close, layer };
}
