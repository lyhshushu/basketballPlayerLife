// 整合版冒烟测试：建档 → 建球员(锁属性) → 生涯 → 单场模拟
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8765;
const OUT = path.join(ROOT, 'tools', 'shots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

fs.mkdirSync(OUT, { recursive: true });

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: fs.existsSync(chromePath) ? chromePath : edgePath,
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.home-title');
  console.log('1 home ok:', (await page.textContent('.home-title')).trim());

  // 建档
  await page.click('text=开始生涯');
  await page.waitForSelector('.name-input');
  await page.fill('.name-input', '冒烟测试');
  await page.click('text=控球后卫');
  await page.click('text=开始生涯');
  await page.waitForSelector('.build-progress');
  console.log('2 build screen ok');

  // 等球员池加载
  await page.waitForFunction(async () => {
    try {
      const r = await fetch('assets/data/playerpool.json');
      const j = await r.json();
      return j && Object.keys(j).length > 20;
    } catch { return false; }
  }, { timeout: 15000 });
  console.log('3 pool loaded');

  // 锁 13 次属性
  for (let i = 0; i < 13; i++) {
    // 随机球队（等待球员池 JSON 加载完成后才能抽出球队）
    await page.click('button:has-text("随机球队")');
    try {
      await page.waitForSelector('.player-card', { timeout: 8000 });
    } catch (e) {
      console.log('  spin failed at step', i, '- pool maybe not loaded');
      throw e;
    }
    // 选第一张卡
    await page.locator('.player-card').first().click();
    // 点任一可点属性槽锁定
    await page.waitForSelector('.attr-lock.pickable');
    await page.locator('.attr-lock.pickable').first().click();
    await page.waitForTimeout(40);
  }
  await page.waitForSelector('.reveal-card');
  console.log('4 reveal ok, ovr:', await page.textContent('.ro-val'));
  await page.screenshot({ path: path.join(OUT, '1-reveal.png') });

  // 开始生涯
  await page.click('text=开始生涯');
  await page.waitForTimeout(300);
  // 可能进入 banner 或事件
  const inCareer = await page.locator('.banner, .event-card, .receipt, .topbar').count();
  console.log('5 career start, visible elements:', inCareer);
  if (inCareer === 0) throw new Error('生涯未开始');

  // 推进生涯：优先处理事件，找单场模拟入口
  let clicks = 0;
  let simTried = false;
  while (clicks < 800) {
    // 尝试进入单场模拟（若有入口）
    const simBtn = page.locator('.sim-entry');
    if (await simBtn.count()) {
      console.log('6 found game entry, entering...');
      await simBtn.click();
      await page.waitForSelector('.game-pre-card');
      await page.screenshot({ path: path.join(OUT, '2-game-pre.png') });
      simTried = true;
      break;
    }
    const gameBtn = page.locator('button:has-text("模拟")');
    if (await gameBtn.count()) {
      console.log('6b found playoff game button');
      await gameBtn.first().click();
      await page.waitForSelector('.game-pre-card');
      simTried = true;
      break;
    }
    // 普通推进
    const option = page.locator('.option').first();
    if (await option.count()) {
      await option.click();
      await page.waitForTimeout(30);
    } else if (await page.locator('.receipt').count()) {
      await page.locator('.receipt').first().click();
      await page.waitForTimeout(30);
    } else if (await page.locator('.banner').count()) {
      await page.locator('.banner').first().click();
      await page.waitForTimeout(30);
    } else {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(30);
    }
    clicks++;
  }
  console.log(`7 career loop: clicks=${clicks}, simTried=${simTried}`);

  if (simTried) {
    // 进入比赛
    await page.click('text=开始比赛');
    await page.waitForSelector('.pbl-list, .game-score');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '3-game-play.png') });
    console.log('8 game playing, logs:', await page.locator('.pbl-row').count());
    // 等待结束
    await page.waitForSelector('text=查看技术统计', { timeout: 30000 });
    await page.click('text=查看技术统计');
    await page.waitForSelector('.game-result');
    await page.screenshot({ path: path.join(OUT, '4-game-result.png') });
    console.log('9 game result:', (await page.textContent('.gr-score')).trim());
    await page.click('text=继续生涯');
    await page.waitForTimeout(300);
    console.log('10 back to career ok');
  }

  await browser.close();
  server.close();

  if (errors.length) {
    console.error('ERRORS:\n' + errors.slice(0, 10).join('\n'));
    process.exit(1);
  }
  console.log('SMOKE PASS');
}

main().catch(e => {
  console.error('SMOKE FAIL:', e.message);
  server.close();
  process.exit(1);
});
