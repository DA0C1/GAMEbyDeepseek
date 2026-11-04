/* AI 页的界面动作与浮层适配：不初始化 DOM，读取函数不修改场景。 */
import { CARDS, cardText } from '../data/cards.js';
import { RUNES } from '../data/runes.js';

const cardIdsByLength = Object.keys(CARDS).sort((a, b) => b.length - a.length);
const objectIds = new WeakMap();
let nextId = 1;

export function modalOf(scene) {
  return scene?._dialogue ? 'dialogue' : scene?._rules ? 'rules' : scene?._detail ? 'detail'
    : scene?._pauseLayer ? 'pause' : scene?._codex || scene?._deckPanel ? 'deck' : null;
}

export function closeSceneOverlay(scene) {
  if (!scene || scene._dialogue) return false;
  if (scene._rules) { scene._rules.close(); return true; }
  if (scene._detail && scene.closeDetail) { scene.closeDetail(); return true; }
  const handle = scene._codex || scene._deckPanel;
  if (handle) { handle.close(); return true; }
  if (scene._pauseLayer && scene.hidePause) { scene.hidePause(); return true; }
  return false;
}

export function flatten(scene) {
  const entries = [];
  function visit(object, rootDepth, visible = true) {
    visible = visible && object.visible !== false && object.active !== false && (object.alpha === undefined || object.alpha > 0.01);
    if (!visible) return;
    entries.push({ object, depth: rootDepth });
    for (const child of object.list || []) visit(child, rootDepth, visible);
  }
  for (const object of scene.children.list) visit(object, object.depth);
  return entries;
}

export function uiButtons(scene) {
  if (!scene?.children || scene.input?.enabled === false) return [];
  if (scene.sys.settings.key === 'Reward' && scene.picked) return [];
  const entries = flatten(scene);
  const texts = entries.filter(({ object }) => object.type === 'Text' && object.text);
  const modalDepth = Math.max(-Infinity, ...entries.filter(({ object }) => object.input?.enabled && object.width >= 1590 && object.height >= 890).map(({ depth }) => depth));
  return entries.filter(({ object, depth }) => object.input?.enabled && depth >= modalDepth && object.listenerCount('pointerdown') > 0
    && object.width < 1500 && !scene.enemyViews?.some((view) => view.img === object))
    .map(({ object, depth }) => {
      if (!objectIds.has(object)) objectIds.set(object, `ui-${nextId++}`);
      const bounds = object.getBounds();
      const texture = object.texture?.key || '';
      const cardId = texture.startsWith('card_')
        ? cardIdsByLength.find(id => texture === `card_${id}` || texture.startsWith(`card_${id}_`))
        : null;
      const card = object.getData?.('aiCard') || (CARDS[cardId] ? { id: cardId, up: texture.includes('_up') } : null);
      const cardInfo = card && CARDS[card.id] ? { id: card.id, name: CARDS[card.id].name, upgraded: !!card.up,
        cost: card.free ? 0 : CARDS[card.id].cost < 0 ? -1 : Math.max(0, CARDS[card.id].cost - (card.rune === 'qing' ? 1 : 0)),
        rune: card.rune || null, runeDescription: RUNES[card.rune]?.desc || null, description: cardText(card) } : null;
      const labelTexts = texts.filter((entry) => entry.depth === depth && bounds.contains(entry.object.getBounds().centerX, entry.object.getBounds().centerY));
      const label = object.getData?.('aiLabel') || (cardInfo ? `选择 ${cardInfo.name}${cardInfo.upgraded ? '＋' : ''} · 费 ${cardInfo.cost < 0 ? 'X' : cardInfo.cost} · ${cardInfo.description}${cardInfo.rune ? ' · 铭刻 ' + (RUNES[cardInfo.rune]?.name || cardInfo.rune) : ''}`
        : (object.text || labelTexts.map((entry) => entry.object.text).join(' · ') || `界面控件 ${objectIds.get(object)}`));
      return { id: objectIds.get(object), label, ...(cardInfo ? { card: cardInfo } : {}), object };
    });
}
