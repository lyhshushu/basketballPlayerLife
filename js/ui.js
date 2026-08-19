// ================= 篮球生涯模拟器 · UI =================
import {
  APP_TITLE, TAGLINE, MODES, POSITIONS, COUNTRIES, LEAGUES, TEAMS, NCAA_TEAMS, TITLES, UPDATES,
} from './data.js';
import * as E from './engine.js';
import { ATTR_LIST, POS_ZH, loadPool, poolTeamCount, randomTeam, drawPlayers, posPenalty, srcPosKey, calcOVR, nextUnlocked, lockAttr, reveal, createBuildState, buildProgress, rollAttrPool } from './build.js';
import { makeRoster, simulateGame, virtualPlayer, mainPos } from './simEngine.js';

const root = document.getElementById('root');

const app = {
  view: 'home',
  mode: 'standard',
  state: null,
  seed: null,
  archived: false,
  identity: {
    name: '',
    nationality: 'CN',
    position: 'sg',
    hand: '右',
    number: String(8 + Math.floor(Math.random() * 20)),
    domesticDream: '',
    foreignDream: '',
  },
  modal: null,
  archiveDetail: null,
  shareDataUrl: null,
  invite: '',
  seasonSummary: null,
  offseason: null,
  tacticsPref: 'normal',
  // 建球员
  build: null,
  // 单场模拟
  game: null,
  gameView: null,   // 'pre' | 'play' | 'result'
  gameStep: 0,
  pool: null,
  poolLoaded: false,
};

// ---------- 工具 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 根据球队所属联赛/国家取姓氏池
function surnamesFor(team) {
  const lg = LEAGUES[team.league];
  const country = lg ? COUNTRIES[lg.country] : null;
  if (country && country.surnames) {
    return country.surnames.map(s => ({ zh: s }));
  }
  return ['张', '王', '李', '刘', '陈', '杨'].map(s => ({ zh: s }));
}

// 玩家无 attrs 时的兜底（老存档）
function fallbackAttrs(ovr) {
  const o = ovr || 70;
  return {
    threePT: o - 8, MID: o - 5, FIN: o - 3, DNK: o - 6, HAN: o - 3,
    PAS: o - 4, PDEF: o - 5, IDEF: o - 5, BLK: o - 9, REB: o - 6,
    ATH: o - 3, STR: o - 4, CLU: o - 3,
  };
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// 自动关闭的居中大提示（用于夺冠/淘汰等）
function showAutoToast(msg, duration = 4000) {
  const el = document.createElement('div');
  el.className = 'auto-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, duration);
}
window.__showAutoToast = showAutoToast;

function shell(inner) {
  return `<div class="app">${inner}</div>`;
}

function topbarHTML() {
  const s = app.state;
  if (!s) return '';
  const p = s.player;
  const team = s.currentTeamId ? (TEAMS[s.currentTeamId] || NCAA_TEAMS[s.currentTeamId] || null) : null;
  const pct = Math.round(((p.overall - 40) / 59) * 100);
  const r = 20, c = 2 * Math.PI * r;
  const place = team ? esc(team.zh) : (s.stage === 'ncaa' ? 'NCAA' : '青训营');
  return `
    <div class="topbar">
      <div class="rating-ring">
        <svg viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="${r}" fill="none" stroke="#27272a" stroke-width="3.5"/>
          <circle cx="23" cy="23" r="${r}" fill="none" stroke="#10b981" stroke-width="3.5"
            stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
        </svg>
        <span class="val num">${p.overall}</span>
      </div>
      <div class="who">
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${p.age} 岁 · ${place} · ${esc(E.roleName(s.seasons[s.seasons.length - 1]?.role || 'starter'))}</div>
      </div>
      <div class="money">
        <div class="v num">${E.fmtMoney(p.marketValue)}</div>
        <div class="s">身价</div>
      </div>
    </div>`;
}

// ---------- 首页 ----------
function homeHTML() {
  const archive = E.loadArchive();
  const resume = (app.seed && E.loadState(app.seed)) || latestSave()?.state;
  const modeCards = Object.entries(MODES).map(([key, m]) => `
    <button class="mode-card ${app.mode === key ? 'active' : ''}" onclick="BL.setMode('${key}')">
      ${m.recommended ? '<span class="rec">推荐</span>' : ''}
      <div class="name">${m.label}</div>
      <div class="hint">${m.hint}</div>
    </button>`).join('');
  return shell(`
    <div class="scroll">
      <div class="home-hero">
        <div class="home-ball">🏀</div>
        <h1 class="home-title">${APP_TITLE}</h1>
        <p class="home-tagline">${TAGLINE}<br/>随机球队抽取属性建球员 · 转会、伤病、绝杀、抢七、国家队，关键比赛亲手逐回合打下来。</p>
      </div>

      <div class="label">节奏</div>
      <div class="mode-grid">${modeCards}</div>

      <div class="home-actions">
        <button class="btn btn-primary btn-lg btn-block" onclick="BL.start()">开始生涯</button>
        ${resume ? `<button class="btn btn-outline btn-block" onclick="BL.resume()">继续上一局</button>` : ''}
      </div>

      <div class="home-sub">
        <button class="btn" onclick="BL.openArchive()">历史档案${archive.length ? ` · ${archive.length}` : ''}</button>
        <button class="btn" onclick="BL.openGallery()">称号图鉴</button>
      </div>

      <div class="invite-row">
        <input id="invite-input" maxlength="40" placeholder="粘贴朋友给你的编号" value="${esc(app.invite)}" oninput="BL.setInvite(this.value)"/>
        <button class="btn btn-outline" onclick="BL.useInvite()">开局</button>
      </div>

      <div class="home-foot">
        <button onclick="BL.openUpdates()">查看本期更新说明</button><br/>
        玩法一直在更新，点击关注
      </div>
    </div>
    ${app.modal ? modalHTML() : ''}
  `);
}

function latestSave() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('bl-save:'));
    if (!keys.length) return null;
    const key = keys.sort().pop();
    return { seed: key.slice(8), state: JSON.parse(localStorage.getItem(key)) };
  } catch (e) {
    return null;
  }
}

// ---------- 建档 ----------
function identityHTML() {
  const id = app.identity;
  const country = COUNTRIES[id.nationality];
  const tierHint = {
    1: '世界强队，大赛常客',
    2: '要凭真本事去挤，有机会进',
    3: '门槛不低，全靠你扛',
  }[country.tier];
  const natGrid = Object.entries(COUNTRIES).map(([code, c]) => `
    <button class="pick ${id.nationality === code ? 'active' : ''}" onclick="BL.setNationality('${code}')">
      <span class="fl">${c.flag}</span>${c.zh}
    </button>`).join('');
  const posGrid = Object.entries(POSITIONS).map(([key, p]) => `
    <button class="pick ${id.position === key ? 'active' : ''}" onclick="BL.setPosition('${key}')">
      ${p.zh}<span class="en">${p.en}</span>
    </button>`).join('');
  const domesticTeams = Object.values(TEAMS).filter(t => t.league === country.league)
    .sort((a, b) => a.zh.localeCompare(b.zh, 'zh'));
  const foreignTeams = Object.values(TEAMS).filter(t => t.league !== country.league)
    .sort((a, b) => LEAGUES[a.league].tier - LEAGUES[b.league].tier || a.zh.localeCompare(b.zh, 'zh'));
  const domOptions = `<option value="">不选</option>` + domesticTeams.map(t =>
    `<option value="${t.id}" ${id.domesticDream === t.id ? 'selected' : ''}>${esc(t.zh)}</option>`).join('');
  const forOptions = `<option value="">不选</option>` + foreignTeams.map(t =>
    `<option value="${t.id}" ${id.foreignDream === t.id ? 'selected' : ''}>${esc(LEAGUES[t.league].zh)} · ${esc(t.zh)}</option>`).join('');
  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.backHome()">← 返回</button>
      <h2>建立档案</h2>
    </div>
    <div class="scroll">
      <div class="ident-section">
        <h3>给自己起个名字</h3>
        <input class="name-input" maxlength="12" placeholder="输入姓名" value="${esc(id.name)}" oninput="BL.setName(this.value)"/>
      </div>

      <div class="ident-section">
        <h3>你是哪国人 <span class="sub">国籍决定国家队的门槛和你能捧起哪座冠军</span></h3>
        <div class="grid-3">${natGrid}</div>
        <div class="hint-bar">${esc(country.zh)} · ${tierHint}</div>
      </div>

      <div class="ident-section">
        <h3>打哪个位置 <span class="sub">位置决定你的得分权重，也决定你拿什么奖</span></h3>
        <div class="grid-5">${posGrid}</div>
        <div class="hint-bar">${esc(POSITIONS[id.position].hint)}</div>
      </div>

      <div class="ident-section">
        <h3>惯用手</h3>
        <div class="seg">
          <button class="pick ${id.hand === '右' ? 'active' : ''}" onclick="BL.setHand('右')">右手</button>
          <button class="pick ${id.hand === '左' ? 'active' : ''}" onclick="BL.setHand('左')">左手</button>
        </div>
      </div>

      <div class="ident-section">
        <h3>球衣号码</h3>
        <div class="num-row">
          <input type="number" min="0" max="99" value="${id.number}" oninput="BL.setNumber(this.value)"/>
          <span class="muted">号球衣</span>
        </div>
      </div>

      <div class="ident-section">
        <h3>儿时主队 <span class="sub">主队不影响能力发育，但你有圆梦的机会</span></h3>
        <div class="muted-2" style="margin-bottom:6px">国内主队</div>
        <select class="team-select" onchange="BL.setDream('domestic', this.value)">${domOptions}</select>
        <div class="muted-2" style="margin:10px 0 6px">海外主队</div>
        <select class="team-select" onchange="BL.setDream('foreign', this.value)">${forOptions}</select>
      </div>

      <div style="height:14px"></div>
      <button class="btn btn-primary btn-lg btn-block" onclick="BL.confirmIdentity()">开始生涯</button>
      <div style="height:24px"></div>
    </div>
  `);
}

// ---------- 生涯 ----------
function careerHTML() {
  const s = app.state;
  let body = '';
  if (s.phase === 'summary') {
    return summaryHTML();
  }
  // 赛季进行中：逐场模拟屏幕
  if (s.season && !s.season.done) {
    return seasonHTML(s);
  }
  // 季后赛进行中
  if (s.playoffs && !s.playoffs.done) {
    return playoffsHTML(s);
  }
  // 赛季总结
  if (app.seasonSummary) {
    body = seasonSummaryHTML(app.seasonSummary);
    return shell(`
      ${topbarHTML()}
      <div class="scroll" style="padding-top:6px">
        ${body}
      </div>
      ${app.modal ? modalHTML() : ''}
    `);
  }
  if (app.receipt) {
    // 决策回执优先：显示结果，点一下继续
    body = receiptHTML(s) + (s.currentEvent ? `<div class="banner-tip" style="margin-top:8px">轻触继续</div>` : '');
  } else if (app.pendingBanner) {
    // 先展示刚结束的赛季横幅，再进入事件
    body = bannerHTML(app.lastBanner);
  } else {
    body = s.currentEvent ? eventHTML(s.currentEvent) : bannerHTML(app.lastBanner);
  }
  return shell(`
    ${topbarHTML()}
    <div class="scroll" style="padding-top:6px">
      ${body}
    </div>
    ${app.modal ? modalHTML() : ''}
  `);
}

// ---------- 逐场赛季 ----------
function seasonHTML(s) {
  const season = s.season;
  const team = TEAMS[season.teamId] || NCAA_TEAMS[season.teamId] || null;
  const lg = LEAGUES[season.leagueId] || (season.kind === 'ncaa' ? LEAGUES.ncaa : null);
  const pct = Math.round((season.played / season.totalGames) * 100);
  const myAvg = season.myStats.g > 0 ? {
    pts: (season.myStats.pts / season.myStats.g).toFixed(1),
    reb: (season.myStats.reb / season.myStats.g).toFixed(1),
    ast: (season.myStats.ast / season.myStats.g).toFixed(1),
    stl: (season.myStats.stl / season.myStats.g).toFixed(1),
    blk: (season.myStats.blk / season.myStats.g).toFixed(1),
  } : { pts: '0', reb: '0', ast: '0', stl: '0', blk: '0' };
  // 最近比赛（可点击查看双方 box）
  const recent = season.games.slice(-8).reverse().map((g, i) => `
    <button class="season-game ${g.win ? 'win' : 'lose'}" onclick="BL.viewGameBox(${season.played - i - 1})">
      <span class="sg-r">${g.home ? '主' : '客'}${g.win ? ' W' : ' L'}</span>
      <span class="sg-opp">${esc(g.opp)}</span>
      <span class="sg-score num">${g.myScore} : ${g.oppScore}</span>
      <span class="sg-me num">我 ${g.my.pts}分</span>
    </button>`).join('') || '<div class="empty">还没开打</div>';
  // 队友列表（点击查看能力值/场均）
  const mates = E.getMyRoster(s).filter(p => !p.isMe);
  const matesHTML = mates.map((p, i) => `
    <button class="mate-row" onclick="BL.viewMate(${i})">
      <span class="mt-pos">${p.pos}</span>
      <span class="mt-name">${esc(p.name)}</span>
      <span class="mt-ovr num">${p.ovr}</span>
      <span class="mt-avg num">${p.avg.pts}分 ${p.avg.reb}板</span>
    </button>`).join('');

  return shell(`
    ${topbarHTML()}
    <div class="scroll" style="padding-top:6px">
      <div class="season-top">
        <div class="season-head">
          <div class="age">${s.player.age} <small>岁</small></div>
          <div class="team">${team ? esc(team.zh) : ''}${lg ? ` · ${esc(lg.zh)}` : ''}${season.kind === 'ncaa' ? ' · 大学赛季' : ' · 常规赛'}</div>
        </div>
        <div class="season-progress"><div class="sp-bar" style="width:${pct}%"></div><span class="sp-txt">${season.played}/${season.totalGames}</span></div>
        <div class="season-record"><span class="w">${season.wins}胜</span><span class="l">${season.losses}负</span></div>
      </div>

      ${(s.pendingTrades || []).length ? `
      <div class="label" style="margin-top:12px">📢 联盟交易</div>
      <div class="trade-list">
        ${s.pendingTrades.slice(-3).map(t => `
          <div class="trade-item ${t.notable ? 'notable' : ''}">
            <span class="ti-text">${esc(t.teamA)} ↔ ${esc(t.teamB)}</span>
            <span class="ti-detail">${esc(t.fromAToB)}（${t.ovrA}）↔ ${esc(t.fromBToA)}（${t.ovrB}）${t.notable ? ' · 重磅' : ''}</span>
          </div>`).join('')}
      </div>` : ''}

      <div class="label" style="margin-top:12px">我的场均</div>
      <div class="season-avg">
        <div><div class="num">${myAvg.pts}</div><div class="lab">得分</div></div>
        <div><div class="num">${myAvg.reb}</div><div class="lab">篮板</div></div>
        <div><div class="num">${myAvg.ast}</div><div class="lab">助攻</div></div>
        <div><div class="num">${myAvg.stl}</div><div class="lab">抢断</div></div>
        <div><div class="num">${myAvg.blk}</div><div class="lab">盖帽</div></div>
      </div>

      <div class="label" style="margin-top:12px">最近比赛 <span class="muted-2">（点开看双方技术统计）</span></div>
      <div class="season-games">${recent}</div>

      <div class="label" style="margin-top:12px">队友 <span class="muted-2">（点开看能力值/场均）</span></div>
      ${matesHTML ? `<div class="mate-list">${matesHTML}</div>` : '<div class="empty">暂无队友数据</div>'}

      <div class="season-actions">
        <button class="btn btn-primary" onclick="BL.enterSeasonGame()">🎮 进入比赛</button>
        <button class="btn btn-primary" onclick="BL.simGames(1)">▶ 模拟 1 场</button>
        <button class="btn btn-primary" onclick="BL.simGames(5)">⏩ 模拟 5 场</button>
        <button class="btn btn-outline" onclick="BL.simAll()">快进整个赛季</button>
        ${season.kind === 'pro' ? `<button class="btn btn-outline" onclick="BL.requestTrade()">🔄 申请交易</button>` : ''}
      </div>
      <div style="height:24px"></div>
    </div>
    ${app.modal ? modalHTML() : ''}
  `);
}

// 单场技术统计（modal）
function gameBoxHTML(game, teamZh) {
  const rows = (box) => box.map(p => `
    <tr class="${p.isMe ? 'me' : ''}">
      <td>${p.isMe ? '⭐ ' : ''}${esc(p.name)}</td>
      <td>${p.pos}</td>
      <td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td>
    </tr>`).join('');
  return `
    <div class="modal-mask" onclick="if(event.target===this)BL.closeModal()">
      <div class="modal modal-wide">
        <div class="close-row"><button class="btn btn-ghost" onclick="BL.closeModal()">✕</button></div>
        <div class="gb-head">
          <span class="gb-team">${esc(teamZh)}</span>
          <span class="gb-score num">${game.myScore} : ${game.oppScore}</span>
          <span class="gb-team">${esc(game.opp)}</span>
          <div class="gb-result ${game.win ? 'win' : 'lose'}">${game.win ? '🏆 胜' : '💔 负'} · 第${game.g}场</div>
        </div>
        <div class="label">${esc(teamZh)} 技术统计</div>
        <table class="box-table"><thead><tr><th>球员</th><th>位</th><th>分</th><th>板</th><th>助</th><th>抢</th><th>帽</th></tr></thead><tbody>${rows(game.homeBox)}</tbody></table>
        <div class="label" style="margin-top:10px">${esc(game.opp)} 技术统计</div>
        <table class="box-table"><thead><tr><th>球员</th><th>位</th><th>分</th><th>板</th><th>助</th><th>抢</th><th>帽</th></tr></thead><tbody>${rows(game.awayBox)}</tbody></table>
      </div>
    </div>`;
}

// 队友详情（modal）
function mateDetailHTML(mate) {
  const attrHTML = ATTR_LIST.map(({ key, zh, icon }) => `
    <div class="attr-cell">
      <div class="a-icon">${icon}</div>
      <div class="a-zh">${zh}</div>
      <div class="a-val num">${mate.attrs[key] || '—'}</div>
    </div>`).join('');
  return `
    <div class="modal-mask" onclick="if(event.target===this)BL.closeModal()">
      <div class="modal modal-wide">
        <div class="close-row"><button class="btn btn-ghost" onclick="BL.closeModal()">✕</button></div>
        <div class="mate-head">
          <div class="mt-pos">${mate.pos}</div>
          <div class="mt-name">${esc(mate.name)}</div>
          <div class="mt-ovr num">OVR ${mate.ovr}</div>
          <div class="mt-starter">${mate.starter ? '首发' : '替补'}</div>
        </div>
        <div class="label" style="margin-top:12px">本季场均</div>
        <div class="season-avg">
          <div><div class="num">${mate.avg.pts}</div><div class="lab">得分</div></div>
          <div><div class="num">${mate.avg.reb}</div><div class="lab">篮板</div></div>
          <div><div class="num">${mate.avg.ast}</div><div class="lab">助攻</div></div>
          <div><div class="num">${mate.avg.stl}</div><div class="lab">抢断</div></div>
          <div><div class="num">${mate.avg.blk}</div><div class="lab">盖帽</div></div>
        </div>
        <div class="label" style="margin-top:12px">能力值</div>
        <div class="attr-grid">${attrHTML}</div>
      </div>
    </div>`;
}

// ---------- 赛季总结 ----------
function leagueAwardsHTML(list) {
  if (!list || !list.length) return '';
  return `<div class="label" style="margin-top:14px">🏆 联盟奖项</div>
    <div class="ss-awards-list">
    ${list.map(a => {
      const who = a.winner
        ? `<div class="al-winner ${a.winner.isMe ? 'me' : ''}">${a.winner.isMe ? '⭐ ' : ''}${esc(a.winner.name)} <span class="al-stat">OVR ${a.winner.ovr} · ${a.winner.pts}分 ${a.winner.reb}板 ${a.winner.ast}助</span></div>`
        : (a.team ? `<div class="al-team">${a.team.map(p => `<span class="al-person ${p.isMe ? 'me' : ''}">${p.isMe ? '⭐ ' : ''}${esc(p.name)}<em>OVR ${p.ovr} · ${p.pts}/${p.reb}/${p.ast}</em></span>`).join('')}</div>` : '');
      return `<div class="al-item"><div class="al-title">${esc(a.zh)}</div>${who}</div>`;
    }).join('')}
    </div>`;
}

function seasonSummaryHTML(sum) {
  const team = TEAMS[sum.teamId] || NCAA_TEAMS[sum.teamId] || null;
  const lg = LEAGUES[sum.leagueId];
  const awardChips = (sum.awards || []).map(a => `<span class="chip chip-green">🏅 ${E.awardZh(a)}</span>`).join('') || '<span class="muted-2">本赛季没有个人奖项</span>';
  const nbaJump = sum.nbaJump;
  return `
    <div class="season-summary">
      <div class="ss-head">
        <div class="age">${sum.age} <small>岁</small></div>
        <div class="team">${team ? esc(team.zh) : ''}${lg ? ` · ${esc(lg.zh)}` : ''}${sum.kind === 'ncaa' ? ' · 大学赛季' : ''}</div>
      </div>
      <div class="ss-result">
        <div class="ss-rec num">${sum.record}</div>
        <div class="ss-zh">${esc(sum.resultZh)}</div>
      </div>
      <div class="label" style="margin-top:12px">赛季场均</div>
      <div class="season-avg">
        <div><div class="num">${sum.stats ? E.fmtAvg(sum.stats.pts) : '0'}</div><div class="lab">得分</div></div>
        <div><div class="num">${sum.stats ? E.fmtAvg(sum.stats.reb) : '0'}</div><div class="lab">篮板</div></div>
        <div><div class="num">${sum.stats ? E.fmtAvg(sum.stats.ast) : '0'}</div><div class="lab">助攻</div></div>
        <div><div class="num">${sum.stats ? E.fmtAvg(sum.stats.stl) : '0'}</div><div class="lab">抢断</div></div>
        <div><div class="num">${sum.stats ? E.fmtAvg(sum.stats.blk) : '0'}</div><div class="lab">盖帽</div></div>
      </div>
      <div class="label" style="margin-top:12px">个人奖项</div>
      <div class="ss-awards">${awardChips}</div>
      ${sum.highlight ? `<div class="ss-highlight">🔥 ${esc(sum.highlight)}</div>` : ''}
      ${sum.growthPoints ? `<div class="ss-growth">📈 本季成长点数 <b>+${sum.growthPoints}</b>（累计 ${sum.growthBank || 0}）</div>` : ''}
      ${sum.growthLog ? (() => {
        const g = sum.growthLog;
        const lines = [];
        if (g.gains && g.gains.length) lines.push(...g.gains.map(x => `<span class="chip chip-green">▲ ${x}</span>`));
        if (g.losses && g.losses.length) lines.push(...g.losses.map(x => `<span class="chip chip-red">▼ ${x}</span>`));
        return `<div class="ss-growth">能力变化：${lines.join(' ') || '—'}</div>`;
      })() : ''}
      ${sum.salary ? `<div class="ss-growth">💰 本季年薪 <b>${E.fmtMoney(sum.salary)}</b>${sum.contractLeft ? ` · 合同剩 ${sum.contractLeft} 年` : ''}</div>` : ''}
      ${leagueAwardsHTML(sum.leagueAwards)}
      <div style="height:14px"></div>
      ${nbaJump && nbaJump.available ? `<button class="btn btn-amber btn-lg btn-block" style="margin-bottom:8px" onclick="BL.tryNBAJump()">🚀 冲击 NBA（成功率约 ${nbaJump.pct}%）</button>` : ''}
      ${sum.growthPoints ? `<button class="btn btn-primary btn-lg btn-block" style="margin-bottom:8px" onclick="BL.openUpgrade()">📈 升级属性（${sum.growthBank || 0} 点）</button>` : ''}
      <button class="btn btn-outline btn-lg btn-block" onclick="BL.dismissSeasonSummary()">继续 →</button>
      <div style="height:24px"></div>
    </div>
  `;
}

// ---------- 属性升级 ----------
function upgradeHTML() {
  const s = app.state;
  if (!s) return '';
  const points = s.player.growthBank || 0;
  // 确保 attrs 存在
  const attrs = s.player.attrs || fallbackAttrs(s.player.overall);
  const rows = ATTR_LIST.map(({ key, zh, icon }) => {
    const val = attrs[key] || 60;
    return `<div class="upgrade-row">
      <span class="up-icon">${icon}</span>
      <span class="up-name">${zh}</span>
      <span class="up-val num">${val}</span>
      <button class="btn btn-primary btn-sm" onclick="BL.upgradeAttr('${key}')">+</button>
    </div>`;
  }).join('');
  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.closeUpgrade()">← 返回</button>
      <h2>成长升级</h2>
      <span class="count">${points} 点</span>
    </div>
    <div class="scroll">
      <div class="upgrade-hint">每赛季获得的成长点数可分配给你的属性，属性影响比赛表现。</div>
      <div class="upgrade-list">${rows}</div>
      <div style="height:14px"></div>
      <button class="btn btn-primary btn-lg btn-block" onclick="BL.closeUpgrade()">完成升级 →</button>
      <div style="height:24px"></div>
    </div>
  `);
}

// ---------- 季后赛 ----------
function confRankOf(standings, teamId) {
  // 返回球队在其分区的排名（1-based），找不到返回 null
  if (!standings) return null;
  const list = standings.E || standings.single;
  let confName = '东部';
  if (list && list.some(t => t.id === teamId)) {
    const idx = list.findIndex(t => t.id === teamId);
    return { conf: confName, rank: idx + 1 };
  }
  if (standings.W && standings.W.some(t => t.id === teamId)) {
    const idx = standings.W.findIndex(t => t.id === teamId);
    return { conf: '西部', rank: idx + 1 };
  }
  if (standings.single) {
    const idx = standings.single.findIndex(t => t.id === teamId);
    return { conf: '联赛', rank: idx + 1 };
  }
  return null;
}

function playoffsHTML(s) {
  const po = s.playoffs;
  const team = TEAMS[s.currentTeamId] || NCAA_TEAMS[s.currentTeamId] || null;
  const opp = TEAMS[po.currentOppId] || NCAA_TEAMS[po.currentOppId] || null;
  const roundNames = po.roundNames || ['首轮', '分区半决赛', '总决赛'];
  const inPlayIn = po.playIn && po.playInResult == null;
  const roundName = inPlayIn ? '附加赛 · 生死战' : (roundNames[po.round] || `第${po.round + 1}轮`);
  // 分区排名（比赛时展示）
  let myRankStr = '', oppRankStr = '';
  try {
    const std = E.generateStandings(s);
    const myRank = team ? confRankOf(std, team.id) : null;
    const oppRank = opp ? confRankOf(std, opp.id) : null;
    if (myRank) myRankStr = `（${myRank.conf}第${myRank.rank}）`;
    if (oppRank) oppRankStr = `（${oppRank.conf}第${oppRank.rank}）`;
  } catch (e) {}
  const recent = po.games.slice(-6).reverse().map(g => `
    <div class="season-game ${g.win ? 'win' : 'lose'}">
      <span class="sg-r">${g.home ? '主' : '客'}${g.win ? ' W' : ' L'}</span>
      <span class="sg-opp">${esc(g.opp)}</span>
      <span class="sg-score num">${g.myScore} : ${g.oppScore}</span>
      <span class="sg-me num">我 ${g.my.pts}分</span>
    </div>`).join('') || '<div class="empty">系列赛还没开打</div>';

  // 东西部/联盟排行
  let standingsHTML = '';
  try {
    const st = E.generateStandings(s);
    if (st) {
      const renderConf = (title, teams) => teams ? `
        <div class="std-conf">
          <div class="std-title">${title}</div>
          ${teams.map(t => `
            <div class="std-row ${t.isMe ? 'me' : ''}">
              <span class="std-rank">${t.isMe ? '⭐' : ''}</span>
              <span class="std-name">${esc(t.zh)}</span>
              <span class="std-rec num">${t.wins}-${t.losses}</span>
            </div>`).join('')}
        </div>` : '';
      if (st.E && st.W) {
        standingsHTML = `<div class="std-grid">${renderConf('东部', st.E)}${renderConf('西部', st.W)}</div>`;
      } else if (st.single) {
        standingsHTML = `<div class="std-grid">${renderConf('联赛', st.single)}</div>`;
      }
    }
  } catch (e) {}

  return shell(`
    ${topbarHTML()}
    <div class="scroll" style="padding-top:6px">
      <div class="playoffs-top">
        <div class="po-title">🏆 季后赛 · ${roundName}</div>
        <div class="po-series">
          <div class="po-team"><span class="po-rank">${esc(myRankStr)}</span>${esc(team ? team.zh : '')}</div>
          <div class="po-score num">${po.myWins} : ${po.oppWins}</div>
          <div class="po-team">${esc(opp ? opp.zh : '对手')}<span class="po-rank">${esc(oppRankStr)}</span></div>
        </div>
        <div class="po-best">BO7 · 先赢 4 场晋级</div>
      </div>

      ${po.isNba && po.rounds && po.rounds.length ? `
      <div class="label" style="margin-top:12px">🗺️ 季后赛对阵图</div>
      <div class="bracket">
        ${po.roundNames.map((rn, i) => {
          const oppTeam = TEAMS[po.rounds[i]] || null;
          const isCur = i === po.round;
          const done = i < po.round;
          const champ = po.done && po.champion && i === po.roundNames.length - 1;
          return `<div class="bracket-round ${isCur ? 'cur' : done ? 'done' : ''}">
            <div class="br-name">${rn}${champ ? ' 🏆' : ''}</div>
            <div class="br-game">
              <div class="br-team ${true ? 'win' : ''}">${esc(team ? team.zh : '')}</div>
              <div class="br-vs">VS</div>
              <div class="br-team">${oppTeam ? esc(oppTeam.zh) : '对手'}</div>
            </div>
          </div>`;
        }).join('<div class="br-arrow">→</div>')}
      </div>` : ''}

      ${po.isNba && standingsHTML ? `<div class="label" style="margin-top:12px">东西部排名</div>${standingsHTML}` : ''}

      <div class="label" style="margin-top:12px">系列赛比分</div>
      <div class="season-games">${recent}</div>

      <div class="season-actions">
        ${E.isPlayoffKeyGame(s) ? `
          <div class="key-game-banner">🔥 关键场次 · 必须亲自登场</div>
          <button class="btn btn-primary btn-block" onclick="BL.enterPlayoffGame()">🎮 进入这场比赛</button>
        ` : `
          <button class="btn btn-primary" onclick="BL.simPlayoff(1)">▶ 模拟 1 场</button>
          <button class="btn btn-primary" onclick="BL.simPlayoff(3)">⏩ 模拟 3 场</button>
          <button class="btn btn-outline" onclick="BL.simPlayoffAll()">快进本轮</button>
        `}
      </div>
      <div style="height:24px"></div>
    </div>
    ${app.modal ? modalHTML() : ''}
  `);
}

function bannerHTML(snapshot) {
  if (!snapshot) return `<div class="empty" onclick="BL.next()" style="cursor:pointer">轻触继续</div>`;
  const team = snapshot.teamId ? (TEAMS[snapshot.teamId] || NCAA_TEAMS[snapshot.teamId] || null) : null;
  const lg = snapshot.leagueId ? LEAGUES[snapshot.leagueId] : null;
  const st = snapshot.stats || {};
  const avg = st.avg || {};
  const resultKey = snapshot.result.league;
  const resultText = E.resultZh(resultKey, lg);
  const nat = snapshot.national;
  const natText = nat ? nationalBannerText(nat) : null;
  return `
    <div class="banner" onclick="BL.next()" style="cursor:pointer">
      <div class="banner-head">
        <div class="age">${snapshot.age} <small>岁</small></div>
        <div class="team">${snapshot.youth ? '青训营' : team ? esc(team.zh) : ''}${lg ? ` · ${esc(lg.zh)}` : ''}${snapshot.ncaaYear ? ` · 大${['零','一','二','三','四','五'][snapshot.ncaaYear] || snapshot.ncaaYear}` : ''}</div>
      </div>
      <div class="banner-body">
        <div class="banner-row">
          <span class="k">能力</span>
          <span class="v num">${snapshot.overall} ${snapshot.suspended ? '<span class="txt-red">· 禁赛</span>' : ''}</span>
        </div>
        <div class="banner-row">
          <span class="k">角色</span>
          <span class="v">${snapshot.suspended ? '停赛' : E.roleName(snapshot.role)}</span>
        </div>
        ${snapshot.youth ? '' : `<div class="banner-row">
          <span class="k">赛季战绩</span>
          <span class="v ${resultKey === 'champion' ? 'hl' : ''}">${resultText}</span>
        </div>`}
        ${snapshot.cup ? `<div class="banner-row">
          <span class="k">杯赛</span>
          <span class="v ${snapshot.cup === 'cup_champion' ? 'hl' : ''}">${snapshot.cup === 'cup_champion' ? '冠军 🏆' : '决赛'}</span>
        </div>` : ''}
        ${natText ? `<div class="banner-row"><span class="k">国家队</span><span class="v">${natText}</span></div>` : ''}
        ${snapshot.trophies.length ? `<div class="banner-row"><span class="k">新奖杯</span><span class="v hl">${snapshot.trophies.map(E.trophyZh).join(' · ')}</span></div>` : ''}
        ${snapshot.awards.length ? `<div class="banner-row"><span class="k">个人荣誉</span><span class="v pos">${snapshot.awards.map(E.awardZh).join(' · ')}</span></div>` : ''}
        ${snapshot.highlight ? `<div class="banner-row"><span class="k">本赛季高光</span><span class="v hl">${esc(snapshot.highlight)}</span></div>` : ''}
        ${snapshot.youth || snapshot.ncaaYear ? '' : `<div class="banner-row">
          <span class="k">年薪</span>
          <span class="v num">${E.fmtMoney(snapshot.salary)}</span>
        </div>`}
      </div>
      ${snapshot.youth ? '' : `
      <div class="banner-stats" style="padding:10px 14px 12px">
        <div><div class="num">${st.g}</div><div class="lab">出场</div></div>
        <div><div class="num">${E.fmtAvg(avg.pts)}</div><div class="lab">得分</div></div>
        <div><div class="num">${E.fmtAvg(avg.reb)}</div><div class="lab">篮板</div></div>
        <div><div class="num">${E.fmtAvg(avg.ast)}</div><div class="lab">助攻</div></div>
        <div><div class="num">${st.pts ? Math.round(st.pts) : 0}</div><div class="lab">总得分</div></div>
      </div>`}
    </div>
    <div class="banner-tip">轻触继续</div>
    ${app.state && app.state.pendingGame && app.state.pendingGame.type === 'playoff_key' ? `
    <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="event.stopPropagation();BL.enterGame()">🎮 模拟${app.state.pendingGame.stage === 'final' ? '总决赛' : '半决赛'}关键战</button>
    <div class="banner-tip" style="margin-top:6px">也可以轻触赛季卡继续，跳过这场比赛</div>` : ''}`;
}

function nationalBannerText(nat) {
  const zh = E.tournamentZh(nat.type);
  if (nat.result === 'not_called') return `${zh} · 未入选`;
  if (nat.result === 'not_qualified') return `${zh} · 未出线`;
  const stats = nat.stats;
  const statStr = stats ? ` · ${stats.g} 场 ${Math.round(stats.pts)} 分` : '';
  return `${zh} · ${E.resultZh(nat.result, null, 'national')}${statStr}`;
}

function eventHTML(ev) {
  const isShowdown = ev.type === 'showdown';
  const tag = isShowdown ? '决胜时刻' : ev.type === 'farewell_offer' || ev.type === 'voluntary_retire' || ev.type === 'farewell_style' ? '谢幕' : '决策';
  const canSim = isShowdown && app.state && app.state.pendingGame;
  return `
    <div class="event-card">
      <span class="event-tag">${tag}</span>
      <h2 class="event-title">${esc(ev.title)}</h2>
      <p class="event-text">${esc(ev.text)}</p>
      ${canSim ? `<button class="btn btn-primary btn-block sim-entry" onclick="BL.enterGame()">🎮 进入比赛模拟</button>` : ''}
      <div class="option-list">
        ${ev.options.map(o => `
          <button class="option" onclick="BL.choose('${o.id.replace(/'/g, '')}')">
            <div class="o-label">${esc(o.label)}</div>
            ${o.hint ? `<div class="o-hint">${esc(o.hint)}</div>` : ''}
          </button>`).join('')}
      </div>
    </div>`;
}

function receiptHTML(s) {
  const r = s.lastEventOutcome;
  const kind = r ? r.kind : 'neutral';
  const cls = kind === 'positive' ? '' : kind === 'negative' ? ' neg' : '';
  const title = kind === 'positive' ? '成了' : kind === 'negative' ? '砸了' : '回执';
  const text = r ? r.text : '你做了一个决定。';
  return `
    <div class="receipt${cls}" onclick="BL.next()" style="cursor:pointer">
      <div class="r-title">${title}</div>
      <div class="r-text">${esc(text)}</div>
    </div>`;
}

// ---------- 结算 ----------
function summaryHTML() {
  const s = app.state;
  const sum = E.buildSummary(s);
  if (!app.archived) {
    E.saveArchive(sum);
    app.archived = true;
  }
  const t = sum.totals;
  const nat = sum.national;
  const trophyCounts = E.trophyCounts(s.totals.trophies);
  const trophyEntries = Object.entries(trophyCounts).slice(0, 10);
  const titleChips = sum.titles.map(x => `<span class="sum-title">${TITLES.find(t => t.id === x.id)?.art || '🏅'} ${esc(TITLES.find(t => t.id === x.id)?.name || '')}</span>`).join('');
  return shell(`
    <div class="scroll summary-scroll">
      <div class="sum-hero">
        <div class="sum-hero-top">
          <div class="rating-ring" style="width:58px;height:58px">
            <svg viewBox="0 0 46 46">
              <circle cx="23" cy="23" r="20" fill="none" stroke="#27272a" stroke-width="3.5"/>
              <circle cx="23" cy="23" r="20" fill="none" stroke="#fbbf24" stroke-width="3.5"
                stroke-linecap="round" stroke-dasharray="125.66" stroke-dashoffset="${125.66 * (1 - sum.maxOverall / 99)}"/>
            </svg>
            <span class="val" style="font-size:16px">${sum.maxOverall}</span>
          </div>
          <div>
            <div class="name">${esc(sum.player.name)}</div>
            <div class="tags">
              <span class="chip chip-zinc">${esc(sum.player.nationality)}</span>
              <span class="chip chip-green">#${sum.player.number} ${esc(sum.player.positionEn)} ${esc(sum.player.position)}</span>
              <span class="chip chip-zinc">${esc(sum.player.hand)}手</span>
              ${sum.draft ? (sum.draft.undrafted
                ? `<span class="chip chip-red">选秀落选</span>`
                : `<span class="chip chip-amber">第${sum.draft.round}轮 · 第${sum.draft.pick}顺位${sum.draft.team ? ' · ' + esc(sum.draft.team) : ''}</span>`) : ''}
              ${sum.ncaaSeasons ? `<span class="chip chip-blue">NCAA ${sum.ncaaSeasons} 季</span>` : ''}
            </div>
          </div>
          <div class="sum-value">
            <div class="k">巅峰身价</div>
            <div class="v num">${E.fmtMoney(sum.peakValue)}</div>
            <div class="k" style="margin-top:8px">生涯总收入</div>
            <div class="v sub num">${E.fmtMoney(sum.totalIncome)}</div>
          </div>
        </div>
        <div class="sum-ending">
          <div class="k">生涯结局</div>
          <div class="t">${esc(sum.titles[0] ? TITLES.find(x => x.id === sum.titles[0].id)?.name || '传奇' : '完整的一生')}</div>
          <div class="p">超过了 ${sum.percentile}% 的球员</div>
          <div class="e">${esc(sum.epitaph)}</div>
        </div>
      </div>

      <div class="sum-block">
        <div class="sum-stats">
          <div><div class="k">出场</div><div class="v num">${E.fmtInt(t.apps)}</div></div>
          <div><div class="k">总得分</div><div class="v num">${E.fmtInt(t.pts)}</div></div>
          <div><div class="k">总篮板</div><div class="v num">${E.fmtInt(t.reb)}</div></div>
          <div><div class="k">总助攻</div><div class="v num">${E.fmtInt(t.ast)}</div></div>
          <div><div class="k">抢断</div><div class="v num">${E.fmtInt(t.stl)}</div></div>
          <div><div class="k">盖帽</div><div class="v num">${E.fmtInt(t.blk)}</div></div>
        </div>
      </div>

      ${nat ? `
      <div class="sum-block">
        <h4>国家队</h4>
        <div class="card" style="padding:12px;text-align:center">
          <div class="muted-2" style="font-weight:800">${esc(sum.player.nationality)} · 大赛 ${nat.games} 场 · ${nat.pts} 分 · ${nat.reb} 板 · ${nat.ast} 助 · 冠军 ${nat.golds} 次</div>
        </div>
      </div>` : ''}

      ${sum.highlights?.length ? `
      <div class="sum-block">
        <h4>生涯高光</h4>
        <div class="card" style="padding:14px">
          ${sum.highlights.map(h => `<div class="sum-legacy" style="margin-top:6px">· ${h.age}岁 ${esc(h.text)}</div>`).join('')}
        </div>
      </div>` : ''}

      ${sum.keyGames?.length ? `
      <div class="sum-block">
        <h4>关键之战</h4>
        <div class="card" style="padding:14px">
          ${sum.keyGames.map(g => `<div class="sum-legacy" style="margin-top:6px">· ${g.age}岁 ${esc(g.label)} ${g.won ? '🏆 胜' : '💔 负'} ${g.score} vs ${esc(g.opp)}（我 ${g.myPts}分 ${g.myReb}板 ${g.myAst}助）</div>`).join('')}
        </div>
      </div>` : ''}

      ${sum.rival ? `
      <div class="sum-block">
        <h4>一生之敌</h4>
        <div class="card" style="padding:14px">
          <div style="text-align:center;font-weight:900;font-size:15px">${esc(sum.rival.name)} <span class="muted-2" style="font-weight:700">· ${esc(sum.rival.nationality)} · 巅峰 ${sum.rival.peak}</span></div>
          <div style="margin-top:10px">
            <div class="banner-row"><span class="k">交手赛季</span><span class="v num">${sum.rival.series}</span></div>
            <div class="banner-row"><span class="k">总得分</span><span class="v num">你 ${E.fmtInt(sum.rival.myPts)} : ${E.fmtInt(sum.rival.rivalPts)} 他</span></div>
            <div class="banner-row"><span class="k">联赛冠军</span><span class="v num">你 ${sum.rival.myChamps} : ${sum.rival.rivalChamps} 他</span></div>
            <div class="banner-row"><span class="k">常规赛MVP</span><span class="v num">你 ${sum.rival.myMvp} : ${sum.rival.rivalMvp} 他</span></div>
          </div>
          <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--amber);font-weight:800">
            ${sum.rival.myPts >= sum.rival.rivalPts ? `总得分，你赢了。` : `总得分，他赢了。`}
            ${sum.rival.myChamps > sum.rival.rivalChamps ? '冠军数，你也赢了。' : sum.rival.myChamps === sum.rival.rivalChamps ? '冠军数，打了个平手。' : '冠军数，他赢了。'}
          </div>
        </div>
      </div>` : ''}

      <div class="sum-block">
        <h4>荣誉室</h4>
        <div class="card" style="padding:12px 8px">
          ${trophyEntries.length ? `
          <div class="sum-trophies">
            ${trophyEntries.map(([id, n]) => {
              const meta = trophyMeta(id);
              return `<div class="trophy-item"><div class="art">${meta.art}</div><div class="name">${meta.name}</div>${n > 1 ? `<div class="count">×${n}</div>` : ''}</div>`;
            }).join('')}
          </div>` : `<div class="muted" style="text-align:center;padding:14px">还没有奖杯</div>`}
        </div>
      </div>

      ${sum.titles.length ? `
      <div class="sum-block">
        <h4>称号</h4>
        <div class="sum-titles">${titleChips}</div>
      </div>` : ''}

      ${sum.legacyLines.length ? `
      <div class="sum-block">
        <h4>那些时刻</h4>
        <div class="card" style="padding:14px">
          ${sum.legacyLines.map(l => `<div class="sum-legacy" style="margin-top:6px">· ${esc(l)}</div>`).join('')}
        </div>
      </div>` : ''}

      <div class="sum-block">
        <h4>效力过的球队</h4>
        ${sum.clubs.map(c => `
          <div class="sum-club">
            <div class="crest" style="background:${c.color};color:${c.isLight ? '#09090b' : '#fff'}">${esc(c.abbr)}</div>
            <div class="info">
              <div class="n">${esc(c.name)}</div>
              <div class="s">${c.seasons} 个赛季 · ${c.games} 场 · ${c.trophies.length ? c.trophies.length + ' 座奖杯' : '无冠'}</div>
            </div>
            <div class="stat"><b class="num">${c.pts}</b>分</div>
          </div>`).join('')}
      </div>

      <div class="sum-foot">
        ${APP_TITLE} · ${sum.seasonsCount} 个赛季<br/>
        本局编号 <span class="code" onclick="BL.copyCode()" style="cursor:pointer">${esc(sum.seed)}</span> · 点一下复制<br/>
        长按上方图片保存，或直接发给朋友
      </div>
    </div>
    <div class="bottom-actions">
      <div class="row2">
        <button class="btn btn-outline" onclick="BL.replay()">再来一局</button>
        <button class="btn btn-primary" onclick="BL.openShare()">分享战绩卡</button>
      </div>
      <button class="btn btn-ghost" onclick="BL.openArchive()">返回历史档案</button>
    </div>
    ${app.modal ? modalHTML() : ''}
  `);
}

function trophyMeta(id) {
  if (id === 'world_cup') return { art: '🏆', name: '世界杯' };
  if (id === 'olympics') return { art: '🥇', name: '奥运会' };
  if (id === 'continental') return { art: '🌍', name: '洲际冠军' };
  if (id.startsWith('league:')) return { art: '🏀', name: LEAGUES[id.slice(7)]?.champ?.replace('总冠军', '总冠军') || '联赛冠军' };
  if (id.startsWith('cup:')) return { art: '🏅', name: LEAGUES[id.slice(4)]?.cupName || '杯赛冠军' };
  return { art: '🏅', name: '冠军' };
}

// ---------- 档案 / 图鉴 ----------
function archiveHTML() {
  const list = E.loadArchive();
  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.backHome()">← 返回</button>
      <h2>历史档案</h2>
      <span class="count">${list.length}</span>
    </div>
    <div class="scroll">
      ${list.length ? list.map(a => {
        const t = a.totals;
        const titles = (a.titles || []).map(x => TITLES.find(t2 => t2.id === x.id)).filter(Boolean);
        return `
        <button class="archive-item" onclick="BL.viewArchive(${list.indexOf(a)})">
          <div class="row1">
            <span class="n">${esc(a.player.name)} <span class="muted" style="font-weight:600">${esc(a.player.positionEn)} · ${esc(a.player.nationality)}</span></span>
            <span class="peak num">巅峰 ${a.maxOverall}</span>
          </div>
          <div class="row2">
            <span class="chip chip-zinc">${a.seasonsCount} 季</span>
            <span class="chip chip-zinc num">${E.fmtInt(t.pts)} 分</span>
            <span class="chip chip-amber num">${E.fmtMoney(a.totalIncome)}</span>
            ${titles.slice(0, 2).map(x => `<span class="chip chip-green">${x.art} ${x.name}</span>`).join('')}
          </div>
          <div class="when">${timeAgo(a.savedAt)} · ${esc(a.seed)}</div>
        </button>`;
      }).join('') : `<div class="empty">还没有踢完的生涯<br/>去开启第一局吧</div>`}
    </div>
  `);
}

function archiveDetailHTML() {
  const a = app.archiveDetail;
  if (!a) return archiveHTML();
  const t = a.totals;
  const nat = a.national;
  const trophyCounts = {};
  const allTrophies = a.clubs.flatMap(c => c.trophies || []);
  allTrophies.forEach(id => trophyCounts[id] = (trophyCounts[id] || 0) + 1);
  const trophies = Object.entries(trophyCounts).slice(0, 10);
  const titles = (a.titles || []).map(x => TITLES.find(t2 => t2.id === x.id)).filter(Boolean);
  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.backArchive()">← 返回</button>
      <h2>档案详情</h2>
    </div>
    <div class="scroll summary-scroll">
      <div class="sum-hero">
        <div class="sum-hero-top">
          <div class="rating-ring" style="width:58px;height:58px">
            <svg viewBox="0 0 46 46">
              <circle cx="23" cy="23" r="20" fill="none" stroke="#27272a" stroke-width="3.5"/>
              <circle cx="23" cy="23" r="20" fill="none" stroke="#fbbf24" stroke-width="3.5"
                stroke-linecap="round" stroke-dasharray="125.66" stroke-dashoffset="${125.66 * (1 - a.maxOverall / 99)}"/>
            </svg>
            <span class="val" style="font-size:16px">${a.maxOverall}</span>
          </div>
          <div>
            <div class="name">${esc(a.player.name)}</div>
            <div class="tags">
              <span class="chip chip-zinc">${esc(a.player.nationality)}</span>
              <span class="chip chip-green">#${a.player.number} ${esc(a.player.positionEn)} ${esc(a.player.position)}</span>
            </div>
          </div>
          <div class="sum-value">
            <div class="k">巅峰身价</div>
            <div class="v num">${E.fmtMoney(a.peakValue)}</div>
            <div class="k" style="margin-top:8px">总收入</div>
            <div class="v sub num">${E.fmtMoney(a.totalIncome)}</div>
          </div>
        </div>
        <div class="sum-ending">
          <div class="k">生涯结局</div>
          <div class="t">${esc(titles[0]?.name || '完整的一生')}</div>
          <div class="p">超过了 ${a.percentile}% 的球员</div>
          <div class="e">${esc(a.epitaph)}</div>
        </div>
      </div>
      <div class="sum-block">
        <div class="sum-stats">
          <div><div class="k">出场</div><div class="v num">${E.fmtInt(t.apps)}</div></div>
          <div><div class="k">总得分</div><div class="v num">${E.fmtInt(t.pts)}</div></div>
          <div><div class="k">总篮板</div><div class="v num">${E.fmtInt(t.reb)}</div></div>
          <div><div class="k">总助攻</div><div class="v num">${E.fmtInt(t.ast)}</div></div>
          <div><div class="k">抢断</div><div class="v num">${E.fmtInt(t.stl)}</div></div>
          <div><div class="k">盖帽</div><div class="v num">${E.fmtInt(t.blk)}</div></div>
        </div>
      </div>
      ${nat ? `<div class="sum-block"><h4>国家队</h4><div class="card" style="padding:12px;text-align:center"><div class="muted-2" style="font-weight:800">${esc(a.player.nationality)} · 大赛 ${nat.games} 场 · ${nat.pts} 分 · 冠军 ${nat.golds} 次</div></div></div>` : ''}
      ${a.highlights?.length ? `
      <div class="sum-block">
        <h4>生涯高光</h4>
        <div class="card" style="padding:14px">
          ${a.highlights.map(h => `<div class="sum-legacy" style="margin-top:6px">· ${h.age}岁 ${esc(h.text)}</div>`).join('')}
        </div>
      </div>` : ''}
      ${a.keyGames?.length ? `
      <div class="sum-block">
        <h4>关键之战</h4>
        <div class="card" style="padding:14px">
          ${a.keyGames.map(g => `<div class="sum-legacy" style="margin-top:6px">· ${g.age}岁 ${esc(g.label)} ${g.won ? '🏆 胜' : '💔 负'} ${g.score} vs ${esc(g.opp)}（我 ${g.myPts}分 ${g.myReb}板 ${g.myAst}助）</div>`).join('')}
        </div>
      </div>` : ''}
      ${a.rival ? `
      <div class="sum-block">
        <h4>一生之敌</h4>
        <div class="card" style="padding:14px">
          <div style="text-align:center;font-weight:900;font-size:15px">${esc(a.rival.name)} <span class="muted-2" style="font-weight:700">· ${esc(a.rival.nationality)} · 巅峰 ${a.rival.peak}</span></div>
          <div style="margin-top:10px">
            <div class="banner-row"><span class="k">交手赛季</span><span class="v num">${a.rival.series}</span></div>
            <div class="banner-row"><span class="k">总得分</span><span class="v num">你 ${E.fmtInt(a.rival.myPts)} : ${E.fmtInt(a.rival.rivalPts)} 他</span></div>
            <div class="banner-row"><span class="k">联赛冠军</span><span class="v num">你 ${a.rival.myChamps} : ${a.rival.rivalChamps} 他</span></div>
            <div class="banner-row"><span class="k">常规赛MVP</span><span class="v num">你 ${a.rival.myMvp} : ${a.rival.rivalMvp} 他</span></div>
          </div>
          <div style="margin-top:10px;text-align:center;font-size:12px;color:var(--amber);font-weight:800">
            ${a.rival.myPts >= a.rival.rivalPts ? `总得分，你赢了。` : `总得分，他赢了。`}
            ${a.rival.myChamps > a.rival.rivalChamps ? '冠军数，你也赢了。' : a.rival.myChamps === a.rival.rivalChamps ? '冠军数，打了个平手。' : '冠军数，他赢了。'}
          </div>
        </div>
      </div>` : ''}
      <div class="sum-block">
        <h4>荣誉室</h4>
        <div class="card" style="padding:12px 8px">
          ${trophies.length ? `<div class="sum-trophies">${trophies.map(([id, n]) => {
            const meta = trophyMeta(id);
            return `<div class="trophy-item"><div class="art">${meta.art}</div><div class="name">${meta.name}</div>${n > 1 ? `<div class="count">×${n}</div>` : ''}</div>`;
          }).join('')}</div>` : `<div class="muted" style="text-align:center;padding:14px">还没有奖杯</div>`}
        </div>
      </div>
      ${titles.length ? `<div class="sum-block"><h4>称号</h4><div class="sum-titles">${titles.map(x => `<span class="sum-title">${x.art} ${esc(x.name)}</span>`).join('')}</div></div>` : ''}
      <div class="sum-block">
        <h4>效力过的球队</h4>
        ${a.clubs.map(c => `
          <div class="sum-club">
            <div class="crest" style="background:${c.color};color:${c.isLight ? '#09090b' : '#fff'}">${esc(c.abbr)}</div>
            <div class="info"><div class="n">${esc(c.name)}</div><div class="s">${c.seasons} 个赛季 · ${c.games} 场 · ${c.trophies?.length || 0} 座奖杯</div></div>
            <div class="stat"><b class="num">${c.pts}</b>分</div>
          </div>`).join('')}
      </div>
      <div class="sum-foot">${APP_TITLE} · ${a.seasonsCount} 个赛季<br/>本局编号 ${esc(a.seed)}</div>
    </div>
  `);
}

function galleryHTML() {
  const g = E.galleryState();
  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.backHome()">← 返回</button>
      <h2>称号图鉴</h2>
      <span class="count">${g.unlocked.size}/${g.total}</span>
    </div>
    <div class="scroll" style="padding:0">
      <div class="gallery-grid">
        ${TITLES.map(t => {
          const q = g.unlocked.get(t.id);
          return q
            ? `<div class="gallery-cell"><div class="art">${t.art}</div><div class="name">${esc(t.name)}</div><div class="q">${esc(q)}</div></div>`
            : `<div class="gallery-cell locked"><div class="art">${t.art}</div><div class="name">${esc(t.name)}</div><div class="q">${esc(t.hint)}</div></div>`;
        }).join('')}
      </div>
    </div>
  `);
}

// ---------- 建球员（13次锁属性） ----------
function buildHTML() {
  const b = app.build;
  const id = app.identity;
  if (!b) { app.view = 'identity'; render(); return ''; }
  const done = b.step >= ATTR_LIST.length;
  const pct = buildProgress(b);
  const posZh = POS_ZH[id.position];

  if (done) {
    const rv = app.buildResult;
    const attrsHTML = ATTR_LIST.map(({ key, zh, icon }) => {
      const rec = rv.record[key];
      return `<div class="attr-cell">
        <div class="a-icon">${icon}</div>
        <div class="a-zh">${zh}</div>
        <div class="a-val num">${rec ? rec.v : '—'}</div>
        <div class="a-from">${rec ? esc(rec.from) + ' · ' + esc(rec.team) : ''}</div>
      </div>`;
    }).join('');
    return shell(`
      <div class="page-head">
        <button class="btn btn-ghost" onclick="BL.backBuild()">← 返回</button>
        <h2>揭晓我的球员</h2>
      </div>
      <div class="scroll">
        <div class="reveal-card">
          <div class="reveal-name">${esc(id.name)}</div>
          <div class="reveal-pos">${posZh} · ${esc(COUNTRIES[id.nationality].flag)} ${esc(COUNTRIES[id.nationality].zh)}</div>
          <div class="reveal-ovr">
            <div class="ro-label">综合能力</div>
            <div class="ro-val num">${rv.ovr}</div>
            <div class="ro-pot num">潜力 ${rv.potential}</div>
          </div>
          ${rv.similar ? `<div class="reveal-similar">模板：${esc(rv.similar.name)}（${esc(rv.similar.team)}）</div>` : ''}
        </div>
        <div class="label" style="margin-top:16px">属性构成</div>
        <div class="attr-grid">${attrsHTML}</div>
        <div style="height:14px"></div>
        <button class="btn btn-primary btn-lg btn-block" onclick="BL.startCareer()">开始生涯</button>
        <div style="height:24px"></div>
      </div>
    `);
  }

  // 进行中：进度 + 老虎机球队 + 球员卡
  const teamName = b.currentTeam ? (b.currentTeam) : null;
  const selected = b.selectedPlayer;
  const hasTeam = !!teamName;
  const rosterCards = b.drawn.length
    ? b.drawn.map((p, i) => `
        <button class="player-card ${p.historical ? 'historical' : ''} ${selected && selected.name === p.name ? 'active' : ''}" onclick="BL.pickBuildPlayer(${i})">
          ${playerPortraitHTML(p)}
          <div class="pc-pos">${p.pos}</div>
          <div class="pc-name">${esc(p.cname || p.name)}</div>
          ${p.historical ? `<span class="pc-badge ${p.tier === 'hall-of-fame' ? 'hof' : 'astar'}">${p.tier === 'hall-of-fame' ? '🏆 名人堂' : '⭐ 全明星'}${p.era ? ' · ' + p.era : ''}</span>` : ''}
          <div class="pc-ovr num">${p.ovr}</div>
          <div class="pc-type">${esc(p.type || '')}</div>
        </button>`).join('')
    : '<div class="empty">点击下方按钮随机抽一支球队</div>';

  // 已锁定属性（始终显示）+ 当前池 5 个可选项
  const pool = b.currentPool && b.currentPool.length ? b.currentPool : [];
  const shownKeys = [...b.lockedOrder, ...pool.filter(k => !b.attrs[k])];
  const lockedList = shownKeys.map((key) => {
    const meta = ATTR_LIST.find(a => a.key === key);
    if (!meta) return '';
    const { zh, icon } = meta;
    const l = b.attrs[key];
    let preview = null;
    let clickable = false;
    if (!l && selected) {
      const val = attrPreview(b, selected, key);
      if (val != null) { preview = val; clickable = true; }
    }
    return `<div class="attr-lock ${l ? 'done' : clickable ? 'pickable' : 'todo'}" ${clickable ? `onclick="BL.lockIt('${key}')"` : ''}>
      <span class="al-icon">${icon}</span>
      <span class="al-zh">${zh}</span>
      <span class="al-val num">${l ? l.value : (preview != null ? preview : '·')}</span>
      ${l ? `<span class="al-from">${esc(l.from)}</span>` : ''}
    </div>`;
  }).join('');

  // 按钮状态：换卡随时可点（剩余次数>0）
  const spinBtn = hasTeam
    ? `<button class="btn btn-block btn-disabled" disabled>🎲 本队已锁定，先选球员锁定属性</button>`
    : `<button class="btn btn-primary btn-block" onclick="BL.spinTeam()">🎲 随机球队</button>`;
  const rerollBtn = hasTeam && b.rerollsLeft > 0
    ? `<button class="btn btn-outline btn-block" onclick="BL.rerollPlayers()">换 5 张球员卡（剩 ${b.rerollsLeft}）</button>`
    : '';

  return shell(`
    <div class="page-head">
      <button class="btn btn-ghost" onclick="BL.backBuild()">← 返回</button>
      <h2>抽取属性 · ${id.position.toUpperCase()}</h2>
    </div>
    <div class="scroll">
      <div class="build-progress"><div class="bp-bar" style="width:${pct}%"></div><span class="bp-txt">${b.step}/${ATTR_LIST.length}</span></div>
      <div class="label">第 ${b.step + 1}/${ATTR_LIST.length} 步 · ${selected ? `已选中 ${esc(selected.cname || selected.name)}，从下方 5 项中锁 1 项` : (hasTeam ? '在下方球员卡中选一人' : '抽球队、选球员')}</div>

      <div class="attr-lock-grid">${lockedList}</div>

      <div class="team-slot" id="team-slot">
        ${hasTeam ? `<div class="ts-team">🎰 抽中：${esc(teamName)}</div>` : '<div class="ts-empty">待抽取</div>'}
      </div>
      <div class="roster-area">${rosterCards}</div>

      <div class="build-actions">
        ${spinBtn}
        ${rerollBtn}
      </div>
      <div class="build-hint">每支球队随机亮出 5 项属性，选中球员后从这 5 项中锁定 1 项；锁定后自动换下一队。换球员卡可随时进行（共 6 次）。</div>
      <div style="height:24px"></div>
    </div>
  `);
}

// 球员头像（现役在 assets/img/player/，历史名宿在 assets/img/historical/；无头像用首字占位）
function playerPortraitHTML(p) {
  if (p.nbaId) {
    const idStr = String(p.nbaId);
    let img = null;
    if (idStr.startsWith('h:')) {
      img = `assets/img/historical/${idStr.slice(2)}.png`;
    } else if (idStr.startsWith('slug:')) {
      img = `assets/img/player/${idStr.slice(5)}.png`;
    } else {
      img = `assets/img/player/${idStr}.png`;
    }
    return `<div class="pc-portrait"><img src="${img}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.classList.add('ph');this.parentNode.querySelector('.ph-txt').style.display='flex'"/><span class="ph-txt" style="display:none">${esc((p.cname || p.name || '?').slice(0, 1))}</span></div>`;
  }
  return `<div class="pc-portrait ph"><span class="ph-txt">${esc((p.cname || p.name || '?').slice(0, 1))}</span></div>`;
}

// 计算选中球员某属性的预览值（含跨位置衰减）
function attrPreview(state, player, attrKey) {
  const src = srcPosKey(player.pos);
  const penalty = posPenalty(state.userPos, src);
  const raw = player[attrKey];
  if (raw == null) return null;
  return Math.round(Math.max(25, Math.min(99, raw * penalty)));
}

// ---------- 单场模拟 ----------
function gameHTML() {
  if (app.gameView === 'pre') return gamePreHTML();
  if (app.gameView === 'result') return gameResultHTML();
  return gamePlayHTML();
}

function gamePreHTML() {
  const ctx = app.gameCtx;
  if (!ctx) return '<div class="empty">无比赛</div>';
  const tPref = app.tacticsPref || 'normal';
  const tacBtn = (mode, zh, hint) => `<button class="btn btn-block ${tPref === mode ? 'btn-primary' : 'btn-outline'}" onclick="BL.setTactics('${mode}')">${zh} <span class="muted-2" style="font-size:10px">${hint}</span></button>`;
  return shell(`
    <div class="page-head"><h2>🏀 ${esc(ctx.label)}</h2></div>
    <div class="scroll">
      <div class="game-pre-card">
        <div class="gp-home"><div class="gp-name">${esc(ctx.homeTeam.zh)}</div><div class="gp-abbr">${esc(ctx.homeTeam.abbr)}</div></div>
        <div class="gp-vs">VS</div>
        <div class="gp-away"><div class="gp-name">${esc(ctx.awayTeam.zh)}</div><div class="gp-abbr">${esc(ctx.awayTeam.abbr)}</div></div>
      </div>

      <div class="label" style="margin-top:14px">🎯 战术安排 <span class="muted-2">（第四节比分接近时生效，各 50% 成功率）</span></div>
      <div class="tactics-pick">
        ${tacBtn('attack', '⚡ 全力进攻', '成功率+10%·失败-10%')}
        ${tacBtn('defense', '🛡️ 铁血防守', '成功率+10%·失败-10%')}
        ${tacBtn('normal', '☑️ 常规打法', '不冒风险')}
      </div>

      <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" onclick="BL.playGame()">▶ 开始比赛</button>
      <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="BL.skipGame()">跳过，用赛果直接判定</button>
      <div style="height:24px"></div>
    </div>
  `);
}

function gamePlayHTML() {
  const g = app.game;
  if (!g) return '<div class="empty">无比赛</div>';
  const visible = Math.min(app.gameStep, g.log.length);
  const logs = g.log.slice(0, visible).map((l, i) => {
    const [hs, as] = g.scoreSnap[i] || [0, 0];
    return `<div class="pbl-row"><span class="pbl-s">${hs}-${as}</span><span class="pbl-l">${l}</span></div>`;
  }).join('');
  const playing = visible < g.log.length;
  const hName = g.home.zh;
  const aName = g.away.zh;
  const cur = g.scoreSnap[visible - 1] || [0, 0];
  return shell(`
    <div class="game-top">
      <div class="game-score">
        <div class="gs-team"><div class="t">${esc(hName)}</div><div class="s num">${cur[0]}</div></div>
        <div class="gs-mid"><div class="gs-q">第 ${(app.gameQ || 1)} 节</div><div class="gs-t">LIVE</div></div>
        <div class="gs-team right"><div class="s num">${cur[1]}</div><div class="t">${esc(aName)}</div></div>
      </div>
      <div class="game-ctrl">
        ${playing ? `<button class="btn btn-outline" onclick="BL.gameFaster()">⏩ ${app.gameSpeed}x</button><button class="btn btn-primary" onclick="BL.gamePause()">⏸ 暂停</button>` : `<button class="btn btn-primary" onclick="BL.gameReplay()">🔁 重看</button>`}
      </div>
    </div>
    <div class="pbl-list">${logs || '<div class="empty">开场…</div>'}</div>
    ${!playing ? `<button class="btn btn-primary btn-block" style="margin:12px 0 24px" onclick="BL.gameNext()">查看技术统计 →</button>` : ''}
  `);
}

function gameResultHTML() {
  const g = app.game;
  if (!g) return '<div class="empty">无比赛</div>';
  const won = g.winner === 'home';
  const boxHome = g.box.home.players;
  const boxAway = g.box.away.players;
  const rows = (players) => players.map(p => `
    <tr class="${p.isMe ? 'me' : ''}">
      <td>${p.isMe ? '⭐ ' : ''}${esc(p.name)}</td>
      <td>${p.pos}</td>
      <td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td>
    </tr>`).join('');
  const myLine = g.meBox;
  return shell(`
    <div class="game-result ${won ? 'win' : 'lose'}">
      <div class="gr-badge">${won ? '🏆 胜利' : '💔 失利'}</div>
      <div class="gr-score num">${g.homeScore} : ${g.awayScore}</div>
      <div class="gr-teams">${esc(g.home.zh)} vs ${esc(g.away.zh)}</div>
    </div>
    <div class="scroll" style="padding-top:10px">
      ${myLine ? `<div class="me-line">
        <div><div class="num">${myLine.pts}</div><div class="lab">得分</div></div>
        <div><div class="num">${myLine.reb}</div><div class="lab">篮板</div></div>
        <div><div class="num">${myLine.ast}</div><div class="lab">助攻</div></div>
        <div><div class="num">${myLine.stl}</div><div class="lab">抢断</div></div>
        <div><div class="num">${myLine.blk}</div><div class="lab">盖帽</div></div>
      </div>` : ''}
      <div class="label" style="margin-top:12px">${esc(g.home.zh)}</div>
      <table class="box-table"><thead><tr><th>球员</th><th>位</th><th>分</th><th>板</th><th>助</th><th>抢</th><th>帽</th></tr></thead>
      <tbody>${rows(boxHome)}</tbody></table>
      <div class="label" style="margin-top:12px">${esc(g.away.zh)}</div>
      <table class="box-table"><thead><tr><th>球员</th><th>位</th><th>分</th><th>板</th><th>助</th><th>抢</th><th>帽</th></tr></thead>
      <tbody>${rows(boxAway)}</tbody></table>
      <button class="btn btn-primary btn-lg btn-block" style="margin:16px 0 24px" onclick="BL.finishGame()">${won ? '拿下胜利，继续生涯 →' : '接受结果，继续生涯 →'}</button>
    </div>
  `);
}

// ---------- 弹层 ----------
function modalHTML() {
  const m = app.modal;
  if (!m) return '';
  if (m.type === 'gamebox' || m.type === 'mate') {
    return m.html || '';
  }
  if (m.type === 'updates') {
    return `<div class="modal-mask" onclick="if(event.target===this)BL.closeModal()">
      <div class="modal">
        <div class="close-row"><button class="btn btn-ghost" onclick="BL.closeModal()">✕</button></div>
        <h3>更新记录</h3>
        ${[...UPDATES].reverse().map(u => `
          <div class="update-item">
            <div class="ver">v${u.version}</div>
            <div class="ti">${esc(u.title)}</div>
            <ul>${u.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>
    </div>`;
  }
  if (m.type === 'share') {
    return `<div class="modal-mask" onclick="if(event.target===this)BL.closeModal()">
      <div class="modal">
        <div class="close-row"><button class="btn btn-ghost" onclick="BL.closeModal()">✕</button></div>
        <h3>分享战绩卡</h3>
        ${app.shareDataUrl ? `<img class="share-preview" src="${app.shareDataUrl}" alt="生涯战绩卡"/>` : '<div class="empty">正在生成…</div>'}
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-outline" onclick="BL.copyCode()">复制编号</button>
          <button class="btn btn-primary" onclick="BL.downloadShare()">下载图片</button>
        </div>
        <div class="share-hint">长按上方图片保存，或直接发给朋友<br/>别人输入你的编号，就能看到同一段生涯</div>
      </div>
    </div>`;
  }
  return '';
}

// ---------- 分享图 ----------
function drawShare(sum) {
  const W = 1080, H = 1600;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const font = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';
  const F = (size, weight = 400) => `${weight} ${size}px ${font}`;

  // 背景
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);
  // 球场线装饰
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, 250, 210, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H - 120, 320, Math.PI, Math.PI * 2);
  ctx.stroke();

  // 顶部
  const ringR = 74, cx = 150, cy = 205;
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sum.maxOverall / 99); ctx.stroke();
  ctx.fillStyle = '#fafafa';
  ctx.font = F(44, 900);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sum.maxOverall, cx, cy);
  ctx.font = F(17, 700);
  ctx.fillStyle = '#71717a';
  ctx.fillText('生涯最高', cx, cy + 58);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fafafa';
  ctx.font = F(58, 900);
  ctx.fillText(sum.player.name, 252, 178);
  const tags = `${sum.player.nationality}  ·  #${sum.player.number} ${sum.player.positionEn} ${sum.player.position}  ·  ${sum.player.hand}手`;
  ctx.font = F(23, 700);
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(tags, 254, 232);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#71717a';
  ctx.font = F(18, 700);
  ctx.fillText('巅峰身价', W - 60, 168);
  ctx.fillStyle = '#fbbf24';
  ctx.font = F(34, 900);
  ctx.fillText(E.fmtMoney(sum.peakValue), W - 60, 208);
  ctx.fillStyle = '#71717a';
  ctx.font = F(18, 700);
  ctx.fillText('生涯总收入', W - 60, 252);
  ctx.fillStyle = 'rgba(251,191,36,0.85)';
  ctx.font = F(26, 900);
  ctx.fillText(E.fmtMoney(sum.totalIncome), W - 60, 288);

  // 结局条
  roundRect(ctx, 56, 330, W - 112, 158, 22);
  ctx.fillStyle = 'rgba(251,191,36,0.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(251,191,36,0.4)';
  ctx.stroke();
  const topTitle = TITLES.find(t => t.id === sum.titles[0]?.id);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(251,191,36,0.85)';
  ctx.font = F(18, 800);
  ctx.fillText('生涯结局', W / 2, 368);
  ctx.fillStyle = '#fbbf24';
  ctx.font = F(40, 900);
  ctx.fillText(topTitle ? topTitle.name : '完整的一生', W / 2, 414);
  ctx.fillStyle = '#34d399';
  ctx.font = F(22, 900);
  ctx.fillText(`超过了 ${sum.percentile}% 的球员`, W / 2, 456);

  // 数据
  const t = sum.totals;
  const stats = [[E.fmtInt(t.apps), '出场'], [E.fmtInt(t.pts), '总得分'], [E.fmtInt(t.reb), '总篮板'], [E.fmtInt(t.ast), '总助攻'], [E.fmtInt(t.stl), '抢断'], [E.fmtInt(t.blk), '盖帽']];
  const cellW = (W - 112) / 6;
  ctx.textAlign = 'center';
  stats.forEach(([v, k], i) => {
    const x = 56 + cellW * i + cellW / 2;
    ctx.fillStyle = '#fafafa';
    ctx.font = F(28, 900);
    ctx.fillText(v, x, 545);
    ctx.fillStyle = '#71717a';
    ctx.font = F(15, 700);
    ctx.fillText(k, x, 578);
  });

  let y = 630;
  ctx.textAlign = 'left';

  // 国家队
  if (sum.national) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = F(22, 700);
    ctx.fillText(`${sum.player.nationality} 国家队：大赛 ${sum.national.games} 场 · ${sum.national.pts} 分 · ${sum.national.reb} 板 · ${sum.national.ast} 助 · 冠军 ${sum.national.golds} 次`, 56, y);
    y += 52;
  }
  if (sum.rival) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = F(22, 700);
    ctx.fillText(`一生之敌 ${sum.rival.name}：总得分 ${sum.rival.myPts}:${sum.rival.rivalPts} · 冠军 ${sum.rival.myChamps}:${sum.rival.rivalChamps}`, 56, y);
    y += 52;
  }

  // 荣誉
  const trophies = sum.clubs.flatMap(c => (c.trophies || []).map(x => x));
  const tcount = {};
  trophies.forEach(x => tcount[x] = (tcount[x] || 0) + 1);
  const entries = Object.entries(tcount);
  if (entries.length) {
    ctx.fillStyle = '#71717a';
    ctx.font = F(17, 800);
    ctx.fillText('荣 誉 室', 56, y);
    y += 14;
    let tx = 56;
    const per = 170;
    entries.slice(0, 6).forEach(([id, n]) => {
      const meta = trophyMeta(id);
      ctx.font = F(34);
      ctx.textAlign = 'center';
      ctx.fillText(meta.art, tx + 45, y + 28);
      ctx.font = F(17, 800);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillText(`${meta.name}${n > 1 ? ' ×' + n : ''}`, tx + 100, y + 33);
      ctx.textAlign = 'left';
      tx += per;
      if (tx > W - 120) { tx = 56; y += 56; }
    });
    y += 60;
  }

  // 球队
  ctx.fillStyle = '#71717a';
  ctx.font = F(17, 800);
  ctx.fillText('效 力 球 队', 56, y);
  y += 12;
  sum.clubs.slice(0, 5).forEach(c => {
    y += 44;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(56 + 19, y - 16, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.isLight ? '#09090b' : '#fff';
    ctx.font = F(13, 900);
    ctx.textAlign = 'center';
    ctx.fillText(c.abbr.slice(0, 3), 56 + 19, y - 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e4e4e7';
    ctx.font = F(20, 800);
    ctx.fillText(c.name, 104, y - 10);
    ctx.fillStyle = '#71717a';
    ctx.font = F(16, 700);
    ctx.fillText(`${c.seasons} 季 · ${c.games} 场 · ${c.pts} 分 · ${c.trophies?.length || 0} 冠`, 104, y + 16);
  });
  y += 44;

  // 称号
  if (sum.titles.length) {
    ctx.fillStyle = '#71717a';
    ctx.font = F(17, 800);
    ctx.fillText('称 号', 56, y);
    y += 12;
    let tx = 56;
    sum.titles.slice(0, 8).forEach(tid => {
      const meta = TITLES.find(x => x.id === tid.id);
      if (!meta) return;
      const text = `${meta.art} ${meta.name}`;
      ctx.font = F(18, 800);
      const w = ctx.measureText(text).width + 30;
      if (tx + w > W - 56) { tx = 56; y += 44; }
      roundRect(ctx, tx, y, w, 34, 17);
      ctx.fillStyle = 'rgba(251,191,36,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(251,191,36,0.35)';
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.fillText(text, tx + w / 2, y + 22);
      ctx.textAlign = 'left';
      tx += w + 10;
    });
    y += 54;
  }

  // 结尾
  ctx.strokeStyle = '#27272a';
  ctx.beginPath(); ctx.moveTo(56, H - 108); ctx.lineTo(W - 56, H - 108); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#71717a';
  ctx.font = F(17, 700);
  ctx.fillText(`${APP_TITLE} · 从青训到传奇`, W / 2, H - 72);
  ctx.fillStyle = '#3f3f46';
  ctx.font = F(15, 700);
  ctx.fillText(`编号 ${sum.seed}`, W / 2, H - 42);

  app.shareDataUrl = cv.toDataURL('image/png');
  return app.shareDataUrl;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 渲染 ----------
function render() {
  const scrollEl = document.querySelector('.app > .scroll');
  const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
  const prevView = app.view;
  if (app.view === 'home') root.innerHTML = homeHTML();
  else if (app.view === 'identity') root.innerHTML = identityHTML();
  else if (app.view === 'build') root.innerHTML = buildHTML();
  else if (app.view === 'game') root.innerHTML = gameHTML();
  else if (app.view === 'career') root.innerHTML = careerHTML();
  else if (app.view === 'summary') root.innerHTML = summaryHTML();
  else if (app.view === 'archive') root.innerHTML = archiveHTML();
  else if (app.view === 'archive-detail') root.innerHTML = archiveDetailHTML();
  else if (app.view === 'gallery') root.innerHTML = galleryHTML();
  else if (app.view === 'upgrade') root.innerHTML = upgradeHTML();
  else if (app.view === 'offseason') root.innerHTML = offseasonHTML();
  if (app.view === prevView) {
    requestAnimationFrame(() => {
      const el = document.querySelector('.app > .scroll');
      if (el) el.scrollTop = prevScroll;
    });
  }
}

// ---------- 事件 ----------
window.BL = {
  setMode(m) { app.mode = m; render(); },
  start() {
    app.seed = null;
    app.identity = { ...app.identity, name: '', number: String(8 + Math.floor(Math.random() * 20)), domesticDream: '', foreignDream: '' };
    app.view = 'identity';
    render();
  },
  resume() {
    if (!app.seed) {
      // 找最近一次的存档
      const key = Object.keys(localStorage).filter(k => k.startsWith('bl-save:')).sort().pop();
      if (key) app.seed = key.slice(8);
    }
    if (!app.seed) { toast('没有可继续的存档'); return; }
    const st = E.loadState(app.seed);
    if (!st) { toast('存档已清理'); return; }
    app.state = st;
    app.archived = false;
    app.view = st.phase === 'summary' ? 'summary' : 'career';
    app.receipt = false;
    app.pendingBanner = false;
    app.lastBanner = null;
    // 赛季进行中：直接显示赛季页（careerHTML 处理）
    if (st.phase === 'career' && st.season && !st.season.done) {
      render();
      return;
    }
    // 季后赛进行中
    if (st.phase === 'career' && st.playoffs && !st.playoffs.done) {
      render();
      return;
    }
    // 若停在季后赛关键战前，恢复该赛季的 banner 以保留模拟入口
    if (st.phase === 'career' && st.pendingGame && st.pendingGame.type === 'playoff_key' && st.pendingGame.seasonIndex != null) {
      app.lastBanner = st.seasons[st.pendingGame.seasonIndex] || null;
      render();
      return;
    }
    if (st.phase === 'career' && !st.currentEvent) {
      BL.tick();
      return;
    }
    render();
  },
  backHome() { app.view = 'home'; app.modal = null; render(); },
  openArchive() { app.view = 'archive'; render(); },
  openGallery() { app.view = 'gallery'; render(); },
  openUpdates() { app.modal = { type: 'updates' }; render(); },
  closeModal() { app.modal = null; render(); },
  setInvite(v) { app.invite = v; },
  useInvite() {
    const code = app.invite.trim();
    if (!code) { toast('输入一个编号'); return; }
    app.seed = code;
    const st = E.loadState(code);
    if (st) {
      app.state = st;
      app.archived = false;
      app.view = st.phase === 'summary' ? 'summary' : 'career';
      render();
      return;
    }
    app.view = 'identity';
    render();
  },
  setName(v) { app.identity.name = v; },
  setNationality(c) { app.identity.nationality = c; app.identity.domesticDream = ''; render(); },
  setPosition(p) { app.identity.position = p; render(); },
  setHand(h) { app.identity.hand = h; render(); },
  setNumber(v) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = 0;
    app.identity.number = String(Math.max(0, Math.min(99, n)));
  },
  setDream(kind, val) {
    if (kind === 'domestic') app.identity.domesticDream = val;
    else app.identity.foreignDream = val;
  },
  // ---------- 建球员 ----------
  backBuild() { app.view = 'identity'; app.build = null; render(); },
  async spinTeam() {
    if (!app.poolLoaded) { toast('球员池加载中…'); return; }
    const b = app.build;
    if (!b) return;
    // 已有球队时不允许重抽（锁定属性后自动进入下一队），只能换球员卡
    if (b.currentTeam) {
      toast('先锁定一项属性，才能抽下一支球队');
      return;
    }
    b.currentTeam = randomTeam();
    b.drawn = drawPlayers(b.currentTeam, 5);
    b.selectedPlayer = null;
    rollAttrPool(b);
    render();
  },
  rerollPlayers() {
    const b = app.build;
    if (!b || !b.currentTeam) { toast('先抽取一支球队'); return; }
    if (b.rerollsLeft <= 0) { toast('换人次数用完了'); return; }
    b.rerollsLeft -= 1;
    b.drawn = drawPlayers(b.currentTeam, 5);
    b.selectedPlayer = null;
    rollAttrPool(b);
    render();
  },
  pickBuildPlayer(i) {
    const b = app.build;
    if (!b || !b.drawn[i]) return;
    b.selectedPlayer = b.drawn[i];
    render();
  },
  lockIt(key) {
    const b = app.build;
    if (!b || !b.selectedPlayer) { toast('先选一名球员'); return; }
    if (b.attrs[key]) return;
    lockAttr(b, key);
    if (b.step >= ATTR_LIST.length) {
      app.buildResult = reveal(b);
    }
    render();
  },
  startCareer() {
    const id = app.identity;
    const rv = app.buildResult;
    if (!rv) return;
    const seed = app.seed || E.genSeed();
    const st = E.newGame({
      seed,
      mode: app.mode,
      name: id.name.trim(),
      nationality: id.nationality,
      position: id.position,
      hand: id.hand,
      number: parseInt(id.number, 10) || 8,
      domesticDreamTeamId: id.domesticDream || null,
      foreignDreamTeamId: id.foreignDream || null,
      built: rv,
    });
    app.seed = seed;
    app.state = st;
    app.archived = false;
    app.receipt = false;
    app.pendingBanner = false;
    app.lastBanner = null;
    app.view = 'career';
    E.saveState(st);
    BL.tick();
  },
  // ---------- 单场模拟 ----------
  enterGame() {
    const st = app.state;
    if (!st) return;
    const pg = st.pendingGame;
    if (!pg) { toast('没有可模拟的比赛'); return; }
    // showdown 事件优先；否则 playoff_key
    const kind = st.currentEvent && st.currentEvent.type === 'showdown'
      ? st.currentEvent.showdownKey
      : (pg.type || 'playoff_key');
    app.gameCtx = E.makeGameContext(st, kind);
    app.gameCtx.kind = kind;
    app.game = null;
    app.gameStep = 0;
    app.gameView = 'pre';
    app.gameSpeed = 4;
    app.gameTimer = null;
    app.gameQ = 1;
    app.view = 'game';
    render();
  },
  playGame() {
    const ctx = app.gameCtx;
    if (!ctx) return;
    const st = app.state;
    // 准备名单
    let homeRoster, awayRoster;
    if (ctx._rosters) {
      // 国家队比赛：用预生成的国家队 roster
      homeRoster = ctx._rosters.home;
      awayRoster = ctx._rosters.away;
      // 插入玩家
      const playerPos = POSITIONS[st.player.position]?.en || 'SF';
      const mePlayer = {
        name: st.player.name, pos: playerPos, ovr: st.player.overall,
        starter: true, isMe: true, attrs: st.player.attrs || fallbackAttrs(st.player.overall),
      };
      homeRoster[0] = mePlayer;
    } else if (ctx.playoff && st.season && st.season.rosters) {
      // 季后赛：用赛季 roster（真实球员，含我方）
      const toSimRoster = (players) => players.map(p => ({
        name: p.name, pos: p.pos, ovr: p.ovr, starter: p.starter, isMe: !!p.isMe,
        attrs: p.attrs || fallbackAttrs(p.ovr),
      }));
      homeRoster = toSimRoster(st.season.rosters.get(ctx.homeTeam.id) || []);
      awayRoster = toSimRoster(st.season.rosters.get(ctx.awayTeam.id) || []);
      if (homeRoster.length < 5) {
        const pool = app.pool || {};
        const homePool = pool[ctx.homeTeam.abbr.toUpperCase()] || null;
        homeRoster = makeRoster(ctx.homeTeam, surnamesFor(ctx.homeTeam), homePool, { total: 10 });
      }
      if (awayRoster.length < 5) {
        const pool = app.pool || {};
        const awayPool = pool[ctx.awayTeam.abbr.toUpperCase()] || null;
        awayRoster = makeRoster(ctx.awayTeam, surnamesFor(ctx.awayTeam), awayPool, { total: 10 });
      }
    } else {
      const pool = app.pool || {};
      const homePool = pool[ctx.homeTeam.abbr.toUpperCase()] || null;
      const awayPool = pool[ctx.awayTeam.abbr.toUpperCase()] || null;
      const homeNames = surnamesFor(ctx.homeTeam);
      const awayNames = surnamesFor(ctx.awayTeam);
      homeRoster = makeRoster(ctx.homeTeam, homeNames, homePool, { total: 10 });
      awayRoster = makeRoster(ctx.awayTeam, awayNames, awayPool, { total: 10 });
    }
    const playerPos = POSITIONS[st.player.position]?.en || 'SF';
    const g = simulateGame(ctx.homeTeam, ctx.awayTeam, homeRoster, awayRoster, {
      isPlayoff: ctx.kind !== 'last_shot' && ctx.kind !== 'free_throw',
      seed: ctx.seed,
      myPlayer: {
        name: st.player.name,
        pos: playerPos,
        overall: st.player.overall,
        attrs: st.player.attrs || fallbackAttrs(st.player.overall),
      },
      // 第四节比分接近时应用玩家预选战术（50%成功率）
      tactics: (tctx) => {
        const pref = app.tacticsPref || 'normal';
        if (pref === 'normal') return { mode: 'normal', success: true };
        const success = Math.random() < 0.5;
        return { mode: pref, success };
      },
    });
    g.kind = ctx.kind;
    g.stage = ctx.stage;
    g.label = ctx.label;
    g.awayName = ctx.awayTeam.zh;
    g.awayId = ctx.awayId;
    g.tournamentAge = ctx.tournamentAge != null ? ctx.tournamentAge : (st.pendingGame ? st.pendingGame.tournamentAge : null);
    app.game = g;
    app.gameStep = 0;
    app.gameView = 'play';
    app.gameTimer = setInterval(BL.gameTick, 80);
    render();
  },
  gameTick() {
    if (!app.game) { clearInterval(app.gameTimer); return; }
    const speed = app.gameSpeed || 4;
    app.gameStep = Math.min(app.gameStep + speed, app.game.log.length);
    const cur = app.game.scoreSnap[app.gameStep - 1] || [0, 0];
    // 简单节次推断（共4节+加时）
    const totalPlays = app.game.log.length;
    const pct = app.gameStep / totalPlays;
    app.gameQ = Math.min(4 + (app.game.ot || 0), 1 + Math.floor(pct * (4 + (app.game.ot || 0))));
    if (app.gameStep >= app.game.log.length) {
      clearInterval(app.gameTimer);
      app.gameTimer = null;
    }
    const el = document.getElementById('root');
    if (el) { el.innerHTML = gamePlayHTML(); el.querySelector('.pbl-list')?.scrollTo(0, 1e9); }
  },
  gameFaster() {
    app.gameSpeed = Math.min(32, (app.gameSpeed || 4) * 2);
    render();
  },
  gamePause() {
    if (app.gameTimer) { clearInterval(app.gameTimer); app.gameTimer = null; }
    else { app.gameTimer = setInterval(BL.gameTick, 80); }
  },
  gameReplay() {
    if (app.gameTimer) { clearInterval(app.gameTimer); app.gameTimer = null; }
    app.gameStep = 0;
    app.gameView = 'play';
    app.gameTimer = setInterval(BL.gameTick, 80);
    render();
  },
  gameNext() {
    app.gameView = 'result';
    render();
  },
  skipGame() {
    // 跳过：常规赛直接模拟1场；关键事件则交给 choose 判定
    const st = app.state;
    if (app.gameCtx && app.gameCtx.kind === 'regular') {
      app.game = null; app.gameView = null; app.gameCtx = null;
      app.view = 'career';
      BL.simGames(1);
      return;
    }
    if (app.gameCtx && app.gameCtx.kind === 'playoff_regular') {
      // 跳过 = 用简化模拟打一场季后赛
      app.game = null; app.gameView = null; app.gameCtx = null;
      app.view = 'career';
      BL.simPlayoff(1);
      return;
    }
    if (app.gameCtx && app.gameCtx.kind === 'national') {
      // 跳过 = 按能力随机判定国家队胜负
      const winP = 0.5 + (st.player.overall - 75) * 0.008;
      const won = Math.random() < winP;
      const oppZh = app.gameCtx.awayTeam.zh;
      if (won) { st.legacyLines.push(`国家队热身赛，你率队击败了${oppZh}。`); st.natWins = (st.natWins||0)+1; }
      else { st.legacyLines.push(`国家队热身赛，你不敌${oppZh}。`); st.natLosses = (st.natLosses||0)+1; }
      if (app.offseason && app.offseason.nationalGames) {
        app.offseason.nationalGames.splice(app.gameCtx.nationalIdx, 1);
      }
      app.game = null; app.gameView = null; app.gameCtx = null;
      app.view = 'offseason';
      E.saveState(st);
      render();
      return;
    }
    if (st && st.currentEvent && st.currentEvent.type === 'showdown') {
      app.game = null; app.gameView = null; app.gameCtx = null;
      app.view = 'career';
      render();
      return; // 交给玩家在事件卡里选选项判定
    }
    if (st && st.pendingGame) st.pendingGame = null;
    app.game = null; app.gameView = null; app.gameCtx = null;
    app.view = 'career';
    E.saveState(st);
    render();
  },
  finishGame() {
    if (app.gameTimer) { clearInterval(app.gameTimer); app.gameTimer = null; }
    const st = app.state;
    const g = app.game;
    if (st && g) {
      if (g.kind === 'regular') {
        // 常规赛：把完整模拟结果写入赛季统计
        E.applyRegularGameResult(st, g, g.awayId);
      } else if (g.kind === 'playoff_regular') {
        // 季后赛单场：写回季后赛状态
        E.applyPlayoffGameResult(st, g);
      } else if (g.kind === 'national') {
        // 国家队比赛：记录结果
        const won = g.winner === 'home';
        const oppZh = g.away.zh || '对手';
        if (won) {
          st.legacyLines.push(`国家队热身赛，你率队击败了${oppZh}。`);
          st.natWins = (st.natWins || 0) + 1;
        } else {
          st.legacyLines.push(`国家队热身赛，你不敌${oppZh}。`);
          st.natLosses = (st.natLosses || 0) + 1;
        }
        // 从休赛期移除已打的比赛
        if (app.offseason && app.offseason.nationalGames) {
          const idx = app.gameCtx.nationalIdx;
          app.offseason.nationalGames.splice(idx, 1);
        }
        app.game = null; app.gameView = null; app.gameCtx = null;
        app.view = 'offseason';
        E.saveState(st);
        render();
        return;
      } else {
        E.applyGameResult(st, g);
      }
      E.saveState(st);
    }
    app.game = null;
    app.gameView = null;
    app.gameCtx = null;
    app.view = 'career';
    app.pendingBanner = false;
    app.receipt = false;
    // 季后赛打完则结算
    if (st && st.playoffs && st.playoffs.done) {
      BL.finishPlayoffs();
      return;
    }
    // 赛季打完则推进
    if (st && st.season && st.season.done) {
      BL.advanceAfterRegularSeason();
      return;
    }
    render();
  },
  confirmIdentity() {
    const id = app.identity;
    if (!id.name.trim()) { toast('先给自己起个名字'); return; }
    // 建档 → 进入"抽取属性"建球员流程
    app.view = 'build';
    app.build = createBuildState(id.position);
    render();
  },
  tick() {
    if (!app.state) return;
    // 玩家直接推进而未模拟季后赛关键战时，视为按原赛果跳过
    if (app.state.pendingGame && app.state.pendingGame.type === 'playoff_key') {
      app.state.pendingGame = null;
    }
    const { state, screen, snapshot } = E.step(app.state);
    app.state = state;
    app.receipt = false;
    if (screen === 'banner') {
      app.lastBanner = snapshot;
      // 若这个横幅后面还跟着事件，先显示横幅，点一下再进事件
      app.pendingBanner = !!state.currentEvent;
    }
    if (screen === 'summary') { app.view = 'summary'; app.archived = false; }
    E.saveState(state);
    render();
  },
  dismissSeasonSummary() {
    // 赛季总结关闭后：休赛期（国家队比赛 + 交易 + 退役 + 新秀）
    if (app.state && app.state.currentTeamId && !app.state.season) {
      const trades = E.seasonOffseason(app.state);
      const retirements = E.starRetirements(app.state);
      app.offseason = {
        trades: trades ? trades.trades : [],
        retirements,
        nationalGames: trades && trades.nationalGames ? trades.nationalGames : [],
      };
      const hasContent = app.offseason.trades.length || app.offseason.retirements.length || app.offseason.nationalGames.length;
      if (hasContent) {
        app.view = 'offseason';
        app.seasonSummary = null;
        E.saveState(app.state);
        render();
        return;
      }
    }
    app.seasonSummary = null;
    render();
  },
  dismissOffseason() {
    app.offseason = null;
    app.view = 'career';
    render();
  },
  tryNBAJump() {
    if (!app.state) return;
    const res = E.tryNBAJump(app.state);
    if (!res.ok) {
      if (res.reason === 'chance_failed') toast('冲击 NBA 失败，继续努力');
      else toast(res.reason || '失败');
    } else {
      toast(`🏀 成功！加盟 ${res.team.zh}`);
      // 刷新总结的 NBA 状态
      app.seasonSummary.nbaJump = E.nbaJumpInfo(app.state);
    }
    E.saveState(app.state);
    render();
  },
  viewGameBox(idx) {
    if (!app.state || !app.state.season) return;
    const game = app.state.season.games[idx];
    if (!game) return;
    const teamZh = app.state.season.kind === 'ncaa'
      ? (NCAA_TEAMS[app.state.season.teamId]?.zh || '')
      : (TEAMS[app.state.season.teamId]?.zh || '');
    app.modal = { type: 'gamebox', html: gameBoxHTML(game, teamZh) };
    render();
  },
  viewMate(i) {
    if (!app.state) return;
    const mates = E.getMyRoster(app.state).filter(p => !p.isMe);
    const mate = mates[i];
    if (!mate) return;
    app.modal = { type: 'mate', html: mateDetailHTML(mate) };
    render();
  },
  openUpgrade() {
    app.view = 'upgrade';
    render();
  },
  closeUpgrade() {
    app.view = 'career';
    app.seasonSummary = null;
    render();
  },
  upgradeAttr(key) {
    if (!app.state) return;
    const res = E.upgradeAttr(app.state, key, 1);
    if (!res.ok) { toast(res.reason); return; }
    E.saveState(app.state);
    render();
  },
  // ---------- 逐场赛季 ----------
  setTactics(mode) {
    app.tacticsPref = mode;
    render();
  },
  enterNationalGame(idx) {
    if (!app.state || !app.offseason) return;
    const games = app.offseason.nationalGames || [];
    const g = games[idx];
    if (!g) return;
    const st = app.state;
    const myCountry = COUNTRIES[st.player.nationalityCode];
    // 构造国家队对阵（用国家名构造球队对象，roster 用姓氏池）
    const myTeam = { abbr: myCountry.flag, zh: st.player.nationality, league: 'nba', strength: 70 + (myCountry.tier === 1 ? 20 : myCountry.tier === 2 ? 12 : 6), id: 'nat-me', conf: 'W' };
    const oppCountry = COUNTRIES[g.oppCode];
    const oppTeam = { abbr: g.oppFlag, zh: g.oppZh, league: 'nba', strength: 65 + (g.oppTier === 1 ? 20 : g.oppTier === 2 ? 12 : 6), id: 'nat-opp', conf: 'E' };
    const myNames = (myCountry.surnames || []).map(x => ({ zh: x }));
    const oppNames = (oppCountry.surnames || []).map(x => ({ zh: x }));
    const pool = app.pool || {};
    const homeRoster = makeRoster(myTeam, myNames, null, { total: 8 });
    const awayRoster = makeRoster(oppTeam, oppNames, null, { total: 8 });
    app.gameCtx = {
      kind: 'national',
      label: `${myTeam.zh} vs ${oppTeam.zh}`,
      homeId: 'nat-me',
      homeTeam: myTeam,
      awayId: 'nat-opp',
      awayTeam: oppTeam,
      stage: 'national',
      seed: (st.seed.split('-').pop() || '0') + 'nat' + idx,
      nationalIdx: idx,
      nationalOpp: g,
    };
    // 用预生成的 rosters
    app.gameCtx._rosters = { home: homeRoster, away: awayRoster };
    app.game = null;
    app.gameStep = 0;
    app.gameView = 'pre';
    app.gameSpeed = 4;
    app.gameTimer = null;
    app.gameQ = 1;
    app.view = 'game';
    render();
  },
  enterPlayoffGame() {
    if (!app.state || !app.state.playoffs || app.state.playoffs.done) return;
    const st = app.state;
    const po = st.playoffs;
    const teamTable = (st.season && st.season.kind === 'ncaa') ? NCAA_TEAMS : TEAMS;
    const homeTeam = teamTable[st.season.teamId];
    const opp = teamTable[po.currentOppId];
    if (!homeTeam || !opp) { toast('无法进入比赛'); return; }
    app.gameCtx = {
      kind: 'playoff_regular',
      label: `${po.roundNames[po.round] || '季后赛'} · ${homeTeam.zh} vs ${opp.zh}`,
      homeId: homeTeam.id,
      homeTeam,
      awayId: opp.id,
      awayTeam: opp,
      stage: 'playoff',
      seed: (st.seed.split('-').pop() || '0') + st.step + 'p' + po.games.length,
      playoff: true,
    };
    app.game = null;
    app.gameStep = 0;
    app.gameView = 'pre';
    app.gameSpeed = 4;
    app.gameTimer = null;
    app.gameQ = 1;
    app.view = 'game';
    render();
  },
  enterSeasonGame() {
    if (!app.state || !app.state.season || app.state.season.done) return;    const opp = E.nextOpponent(app.state);
    if (!opp) { toast('没有可模拟的比赛'); return; }
    const st = app.state;
    const homeTeam = TEAMS[st.season.teamId] || NCAA_TEAMS[st.season.teamId];
    const awayTeam = TEAMS[opp.id] || NCAA_TEAMS[opp.id];
    app.gameCtx = {
      kind: 'regular',
      label: `${homeTeam.zh} vs ${awayTeam.zh}`,
      homeId: homeTeam.id,
      homeTeam,
      awayId: awayTeam.id,
      awayTeam,
      stage: 'regular',
      seed: (st.seed.split('-').pop() || '0') + st.step + st.season.played,
    };
    app.game = null;
    app.gameStep = 0;
    app.gameView = 'pre';
    app.gameSpeed = 4;
    app.gameTimer = null;
    app.gameQ = 1;
    app.view = 'game';
    render();
  },
  simGames(n) {
    if (!app.state || !app.state.season) return;
    E.simNextGames(app.state, n);
    // 赛季打完则推进
    if (app.state.season && app.state.season.done) {
      BL.advanceAfterRegularSeason();
      return;
    }
    E.saveState(app.state);
    render();
  },
  simAll() {
    if (!app.state || !app.state.season) return;
    const remain = app.state.season.totalGames - app.state.season.played;
    E.simNextGames(app.state, remain);
    if (app.state.season && app.state.season.done) {
      BL.advanceAfterRegularSeason();
      return;
    }
    E.saveState(app.state);
    render();
  },
  // 常规赛打完：让 step 决定进季后赛还是直接结算
  advanceAfterRegularSeason() {
    if (!app.state) return;
    const { state, screen, snapshot } = E.step(app.state);
    app.state = state;
    if (screen === 'playoffs') {
      E.saveState(state);
      render();
      return;
    }
    // 直接结算（未进季后赛）
    if (state.lastSeasonSummary) app.seasonSummary = state.lastSeasonSummary;
    if (screen === 'banner') {
      app.lastBanner = snapshot;
      app.pendingBanner = !!state.currentEvent;
    }
    if (screen === 'summary') { app.view = 'summary'; app.archived = false; }
    E.saveState(state);
    render();
  },
  // ---------- 季后赛 ----------
  simPlayoff(n) {
    if (!app.state || !app.state.playoffs) return;
    E.simPlayoffGames(app.state, n);
    if (app.state.playoffs && app.state.playoffs.done) {
      BL.finishPlayoffs();
      return;
    }
    E.saveState(app.state);
    render();
  },
  simPlayoffAll() {
    if (!app.state || !app.state.playoffs) return;
    E.simPlayoffGames(app.state, 7);
    if (app.state.playoffs && app.state.playoffs.done) {
      BL.finishPlayoffs();
      return;
    }
    E.saveState(app.state);
    render();
  },
  requestTrade() {
    if (!app.state) return;
    const res = E.requestTrade(app.state);
    if (!res.ok) {
      if (res.reason === 'chance') toast(`交易未能达成（成功率约 ${res.pct}%）`);
      else toast(res.reason);
    } else {
      toast(`🔄 交易成功！你被送往 ${res.team.zh}`);
    }
    E.saveState(app.state);
    render();
  },
  finishPlayoffs() {
    if (!app.state) return;
    // 读取季后赛结果（E.step 结算后会清空）
    const po = app.state.playoffs;
    const poResult = po ? (po.champion ? 'champion' : po.eliminated ? 'eliminated' : null) : null;
    const oppZh = po && po.currentOppId ? (TEAMS[po.currentOppId]?.zh || '') : '';
    app.receipt = false;
    app.pendingBanner = false;
    app.lastBanner = null;
    const { state, screen, snapshot } = E.step(app.state);
    app.state = state;
    if (state.lastSeasonSummary) app.seasonSummary = state.lastSeasonSummary;
    if (screen === 'banner') {
      app.lastBanner = snapshot;
      app.pendingBanner = !!state.currentEvent;
    }
    if (screen === 'summary') { app.view = 'summary'; app.archived = false; }
    E.saveState(state);
    // 夺冠 / 淘汰 自动关闭提示
    if (poResult === 'champion') {
      showAutoToast('🏆 恭喜夺冠！你是总冠军！', 4000);
    } else if (poResult === 'eliminated') {
      showAutoToast(`💔 季后赛出局，被 ${oppZh || '对手'} 淘汰。`, 3500);
    }
    render();
  },
  finishSeasonNow() {
    if (!app.state) return;
    // 赛季已打完：清掉 pending banner，调用 step 完成结算
    app.receipt = false;
    app.pendingBanner = false;
    app.lastBanner = null;
    const { state, screen, snapshot } = E.step(app.state);
    app.state = state;
    // 展示赛季总结
    if (state.lastSeasonSummary) {
      app.seasonSummary = state.lastSeasonSummary;
    }
    if (screen === 'banner') {
      app.lastBanner = snapshot;
      app.pendingBanner = !!state.currentEvent;
    }
    if (screen === 'summary') { app.view = 'summary'; app.archived = false; }
    E.saveState(state);
    render();
  },
  choose(optionId) {
    if (!app.state || !app.state.currentEvent) return;
    if (navigator.vibrate) navigator.vibrate(12);
    const res = E.decide(app.state, optionId);
    const state = res.state;
    app.state = state;
    app.lastBanner = null;
    app.pendingBanner = false;
    if (res.screen === 'summary') {
      app.view = 'summary';
      app.archived = false;
      app.receipt = false;
    } else {
      app.receipt = true;
    }
    E.saveState(state);
    render();
  },
  next() {
    if (app.pendingBanner) {
      app.pendingBanner = false;
      render();
    } else if (app.state && app.state.currentEvent) {
      app.receipt = false;
      render();
    } else {
      BL.tick();
    }
  },
  replay() {
    app.state = null;
    app.seed = null;
    app.modal = null;
    app.shareDataUrl = null;
    app.view = 'home';
    render();
  },
  copyCode() {
    const sum = app.state ? E.buildSummary(app.state) : app.archiveDetail;
    const code = sum?.seed || app.seed || '';
    const text = `${APP_TITLE}｜${sum?.player.name || ''} ${sum?.player.positionEn || ''}｜巅峰 ${sum?.maxOverall || '?'}｜总收入 ${sum ? E.fmtMoney(sum.totalIncome) : ''}｜编号 ${code}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('已复制')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  },
  openShare() {
    app.modal = { type: 'share' };
    app.shareDataUrl = null;
    render();
    setTimeout(() => {
      if (app.modal?.type === 'share' && app.state) {
        drawShare(E.buildSummary(app.state));
        render();
      }
    }, 30);
  },
  downloadShare() {
    if (!app.shareDataUrl) return;
    const a = document.createElement('a');
    a.href = app.shareDataUrl;
    a.download = `${app.state?.player?.name || '生涯'}-生涯战绩卡.png`;
    a.click();
  },
  viewArchive(i) {
    const list = E.loadArchive();
    app.archiveDetail = list[i];
    app.view = 'archive-detail';
    render();
  },
  backArchive() { app.view = 'archive'; render(); },
};

// ---------- 休赛期（赛季后交易 + 明星退役） ----------
function offseasonHTML() {
  const o = app.offseason;
  if (!o) { app.view = 'career'; render(); return ''; }
  const s = app.state;
  const team = s.currentTeamId ? TEAMS[s.currentTeamId] : null;
  const tradesHTML = (o.trades || []).map(t => `
    <div class="trade-item notable">
      <span class="ti-text">${esc(t.teamA)} ↔ ${esc(t.teamB)}</span>
      <span class="ti-detail">${esc(t.fromAToB)}（${t.ovrA}）↔ ${esc(t.fromBToA)}（${t.ovrB}）</span>
    </div>`).join('') || '<div class="empty">休赛期暂无重磅交易</div>';
  const retHTML = (o.retirements || []).map(r => `
    <div class="retire-item">
      <span class="ri-name">${esc(r.name)}</span>
      <span class="ri-ovr">OVR ${r.ovr}</span>
      <span class="ri-text">宣布退役，告别赛场</span>
    </div>`).join('') || '<div class="empty">没有明星退役</div>';
  return shell(`
    <div class="page-head">
      <h2>🏖️ 休赛期</h2>
    </div>
    <div class="scroll">
      <div class="offseason-hero">
        <div class="oh-team">${team ? esc(team.zh) : ''}</div>
        <div class="oh-sub">赛季结束 · 交易窗口与退役公告</div>
      </div>
      <div class="label" style="margin-top:14px">📢 休赛期交易</div>
      <div class="trade-list">${tradesHTML}</div>
      <div class="label" style="margin-top:14px">👋 明星退役</div>
      <div class="retire-list">${retHTML}</div>
      ${(o.nationalGames || []).length ? `
      <div class="label" style="margin-top:14px">🏀 国家队热身赛 <span class="muted-2">（代表你的国家参赛）</span></div>
      <div class="nat-list">
        ${o.nationalGames.map(g => `
          <button class="nat-game-row" onclick="BL.enterNationalGame(${o.nationalGames.indexOf(g)})">
            <span class="ng-flag">${g.oppFlag}</span>
            <span class="ng-name">${esc(COUNTRIES[s.player.nationalityCode].flag)} 你 vs ${g.oppZh}</span>
            <span class="ng-go">🎮 进入比赛 →</span>
          </button>`).join('')}
      </div>` : ''}
      ${(o.rookies || []).length ? `
      <div class="label" style="margin-top:14px">🎓 选秀新秀</div>
      <div class="rookie-list">
        ${o.rookies.map(r => `
          <div class="rookie-item ${r.isStar ? 'star' : ''}">
            <span class="rk-pick">#${r.pick}</span>
            <span class="rk-name">${esc(r.name)}</span>
            <span class="rk-pos">${r.pos}</span>
            <span class="rk-ovr num">${r.ovr}</span>
            ${r.isStar ? '<span class="rk-star">🌟 天才</span>' : ''}
          </div>`).join('')}
      </div>` : ''}
      <div style="height:14px"></div>
      <button class="btn btn-primary btn-lg btn-block" onclick="BL.dismissOffseason()">进入新赛季 →</button>
      <div style="height:24px"></div>
    </div>
  `);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('已复制'); } catch { toast('复制失败'); }
  document.body.removeChild(ta);
}

// 键盘继续：空格/回车轻触继续（赛季页不自动跳，需玩家手动模拟比赛）
document.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && app.view === 'career' && !app.modal) {
    if (app.state?.season && !app.state.season.done) return;
    e.preventDefault();
    if (app.state?.currentEvent && !app.receipt) return;
    BL.next();
  }
});

render();

// 启动时预加载球员池（供建球员与单场模拟）
window.__poolDebug = { state: 'loading' };
loadPool().then((pool) => {
  app.pool = pool;
  app.poolLoaded = true;
  E.setNbaPool(pool);
  window.__poolDebug = { state: 'loaded', teams: Object.keys(pool || {}).length };
}).catch((e) => {
  app.poolLoaded = false;
  window.__poolDebug = { state: 'failed', err: String(e && e.message || e) };
});

// 调试钩子（供自动化测试使用）
window.__testState = () => ({
  view: app.view,
  receipt: app.receipt,
  pendingBanner: app.pendingBanner,
  lastBanner: !!app.lastBanner,
  phase: app.state ? app.state.phase : null,
  stage: app.state ? app.state.stage : null,
  age: app.state ? app.state.player.age : null,
  currentEvent: app.state && app.state.currentEvent ? app.state.currentEvent.type : null,
  eventOptions: app.state && app.state.currentEvent ? app.state.currentEvent.options.length : 0,
  lastOutcome: app.state && app.state.lastEventOutcome ? app.state.lastEventOutcome.text : null,
});
