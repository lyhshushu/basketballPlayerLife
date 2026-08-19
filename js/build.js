// ================= 建球员模块（移植 perfect-player 的"抽属性"流程） =================
// 流程：老虎机随机球队 → 该队抽5张球员卡 → 选球员 → 锁1项属性(跨位置衰减) → 换队循环
// 13项锁满 → 揭晓 OVR/潜力/相似球员

// 13 项属性清单（顺序即锁定顺序的展示顺序）
export const ATTR_LIST = [
  { key: 'threePT', zh: '三分', icon: '🎯' },
  { key: 'MID', zh: '中投', icon: '🎯' },
  { key: 'FIN', zh: '终结', icon: '🏀' },
  { key: 'DNK', zh: '扣篮', icon: '💥' },
  { key: 'HAN', zh: '手感', icon: '🤲' },
  { key: 'PAS', zh: '传球', icon: '🛣️' },
  { key: 'PDEF', zh: '外防', icon: '🛡️' },
  { key: 'IDEF', zh: '内防', icon: '🛡️' },
  { key: 'BLK', zh: '盖帽', icon: '🚫' },
  { key: 'REB', zh: '篮板', icon: '📊' },
  { key: 'ATH', zh: '运动', icon: '⚡' },
  { key: 'STR', zh: '力量', icon: '💪' },
  { key: 'CLU', zh: '关键', icon: '🔥' },
];

// 按位置的基础权重（决定 OVR 与成长倾向）
const OVR_WEIGHTS = {
  pg: { threePT: 0.10, MID: 0.10, FIN: 0.08, DNK: 0.03, HAN: 0.14, PAS: 0.14, PDEF: 0.10, IDEF: 0.05, BLK: 0.02, REB: 0.05, ATH: 0.09, STR: 0.04, CLU: 0.06 },
  sg: { threePT: 0.14, MID: 0.12, FIN: 0.10, DNK: 0.05, HAN: 0.10, PAS: 0.09, PDEF: 0.10, IDEF: 0.04, BLK: 0.02, REB: 0.05, ATH: 0.09, STR: 0.04, CLU: 0.06 },
  sf: { threePT: 0.11, MID: 0.10, FIN: 0.11, DNK: 0.08, HAN: 0.09, PAS: 0.08, PDEF: 0.10, IDEF: 0.05, BLK: 0.04, REB: 0.08, ATH: 0.09, STR: 0.05, CLU: 0.05 },
  pf: { threePT: 0.06, MID: 0.08, FIN: 0.13, DNK: 0.09, HAN: 0.06, PAS: 0.06, PDEF: 0.08, IDEF: 0.10, BLK: 0.08, REB: 0.12, ATH: 0.08, STR: 0.08, CLU: 0.04 },
  c:  { threePT: 0.02, MID: 0.06, FIN: 0.15, DNK: 0.10, HAN: 0.05, PAS: 0.05, PDEF: 0.06, IDEF: 0.14, BLK: 0.12, REB: 0.14, ATH: 0.06, STR: 0.08, CLU: 0.03 },
};

// 位置池
export const POS_KEYS = ['pg', 'sg', 'sf', 'pf', 'c'];
export const POS_ZH = { pg: '控球后卫', sg: '得分后卫', sf: '小前锋', pf: '大前锋', c: '中锋' };

// 加载 NBA 30 队球员池
let POOL = null;
let HIST_POOL = null;
export async function loadPool() {
  if (POOL) return POOL;
  // 单文件模式：数据已内嵌在 __POOL_INLINE
  if (typeof window !== 'undefined' && window.__POOL_INLINE) {
    POOL = window.__POOL_INLINE;
    HIST_POOL = window.__HIST_INLINE || [];
    return POOL;
  }
  const res = await fetch('assets/data/playerpool.json');
  POOL = await res.json();
  try {
    const hr = await fetch('assets/data/historicalpool.json');
    HIST_POOL = await hr.json();
  } catch { HIST_POOL = []; }
  return POOL;
}

export function poolTeamCount() {
  return POOL ? Object.keys(POOL).length : 30;
}

// 随机抽一支球队（老虎机目标）
export function randomTeam() {
  const teams = Object.keys(POOL);
  return teams[Math.floor(Math.random() * teams.length)];
}

// 从一支球队抽 N 张球员卡，20% 概率混入 1 张历史名宿惊喜卡
export function drawPlayers(teamKey, n = 5) {
  const players = POOL[teamKey] || [];
  let cards = [];
  if (players.length > 0) {
    const sorted = players.slice().sort((a, b) => b.ovr - a.ovr);
    const maxStart = Math.max(0, sorted.length - n);
    const start = Math.floor(Math.random() * (maxStart + 1));
    cards = sorted.slice(start, start + n);
  }
  // 历史名宿惊喜卡：20% 概率用一张历史球员替换某张卡
  if (HIST_POOL && HIST_POOL.length && Math.random() < 0.2) {
    const h = HIST_POOL[Math.floor(Math.random() * HIST_POOL.length)];
    const slot = Math.floor(Math.random() * cards.length);
    cards[slot] = h;
  }
  return cards;
}

// 跨位置衰减：来源位置属性均值 vs 你的位置属性均值
// 简化实现：不同位置对某些属性有自然倾向，锁定来自其他位置时轻微衰减
export function posPenalty(userPos, srcPos) {
  if (userPos === srcPos) return 1;
  const map = {
    pg: { c: 0.86, pf: 0.9, sf: 0.94, sg: 0.98 },
    sg: { c: 0.86, pf: 0.9, sf: 0.95, pg: 0.98 },
    sf: { c: 0.92, pf: 0.95, pg: 0.95, sg: 0.98 },
    pf: { pg: 0.88, sg: 0.9, sf: 0.96, c: 1.0 },
    c:  { pg: 0.84, sg: 0.88, sf: 0.94, pf: 0.98 },
  };
  return (map[userPos] && map[userPos][srcPos]) || 0.92;
}

// 计算某位置下的球员 OVR（13项加权）
export function calcOVR(attrs, userPos) {
  const w = OVR_WEIGHTS[userPos] || OVR_WEIGHTS.sf;
  let sum = 0;
  for (const { key } of ATTR_LIST) {
    const entry = attrs[key];
    const v = typeof entry === 'object' && entry !== null ? entry.value : entry;
    sum += (v ?? 60) * (w[key] || 0.05);
  }
  return Math.round(sum);
}

// 解析来源球员的位置（PG/SG → pg）
export function srcPosKey(posStr) {
  if (!posStr) return 'sf';
  const first = String(posStr).split('/')[0].trim().toLowerCase();
  return POS_KEYS.includes(first) ? first : 'sf';
}

// 从球员池里找与锁定属性最像的球员（相似球员）
export function similarPlayer(attrs, poolPlayers) {
  const all = [];
  for (const team of Object.keys(POOL)) {
    for (const p of POOL[team]) all.push(p);
  }
  let best = null, bestDist = 1e9;
  for (const p of all) {
    let dist = 0;
    for (const { key } of ATTR_LIST) {
      dist += Math.abs((p[key] ?? 60) - (attrs[key] ?? 60));
    }
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  return best;
}

// 建球员状态机
export function createBuildState(userPos) {
  return {
    step: 0,            // 已锁定属性数 0-12
    userPos,
    attrs: {},          // key -> { value, fromPlayer, fromTeam }
    lockedOrder: [],
    currentTeam: null,
    drawn: [],
    selectedPlayer: null,
    rerollsLeft: 3,
    usedTeams: [],
  };
}

export function buildProgress(state) {
  return Math.round((state.step / ATTR_LIST.length) * 100);
}

export function nextUnlocked(state) {
  const locked = new Set(state.lockedOrder);
  for (const { key } of ATTR_LIST) if (!locked.has(key)) return key;
  return null;
}

export function lockAttr(state, attrKey) {
  const p = state.selectedPlayer;
  if (!p) return null;
  const penalty = posPenalty(state.userPos, srcPosKey(p.pos));
  const val = Math.round((p[attrKey] ?? 60) * penalty);
  state.attrs[attrKey] = { value: clampV(val), fromPlayer: p.cname || p.name, fromTeam: state.currentTeam };
  state.lockedOrder.push(attrKey);
  state.step += 1;
  state.selectedPlayer = null;
  state.drawn = [];
  state.currentTeam = null;
  return state.attrs[attrKey];
}

function clampV(v) {
  return Math.max(25, Math.min(99, v));
}

// 揭晓结果
export function reveal(state) {
  const ovr = calcOVR(state.attrs, state.userPos);
  const potential = Math.min(99, Math.round(ovr + 8 + Math.random() * 10));
  const similar = similarPlayer(state.attrs, null);
  const record = {};
  for (const { key } of ATTR_LIST) {
    record[key] = state.attrs[key] ? { v: state.attrs[key].value, from: state.attrs[key].fromPlayer, team: state.attrs[key].fromTeam } : null;
  }
  return {
    ovr,
    potential,
    attrs: Object.fromEntries(ATTR_LIST.map(({ key }) => [key, state.attrs[key]?.value ?? 60])),
    similar: similar ? { name: similar.cname || similar.name, team: similarTeamOf(similar) } : null,
    record,
  };
}

function similarTeamOf(p) {
  for (const [team, players] of Object.entries(POOL || {})) {
    if (players.some(x => x.name === p.name)) return team;
  }
  return '';
}
