'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve.cjs');
const artifacts = path.resolve(__dirname, '../test-artifacts');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const executablePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--edge-skip-compat-layer-relaunch'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__game?.scene.isActive('Title'), { timeout: 60000 });
    await fs.mkdir(artifacts, { recursive: true });

    async function clickWorld(sceneKey, x, y) {
      const point = await page.evaluate(({ sceneKey, x, y }) => {
        const game = window.__game;
        const cam = game.scene.getScene(sceneKey).cameras.main;
        const rect = game.canvas.getBoundingClientRect();
        const projected = cam.matrix.transformPoint(x - cam.scrollX, y - cam.scrollY);
        return {
          x: rect.left + projected.x * rect.width / game.scale.width,
          y: rect.top + projected.y * rect.height / game.scale.height
        };
      }, { sceneKey, x, y });
      await page.mouse.click(point.x, point.y);
      await wait(100);
    }

    async function mapFixture() {
      await page.evaluate(async () => {
        const { generateMap } = await import('/src/systems/mapgen.js');
        const run = window.__run;
        run.newRun();
        run.player.deck = Array.from({ length: 49 }, (_, i) => ({ ...run.player.deck[i % 12] }));
        run._actIntroShown = true;
        run.map = generateMap(0);
        for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
        window.__game.scene.start('Map');
      });
      await page.waitForFunction(() => window.__game.scene.isActive('Map'));
      await wait(550);
    }

    // Exercise the actual pointer handlers and full 24-card layout, not a mock UI.
    await mapFixture();
    await clickWorld('Map', 1440, 751);
    await page.waitForFunction(() => !!window.__game.scene.getScene('Map')._deckPanel);
    assert.equal(await page.evaluate(() => {
      const panel = window.__game.scene.getScene('Map')._deckPanel.layer;
      const content = panel.list.find((obj) => obj.type === 'Container');
      const cards = content.list.filter((obj) => obj.type === 'Image');
      return cards.length === 24 && cards.every((obj) => obj.getBounds().bottom <= 810);
    }), true, 'all 24 cards fit above the footer');
    await page.screenshot({ path: path.join(artifacts, 'deck-full.png') });
    await clickWorld('Map', 912, 844);
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('Map')._deckPanel.layer.list.some((obj) => obj.text === '2 / 3')), true);
    await clickWorld('Map', 1444, 84);
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('Map')._deckPanel), null);
    await clickWorld('Map', 1440, 751);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__game.scene.getScene('Map')._deckPanel);
    await wait(350);
    await clickWorld('Map', 1440, 751);
    await page.waitForFunction(() => !!window.__game.scene.getScene('Map')._deckPanel);
    await clickWorld('Map', 1444, 846);
    await page.waitForFunction(() => !window.__game.scene.getScene('Map')._deckPanel);
    assert.equal(await page.evaluate(() => window.__game.scene.isActive('Map') && !window.__game.scene.getScene('Map')._deckPanel), true);
    console.log('PASS map deck: pagination, 24-card bounds, close button, return button and ESC');

    async function battleFixture({ boss = false, relics = [], hp = 78 } = {}) {
      await page.evaluate(async ({ boss, relics, hp }) => {
        const { generateMap } = await import('/src/systems/mapgen.js');
        const run = window.__run;
        run.newRun();
        run.player.hp = hp;
        run.player.relics = relics;
        run.map = generateMap(0);
        for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
        window.__game.scene.start('Battle', {
          type: boss ? 'boss' : 'battle',
          encounter: boss ? [{ id: 'zhulong' }] : [{ id: 'shanxiao' }, { id: 'qiongqi' }]
        });
      }, { boss, relics, hp });
      await page.waitForFunction(() => window.__game.scene.isActive('Battle'));
    }

    await battleFixture();
    await wait(950);
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      scene.highlightTarget(scene.battle.enemies[0]);
      scene._testDeadView = scene.enemyViews[0];
      scene.battle.damage(scene.battle.enemies[0], 10000, { raw: true, pierce: true, silent: true });
    });
    await wait(900);
    assert.equal(await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      const dead = scene._testDeadView;
      scene.refreshEnemyBars();
      scene.updateEnemyIntents();
      scene.highlightTarget(null);
      return [dead.container, dead.shadow, dead.halo, dead.aura, dead.ring, dead.lore]
        .filter(Boolean).every((obj) => !obj.active && !obj.scene)
        && scene.enemyViews[1].container.active;
    }), true, 'all defeated-enemy decoration is destroyed and the other enemy remains');
    await page.screenshot({ path: path.join(artifacts, 'enemy-death.png') });
    await clickWorld('Battle', 1480, 628);
    await page.waitForFunction(() => !!window.__game.scene.getScene('Battle')._codex);
    await clickWorld('Battle', 1444, 84);
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('Battle')._codex), null);
    console.log('PASS enemy death: portrait, halo, aura, shadow, selection and lore cleaned; battle deck closes');

    // Kill during entrance tweens: delayed fades must not bring decoration back.
    await battleFixture();
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      scene._testDeadView = scene.enemyViews[0];
      scene.battle.damage(scene.battle.enemies[0], 10000, { raw: true, pierce: true, silent: true });
    });
    await wait(1200);
    assert.equal(await page.evaluate(() => {
      const dead = window.__game.scene.getScene('Battle')._testDeadView;
      return !dead.shadow.scene && !dead.halo.scene && !dead.aura.scene && !dead.lore;
    }), true);
    console.log('PASS enemy death during entrance animation');

    await battleFixture({ boss: true, hp: 40 });
    await wait(900);
    assert.equal(await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      return !!scene._dialogue && scene.uiLocked;
    }), true, '620ms entrance timer cannot unlock an active boss dialogue');
    const before = await page.evaluate(async () => {
      const scene = window.__game.scene.getScene('Battle');
      const { CARDS } = await import('/src/data/cards.js');
      scene._dialogue.close();
      scene.battle.hand = [{ id: 'yuhua', def: CARDS.yuhua, up: false }];
      scene.refreshHand();
      scene.showTalk(['输入隔离测试']);
      return { energy: scene.battle.player.energy, hand: scene.battle.hand.length, hp: scene.battle.player.hp };
    });
    await wait(450);
    const cardPoint = await page.evaluate(() => {
      const v = window.__game.scene.getScene('Battle').cardViews[0];
      return { x: v.baseX, y: v.baseY };
    });
    await clickWorld('Battle', cardPoint.x, cardPoint.y);
    assert.deepEqual(await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      return { energy: scene.battle.player.energy, hand: scene.battle.hand.length, hp: scene.battle.player.hp };
    }), before, 'last dialogue click must not play the card underneath');
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('Battle')._dialogue), null);
    console.log('PASS boss dialogue: opening timer and final-click input isolation');

    await battleFixture({ relics: ['hulu', 'tongqian'], hp: 40 });
    await wait(800);
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Battle');
      scene.battle.enemies.forEach((enemy) => scene.battle.damage(enemy, 10000, { raw: true, pierce: true, silent: true }));
      scene.battle.checkWin();
      scene.battle.checkWin();
    });
    await page.waitForFunction(() => window.__game.scene.isActive('Reward'));
    assert.equal(await page.evaluate(() => window.__run.player.hp), 49, 'gourd healing reaches the next scene');
    assert.equal(await page.evaluate(() => window.__run.player.gold >= 117), true, 'coin bonus reaches the next scene');
    console.log('PASS victory settlement: gourd +9 HP, coin reward and repeated-win protection');

    // Preserve the supplied archive's world-coordinate behavior at high DPI.
    await page.setViewport({ width: 2560, height: 1440 });
    await wait(500);
    await mapFixture();
    await clickWorld('Map', 1440, 751);
    await page.waitForFunction(() => !!window.__game.scene.getScene('Map')._deckPanel);
    await clickWorld('Map', 1444, 84);
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('Map')._deckPanel), null);
    console.log('PASS HiDPI: deck opens and closes at 2560x1440');

    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(url + 'ai-test.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__aiTest?.state().scene === 'Title');
    assert.equal(await page.evaluate(() => window.__aiTest.state().buttons.some((button) => button.label.includes('展'))), true);
    await page.click('#ai-scenarios button[data-key="deck49"]');
    await page.waitForFunction(() => window.__aiTest.state().scene === 'Map');
    await page.waitForSelector('#ai-controls button[data-key="deck"]');
    await page.click('#ai-controls button[data-key="deck"]');
    await page.waitForFunction(() => window.__aiTest.state().modal === 'deck');
    await page.waitForSelector('#ai-controls button[data-key="close"]');
    await page.click('#ai-controls button[data-key="close"]');
    await page.waitForFunction(() => window.__aiTest.state().modal === null);
    assert.equal(await page.evaluate(() => window.__aiTest.act({ type: 'route', id: 99999 }).ok), false);
    console.log('PASS AI panel: readable buttons, 49-card fixture, DOM close and illegal-route rejection');

    async function aiBattle(seed) {
      assert.equal(await page.evaluate((seed) => window.__aiTest.act({ type: 'scenario', name: 'two-enemies', seed }).ok, seed), true);
      await page.waitForFunction(() => window.__aiTest.state().battle?.phase === 'player' && !window.__aiTest.state().battle.inputBlocked);
      return page.evaluate(() => {
        const state = window.__aiTest.state();
        return { hp: state.battle.enemies.map((enemy) => enemy.hp), cards: state.battle.hand.map((card) => card.id) };
      });
    }
    const seeded = await aiBattle(42);
    await page.evaluate(() => { for (let i = 0; i < 1000; i++) Math.random(); });
    assert.deepEqual(await aiBattle(42), seeded);
    const played = await page.evaluate(() => {
      const before = window.__aiTest.state();
      const card = before.battle.hand.find((card) => card.playable);
      const result = window.__aiTest.act({ type: 'play_card', index: card.index, target: before.battle.enemies[0].uid });
      return result.ok && window.__game.scene.getScene('Battle').battle.cardsPlayed === 1;
    });
    assert.equal(played, true);
    assert.equal(await page.evaluate(() => window.__aiTest.act({ type: 'play_card', index: 999 }).ok), false);
    await page.evaluate(() => window.__aiTest.act({ type: 'test_defeat_enemy', target: 'f0' }));
    await wait(950);
    await page.screenshot({ path: path.join(artifacts, 'ai-test.png') });
    assert.equal(await page.evaluate(() => window.__aiTest.state().battle.enemies[0].alive), false);
    assert.equal(await page.evaluate(() => window.__aiTest.log().some((entry) => entry.action.type === 'play_card')), true);
    console.log('PASS AI actions: deterministic seed, legal card play, invalid-card rejection, death fixture and action log');

    await page.evaluate(async () => {
      const { setSeed } = await import('/src/core/random.js');
      setSeed(121); // Three upgraded choices, including the X-cost 凝气.
      for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
      window.__game.scene.start('Reward', { treasure: false });
    });
    await page.waitForFunction(() => window.__aiTest.state().scene === 'Reward');
    const rewardCards = await page.evaluate(() => window.__aiTest.state().buttons.filter(button => button.card));
    assert.equal(rewardCards.length, 3);
    assert.equal(rewardCards.some(button => button.card.upgraded), true);
    assert.equal(rewardCards.some(button => button.card.cost === -1 && button.label.includes('费 X')), true);
    assert.equal(await page.evaluate(async () => {
      const { cardText } = await import('/src/data/cards.js');
      const scene = window.__game.scene.getScene('Reward');
      const actual = scene.children.list.filter(object => object.getData?.('aiCard')).map(object => object.getData('aiCard'));
      return window.__aiTest.state().buttons.filter(button => button.card).every(button => {
        const card = actual.find(card => card.id === button.card.id);
        return card && button.card.upgraded === card.up && button.card.cost === card.def.cost
          && button.card.description === cardText(card) && button.label.includes(cardText(card));
      });
    }), true, 'accessible rewards match the actual upgraded card effects');
    await page.screenshot({ path: path.join(artifacts, 'ai-rewards.png') });
    const deckBeforeReward = await page.evaluate(() => window.__run.player.deck.length);
    await page.click(`#ai-buttons button[data-key="${rewardCards[0].id}"]`);
    await page.waitForFunction(expected => window.__run.player.deck.length === expected, {}, deckBeforeReward + 1);
    assert.equal(await page.evaluate(() => window.__run.player.deck.at(-1).id), rewardCards[0].card.id);
    console.log('PASS AI rewards: actual costs, upgraded effects, X cost and DOM selection');

    await page.evaluate(async () => {
      const { PAGES } = await import('/src/data/story.js');
      window.__run.newRun();
      window.__run.flags.pages = PAGES.slice(0, 6).map(page => page.id);
      window.__run.stats.cardsPlayed = 5;
      window.__run.stats.kills = 2;
      window.__run.stats.damage = 123;
      window.__endingBefore = structuredClone(window.__save.data);
      for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
      window.__game.scene.start('Ending');
    });
    await page.waitForFunction(() => window.__aiTest.state().scene === 'Ending');
    const oldChoices = await page.evaluate(() => window.__aiTest.state().buttons.map(button => button.id));
    await page.evaluate(ids => {
      // Different choices queue callbacks in the same frame; both must not record a win.
      window.__aiTest.act({ type: 'ui', id: ids[2] });
      window.__aiTest.act({ type: 'ui', id: ids[0] });
    }, oldChoices);
    await page.waitForFunction(() => window.__game.scene.getScene('Ending')._endingChosen);
    assert.equal(await page.evaluate(ids => window.__aiTest.state().buttons.some(button => ids.includes(button.id)), oldChoices), false);
    assert.equal(await page.evaluate(id => window.__aiTest.act({ type: 'ui', id }).ok, oldChoices[0]), false);
    await page.evaluate(async () => {
      const { ENDINGS } = await import('/src/data/story.js');
      window.__game.scene.getScene('Ending').showEnding(ENDINGS.burn);
    });
    assert.equal(await page.evaluate(() => {
      const before = window.__endingBefore;
      const after = window.__save.data;
      return after.wins === before.wins + 1 && after.ascension === Math.min(5, before.ascension + 1)
        && after.stats.cardsPlayed === before.stats.cardsPlayed + 5
        && after.stats.enemiesKilled === before.stats.enemiesKilled + 2
        && after.stats.damageDealt === before.stats.damageDealt + 123;
    }), true, 'queued and direct repeat requests cannot duplicate victory or lifetime stats');
    await page.waitForFunction(() => window.__aiTest.state().buttons.some(button => button.label.replace(/\s/g, '') === '回山门'));
    assert.equal(await page.evaluate(async () => {
      const { ENDINGS } = await import('/src/data/story.js');
      const body = window.__game.scene.getScene('Ending').children.list
        .find(object => object.type === 'Container' && object.depth === 100).list
        .filter(object => object.type === 'Text' && ENDINGS.become.lines.filter(Boolean).includes(object.text));
      return body.length === ENDINGS.become.lines.filter(Boolean).length
        && body.every(object => object.alpha === 1 && object.getBounds().bottom < 720);
    }), true, 'all ending lines are visible above the score before return is offered');
    await page.screenshot({ path: path.join(artifacts, 'ending-locked.png') });
    const returnId = await page.evaluate(() => window.__aiTest.state().buttons.find(button => button.label.replace(/\s/g, '') === '回山门').id);
    await page.click(`#ai-buttons button[data-key="${returnId}"]`);
    await page.waitForFunction(() => window.__aiTest.state().scene === 'Title');
    assert.equal(await page.evaluate(() => window.__save.data.wins === window.__endingBefore.wins + 1), true);
    await page.evaluate(() => {
      window.__run.newRun();
      for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
      window.__game.scene.start('Ending');
    });
    await page.waitForFunction(() => window.__aiTest.state().scene === 'Ending');
    assert.deepEqual(await page.evaluate(() => window.__aiTest.state().buttons.map(button => button.label.replace(/\s/g, ''))), ['补卷']);
    await page.evaluate(async () => {
      const { PAGES } = await import('/src/data/story.js');
      window.__run.flags.pages = PAGES.map(page => page.id);
      window.__game.scene.stop('Ending');
      window.__game.scene.start('Ending');
    });
    await page.waitForFunction(() => window.__aiTest.state().buttons.length === 3);
    await page.evaluate(() => {
      const choice = window.__aiTest.state().buttons.find(button => button.label.replace(/\s/g, '') === '代卷');
      window.__aiTest.act({ type: 'ui', id: choice.id });
    });
    await page.waitForFunction(() => window.__aiTest.state().buttons.some(button => button.label.replace(/\s/g, '') === '回山门'));
    assert.equal(await page.evaluate(() => {
      const layer = window.__game.scene.getScene('Ending').children.list.find(object => object.type === 'Container' && object.depth === 100);
      const epilogue = layer.list.filter(object => object.type === 'Text' &&
        (object.text === '图全了。' || object.text.includes('那道背影') || object.text.includes('已录：背影')));
      return epilogue.length === 3 && epilogue.every(object => object.alpha === 1) && !!window.__save.data.seen.lore.ending_true;
    }), true, 'return waits for the complete nine-page epilogue');
    console.log('PASS ending: old choices removed, locked choices disabled, single settlement and normal return');

    await aiBattle(42);
    await page.evaluate(() => {
      const nativeRAF = window.requestAnimationFrame.bind(window);
      window.__restoreRAF = () => { window.requestAnimationFrame = nativeRAF; window.dispatchEvent(new Event('focus')); };
      window.requestAnimationFrame = callback => nativeRAF(() => setTimeout(() => callback(performance.now()), 250));
      window.dispatchEvent(new Event('blur'));
      window.__turnStartedAt = performance.now();
      window.__aiTest.act({ type: 'end_turn' });
    });
    await page.waitForFunction(() => window.__aiTest.state().battle?.turn === 2 && window.__aiTest.state().battle.phase === 'player', { timeout: 6000 });
    const timing = await page.evaluate(() => {
      const result = { elapsedMs: performance.now() - window.__turnStartedAt,
        delta: window.__game.loop.delta, rawDelta: window.__game.loop.rawDelta, visibility: document.visibilityState };
      window.__restoreRAF();
      return result;
    });
    assert.equal(timing.visibility, 'visible');
    assert.ok(timing.rawDelta >= 200 && timing.delta >= 200 && timing.elapsedMs < 6000,
      'low-FPS blurred window advances using actual elapsed time');
    await fs.writeFile(path.join(artifacts, 'low-fps-timing.json'), JSON.stringify(timing, null, 2));
    console.log(`PASS low-FPS timing: next player turn in ${Math.round(timing.elapsedMs)}ms at ~4 FPS while blurred`);

    assert.deepEqual(errors, [], 'no page errors or battle-handler errors');
    console.log('PASS zero runtime errors');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
