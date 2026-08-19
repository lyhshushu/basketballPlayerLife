// file:// 直开冒烟测试：验证双击 index.html 能跑
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html').replace(/\\/g, '/');
const fileUrl = 'file:///' + INDEX;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

console.log('goto:', fileUrl);
await page.goto(fileUrl, { waitUntil: 'load' });
await page.waitForSelector('.home-title', { timeout: 8000 });
console.log('1 home ok:', (await page.textContent('.home-title')).trim());

// 建档 → 建球员
await page.click('text=开始生涯');
await page.waitForSelector('.name-input');
await page.fill('.name-input', '本地测试');
await page.click('text=控球后卫');
await page.click('button:has-text("开始生涯")');
await page.waitForSelector('.build-progress');
await page.waitForTimeout(300);
console.log('2 build screen ok, poolDebug:', JSON.stringify(await page.evaluate(() => window.__poolDebug)));

// 锁属性（自由选择：选球员后点任一可点属性槽）
for (let i = 0; i < 13; i++) {
  await page.click('button:has-text("随机球队")');
  try { await page.waitForSelector('.player-card', { timeout: 6000 }); }
  catch (e) { console.log('  spin fail at', i, JSON.stringify(await page.evaluate(() => window.__poolDebug))); throw e; }
  await page.locator('.player-card').first().click();
  await page.waitForSelector('.attr-lock.pickable');
  await page.locator('.attr-lock.pickable').first().click();
  await page.waitForTimeout(30);
}
await page.waitForSelector('.reveal-card');
console.log('3 reveal ok, ovr:', await page.textContent('.ro-val'));

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 10).join('\n')); process.exit(1); }
console.log('FILE:// SMOKE PASS');
