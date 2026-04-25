/* ─── panel.js — Tabbed panel: FORM / TONIGHT / LIVE ───────────────────── */
//
// Lives in the bottom-left sidebar slot. Three tabs swap content in place:
//   • FORM    — Last 5 W/L pills + most recent game summary
//   • TONIGHT — Today's game (or next future game) with venue + pitchers
//   • LIVE    — Current inning / count / score / last play, polled while open
//
// The LIVE tab gets a pulsing red dot whenever a game is actually in
// progress, so you can tell from the form/tonight tab to switch over.

import { allGames, getLiveGames, getGameStatus } from './schedule.js';
import { fetchLiveGame } from './api.js';
import { MONTHS_SHORT, DAYS_SHORT, formatTime } from './utils.js';

const TABS = ['form', 'tonight', 'live'];
const LIVE_POLL_MS = 20000;

let activeTab = 'form';
let livePollTimer = null;

// ─── Public API ─────────────────────────────────────────────────────────
export function initPanel() {
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  setActiveTab('form');
  updateLiveBadge();
}

/** Re-render the active tab. Call after schedule data changes. */
export function refreshPanel() {
  renderTab(activeTab);
  updateLiveBadge();
}

// ─── Tab switching ─────────────────────────────────────────────────────
function setActiveTab(name) {
  if (!TABS.includes(name)) return;
  activeTab = name;
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  // Stop live polling whenever we leave the live tab; restart only when
  // we render the live tab and a game is actually in progress.
  stopLivePolling();
  renderTab(name);
}

function renderTab(name) {
  const c = document.getElementById('panelContent');
  if (!c) return;
  if (name === 'form')         c.innerHTML = renderForm();
  else if (name === 'tonight') c.innerHTML = renderTonight();
  else if (name === 'live')    renderLive(c);
}

// ─── Tab: FORM (last 5 results) ────────────────────────────────────────
function renderForm() {
  // Grab last 5 completed games (newest first), then reverse so the pill
  // strip reads oldest-to-newest left-to-right (more intuitive for momentum).
  const finals = allGames
    .filter(g => isFinal(g))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (finals.length === 0) {
    return `<div class="panel-empty">
      <div class="panel-empty-title">No completed games yet</div>
      <div class="panel-empty-sub">Form will populate once games start</div>
    </div>`;
  }

  const ordered = [...finals].reverse();
  const pills = ordered.map(g => {
    const me = nyySide(g);
    const won = me.team.isWinner;
    const cls = won ? 'win' : 'loss';
    const tooltip = `${formatShort(g.date)} ${me.label} ${me.opp.abbreviation}: ${me.team.score ?? 0}-${me.opp.score ?? 0}`;
    return `<div class="form-pill ${cls}" title="${escapeAttr(tooltip)}">${won ? 'W' : 'L'}</div>`;
  }).join('');

  // Recent-streak summary using only contiguous most-recent results.
  const streak = computeStreak(finals);
  const streakLabel = streak.count > 0
    ? `<span class="form-streak-${streak.kind === 'W' ? 'w' : 'l'}">${streak.kind}${streak.count}</span>`
    : '';

  // Most recent game line (finals[0] is newest)
  const last = finals[0];
  const lastSide = nyySide(last);
  const lastWon = lastSide.team.isWinner;

  return `
    <div class="form-card">
      <div class="form-pill-row">
        ${pills}
        ${streakLabel ? `<div class="form-streak">${streakLabel}</div>` : ''}
      </div>
      <div class="form-recent">
        <span class="form-recent-date">${formatShort(last.date)}</span>
        <span class="form-recent-vs">${lastSide.label} ${lastSide.opp.abbreviation}</span>
        <span class="form-recent-result ${lastWon ? 'win' : 'loss'}">
          ${lastWon ? 'W' : 'L'} ${lastSide.team.score ?? 0}-${lastSide.opp.score ?? 0}
        </span>
      </div>
    </div>
  `;
}

function computeStreak(games) {
  // games[] is newest-first. Walk until streak breaks.
  if (!games.length) return { kind: '', count: 0 };
  const first = nyySide(games[0]).team.isWinner;
  let count = 1;
  for (let i = 1; i < games.length; i++) {
    if (nyySide(games[i]).team.isWinner === first) count++;
    else break;
  }
  return { kind: first ? 'W' : 'L', count };
}

// ─── Tab: TONIGHT (next game card) ─────────────────────────────────────
function renderTonight() {
  const now = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  // Today's NYY game first; otherwise next future NYY game.
  let game = allGames.find(g => g.dateStr === todayStr && involvesNYY(g));
  if (!game) {
    game = allGames
      .filter(g => involvesNYY(g) && new Date(g.date).getTime() >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  }

  if (!game) {
    return `<div class="panel-empty">
      <div class="panel-empty-title">No upcoming games</div>
    </div>`;
  }

  const isToday = game.dateStr === todayStr;
  const me = nyySide(game);
  const d = new Date(game.date);

  const dateLabel = isToday
    ? 'TONIGHT'
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const time = formatTime(game.date);

  // Probable pitchers: the schedule API can hydrate these but the field is
  // only populated within ~24h of first pitch. If absent, show TBD.
  const homePit = game.probablePitcher?.home;
  const awayPit = game.probablePitcher?.away;
  const pitNYY = me.label === 'vs' ? homePit : awayPit;
  const pitOpp = me.label === 'vs' ? awayPit : homePit;

  return `
    <div class="tonight-card">
      <div class="tonight-when">
        <span class="tonight-date">${dateLabel}</span>
        <span class="tonight-time">${time} ET</span>
      </div>
      <div class="tonight-matchup">
        <span class="tonight-team-nyy">NYY</span>
        <span class="tonight-vs">${me.label}</span>
        <span class="tonight-team-opp">${me.opp.abbreviation}</span>
      </div>
      <div class="tonight-venue">${game.venue?.name || 'Venue TBD'}${game.venue?.city ? ' · ' + game.venue.city : ''}</div>
      <div class="tonight-pitchers">
        <div class="pitcher-row">
          <span class="pitcher-team">NYY</span>
          <span class="pitcher-name">${formatPitcher(pitNYY)}</span>
        </div>
        <div class="pitcher-row">
          <span class="pitcher-team">${me.opp.abbreviation}</span>
          <span class="pitcher-name">${formatPitcher(pitOpp)}</span>
        </div>
      </div>
      ${(!homePit && !awayPit)
        ? '<div class="tonight-note">Probable pitchers post day-of</div>'
        : ''}
    </div>
  `;
}

function formatPitcher(p) {
  if (!p) return '<span class="pitcher-tbd">TBD</span>';
  // Hydrated probable pitchers are objects with fullName + maybe stats.
  const name = p.fullName || p.name || 'TBD';
  return name;
}

// ─── Tab: LIVE (in-game tracker) ───────────────────────────────────────
async function renderLive(container) {
  const liveGames = getLiveGames();
  if (liveGames.length === 0) {
    container.innerHTML = renderLiveIdle();
    return;
  }

  // Show loading state while we fetch the live feed for the first time.
  container.innerHTML = `
    <div class="live-card live-card-loading">
      <div class="loading-spinner-sm"></div>
      <span>Connecting to live feed…</span>
    </div>
  `;

  await refreshLiveFeed(container, liveGames[0]);
  startLivePolling(container, liveGames[0].gamePk);
}

async function refreshLiveFeed(container, game) {
  const result = await fetchLiveGame(game.gamePk);
  if (!result.ok) {
    container.innerHTML = `<div class="panel-empty"><div class="panel-empty-title">Live feed unavailable</div></div>`;
    return;
  }
  container.innerHTML = renderLiveCard(result.data, game);
}

function startLivePolling(container, gamePk) {
  stopLivePolling();
  livePollTimer = setInterval(async () => {
    // If we left the live tab, stop.
    if (activeTab !== 'live') { stopLivePolling(); return; }
    // If the game is no longer live, swap to idle state.
    const stillLive = getLiveGames().some(g => g.gamePk === gamePk);
    if (!stillLive) {
      container.innerHTML = renderLiveIdle();
      stopLivePolling();
      return;
    }
    const game = allGames.find(g => g.gamePk === gamePk);
    if (game) await refreshLiveFeed(container, game);
  }, LIVE_POLL_MS);
}

function stopLivePolling() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

function renderLiveCard(feed, game) {
  const linescore = feed?.liveData?.linescore || {};
  const plays     = feed?.liveData?.plays || {};
  const gameData  = feed?.gameData || {};

  const inningOrd  = linescore.currentInningOrdinal || '—';
  const inningHalf = linescore.inningHalf || '';
  const balls      = linescore.balls ?? '—';
  const strikes    = linescore.strikes ?? '—';
  const outs       = linescore.outs ?? '—';

  const homeRuns = linescore.teams?.home?.runs ?? 0;
  const awayRuns = linescore.teams?.away?.runs ?? 0;

  const isHome  = game.homeTeam.id === 147;
  const nyyRuns = isHome ? homeRuns : awayRuns;
  const oppRuns = isHome ? awayRuns : homeRuns;
  const oppAbbr = isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation;
  const oppCol  = teamColor(oppAbbr);

  const allPlays = plays?.allPlays || [];
  const lastPlay = allPlays[allPlays.length - 1];
  const lastDesc = lastPlay?.result?.description || '';

  // Who's currently leading
  const nyyLead = nyyRuns > oppRuns;
  const tie = nyyRuns === oppRuns;

  return `
    <div class="live-card">
      <div class="live-pulse">
        <span class="live-pulse-dot"></span>
        <span class="live-pulse-text">LIVE · ${inningHalf} ${inningOrd}</span>
      </div>
      <div class="live-score-row">
        <div class="live-side ${nyyLead && !tie ? 'leading' : ''}">
          <span class="live-side-team" style="color:#D4AF37">NYY</span>
          <span class="live-side-score">${nyyRuns}</span>
        </div>
        <span class="live-dash">·</span>
        <div class="live-side ${!nyyLead && !tie ? 'leading' : ''}">
          <span class="live-side-team" style="color:${oppCol}">${oppAbbr}</span>
          <span class="live-side-score">${oppRuns}</span>
        </div>
      </div>
      <div class="live-count">
        <div class="count-pill"><span class="count-label">B</span><span class="count-value">${balls}</span></div>
        <div class="count-pill"><span class="count-label">S</span><span class="count-value">${strikes}</span></div>
        <div class="count-pill"><span class="count-label">O</span><span class="count-value">${outs}</span></div>
      </div>
      ${lastDesc ? `<div class="live-last-play"><span class="live-last-label">LAST</span> ${escapeHtml(lastDesc)}</div>` : ''}
    </div>
  `;
}

function renderLiveIdle() {
  // No game in progress — show next future NYY game so the tab is still useful.
  const now = Date.now();
  const next = allGames
    .filter(g => involvesNYY(g) && new Date(g.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  if (!next) {
    return `<div class="panel-empty">
      <div class="panel-empty-title">No game in progress</div>
      <div class="panel-empty-sub">No upcoming games scheduled</div>
    </div>`;
  }

  const d = new Date(next.date);
  const me = nyySide(next);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return `
    <div class="live-idle">
      <div class="live-idle-status">No game in progress</div>
      <div class="live-idle-next-label">NEXT</div>
      <div class="live-idle-next">
        <span class="live-idle-date">${date}</span>
        <span class="live-idle-time">${formatTime(next.date)} ET</span>
      </div>
      <div class="live-idle-matchup">${me.label} ${me.opp.abbreviation} · ${next.venue?.name || 'TBD'}</div>
    </div>
  `;
}

// ─── Live badge on the LIVE tab ────────────────────────────────────────
function updateLiveBadge() {
  const tab = document.querySelector('.panel-tab[data-tab="live"]');
  if (!tab) return;
  tab.classList.toggle('has-live', getLiveGames().length > 0);
}

// ─── Helpers ──────────────────────────────────────────────────────────
function involvesNYY(g) {
  return g.homeTeam.id === 147 || g.awayTeam.id === 147;
}

function isFinal(g) {
  return g.abstractState === 'Final'
      || g.detailedState === 'Final'
      || g.status === 'F'
      || g.status === 'FT'
      || getGameStatus(g) === 'FINAL';
}

function nyySide(game) {
  const isHome = game.homeTeam.id === 147;
  return {
    isHome,
    label: isHome ? 'vs' : '@',
    team:  isHome ? game.homeTeam : game.awayTeam,
    opp:   isHome ? game.awayTeam : game.homeTeam,
  };
}

function formatShort(dateStr) {
  const d = new Date(dateStr);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function teamColor(abbr) {
  const map = {
    BOS:'#C62A3A', TOR:'#134A8E', BAL:'#DF4601', TB:'#092D5B',
    CLE:'#0C2340', CWS:'#000000', KC:'#004687', MIN:'#002B5B',
    DET:'#0C2340', STL:'#C41E3A', CHC:'#0E3386', NYM:'#003E8C',
    ATL:'#0C2340', LAD:'#005A9C',
  };
  return map[abbr] || '#999999';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
