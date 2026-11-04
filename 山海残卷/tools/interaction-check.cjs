'use strict';

const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve.cjs');

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const failures = [];
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--edge-skip-compat-layer-relaunch']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/ai-test.html`);
    await page.waitForFunction(() => window.__aiTest?.state().scene === 'Title', { timeout: 60000 });

    async function check(name, fn) {
      try { await fn(); console.log('PASS ' + name); }
      catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL ' + name + ': ' + error.message); }
    }

    async function clickButton(label) {
      const point = await page.evaluate(label => {
        const button = window.__aiTest.state().buttons.find(button => button.label.replace(/\s/g, '') === label);
        if (!button) throw new Error('Missing button: ' + label);
        // Locate through the public AI state, but use a real browser pointer click.
        const scene = window.__game.scene.getScenes(true).at(-1);
        const texts = scene.children.list.filter(object => object.type === 'Container' && object.zone);
        const target = texts.find(object => object.list.some(child => child.text?.replace(/\s/g, '') === label));
        const bounds = target.zone.getBounds();
        const rect = window.__game.canvas.getBoundingClientRect();
        return { x: rect.left + bounds.centerX * rect.width / 1600, y: rect.top + bounds.centerY * rect.height / 900 };
      }, label);
      await page.mouse.click(point.x, point.y);
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    await check('settings: real clicks toggle shake, confirm reset and refresh the title', async () => {
      await page.evaluate(() => {
        window.__save.data.runs = 7;
        window.__save.data.bestScore = 321;
        window.__save.data.settings.music = 0.1;
        window.__save.data.settings.sfx = 0.2;
      });
      await clickButton('心法');
      await page.waitForFunction(() => window.__aiTest.state().scene === 'Settings');
      await clickButton('开');
      assert.equal(await page.evaluate(() => window.__save.data.settings.shake), false, 'shake toggle responds to clicks');
      assert.equal(await page.evaluate(async () => {
        const { shake } = await import('/src/core/fx.js');
        const camera = window.__game.scene.getScene('Settings').cameras.main;
        camera.shakeEffect.reset();
        shake(window.__game.scene.getScene('Settings'));
        return camera.shakeEffect.isRunning;
      }), false, 'disabled shake prevents camera movement');
      await clickButton('清除进度');
      assert.equal(await page.evaluate(() => window.__save.data.runs), 7, 'first click only asks for confirmation');
      await clickButton('再点一次确认');
      assert.equal(await page.evaluate(() => window.__save.data.runs), 0);
      assert.equal(await page.evaluate(() => {
        const state = window.__aiTest.state();
        return state.text.includes('42%') && state.text.includes('80%') && state.buttons.some(button => button.label === '开');
      }), true, 'all settings controls display restored defaults');
      assert.equal(await page.evaluate(async () => {
        const { shake } = await import('/src/core/fx.js');
        const scene = window.__game.scene.getScene('Settings');
        shake(scene);
        return scene.cameras.main.shakeEffect.isRunning;
      }), true, 'restoring the enabled setting also restores camera shake');
      await clickButton('返回');
      await page.waitForFunction(() => window.__aiTest.state().scene === 'Title');
      assert.equal(await page.evaluate(() => window.__aiTest.state().text.some(text => text.includes('入卷 0 次') && text.includes('最佳 0 分'))), true);
    });

    await check('boss rewards: all three acts drop one potion, full bags stay unchanged', async () => {
      for (const act of [0, 1, 2]) {
        for (const full of [false, true]) {
          const result = await page.evaluate(async ({ act, full }) => {
            const { generateMap } = await import('/src/systems/mapgen.js');
            for (const scene of window.__game.scene.getScenes(true)) window.__game.scene.stop(scene.sys.settings.key);
            window.__run.newRun();
            window.__run.actIndex = act;
            window.__run.map = generateMap(act);
            window.__run.player.potions = full ? ['huichun', 'xuanbing', 'dali'] : [];
            window.__game.scene.start('Battle', { type: 'boss', encounter: [{ id: window.__run.map.act.boss }] });
            return true;
          }, { act, full });
          assert.equal(result, true);
          await page.waitForFunction(() => window.__aiTest.state().scene === 'Battle');
          const bag = await page.evaluate(() => {
            const scene = window.__game.scene.getScene('Battle');
            scene._dialogue?.close();
            scene.battle.damage(scene.battle.enemies[0], 100000, { raw: true, pierce: true });
            scene.battle.update(2);
            scene.onEnd('win'); // Repeated delivery cannot duplicate any reward.
            return [...window.__run.player.potions];
          });
          assert.equal(bag.length, full ? 3 : 1, `act ${act + 1}, full bag ${full}`);
          if (full) assert.deepEqual(bag, ['huichun', 'xuanbing', 'dali']);
        }
      }
    });

    await check('intent UI and AI state match weakness, vulnerability and damage reduction', async () => {
      await page.evaluate(() => window.__aiTest.act({ type: 'scenario', name: 'two-enemies', seed: 42 }));
      await page.waitForFunction(() => window.__aiTest.state().battle?.phase === 'player');
      assert.equal(await page.evaluate(() => {
        const scene = window.__game.scene.getScene('Battle');
        const enemy = scene.battle.enemies[0];
        enemy.move = { name: '测试', type: 'attack', dmg: 10, hits: 2 };
        enemy.dmgMul = 1;
        scene.battle.apply(enemy, 'weak', 2);
        scene.battle.apply(scene.battle.player, 'vuln', 2);
        scene.battle.apply(scene.battle.player, 'halve', 1);
        const intent = scene.enemyViews[0].intent.list.find(object => object.type === 'Text').text;
        const tip = scene.intentTipLines(enemy.move, enemy).join('\n');
        const aiDamage = window.__aiTest.state().battle.enemies[0].intent.damagePerHit;
        scene.battle.player.block = 0;
        const actualDamage = scene.battle.hurtPlayer(8); // round(10 * 0.75)
        return intent === '6×2' && tip.includes('伤害 6 × 2') && aiDamage === 6 && actualDamage === 6;
      }), true, 'visible and accessible intent updates immediately and matches actual HP loss');
    });

    assert.deepEqual(errors, [], 'no runtime errors');
    assert.deepEqual(failures, [], 'interaction regressions');
    console.log('PASS zero runtime errors');
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
