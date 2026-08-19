// 打包版完整冒烟测试：单文件 standalone.js（http 服务器下跑完整生涯 + 单场模拟 + 休赛期）
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
const page = await browser.newPage({ viewport: { width: 480, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

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
await page.waitForTimeout(400);

// 推进：处理所有屏幕，统计遇到的关键功能
let simTried = false;
let seasonsPlayed = 0;
let sawOffseason = false;
let sawTrade = false;
let sawContract = false;
let guard = 0;
let lastScreen = '';
while (guard < 6000) {
  // 季后赛关键场次：必须进入比赛（播放单场模拟）
  if (await page.locator('.key-game-banner').first().isVisible().catch(() => false)) {
    await page.locator('button:has-text("进入这场比赛")').click();
    await page.waitForSelector('.game-pre-card');
    await page.click('text=开始比赛');
    await page.waitForSelector('.pbl-row');
    await page.waitForTimeout(1200);
    await page.waitForSelector('text=查看技术统计', { timeout: 30000 });
    await page.click('text=查看技术统计');
    await page.waitForSelector('.game-result');
    await page.click('text=继续生涯');
    await page.waitForTimeout(100);
    continue;
  }
  // 赛季页：快进
  if (await page.locator('.season-actions').first().isVisible().catch(() => false)) {
    await page.locator('.season-actions button:has-text("快进")').click();
    await page.waitForTimeout(40);
    lastScreen = 'season';
    continue;
  }
  // 季后赛：快进本轮（非关键场次）
  if (await page.locator('.playoffs-top').first().isVisible().catch(() => false)) {
    await page.locator('button:has-text("快进本轮")').click().catch(() => {});
    await page.waitForTimeout(40);
    lastScreen = 'playoffs';
    continue;
  }
  // 赛季总结：继续（可能进入休赛期）
  if (await page.locator('.season-summary').first().isVisible().catch(() => false)) {
    await page.locator('.season-summary button:has-text("继续")').click();
    await page.waitForTimeout(40);
    seasonsPlayed++;
    lastScreen = 'summary';
    continue;
  }
  // 休赛期：国家队比赛（跳过）或进入新赛季
  if (await page.locator('.offseason-hero').first().isVisible().catch(() => false)) {
    sawOffseason = true;
    if (await page.locator('.nat-game-row').first().isVisible().catch(() => false)) {
      // 打一场国家队比赛（跳过判定）
      await page.locator('.nat-game-row').first().click();
      await page.waitForSelector('.game-pre-card');
      await page.click('text=跳过，用赛果直接判定');
      await page.waitForTimeout(200);
      continue;
    }
    await page.locator('button:has-text("进入新赛季")').click();
    await page.waitForTimeout(40);
    continue;
  }
  // 联盟交易提示
  if (await page.locator('.trade-item').first().isVisible().catch(() => false)) {
    sawTrade = true;
  }
  // 合同到期事件
  if (await page.locator('.event-title:has-text("合同到期")').first().isVisible().catch(() => false)) {
    sawContract = true;
  }
  // 单场关键战
  if (await page.locator('.sim-entry').first().isVisible().catch(() => false)) {
    await page.click('.sim-entry');
    await page.waitForSelector('.game-pre-card');
    await page.click('text=开始比赛');
    await page.waitForSelector('.pbl-row');
    await page.waitForTimeout(1200);
    await page.waitForSelector('text=查看技术统计', { timeout: 30000 });
    await page.click('text=查看技术统计');
    await page.waitForSelector('.game-result');
    console.log('3 game result:', (await page.textContent('.gr-score')).trim());
    await page.click('text=继续生涯');
    simTried = true;
    continue;
  }
  // 通用推进
  const opt = page.locator('.option').first();
  if (await opt.count() && await opt.isVisible().catch(() => false)) { await opt.click(); await page.waitForTimeout(30); }
  else if (await page.locator('.receipt').first().isVisible().catch(() => false)) { await page.locator('.receipt').first().click(); await page.waitForTimeout(30); }
  else if (await page.locator('.banner').first().isVisible().catch(() => false)) { await page.locator('.banner').first().click(); await page.waitForTimeout(30); }
  else if (await page.locator('.upgrade-list').first().isVisible().catch(() => false)) { await page.locator('button:has-text("完成升级")').click(); await page.waitForTimeout(30); }
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  guard++;
  // 完成至少2个赛季即算核心流程通过（休赛期/交易/合同视球员联赛而定，作信息展示）
  if (seasonsPlayed >= 2) break;
}
console.log('4 simTried:', simTried, 'seasonsPlayed:', seasonsPlayed, 'sawOffseason:', sawOffseason, 'sawTrade:', sawTrade, 'sawContract:', sawContract, 'guard:', guard);

// 再推进几个赛季（验证能持续运行，不要求到退役）
let extra = 0;
while (extra < 400 && seasonsPlayed < 5) {
  if (await page.locator('.sum-hero').count()) break;
  if (await page.locator('.key-game-banner').first().isVisible().catch(() => false)) {
    await page.locator('button:has-text("进入这场比赛")').click();
    await page.waitForSelector('.game-pre-card');
    await page.click('text=开始比赛');
    await page.waitForSelector('.pbl-row');
    await page.waitForTimeout(1000);
    await page.waitForSelector('text=查看技术统计', { timeout: 30000 });
    await page.click('text=查看技术统计');
    await page.waitForSelector('.game-result');
    await page.click('text=继续生涯');
    await page.waitForTimeout(60);
    continue;
  }
  if (await page.locator('.season-actions').first().isVisible().catch(() => false)) {
    await page.locator('.season-actions button:has-text("快进")').click();
    await page.waitForTimeout(25);
    continue;
  }
  if (await page.locator('.playoffs-top').first().isVisible().catch(() => false)) {
    await page.locator('button:has-text("快进本轮")').click().catch(() => {});
    await page.waitForTimeout(25);
    continue;
  }
  if (await page.locator('.season-summary').first().isVisible().catch(() => false)) {
    await page.locator('.season-summary button:has-text("继续")').click();
    await page.waitForTimeout(15);
    seasonsPlayed++;
    continue;
  }
  if (await page.locator('.offseason-hero').first().isVisible().catch(() => false)) {
    if (await page.locator('.nat-game-row').first().isVisible().catch(() => false)) {
      await page.locator('.nat-game-row').first().click();
      await page.waitForSelector('.game-pre-card');
      await page.click('text=跳过，用赛果直接判定');
      await page.waitForTimeout(100);
      continue;
    }
    await page.locator('button:has-text("进入新赛季")').click();
    await page.waitForTimeout(15);
    continue;
  }
  const opt = page.locator('.option').first();
  if (await opt.count() && await opt.isVisible().catch(() => false)) { await opt.click(); await page.waitForTimeout(10); }
  else if (await page.locator('.receipt').first().isVisible().catch(() => false)) { await page.locator('.receipt').first().click(); await page.waitForTimeout(10); }
  else if (await page.locator('.banner').first().isVisible().catch(() => false)) { await page.locator('.banner').first().click(); await page.waitForTimeout(10); }
  else if (await page.locator('.upgrade-list').first().isVisible().catch(() => false)) { await page.locator('button:has-text("完成升级")').click(); await page.waitForTimeout(10); }
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(10); }
  extra++;
}
console.log('5 额外推进: seasonsPlayed=', seasonsPlayed, 'extra=', extra, '| 状态正常');

await browser.close();
server.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
if (seasonsPlayed < 3) { console.error('FAIL: 未完成至少3个赛季'); process.exit(1); }
console.log('STANDALONE SMOKE PASS');
