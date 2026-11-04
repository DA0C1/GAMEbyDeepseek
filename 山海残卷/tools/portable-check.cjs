'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createServer } = require('./serve.cjs');

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless: true,
      args: ['--edge-skip-compat-layer-relaunch']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const artifacts = path.resolve(__dirname, '../test-artifacts');
    await fs.mkdir(artifacts, { recursive: true });
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const base = `http://127.0.0.1:${server.address().port}/`;
    page.on('request', (request) => {
      if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(request.url());
    });
    for (const ai of [false, true]) {
      const filename = ai ? '山海残卷_AI测试版.html' : '山海残卷_单文件版.html';
      await page.goto(base + 'dist/' + encodeURIComponent(filename), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__game?.scene.isActive('Title'), { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.__game.textures.exists('foe_qiongqi') && window.__game.cache.audio.exists('bgm_boss')), true);
      assert.equal(await page.evaluate(() => !!window.__aiTest), ai);
      if (ai) {
        await page.click('#ai-scenarios button[data-key="two-enemies"]');
        await page.waitForFunction(() => window.__aiTest.state().battle?.phase === 'player' && !window.__aiTest.state().battle.inputBlocked);
        assert.equal(await page.evaluate(() => window.__aiTest.state().battle.enemies.length), 2);
        await page.screenshot({ path: path.join(artifacts, 'ai-portable.png') });
      }
      console.log(`PASS portable ${ai ? 'AI' : 'normal'}: engine, art, music and entry point`);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log('PASS portable: zero runtime errors and zero external requests');
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
