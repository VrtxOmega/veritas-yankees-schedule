/* --- live.js - Pitch-by-pitch Yankees game tracker ---------------------- */

import { allGames, getGamesForToday, getLiveGames, getGameStatus } from './schedule.js';
import { fetchLiveGame, getBroadcastGroups, TEAM_ID } from './api.js';
import { formatLocalTime, getLocalTimezone } from './utils.js';

const PITCHCAST_POLL_MS = 15000;
let pitchCastTimer = null;

export function startPitchCastPolling() {
  stopPitchCastPolling();
  refreshPitchCast();
  pitchCastTimer = setInterval(refreshPitchCast, PITCHCAST_POLL_MS);
}

export function stopPitchCastPolling() {
  if (pitchCastTimer) {
    clearInterval(pitchCastTimer);
    pitchCastTimer = null;
  }
}

export async function refreshPitchCast() {
  const container = document.getElementById('pitchCastContent');
  const statusEl = document.getElementById('pitchCastStatus');
  if (!container) return;

  const focusGame = findFocusGame();
  if (!focusGame) {
    container.innerHTML = renderEmpty('No Yankees game found');
    if (statusEl) statusEl.textContent = 'IDLE';
    return;
  }

  const status = getGameStatus(focusGame);
  if (status !== 'LIVE') {
    container.innerHTML = renderIdle(focusGame, status);
    if (statusEl) statusEl.textContent = status === 'FINAL' ? 'FINAL' : 'NEXT';
    return;
  }

  if (statusEl) statusEl.textContent = 'LIVE';
  container.innerHTML = `
    <div class="pitchcast-loading">
      <div class="loading-spinner-sm"></div>
      <span>Connecting to MLB live feed...</span>
    </div>
  `;

  const result = await fetchLiveGame(focusGame.gamePk);
  if (!result.ok) {
    container.innerHTML = renderEmpty('Live feed unavailable');
    return;
  }

  syncGameFromLiveFeed(focusGame, result.data);
  container.innerHTML = renderPitchCast(result.data, focusGame);
}

function findFocusGame() {
  const live = getLiveGames();
  if (live.length) return live[0];

  const today = getGamesForToday();
  if (today.length) return today[0];

  const now = Date.now();
  return allGames
    .filter(g => involvesYankees(g) && new Date(g.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function syncGameFromLiveFeed(game, feed) {
  const status = feed?.gameData?.status;
  const linescore = feed?.liveData?.linescore;
  if (!linescore) return;

  const homeRuns = linescore.teams?.home?.runs;
  const awayRuns = linescore.teams?.away?.runs;
  if (homeRuns !== undefined) game.homeTeam.score = homeRuns;
  if (awayRuns !== undefined) game.awayTeam.score = awayRuns;
  if (status) {
    game.status = status;
    game.statusCode = status.statusCode || game.statusCode;
    game.detailedState = status.detailedState || game.detailedState;
    game.abstractState = status.abstractGameState || game.abstractState;
  }
  game.liveStatus = {
    inning: linescore.currentInningOrdinal,
    inningHalf: linescore.inningHalf,
    balls: linescore.balls,
    strikes: linescore.strikes,
    outs: linescore.outs,
    lastUpdated: new Date().toISOString(),
  };
}

function renderPitchCast(feed, game) {
  const linescore = feed?.liveData?.linescore || {};
  const plays = feed?.liveData?.plays || {};
  const currentPlay = plays.currentPlay || plays.allPlays?.[plays.allPlays.length - 1] || {};
  const matchup = currentPlay.matchup || {};
  const lastDesc = currentPlay.result?.description || '';
  const pitchRows = collectRecentPitches(plays, 8);
  const side = yankeesSide(game);
  const score = scoreFor(game, linescore);

  return `
    <div class="pitchcast-live">
      <div class="pitchcast-scoreline">
        <div class="pitchcast-team ${score.nyy > score.opp ? 'leading' : ''}">
          <span>NYY</span><strong>${score.nyy}</strong>
        </div>
        <span class="pitchcast-score-sep">-</span>
        <div class="pitchcast-team ${score.opp > score.nyy ? 'leading' : ''}">
          <span>${escapeHtml(side.opp.abbreviation || 'OPP')}</span><strong>${score.opp}</strong>
        </div>
      </div>

      <div class="pitchcast-state">
        <span>${escapeHtml(linescore.inningHalf || '')} ${escapeHtml(linescore.currentInningOrdinal || '')}</span>
        <span>B ${safeNumber(linescore.balls)} / S ${safeNumber(linescore.strikes)} / O ${safeNumber(linescore.outs)}</span>
      </div>

      ${renderBaseState(linescore.offense)}

      <div class="pitchcast-matchup">
        <div><span>BAT</span>${escapeHtml(matchup.batter?.fullName || 'On deck')}</div>
        <div><span>PIT</span>${escapeHtml(matchup.pitcher?.fullName || 'Pitcher TBD')}</div>
      </div>

      ${lastDesc ? `<div class="pitchcast-last"><span>LAST</span>${escapeHtml(lastDesc)}</div>` : ''}

      <div class="pitchcast-feed">
        <div class="pitchcast-feed-title">RECENT PITCHES</div>
        ${pitchRows.length ? pitchRows.map(renderPitchRow).join('') : '<div class="pitchcast-empty-row">Pitch data has not started yet</div>'}
      </div>
    </div>
  `;
}

function renderIdle(game, status) {
  const side = yankeesSide(game);
  const groups = getBroadcastGroups(game);
  const radio = groups.radio[0]?.name || 'Radio TBD';
  const tv = groups.tv[0]?.name || 'TV TBD';

  if (status === 'FINAL') {
    const score = scoreFor(game);
    return `
      <div class="pitchcast-idle">
        <div class="pitchcast-idle-kicker">FINAL</div>
        <div class="pitchcast-idle-matchup">NYY ${score.nyy} - ${side.opp.abbreviation || 'OPP'} ${score.opp}</div>
        <div class="pitchcast-idle-sub">${escapeHtml(game.detailedState || 'Final')}</div>
      </div>
    `;
  }

  return `
    <div class="pitchcast-idle">
      <div class="pitchcast-idle-kicker">NEXT GAME</div>
      <div class="pitchcast-idle-matchup">NYY ${side.label} ${escapeHtml(side.opp.abbreviation || 'OPP')}</div>
      <div class="pitchcast-idle-sub">${formatLocalTime(game.date)} ${getLocalTimezone()} - ${escapeHtml(game.venue?.name || 'Venue TBD')}</div>
      <div class="pitchcast-broadcasts">
        <span>TV ${escapeHtml(tv)}</span>
        <span>RADIO ${escapeHtml(radio)}</span>
      </div>
    </div>
  `;
}

function renderBaseState(offense = {}) {
  return `
    <div class="pitchcast-bases" aria-label="Base runners">
      <span class="${offense.second ? 'occupied' : ''}">2B</span>
      <span class="${offense.third ? 'occupied' : ''}">3B</span>
      <span class="${offense.first ? 'occupied' : ''}">1B</span>
    </div>
  `;
}

function collectRecentPitches(plays, limit) {
  const rows = [];
  const allPlays = plays?.allPlays || [];

  allPlays.slice(-12).forEach(play => {
    (play.playEvents || []).forEach(event => {
      if (!event.isPitch) return;
      rows.push({
        inning: play.about?.inning,
        half: play.about?.halfInning,
        batter: play.matchup?.batter?.fullName || '',
        call: event.details?.description || event.details?.call?.description || 'Pitch',
        pitchType: event.details?.type?.description || event.details?.type?.code || 'Pitch',
        speed: event.pitchData?.startSpeed,
        count: event.count,
        isInPlay: !!event.details?.isInPlay,
        isStrike: !!event.details?.isStrike,
        isBall: !!event.details?.isBall,
      });
    });
  });

  return rows.slice(-limit).reverse();
}

function renderPitchRow(pitch) {
  const cls = pitch.isInPlay ? 'in-play' : pitch.isStrike ? 'strike' : pitch.isBall ? 'ball' : '';
  const speed = pitch.speed ? `${Math.round(pitch.speed)} mph` : '--';
  const count = pitch.count ? `${pitch.count.balls}-${pitch.count.strikes}` : '--';
  return `
    <div class="pitch-row ${cls}">
      <div class="pitch-main">
        <span class="pitch-call">${escapeHtml(pitch.call)}</span>
        <span class="pitch-type">${escapeHtml(pitch.pitchType)}</span>
      </div>
      <div class="pitch-meta">
        <span>${speed}</span>
        <span>${count}</span>
      </div>
    </div>
  `;
}

function renderEmpty(message) {
  return `<div class="pitchcast-empty">${escapeHtml(message)}</div>`;
}

function scoreFor(game, linescore = null) {
  const home = linescore?.teams?.home?.runs ?? game.homeTeam.score ?? 0;
  const away = linescore?.teams?.away?.runs ?? game.awayTeam.score ?? 0;
  const nyyHome = game.homeTeam.id === TEAM_ID;
  return {
    nyy: nyyHome ? home : away,
    opp: nyyHome ? away : home,
  };
}

function yankeesSide(game) {
  const isHome = game.homeTeam.id === TEAM_ID;
  return {
    label: isHome ? 'vs' : '@',
    team: isHome ? game.homeTeam : game.awayTeam,
    opp: isHome ? game.awayTeam : game.homeTeam,
  };
}

function involvesYankees(game) {
  return game.homeTeam.id === TEAM_ID || game.awayTeam.id === TEAM_ID;
}

function safeNumber(value) {
  return value ?? '-';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
