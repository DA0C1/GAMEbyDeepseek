/* 仅由 ai-test.html 加载：可读状态、受规则约束的操作、显式测试夹具。 */
import { run } from '../core/run.js';
import { setSeed, getSeed } from '../core/random.js';
import { generateMap, availableNodes, NODE_LABEL } from '../systems/mapgen.js';
import { CARDS, cardText } from '../data/cards.js';
import { RELICS } from '../data/relics.js';
import { POTIONS } from '../data/potions.js';

const log = [];
const objectIds = new WeakMap();
let nextId = 1;
const status = document.getElementById('ai-status');
const currentScene = () => window.__game?.scene.getScenes(true).at(-1);
const seedValue = () => Number(document.getElementById('ai-seed').value) >>> 0;

function flatten(scene) {
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

function uiButtons(scene) {
  if (!scene?.children) return [];
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
      const cardId = texture.startsWith('card_') ? texture.slice(5).split('_')[0] : null;
      const card = object.getData?.('aiCard') || (CARDS[cardId] ? { id: cardId, up: texture.includes('_up') } : null);
      const cardInfo = card ? { id: card.id, name: CARDS[card.id].name, upgraded: !!card.up,
        cost: CARDS[card.id].cost, description: cardText(card) } : null;
      const labelTexts = texts.filter((entry) => entry.depth === depth && bounds.contains(entry.object.getBounds().centerX, entry.object.getBounds().centerY));
      const label = cardInfo ? `选择 ${cardInfo.name}${cardInfo.upgraded ? '＋' : ''} · 费 ${cardInfo.cost < 0 ? 'X' : cardInfo.cost} · ${cardInfo.description}`
        : (object.text || labelTexts.map((entry) => entry.object.text).join(' · ') || `界面控件 ${objectIds.get(object)}`);
      return { id: objectIds.get(object), label, ...(cardInfo ? { card: cardInfo } : {}), object };
    });
}

function state() {
  const scene = currentScene();
  if (!scene) return { ready: false };
  const battle = scene.battle;
  const player = run.player;
  const modal = scene._dialogue ? 'dialogue' : scene._rules ? 'rules' : scene._pauseLayer ? 'pause'
    : scene._codex || scene._deckPanel ? 'deck' : null;
  const blocked = !!modal || !!scene.uiLocked;
  const continueScene = !!scene._introOpen || (scene.sys.settings.key === 'Event' && scene._chosen && scene.input.listenerCount('pointerdown') > 0);
  return {
    ready: true, scene: scene.sys.settings.key, seed: getSeed(), modal, continueScene,
    text: flatten(scene).filter(({ object }) => object.type === 'Text' && object.text).map(({ object }) => object.text),
    player: player ? { hp: player.hp, maxHp: player.maxHp, block: player.block, energy: player.energy, energyMax: player.energyMax,
      gold: player.gold, buffs: { ...player.buffs }, deckSize: player.deck.length,
      relics: player.relics.map((id) => ({ id, name: RELICS[id]?.name, description: RELICS[id]?.desc })),
      potions: player.potions.map((id, index) => ({ id, index, name: POTIONS[id]?.name, description: POTIONS[id]?.desc })) } : null,
    act: run.map?.act.name || null,
    battle: battle ? { turn: battle.turn, phase: battle.phase, inputBlocked: !!scene.isInputBlocked(),
      drawCount: battle.drawPile.length, discardCount: battle.discardPile.length, exhaustCount: battle.exhaustPile.length,
      hand: battle.hand.map((card, index) => ({ index, id: card.id, name: CARDS[card.id]?.name, description: cardText(card),
        cost: battle.costOf(card, true), target: card.def.target, playable: !scene.isInputBlocked() && battle.canPlay(card) })),
      enemies: battle.enemies.map((enemy) => ({ uid: enemy.uid, id: enemy.id, name: enemy.name, alive: enemy.alive,
        hp: enemy.hp, maxHp: enemy.maxHp, block: enemy.block, buffs: { ...enemy.buffs }, intent: { ...enemy.move,
          damagePerHit: enemy.move?.dmg ? Math.round((enemy.move.dmg * (enemy.dmgMul || 1) + (enemy.buffs.str || 0)) * (enemy.buffs.weak > 0 ? 0.75 : 1)) : 0,
          hits: enemy.move?.hits || 1 } })) } : null,
    dialogue: scene._dialogue?.getState() || null,
    routes: scene.sys.settings.key === 'Map' && !blocked && !scene._introOpen && !scene._entering
      ? availableNodes(run.map).map((node) => ({ id: node.id, col: node.col, row: node.row, type: node.type, label: NODE_LABEL[node.type] })) : [],
    buttons: uiButtons(scene).map(({ id, label, card }) => ({ id, label, ...(card ? { card } : {}) }))
  };
}

function requireCondition(condition, message) { if (!condition) throw new Error(message); }

function scenario(name, seed = seedValue()) {
  const game = window.__game;
  requireCondition(game && !['Boot', 'Preload'].includes(currentScene()?.sys.settings.key), '请等待游戏加载');
  requireCondition(['normal', 'deck49', 'two-enemies', 'boss', 'relics'].includes(name), '未知测试场景');
  setSeed(seed);
  run.newRun();
  run._actIntroShown = true;
  run.map = generateMap(0);
  const active = game.scene.getScenes(true);
  for (const scene of active) game.scene.stop(scene.sys.settings.key);
  if (name === 'normal') { game.scene.start('Map'); return; }
  if (name === 'deck49') {
    const original = run.player.deck;
    run.player.deck = Array.from({ length: 49 }, (_, index) => ({ ...original[index % original.length] }));
    game.scene.start('Map');
    return;
  }
  run.player.relics = name === 'relics' ? ['hulu', 'tongqian'] : ['guijia'];
  if (name === 'relics') run.player.hp = 40;
  game.scene.start('Battle', {
    type: name === 'boss' ? 'boss' : 'battle',
    encounter: name === 'boss' ? [{ id: 'zhulong' }] : [{ id: 'shanxiao' }, { id: 'qiongqi' }]
  });
}

function act(action) {
  const scene = currentScene();
  try {
    requireCondition(!!scene, '游戏尚未就绪');
    switch (action.type) {
      case 'scenario': scenario(action.name, action.seed ?? seedValue()); break;
      case 'play_card': {
        requireCondition(scene.battle && !scene.isInputBlocked(), '当前不能出牌');
        const card = scene.battle.hand[action.index];
        const view = scene.cardViews.find((view) => view.card === card && !view.removing);
        const target = scene.battle.enemies.find((enemy) => enemy.uid === action.target && enemy.alive);
        requireCondition(view && scene.battle.canPlay(card), '卡牌无效或灵力不足');
        requireCondition(card.def.target !== 'enemy' || target, '请指定存活目标');
        scene.playCard(view, target || null);
        break;
      }
      case 'end_turn': requireCondition(scene.battle && !scene.isInputBlocked(), '当前不能结束回合'); scene.endTurn(); break;
      case 'potion': requireCondition(scene.battle && !scene.isInputBlocked(), '当前不能使用药水'); scene.usePotionAt(action.index); break;
      case 'dialogue_next': requireCondition(scene._dialogue, '当前没有对话'); scene._dialogue.advance(); break;
      case 'continue_scene':
        requireCondition(state().continueScene, '当前没有点击继续的提示');
        scene.input.emit('pointerdown', { x: 800, y: 450, worldX: 800, worldY: 450 });
        break;
      case 'open_deck':
        requireCondition(!scene._dialogue && !scene._rules && !scene._pauseLayer, '请先关闭当前浮层');
        if (scene.sys.settings.key === 'Map') scene.toggleDeck();
        else { requireCondition(!!scene.openCodex, '当前场景没有牌组入口'); scene.openCodex('cards'); }
        break;
      case 'close_overlay': {
        const handle = scene._rules || scene._codex || scene._deckPanel;
        if (handle) handle.close();
        else { requireCondition(scene._pauseLayer, '当前没有可关闭面板'); scene.hidePause(); }
        break;
      }
      case 'route': {
        requireCondition(scene.sys.settings.key === 'Map' && !scene._deckPanel && !scene._rules && !scene._introOpen && !scene._entering, '当前不能选择路线');
        const node = availableNodes(run.map).find((node) => node.id === action.id);
        requireCondition(!!node, '该路线当前不可达');
        scene.enterNode(node);
        break;
      }
      case 'ui': {
        requireCondition(!scene._dialogue, '请先推进对话');
        const entry = uiButtons(scene).find((entry) => entry.id === action.id);
        requireCondition(!!entry, '控件已变化，请重新读取状态');
        const bounds = entry.object.getBounds();
        entry.object.emit('pointerdown', { x: bounds.centerX, y: bounds.centerY, worldX: bounds.centerX, worldY: bounds.centerY }, 0, 0, { stopPropagation() {} });
        break;
      }
      case 'test_defeat_enemy': {
        requireCondition(scene.battle && !scene.isInputBlocked(), '请先关闭浮层并等待玩家回合');
        const enemy = scene.battle.enemies.find((enemy) => enemy.alive && (!action.target || enemy.uid === action.target));
        requireCondition(!!enemy, '没有可用测试目标');
        scene.battle.damage(enemy, 100000, { raw: true, pierce: true, silent: true });
        scene.battle.checkWin();
        break;
      }
      default: throw new Error('未知操作');
    }
    log.push({ at: new Date().toISOString(), action: { ...action }, scene: scene.sys.settings.key });
    if (log.length > 200) log.shift();
    status.textContent = `已执行：${action.type}`;
    render();
    return { ok: true, state: state() };
  } catch (error) {
    log.push({ at: new Date().toISOString(), action: { ...action }, error: error.message });
    if (log.length > 200) log.shift();
    status.textContent = error.message;
    return { ok: false, error: error.message, state: state() };
  }
}

function renderActions(id, actions) {
  const host = document.getElementById(id);
  const old = new Map(Array.from(host.children).map((button) => [button.dataset.key, button]));
  const keep = new Set();
  for (const item of actions) {
    const key = String(item.key);
    keep.add(key);
    let button = old.get(key);
    if (!button) {
      button = document.createElement('button');
      button.dataset.key = key;
      button.addEventListener('click', () => act(button._action()));
      host.append(button);
    }
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button._action = typeof item.action === 'function' ? item.action : () => item.action;
  }
  for (const [key, button] of old) if (!keep.has(key)) button.remove();
}

function render() {
  const snapshot = state();
  document.getElementById('ai-state').textContent = JSON.stringify(snapshot, null, 2);
  if (!snapshot.ready) return;
  const controls = [];
  if (snapshot.dialogue) controls.push({ key: 'next', label: snapshot.dialogue.typing ? '补全当前台词' : '继续对话', action: { type: 'dialogue_next' } });
  else if (snapshot.modal) controls.push({ key: 'close', label: '关闭浮层，返回游戏', action: { type: 'close_overlay' } });
  else {
    if (snapshot.continueScene) controls.push({ key: 'continue', label: '点击继续行卷', action: { type: 'continue_scene' } });
    if (['Map', 'Battle'].includes(snapshot.scene)) controls.push({ key: 'deck', label: '查看牌组', action: { type: 'open_deck' } });
    if (snapshot.battle) {
      controls.push({ key: 'end', label: '结束回合', disabled: snapshot.battle.inputBlocked, action: { type: 'end_turn' } });
      for (const potion of snapshot.player.potions) controls.push({ key: `potion-${potion.index}`, label: `使用药水：${potion.name} · ${potion.description}`, disabled: snapshot.battle.inputBlocked, action: { type: 'potion', index: potion.index } });
      controls.push({ key: 'test-kill', label: '测试专用：击败所选敌人', disabled: snapshot.battle.inputBlocked, action: () => ({ type: 'test_defeat_enemy', target: document.getElementById('ai-target').value }) });
    }
  }
  renderActions('ai-controls', controls);
  const target = document.getElementById('ai-target');
  const enemies = snapshot.battle?.enemies.filter((enemy) => enemy.alive) || [];
  document.getElementById('ai-target-section').hidden = !enemies.length;
  const targetKey = enemies.map((enemy) => enemy.uid).join(',');
  if (target.dataset.key !== targetKey) {
    target.replaceChildren(...enemies.map((enemy) => new Option(enemy.name, enemy.uid)));
    target.dataset.key = targetKey;
  }
  for (const enemy of enemies) target.querySelector(`option[value="${enemy.uid}"]`).textContent = `${enemy.name} · ${enemy.hp}/${enemy.maxHp} · 甲 ${enemy.block}`;
  renderActions('ai-cards', (snapshot.battle?.hand || []).map((card) => ({ key: `card-${card.index}`, label: `${card.index + 1}. ${card.name} · 费 ${card.cost} · ${card.description}`, disabled: !card.playable,
    action: () => ({ type: 'play_card', index: card.index, target: target.value }) })));
  renderActions('ai-routes', snapshot.routes.map((node) => ({ key: node.id, label: `${node.label} · 第 ${node.col + 1} 列 / ${node.row + 1} 路`, action: { type: 'route', id: node.id } })));
  renderActions('ai-buttons', snapshot.dialogue ? [] : snapshot.buttons.map((button) => ({ key: button.id, label: button.label, action: { type: 'ui', id: button.id } })));
}

renderActions('ai-scenarios', [
  ['normal', '固定种子：从地图正常游玩'], ['deck49', '复现：49 张牌组与退出'],
  ['two-enemies', '复现：双敌死亡清理'], ['boss', '复现：首领对话隔离'], ['relics', '复现：葫芦与铜钱结算']
].map(([name, label]) => ({ key: name, label, action: () => ({ type: 'scenario', name, seed: seedValue() }) })));

window.__aiTest = Object.freeze({ version: 1, state, act, log: () => structuredClone(log) });
document.getElementById('ai-export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ state: state(), actions: log }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '山海残卷_AI测试记录.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('error', (event) => { status.textContent = event.message; });
setInterval(() => {
  try { render(); } catch (error) { status.textContent = error.message; }
}, 250);
