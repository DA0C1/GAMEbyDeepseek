import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD } from '../src/core/config.js';
import { CARDS, cardText } from '../src/data/cards.js';
import { ensureCardTexture } from '../src/ui/cardRender.js';

// Test-local Canvas instrumentation, not a browser or pixel-render assertion.
// CJK glyphs/punctuation use a full em; Latin, numbers and spaces are narrower.
// A second, slightly wider CJK profile guards against font fallback variation.
function textWidth(text, font, cjkScale = 1) {
  const size = Number(font.match(/([\d.]+)px/)?.[1] || 10);
  const bold = Number(font.match(/^\d+/)?.[0] || 400) >= 700;
  return [...String(text)].reduce((width, ch) => {
    let em;
    if (/\s/u.test(ch)) em = 0.28;
    else if (/[\u2e80-\ua4cf\uac00-\ud7ff\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(ch)) em = cjkScale;
    else if (/[0-9]/.test(ch)) em = 0.56;
    else if (/[A-Z]/.test(ch)) em = 0.65;
    else if (/[a-z]/.test(ch)) em = 0.55;
    else em = 0.4;
    const weight = bold && em < 1 ? 1.03 : 1;
    return width + size * em * weight;
  }, 0);
}

function captureCanvas(cjkScale) {
  const textures = new Map();
  return {
    captured: textures,
    textures: {
      exists: key => textures.has(key),
      createCanvas(key, width, height) {
        assert.equal(width, CARD.texW);
        assert.equal(height, CARD.texH);
        const writes = [], stack = [];
        let state = { font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1 };
        const context = new Proxy({}, {
          get(_target, name) {
            if (name in state) return state[name];
            if (name === 'save') return () => stack.push({ ...state });
            if (name === 'restore') return () => { state = stack.pop() || state; };
            if (name === 'measureText') return text => ({ width: textWidth(text, state.font, cjkScale) });
            if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (name === 'fillText') return (text, x, y) => writes.push({
              text: String(text), x, y, ...state,
              width: textWidth(text, state.font, cjkScale),
              size: Number(state.font.match(/([\d.]+)px/)?.[1])
            });
            return () => {};
          },
          set(_target, name, value) { state[name] = value; return true; }
        });
        textures.set(key, writes);
        return { getContext: () => context, refresh() {} };
      }
    }
  };
}

function captureDescription(scene, card) {
  const key = ensureCardTexture(scene, card);
  return scene.captured.get(key).filter(write => write.textBaseline === 'top' && write.textAlign === 'left');
}

test('all base and upgraded descriptions preserve their full text within the card description area', () => {
  const failures = [];
  let checked = 0;
  for (const cjkScale of [1, 1.04]) {
    const scene = captureCanvas(cjkScale);
    for (const [id, def] of Object.entries(CARDS)) {
      for (const up of [false, true]) {
        const card = { id, def, up }, label = `${id}${up ? '+' : ''} (CJK ${cjkScale}em)`;
        const before = JSON.stringify(card);
        const writes = captureDescription(scene, card);
        assert.equal(writes.map(write => write.text).join(''), cardText(card).replace(/\n/g, ''), `${label}: no text may be truncated`);
        assert.equal(JSON.stringify(card), before, `${label}: layout must not mutate the card`);
        assert.ok(writes.length > 0, `${label}: description was drawn`);
        const minX = Math.min(...writes.map(write => write.x));
        const maxX = Math.max(...writes.map(write => write.x + write.width));
        const minY = Math.min(...writes.map(write => write.y));
        const maxY = Math.max(...writes.map(write => write.y + write.size));
        const sizes = new Set(writes.map(write => write.size));
        assert.equal(sizes.size, 1, `${label}: colored keywords and numbers must share the body font size`);
        assert.ok([...sizes][0] >= 16 && [...sizes][0] <= 23, `${label}: retain readable body type`);
        if (minX < 26 - 1e-6 || maxX > CARD.texW - 26 + 1e-6 || minY < 292 || maxY > CARD.texH - 30) {
          failures.push(`${label}: x=[${minX.toFixed(1)},${maxX.toFixed(1)}], y=[${minY.toFixed(1)},${maxY.toFixed(1)}]`);
        }
        const lineYs = [...new Set(writes.map(write => write.y))];
        for (let line = 1; line < lineYs.length; line++) {
          assert.ok(lineYs[line] - lineYs[line - 1] >= [...sizes][0], `${label}: text lines must not overlap`);
        }
        checked++;
      }
    }
  }
  assert.equal(checked, Object.keys(CARDS).length * 4);
  assert.deepEqual(failures, [], `${failures.length} card faces exceed the description area:\n${failures.join('\n')}`);
});

test('short card descriptions retain 23px text and keyword/numeric emphasis', () => {
  const scene = captureCanvas(1);
  for (const id of ['cijian', 'yufeng', 'guanxiang']) {
    for (const up of [false, true]) {
      const card = { id, def: CARDS[id], up }, writes = captureDescription(scene, card);
      assert.ok(writes.every(write => write.size === 23), `${id}${up ? '+' : ''}: do not shrink short text`);
      for (const write of writes.filter(write => /^[0-9+\-]+$/.test(write.text))) {
        assert.match(write.font, /^700 /, 'numbers retain bold emphasis');
        assert.equal(write.fillStyle, '#b23a2e', 'numbers retain cinnabar color');
      }
      if (id === 'yufeng') assert.equal(writes.find(write => write.text === '护甲')?.fillStyle, '#2f6b8a');
      if (id === 'guanxiang') assert.equal(writes.find(write => write.text === '抽')?.fillStyle, '#b98f3f');
    }
  }
});
