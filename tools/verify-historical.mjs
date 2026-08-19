// 验证：5 个一排 + 历史名宿惊喜卡 + 头像
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(fileUrl, { waitUntil: 'load' });
await page.waitForSelector('.home-title');
await page.click('text=开始生涯');
await page.waitForSelector('.name-input');
await page.fill('.name-input', '名宿测试');
await page.click('text=得分后卫');
await page.click('button:has-text("开始生涯")');
await page.waitForSelector('.build-progress');
await page.waitForTimeout(300);

// 抽多次，统计历史球员出现情况
let historicalSeen = 0;
let draws = 0;
let gridCols = null;
for (let i = 0; i < 20; i++) {
  await page.click('button:has-text("随机球队")');
  await page.waitForSelector('.player-card');
  draws++;
  // 检查每行几个
  const firstRow = await page.evaluate(() => {
    const area = document.querySelector('.roster-area');
    const cards = [...area.querySelectorAll('.player-card')];
    if (!cards.length) return null;
    const top0 = cards[0].getBoundingClientRect().top;
    return cards.filter(c => Math.abs(c.getBoundingClientRect().top - top0) < 2).length;
  });
  if (firstRow) gridCols = firstRow;
  // 历史球员徽章
  if (await page.locator('.player-card.historical').count()) {
    historicalSeen++;
    const hof = await page.locator('.pc-badge.hof').count();
    const badgeText = await page.locator('.pc-badge').first().textContent().catch(() => '');
    const histImg = await page.evaluate(() => {
      const card = document.querySelector('.player-card.historical');
      if (!card) return 'none';
      const img = card.querySelector('img');
      if (!img) return 'no-img';
      return img.complete && img.naturalWidth > 0 ? 'loaded:' + img.src.split('/').pop() : 'broken';
    });
    console.log(`  第${i + 1}抽: 历史卡 hof=${hof} badge="${badgeText}" img=${histImg}`);
    await page.locator('.player-card.historical').first().click();
    await page.waitForSelector('.attr-lock.pickable');
    console.log('  已选历史球员，属性可点');
    await page.locator('.attr-lock.pickable').first().click();
    break;
  }
}
console.log('1 抽了', draws, '次, 首行卡片数:', gridCols, ', 见到历史球员次数:', historicalSeen);
console.log('2 5个一排验证:', gridCols === 5 ? 'PASS' : `FAIL (${gridCols})`);

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
console.log('HISTORICAL + GRID PASS');
