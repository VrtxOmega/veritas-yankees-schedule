/* ─── scores.js — Live score polling + updates ─────────────────────────── */

import { getLiveGames, allGames } from './schedule.js';
import { fetchLiveGame } from './api.js';
import { getGameStatus } from './utils.js';

const POLL_INTERVAL = 30000; // 30 seconds
let pollTimer = null;
let onScoreUpdateCallback = null;

export function startScorePolling(onUpdate) {
  onScoreUpdateCallback = onUpdate;
  pollTimer = setInterval(pollLiveGames, POLL_INTERVAL);
  // Fire immediately
  pollLiveGames();
}

export function stopScorePolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollLiveGames() {
  const liveGames = getLiveGames();
  if (liveGames.length === 0) return;

  const updates = [];
  await Promise.allSettled(
    liveGames.map(async (game) => {
      const result = await fetchLiveGame(game.gamePk);
      if (!result.ok) return;

      const data = result.data;
      const liveData = data.liveData || {};
      const boxscore = liveData.boxscore || {};
      const teams = boxscore.teams || {};

      const homeTeam = teams.home?.team;
      const awayTeam = teams.away?.team;

      if (!homeTeam || !awayTeam) return;

      // Update score in allGames
      const gameIndex = allGames.findIndex(g => g.gamePk === game.gamePk);
      if (gameIndex === -1) return;

      const oldHomeScore = allGames[gameIndex].homeTeam.score;
      const oldAwayScore = allGames[gameIndex].awayTeam.score;
      const newHomeScore = teams.home?.runs;
      const newAwayScore = teams.away?.runs;

      if (newHomeScore !== undefined && newAwayScore !== undefined) {
        allGames[gameIndex].homeTeam.score = newHomeScore;
        allGames[gameIndex].awayTeam.score = newAwayScore;
        allGames[gameIndex].status = data.status?.statusCode;
        allGames[gameIndex].detailedState = data.status?.detailedState;

        const scoreChanged = oldHomeScore !== newHomeScore || oldAwayScore !== newAwayScore;
        if (scoreChanged) {
          updates.push({
            gamePk: game.gamePk,
            homeScore: newHomeScore,
            awayScore: newAwayScore,
            inning: data.status?.abstractGameState,
            detailedState: data.status?.detailedState,
          });
        }
      }
    })
  );

  if (updates.length > 0 && onScoreUpdateCallback) {
    onScoreUpdateCallback(updates);
  }
}

// ─── Today hero card rendering with live update ────────────────────────────
export function renderTodayHero(games) {
  const container = document.getElementById('todayContent');
  const dateEl = document.getElementById('todayDate');
  const today = new Date();
  dateEl.textContent = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  if (games.length === 0) {
    // Find next upcoming game — must be strictly after "now", not just any
    // UPCOMING game (placeholder games at the start of the year would otherwise
    // win the sort even though they're already in the past).
    const now = Date.now();
    const next = allGames
      .filter(g => getGameStatus(g) === 'UPCOMING' && new Date(g.date).getTime() >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (next) {
      container.innerHTML = renderNoGameToday(next);
    } else {
      container.innerHTML = `
        <div class="no-game">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>No game today</p>
          <p class="no-game-sub">Season opens March 27</p>
        </div>`;
    }
    return;
  }

  // Show the first relevant game (NYY game)
  const nyGame = games.find(g =>
    g.homeTeam.id === 147 || g.awayTeam.id === 147
  ) || games[0];

  container.innerHTML = renderTodayGameCard(nyGame);
}

function renderNoGameToday(nextGame) {
  const isNYYHome = nextGame.homeTeam.id === 147;
  const opponent = isNYYHome ? nextGame.awayTeam : nextGame.homeTeam;
  const d = new Date(nextGame.date);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });

  return `
    <div class="today-game-card">
      <div class="today-teams">
        <div class="today-team">
          <div class="today-team-logo">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="#003087"/>
              <text x="20" y="25" text-anchor="middle" font-family="Oswald,sans-serif"
                    font-size="16" font-weight="700" fill="#fff">NYY</text>
            </svg>
          </div>
          <span class="today-team-name">YANKEES</span>
        </div>
        <div style="text-align:center; flex:1">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:2px;">NEXT UP</div>
          <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--gold-primary);">${month} ${day}</div>
        </div>
        <div class="today-team">
          <div class="today-team-logo">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="#555"/>
              <text x="20" y="25" text-anchor="middle" font-family="Oswald,sans-serif"
                    font-size="12" font-weight="700" fill="#999">${opponent.abbreviation}</text>
            </svg>
          </div>
          <span class="today-team-name">${opponent.abbreviation}</span>
        </div>
      </div>
      <div class="today-time" style="margin-top:8px">${d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  `;
}

function renderTodayGameCard(game) {
  const isNYYHome = game.homeTeam.id === 147;
  const nyyTeam = isNYYHome ? game.homeTeam : game.awayTeam;
  const oppTeam = isNYYHome ? game.awayTeam : game.homeTeam;
  const nyyScore = nyyTeam.score ?? 0;
  const oppScore = oppTeam.score ?? 0;
  const status = getGameStatus(game);

  const nyyLogo = getNYYLogoSvg(nyyTeam.abbreviation);
  const oppLogo = getOppLogoSvg(oppTeam.abbreviation);

  let scoreHtml = '';
  if (status === 'FINAL') {
    const won = nyyTeam.isWinner;
    scoreHtml = `
      <div class="today-scoreboard">
        <div class="today-score ${won ? 'winner' : ''}">${nyyScore}</div>
        <div class="today-score-sep">-</div>
        <div class="today-score ${!won ? 'winner' : ''}">${oppScore}</div>
      </div>
      <div class="today-inning" style="color:var(--gold-dim)">FINAL${game.seriesInfo ? ` · GAME ${game.seriesInfo.gameNumber}` : ''}</div>`;
  } else if (status === 'LIVE') {
    const inning = game.detailedState || game.status;
    scoreHtml = `
      <div class="today-scoreboard">
        <div class="today-score">${nyyScore}</div>
        <div class="today-score-sep">-</div>
        <div class="today-score">${oppScore}</div>
      </div>
      <div class="today-inning">${inning}</div>`;
  } else {
    const d = new Date(game.date);
    scoreHtml = `
      <div class="today-scoreboard">
        <div class="today-score" style="font-size:20px;color:var(--text-muted)">${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}</div>
      </div>
      <div class="today-time">First Pitch · ET</div>`;
  }

  return `
    <div class="today-game-card">
      <div class="today-teams">
        <div class="today-team">
          <div class="today-team-logo">${nyyLogo}</div>
          <span class="today-team-name">${nyyTeam.abbreviation || 'NYY'}</span>
        </div>
        <div style="text-align:center; flex:1">${scoreHtml}</div>
        <div class="today-team">
          <div class="today-team-logo">${oppLogo}</div>
          <span class="today-team-name">${oppTeam.abbreviation || 'OPP'}</span>
        </div>
      </div>
      <div class="today-venue">${game.venue?.name || ''} · ${game.venue?.city || ''}</div>
    </div>
  `;
}

function getNYYLogoSvg(abbr) {
  const color = '#003087';
  return `<svg width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="20" fill="${color}"/>
    <text x="22" y="27" text-anchor="middle" font-family="Oswald,sans-serif"
          font-size="14" font-weight="700" fill="#fff">NYY</text>
  </svg>`;
}

function getOppLogoSvg(abbr) {
  const colors = {
    'BOS': '#C62A3A', 'TOR': '#134A8E', 'BAL': '#DF4601', 'TB': '#092D5B',
    'CLE': '#0C2340', 'CWS': '#000000', 'KC': '#004687', 'MIN': '#002B5B',
    'DET': '#0C2340', 'STL': '#C41E3A', 'CHC': '#0E3386', 'NYM': '#003E8C',
    'ATL': '#0C2340', 'LAD': '#005A9C', 'SFG': '#FD5A1E', 'PHI': '#284B93',
    'WSH': '#BD3039', 'MIA': '#00A3E0', 'MIL': '#0A2351', 'CIN': '#C6011F',
    'PIT': '#FDB827', 'COL': '#33006F', 'AZ': '#A13334', 'SD': '#002D62',
    'TEX': '#C0111F', 'HOU': '#EB6E1F', 'OAK': '#006847', 'SEA': '#005C5C',
    'LAA': '#BA0021',
  };
  const color = colors[abbr] || '#555555';
  return `<svg width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="20" fill="${color}"/>
    <text x="22" y="27" text-anchor="middle" font-family="Oswald,sans-serif"
          font-size="11" font-weight="700" fill="#fff">${abbr || 'OPP'}</text>
  </svg>`;
}

// Trigger score flip animation on a specific element
export function animateScoreFlip(gamePk) {
  const card = document.querySelector(`.game-card[data-pk="${gamePk}"]`);
  if (!card) return;
  const scoreEl = card.querySelector('.game-card-score');
  if (scoreEl) {
    scoreEl.classList.add('updated');
    setTimeout(() => scoreEl.classList.remove('updated'), 400);
  }
}
