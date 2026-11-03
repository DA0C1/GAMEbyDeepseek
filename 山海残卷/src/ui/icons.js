/* 程序化图标：在 100x100 坐标系内绘制，可任意缩放 */

export function drawIcon(ctx, name, cx, cy, size, color, lineScale = 1) {
  const s = size / 100;
  ctx.save();
  // 图标本身在 0~100 坐标系内，需平移到以 (cx,cy) 为中心
  ctx.translate(cx - 50 * s, cy - 50 * s);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  const L = (pts, w) => {
    ctx.lineWidth = (w || 4) * lineScale;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  const Q = (pts, w) => {
    ctx.lineWidth = (w || 4) * lineScale;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i += 2) {
      const end = pts[i + 1] || pts[pts.length - 1];
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], end[0], end[1]);
    }
    ctx.stroke();
  };
  const P = (pts, w) => {
    ctx.lineWidth = (w || 4) * lineScale;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
  };
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

  switch (name) {
    case 'sword':
      // 剑身：带尖的菱形轮廓
      L([[50, 5], [57, 23], [57, 66], [43, 66], [43, 23], [50, 5]], 3.4);
      // 护手
      L([[25, 66], [75, 66]], 5);
      // 剑柄
      L([[50, 66], [50, 84]], 6.5);
      dot(50, 89, 5.5);
      break;
    case 'blade':
      Q([[20, 86], [40, 42], [80, 12]], 5);
      Q([[26, 78], [46, 46], [74, 22]], 3);
      L([[28, 72], [44, 58]], 3);
      break;
    case 'fire':
      Q([[50, 90], [22, 58], [36, 32]], 5);
      Q([[50, 90], [74, 56], [58, 26]], 5);
      Q([[50, 76], [38, 54], [50, 28], [62, 54], [50, 76]], 3);
      dot(50, 58, 5);
      break;
    case 'thunder':
      L([[60, 6], [34, 46], [52, 46], [40, 92]], 5);
      L([[62, 12], [46, 42]], 2);
      break;
    case 'frost':
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        L([[50 - Math.cos(a) * 40, 50 - Math.sin(a) * 40], [50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40]], 4);
      }
      dot(50, 50, 7);
      break;
    case 'poison':
      P([[50, 16], [24, 52], [50, 88], [76, 52]], 4);
      dot(42, 48, 5);
      dot(58, 62, 4);
      break;
    case 'shield':
      P([[50, 10], [22, 26], [26, 60], [50, 90], [74, 60], [78, 26]], 5);
      L([[50, 30], [50, 68]], 3);
      break;
    case 'wall':
      for (let r = 0; r < 3; r++) L([[16, 30 + r * 20], [84, 30 + r * 20]], 4);
      L([[38, 30], [38, 50]], 4);
      L([[62, 50], [62, 70]], 4);
      L([[42, 70], [42, 90]], 4);
      break;
    case 'cloud':
      Q([[18, 62], [28, 40], [50, 44], [58, 24], [78, 34], [82, 54], [64, 66], [38, 68], [18, 62]], 4);
      Q([[30, 78], [50, 72], [70, 78]], 3);
      break;
    case 'eye':
      Q([[14, 52], [50, 24], [86, 52], [50, 80], [14, 52]], 4);
      dot(50, 52, 11);
      break;
    case 'heart':
      Q([[50, 84], [20, 54], [26, 30], [44, 30], [50, 44], [56, 30], [74, 30], [80, 54], [50, 84]], 4);
      break;
    case 'skull':
      Q([[50, 12], [22, 32], [26, 62], [38, 72], [38, 88], [62, 88], [62, 72], [74, 62], [76, 32], [50, 12]], 4);
      dot(40, 46, 7); dot(60, 46, 7);
      L([[50, 56], [50, 66]], 3);
      break;
    case 'talisman':
      ctx.lineWidth = 4 * lineScale;
      ctx.strokeRect(28, 8, 44, 84);
      L([[50, 22], [50, 78]], 3);
      L([[36, 34], [64, 34]], 3);
      L([[38, 52], [62, 52]], 3);
      L([[42, 68], [58, 68]], 3);
      break;
    case 'snake':
      Q([[22, 80], [68, 78], [36, 56], [70, 38], [44, 20]], 5);
      dot(44, 18, 5);
      break;
    case 'claw':
      Q([[24, 82], [38, 50], [32, 22]], 4);
      Q([[42, 82], [50, 46], [46, 16]], 4);
      Q([[60, 82], [66, 50], [64, 20]], 4);
      break;
    case 'feather':
      Q([[50, 10], [26, 48], [50, 90]], 4);
      Q([[50, 10], [74, 48], [50, 90]], 4);
      L([[50, 18], [50, 82]], 2);
      break;
    case 'mountain':
      L([[10, 82], [36, 30], [50, 54], [66, 22], [90, 82]], 4);
      L([[10, 82], [90, 82]], 3);
      break;
    case 'moon':
      // 月牙：外弧 + 内弧围成闭合区，实心填充（不用 destination-out，避免擦穿底图）
      ctx.beginPath();
      ctx.arc(50, 50, 34, Math.PI * 0.36, Math.PI * 1.64, false);
      ctx.arc(66, 50, 30, Math.PI * 1.64, Math.PI * 0.36, true);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.4 * lineScale;
      ctx.stroke();
      break;
    case 'water':
      Q([[12, 38], [34, 28], [50, 38], [66, 28], [88, 38]], 3);
      Q([[12, 58], [34, 48], [50, 58], [66, 48], [88, 58]], 3);
      Q([[12, 78], [34, 68], [50, 78], [66, 68], [88, 78]], 3);
      break;
    case 'wind':
      // 三道气流，右端卷起，避免看起来像两条横线
      Q([[8, 36], [42, 30], [64, 36], [78, 24], [62, 16]], 4.4);
      Q([[16, 54], [50, 46], [72, 54]], 3.6);
      Q([[10, 72], [44, 66], [62, 74], [58, 86], [44, 80]], 3.6);
      break;
    case 'gourd':
      ctx.beginPath(); ctx.arc(50, 32, 15, 0, Math.PI * 2); ctx.lineWidth = 4 * lineScale; ctx.stroke();
      ctx.beginPath(); ctx.arc(50, 66, 24, 0, Math.PI * 2); ctx.stroke();
      L([[50, 10], [50, 18]], 4);
      break;
    case 'needle':
      L([[22, 80], [78, 22]], 5);
      dot(80, 20, 4);
      L([[62, 38], [76, 52]], 3);
      break;
    case 'chain':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(32 + i * 18, 50 + (i % 2 ? -10 : 10), 12, 18, 0, 0, Math.PI * 2);
        ctx.lineWidth = 3.5 * lineScale; ctx.stroke();
      }
      break;
    case 'lotus':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        Q([[50, 84], [50 + Math.cos(a) * 16, 54], [50 + Math.cos(a) * 36, 22]], 3.5);
      }
      L([[22, 86], [78, 86]], 3);
      break;
    case 'bell':
      Q([[50, 10], [26, 34], [24, 64], [76, 64], [74, 34], [50, 10]], 4);
      L([[18, 72], [82, 72]], 5);
      dot(50, 82, 6);
      break;
    case 'seal':
      ctx.lineWidth = 4 * lineScale;
      ctx.strokeRect(22, 22, 56, 56);
      L([[50, 34], [50, 66]], 4);
      L([[34, 50], [66, 50]], 4);
      break;
    case 'star':
      // 八芒星
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 41 : 14;
        const x = 50 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = 3 * lineScale;
      ctx.stroke();
      dot(50, 50, 6);
      break;
    case 'taiji':
      // 外圆
      ctx.beginPath(); ctx.arc(50, 50, 36, 0, Math.PI * 2);
      ctx.lineWidth = 3.6 * lineScale; ctx.stroke();
      // 中间 S 曲线：右半圆下到中心，再左半圆下到底
      ctx.beginPath();
      ctx.moveTo(50, 14);
      ctx.arc(50, 32, 18, -Math.PI / 2, Math.PI / 2, false);
      ctx.arc(50, 68, 18, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineWidth = 3.2 * lineScale; ctx.stroke();
      // 阴阳眼
      dot(50, 32, 4.6);
      dot(50, 68, 4.6);
      break;
    case 'coin':
      ctx.beginPath(); ctx.arc(50, 50, 30, 0, Math.PI * 2); ctx.lineWidth = 4 * lineScale; ctx.stroke();
      ctx.strokeRect(40, 40, 20, 20);
      break;
    default:
      ctx.beginPath(); ctx.arc(50, 50, 26, 0, Math.PI * 2); ctx.lineWidth = 4 * lineScale; ctx.stroke();
  }
  ctx.restore();
}
