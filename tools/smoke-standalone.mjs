// 打包版完整冒烟测试：单文件 standalone.js（http 服务器下跑完整生涯 + 单场模拟）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8771;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('.home-title');
console.log('1 home:', (await page.textContent('.home-title')).trim());

await page.click('text=开始生涯');
await page.waitForSelector('.name-input');
await page.fill('.name-input', '打包测试');
await page.click('text=小前锋');
await page.click('button:has-text("开始生涯")');
await page.waitForSelector('.build-progress');
await page.waitForTimeout(300);

for (let i = 0; i < 13; i++) {
  await page.click('button:has-text("随机球队")');
  await page.waitForSelector('.player-card');
  await page.locator('.player-card').first().click();
  await page.waitForSelector('.attr-lock.pickable');
  await page.locator('.attr-lock.pickable').first().click();
  await page.waitForTimeout(30);
}
await page.waitForSelector('.reveal-card');
console.log('2 reveal ovr:', await page.textContent('.ro-val'));
await page.click('button:has-text("开始生涯")');
await page.waitForTimeout(300);

// 推进 + 单场模拟
let simTried = false;
let seasonsPlayed = 0;
let guard = 0;
while (guard < 3000) {
  // 赛季页：快进整个赛季
  if (await page.locator('.season-actions').first().isVisible().catch(() => false)) {
    await page.locator('.season-actions button:has-text("快进")').click();
    await page.waitForTimeout(150);
    continue;
  }
  // 季后赛页：快进本轮
  if (await page.locator('.playoffs-top').first().isVisible().catch(() => false)) {
    await page.locator('.playoffs-top ~ .season-actions button:has-text("快进")').click().catch(async () => {
      await page.locator('button:has-text("快进本轮")').click();
    });
    await page.waitForTimeout(150);
    continue;
  }
  // 赛季总结：继续
  if (await page.locator('.season-summary').first().isVisible().catch(() => false)) {
    await page.locator('.season-summary button:has-text("继续")').click();
    await page.waitForTimeout(100);
    seasonsPlayed++;
    continue;
  }
  if (await page.locator('.sim-entry').first().isVisible().catch(() => false)) {
    await page.click('.sim-entry');
    await page.waitForSelector('.game-pre-card');
    await page.click('text=开始比赛');
    await page.waitForSelector('.pbl-row');
    await page.waitForTimeout(1500);
    await page.waitForSelector('text=查看技术统计', { timeout: 30000 });
    await page.click('text=查看技术统计');
    await page.waitForSelector('.game-result');
    console.log('3 game result:', (await page.textContent('.gr-score')).trim());
    await page.click('text=继续生涯');
    simTried = true;
    break;
  }
  const opt = page.locator('.option').first();
  if (await opt.count() && await opt.isVisible().catch(() => false)) { await opt.click(); await page.waitForTimeout(30); }
  else if (await page.locator('.receipt').first().isVisible().catch(() => false)) { await page.locator('.receipt').first().click(); await page.waitForTimeout(30); }
  else if (await page.locator('.banner').first().isVisible().catch(() => false)) { await page.locator('.banner').first().click(); await page.waitForTimeout(30); }
  else if (await page.locator('.upgrade-list').first().isVisible().catch(() => false)) { await page.locator('button:has-text("完成升级")').click(); await page.waitForTimeout(30); }
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  guard++;
}
console.log('4 simTried:', simTried, 'seasonsPlayed:', seasonsPlayed, 'guard:', guard);

// 检查战绩卡关键之战区块
let sawKeyGames = false;
let clicks2 = 0;
while (clicks2 < 3000) {
  if (await page.locator('.sum-hero').count()) break;
  if (await page.locator('.season-actions').first().isVisible().catch(() => false)) {
    await page.locator('.season-actions button:has-text("快进")').click();
    await page.waitForTimeout(100);
    continue;
  }
  if (await page.locator('.playoffs-top').first().isVisible().catch(() => false)) {
    await page.locator('button:has-text("快进本轮")').click().catch(() => {});
    await page.waitForTimeout(100);
    continue;
  }
  if (await page.locator('.season-summary').first().isVisible().catch(() => false)) {
    await page.locator('.season-summary button:has-text("继续")').click();
    await page.waitForTimeout(60);
    continue;
  }
  const opt = page.locator('.option').first();
  if (await opt.count() && await opt.isVisible().catch(() => false)) { await opt.click(); await page.waitForTimeout(20); }
  else if (await page.locator('.receipt').first().isVisible().catch(() => false)) { await page.locator('.receipt').first().click(); await page.waitForTimeout(20); }
  else if (await page.locator('.banner').first().isVisible().catch(() => false)) { await page.locator('.banner').first().click(); await page.waitForTimeout(20); }
  else if (await page.locator('.upgrade-list').first().isVisible().catch(() => false)) { await page.locator('button:has-text("完成升级")').click(); await page.waitForTimeout(20); }
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(20); }
  clicks2++;
}
if (await page.locator('.sum-hero').count()) {
  const keyGames = await page.locator('h4:has-text("关键之战")').count();
  sawKeyGames = keyGames > 0;
  console.log('5 summary reached, 关键之战 section:', keyGames);
} else {
  console.log('5 summary NOT reached in 1500 clicks');
}

await browser.close();
server.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
console.log('STANDALONE SMOKE PASS');
