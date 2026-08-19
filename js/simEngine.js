// ================= 单场模拟引擎（精简版逐回合） =================
// 移植自 NBA-Sim-Web 的核心思路：24秒进攻 → 选进攻/防守人 → 失误/犯规/盖帽/投篮判定 → 篮板 → 球权转换
// 球员属性使用 0-99 的 13 维体系（与 perfect-player 一致）

// 位置简写 → 中文
export const POS_EN_ZH = { PG: '控卫', SG: '分卫', SF: '小前', PF: '大前', C: '中锋' };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- 生成一支球队的名单 ----------
// teamLike: { abbr, zh, strength, league }
// names: 姓名池 [{zh}]；若给了 pool 球员数组则优先使用
export function makeRoster(teamLike, names, pool, opts = {}) {
  const roster = [];
  const poolSize = pool ? pool.length : 0;
  const total = opts.total || 10;
  // 首发的5人用球队最强（真实球员按 ovr 排），替补可复用
  let used = new Set();
  for (let i = 0; i < total; i++) {
    const isStarter = i < 5;
    let p = null;
    if (pool && poolSize) {
      // 首发优先强球员，替补随机
      const cands = pool.slice().sort((a, b) => b.ovr - a.ovr);
      const cand = isStarter ? cands[i] : cands[Math.min(5 + Math.floor(Math.random() * 3), cands.length - 1)];
      if (cand && !used.has(cand.name)) {
        used.add(cand.name);
        p = {
          name: cand.cname || cand.name,
          en: cand.name,
          pos: mainPos(cand.pos),
          ovr: cand.ovr,
          attrs: {
            threePT: cand.threePT ?? cand.ovr - 5, MID: cand.MID ?? cand.ovr - 3,
            FIN: cand.FIN ?? cand.ovr - 2, DNK: cand.DNK ?? cand.ovr - 6,
            HAN: cand.HAN ?? cand.ovr - 2, PAS: cand.PAS ?? cand.ovr - 3,
            PDEF: cand.PDEF ?? cand.ovr - 4, IDEF: cand.IDEF ?? cand.ovr - 4,
            BLK: cand.BLK ?? cand.ovr - 8, REB: cand.REB ?? cand.ovr - 5,
            ATH: cand.ATH ?? cand.ovr - 3, STR: cand.STR ?? cand.ovr - 2,
            CLU: cand.CLU ?? cand.ovr - 2,
          },
          real: true,
        };
      }
    }
    if (!p) {
      // 虚拟球员：围绕球队 strength 生成
      const ovr = clamp(teamLike.strength + (isStarter ? 6 : -8) + Math.floor(Math.random() * 7) - 3, 55, 99);
      p = virtualPlayer(names, ovr, isStarter);
    }
    p.starter = isStarter;
    p.team = teamLike.abbr;
    roster.push(p);
  }
  return roster;
}

export function virtualPlayer(names, ovr, isStarter) {
  const pos = pick(Math.random, ['PG', 'SG', 'SF', 'PF', 'C']);
  const name = names ? names[Math.floor(Math.random() * names.length)] : '球员' + Math.floor(Math.random() * 99);
  const offBase = ovr;
  return {
    name: name.zh || name,
    en: name.en || name.zh || name,
    pos,
    ovr,
    starter: isStarter,
    attrs: {
      threePT: clamp(offBase - 12 + Math.floor(Math.random() * 12), 40, 99),
      MID: clamp(offBase - 8 + Math.floor(Math.random() * 10), 40, 99),
      FIN: clamp(offBase - 6 + Math.floor(Math.random() * 10), 45, 99),
      DNK: clamp(offBase - 14 + Math.floor(Math.random() * 14), 35, 99),
      HAN: clamp(offBase - 8 + Math.floor(Math.random() * 10), 40, 99),
      PAS: clamp(offBase - 10 + Math.floor(Math.random() * 12), 40, 99),
      PDEF: clamp(offBase - 10 + Math.floor(Math.random() * 10), 40, 99),
      IDEF: clamp(offBase - 10 + Math.floor(Math.random() * 10), 40, 99),
      BLK: clamp(offBase - 18 + Math.floor(Math.random() * 14), 30, 99),
      REB: clamp(offBase - 12 + Math.floor(Math.random() * 12), 35, 99),
      ATH: clamp(offBase - 10 + Math.floor(Math.random() * 12), 40, 99),
      STR: clamp(offBase - 12 + Math.floor(Math.random() * 12), 35, 99),
      CLU: clamp(offBase - 12 + Math.floor(Math.random() * 12), 40, 99),
    },
    real: false,
  };
}

export function mainPos(posStr) {
  if (!posStr) return 'SF';
  const first = String(posStr).split('/')[0].trim().toUpperCase();
  return ['PG', 'SG', 'SF', 'PF', 'C'].includes(first) ? first : 'SF';
}

// ---------- 一场比赛 ----------
// opts: { isPlayoff, seed, myPlayerIndex, label }
// myPlayer 会强制加入主队首发并作为核心
export function simulateGame(homeTeam, awayTeam, homeRoster, awayRoster, opts = {}) {
  const seed = opts.seed || (Math.random() * 1e9) >>> 0;
  const rng = mulberry32(seed);
  const isPlayoff = !!opts.isPlayoff;
  const home = { team: homeTeam, roster: homeRoster.map(p => ({ ...p, box: emptyBox() })) };
  const away = { team: awayTeam, roster: awayRoster.map(p => ({ ...p, box: emptyBox() })) };

  // 强制插入我方球员到主队
  const me = opts.myPlayer;
  if (me) {
    const playerObj = {
      name: me.name, en: me.name, pos: me.pos, ovr: me.overall,
      starter: true, real: true, isMe: true,
      attrs: me.attrs,
      box: emptyBox(),
    };
    home.roster.splice(opts.myPlayerIndex || 0, 1, playerObj);
  }

  const log = [];           // play-by-play 解说
  const scoreSnap = [];     // [homeScore, awayScore] 每行对应的比分
  const homeScore = { q: [], total: 0, half: 0, tq: [] };
  const awayScore = { q: [], total: 0, half: 0, tq: [] };

  const add = (s) => {
    log.push(s);
    scoreSnap.push([homeScore.total, awayScore.total]);
  };

  const QLEN = isPlayoff ? 12 : 12;
  const homeLabel = `${home.team.abbr || home.team.zh} ${home.team.zh || ''}`;
  const awayLabel = `${away.team.abbr || away.team.zh} ${away.team.zh || ''}`;
  const hShort = home.team.abbr || home.team.zh;
  const aShort = away.team.abbr || away.team.zh;

  add(`🏀 ${isPlayoff ? '🏆 季后赛' : '⚡ 常规赛'} 开球：${awayLabel} @ ${homeLabel}`);

  // ---------- 球员工具 ----------
  const onCourt = (side) => side.roster.filter(p => p.onCourt && p.box.fouls < 6);
  const startersOf = (side) => side.roster.filter(p => p.starter);
  const benchOf = (side) => side.roster.filter(p => !p.starter);

  // 每个 possession 需要的状态
  let poss = { offense: home, defense: away, q: 1, time: QLEN * 60, hasBall: null };

  const boxOf = (p) => p.box;

  function addTo(p, key, v) {
    if (!p) return;
    const b = boxOf(p);
    if (key === 'pts') { b.pts += v; }
    else if (key === 'reb') { b.reb += v; b.totalReb += v; }
    else if (key === 'ast') { b.ast += v; }
    else if (key === 'stl') { b.stl += v; }
    else if (key === 'blk') { b.blk += v; }
    else if (key === 'min') { b.min += v; }
  }

  function pickScorer(side, opp, quarter, timeLeft) {
    // 按综合进攻属性加权；我方核心额外加成
    const players = onCourt(side);
    const weighted = players.map(p => {
      const a = p.attrs;
      const off = (a.FIN * 0.35 + a.MID * 0.25 + a.threePT * 0.2 + a.PAS * 0.1 + a.ATH * 0.1);
      let w = off + p.ovr * 0.6;
      if (p.isMe) w *= 1.9;
      return { p, w };
    });
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) return x.p;
    }
    return weighted[weighted.length - 1].p;
  }

  function pickRebounder(side) {
    const players = onCourt(side);
    const weighted = players.map(p => ({
      p,
      w: p.attrs.REB + (p.pos === 'C' ? 22 : p.pos === 'PF' ? 12 : p.pos === 'SF' ? 4 : 0) + (p.isMe ? 8 : 0),
    }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of weighted) { r -= x.w; if (r <= 0) return x.p; }
    return weighted[weighted.length - 1].p;
  }

  // 助攻者：从除出手者外的场上球员中按传球能力加权选（玩家可拿助攻）
  function pickAssist(side, scorer) {
    const players = onCourt(side).filter(p => p !== scorer);
    if (!players.length) return null;
    const weighted = players.map(p => ({
      p,
      w: (p.attrs.PAS || 60) + (p.attrs.HAN || 60) * 0.5 + (p.isMe ? 10 : 0),
    }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of weighted) { r -= x.w; if (r <= 0) return x.p; }
    return weighted[weighted.length - 1].p;
  }

  function pickDefender(side, scorer) {
    const players = onCourt(side).filter(p => !p.isMe);
    // 尽量同位置
    const same = players.filter(p => p.pos === scorer.pos);
    const pool = same.length ? same : players;
    const total = pool.reduce((s, p) => s + (p.attrs.PDEF + p.attrs.IDEF) / 2, 0);
    let r = rng() * total;
    for (const p of pool) { r -= (p.attrs.PDEF + p.attrs.IDEF) / 2; if (r <= 0) return p; }
    return pool[pool.length - 1];
  }

  function shotTypeFor(p) {
    const pos = p.pos;
    const r = rng();
    if (pos === 'C' || pos === 'PF') {
      // 内线：更多内线出手
      return r < 0.5 ? 'drive' : r < 0.7 ? 'mid' : 'three';
    }
    if (pos === 'PG' || pos === 'SG') {
      return r < 0.3 ? 'three' : r < 0.6 ? 'mid' : 'drive';
    }
    return r < 0.25 ? 'three' : r < 0.55 ? 'mid' : 'drive';
  }

  function judgeShot(offSide, defSide, scorer, defender, q, timeLeft, isCritical) {
    const a = scorer.attrs;
    const d = defender.attrs;
    const type = shotTypeFor(scorer);
    let base = 0, dist = 0;
    let pts = 0;
    if (type === 'three') {
      base = 0.36; pts = 3; dist = 24;
      base += (a.threePT - 75) * 0.002;
    } else if (type === 'mid') {
      base = 0.43; pts = 2; dist = 16;
      base += (a.MID - 72) * 0.0018;
    } else {
      base = 0.5; pts = 2; dist = 8;
      base += (a.FIN - 72) * 0.0018 + a.ATH * 0.0005;
    }
    // 防守影响
    const defP = type === 'three' ? d.PDEF : d.IDEF;
    base -= (defP - 55) * 0.0018;
    // 主客场
    base += (offSide === home ? 0.015 : -0.015);
    // 季后赛更紧张
    if (isPlayoff) base -= 0.02;
    // 关键球加成（CLU）
    if (isCritical) {
      base = base * (0.9 + a.CLU * 0.002);
    }
    base = clamp(base, 0.12, 0.6);
    const made = rng() < base;
    if (made) {
      // 助攻：从除出手者外的场上球员中按传球能力加权选（含玩家，可拿到助攻）
      const assist = rng() < 0.55 ? pickAssist(offSide, scorer) : null;
      addTo(scorer, 'pts', pts);
      addTo(scorer, 'min', 1);
      if (assist) { addTo(assist, 'ast', 1); }
      let t = '';
      if (type === 'three') t = `${scorer.name} 三分出手，${made ? '空心入网！' : '打铁！'}`;
      else if (type === 'mid') t = `${scorer.name} 中距离，${made ? '命中！' : '偏出！'}`;
      else t = `${scorer.name} 冲击内线，${made ? (a.DNK > 70 ? '隔人暴扣！' : '上篮得手！') : '没进！'}`;
      if (isCritical) t = '🔥 ' + t;
      add(`🎯 ${t}（${offSide.team.abbr} ${pts} 分）`);
      return { made, pts, type };
    } else {
      addTo(scorer, 'min', 1);
      // 篮板
      const offRebP = 0.25 + (a.REB - d.REB) * 0.004 - (isPlayoff ? 0.02 : 0);
      if (rng() < offRebP) {
        const rebounder = pickRebounder(offSide);
        addTo(rebounder, 'reb', 1);
        add(`💥 ${rebounder.name} 抢到进攻篮板！`);
        return { made: false, rebound: true, type };
      } else {
        const rebounder = pickRebounder(defSide);
        addTo(rebounder, 'reb', 1);
        if (type === 'three') add(`❌ ${scorer.name} 三分打铁，${rebounder.name} 收下篮板`);
        else add(`❌ ${scorer.name} 出手不中，${rebounder.name} 抓下防守篮板`);
        return { made: false, rebound: false, type };
      }
    }
  }

  // 罚球
  function freeThrow(offSide, scorer, times) {
    const a = scorer.attrs;
    // 用 CLU + MID 近似罚球
    const ftP = clamp(0.7 + (a.MID - 70) * 0.003 + (a.CLU - 70) * 0.002, 0.5, 0.92);
    let made = 0;
    for (let i = 0; i < times; i++) if (rng() < ftP) made++;
    addTo(scorer, 'pts', made);
    add(`🆓 ${scorer.name} 罚球 ${times} 罚${made}中`);
    return made;
  }

  // 失误/抢断
  function judgeTurnover(offSide, defSide, scorer) {
    const a = scorer.attrs;
    const stlP = clamp(0.03 + (a.HAN - 70) * -0.0012 + (defSide.roster.some(p => p.attrs.STL && p.attrs.STL > 85) ? 0.03 : 0), 0.02, 0.2);
    if (rng() < stlP) {
      const stealer = onCourt(defSide).find(p => p.attrs.STL && p.attrs.STL > 80) || onCourt(defSide)[0];
      addTo(stealer, 'stl', 1);
      add(`⚡ ${stealer.name} 抢断！${scorer.name} 失误了`);
      return { turnover: true, stealer };
    }
    return { turnover: false };
  }

  // 盖帽
  function judgeBlock(offSide, defSide, scorer) {
    const a = scorer.attrs, d = defSide.roster.filter(p => p.onCourt).reduce((m, p) => m + p.attrs.BLK, 0) / 5;
    const blkP = clamp(0.02 + (d - 70) * 0.0008 + (scorer.attrs.DNK > 90 ? 0.01 : 0), 0.01, 0.25);
    if (rng() < blkP) {
      const blocker = onCourt(defSide).find(p => p.attrs.BLK > 75) || onCourt(defSide)[0];
      addTo(blocker, 'blk', 1);
      add(`🚫 ${blocker.name} 送出一记大帽！`);
      return true;
    }
    return false;
  }

  // 犯规
  function judgeFoul(offSide, defSide, scorer, q) {
    const a = scorer.attrs;
    const foulP = clamp(0.04 + (a.ATH - 60) * 0.001 + (offSide === home ? 0.01 : 0.02), 0.03, 0.15);
    if (rng() < foulP) {
      const fouler = onCourt(defSide).find(p => !p.isMe) || onCourt(defSide)[0];
      boxOf(fouler).fouls++;
      add(`🟥 ${fouler.name} 对 ${scorer.name} 犯规`);
      if (boxOf(fouler).fouls >= 6) {
        fouler.onCourt = false;
        add(`⚠️ ${fouler.name} 六犯离场！`);
      }
      return fouler;
    }
    return null;
  }

  // 单回合
  function playPossession() {
    const offSide = poss.offense, defSide = poss.defense;
    const scorer = pickScorer(offSide, defSide, poss.q, poss.time);
    const defender = pickDefender(defSide, scorer);

    const timeLeft = poss.time;
    const isCritical = timeLeft <= 24 && Math.abs(homeScore.total - awayScore.total) <= 3;

    // 时间流逝（24秒进攻时钟）
    const consumed = Math.min(24, 4 + Math.floor(rng() * 18));
    poss.time -= consumed;

    // 失误
    const to = judgeTurnover(offSide, defSide, scorer);
    if (to.turnover) {
      swapBall();
      return;
    }

    // 犯规
    const fouler = judgeFoul(offSide, defSide, scorer, poss.q);
    if (fouler) {
      const isBonus = fouler.box.fouls >= 5; // 简化
      if (rng() < 0.6 || isBonus) {
        const times = isBonus ? 2 : (rng() < 0.3 ? 3 : 2);
        freeThrow(offSide, scorer, times);
        swapBall();
        return;
      } else {
        // 边线球，继续进攻
        if (rng() < 0.4) { swapBall(); }
        return;
      }
    }

    // 投篮
    const shot = judgeShot(offSide, defSide, scorer, defender, poss.q, poss.time, isCritical);
    if (shot.made) {
      const two = shot.pts === 2;
      if (two) {
        if (shot.type === 'drive' && rng() < 0.1) {
          addTo(scorer, 'pts', 1);
          add(`➕ ${scorer.name} 加罚命中`);
        }
      }
      swapBall();
      return;
    }
    if (shot.rebound) {
      // 二次进攻，重新来过（消耗较少时间）
      poss.time -= Math.min(14, 2 + Math.floor(rng() * 10));
      return;
    }
    swapBall();
  }

  function swapBall() {
    poss.offense = poss.offense === home ? away : home;
    poss.defense = poss.offense === home ? away : home;
  }

  function updateScores() {
    homeScore.total = home.roster.reduce((s, p) => s + p.box.pts, 0);
    awayScore.total = away.roster.reduce((s, p) => s + p.box.pts, 0);
  }

  function startQuarter(q) {
    poss.q = q;
    poss.time = QLEN * 60;
    if (q === 1) {
      home.roster.forEach(p => { p.onCourt = p.starter; });
      away.roster.forEach(p => { p.onCourt = p.starter; });
    }
  }

  function endQuarter(q) {
    homeScore.q.push(homeScore.total);
    awayScore.q.push(awayScore.total);
    updateScores();
    add(`⏱️ 第${q}节结束：${hShort} ${homeScore.total} : ${awayScore.total} ${aShort}`);
  }

  // 简化轮换：替补换首发
  function doSubstitutions(side) {
    side.roster.forEach(p => {
      if (p.starter) p.onCourt = true;
      else p.onCourt = false;
    });
  }

  // ---------- 主循环 ----------
  startQuarter(1);
  const maxQ = isPlayoff ? 4 : 4;
  let finalQuarter = maxQ;

  for (let q = 1; q <= maxQ; q++) {
    startQuarter(q);
    doSubstitutions(home); doSubstitutions(away);
    // 我的球员始终在场上（简化）
    if (me) home.roster.forEach(p => { if (p.isMe) p.onCourt = true; });
    let guard = 0;
    while (poss.time > 0 && guard < 400) {
      guard++;
      playPossession();
      if (poss.time <= 0) break;
    }
    endQuarter(q);
  }

  updateScores();

  // 加时
  let ot = 0;
  while (homeScore.total === awayScore.total && ot < 3) {
    ot++;
    startQuarter(4 + ot);
    doSubstitutions(home); doSubstitutions(away);
    if (me) home.roster.forEach(p => { if (p.isMe) p.onCourt = true; });
    let guard = 0;
    while (poss.time > 0 && guard < 100) {
      guard++;
      playPossession();
      if (poss.time <= 0) break;
    }
    updateScores();
    add(`⏱️ 加时${ot}结束：${hShort} ${homeScore.total} : ${awayScore.total} ${aShort}`);
  }
  finalQuarter = 4 + ot;

  const winner = homeScore.total > awayScore.total ? home : away;
  const loser = winner === home ? away : home;
  add(`🏁 终场：${hShort} ${homeScore.total} : ${awayScore.total} ${aShort}，${winner.team.abbr || winner.team.zh} 获胜！`);

  // box score
  const box = { home: boxScoreOf(home), away: boxScoreOf(away) };
  const meBox = home.roster.find(p => p.isMe)?.box || null;

  return {
    home: { abbr: home.team.abbr, zh: home.team.zh },
    away: { abbr: away.team.abbr, zh: away.team.zh },
    homeScore: homeScore.total,
    awayScore: awayScore.total,
    winner: winner === home ? 'home' : 'away',
    winnerName: winner.team.zh || winner.team.abbr,
    loserName: loser.team.zh || loser.team.abbr,
    quarters: [homeScore.q, awayScore.q],
    ot,
    log,
    scoreSnap,
    box,
    meBox,
    myPts: meBox ? meBox.pts : 0,
    myReb: meBox ? meBox.reb : 0,
    myAst: meBox ? meBox.ast : 0,
    myStl: meBox ? meBox.stl : 0,
    myBlk: meBox ? meBox.blk : 0,
  };
}

function emptyBox() {
  return { pts: 0, reb: 0, totalReb: 0, ast: 0, stl: 0, blk: 0, min: 0, fouls: 0 };
}

function boxScoreOf(side) {
  return {
    team: side.team,
    players: side.roster.map(p => ({
      name: p.name,
      isMe: !!p.isMe,
      pos: p.pos,
      pts: p.box.pts,
      reb: p.box.reb,
      ast: p.box.ast,
      stl: p.box.stl,
      blk: p.box.blk,
      fouls: p.box.fouls,
    })),
  };
}
