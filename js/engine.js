// ================= 篮球生涯模拟器 · 引擎 =================
import {
  APP_TITLE, TAGLINE, MODES, POSITIONS, COUNTRIES, LEAGUES, TEAMS, NCAA_TEAMS,
  EVENTS, SHOWDOWNS, TITLES, FAREWELL_STYLES, GOODBYE_STYLES, WALKAWAY_STYLES,
} from './data.js';

// ---------- RNG ----------
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextRng(state) {
  const fn = mulberry32(state);
  return { v: fn(), state: (fn() * 4294967296) >>> 0 || 12345 };
}

// 用一次性序列推进：确保每次调用都消耗两个随机数，行为稳定
export function roll(rngState, n = 1) {
  let s = rngState;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = nextRng(s);
    out.push(r.v);
    s = r.state;
  }
  return { v: out, state: s };
}

export function chance(rngState, p) {
  const r = roll(rngState);
  return { ok: r.v[0] < p, state: r.state };
}

export function pickWeighted(rngState, items, weightFn) {
  const total = items.reduce((s, it) => s + weightFn(it), 0);
  if (total <= 0) return { item: items[0], state: rngState };
  const r = roll(rngState);
  let t = r.v[0] * total;
  for (const it of items) {
    t -= weightFn(it);
    if (t <= 0) return { item: it, state: r.state };
  }
  return { item: items[items.length - 1], state: r.state };
}

export function genSeed() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}-${r}`;
}

// ---------- 格式化 ----------
export function fmtMoney(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 10000) {
    const y = v / 10000;
    return (y >= 100 ? Math.round(y) : y.toFixed(y >= 10 ? 1 : 2)) + '亿';
  }
  if (v >= 1000) return Math.round(v) + '万';
  return Math.round(v) + '万';
}

export function fmtInt(n) {
  if (n == null) return '0';
  return Math.round(n).toLocaleString('zh-CN');
}

export function fmtAvg(n) {
  if (n == null) return '0';
  return n.toFixed(1);
}

export function percentileOf(overall) {
  if (overall >= 99) return 99;
  if (overall >= 96) return 97;
  if (overall >= 93) return 94;
  if (overall >= 90) return 88;
  if (overall >= 87) return 80;
  if (overall >= 84) return 70;
  if (overall >= 80) return 56;
  if (overall >= 76) return 40;
  if (overall >= 72) return 25;
  if (overall >= 68) return 13;
  return 5;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function teamById(id) {
  return TEAMS[id] || null;
}

export function leagueById(id) {
  return LEAGUES[id] || null;
}

export function countryById(code) {
  return COUNTRIES[code] || null;
}

const ROLE_NAMES = ['边缘轮换', '轮换主力', '绝对主力', '队内核心', '联盟巨星'];
export const ROLE_KEYS = ['edge', 'rotation', 'starter', 'star', 'superstar'];

export function roleName(role) {
  const i = ROLE_KEYS.indexOf(role);
  return i >= 0 ? ROLE_NAMES[i] : '轮换主力';
}

export function roleFactor(role) {
  const map = { edge: 0.5, rotation: 0.72, starter: 0.92, star: 1.1, superstar: 1.26 };
  return map[role] ?? 0.92;
}

// ---------- 生涯创建 ----------
export function tournamentSchedule(maxAge = 44) {
  const list = [];
  for (let age = 18; age <= maxAge; age++) {
    if ((age - 18) % 4 === 0) list.push({ type: 'world_cup', age, qualified: null });
    if ((age - 20) % 4 === 0) list.push({ type: 'olympics', age, qualified: null });
    if ((age - 19) % 2 === 0) list.push({ type: 'continental', age, qualified: true });
  }
  return list;
}

export function newGame({ seed, mode, name, nationality, position, hand, number, domesticDreamTeamId, foreignDreamTeamId, built }) {
  const seedHash = xmur3(seed)();
  const rng = mulberry32(seedHash);
  let initial, potential;
  if (built) {
    // 建球员模式：初始能力 = 锁定属性的位置加权 OVR，潜力 = 揭晓值
    initial = clamp(Math.round(built.ovr || 60), 55, 99);
    potential = clamp(Math.round(built.potential || 85), 78, 99);
    if (potential < initial) potential = Math.min(99, initial + 6);
  } else {
    initial = clamp(58 + Math.floor(rng() * 9), 55, 66); // 16 岁初始能力
    potential = clamp(78 + Math.floor(rng() * 22) + Math.round((initial - 58) * 0.5), 78, 99);
  }
  const country = COUNTRIES[nationality];
  const pos = POSITIONS[position];
  const league = LEAGUES[country.league] || LEAGUES.eur;
  const player = {
    name: name || '未命名',
    nationality: country.zh,
    nationalityCode: nationality,
    position,
    positionZh: pos.zh,
    hand,
    number,
    age: 16,
    overall: initial,
    potential,
    debutOverall: initial,
    marketValue: marketValueOf(initial, 16, league),
    domesticDreamTeamId: domesticDreamTeamId || null,
    foreignDreamTeamId: foreignDreamTeamId || null,
    attrs: built ? { ...built.attrs } : null,
    buildRecord: built ? built.record : null,
    similarPlayer: built ? built.similar : null,
  };
  const rival = makeRival(player, rng);
  return {
    seed,
    mode,
    step: 0,
    phase: 'career',
    stage: 'youth',
    player,
    currentTeamId: null,
    contractTeamId: null,
    seasons: [],
    season: null,        // 进行中的赛季状态机（逐场模拟）
    seasonHistory: [],   // 赛季结束后的奖项/总结记录
    ncaa: {
      teamId: null,
      year: 0,          // 大一=1, 大二=2 ...
      joinedAt: null,
      stats: null,
    },
    draft: null,        // { teamId, pick, round, year } 选秀结果
    nationalTeamPeriods: [],
    totals: { apps: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, salary: 0, trophies: [], awards: [] },
    hasNationalTeamCallup: false,
    nationalTeamRetiredAge: undefined,
    tournaments: tournamentSchedule(),
    period: { periodIndex: 0, remaining: 2, run: 0, modifiers: {}, youth: true },
    currentEvent: null,
    lastEventOutcome: null,
    usedEventKeys: [],
    transfers: [],
    farewell: null,
    goodbye: null,
    walkaway: null,
    retirementReason: null,
    endingBeat: null,
    showdownWins: { last_shot: 0, free_throw: 0, game7: 0, qualifier_showdown: 0, world_cup_showdown: 0 },
    legacyLines: [],
    highlights: [],
    pendingGame: null,
    playedGames: [],
    rival,
    rivalSeries: [],
    usedRivalAges: [],
    suspensionSeasonsRemaining: 0,
    suspensionRustRemaining: 0,
    pendingTransfer: null,
    pendingWorldCupUpgrade: null,
    pendingQualifier: null,
    championsFarewellOffered: false,
    noOffersOffered: false,
    lastVoluntaryOfferAge: 0,
    usedTransferOfferAges: [],
    usedUpMoveAges: [],
    rngState: seedHash,
  };
}

function randomCountry(rng) {
  const codes = Object.keys(COUNTRIES);
  return COUNTRIES[codes[Math.floor(rng() * codes.length)]];
}

function makeRival(player, rng) {
  const sameCountry = rng() < 0.45;
  const c = sameCountry ? COUNTRIES[player.nationalityCode] : randomCountry(rng);
  const name = c.surnames[Math.floor(rng() * c.surnames.length)];
  const potential = clamp(player.potential + Math.floor(rng() * 13) - 6, 72, 99);
  const overall = clamp(player.debutOverall + Math.floor(rng() * 7) - 3, 55, 70);
  return {
    name,
    nationality: c.zh,
    position: player.position,
    overall,
    potential,
    peak: overall,
    totals: { pts: 0, champs: 0, mvp: 0, apps: 0 },
  };
}

function rivalSeason(rival, age, rng) {
  if (age <= 21) rival.overall = Math.min(rival.potential, rival.overall + (rng() < 0.75 ? 2 : 1));
  else if (age <= 29) rival.overall = Math.min(rival.potential, rival.overall + (rng() < 0.35 ? 1 : 0));
  else if (age >= 33) rival.overall = Math.max(55, rival.overall - (rng() < 0.65 ? 1 : 0));
  rival.peak = Math.max(rival.peak, rival.overall);
  const w = POSITIONS[rival.position].weight;
  const scale = clamp((rival.overall - 40) / 59, 0.05, 1);
  const ageF = ageFactor(age);
  // 宿敌也按球队角色出场比赛，规则与玩家一致
  const teamStr = 72 + rng() * 14;
  const diff = rival.overall - teamStr;
  const idx = diff <= -8 ? 0 : diff <= -3 ? 1 : diff <= 3 ? 2 : diff <= 8 ? 3 : 4;
  const role = ROLE_KEYS[clamp(idx, 0, 4)];
  const rf = roleFactor(role);
  const gameRange = { edge: [28, 46], rotation: [46, 62], starter: [60, 76], star: [68, 80], superstar: [72, 82] }[role];
  const g = Math.round((gameRange[0] + rng() * (gameRange[1] - gameRange[0])) * ageF);
  const per = (9 + 23 * scale) * w.pts * rf * (0.95 + rng() * 0.1) * ageF;
  const champ = rng() < clamp((rival.overall - 72) * 0.005 + 0.03, 0.02, 0.3);
  const mvp = rival.overall >= 86 && rng() < 0.25;
  const pts = per * g;
  rival.totals.pts += pts;
  rival.totals.apps += g;
  rival.totals.champs += champ ? 1 : 0;
  rival.totals.mvp += mvp ? 1 : 0;
  return { pts, champ, mvp, g };
}

export function marketValueOf(overall, age, league) {
  let v;
  if (overall < 75) v = 20 + (overall - 60) * 8;
  else if (overall < 85) v = 150 * Math.pow(1.35, overall - 75);
  else if (overall < 95) v = 3200 * Math.pow(1.30, overall - 85);
  else v = 46000 * Math.pow(1.22, overall - 95);
  const ageFactor =
    age <= 18 ? 0.45 : age <= 20 ? 0.6 : age <= 23 ? 0.82 :
    age <= 30 ? 1.0 : age <= 32 ? 0.82 : age <= 34 ? 0.62 : 0.45;
  const leagueFactor = { 1: 1.12, 2: 1.0, 3: 0.82, 4: 0.62 }[league.tier] ?? 0.8;
  return Math.round(v * ageFactor * leagueFactor);
}

export function salaryOf(marketValue, role) {
  const ratio = { edge: 0.10, rotation: 0.14, starter: 0.18, star: 0.20, superstar: 0.22 }[role] ?? 0.15;
  return Math.round(marketValue * ratio);
}

// ---------- 合同系统（现实 NBA 劳资风格） ----------
// 薪资单位：万美元/年；1 美元 ≈ 7 元人民币
// 新秀合同：按选秀顺位分档，4 年递增（0-2 年保障，第 3/4 年球队选项简化处理）
function rookieSalaryByPick(pick) {
  if (pick == null) return 300;
  if (pick <= 1) return 1050;
  if (pick <= 3) return 850;
  if (pick <= 10) return 550;
  if (pick <= 15) return 380;
  if (pick <= 30) return 220;
  return 120; // 次轮
}

// 按能力签合同：顶薪/准顶薪/中产/底薪
function contractTierOf(overall) {
  if (overall >= 94) return 'max';        // 超级顶薪（35%工资帽）
  if (overall >= 90) return 'near_max';   // 准顶薪（30%）
  if (overall >= 86) return 'max_lite';   // 次顶薪（25%）
  if (overall >= 82) return 'big';        // 大合同
  if (overall >= 78) return 'starter';    // 首发级
  if (overall >= 74) return 'rotation';   // 轮换级
  if (overall >= 68) return 'role';       // 角色球员
  return 'minimum';                       // 底薪
}

// 各档次年薪（万美元），对应现实 NBA 金额
const CONTRACT_YEARLY = {
  max: 4800,        // 顶薪 ~5000 万刀
  near_max: 4100,
  max_lite: 3400,
  big: 2600,
  starter: 1800,
  rotation: 1200,
  role: 700,
  minimum: 260,     // 底薪 ~250 万刀
};

// 合同年限
function contractYearsOf(tier, age) {
  if (tier === 'minimum') return 1 + (Math.random() < 0.3 ? 1 : 0);
  if (tier === 'role' || tier === 'rotation') return 2 + Math.floor(Math.random() * 2); // 2-3
  if (tier === 'starter') return 3 + Math.floor(Math.random() * 2);                    // 3-4
  return 4 + Math.floor(Math.random() * 2);                                            // 4-5（大合同）
}

// 签约：新秀 or 自由球员/续约
export function makeContract(player, team, league, opts = {}) {
  let years, annualUsd, tier;
  if (opts.draftPick != null) {
    // 新秀合同：按顺位
    tier = 'rookie';
    years = 4;
    annualUsd = rookieSalaryByPick(opts.draftPick);
  } else {
    tier = contractTierOf(player.overall);
    years = contractYearsOf(tier, player.age);
    annualUsd = CONTRACT_YEARLY[tier];
  }
  // 联赛等级影响（NBA 全额，其他联赛打折）
  const tierFactor = { 1: 1.0, 2: 0.6, 3: 0.3, 4: 0.16 }[league && league.tier] ?? 0.2;
  annualUsd = Math.round(annualUsd * tierFactor);
  return {
    teamId: team.id,
    years,
    yearsLeft: years,
    annualUsd,
    tier,
    startAge: player.age,
    extension: false,
    draftPick: opts.draftPick != null ? opts.draftPick : null,
  };
}

// 续约/新签：按当前能力给下一份合同
export function renewContract(state, team, league) {
  const role = roleFor(state, team, state.player.age, {});
  const tier = contractTierOf(state.player.overall);
  const annual = CONTRACT_YEARLY[tier];
  const tierFactor = { 1: 1.0, 2: 0.6, 3: 0.3, 4: 0.16 }[league && league.tier] ?? 0.2;
  const years = contractYearsOf(tier, state.player.age);
  state.player.contract = {
    teamId: team.id,
    years,
    yearsLeft: years,
    annualUsd: Math.round(annual * tierFactor),
    tier,
    startAge: state.player.age,
    extension: true,
  };
  return state.player.contract;
}

export function contractTierZh(tier) {
  const map = {
    rookie: '新秀合同', max: '超级顶薪', near_max: '顶薪', max_lite: '准顶薪',
    big: '大合同', starter: '首发级合同', rotation: '轮换级合同', role: '角色合同', minimum: '底薪',
  };
  return map[tier] || tier;
}

// ---------- 事件池 ----------
function youthEvents() {
  return Object.values(EVENTS).filter(e => e.minAge <= 17);
}

function poolForAge(state, age) {
  const pool = Object.values(EVENTS).filter(e => {
    if (e.minAge > age || e.maxAge < age) return false;
    if (state.usedEventKeys.includes(e.key)) return false;
    if (e.key === 'national_retire' && state.nationalTeamRetiredAge !== undefined) return false;
    if (e.key === 'home_league_offer' && state.player.nationalityCode === 'US') return false;
    return true;
  });
  // 年龄越大，越是"身体"主题
  const weighted = pool.map(e => ({ e, w: e.weight * (e.key.includes('injury') && age >= 32 ? 2 : 1) }));
  return weighted;
}

function pickEvent(state, age) {
  const pool = poolForAge(state, age);
  if (pool.length === 0) return null;
  const { item, state: s } = pickWeighted(state.rngState, pool, x => x.w);
  const ev = { ...item.e, options: item.e.options.map(o => ({ ...o })) };
  state.rngState = s;
  state.usedEventKeys.push(ev.key);
  if (state.usedEventKeys.length > 12) state.usedEventKeys.shift();
  ev.id = `${ev.key}-${state.step}`;
  return ev;
}

function signContractEvent(state) {
  const country = COUNTRIES[state.player.nationalityCode];
  const leagueId = country.league;
  const candidates = Object.values(TEAMS).filter(t => t.league === leagueId).sort((a, b) => b.strength - a.strength);
  const offers = candidates.slice(0, 4);
  // 若母国联赛没有球队（一般都有），退回欧洲联赛
  const list = offers.length >= 2 ? offers : Object.values(TEAMS).filter(t => t.league === 'eur').slice(0, 4);
  return {
    id: `sign-${state.step}`,
    type: 'sign_contract',
    title: '青训报价',
    text: `18 岁生日那天，${state.player.nationality}的几支球队给你发来了职业合同。你的第一步走哪儿。`,
    options: list.map(t => ({
      id: `sign-${t.id}`,
      label: `${t.zh}（${LEAGUES[t.league].zh}）`,
      hint: `球队强度 ${t.strength}，${t.strength >= 85 ? '豪门' : t.strength >= 78 ? '强队' : '成长空间大'}`,
      teamId: t.id,
    })),
  };
}

// ---------- NCAA 路径 ----------
// 19 岁：是否尝试 NCAA
function ncaaChoiceEvent(state) {
  const p = state.player;
  const overall = p.overall;
  const chance = clamp(0.18 + (overall - 60) * 0.025, 0.12, 0.92);
  return {
    id: `ncaa-choice-${state.step}`,
    type: 'ncaa_choice',
    title: 'NCAA，去还是不去',
    text: `${p.age} 岁，你打完了青训。美国的大学球探来了几趟，对你相当感兴趣——但要先通过 NCAA 的招募评估，才有大学愿意给你奖学金。`,
    offerChance: chance,
    options: [
      { id: 'try', label: '尝试 NCAA 招募', hint: `以你当前的能力，通过招募评估的概率约 ${Math.round(chance * 100)}%` },
      { id: 'pro', label: '直接签职业合同', hint: '留在国内联赛，踏踏实实开始职业生涯' },
    ],
  };
}

// NCAA 招募判定
function tryNcaaRecruit(state) {
  const chance = state.currentEvent ? (state.currentEvent.offerChance || 0.4) : 0.4;
  const rng = mulberry32(state.rngState);
  const ok = rng() < chance;
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  if (ok) {
    // 按能力选大学：能力越高进越强的学校
    const teams = Object.values(NCAA_TEAMS).sort((a, b) => b.strength - a.strength);
    const overall = state.player.overall;
    const idx = overall >= 88 ? 0 : overall >= 84 ? 1 : overall >= 80 ? 2 : overall >= 76 ? 3 : overall >= 72 ? 5 : overall >= 68 ? 7 : 10;
    const jitter = Math.floor(rng() * 3) - 1;
    const pickIdx = clamp(idx + jitter, 0, teams.length - 1);
    const team = teams[pickIdx];
    state.stage = 'ncaa';
    state.ncaa.teamId = team.id;
    state.ncaa.year = 1;
    state.ncaa.joinedAt = state.player.age;
    state.ncaa.stats = { g: 0, pts: 0, reb: 0, ast: 0 };
    state.currentTeamId = team.id;
    state.contractTeamId = null;
    state.lastEventOutcome = { eventKey: 'ncaa_choice', optionKey: 'try', text: `你收到了${team.zh}的奖学金邀请，准备报到。`, kind: 'positive' };
    state.legacyLines.push(`你踏进了${team.zh}的训练馆。`);
  } else {
    state.lastEventOutcome = { eventKey: 'ncaa_choice', optionKey: 'try', text: '招募评估没通过，没有大学给你奖学金。', kind: 'negative' };
    // 转回职业签约
    state.stage = 'sign';
    state.currentEvent = signContractEvent(state);
    return { state, screen: 'event' };
  }
  state.step += 1;
  state.currentEvent = null;
  return { state, screen: 'career' };
}

// NCAA 赛季推进
function ncaaStep(state, age, modifiers) {
  const team = NCAA_TEAMS[state.ncaa.teamId] || Object.values(NCAA_TEAMS)[0];
  const year = state.ncaa.year || 1;
  // 赛季状态机
  if (!state.season) {
    beginSeason(state, team, age, modifiers, 'ncaa');
  }
  if (!state.season.done) {
    return { state, screen: 'season' };
  }
  const snapshot = finishSeason(state);
  if (!snapshot) {
    return { state, screen: 'season' };
  }
  state.ncaa.stats = snapshot.stats;
  state.player.age += 1;
  // 大一结束后：选秀决策
  state.currentEvent = draftChoiceEvent(state);
  state.period.run += 1;
  return { state, screen: 'banner', snapshot };
}

function simulateNcaaSeason(state, team, age, year, modifiers) {
  const rng = mulberry32(state.rngState);
  const player = state.player;
  const suspended = modifiers.suspended;
  const injury = modifiers.injury;
  const form = 1 + (modifiers.tempDelta || 0) * 0.045;

  let role = 'starter';
  const rf = roleFactor('star');
  const af = ageFactor(age);
  const scale = clamp((player.overall - 40) / 59, 0.05, 1);
  const w = POSITIONS[player.position].weight;
  const noise = () => 0.88 + rng() * 0.24;
  const injFactor = injury ? 0.72 : 1;
  const base = {
    pts: (12 + 22 * scale) * w.pts * rf * af * injFactor * form * noise(),
    reb: (3 + 9 * scale) * w.reb * rf * af * injFactor * form * noise(),
    ast: (2 + 7 * scale) * w.ast * rf * af * injFactor * form * noise(),
    stl: (0.6 + 2 * scale) * w.stl * rf * af * injFactor * form * noise(),
    blk: (0.4 + 1.8 * scale) * w.blk * rf * af * injFactor * form * noise(),
  };
  const g = suspended ? 0 : Math.round((30 + Math.floor(rng() * 6)) * (injury ? 0.62 : 1));
  const stats = {
    g,
    pts: base.pts * g,
    reb: base.reb * g,
    ast: base.ast * g,
    stl: base.stl * g,
    blk: base.blk * g,
    avg: { pts: base.pts, reb: base.reb, ast: base.ast, stl: base.stl, blk: base.blk },
  };

  // NCAA 战绩
  const teamPower = team.strength * 0.62 + player.overall * 0.38 + roleFactor(role) * 1.5;
  let champP = clamp(0.03 + (teamPower - 72) * 0.005, 0.015, 0.3);
  const r1 = rng();
  let result;
  if (r1 < champP) result = { league: 'champion' };
  else if (r1 < champP + champP * 0.5) result = { league: 'final' };
  else if (r1 < champP * 2) result = { league: 'semis' };
  else if (r1 < champP * 3) result = { league: 'quarters' };
  else if (r1 < champP * 4) result = { league: 'playoffs' };
  else result = { league: 'missed' };

  const awards = [];
  if (!suspended && g > 0) {
    if (player.overall >= 76 && rng() < 0.7) awards.push('allstar');
    if (player.overall >= 82 && rng() < 0.55) awards.push('all_team');
    if (player.overall >= 80 && rng() < 0.5) awards.push('mvp');
    if (result.league === 'champion' && player.overall >= 82 && rng() < 0.6) awards.push('fmvp');
  }
  const trophies = [];
  if (result.league === 'champion') trophies.push('ncaa:champion');

  // 能力成长（NCAA 是涨球期，成长加速）
  const dev = develop(player, age, rng);
  player.overall = dev;

  let highlight = null;
  if (!suspended && g > 0) {
    const a = stats.avg;
    if (a.pts >= 28) highlight = `NCAA 场均 ${a.pts.toFixed(1)} 分`;
    else if (result.league === 'champion' && awards.includes('fmvp')) highlight = 'NCAA总冠军 + 四强赛MVP';
    else if (awards.includes('mvp')) highlight = 'NCAA 全美最佳球员';
    else if (a.pts >= 23 && rng() < 0.2) highlight = 'NCAA 单场轰下 40+ 分';
  }

  const snapshot = {
    age,
    teamId: team.id,
    leagueId: 'ncaa',
    overall: player.overall,
    role,
    suspended: !!suspended,
    stats,
    result,
    cup: null,
    trophies,
    awards,
    salary: 0,
    marketValue: marketValueOf(player.overall, age, LEAGUES.ncaa),
    highlight,
    note: `NCAA 大一赛季`,
    ncaaYear: year,
  };
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return snapshot;
}

// 选秀决策事件
function draftChoiceEvent(state) {
  const p = state.player;
  const year = state.ncaa.year || 1;
  const proj = draftProjection(p.overall);
  return {
    id: `draft-choice-${state.step}`,
    type: 'draft_choice',
    title: '参选 or 留校',
    text: `${p.age} 岁，${NCAA_TEAMS[state.ncaa.teamId].zh}的这个赛季结束了。球探报告把你的选秀前景评为：${proj.zh}（预计 ${proj.pickText}）。`,
    projection: proj,
    options: [
      { id: 'declare', label: '宣布参加 NBA 选秀', hint: `预计${proj.pickText}` },
      { id: 'stay', label: '留校再打一年', hint: '提升顺位，赌一个更好的前途' },
      { id: 'transfer', label: '退出 NCAA 转职业', hint: '签本国联赛合同，开始挣钱' },
    ],
  };
}

function draftProjection(overall) {
  if (overall >= 94) return { zh: '状元热门', pickText: '前 3 顺位', min: 1, max: 3 };
  if (overall >= 89) return { zh: '乐透新秀', pickText: '乐透区（前 14）', min: 1, max: 14 };
  if (overall >= 84) return { zh: '首轮秀', pickText: '首轮中段', min: 8, max: 30 };
  if (overall >= 79) return { zh: '次轮前景', pickText: '次轮（31-45）', min: 31, max: 45 };
  if (overall >= 75) return { zh: '边缘新秀', pickText: '次轮末段', min: 40, max: 55 };
  return { zh: '落选边缘', pickText: '大概率落选', min: 50, max: 60, undraftedHigh: true };
}

function resolveDraftChoice(state, optionId) {
  if (optionId === 'stay') {
    state.ncaa.year += 1;
    if (state.ncaa.year >= 5) {
      // 大五还不走，强制转职业
      state.lastEventOutcome = { eventKey: 'draft_choice', optionKey: 'stay', text: '你在大学待了四年，决定正式进入职业。', kind: 'neutral' };
      state.stage = 'sign';
      state.currentEvent = signContractEvent(state);
      state.step += 1;
      return { state, screen: 'event' };
    }
    state.lastEventOutcome = { eventKey: 'draft_choice', optionKey: 'stay', text: `你决定再留一年，大${numToCn(state.ncaa.year)}继续打 NCAA。`, kind: 'neutral' };
    state.step += 1;
    state.currentEvent = null;
    return { state, screen: 'career' };
  }
  if (optionId === 'transfer') {
    state.lastEventOutcome = { eventKey: 'draft_choice', optionKey: 'transfer', text: '你退出 NCAA，准备签职业合同。', kind: 'neutral' };
    state.stage = 'sign';
    state.currentEvent = signContractEvent(state);
    state.step += 1;
    return { state, screen: 'event' };
  }
  // declare: 参选
  return runDraft(state);
}

function numToCn(n) {
  return ['零', '一', '二', '三', '四', '五'][n] || String(n);
}

function runDraft(state) {
  const p = state.player;
  const proj = draftProjection(p.overall);
  const rng = mulberry32(state.rngState);
  const pick = proj.min + Math.floor(rng() * Math.max(1, proj.max - proj.min + 1));
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  const round = pick <= 30 ? 1 : 2;
  // 落选概率：能力越低越可能落选
  const undraftP = p.overall < 73 ? 0.65 : p.overall < 76 ? 0.35 : 0.12;
  const undrafted = pick > 60 || rng() < undraftP;

  if (undrafted) {
    state.draft = { pick: null, round: null, year: state.player.age, undrafted: true };
    state.lastEventOutcome = { eventKey: 'draft_choice', optionKey: 'declare', text: '选秀大会你没被念到名字，落选了。', kind: 'negative' };
    state.legacyLines.push('选秀落选，你低着头离开了小绿屋。');
    state.stage = 'sign';
    state.currentEvent = signContractEvent(state);
    state.step += 1;
    return { state, screen: 'event' };
  }

  // 被选中：顺位越高进越弱的球队（重建队更容易拿高顺位）
  const nbaTeams = Object.values(TEAMS).filter(t => t.league === 'nba').sort((a, b) => a.strength - b.strength);
  // pick 1 给最弱队，pick 末给强队
  const slot = Math.min(nbaTeams.length - 1, Math.floor((pick - 1) / 2));
  const jitter = Math.floor(rng() * 3) - 1;
  const team = nbaTeams[clamp(slot + jitter, 0, nbaTeams.length - 1)];
  state.draft = { teamId: team.id, pick, round, year: state.player.age, undrafted: false };
  state.currentTeamId = team.id;
  state.contractTeamId = team.id;
  state.stage = 'pro';
  state.pendingGame = null;
  state.player.contract = makeContract(state.player, team, LEAGUES.nba, { draftPick: pick });
  state.lastEventOutcome = {
    eventKey: 'draft_choice',
    optionKey: 'declare',
    text: `选秀大会第 ${pick} 顺位，${team.zh} 选中了你！签下新秀合同（${fmtMoney(state.player.contract.annualUsd * 7)}/年 × ${state.player.contract.years} 年）。`,
    kind: 'positive',
  };
  state.legacyLines.push(`第 ${pick} 顺位，你被 ${team.zh} 选中。`);
  state.player.marketValue = marketValueOf(state.player.overall, state.player.age, LEAGUES.nba);
  state.step += 1;
  state.currentEvent = null;
  return { state, screen: 'career' };
}

function transferChooseEvent(state) {
  const cur = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  const curTier = cur ? LEAGUES[cur.league].tier : 3;
  const candidates = Object.values(TEAMS).filter(t => {
    if (cur && t.id === cur.id) return false;
    const tier = LEAGUES[t.league].tier;
    // 逐级晋升：候选联赛限制在当前 tier 上下各一级（最低 tier1 封顶，不可从低直接跳顶级）
    return tier <= Math.min(5, curTier + 1) && tier >= Math.max(1, curTier - 1);
  });
  const picked = [];
  const rng = mulberry32(state.rngState ^ 0x9e3779b9);
  const sorted = candidates.sort((a, b) => b.strength * (LEAGUES[b.league].tier === 1 ? 1.08 : 1) - a.strength * (LEAGUES[a.league].tier === 1 ? 1.08 : 1));
  const first = sorted[0];
  picked.push(first);
  for (let i = 1; i < sorted.length && picked.length < 3; i++) {
    if (rng() < 0.35 && Math.abs(sorted[i].strength - first.strength) > 3) picked.push(sorted[i]);
  }
  if (picked.length < 2 && sorted.length > 1) picked.push(sorted[1]);
  state.rngState = (mulberry32(state.rngState)(0) * 4294967296) >>> 0 || 12345;
  return {
    id: `transfer-${state.step}`,
    type: 'transfer_choose',
    title: '新东家',
    text: '经纪人摆出几份报价，你看着那些队徽，做了一个决定。',
    options: picked.map(t => ({
      id: `tf-${t.id}`,
      label: `${t.zh}`,
      hint: `${LEAGUES[t.league].zh} · 强度 ${t.strength}${t.id === state.player.foreignDreamTeamId || t.id === state.player.domesticDreamTeamId ? ' · 你的儿时主队！' : ''}`,
      teamId: t.id,
    })),
  };
}

// ---------- 赛季模拟 ----------
function roleFor(state, team, age, modifiers) {
  const diff = state.player.overall - team.strength;
  let idx =
    diff <= -8 ? 0 : diff <= -3 ? 1 : diff <= 3 ? 2 : diff <= 8 ? 3 : 4;
  if (age <= 18) idx = Math.max(0, idx - 1);
  if (age >= 33 && idx >= 2) idx -= 1;
  if (age >= 36 && idx >= 3) idx -= 1;
  idx = clamp(idx + (modifiers.roleShift || 0), 0, 4);
  return ROLE_KEYS[idx];
}

function ageFactor(age) {
  if (age <= 18) return 0.72;
  if (age <= 21) return 0.88;
  if (age <= 29) return 1.0;
  if (age <= 32) return 0.94;
  if (age <= 34) return 0.84;
  if (age <= 36) return 0.7;
  return 0.55;
}

function simulateSeason(state, team, age, modifiers) {
  const rng = mulberry32(state.rngState);
  const player = state.player;
  const league = LEAGUES[team.league];
  const suspended = modifiers.suspended;
  const injury = modifiers.injury;
  const form = 1 + (modifiers.tempDelta || 0) * 0.045;

  let role, g, stats;
  if (suspended) {
    role = 'edge';
    g = 0;
    stats = { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  } else {
    role = roleFor(state, team, age, modifiers);
    const rf = roleFactor(role);
    const af = ageFactor(age);
    const lf = { 1: 1.0, 2: 0.96, 3: 0.9, 4: 0.84 }[league.tier] ?? 0.9;
    const scale = clamp((player.overall - 40) / 59, 0.05, 1);
    const w = POSITIONS[player.position].weight;
    const noise = () => 0.88 + rng() * 0.24;
    const injFactor = injury ? 0.72 : 1;
    const base = {
      pts: (9 + 23 * scale) * w.pts * rf * af * lf * injFactor * form * noise(),
      reb: (2.5 + 8.5 * scale) * w.reb * rf * af * lf * injFactor * form * noise(),
      ast: (1.8 + 7.2 * scale) * w.ast * rf * af * lf * injFactor * form * noise(),
      stl: (0.5 + 2.0 * scale) * w.stl * rf * af * lf * injFactor * form * noise(),
      blk: (0.35 + 1.8 * scale) * w.blk * rf * af * lf * injFactor * form * noise(),
    };
    const gameRange = { edge: [28, 46], rotation: [46, 62], starter: [60, 76], star: [68, 80], superstar: [72, 82] }[role];
    const rawG = gameRange[0] + rng() * (gameRange[1] - gameRange[0]);
    g = Math.round(rawG * (league.games / 82) * (injury ? 0.62 : 1));
    stats = {
      g,
      pts: base.pts * g,
      reb: base.reb * g,
      ast: base.ast * g,
      stl: base.stl * g,
      blk: base.blk * g,
      avg: { pts: base.pts, reb: base.reb, ast: base.ast, stl: base.stl, blk: base.blk },
    };
  }

  // 球队战绩
  const teamPower = team.strength * 0.62 + player.overall * 0.38 + roleFactor(role) * 1.5;
  let champP = clamp(0.03 + (teamPower - 74) * 0.005, 0.015, 0.34);
  champP *= { 1: 1.18, 2: 1.0, 3: 0.9, 4: 0.75 }[league.tier] ?? 0.9;
  if (modifiers.trophyMult) champP *= modifiers.trophyMult;
  if (suspended) champP *= 0.7;

  const r1 = rng();
  let result;
  if (r1 < champP) result = { league: 'champion' };
  else if (r1 < champP + champP * 0.55) result = { league: 'final' };
  else if (r1 < champP * 2.2) result = { league: 'semis' };
  else if (r1 < champP * 3.4) result = { league: 'quarters' };
  else if (r1 < champP * 4.6) result = { league: 'playoffs' };
  else result = { league: 'missed' };

  let cup = null;
  if (league.cup && !suspended) {
    if (rng() < champP * 0.8) cup = 'cup_champion';
    else if (rng() < champP * 0.6) cup = 'cup_final';
  }

  // 个人奖项
  const awards = [];
  if (!suspended && g > 0) {
    if (player.overall >= 78 && rng() < 0.75) awards.push('allstar');
    if (player.overall >= 84 && rng() < 0.65) awards.push('all_team');
    if (player.overall >= 86 && rng() < 0.4) awards.push('mvp');
    if (result.league === 'champion' && player.overall >= 84 && rng() < 0.55) awards.push('fmvp');
    if (player.overall >= 84 && rng() < 0.35 && ['pf', 'c'].includes(player.position)) awards.push('dpoy');
    if (player.overall >= 86 && rng() < 0.45 && ['sg', 'sf', 'pg'].includes(player.position)) awards.push('scoring_title');
    if (player.overall >= 85 && rng() < 0.35 && ['pf', 'c'].includes(player.position)) awards.push('rebound_title');
    if (player.overall >= 85 && rng() < 0.35 && player.position === 'pg') awards.push('assist_title');
  }

  const trophies = [];
  if (result.league === 'champion') trophies.push(`league:${team.league}`);
  if (cup === 'cup_champion') trophies.push(`cup:${team.league}`);

  const marketValue = marketValueOf(player.overall, age, league);
  // 薪资：优先用合同年薪，无合同则按能力估
  let salary;
  if (player.contract && player.contract.teamId === team.id) {
    // 合同按年限递增（新秀合同前几年低，之后涨）
    const contractYears = player.contract.years || 1;
    const progress = contractYears - (player.contract.yearsLeft || 0);
    const grow = 1 + progress * 0.08;
    salary = (player.contract.annualUsd || 1000) * 7 * grow * (modifiers.salaryMult || 1);
  } else {
    const tier = contractTierOf(player.overall);
    const tierFactor = { 1: 1.0, 2: 0.6, 3: 0.3, 4: 0.16 }[league && league.tier] ?? 0.2;
    salary = CONTRACT_YEARLY[tier] * tierFactor * 7 * (modifiers.salaryMult || 1);
  }
  salary = Math.round(salary);

  // 赛季结束后的能力成长/下滑
  const dev = develop(player, age, rng);
  player.overall = dev;

  let highlight = null;
  if (!suspended && g > 0) {
    const a = stats.avg;
    if (a.pts >= 30) highlight = `单赛季场均 ${a.pts.toFixed(1)} 分`;
    else if (a.pts >= 24 && a.reb >= 10 && a.ast >= 10) highlight = `单赛季场均 ${a.pts.toFixed(1)} 分 ${a.reb.toFixed(1)} 板 ${a.ast.toFixed(1)} 助`;
    else if (result.league === 'champion' && awards.includes('fmvp')) highlight = '总冠军 + 总决赛MVP';
    else if (awards.includes('mvp')) highlight = '荣膺常规赛MVP';
    else if (awards.includes('scoring_title')) highlight = '荣膺得分王';
    else if (awards.includes('dpoy')) highlight = '荣膺最佳防守球员';
    else if (awards.includes('allstar_mvp')) highlight = '全明星MVP';
    else if (a.pts >= 23 && rng() < 0.22) highlight = '单场轰下 50+ 分';
  }

  const snapshot = {
    age,
    teamId: team.id,
    leagueId: team.league,
    overall: player.overall,
    role,
    suspended: !!suspended,
    stats,
    result,
    cup,
    trophies,
    awards,
    salary,
    marketValue,
    highlight,
    note: null,
  };

  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return { snapshot, rng };
}

// ---------- 属性升级 ----------
const ATTR_KEYS = ['threePT', 'MID', 'FIN', 'DNK', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU'];
export function upgradeAttr(state, key, points = 1) {
  const bank = state.player.growthBank || 0;
  if (bank < points) return { ok: false, reason: '点数不足' };
  if (!ATTR_KEYS.includes(key)) return { ok: false, reason: '未知属性' };
  const attrs = state.player.attrs || (state.player.attrs = fallbackAttrs(state.player.overall));
  const cur = attrs[key] || 60;
  if (cur >= 99) return { ok: false, reason: '已到上限' };
  attrs[key] = Math.min(99, cur + points);
  state.player.growthBank = bank - points;
  // 重算 overall：13 项平均 + 少量位置权重
  state.player.overall = Math.min(99, Math.round(
    ATTR_KEYS.reduce((s, k) => s + (attrs[k] || 60), 0) / ATTR_KEYS.length + 6
  ));
  return { ok: true, attrs, overall: state.player.overall, bank: state.player.growthBank };
}

function fallbackAttrs(ovr) {
  const o = ovr || 70;
  return {
    threePT: o - 8, MID: o - 5, FIN: o - 3, DNK: o - 6, HAN: o - 3,
    PAS: o - 4, PDEF: o - 5, IDEF: o - 5, BLK: o - 9, REB: o - 6,
    ATH: o - 3, STR: o - 4, CLU: o - 3,
  };
}

export function recalcOverall(state) {
  const attrs = state.player.attrs || fallbackAttrs(state.player.overall);
  state.player.overall = Math.min(99, Math.round(
    ATTR_KEYS.reduce((s, k) => s + (attrs[k] || 60), 0) / ATTR_KEYS.length + 6
  ));
  return state.player.overall;
}

// 属性年成长：年轻时随机提升 2-4 项属性，35 岁后逐年随机减少（随年龄加重）
function annualAttributeGrowth(state, age) {
  const attrs = state.player.attrs || (state.player.attrs = fallbackAttrs(state.player.overall));
  const log = { age, gains: [], losses: [] };
  const rng = mulberry32((state.rngState || 12345) ^ 0xabcd);
  let n, deltaMin, deltaMax;
  if (age <= 24) { n = 3 + Math.floor(rng() * 2); deltaMin = 1; deltaMax = 3; }        // 成长爆发期
  else if (age <= 28) { n = 2 + Math.floor(rng() * 2); deltaMin = 1; deltaMax = 2; }   // 上升期
  else if (age <= 31) { n = 1 + Math.floor(rng() * 2); deltaMin = 1; deltaMax = 2; }   // 巅峰期
  else if (age <= 34) { n = 1 + Math.floor(rng() * 2); deltaMin = 0; deltaMax = 1; }   // 平稳期
  else if (age <= 36) { n = 2 + Math.floor(rng() * 2); deltaMin = -1; deltaMax = -1; } // 下滑开始
  else if (age <= 38) { n = 2 + Math.floor(rng() * 2); deltaMin = -2; deltaMax = -1; }
  else { n = 3 + Math.floor(rng() * 2); deltaMin = -3; deltaMax = -1; }                // 末期
  const keys = ATTR_KEYS.slice().sort(() => rng() - 0.5).slice(0, Math.min(n, ATTR_KEYS.length));
  for (const k of keys) {
    const cur = attrs[k] || 60;
    const delta = deltaMin + Math.floor(rng() * (deltaMax - deltaMin + 1));
    if (delta === 0) continue;
    const next = clamp(cur + delta, 35, 99);
    attrs[k] = next;
    if (delta > 0) log.gains.push(`${k} +${delta}`);
    else log.losses.push(`${k} ${delta}`);
  }
  // 重算 overall，受潜力约束
  const avg = Math.round(ATTR_KEYS.reduce((s, k) => s + (attrs[k] || 60), 0) / ATTR_KEYS.length + 6);
  const cap = Math.max(60, state.player.potential || 95);
  state.player.overall = clamp(Math.min(avg, cap), 40, 99);
  return log;
}

// ---------- 逐场赛季状态机 ----------
// beginSeason: 赛季开始，预生成赛季计划（结果/奖项/场均目标/成长），生成赛程
export function beginSeason(state, team, age, modifiers, kind = 'pro') {
  const planFn = kind === 'ncaa'
    ? (s, t, a, m) => simulateNcaaSeason(s, t, a, (s.ncaa && s.ncaa.year) || 1, m)
    : simulateSeason;
  const devBefore = state.player.overall;
  const planResult = planFn(state, team, age, modifiers);
  const snapshot = planResult && planResult.snapshot ? planResult.snapshot : planResult;
  state.player.overall = devBefore; // 赛季中显示赛季初能力，成长等赛季结束再应用
  const league = LEAGUES[team.league];
  const totalGames = league ? league.games : 82;
  // 赛程：同联赛随机对手（排除自己），主客场交替
  const oppPool = kind === 'ncaa' ? Object.values(NCAA_TEAMS).filter(t => t.id !== team.id)
    : Object.values(TEAMS).filter(t => t.league === team.league && t.id !== team.id);
  const schedule = [];
  const rng = mulberry32(state.rngState ^ 0x2f2f);
  for (let i = 0; i < totalGames; i++) {
    const opp = oppPool.length ? oppPool[Math.floor(rng() * oppPool.length)]
      : (kind === 'ncaa' ? Object.values(NCAA_TEAMS)[0] : Object.values(TEAMS).find(t => t.id !== team.id));
    schedule.push({ oppId: opp ? opp.id : null, home: i % 2 === 0 });
  }
  // 为每队生成固定 roster（首次按需缓存）
  const rosters = makeSeasonRosters(state, team, schedule, kind);
  state.season = {
    kind,
    teamId: team.id,
    leagueId: snapshot.leagueId || (LEAGUES[team.league] ? team.league : null),
    totalGames,
    played: 0,
    plan: snapshot,
    baseAvg: snapshot.stats && snapshot.stats.avg ? { ...snapshot.stats.avg } : { pts: 10, reb: 5, ast: 3, stl: 1, blk: 1 },
    myStats: { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
    wins: 0,
    losses: 0,
    schedule,
    rosters,
    games: [],
    done: false,
  };
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return state.season;
}

// 生成球队 roster（含我方球员插队 + 对手生成球员），供单场 box 展示
// 真实 NBA 球员池（由 UI 在建球员/加载 pool 时注入）
let __nbaPool = null;
export function setNbaPool(pool) {
  __nbaPool = pool || null;
}
export function nbaPoolTeam(key) {
  return __nbaPool ? (__nbaPool[key] || null) : null;
}

function makeSeasonRosters(state, team, schedule, kind) {
  const teams = new Map();
  const table = kind === 'ncaa' ? NCAA_TEAMS : TEAMS;
  teams.set(team.id, makeSeasonRoster(state, team, mulberry32(0x1234)));
  for (const g of schedule) {
    if (g.oppId && !teams.has(g.oppId)) {
      const opp = table[g.oppId];
      if (opp) teams.set(g.oppId, makeSeasonRoster(state, opp, mulberry32(0x5678 + g.oppId.length)));
    }
  }
  // 把上一休赛期生成的新秀注入各队 roster（NBA 联赛，每队最多 1 个新秀）
  if (kind === 'pro' && state.rookiePool && state.rookiePool.length) {
    const pool = state.rookiePool.slice();
    for (const [tid, roster] of teams) {
      if (!pool.length) break;
      if (roster.length >= 12) continue;
      const rookie = pool.shift();
      if (rookie && !roster.some(p => p.name === rookie.name)) {
        roster.push({
          name: rookie.name,
          pos: rookie.pos,
          ovr: rookie.ovr,
          starter: false,
          isMe: false,
          rookie: true,
          attrs: rookie.attrs || attrsForOvr(rookie.ovr, rookie.pos),
          g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
        });
      }
    }
    // 已注入的从池中移除（避免每赛季重复）
    state.rookiePool = [];
  }
  return teams;
}

function makeSeasonRoster(state, team, rng) {
  const isMine = team.id === state.currentTeamId;
  const roster = [];
  // NBA 球队优先使用真实球员池
  if (__nbaPool && LEAGUES[team.league] && LEAGUES[team.league].tier === 1) {
    const real = __nbaPool[team.abbr.toUpperCase()] || [];
    if (real && real.length >= 5) {
      const sorted = real.slice().sort((a, b) => b.ovr - a.ovr);
      sorted.slice(0, 9).forEach((p, i) => {
        const pos = mainPosOf(p.pos);
        roster.push({
          name: p.cname || p.name,
          en: p.name,
          pos,
          ovr: p.ovr,
          starter: i < 5,
          isMe: false,
          nbaId: p.nbaId,
          attrs: {
            threePT: p.threePT ?? p.ovr - 5, MID: p.MID ?? p.ovr - 3, FIN: p.FIN ?? p.ovr - 2,
            DNK: p.DNK ?? p.ovr - 6, HAN: p.HAN ?? p.ovr - 2, PAS: p.PAS ?? p.ovr - 3,
            PDEF: p.PDEF ?? p.ovr - 4, IDEF: p.IDEF ?? p.ovr - 4, BLK: p.BLK ?? p.ovr - 8,
            REB: p.REB ?? p.ovr - 5, ATH: p.ATH ?? p.ovr - 3, STR: p.STR ?? p.ovr - 2,
            CLU: p.CLU ?? p.ovr - 2,
          },
          g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
        });
      });
      if (isMine) {
        const mePos = POSITIONS[state.player.position].en;
        roster[0] = {
          name: state.player.name, en: state.player.name, pos: mePos, ovr: state.player.overall,
          starter: true, isMe: true,
          attrs: state.player.attrs || attrsForOvr(state.player.overall, mePos),
          g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
        };
      }
      return roster;
    }
  }

  // 其他球队：生成虚拟球员
  const surnames = surnamesForTeam(team);
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const usedNames = new Set();
  const n = 9; // 首发5 + 替补4
  for (let i = 0; i < n; i++) {
    const starter = i < 5;
    const base = team.strength + (starter ? 6 : -4);
    const ovr = clamp(Math.round(base + rng() * 10 - 5), 55, 99);
    // 避免同名：姓氏 + 序号（如 张·7 号）
    let name = surnames[Math.floor(rng() * surnames.length)];
    let counter = 0;
    while (usedNames.has(name)) { counter++; name = surnames[Math.floor(rng() * surnames.length)] + (counter > 0 ? `·${counter}` : ''); }
    usedNames.add(name);
    const p = {
      name, pos: positions[i % 5], ovr,
      starter,
      attrs: attrsForOvr(ovr, positions[i % 5]),
      g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    };
    roster.push(p);
  }
  if (isMine) {
    // 我方球员插入首发
    const mePos = POSITIONS[state.player.position].en;
    roster[0] = {
      name: state.player.name, pos: mePos, ovr: state.player.overall,
      starter: true, isMe: true,
      attrs: state.player.attrs || attrsForOvr(state.player.overall, mePos),
      g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    };
  }
  return roster;
}

function mainPosOf(posStr) {
  if (!posStr) return 'SF';
  const first = String(posStr).split('/')[0].trim().toUpperCase();
  return ['PG', 'SG', 'SF', 'PF', 'C'].includes(first) ? first : 'SF';
}

// 根据 OVR 和位置生成 13 项能力值
const POS_ATTR_BIAS = {
  PG: { threePT: 6, MID: 5, HAN: 8, PAS: 8, PDEF: 4, ATH: 4 },
  SG: { threePT: 7, MID: 6, FIN: 3, HAN: 4, PAS: 3 },
  SF: { threePT: 2, MID: 3, FIN: 5, DNK: 4, PDEF: 3, ATH: 4 },
  PF: { MID: 1, FIN: 5, DNK: 5, IDEF: 5, BLK: 3, REB: 6, STR: 5 },
  C: { FIN: 5, DNK: 4, IDEF: 7, BLK: 7, REB: 8, STR: 7, ATH: 2 },
};
function attrsForOvr(ovr, pos) {
  const bias = POS_ATTR_BIAS[pos] || {};
  const attrs = {};
  for (const k of ATTR_KEYS) {
    const b = bias[k] || 0;
    attrs[k] = clamp(ovr - 8 + b + Math.floor(Math.random() * 7) - 3, 40, 99);
  }
  return attrs;
}

function surnamesForTeam(team) {
  const lg = LEAGUES[team.league];
  const country = lg ? COUNTRIES[lg.country] : null;
  if (country && country.surnames) return country.surnames;
  return ['张', '王', '李', '刘', '陈', '杨', '赵', '周'];
}

// 模拟接下来的 n 场比赛（可一次多场或逐场），返回新产生的比赛记录
export function simNextGames(state, n = 1) {
  const season = state.season;
  if (!season || season.done) return [];
  const out = [];
  const rng = mulberry32(state.rngState);
  const teamTable = season.kind === 'ncaa' ? NCAA_TEAMS : TEAMS;
  for (let k = 0; k < n && !season.done; k++) {
    const idx = season.played;
    const g = season.schedule[idx];
    const opp = g && g.oppId ? teamTable[g.oppId] : null;
    const homeTeam = teamTable[season.teamId];
    if (!homeTeam) { season.done = true; break; }
    const game = simOneLeagueGame(state, season, homeTeam, opp, g ? g.home : true, rng);
    season.games.push(game);
    season.played += 1;
    if (game.win) season.wins += 1; else season.losses += 1;
    season.myStats.g += 1;
    season.myStats.pts += game.my.pts;
    season.myStats.reb += game.my.reb;
    season.myStats.ast += game.my.ast;
    season.myStats.stl += game.my.stl;
    season.myStats.blk += game.my.blk;
    out.push(game);
    // 赛季中交易：低概率触发，涉及 OVR>80 才提示
    if (season.kind === 'pro' && rng() < 0.02) {
      const trade = tryGenerateTrade(state, season, teamTable, rng);
      if (trade) {
        state.pendingTrades = state.pendingTrades || [];
        state.pendingTrades.push(trade);
      }
    }
    if (season.played >= season.totalGames) season.done = true;
  }
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return out;
}

// 生成一笔联盟交易；若涉及能力>80 的球员则返回提示信息
function tryGenerateTrade(state, season, teamTable, rng) {
  const teams = Object.values(TEAMS).filter(t => t.league === season.leagueId);
  if (teams.length < 3) return null;
  const teamA = teams[Math.floor(rng() * teams.length)];
  let teamB = teams[Math.floor(rng() * teams.length)];
  let guard = 0;
  while (teamB.id === teamA.id && guard++ < 10) teamB = teams[Math.floor(rng() * teams.length)];
  // 从两队 roster 各取一个 OVR>75 的球员做交易
  const rosterA = season.rosters.get(teamA.id) || [];
  const rosterB = season.rosters.get(teamB.id) || [];
  const candA = rosterA.filter(p => p.ovr >= 75 && !p.isMe);
  const candB = rosterB.filter(p => p.ovr >= 75 && !p.isMe);
  if (!candA.length || !candB.length) return null;
  const pA = candA[Math.floor(rng() * candA.length)];
  const pB = candB[Math.floor(rng() * candB.length)];
  const notable = Math.max(pA.ovr, pB.ovr) >= 80;
  return {
    age: state.player.age,
    teamA: teamA.zh,
    teamB: teamB.zh,
    fromAToB: pA.name,
    fromBToA: pB.name,
    ovrA: pA.ovr,
    ovrB: pB.ovr,
    notable,
  };
}

// 玩家申请交易：按能力和球队意愿判定
export function requestTrade(state) {
  const team = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  if (!team || !state.season) return { ok: false, reason: '暂无球队' };
  const season = state.season;
  const rng = mulberry32(state.rngState);
  // 能力越强、出场越多越容易达成
  const p = clamp(0.15 + (state.player.overall - 70) * 0.012 + (season.myStats.g >= 40 ? 0.1 : 0), 0.1, 0.6);
  const success = rng() < p;
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  if (!success) {
    return { ok: false, reason: 'chance', pct: Math.round(p * 100) };
  }
  // 成功：交易到同联赛另一支球队
  const cands = Object.values(TEAMS).filter(t => t.league === team.league && t.id !== team.id);
  const newTeam = cands[Math.floor(rng() * cands.length)] || team;
  const from = team;
  state.transfers.push({ age: state.player.age, from: from.id, to: newTeam.id });
  state.currentTeamId = newTeam.id;
  state.contractTeamId = newTeam.id;
  state.contract.teamId = newTeam.id;
  state.legacyLines.push(`你申请交易，被送到了${newTeam.zh}。`);
  state.lastEventOutcome = {
    eventKey: 'request_trade',
    optionKey: 'trade',
    text: `交易达成！你被送往 ${newTeam.zh}。`,
    kind: 'positive',
  };
  return { ok: true, team: newTeam, from: from.zh };
}

// 赛季后交易/自由市场（在赛季完全结束后，进入下赛季前提示）
export function seasonOffseason(state) {
  const team = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  if (!team) return null;
  // 赛季后交易窗口：生成几笔潜在交易 + 明星退役信息
  const rng = mulberry32(state.rngState ^ 0x5eed);
  const trades = [];
  const teams = Object.values(TEAMS).filter(t => t.league === team.league && t.id !== team.id);
  const poolTeams = __nbaPool ? Object.values(__nbaPool) : [];
  for (let i = 0; i < 3; i++) {
    const tA = teams[Math.floor(rng() * teams.length)];
    const tB = teams[Math.floor(rng() * teams.length)];
    if (!tA || !tB || tA.id === tB.id) continue;
    let pA = null, pB = null;
    if (poolTeams.length && rng() < 0.6) {
      const tpA = poolTeams[Math.floor(rng() * poolTeams.length)];
      const tpB = poolTeams[Math.floor(rng() * poolTeams.length)];
      if (tpA && tpA.length) pA = tpA[Math.floor(rng() * tpA.length)];
      if (tpB && tpB.length) pB = tpB[Math.floor(rng() * tpB.length)];
    }
    if (!pA || !pB) continue;
    const nameA = pA.cname || pA.name;
    const nameB = pB.cname || pB.name;
    if (Math.max(pA.ovr, pB.ovr) < 78) continue;
    trades.push({
      teamA: tA.zh, teamB: tB.zh,
      fromAToB: nameA, fromBToA: nameB,
      ovrA: pA.ovr, ovrB: pB.ovr,
    });
  }
  // 每年随机生成联盟新秀（选秀结果）
  const rookies = generateDraftClass(state, rng);
  state.rookiePool = state.rookiePool || [];
  state.rookiePool.push(...rookies);
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return { trades, rookies };
}

// 生成一届选秀（新秀池），供休赛期展示与下一赛季 roster 使用
function generateDraftClass(state, rng) {
  const n = 6 + Math.floor(rng() * 5); // 6-10 名新秀
  const allSurnames = [];
  Object.values(COUNTRIES).forEach(c => { (c.surnames || []).forEach(s => allSurnames.push(s)); });
  const posArr = ['PG', 'SG', 'SF', 'PF', 'C'];
  const rookies = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let name = allSurnames[Math.floor(rng() * allSurnames.length)] + '·' + (1 + Math.floor(rng() * 50));
    let g2 = 0;
    while (used.has(name) && g2++ < 20) name = allSurnames[Math.floor(rng() * allSurnames.length)] + '·' + (1 + Math.floor(rng() * 50));
    used.add(name);
    const pos = posArr[Math.floor(rng() * 5)];
    // 新秀能力 60-82，少数天才更高
    const ovr = Math.floor(rng() * 23) + 60;
    const isStar = rng() < 0.12;
    rookies.push({
      name,
      pos,
      ovr: isStar ? Math.min(99, ovr + 8) : ovr,
      draftAge: 19 + Math.floor(rng() * 3),
      pick: i + 1,
      attrs: attrsForOvr(ovr, pos),
      isStar,
    });
  }
  return rookies;
}

// 明星球员退役：赛季末生成退役名单（含真实球员）
export function starRetirements(state) {
  if (!__nbaPool) return [];
  const rng = mulberry32(state.rngState ^ 0xdead);
  const retirements = [];
  const poolPlayers = [];
  Object.values(__nbaPool).forEach(arr => { if (Array.isArray(arr)) arr.forEach(p => poolPlayers.push(p)); });
  // 从 33+ 岁高 OVR 真实球员中选 1-3 个退役
  const candidates = poolPlayers.filter(p => p.ovr >= 80 && (p.age || 35) >= 33);
  const n = Math.min(3, 1 + Math.floor(rng() * 3));
  const picked = [];
  for (let i = 0; i < n && candidates.length; i++) {
    const p = candidates[Math.floor(rng() * candidates.length)];
    if (!picked.includes(p.name)) picked.push(p);
  }
  picked.forEach(p => {
    retirements.push({ name: p.cname || p.name, ovr: p.ovr });
  });
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return retirements;
}

// 单场比赛：比分 + 我方 box + 对方 box
function simOneLeagueGame(state, season, homeTeam, awayTeam, isHome, rng) {
  const teamPower = teamPowerFor(season.plan.role, homeTeam, state.player, season.plan);
  const oppPower = awayTeam ? awayTeam.strength * 0.85 + 12 : 75;
  const diff = teamPower - oppPower + (isHome ? 3 : -3) + (rng() * 16 - 8);
  const myScore = Math.max(70, Math.round(102 + diff));
  const oppScore = Math.max(70, Math.round(102 - diff));
  const win = myScore > oppScore;

  // 我的单场数据：围绕 baseAvg 波动（控制幅度，避免单场过高）
  const base = season.baseAvg;
  const boost = state.player.overall >= 85 ? 1.12 : 1;
  const per = (v, min) => Math.max(min, v * boost * (0.62 + rng() * 0.76));
  const my = {
    pts: Math.round(per(base.pts, 0)),
    reb: Math.round(per(base.reb, 1)),
    ast: Math.round(per(base.ast, 0)),
    stl: Math.round(per(base.stl, 0)),
    blk: Math.round(per(base.blk, 0)),
  };

  // 双方 box：按 roster 分配
  const homeRoster = season.rosters.get(homeTeam.id) || [];
  const awayRoster = awayTeam ? (season.rosters.get(awayTeam.id) || []) : [];
  const homeBox = buildBoxScore(homeRoster, myScore, state.player, rng, true);
  const awayBox = buildBoxScore(awayRoster, oppScore, state.player, rng, false);

  const topScorers = [...homeBox, ...awayBox].sort((a, b) => b.pts - a.pts).slice(0, 4)
    .map(p => ({ name: p.name, isMe: p.isMe, pts: p.pts }));

  return {
    g: season.played + 1,
    opp: awayTeam ? awayTeam.zh : '对手',
    oppId: awayTeam ? awayTeam.id : null,
    home: !!isHome,
    myScore,
    oppScore,
    win,
    my,
    homeBox,
    awayBox,
    topScorers,
  };
}

function teamPowerFor(role, team, player, plan) {
  const rf = roleFactor(role || 'starter');
  return team.strength * 0.62 + player.overall * 0.38 + rf * 1.5;
}

// 生成一队 box（分数按 OVR 权重分配，保证总和与比分一致），并累计到 roster 赛季数据
function buildBoxScore(roster, teamScore, me, rng, isHome) {
  if (!roster || !roster.length) return [];
  const totalOvr = roster.reduce((s, p) => s + p.ovr, 0);
  const box = roster.map(p => {
    const share = totalOvr > 0 ? p.ovr / totalOvr : 1 / roster.length;
    let pts = Math.round(teamScore * share * (0.8 + rng() * 0.4));
    if (p.isMe) pts = me.overall >= 88 ? Math.round(teamScore * 0.3) : Math.round(teamScore * 0.22);
    const ovrF = p.ovr / 99;
    const line = {
      name: p.name, pos: p.pos, ovr: p.ovr, starter: p.starter, isMe: p.isMe,
      pts,
      reb: Math.round(ovrF * 8 + rng() * 6),
      ast: Math.round(ovrF * 4 + rng() * 4),
      stl: Math.round(ovrF * 2),
      blk: Math.round(ovrF * 2),
    };
    return line;
  });
  // 修正总和到 teamScore
  const diff2 = teamScore - box.reduce((s, p) => s + p.pts, 0);
  if (box.length && Math.abs(diff2) > 0) {
    box[0].pts = Math.max(0, box[0].pts + diff2);
  }
  // 累计到 roster 赛季数据（队友/对手场均）
  box.forEach((b, i) => {
    const p = roster[i];
    if (!p) return;
    p.g += 1;
    p.pts += b.pts;
    p.reb += b.reb;
    p.ast += b.ast;
    p.stl += b.stl;
    p.blk += b.blk;
  });
  return box;
}

// ---------- 季后赛状态机 ----------
export function beginPlayoffs(state, team) {
  const season = state.season;
  const winPct = season.totalGames > 0 ? season.wins / season.totalGames : 0;
  // 对手：同联赛按 strength 排名，取比我们强或接近的对手
  const league = LEAGUES[team.league];
  const opps = Object.values(TEAMS).filter(t => t.league === team.league && t.id !== team.id)
    .sort((a, b) => b.strength - a.strength);
  const opp = opps[0] || Object.values(TEAMS).find(t => t.id !== team.id);
  const rounds = [];
  // 简化：3 轮（首轮/分区决赛/总决赛），每轮对手强度递增
  for (let r = 0; r < 3; r++) {
    const idx = Math.min(r + (winPct >= 0.7 ? r : r + 1), opps.length - 1);
    rounds.push(opps[idx] ? opps[idx].id : opp.id);
  }
  state.playoffs = {
    round: 0,
    rounds,
    myWins: 0,
    oppWins: 0,
    currentOppId: rounds[0],
    games: [],
    done: false,
    eliminated: false,
  };
  return state.playoffs;
}

export function simPlayoffGames(state, n = 1) {
  const po = state.playoffs;
  if (!po || po.done) return [];
  const out = [];
  const season = state.season;
  const teamTable = season && season.kind === 'ncaa' ? NCAA_TEAMS : TEAMS;
  const myTeam = teamTable[season.teamId];
  const rng = mulberry32(state.rngState ^ 0x7a7a);
  for (let k = 0; k < n && !po.done; k++) {
    const opp = teamTable[po.currentOppId];
    const game = simOneLeagueGame(state, season, myTeam, opp, k % 2 === 0, rng);
    po.games.push(game);
    if (game.win) po.myWins += 1; else po.oppWins += 1;
    out.push(game);
    if (po.myWins >= 4 || po.oppWins >= 4) {
      // 一轮结束
      if (po.myWins >= 4) {
        po.round += 1;
        po.myWins = 0;
        po.oppWins = 0;
        if (po.round >= po.rounds.length) {
          po.done = true; // 夺冠
          po.champion = true;
        } else {
          po.currentOppId = po.rounds[po.round];
        }
      } else {
        po.done = true;
        po.eliminated = true;
      }
    }
  }
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  return out;
}

// 赛季结束：应用成长，返回最终 snapshot（stats 用实际累计场均）
// 获取我队 roster（含场均数据），供队友面板/box 展示
export function getMyRoster(state) {
  const season = state.season;
  if (!season) return [];
  const teamTable = season.kind === 'ncaa' ? NCAA_TEAMS : TEAMS;
  const team = teamTable[season.teamId];
  if (!team) return [];
  const roster = season.rosters.get(season.teamId) || [];
  return roster.map(p => {
    const g = p.g || 0;
    return {
      name: p.name,
      pos: p.pos,
      ovr: p.ovr,
      starter: p.starter,
      isMe: p.isMe,
      attrs: p.attrs || {},
      g,
      avg: g > 0 ? {
        pts: (p.pts / g).toFixed(1),
        reb: (p.reb / g).toFixed(1),
        ast: (p.ast / g).toFixed(1),
        stl: (p.stl / g).toFixed(1),
        blk: (p.blk / g).toFixed(1),
      } : { pts: '0', reb: '0', ast: '0', stl: '0', blk: '0' },
    };
  });
}

export function finishSeason(state) {
  const season = state.season;
  if (!season) return null;
  const plan = season.plan;
  const t = state.totals;
  const g = season.myStats.g;
  const avg = g > 0 ? {
    pts: season.myStats.pts / g,
    reb: season.myStats.reb / g,
    ast: season.myStats.ast / g,
    stl: season.myStats.stl / g,
    blk: season.myStats.blk / g,
  } : { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  const stats = {
    g,
    pts: season.myStats.pts,
    reb: season.myStats.reb,
    ast: season.myStats.ast,
    stl: season.myStats.stl,
    blk: season.myStats.blk,
    avg,
  };
  // 属性年成长：年轻时随机提升，35 岁后逐年随机减少直至退役
  const growthLog = annualAttributeGrowth(state, plan.age);
  state.lastGrowthLog = growthLog;
  // 结果：季后赛打完则用真实结果；NCAA/未进季后赛保留 plan.result（或修正）
  const winPct = season.totalGames > 0 ? season.wins / season.totalGames : 0;
  let result = plan.result;
  const po = state.playoffs;
  if (po && po.done) {
    if (po.champion) result = { league: 'champion' };
    else if (po.eliminated) {
      // 在某一轮被淘汰：round 0=首轮出局, 1=半决赛, 2=总决赛
      const rnd = po.round;
      result = { league: rnd === 0 ? 'quarters' : rnd === 1 ? 'semis' : 'final' };
    }
  } else if (season.kind === 'pro' && !po) {
    // 职业未进季后赛：missed
    result = { league: 'missed' };
  }
  // 保留 NCAA 的 plan.result 不动
  // 高光：用实际场均判断
  let highlight = plan.highlight;
  if (g > 0) {
    if (avg.pts >= 30) highlight = `单赛季场均 ${avg.pts.toFixed(1)} 分`;
    else if (avg.pts >= 24 && avg.reb >= 10 && avg.ast >= 10) highlight = `单赛季场均 ${avg.pts.toFixed(1)} 分 ${avg.reb.toFixed(1)} 板 ${avg.ast.toFixed(1)} 助`;
  }
  // 冠军奖杯按结果
  const trophies = [...plan.trophies];
  if (result.league === 'champion' && !trophies.includes(`league:${plan.leagueId}`)) {
    trophies.push(`league:${plan.leagueId}`);
  }
  // 决赛冠军额外 FMVP
  const awards = [...plan.awards];
  if (result.league === 'champion' && !awards.includes('fmvp') && state.player.overall >= 84) {
    awards.push('fmvp');
  }
  // 完整奖项：基于赛季数据判定（MVP/得分王/最佳阵容等）
  const fullAwards = computeSeasonAwards(state, season, avg, result, awards);
  // 成长点数：赛季表现越好点数越多，年轻球员成长快（适量）
  const perf = g > 0 ? (avg.pts + avg.reb * 0.6 + avg.ast * 0.6) : 0;
  const ageBonus = state.player.age <= 23 ? 3 : state.player.age <= 27 ? 2 : state.player.age <= 31 ? 1 : 0;
  const awardBonus = Math.min(3, fullAwards.length);
  const winBonus = season.wins >= season.totalGames * 0.6 ? 2 : 0;
  const growthPoints = Math.max(0, 2 + Math.floor(perf / 18) + ageBonus + awardBonus + winBonus);
  state.lastGrowthPoints = growthPoints;
  state.player.growthBank = (state.player.growthBank || 0) + growthPoints;

  const snapshot = {
    ...plan,
    stats,
    overall: state.player.overall,
    highlight,
    result,
    trophies,
    awards: fullAwards,
    growthPoints,
    record: { wins: season.wins, losses: season.losses },
  };
  // 赛季总结（供 UI 展示）
  state.lastSeasonSummary = {
    age: plan.age,
    teamId: season.teamId,
    leagueId: plan.leagueId,
    kind: season.kind,
    record: `${season.wins}-${season.losses}`,
    wins: season.wins,
    losses: season.losses,
    totalGames: season.totalGames,
    stats: stats.avg,
    result,
    resultZh: resultZh(result && result.league, LEAGUES[plan.leagueId]),
    awards: fullAwards,
    awardsDetail: fullAwards,
    leagueAwards: generateLeagueAwards(state),
    nbaJump: nbaJumpInfo(state),
    highlight,
    growthPoints,
    growthBank: state.player.growthBank,
    growthLog: state.lastGrowthLog || null,
    salary: snapshot.salary,
    contractLeft: state.player.contract ? state.player.contract.yearsLeft : null,
  };
  // 记录赛季总结
  state.seasonHistory = state.seasonHistory || [];
  state.seasonHistory.push({
    age: plan.age,
    teamId: season.teamId,
    leagueId: plan.leagueId,
    record: `${season.wins}-${season.losses}`,
    stats: stats.avg,
    result,
    awards: fullAwards,
  });
  state.season = null;
  state.playoffs = null;
  return snapshot;
}

// 完整赛季奖项：基于赛季数据判定
function computeSeasonAwards(state, season, avg, result, base) {
  const awards = [];
  const pos = state.player.position;
  const ovr = state.player.overall;
  const g = season.myStats.g;
  const winPct = season.totalGames > 0 ? season.wins / season.totalGames : 0;
  const a = avg;
  const isRookie = (state.seasons || []).filter(s => !s.youth && s.teamId).length <= 1;

  // NCAA 联赛：只评选 MVP（属性 + 数据达标），不评最佳阵容/防守阵容等
  if (season.kind === 'ncaa') {
    if (ovr >= 78 && a.pts >= 18 && g >= 25) {
      awards.push('mvp');
    }
    // 去重并合并基础奖项
    const redundant = new Set(['all_team', 'allstar', 'all_nba_1', 'all_nba_2', 'all_nba_3', 'all_def_1', 'all_def_2', 'dpoy', 'sixth_man']);
    const merged = new Set();
    base.forEach(x => { if (!redundant.has(x)) merged.add(x); });
    awards.forEach(x => merged.add(x));
    return [...merged];
  }

  // 数据王
  if (a.pts >= 26) awards.push('scoring_title');
  if (a.reb >= 11) awards.push('rebound_title');
  if (a.ast >= 9) awards.push('assist_title');
  if (a.stl >= 2.2) awards.push('steal_title');
  if (a.blk >= 2.2 && ['pf', 'c'].includes(pos)) awards.push('block_title');
  // MVP：数据 + 战绩
  if (ovr >= 86 && a.pts >= 24 && winPct >= 0.55) awards.push('mvp');
  else if (a.pts >= 28 && winPct >= 0.6) awards.push('mvp');
  // 最佳阵容：一阵/二阵/三阵（按综合表现）
  const allNbaScore = a.pts + a.reb * 0.8 + a.ast * 0.8 + a.stl * 1.5 + a.blk * 1.5;
  if (allNbaScore >= 42) awards.push('all_nba_1');
  else if (allNbaScore >= 34) awards.push('all_nba_2');
  else if (allNbaScore >= 27) awards.push('all_nba_3');
  // 最佳防守阵容
  const defScore = a.stl + a.blk + (ovr - 60) * 0.15;
  if (defScore >= 6 && g >= 40) {
    if (defScore >= 8) awards.push('all_def_1');
    else awards.push('all_def_2');
  }
  // DPOY
  if ((a.stl + a.blk) >= 4 && ovr >= 82 && g >= 40) awards.push('dpoy');
  // 最佳新秀
  if (isRookie && ovr >= 76 && a.pts >= 14) awards.push('roty');
  // 最佳第六人（替补且数据好）
  const role = season.plan.role;
  if (['edge', 'rotation'].includes(role) && a.pts >= 16) awards.push('sixth_man');
  // 进步最快（overall 增长大）
  const prev = state.player.debutOverall || ovr;
  if (ovr - prev >= 6) awards.push('mip');
  // 全明星 / 全明星MVP
  if (ovr >= 80 && a.pts >= 18) awards.push('allstar');
  if (ovr >= 90 && a.pts >= 28 && season.kind === 'pro') awards.push('allstar_mvp');
  // 总决赛相关
  if (result.league === 'champion' && ovr >= 84) awards.push('fmvp');
  if (result.league === 'champion') awards.push('champion_ring');

  // 去重：去掉 base 中已被新体系替代的旧奖项，合并其余
  const redundant = new Set(['all_team', 'allstar']);
  const merged = new Set();
  base.forEach(a => { if (!redundant.has(a)) merged.add(a); });
  awards.forEach(a => merged.add(a));
  return [...merged];
}

// 职业赛季完整结束（进季后赛流程后调用）：finishSeason + 清空季后赛，返回 snapshot 供结算
function finishCareerSeason(state, team, age, modifiers) {
  return finishSeason(state);
}

// 生成完整奖项名单：从联盟各队 roster 评选出每个奖项的获奖者（含能力值/数据），我参与竞争
export function generateLeagueAwards(state) {
  const season = state.season;
  if (!season) return [];
  const myTeamId = season.teamId;
  const teamTable = season.kind === 'ncaa' ? NCAA_TEAMS : TEAMS;
  const myAvg = season.myStats.g > 0 ? {
    pts: season.myStats.pts / season.myStats.g,
    reb: season.myStats.reb / season.myStats.g,
    ast: season.myStats.ast / season.myStats.g,
    stl: season.myStats.stl / season.myStats.g,
    blk: season.myStats.blk / season.myStats.g,
  } : { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  const winPct = season.totalGames > 0 ? season.wins / season.totalGames : 0;

  // 收集联盟球员池：各队 roster 中打过比赛的球员（每队最多 5 人）
  const pool = [];
  const usedNames = new Set();

  // NBA 联赛：只使用真实球员池（30 队现役真实球员），按 OVR 估算场均参与评选
  const isNba = season.kind === 'pro' && LEAGUES[season.leagueId] && LEAGUES[season.leagueId].tier === 1;
  const nbaRealUsed = isNba && !!__nbaPool;
  if (nbaRealUsed) {
    for (const [abbr, players] of Object.entries(__nbaPool)) {
      if (!Array.isArray(players) || !players.length) continue;
      const sorted = players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5);
      for (const p of sorted) {
        if (!p || usedNames.has(p.cname || p.name)) continue;
        usedNames.add(p.cname || p.name);
        const pos = mainPosOf(p.pos);
        const ovr = p.ovr;
        const posBias = POS_ATTR_BIAS[pos] || {};
        // 按 OVR 和属性估算场均数据（贴近真实 NBA 水平）
        const isBig = ['PF', 'C'].includes(pos);
        const isPG = pos === 'PG';
        const avg = {
          pts: Math.max(4, (ovr - 55) * 0.72 + (p.FIN || posBias.FIN || 60) * 0.06 + Math.random() * 2.5),
          reb: Math.max(1.5, (isBig ? 4 : 1.5) + (p.REB || posBias.REB || 40) * 0.12 + Math.random() * 1.5),
          ast: Math.max(0.8, (isPG ? 3 : 0.8) + (p.PAS || posBias.PAS || 40) * 0.1 + Math.random() * 1.5),
          stl: Math.max(0.2, (p.PDEF || 50) * 0.018 + Math.random() * 0.7),
          blk: Math.max(0.1, (p.BLK || 40) * 0.024 + (isBig ? Math.random() * 1.2 : Math.random() * 0.3)),
        };
        pool.push({ name: p.cname || p.name, pos, ovr, teamId: null, avg, g: 55 + Math.floor(Math.random() * 20), real: true });
      }
    }
  }

  if (!nbaRealUsed) {
  for (const [tid, roster] of season.rosters) {
    if (!roster) continue;
    const teamPlayers = [];
    roster.forEach(p => {
      if (p.isMe) return;
      const gp = p.g || 1;
      const avg = {
        pts: p.pts / gp,
        reb: p.reb / gp,
        ast: p.ast / gp,
        stl: p.stl / gp,
        blk: p.blk / gp,
      };
      teamPlayers.push({ name: p.name, pos: p.pos, ovr: p.ovr, teamId: tid, avg, g: p.g });
    });
    // 每队取 OVR 最高的 5 人
    teamPlayers.sort((a, b) => b.ovr - a.ovr).slice(0, 5).forEach(p => { pool.push(p); usedNames.add(p.name); });
  }
  // 补足到 60 人：生成虚拟联盟明星（能力分布广，名字用各国姓氏）
  const allSurnames = [];
  Object.values(COUNTRIES).forEach(c => { (c.surnames || []).forEach(s => allSurnames.push(s)); });
  const posArr = ['PG', 'SG', 'SF', 'PF', 'C'];
  // 先造 6 个全明星级大牌（OVR 88-96，数据亮眼）
  const starNames = ['亚历克斯·王', '乔丹·李', '科比·张', '詹姆斯·陈', '杜兰特·刘', '库里·杨'];
  const starPos = ['SG', 'PG', 'SF', 'PF', 'C', 'PG'];
  for (let i = 0; i < starNames.length; i++) {
    const ovr = 88 + Math.floor(Math.random() * 9);
    const pos = starPos[i];
    const posBias = POS_ATTR_BIAS[pos] || {};
    pool.push({
      name: starNames[i], pos, ovr, teamId: null, g: 60 + Math.floor(Math.random() * 15),
      avg: {
        pts: ovr * 0.42 + (posBias.FIN || 0) * 0.5 + Math.random() * 4,
        reb: ovr * 0.14 + (posBias.REB || 0) * 0.6 + Math.random() * 2,
        ast: ovr * 0.1 + (posBias.PAS || 0) * 0.7 + Math.random() * 3,
        stl: 1 + Math.random() * 1.4,
        blk: 0.4 + (['PF', 'C'].includes(pos) ? Math.random() * 1.8 : Math.random() * 0.6),
      },
    });
  }
  let guard2 = 0;
  while (pool.length < 60 && guard2 < 200) {
    guard2++;
    const surname = allSurnames[Math.floor(Math.random() * allSurnames.length)] || '球员';
    const name = surname + '·' + (1 + Math.floor(Math.random() * 99));
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const ovr = 60 + Math.floor(Math.random() * 36); // 60-95
    const pos = posArr[Math.floor(Math.random() * 5)];
    const posBias = POS_ATTR_BIAS[pos] || {};
    const ptsBase = ovr * 0.28 + (posBias.FIN || 0) * 0.4;
    const rebBase = ovr * 0.12 + (posBias.REB || 0) * 0.6;
    const astBase = ovr * 0.08 + (posBias.PAS || 0) * 0.7;
    const avg = {
      pts: ptsBase + Math.random() * 5,
      reb: rebBase + Math.random() * 3,
      ast: astBase + Math.random() * 3,
      stl: 0.4 + Math.random() * 1.6,
      blk: 0.3 + (['PF', 'C'].includes(pos) ? Math.random() * 2 : Math.random() * 0.8),
    };
    pool.push({ name, pos, ovr, teamId: null, avg, g: 55 + Math.floor(Math.random() * 20) });
  }
  }

  // 我的球员加入竞争
  const me = {
    name: state.player.name, pos: POSITIONS[state.player.position].en, ovr: state.player.overall,
    teamId: myTeamId, avg: myAvg, g: season.myStats.g, isMe: true,
  };

  const pickBest = (arr, key) => {
    if (!arr.length) return null;
    return arr.sort((a, b) => b[key] - a[key])[0];
  };
  const makeLine = (p) => ({
    name: p.name, pos: p.pos, ovr: p.ovr, isMe: p.isMe,
    teamId: p.teamId, g: p.g,
    pts: p.avg.pts.toFixed(1), reb: p.avg.reb.toFixed(1), ast: p.avg.ast.toFixed(1),
    stl: p.avg.stl.toFixed(1), blk: p.avg.blk.toFixed(1),
  });

  const candidates = [...pool, me];
  const awards = [];
  const alreadyWon = new Set();

  // NCAA 联赛：只评选 MVP（要求属性 + 数据达到门槛），不显示最佳阵容/防守阵容等
  if (season.kind === 'ncaa') {
    const ovrReq = state.player.overall >= 78;
    const dataReq = myAvg.pts >= 18 && (myAvg.reb + myAvg.ast) >= 8;
    const gamesReq = season.myStats.g >= 25;
    if (ovrReq && dataReq && gamesReq) {
      // 竞争：与联盟其他高能力球员比综合分
      const mvpScore2 = (p) => p.avg.pts + p.avg.reb * 0.7 + p.avg.ast * 0.7 + p.avg.stl + p.avg.blk + p.ovr * 0.15 + (p.isMe ? winPct * 40 : 20);
      const mvp = candidates.slice().sort((a, b) => mvpScore2(b) - mvpScore2(a))[0];
      awards.push({ key: 'mvp', zh: 'MVP', winner: makeLine(mvp) });
    }
    return awards;
  }

  // 数据王（取最高，一个球员最多拿一个数据王，含我）
  const statKings = [
    { key: 'scoring_title', zh: '得分王', get: p => p.avg.pts, min: 20 },
    { key: 'rebound_title', zh: '篮板王', get: p => p.avg.reb, min: 8 },
    { key: 'assist_title', zh: '助攻王', get: p => p.avg.ast, min: 6 },
    { key: 'steal_title', zh: '抢断王', get: p => p.avg.stl, min: 1.5 },
    { key: 'block_title', zh: '盖帽王', get: p => p.avg.blk, min: 1.2 },
  ];
  for (const sk of statKings) {
    const elig = candidates.filter(p => p.g >= 30 && !alreadyWon.has(p.name));
    if (!elig.length) continue;
    const best = elig.slice().sort((a, b) => sk.get(b) - sk.get(a))[0];
    if (best && sk.get(best) >= sk.min) {
      awards.push({ key: sk.key, zh: sk.zh, winner: makeLine(best) });
      alreadyWon.add(best.name);
    }
  }

  // MVP：综合数据 + 战绩
  const mvpScore = (p) => p.avg.pts + p.avg.reb * 0.7 + p.avg.ast * 0.7 + p.avg.stl + p.avg.blk + p.ovr * 0.15 + (p.isMe ? winPct * 40 : 20);
  const mvp = candidates.slice().sort((a, b) => mvpScore(b) - mvpScore(a))[0];
  awards.push({ key: 'mvp', zh: '常规赛MVP', winner: makeLine(mvp) });

  // 最佳阵容 1/2/3 阵（按综合得分取前 15，分三阵）
  const allNbaScore = (p) => p.avg.pts + p.avg.reb * 0.8 + p.avg.ast * 0.8 + p.avg.stl * 1.2 + p.avg.blk * 1.2 + p.ovr * 0.2;
  const ranked = candidates.slice().sort((a, b) => allNbaScore(b) - allNbaScore(a)).slice(0, 15);
  const teamNames = ['最佳阵容一阵', '最佳阵容二阵', '最佳阵容三阵'];
  const teamKeys = ['all_nba_1', 'all_nba_2', 'all_nba_3'];
  for (let i = 0; i < 3 && ranked.length >= (i + 1) * 5; i++) {
    const five = ranked.slice(i * 5, (i + 1) * 5);
    awards.push({ key: teamKeys[i], zh: teamNames[i], team: five.map(makeLine) });
  }

  // 最佳防守阵容（按防守数据）
  const defScore = (p) => p.avg.stl + p.avg.blk + p.ovr * 0.05;
  const defRanked = candidates.slice().sort((a, b) => defScore(b) - defScore(a)).slice(0, 10);
  awards.push({ key: 'all_def_1', zh: '最佳防守一阵', team: defRanked.slice(0, 5).map(makeLine) });
  awards.push({ key: 'all_def_2', zh: '最佳防守二阵', team: defRanked.slice(5, 10).map(makeLine) });

  // DPOY
  const dpoy = candidates.slice().sort((a, b) => (b.avg.stl + b.avg.blk) - (a.avg.stl + a.avg.blk))[0];
  awards.push({ key: 'dpoy', zh: '最佳防守球员', winner: makeLine(dpoy) });

  // 最佳新秀（生涯第一季的我，或其他低龄球员）
  const isRookie = (state.seasons || []).filter(s => !s.youth && s.teamId).length <= 1;
  if (isRookie) {
    awards.push({ key: 'roty', zh: '最佳新秀', winner: makeLine(me) });
  } else {
    const rookiePool = candidates.filter(p => !p.isMe);
    awards.push({ key: 'roty', zh: '最佳新秀', winner: makeLine(pickBest(rookiePool, p => p.ovr)) });
  }

  // 最佳第六人 / 进步最快 / FMVP（赛季结果相关）
  const champion = state.lastSeasonSummary && state.lastSeasonSummary.result && state.lastSeasonSummary.result.league === 'champion';
  if (season.kind === 'pro' && champion) {
    const fmvp = pickBest([...candidates].filter(p => p.isMe || p.ovr >= 85), p => p.avg.pts);
    awards.push({ key: 'fmvp', zh: '总决赛MVP', winner: makeLine(fmvp) });
  }

  return awards;
}

// 冲击 NBA：赛季结束后不在 NBA 时可用，按能力判定成功率
export function nbaJumpInfo(state) {
  const team = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  if (!team || team.league === 'nba') return { available: false };
  const ovr = state.player.overall;
  // 能力越高成功率越高
  let p = clamp((ovr - 78) * 0.022, 0.06, 0.85);
  return { available: true, chance: p, pct: Math.round(p * 100) };
}

export function tryNBAJump(state) {
  const info = nbaJumpInfo(state);
  if (!info.available) return { ok: false, reason: '你已在 NBA' };
  const rng = mulberry32(state.rngState);
  const success = rng() < info.chance;
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  if (success) {
    const nbaTeams = Object.values(TEAMS).filter(t => t.league === 'nba').sort((a, b) => a.strength - b.strength);
    const team = nbaTeams[Math.floor(rng() * nbaTeams.length)];
    const from = TEAMS[state.currentTeamId];
    state.transfers.push({ age: state.player.age, from: from ? from.id : null, to: team.id });
    state.currentTeamId = team.id;
    state.contractTeamId = team.id;
    state.stage = 'pro';
    state.player.contract = makeContract(state.player, team, LEAGUES.nba);
    state.legacyLines.push(`你凭一己之力打进了 NBA，加盟${team.zh}。`);
    state.lastEventOutcome = { eventKey: 'nba_jump', optionKey: 'jump', text: `冲击成功！你得到了 ${team.zh} 的合同，正式登陆 NBA。`, kind: 'positive' };
    return { ok: true, team, contract: state.player.contract };
  } else {
    state.lastEventOutcome = { eventKey: 'nba_jump', optionKey: 'jump', text: '冲击 NBA 失败，各队暂时没有你的位置。继续在联赛里证明自己吧。', kind: 'negative' };
    return { ok: false, reason: 'chance_failed' };
  }
}

function develop(player, age, rng) {
  const p = player.potential;
  let target;
  if (age <= 29) target = p;
  else if (age <= 31) target = p - 1;
  else if (age <= 33) target = p - 3;
  else if (age <= 35) target = p - 6;
  else target = p - 11;
  let delta = 0;
  if (player.overall < target) {
    const speed = age <= 21 ? 2.5 : age <= 26 ? 1.35 : age <= 29 ? 0.8 : 0.4;
    delta = speed * (0.75 + rng() * 0.7);
  } else if (player.overall > target) {
    delta = -(age >= 31 ? 0.7 + rng() * 0.9 : 0.25 + rng() * 0.3);
  }
  return clamp(Math.round(player.overall + delta), 40, 99);
}

// ---------- 国家队 ----------
function nationalThreshold(country) {
  return { 1: 70, 2: 75, 3: 78, 4: 80 }[country.tier] ?? 78;
}

function qualifyProb(state, country) {
  const boost = (state.player.overall - 80) * 0.012;
  let p = country.qualify + boost;
  if (state.nationalTeamRetiredAge !== undefined) p = 0;
  return clamp(p, 0.05, 0.97);
}

function tournamentResult(state, country, tournament, modifiers, rng) {
  const overall = state.player.overall;
  const calledUp = overall >= nationalThreshold(country) && state.nationalTeamRetiredAge === undefined;
  if (!calledUp) return { called: false, result: 'not_called', stats: null };
  let q = qualifyProb(state, country);
  if (modifiers.nationalMult) q *= modifiers.nationalMult;
  if (tournament.type === 'continental') q = 1;
  if (state.pendingQualifier && state.pendingQualifier.age === tournament.age) {
    q = state.pendingQualifier.won ? 1 : 0;
  }
  const qualified = tournament.qualified === false ? false : rng() < q;
  if (!qualified) return { called: true, result: 'not_qualified', stats: null };

  // 深度
  const power = country.tier === 1 ? 78 : country.tier === 2 ? 70 : country.tier === 3 ? 62 : 56;
  const pBonus = (overall - 80) * 0.45;
  const strength = power + pBonus + (modifiers.nationalMult ? (modifiers.nationalMult - 1) * 15 : 0);
  const championP = clamp((strength - 68) * 0.006 + 0.015, 0.008, 0.32);
  const semisP = championP * 2.2;
  const quartersP = championP * 4;
  const r = rng();
  let result;
  if (r < championP) result = 'champion';
  else if (r < championP + semisP) result = 'semis';
  else if (r < championP + semisP + quartersP) result = 'quarters';
  else result = 'group';

  // 半决赛触发的决战
  if (result === 'semis' && overall >= 84 && (tournament.type === 'world_cup' || tournament.type === 'olympics')) {
    state.pendingWorldCupUpgrade = { age: tournament.age, type: tournament.type };
  }

  const depthGames = { champion: 8, semis: 7, quarters: 6, group: 4 }[result] ?? 5;
  const rf = roleFactor('superstar') * 0.95;
  const scale = clamp((overall - 40) / 59, 0.1, 1);
  const w = POSITIONS[state.player.position].weight;
  const pg = {
    pts: (10 + 24 * scale) * w.pts * rf,
    reb: (3 + 9 * scale) * w.reb * rf,
    ast: (2 + 7.5 * scale) * w.ast * rf,
  };
  const stats = {
    g: depthGames,
    pts: pg.pts * depthGames,
    reb: pg.reb * depthGames,
    ast: pg.ast * depthGames,
    avg: pg,
  };
  const awards = [];
  if (result === 'champion' && overall >= 87) awards.push('tournament_mvp');
  if ((result === 'champion' || result === 'semis') && overall >= 84) awards.push('tournament_all_team');
  return { called: true, result, stats, awards };
}

// ---------- 推进 ----------
export function step(state) {
  if (state.phase !== 'career') return { state, screen: 'summary' };
  if (state.currentEvent) return { state, screen: 'event' };

  // 合同到期：优先弹出续约/自由市场事件
  if (state.pendingContractExpiry) {
    state.currentEvent = contractExpiryEvent(state);
    return { state, screen: 'event' };
  }

  const age = state.player.age;
  const modifiers = state.period.modifiers || {};

  if (state.stage === 'youth') {
    const snapshot = {
      age,
      teamId: null,
      leagueId: null,
      overall: state.player.overall,
      role: 'starter',
      stats: { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      result: { league: 'youth' },
      trophies: [],
      awards: [],
      salary: 0,
      marketValue: state.player.marketValue,
      youth: true,
    };
    state.seasons.push(snapshot);
    state.period.run += 1;
    state.player.age += 1;
    if (state.period.run === 1) {
      // 16 岁青训赛季后有一次青训决策
      state.currentEvent = pickEvent(state, 16);
    } else if (state.period.run === 2) {
      // 17 岁青训赛季后有一次青训决策
      state.currentEvent = pickEvent(state, 17);
    } else {
      // 18 岁青训结束，19 岁面临 NCAA 尝试
      state.stage = 'ncaa_choice';
      state.currentEvent = ncaaChoiceEvent(state);
      state.period = { periodIndex: 1, remaining: MODES[state.mode].periodLength, run: 0, modifiers: {} };
    }
    return { state, screen: 'banner', snapshot };
  }

  if (state.stage === 'ncaa') {
    return ncaaStep(state, age, modifiers);
  }

  // 职业赛季
  const team = TEAMS[state.currentTeamId];
  if (!team) {
    state.phase = 'summary';
    state.retirementReason = state.retirementReason || 'no_offers';
    return { state, screen: 'summary' };
  }

  const suspended = state.suspensionSeasonsRemaining > 0;
  const seasonModifiers = {
    ...modifiers,
    suspended: suspended ? '禁赛' : modifiers.injury,
    roleShift: modifiers.roleShift || (state.suspensionRustRemaining > 0 ? -1 : 0),
  };

  // 赛季状态机：赛季中返回 season 屏幕，由玩家逐场模拟
  if (!state.season) {
    beginSeason(state, team, age, seasonModifiers, 'pro');
  }
  if (!state.season.done) {
    return { state, screen: 'season' };
  }

  // 常规赛打完 → 决定是否进季后赛
  if (!state.playoffs) {
    // 胜率足够则进季后赛，否则直接结束
    const winPct = state.season.totalGames > 0 ? state.season.wins / state.season.totalGames : 0;
    const made = winPct >= 0.45 && state.season.losses < state.season.totalGames;
    if (!made) {
      // 未进季后赛，直接结算
      const snapshot = finishCareerSeason(state, team, age, seasonModifiers);
      if (!snapshot) {
        state.phase = 'summary';
        state.retirementReason = state.retirementReason || 'no_offers';
        return { state, screen: 'summary' };
      }
      return settleSeasonResult(state, snapshot, team, age, seasonModifiers, suspended);
    }
    beginPlayoffs(state, team);
    return { state, screen: 'playoffs' };
  }

  // 季后赛进行中
  if (!state.playoffs.done) {
    return { state, screen: 'playoffs' };
  }

  // 季后赛打完 → 结算赛季
  const snapshot = finishCareerSeason(state, team, age, seasonModifiers);
  if (!snapshot) {
    state.phase = 'summary';
    state.retirementReason = state.retirementReason || 'no_offers';
    return { state, screen: 'summary' };
  }
  return settleSeasonResult(state, snapshot, team, age, seasonModifiers, suspended);
}

// 赛季结算：累加 totals、宿敌、国家队、事件调度等，返回 banner
function settleSeasonResult(state, snapshot, team, age, modifiers, suspended) {
  const t = state.totals;
  t.apps += snapshot.stats.g;
  t.pts += snapshot.stats.pts;
  t.reb += snapshot.stats.reb;
  t.ast += snapshot.stats.ast;
  t.stl += snapshot.stats.stl;
  t.blk += snapshot.stats.blk;
  t.salary += snapshot.salary;
  snapshot.trophies.forEach(tid => t.trophies.push(tid));
  snapshot.awards.forEach(aid => t.awards.push(aid));
  if (snapshot.highlight) state.highlights.push({ age, text: snapshot.highlight });

  // 宿敌对位
  if (state.rival) {
    const rr = mulberry32(state.rngState);
    const rs = rivalSeason(state.rival, age, rr);
    state.rngState = (rr() * 4294967296) >>> 0 || 12345;
    state.rivalSeries.push({
      age,
      my: snapshot.stats.pts,
      rival: rs.pts,
      myChamp: snapshot.result.league === 'champion',
      rivalChamp: rs.champ,
      myMvp: snapshot.awards.includes('mvp'),
      rivalMvp: rs.mvp,
    });
  }

  if (suspended) {
    state.suspensionSeasonsRemaining -= 1;
    if (state.suspensionSeasonsRemaining === 0) state.suspensionRustRemaining = 2;
  } else if (state.suspensionRustRemaining > 0) {
    state.suspensionRustRemaining -= 1;
  }

  // 国家队征召与大赛
  const country = COUNTRIES[state.player.nationalityCode];
  const tournament = state.tournaments.find(t2 => t2.age === age);
  if (tournament && state.nationalTeamRetiredAge === undefined) {
    const tr = tournamentResult(state, country, tournament, modifiers, mulberry32(state.rngState ^ 0x51ab));
    if (tr.called) {
      state.hasNationalTeamCallup = true;
      if (tr.result !== 'not_called' && tr.result !== 'not_qualified') {
        const nat = {
          age,
          type: tournament.type,
          result: tr.result,
          stats: tr.stats,
          awards: tr.awards || [],
        };
        state.nationalTeamPeriods.push(nat);
        if (tr.stats) {
          t.apps += tr.stats.g;
          t.pts += tr.stats.pts;
          t.reb += tr.stats.reb;
          t.ast += tr.stats.ast;
        }
        if (tr.result === 'champion') {
          t.trophies.push(tournament.type === 'world_cup' ? 'world_cup' : tournament.type === 'olympics' ? 'olympics' : 'continental');
          if (tournament.type === 'world_cup') state.legacyLines.push('你把世界杯举过头顶。');
          if (tournament.type === 'olympics') state.legacyLines.push('奥运金牌挂在了你的脖子上。');
          if (tournament.type === 'continental') state.legacyLines.push(`你率${country.zh}拿下了洲际冠军。`);
        }
        tr.awards?.forEach(a => t.awards.push(a));
        snapshot.national = nat;
      } else {
        snapshot.national = { age, type: tournament.type, result: tr.result, stats: null, awards: [] };
      }
      tournament.qualified = tr.result === 'champion' || tr.result === 'semis' || tr.result === 'quarters' || tr.result === 'group';
    } else {
      snapshot.national = { age, type: tournament.type, result: 'not_called', stats: null, awards: [] };
    }
    if (state.pendingWorldCupUpgrade && state.pendingWorldCupUpgrade.age === age) {
      state.currentEvent = showdownEvent('world_cup_showdown', state, tournament);
    }
  }

  // 预选赛生死战（大赛前一年触发）
  const upcoming = state.tournaments.find(t2 => t2.age === age + 1 && (t2.type === 'world_cup' || t2.type === 'olympics') && t2.qualified === null);
  if (upcoming && state.nationalTeamRetiredAge === undefined && state.player.overall >= nationalThreshold(country) - 3) {
    const qp = qualifyProb(state, country) * (modifiers.nationalMult || 1);
    if (qp > 0.32 && qp < 0.72) {
      state.currentEvent = showdownEvent('qualifier_showdown', state, upcoming);
      state.pendingQualifier = { age: upcoming.age, won: null };
    }
  }

  state.seasons.push(snapshot);

  // 打到半决赛/决赛：可进入季后赛关键战单场模拟（玩家可模拟或跳过）
  if (!state.currentEvent && ['semis', 'final'].includes(snapshot.result.league)) {
    state.pendingGame = {
      type: 'playoff_key',
      stage: snapshot.result.league,
      seasonIndex: state.seasons.length - 1,
      opponentId: pickPlayoffOpponent(state, team, LEAGUES[team.league]),
    };
  }

  // 打到半决赛/决赛：可能触发抢七决战
  if (!state.currentEvent && ['semis', 'final'].includes(snapshot.result.league)) {
    const r = roll(state.rngState);
    state.rngState = r.state;
    if (r.v[0] < 0.45) state.currentEvent = showdownEvent('game7', state, null);
  }

  state.period.run += 1;
  state.player.age += 1;
  const league = LEAGUES[team.league];
  state.player.marketValue = marketValueOf(state.player.overall, state.player.age, league);

  const periodEnd = state.period.run >= state.period.remaining;
  if (periodEnd && !state.currentEvent) {
    // 阶段结束 → 安排下一个事件
    state.period = { ...state.period, run: 0, modifiers: {} };
    const ev = scheduleNextEvent(state);
    if (ev) state.currentEvent = ev;
  }

  // 合同推进：每赛季消耗一年，到期触发续约/自由市场事件
  if (state.player.contract) {
    state.player.contract.yearsLeft = Math.max(0, (state.player.contract.yearsLeft || 1) - 1);
    if (state.player.contract.yearsLeft <= 0) {
      // 合同到期：标记，由 step 弹出续约/自由市场事件
      state.pendingContractExpiry = {
        teamId: team.id,
        leagueId: team.league,
      };
    }
  } else if (state.player.age >= 20) {
    renewContract(state, team, LEAGUES[team.league]);
  }

  return { state, screen: 'banner', snapshot };
}

// 合同到期事件：续约 or 试水自由市场（可转会其他球队）
function contractExpiryEvent(state) {
  const team = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  const league = team ? LEAGUES[team.league] : null;
  const tier = contractTierOf(state.player.overall);
  const annual = CONTRACT_YEARLY[tier];
  const tierFactor = { 1: 1.0, 2: 0.6, 3: 0.3, 4: 0.16 }[league && league.tier] ?? 0.2;
  const years = contractYearsOf(tier, state.player.age);
  // 生成自由市场报价（其他球队）
  const offers = [];
  const cands = Object.values(TEAMS)
    .filter(t => t.league === team.league && t.id !== team.id)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  cands.forEach((t, i) => {
    const offerTier = state.player.overall >= 88 && t.strength >= 82 ? 'near_max' : tier;
    const offerAnnual = CONTRACT_YEARLY[offerTier];
    offers.push({
      id: `fa-${t.id}`,
      teamId: t.id,
      label: `${t.zh}（${LEAGUES[t.league].zh}）`,
      hint: `${contractTierZh(offerTier)} · ${fmtMoney(offerAnnual * tierFactor * 7)}/年 × ${years} 年`,
      annual: Math.round(offerAnnual * tierFactor),
      years,
    });
  });
  return {
    id: `contract-expiry-${state.step}`,
    type: 'contract_expiry',
    title: '合同到期',
    text: `赛季结束，你和${team.zh}的合同到期了。${contractTierZh(tier)}：${fmtMoney(annual * tierFactor * 7)}/年。是续约还是试试自由市场？`,
    options: [
      { id: 'renew', label: `与${team.zh}续约`, hint: `${contractTierZh(tier)} · ${fmtMoney(annual * tierFactor * 7)}/年 × ${years} 年` },
      ...offers.map(o => ({ id: `fa-${o.teamId}`, label: `自由市场 · 加盟 ${o.label}`, hint: o.hint, teamId: o.teamId })),
    ],
    offers,
    renewAnnual: Math.round(annual * tierFactor),
    renewYears: years,
    renewTier: tier,
  };
}

function resolveContractExpiry(state, optionId, offerTeamId) {
  state.pendingContractExpiry = null;
  const team = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  const league = team ? LEAGUES[team.league] : null;
  if (optionId === 'renew' || !offerTeamId) {
    renewContract(state, team, league);
    state.lastEventOutcome = {
      eventKey: 'contract_renew',
      optionKey: 'renew',
      text: `你和${team.zh}续约 ${state.player.contract.years} 年（${contractTierZh(state.player.contract.tier)} · ${fmtMoney(state.player.contract.annualUsd * 7)}/年）。`,
      kind: 'positive',
    };
  } else {
    const newTeam = TEAMS[offerTeamId];
    const from = team;
    state.transfers.push({ age: state.player.age, from: from ? from.id : null, to: newTeam.id });
    state.currentTeamId = newTeam.id;
    state.contractTeamId = newTeam.id;
    state.player.contract = makeContract(state.player, newTeam, league);
    state.legacyLines.push(`自由市场，你选择加盟${newTeam.zh}。`);
    state.lastEventOutcome = {
      eventKey: 'contract_renew',
      optionKey: 'fa',
      text: `你以自由球员身份加盟 ${newTeam.zh}，签下 ${contractTierZh(state.player.contract.tier)}（${fmtMoney(state.player.contract.annualUsd * 7)}/年 × ${state.player.contract.years} 年）。`,
      kind: 'positive',
    };
  }
  state.step += 1;
  return { state, screen: 'career' };
}

function scheduleNextEvent(state) {
  const age = state.player.age;
  // 40 岁必退
  if (age >= 40) {
    state.retirementReason = 'age';
    return retirementStyleEvent(state, 'age');
  }
  // 36 岁以上：无人问津
  if (age >= 36 && !state.noOffersOffered) {
    state.noOffersOffered = true;
    return { ...EVENTS.no_offers, id: `no-offers-${state.step}`, options: EVENTS.no_offers.options.map(o => ({ ...o })) };
  }
  // 32 岁以上：偶尔可以自己选择挂靴
  if (age >= 32 && age - state.lastVoluntaryOfferAge >= 4) {
    state.lastVoluntaryOfferAge = age;
    return {
      id: `retire-voluntary-${state.step}`,
      type: 'voluntary_retire',
      title: '退役的决定',
      text: `${age} 岁，那份合同在桌上摆了两个星期，你始终没签。剩下的只是怎么让人知道。`,
      options: [
        { id: 'keep', label: '再打两年', hint: '还想留在场上' },
        { id: 'retire', label: '就此结束职业生涯', hint: '自己决定退役' },
      ],
    };
  }
  // 决胜时刻
  {
    const r = roll(state.rngState);
    state.rngState = r.state;
    if (r.v[0] < 0.16) return showdownEvent('last_shot', state, null);
    if (r.v[0] < 0.26) return showdownEvent('free_throw', state, null);
  }
  // 22/26/30 岁左右常有转会报价
  if (state.rival && [20, 24, 28, 32].includes(age) && !state.usedRivalAges.includes(age)) {
    state.usedRivalAges.push(age);
    return rivalDuelEvent(state);
  }
  // 转会机会：
  // 1) 固定年份 22/26/30 岁（原逻辑）
  // 2) 未到顶级联赛的球员，能力超过当前联赛平均水平时，每 2 年额外增加"升一级"报价机会
  const curTeam2 = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
  const curTier2 = curTeam2 ? LEAGUES[curTeam2.league].tier : 4;
  const wantMoveUp = curTier2 > 1 && state.player.overall >= curTeam2.strength - 2;
  const fixedAgeOffer = [22, 26, 30].includes(age) && !state.usedTransferOfferAges.includes(age);
  const upMoveAge = wantMoveUp && age >= 20 && age <= 33 && !state.usedUpMoveAges.includes(age);
  if (fixedAgeOffer || upMoveAge) {
    if (fixedAgeOffer) state.usedTransferOfferAges.push(age);
    if (upMoveAge) state.usedUpMoveAges.push(age);
    const r = roll(state.rngState);
    state.rngState = r.state;
    const p = fixedAgeOffer ? 0.55 : 0.5;
    if (r.v[0] < p) {
      return { ...EVENTS.transfer_rumor, id: `transfer-rumor-${state.step}`, options: EVENTS.transfer_rumor.options.map(o => ({ ...o })) };
    }
  }
  // 34 岁以上：告别赛
  if (age >= 34 && !state.championsFarewellOffered && state.currentTeamId) {
    state.championsFarewellOffered = true;
    return {
      id: `farewell-offer-${state.step}`,
      type: 'farewell_offer',
      title: '告别赛',
      text: `${age} 岁，你在训练结束后叫住了主教练。俱乐部想为你办一场告别赛，先问问你的意思。`,
      options: [
        { id: 'accept', label: '办，跟球迷好好告别', hint: '赛季末全场为你起立' },
        { id: 'decline', label: '不办，安静地离开', hint: '低调谢幕' },
        { id: 'keep', label: '再打一年', hint: '还不想走' },
      ],
    };
  }
  const ev = pickEvent(state, age);
  return ev;
}

function retirementStyleEvent(state, reason) {
  const styles = reason === 'no_offers' || reason === 'contract' ? WALKAWAY_STYLES : FAREWELL_STYLES;
  return {
    id: `retire-style-${state.step}`,
    type: reason === 'no_offers' || reason === 'contract' ? 'walkaway_style' : 'farewell_style',
    title: '谢幕',
    text: '你宣布了退役的决定。剩下的只是怎么让人知道。',
    options: styles.map(s => ({ id: s.id, label: s.label, hint: s.hint })),
  };
}

function showdownEvent(key, state, tournament) {
  const sd = SHOWDOWNS[key];
  const ev = {
    id: `${key}-${state.step}`,
    type: 'showdown',
    showdownKey: key,
    title: sd.title,
    text: sd.text,
    tournamentAge: tournament ? tournament.age : null,
    options: sd.options.map(o => ({ ...o })),
  };
  // 决胜时刻同时挂一个可进入单场模拟的对战上下文
  const stage = state.period && state.pendingGame && state.pendingGame.stage;
  const opponentId = state.pendingGame && state.pendingGame.opponentId;
  if (key === 'game7' || key === 'last_shot' || key === 'free_throw' ||
      key === 'qualifier_showdown' || key === 'world_cup_showdown') {
    state.pendingGame = {
      type: key,
      stage: stage || (key === 'game7' ? 'final' : 'playoff'),
      opponentId: opponentId || (state.currentTeamId ? pickPlayoffOpponent(state, TEAMS[state.currentTeamId], LEAGUES[TEAMS[state.currentTeamId].league]) : null),
      tournamentAge: tournament ? tournament.age : null,
    };
  }
  return ev;
}

function rivalDuelEvent(state) {
  const r = state.rival;
  const myPts = state.rivalSeries.reduce((s, x) => s + x.my, 0);
  const hisPts = state.rivalSeries.reduce((s, x) => s + x.rival, 0);
  const lead = hisPts > myPts ? `总得分上，他还压着你。` : `总得分上，你压着他。`;
  return {
    id: `rival-${state.step}`,
    type: 'career_event',
    title: '宿敌对决',
    text: `${state.player.age} 岁这年，你和${r.name}的每一次碰面都像季后赛。${lead}`,
    options: [
      {
        id: 'train', label: '赛后加练，研究他的打法', hint: '练成能力上涨，练过头有伤', outcomes: [
          { prob: 0.6, text: `你把${r.name}的进攻习惯研究透了，场上防得他难受。`, effects: { overallDelta: 1, permanent: true, legacy: `你和${r.name}的恩怨，又多了一页。` } },
          { prob: 0.4, text: '加练过猛，小腿拉伤。', effects: { injury: '小腿拉伤', tempDelta: -1 } },
        ],
      },
      {
        id: 'trash', label: '赛后当众放话', hint: '热度拉满，赢了封神输了挨骂', outcomes: [
          { prob: 0.5, text: `你在采访里点了${r.name}的名字，第二天全城都在讨论。`, effects: { tempDelta: 1, money: 200, legacy: `你向${r.name}下了战书。` } },
          { prob: 0.5, text: '话放出去了，下一场被打爆，成了笑柄。', effects: { tempDelta: -2 } },
        ],
      },
      {
        id: 'respect', label: '赛后握手致敬', hint: '英雄相惜', outcomes: [
          { prob: 1, text: `你和${r.name}交换了球衣。他说：下一场，我不会放水。`, effects: { roleShift: 1, legacy: `你和${r.name}互换了球衣。` } },
        ],
      },
    ],
  };
}

// ---------- 决策 ----------
export function decide(state, optionId) {
  const ev = state.currentEvent;
  if (!ev) return { state, screen: 'event' };
  const opt = ev.options.find(o => o.id === optionId);
  if (!opt) return { state, screen: 'event' };

  if (ev.type === 'ncaa_choice') {
    if (optionId === 'pro') {
      state.lastEventOutcome = { eventKey: 'ncaa_choice', optionKey: 'pro', text: '你决定不去美国，直接签职业合同。', kind: 'neutral' };
      state.stage = 'sign';
      state.currentEvent = signContractEvent(state);
      state.step += 1;
      return { state, screen: 'event' };
    }
    return tryNcaaRecruit(state);
  }

  if (ev.type === 'draft_choice') {
    return resolveDraftChoice(state, optionId);
  }

  if (ev.type === 'contract_expiry') {
    // 续约 or 自由市场（加盟报价球队）
    if (optionId !== 'renew') {
      return resolveContractExpiry(state, optionId, opt.teamId);
    }
    return resolveContractExpiry(state, 'renew');
  }

  if (ev.type === 'sign_contract') {
    state.currentTeamId = opt.teamId;
    state.contractTeamId = opt.teamId;
    state.stage = 'pro';
    const team = TEAMS[opt.teamId];
    state.player.marketValue = marketValueOf(state.player.overall, state.player.age, LEAGUES[team.league]);
    state.player.contract = makeContract(state.player, team, LEAGUES[team.league]);
    state.lastEventOutcome = { eventKey: 'sign_contract', optionKey: opt.teamId, text: `你穿上了${team.zh}的球衣，签下 ${state.player.contract.years} 年合同。`, kind: 'positive' };
    state.step += 1;
    state.currentEvent = null;
    return { state, screen: 'career' };
  }

  if (ev.type === 'transfer_choose') {
    const from = state.currentTeamId ? TEAMS[state.currentTeamId] : null;
    const team = TEAMS[opt.teamId];
    state.transfers.push({ age: state.player.age, from: from ? from.id : null, to: team.id });
    state.currentTeamId = team.id;
    state.contractTeamId = team.id;
    const league = LEAGUES[team.league];
    state.player.marketValue = marketValueOf(state.player.overall, state.player.age, league);
    state.player.contract = makeContract(state.player, team, league);
    if (team.id === state.player.foreignDreamTeamId || team.id === state.player.domesticDreamTeamId) {
      state.legacyLines.push(`你穿上了儿时主队${team.zh}的球衣。`);
    }
    state.lastEventOutcome = { eventKey: 'transfer', optionKey: team.id, text: `你加盟了${team.zh}，签下 ${state.player.contract.years} 年合同。`, kind: 'positive' };
    state.step += 1;
    state.currentEvent = null;
    state.pendingTransfer = null;
    return { state, screen: 'career' };
  }

  if (ev.type === 'farewell_offer') {
    if (optionId === 'keep') {
      state.lastEventOutcome = { eventKey: 'farewell_offer', optionKey: 'keep', text: '你还想再打一年。', kind: 'neutral' };
      state.currentEvent = null;
      state.step += 1;
      return { state, screen: 'career' };
    }
    state.retirementReason = 'farewell';
    if (optionId === 'accept') {
      state.lastEventOutcome = { eventKey: 'farewell_offer', optionKey: 'accept', text: '赛季最后一个主场，为你办一场告别赛。', kind: 'neutral' };
      state.currentEvent = {
        id: `farewell-style-${state.step}`,
        type: 'farewell_style',
        title: '告别赛',
        text: '赛季最后一个主场，为你办一场。你想怎么告别。',
        options: FAREWELL_STYLES.map(s => ({ id: s.id, label: s.label, hint: s.hint })),
      };
    } else {
      state.lastEventOutcome = { eventKey: 'farewell_offer', optionKey: 'decline', text: '不办，安静地离开。', kind: 'neutral' };
      state.currentEvent = {
        id: `goodbye-style-${state.step}`,
        type: 'goodbye_style',
        title: '谢幕',
        text: '不办，安静地离开。',
        options: GOODBYE_STYLES.map(s => ({ id: s.id, label: s.label, hint: s.hint })),
      };
    }
    state.step += 1;
    return { state, screen: 'event' };
  }

  if (ev.type === 'farewell_style' || ev.type === 'goodbye_style' || ev.type === 'walkaway_style') {
    if (ev.type === 'farewell_style') state.farewell = optionId;
    if (ev.type === 'goodbye_style') state.goodbye = optionId;
    if (ev.type === 'walkaway_style') state.walkaway = optionId;
    state.currentEvent = null;
    return finalize(state);
  }

  if (ev.type === 'voluntary_retire') {
    if (optionId === 'keep') {
      state.lastEventOutcome = { eventKey: 'voluntary_retire', optionKey: 'keep', text: '你还想再打两年。', kind: 'neutral' };
      state.currentEvent = null;
      state.step += 1;
      return { state, screen: 'career' };
    }
    state.lastEventOutcome = { eventKey: 'voluntary_retire', optionKey: 'retire', text: '你决定把退役消息发出去。', kind: 'neutral' };
    state.currentEvent = null;
    return beginRetirement(state, 'voluntary');
  }

  if (ev.type === 'showdown') {
    return resolveShowdown(state, ev, opt);
  }

  // 普通生涯事件：掷结果
  const rng = mulberry32(state.rngState);
  const outcomes = opt.outcomes;
  let pickR = rng();
  let picked = outcomes[0];
  let acc = 0;
  for (const o of outcomes) {
    acc += o.prob;
    if (pickR < acc) { picked = o; break; }
  }
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;

  const effects = picked.effects || {};
  const wasPositive = effects.overallDelta > 0 || effects.transfer || effects.money > 0 || effects.roleShift > 0;
  state.lastEventOutcome = {
    eventKey: ev.key,
    optionKey: optionId,
    text: picked.text,
    kind: wasPositive ? 'positive' : (effects.overallDelta < 0 || effects.injury || effects.suspended ? 'negative' : 'neutral'),
  };
  state.step += 1;

  // 应用效果
  const mods = state.period.modifiers || {};
  if (effects.overallDelta) state.player.overall = clamp(state.player.overall + effects.overallDelta, 40, 99);
  if (effects.roleShift) mods.roleShift = (mods.roleShift || 0) + effects.roleShift;
  if (effects.tempDelta) mods.tempDelta = (mods.tempDelta || 0) + effects.tempDelta;
  if (effects.trophyMult) mods.trophyMult = (mods.trophyMult || 1) * effects.trophyMult;
  if (effects.nationalMult) mods.nationalMult = (mods.nationalMult || 1) * effects.nationalMult;
  if (effects.salaryMult) mods.salaryMult = (mods.salaryMult || 1) * effects.salaryMult;
  if (effects.injury) mods.injury = effects.injury;
  if (effects.suspended) {
    state.suspensionSeasonsRemaining = effects.suspended;
    mods.suspended = true;
  }
  if (effects.money) state.totals.salary += effects.money;
  if (effects.nationalTeamRetired) state.nationalTeamRetiredAge = state.player.age;
  if (effects.legacy) state.legacyLines.push(effects.legacy);
  if (effects.award) state.totals.awards.push(effects.award);
  if (effects.forceRetire) {
    state.currentEvent = null;
    return beginRetirement(state, 'no_offers');
  }
  if (effects.transfer) {
    state.currentEvent = null;
    state.pendingTransfer = true;
    state.currentEvent = transferChooseEvent(state);
    return { state, screen: 'event' };
  }
  if (effects.dreamTeam) {
    const dream = state.player.domesticDreamTeamId || state.player.foreignDreamTeamId;
    if (dream) {
      state.transfers.push({ age: state.player.age, from: state.currentTeamId, to: dream });
      state.currentTeamId = dream;
      state.contractTeamId = dream;
      state.legacyLines.push(`你穿上了儿时主队${TEAMS[dream].zh}的球衣。`);
    }
  }

  state.currentEvent = null;
  return { state, screen: 'career' };
}

function resolveShowdown(state, ev, opt) {
  const key = ev.showdownKey;
  const overall = state.player.overall;
  let p = clamp(0.42 + (overall - 75) * 0.01, 0.28, 0.88);
  const mods = {
    last_shot: { three: -0.08, drive: 0.05, pass: 0.03 },
    free_throw: { calm: 0.06, quick: -0.02 },
    game7: { iso: -0.04, screen: 0.06 },
    qualifier_showdown: { aggressive: -0.06, steady: 0.07 },
    world_cup_showdown: { hero: -0.05, team: 0.05 },
  };
  p = clamp(p + (mods[key]?.[opt.id] || 0), 0.22, 0.92);
  const rng = mulberry32(state.rngState);
  const won = rng() < p;
  state.rngState = (rng() * 4294967296) >>> 0 || 12345;
  state.showdownWins[key] += won ? 1 : 0;
  const text = won ? opt.successText : opt.failText;
  state.lastEventOutcome = { eventKey: key, optionKey: opt.id, text, kind: won ? 'positive' : 'negative' };
  state.step += 1;

  if (key === 'last_shot' && won) state.legacyLines.push('终场哨响前，你把球投进了。');
  if (key === 'free_throw' && won) state.legacyLines.push('关键罚球，你稳稳两罚全中。');
  if (key === 'game7' && won) state.legacyLines.push('抢七大战，你带走了系列赛。');

  if (key === 'qualifier_showdown' && ev.tournamentAge) {
    const t = state.tournaments.find(t2 => t2.age === ev.tournamentAge);
    if (t) t.qualified = won;
    state.pendingQualifier = { age: ev.tournamentAge, won };
    if (won) state.legacyLines.push('生死战，你把国家队送进了大赛。');
  }

  if (key === 'world_cup_showdown') {
    const nat = state.nationalTeamPeriods.find(n => n.age === ev.tournamentAge);
    if (nat) {
      if (won) {
        nat.result = 'champion';
        state.totals.trophies.push(nat.type === 'world_cup' ? 'world_cup' : 'olympics');
        state.legacyLines.push(nat.type === 'world_cup' ? '你把世界杯举过头顶。' : '奥运金牌挂在了你的脖子上。');
        if (state.player.overall >= 86) state.totals.awards.push('tournament_mvp');
      } else {
        nat.result = 'semis';
      }
    }
    state.pendingWorldCupUpgrade = null;
  }

  state.currentEvent = null;
  state.pendingGame = null;
  return { state, screen: 'career' };
}

function beginRetirement(state, reason) {
  state.retirementReason = reason;
  if (reason === 'voluntary' && state.player.age <= 32) state.endingBeat = '在最好看的时候转身';
  state.currentEvent = retirementStyleEvent(state, reason);
  return { state, screen: 'event' };
}

// ---------- 单场关键战 ----------
function pickPlayoffOpponent(state, team, league) {
  // 同联赛里挑一支强度接近的球队作为对手
  const candidates = Object.values(TEAMS).filter(t => t.league === league.id && t.id !== team.id);
  if (candidates.length === 0) return Object.values(TEAMS).find(t => t.id !== team.id)?.id || null;
  const diff = Math.abs(candidates[0].strength - team.strength);
  let best = candidates[0];
  for (const t of candidates) {
    if (Math.abs(t.strength - team.strength) < diff) { best = t; }
  }
  return best.id;
}

// 为一场单场关键战生成对阵上下文
export function makeGameContext(state, kind) {
  const pg = state.pendingGame;
  const team = TEAMS[state.currentTeamId];
  const homeId = state.currentTeamId;
  const awayId = pg && pg.opponentId ? pg.opponentId : pickPlayoffOpponent(state, team, LEAGUES[team.league]);
  const opp = TEAMS[awayId];
  const stage = pg && pg.stage ? pg.stage : 'final';
  const label =
    kind === 'game7' ? `抢七大战 · ${stage === 'final' ? '总决赛' : '半决赛'}决胜` :
    kind === 'qualifier_showdown' ? '国家队生死战 · 预选赛' :
    kind === 'world_cup_showdown' ? '大赛淘汰赛' :
    kind === 'last_shot' ? '最后一攻' :
    kind === 'free_throw' ? '关键罚球' :
    stage === 'final' ? '总决赛 · 生死一战' : '半决赛 · 关键一战';
  return {
    kind,
    label,
    homeId,
    homeTeam: team,
    awayId,
    awayTeam: opp,
    stage,
    seed: (state.seed.split('-').pop() || '0') + state.step,
  };
}

// 把一场单场模拟的结果写回生涯状态
export function applyGameResult(state, game) {
  const won = game.winner === 'home';
  const seasonIndex = state.pendingGame && state.pendingGame.seasonIndex;
  const snap = seasonIndex != null ? state.seasons[seasonIndex] : null;
  const t = state.totals;

  // 累加我的单场数据
  const my = { pts: game.myPts || 0, reb: game.myReb || 0, ast: game.myAst || 0, stl: game.myStl || 0, blk: game.myBlk || 0 };
  if (my.pts + my.reb + my.ast > 0) {
    t.pts += my.pts; t.reb += my.reb; t.ast += my.ast; t.stl += my.stl; t.blk += my.blk; t.apps += 1;
  }

  state.playedGames = state.playedGames || [];
  state.playedGames.push({
    type: game.kind || 'key',
    label: game.label,
    won,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    opp: game.awayName || game.away.zh,
    myPts: my.pts, myReb: my.reb, myAst: my.ast,
    myStl: my.stl, myBlk: my.blk,
    age: state.player.age,
    stage: state.pendingGame?.stage,
  });

  const kind = game.kind || (state.pendingGame ? state.pendingGame.type : 'playoff_key');

  if (kind === 'playoff_key' && snap) {
    if (game.stage === 'final') {
      if (won) {
        snap.result = { league: 'champion' };
        t.trophies.push(`league:${snap.leagueId}`);
        if (state.player.overall >= 84 && !snap.awards.includes('fmvp')) snap.awards.push('fmvp');
        state.legacyLines.push('总决赛，你把总冠军带回了家。');
      } else {
        snap.result = { league: 'final' };
      }
    } else if (game.stage === 'semis') {
      if (won) {
        snap.result = { league: 'final' };
        state.legacyLines.push('半决赛生死战，你带队杀进了总决赛。');
        // 如果本场高分，再配一个决赛关键战
        if (my.pts >= 40) state.highlights.push({ age: state.player.age, text: '半决赛单场轰下 40+ 分' });
      }
    }
    if (my.pts >= 50) state.highlights.push({ age: state.player.age, text: '关键战单场轰下 50+ 分！' });
    if (my.pts >= 30) state.highlights.push({ age: state.player.age, text: '关键战单场 30+ 分' });
  }

  if (kind === 'game7') {
    state.showdownWins.game7 += won ? 1 : 0;
    if (won) {
      if (snap && snap.result.league === 'semis') { snap.result = { league: 'final' }; }
      else if (snap && snap.result.league === 'final') {
        snap.result = { league: 'champion' };
        if (snap.leagueId) t.trophies.push(`league:${snap.leagueId}`);
        if (state.player.overall >= 84 && !snap.awards.includes('fmvp')) snap.awards.push('fmvp');
      }
      state.legacyLines.push('抢七大战，你带走了系列赛。');
    } else {
      state.legacyLines.push('抢七大战，你拼到了最后，还是差了那么一点。');
    }
  }

  if (kind === 'last_shot') {
    state.showdownWins.last_shot += won ? 1 : 0;
    if (won) state.legacyLines.push('终场哨响前，你把球投进了。');
    else state.legacyLines.push('绝杀偏出，你低下了头。');
  }

  if (kind === 'free_throw') {
    state.showdownWins.free_throw += won ? 1 : 0;
    if (won) state.legacyLines.push('关键罚球，你稳稳两罚全中。');
    else state.legacyLines.push('关键时刻，罚球偏出。');
  }

  if (kind === 'qualifier_showdown') {
    const t2 = state.pendingQualifier && state.pendingQualifier.age;
    if (t2 != null) {
      const tt = state.tournaments.find(x => x.age === t2);
      if (tt) tt.qualified = won;
      state.pendingQualifier = { age: t2, won };
    }
    if (won) state.legacyLines.push('生死战，你把国家队送进了大赛。');
  }

  if (kind === 'world_cup_showdown') {
    const nat = state.nationalTeamPeriods.find(n => n.age === game.tournamentAge);
    if (nat) {
      if (won) {
        nat.result = 'champion';
        t.trophies.push(nat.type === 'world_cup' ? 'world_cup' : 'olympics');
        state.legacyLines.push(nat.type === 'world_cup' ? '你把世界杯举过头顶。' : '奥运金牌挂在了你的脖子上。');
        if (state.player.overall >= 86) t.awards.push('tournament_mvp');
      } else {
        nat.result = 'semis';
      }
    }
    state.pendingWorldCupUpgrade = null;
  }

  state.pendingGame = null;

  // 如果是决胜时刻（showdown）事件，直接通过比赛结果结算，清除当前事件
  const showdownKinds = ['game7', 'last_shot', 'free_throw', 'qualifier_showdown', 'world_cup_showdown'];
  if (showdownKinds.includes(kind) && state.currentEvent && state.currentEvent.type === 'showdown') {
    const key = kind;
    state.lastEventOutcome = {
      eventKey: key,
      optionKey: 'simulate',
      text: won ? '你在场上亲手终结了这场比赛。' : '你拼到最后一刻，还是差了一点。',
      kind: won ? 'positive' : 'negative',
    };
    state.step += 1;
    state.currentEvent = null;
  }

  return { state, screen: 'career' };
}

// ---------- 结算 ----------
export function maxOverall(state) {
  let m = state.player.overall;
  for (const s of state.seasons) m = Math.max(m, s.overall);
  return m;
}

export function peakSeason(state) {
  let best = null;
  for (const s of state.seasons) {
    if (!best || s.overall > best.overall) best = s;
  }
  return best;
}

export function teamById2(id) {
  return TEAMS[id] || NCAA_TEAMS[id] || null;
}

export function clubsOf(state) {
  const map = new Map();
  for (const s of state.seasons) {
    if (!s.teamId || s.youth) continue;
    const key = s.teamId;
    if (!map.has(key)) {
      map.set(key, { teamId: key, seasons: 0, stats: { g: 0, pts: 0, reb: 0, ast: 0 }, trophies: [], awards: [] });
    }
    const c = map.get(key);
    c.seasons += 1;
    c.stats.g += s.stats.g;
    c.stats.pts += s.stats.pts;
    c.stats.reb += s.stats.reb;
    c.stats.ast += s.stats.ast;
    s.trophies.forEach(x => c.trophies.push(x));
    s.awards.forEach(x => c.awards.push(x));
  }
  return [...map.values()];
}

export function trophyCounts(trophies) {
  const counts = {};
  for (const t of trophies) counts[t] = (counts[t] || 0) + 1;
  return counts;
}

export function trophyZh(id) {
  if (id === 'world_cup') return '世界杯';
  if (id === 'olympics') return '奥运会';
  if (id === 'continental') return '洲际冠军';
  if (id === 'ncaa:champion') return 'NCAA总冠军';
  if (id.startsWith('league:')) {
    const lg = LEAGUES[id.slice(7)];
    return lg ? lg.champ : '联赛冠军';
  }
  if (id.startsWith('cup:')) {
    const lg = LEAGUES[id.slice(4)];
    return lg && lg.cupName ? lg.cupName : '杯赛冠军';
  }
  return '冠军';
}

export function awardZh(id) {
  const map = {
    allstar: '全明星',
    all_team: '最佳阵容',
    all_nba_1: '最佳阵容一阵',
    all_nba_2: '最佳阵容二阵',
    all_nba_3: '最佳阵容三阵',
    all_def_1: '最佳防守一阵',
    all_def_2: '最佳防守二阵',
    roty: '最佳新秀',
    mvp: '常规赛MVP',
    fmvp: '总决赛MVP',
    dpoy: '最佳防守球员',
    sixth_man: '最佳第六人',
    mip: '进步最快球员',
    champion_ring: '总冠军',
    scoring_title: '得分王',
    rebound_title: '篮板王',
    assist_title: '助攻王',
    steal_title: '抢断王',
    block_title: '盖帽王',
    tournament_mvp: '大赛MVP',
    tournament_all_team: '大赛最佳阵容',
    allstar_mvp: '全明星MVP',
    dunk_king: '扣篮大赛冠军',
    three_king: '三分大赛冠军',
  };
  return map[id] || id;
}

export function tournamentZh(type) {
  return { world_cup: '世界杯', olympics: '奥运会', continental: '洲际锦标赛' }[type] || type;
}

export function resultZh(result, league, type = 'club') {
  if (type === 'club') {
    const map = {
      champion: league && league.tier === 1 ? 'NBA总冠军' : '联赛冠军',
      final: '总决赛/决赛',
      semis: '四强',
      quarters: '八强',
      playoffs: '季后赛',
      missed: '无缘季后赛',
      youth: '青训营',
    };
    return map[result] || result;
  }
  const map = {
    champion: '冠军',
    semis: '四强',
    quarters: '八强',
    group: '小组赛',
    not_qualified: '未出线',
    not_called: '未入选',
  };
  return map[result] || result;
}

function epitaph(state) {
  const peak = maxOverall(state);
  const t = state.totals;
  const lines = [];
  if (t.trophies.includes('world_cup')) lines.push('一路打到世界之巅，能拿的都拿到了。');
  else if (peak >= 96) lines.push('天生的妖人胚子，真的打到了 ' + peak + '。');
  else if (peak >= 90 && t.trophies.length === 0) lines.push('强到无可争议，却始终两手空空。');
  else if (clubsOf(state).length === 1 && state.seasons.filter(s => !s.youth).length >= 8) lines.push('一辈子只穿一件球衣。');
  else if (peak >= 85 && state.player.overall <= 72) lines.push('不是每个天才都来得及长大。');
  else if (state.player.age >= 38) lines.push('同龄人都挂靴了，你还在名单里。');
  else lines.push('从青训到传奇，每个决定都算数。');
  if (state.endingBeat) lines.push(state.endingBeat);
  return lines.join('');
}

export function computeTitles(state) {
  const t = state.totals;
  const peak = maxOverall(state);
  const peakAge = peakSeason(state)?.age ?? 16;
  const clubs = clubsOf(state);
  const proSeasons = state.seasons.filter(s => !s.youth && s.teamId);
  const won = (id) => t.trophies.includes(id);
  const countAward = (id) => t.awards.filter(a => a === id).length;
  const champCount = t.trophies.filter(x => x.startsWith('league:') || x.startsWith('cup:')).length;
  const titles = [];
  const unlocked = (id, quote) => titles.push({ id, quote });

  if (peak >= 96) unlocked('tian_zhijiaozi', `巅峰能力 ${peak}，真·天之骄子。`);
  if (peak >= 93 && (state.player.debutOverall || 99) <= 72) unlocked('yao_ren_dx', `出道 ${state.player.debutOverall}，巅峰 ${peak}。`);
  if (peak >= 88 && (state.player.debutOverall || 99) <= 62 && peakAge >= 28) unlocked('da_qi_wan_cheng', `晚熟型球员，硬是把自己练到了 ${peak}。`);
  if (peak >= 85 && state.player.overall <= 72) unlocked('shang_zhong_yong', `巅峰 ${peak}，退役时只有 ${state.player.overall}。`);
  if (clubs.length === 1 && proSeasons.length >= 8) unlocked('yi_ren_yi_cheng', '一生只效力一支球队。');
  if (clubs.length >= 6) unlocked('lan_tan_liu_lang_zhe', `效力过 ${clubs.length} 支球队，走到哪都是客场。`);
  if (t.apps >= 1000) unlocked('tie_ren', `生涯出场 ${fmtInt(t.apps)} 场，铁人。`);
  if (t.pts >= 30000) unlocked('de_fen_ji_qi', `生涯总得分 ${fmtInt(Math.round(t.pts))}。`);
  if (state.seasons.some(s => s.stats.avg && s.stats.avg.pts >= 10 && s.stats.avg.reb >= 10 && s.stats.avg.ast >= 10)) unlocked('san_shuang_ji_qi', '单季场均三双，只有怪物能打出来。');
  if (peak >= 90 && champCount === 0 && !won('world_cup') && !won('olympics')) unlocked('wu_mian_zhi_wang', `巅峰 ${peak}，却一冠未得。`);
  if (won('world_cup') || won('olympics')) unlocked('shi_jie_zhi_dian', '世界之巅，你站上去过。');
  if ((won('world_cup') || won('olympics')) && countAward('fmvp') >= 1 && peak >= 96) unlocked('lan_qiu_zhi_shen', '世界杯 + FMVP + 巅峰 96，篮球之神。');
  if (won('world_cup') && won('olympics') && won('continental') && champCount >= 2) unlocked('jin_man_guan', '世界杯、奥运、洲际、联赛，全拿过。');
  if (consecutiveTitles(state) >= 3) unlocked('wang_chao_ji', `同一支球队 ${consecutiveTitles(state)} 连冠，王朝。`);
  if (champCount >= 12) unlocked('guan_jun_shou_ge_ji', `生涯 ${champCount} 座奖杯。`);
  if (t.salary >= 200000) unlocked('lan_tan_shou_fu', `生涯总收入 ${fmtMoney(t.salary)}。`);
  if (state.seasons.some(s => s.salary >= 30000)) unlocked('tian_jia_he_tong', `单季年薪 ${fmtMoney(Math.max(...state.seasons.map(s => s.salary)))}。`);
  if (countAward('allstar') >= 10) unlocked('quan_ming_xing_zhi_wang', `${countAward('allstar')} 次全明星。`);
  if (countAward('mvp') >= 4) unlocked('zui_you_jia_zhi', `${countAward('mvp')} 次常规赛MVP。`);
  if (countAward('fmvp') >= 3) unlocked('zong_jue_sai_zhi_wang', `${countAward('fmvp')} 次总决赛MVP。`);
  if (countAward('scoring_title') >= 5) unlocked('de_fen_wang', `${countAward('scoring_title')} 次得分王。`);
  if (countAward('rebound_title') >= 5 || t.reb >= 15000) unlocked('lan_ban_guai_shou', '篮板就是命。');
  if (countAward('assist_title') >= 5 || t.ast >= 10000) unlocked('zu_zhi_da_shi', '把队友喂成巨星。');
  if (countAward('dpoy') >= 3) unlocked('fang_shou_tie_zha', `${countAward('dpoy')} 次最佳防守球员。`);
  if (state.player.age >= 38 && proSeasons.length >= 18) unlocked('bu_lao_chuan_shuo', `${state.player.age} 岁还在打，不老传说。`);
  if ((state.retirementReason === 'voluntary' || state.farewell) && state.player.age <= 32 && peak >= 90) unlocked('ji_liu_yong_tui', '在最好看的时候转身。');
  if (state.nationalTeamPeriods.length >= 10) unlocked('guo_jia_dui_qi_zhi', `为国出战 ${state.nationalTeamPeriods.length} 届大赛。`);
  const dreamTeam = state.player.domesticDreamTeamId || state.player.foreignDreamTeamId;
  if (dreamTeam && t.trophies.some(id => id === `league:${TEAMS[dreamTeam].league}`)) unlocked('yuan_meng_ren', '为儿时主队拿过冠军，圆梦。');
  if (state.showdownWins.last_shot > 0) unlocked('jue_sha_zhi_wang', '关键球，交给我。');
  if (state.showdownWins.free_throw >= 2) unlocked('fa_qiu_da_shi', '罚球线上，从不手软。');
  const rs = state.rivalSeries || [];
  if (state.rival && rs.length >= 8 && rs.filter(x => x.myChamp).length >= 1 && rs.filter(x => x.rivalChamp).length >= 1) {
    unlocked('yi_sheng_zhi_di', `你和${state.rival.name}斗了一辈子，谁也没服过谁。`);
  }
  if (state.rival && rs.length >= 6) {
    const myPts = rs.reduce((s, x) => s + x.my, 0);
    const hisPts = rs.reduce((s, x) => s + x.rival, 0);
    const myChamp = rs.filter(x => x.myChamp).length;
    const hisChamp = rs.filter(x => x.rivalChamp).length;
    if (myPts >= hisPts * 1.05 && myChamp > hisChamp) {
      unlocked('yan_zhong_ding', `你压了${state.rival.name}一辈子。`);
    }
  }

  return titles;
}

function consecutiveTitles(state) {
  let best = 0, cur = 0, curTeam = null;
  for (const s of state.seasons) {
    const champ = s.trophies.some(x => x.startsWith('league:'));
    if (champ && s.teamId === curTeam) cur += 1;
    else if (champ) { cur = 1; curTeam = s.teamId; }
    else { cur = 0; curTeam = null; }
    best = Math.max(best, cur);
  }
  return best;
}

export function nationalLine(state) {
  const periods = state.nationalTeamPeriods;
  if (periods.length === 0) return null;
  const games = periods.reduce((s, p) => s + (p.stats ? p.stats.g : 0), 0);
  const pts = periods.reduce((s, p) => s + (p.stats ? p.stats.pts : 0), 0);
  const reb = periods.reduce((s, p) => s + (p.stats ? p.stats.reb : 0), 0);
  const ast = periods.reduce((s, p) => s + (p.stats ? p.stats.ast : 0), 0);
  const golds = periods.filter(p => p.result === 'champion').length;
  return { games, pts, reb, ast, golds };
}

export function finalize(state) {
  state.phase = 'summary';
  state.currentEvent = null;
  if (!state.endingBeat) {
    if (state.retirementReason === 'voluntary' && state.player.age <= 32) state.endingBeat = '在最好看的时候转身';
    if (state.player.age >= 38) state.endingBeat = '同龄人都挂靴了，你还在名单里。';
  }
  return { state, screen: 'summary' };
}

export function buildSummary(state) {
  const peak = maxOverall(state);
  const t = state.totals;
  const nat = nationalLine(state);
  const titles = computeTitles(state);
  const clubs = clubsOf(state);
  const proSeasons = state.seasons.filter(s => !s.youth && s.teamId);
  const rs = state.rivalSeries || [];
  const rival = state.rival && rs.length ? {
    name: state.rival.name,
    nationality: state.rival.nationality,
    peak: state.rival.peak,
    series: rs.length,
    myPts: Math.round(rs.reduce((s, x) => s + x.my, 0)),
    rivalPts: Math.round(rs.reduce((s, x) => s + x.rival, 0)),
    myChamps: rs.filter(x => x.myChamp).length,
    rivalChamps: rs.filter(x => x.rivalChamp).length,
    myMvp: rs.filter(x => x.myMvp).length,
    rivalMvp: rs.filter(x => x.rivalMvp).length,
  } : null;
  return {
    seed: state.seed,
    player: {
      name: state.player.name,
      nationality: state.player.nationality,
      position: state.player.positionZh,
      positionEn: POSITIONS[state.player.position].en,
      number: state.player.number,
      hand: state.player.hand,
    },
    maxOverall: peak,
    draft: state.draft ? (state.draft.undrafted ? { undrafted: true } : {
      pick: state.draft.pick,
      round: state.draft.round,
      team: state.draft.teamId ? TEAMS[state.draft.teamId]?.zh : null,
    }) : null,
    ncaaSeasons: state.seasons.filter(s => s.ncaaYear).length,
    peakAge: peakSeason(state)?.age ?? 16,
    peakValue: Math.max(...state.seasons.map(s => s.marketValue || 0), state.player.marketValue),
    totalIncome: t.salary,
    totals: {
      apps: t.apps,
      pts: Math.round(t.pts),
      reb: Math.round(t.reb),
      ast: Math.round(t.ast),
      stl: Math.round(t.stl),
      blk: Math.round(t.blk),
    },
    national: nat ? {
      games: nat.games,
      pts: Math.round(nat.pts),
      reb: Math.round(nat.reb),
      ast: Math.round(nat.ast),
      golds: nat.golds,
    } : null,
    titles,
    titleIds: titles.map(x => x.id),
    epitaph: epitaph(state),
    percentile: percentileOf(peak),
    clubs: clubs.map(c => {
      const team = TEAMS[c.teamId] || NCAA_TEAMS[c.teamId];
      return {
        teamId: c.teamId,
        abbr: team.abbr,
        name: team.zh,
        color: team.color,
        isLight: isLight(team.color),
        elite: team.strength >= 85,
        ncaa: !!NCAA_TEAMS[c.teamId],
        seasons: c.seasons,
        games: c.stats.g,
        pts: Math.round(c.stats.pts),
        reb: Math.round(c.stats.reb),
        ast: Math.round(c.stats.ast),
        trophies: c.trophies,
        awards: c.awards,
      };
    }),
    seasonsCount: proSeasons.length,
    legacyLines: state.legacyLines,
    highlights: (state.highlights || []).slice(-14),
    keyGames: (state.playedGames || []).map(g => ({
      label: g.label,
      won: g.won,
      score: `${g.homeScore} : ${g.awayScore}`,
      opp: g.opp,
      myPts: g.myPts, myReb: g.myReb, myAst: g.myAst,
      age: g.age,
    })).slice(-20),
    rival,
    farewell: state.farewell,
    goodbye: state.goodbye,
    walkaway: state.walkaway,
    retirementReason: state.retirementReason,
    endingBeat: state.endingBeat,
    savedAt: Date.now(),
  };
}

export function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}

export function endingZh(reason) {
  const map = {
    age: '挂靴',
    voluntary: '主动退役',
    no_offers: '无人问津',
    farewell: '告别赛',
    contract: '合同到期',
  };
  return map[reason] || '退役';
}

// ---------- 存档 ----------
export function saveState(state) {
  try {
    localStorage.setItem(`bl-save:${state.seed}`, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

export function loadState(seed) {
  try {
    const raw = localStorage.getItem(`bl-save:${seed}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function clearState(seed) {
  try { localStorage.removeItem(`bl-save:${seed}`); } catch (e) { /* ignore */ }
}

export function saveArchive(summary) {
  try {
    const key = 'bl-archive';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift(summary);
    const dedup = [];
    const seen = new Set();
    for (const it of list) {
      if (!seen.has(it.seed)) { seen.add(it.seed); dedup.push(it); }
    }
    localStorage.setItem(key, JSON.stringify(dedup.slice(0, 50)));
  } catch (e) { /* ignore */ }
}

export function loadArchive() {
  try {
    return JSON.parse(localStorage.getItem('bl-archive') || '[]');
  } catch (e) { return []; }
}

export function galleryState() {
  const archive = loadArchive();
  const unlocked = new Map();
  for (const a of archive) {
    for (const t of (a.titles || [])) {
      if (!unlocked.has(t.id)) unlocked.set(t.id, t.quote);
    }
  }
  return { unlocked, total: TITLES.length };
}
