// 从 perfect-player 提取现役球员池（NBA2K_DATA 13维属性）+ 头像映射（perfect-player-pool.json），输出精简 JSON
// 用法: node tools/extract_pool.mjs [源script-01] [源pool.json] [输出json] [头像输出目录]
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2] || '../perfect-player/assets/js/hupu/script-01-2678-5hu3djrc-upload-1783494754597-12.js';
const poolSrc = process.argv[3] || '../perfect-player/assets/data/perfect-player-pool.json';
const out = process.argv[4] || 'assets/data/playerpool.json';
const imgOut = process.argv[5] || 'assets/img/player';

const raw = fs.readFileSync(src, 'utf8');
const start = raw.indexOf('{');
const end = raw.lastIndexOf('}');
if (start < 0 || end < 0) { console.error('parse error'); process.exit(1); }
let objText = raw.slice(start, end + 1);
let data;
try { data = JSON.parse(objText); }
catch (e) {
  objText = objText.replace(/�+/g, '').replace(/,(\s*[}\]])/g, '$1');
  try { data = JSON.parse(objText); } catch (e2) { console.error('nba2k parse failed:', e2.message); process.exit(1); }
}

// 读取 perfect-player-pool.json（注意编码问题，需要清洗）
let poolRaw = fs.readFileSync(poolSrc, 'utf8');
let pool = null;
try { pool = JSON.parse(poolRaw); }
catch (e) {
  // 大量中文名被损坏为 �?，替换为占位
  const cleaned = poolRaw.replace(/�+/g, '?');
  try { pool = JSON.parse(cleaned); } catch (e2) {
    // 尝试修复被破坏的引号：�? -> 结束引号
    const fixed = poolRaw.replace(/�\?/g, '?' ).replace(/"([^"]*?)�\s*",/g, '"$1?",');
    try { pool = JSON.parse(fixed); } catch (e3) { console.error('pool parse failed:', e3.message); pool = null; }
  }
}

// 构建 nameEn -> 头像信息（带变音符号归一化，如 Dončić -> Doncic）
function normName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // 去掉组合重音符号
    .replace(/[''’.]/g, '')              // 去掉撇号/点（O'Neal -> ONeal, Dončić->Doncic）
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 名字 → hupu-current 目录的文件 slug（如 "Day'Ron Sharpe" -> day-ron-sharpe）
function slugName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const photoMap = new Map();
const photoMapNorm = new Map();
const slugMap = new Map();
if (pool && pool.teams) {
  for (const team of Object.values(pool.teams)) {
    for (const p of (team.players || [])) {
      photoMap.set(p.nameEn, { nbaId: p.nbaId, photoLocal: p.photoLocal });
      photoMapNorm.set(normName(p.nameEn), { nbaId: p.nbaId, photoLocal: p.photoLocal });
      slugMap.set(slugName(p.nameEn), { nbaId: p.nbaId, photoLocal: p.photoLocal });
    }
  }
}
console.log('pool photo entries:', photoMap.size);

// 扫描 hupu-current 目录的文件 slug（补精选池未覆盖的球员）
const hupuDir = path.resolve(path.dirname(poolSrc), '../images/Player/hupu-current');
const hupuFiles = new Set();
if (fs.existsSync(hupuDir)) {
  for (const f of fs.readdirSync(hupuDir)) {
    if (f.endsWith('.png')) hupuFiles.add(f.replace(/\.png$/, ''));
  }
}
console.log('hupu-current files:', hupuFiles.size);

// 精简：每队最多 15 人，保留关键字段 + 头像
const keys = ['name', 'cname', 'pos', 'height', 'type', 'ovr',
  'threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'];

const result = {};
let withPhoto = 0, total = 0;
for (const [team, players] of Object.entries(data)) {
  if (!Array.isArray(players)) continue;
  result[team] = players.slice(0, 15).map(p => {
    const o = {};
    for (const k of keys) if (p[k] !== undefined) o[k] = p[k];
    total++;
    // 按英文名匹配头像（先精确，再归一化）
    const ph = photoMap.get(p.name) || photoMapNorm.get(normName(p.name));
    if (ph && ph.nbaId) {
      o.nbaId = ph.nbaId;
      withPhoto++;
    } else {
      // 兜底：名字 slug 直接查 hupu-current 目录（覆盖撇号/连字符变体）
      const slug = slugName(p.name);
      if (hupuFiles.has(slug)) {
        o.nbaId = 'slug:' + slug;
        withPhoto++;
      }
    }
    return o;
  });
}

fs.writeFileSync(out, JSON.stringify(result), 'utf8');

// ---------- 历史球员池（名宿/名人堂） ----------
// perfect-player-pool.json 每队 5 张历史卡，转成与现役一致的 13 维格式
const H_KEY_MAP = {
  pass: 'PAS', shotInt: 'FIN', shotExt: 'threePT', shotFree: 'MID',
  physique: 'STR', blk: 'BLK', reb: 'REB', stl: 'PDEF', speed: 'ATH', strength: 'STR',
};
const historical = [];
if (pool && pool.teams) {
  for (const team of Object.values(pool.teams)) {
    for (const p of (team.historicalPlayers || [])) {
      if (!p.nameEn) continue;
      const a = p.attrs || {};
      const attrs = {
        threePT: clampV2((a.shotExt ?? 70)),
        MID: clampV2((a.shotInt ?? 70)),
        FIN: clampV2((a.physique ?? 70)),
        DNK: clampV2((a.speed ?? 60) - 5),
        HAN: clampV2((a.pass ?? 70)),
        PAS: clampV2((a.pass ?? 70)),
        PDEF: clampV2((a.stl ?? 60)),
        IDEF: clampV2((a.blk ?? 60)),
        BLK: clampV2((a.blk ?? 55)),
        REB: clampV2((a.reb ?? 65)),
        ATH: clampV2((a.speed ?? 70)),
        STR: clampV2((a.strength ?? 65)),
        CLU: clampV2((p.peakRating ?? p.rating ?? 85) - 5),
      };
      historical.push({
        name: p.nameEn,
        cname: p.nameCn || p.name || p.nameEn,
        pos: posNumToStr(p.pos, p.pos2),
        ovr: p.peakRating || p.rating || 85,
        ...attrs,
        nbaId: p.nbaId ? 'h:' + p.nbaId : null,
        historical: true,
        tier: p.historicalTier || 'all-star',
        era: p.source && p.source.year ? p.source.year + '-' + String((p.source.year % 100) + 1).padStart(2, '0') : '',
      });
    }
  }
}
// 去重（同 nbaId）
const seenHist = new Set();
const historicalDedup = historical.filter(p => {
  const k = p.nbaId || p.name;
  if (seenHist.has(k)) return false;
  seenHist.add(k);
  return true;
});
fs.writeFileSync('assets/data/historicalpool.json', JSON.stringify(historicalDedup), 'utf8');
console.log('historical players:', historicalDedup.length, '-> assets/data/historicalpool.json');

// 拷贝历史头像到 assets/img/historical/
let histCopied = 0;
if (imgOut) {
  const histDir = path.join(imgOut, '..', 'historical');
  fs.mkdirSync(histDir, { recursive: true });
  const histSrc = path.resolve(path.dirname(poolSrc), '../images/Player/historical-nba');
  if (pool && pool.teams) {
    for (const team of Object.values(pool.teams)) {
      for (const p of (team.historicalPlayers || [])) {
        if (!p.nbaId || !p.photoLocal) continue;
        const f = path.resolve(histSrc, path.basename(p.photoLocal));
        if (fs.existsSync(f)) {
          const dest = path.join(histDir, `${p.nbaId}.png`);
          try { fs.copyFileSync(f, dest); histCopied++; } catch {}
        }
      }
    }
  }
}
console.log('historical images copied:', histCopied, '-> assets/img/historical/');

function clampV2(v) {
  return Math.max(35, Math.min(99, Math.round(v)));
}
function posNumToStr(pos, pos2) {
  const map = { 0: 'PG', 1: 'SG', 2: 'SF', 3: 'PF', 4: 'C' };
  const a = map[pos];
  const b = map[pos2];
  return a ? (b && b !== a ? `${a} / ${b}` : a) : 'SF';
}

// 拷贝匹配到的头像图片
let copied = 0;
if (imgOut) {
  fs.mkdirSync(imgOut, { recursive: true });
  const seen = new Set();
  for (const team of Object.values(result)) {
    for (const p of team) {
      if (!p.nbaId || seen.has(p.nbaId)) continue;
      seen.add(p.nbaId);
      let srcFile = null;
      const isSlug = typeof p.nbaId === 'string' && p.nbaId.startsWith('slug:');
      if (isSlug) {
        const slug = p.nbaId.slice(5);
        const f = path.join(hupuDir, `${slug}.png`);
        if (fs.existsSync(f)) srcFile = f;
      } else {
        const ph = photoMap.get(p.name) || photoMapNorm.get(normName(p.name));
        if (ph && ph.photoLocal) {
          const f = path.resolve(hupuDir, path.basename(ph.photoLocal));
          if (fs.existsSync(f)) srcFile = f;
        }
      }
      if (srcFile) {
        const dest = path.join(imgOut, `${p.nbaId}.png`);
        try { fs.copyFileSync(srcFile, dest); copied++; } catch {}
      }
    }
  }
}

console.log('teams:', Object.keys(result).length, 'players:', total, 'withPhoto:', withPhoto, 'copied:', copied, '->', out);
