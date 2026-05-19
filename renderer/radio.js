/* --- radio.js - Yankees radio booth ------------------------------------- */

import { allGames, getGamesForToday, getLiveGames, getGameStatus } from './schedule.js';
import { getBroadcastGroups, TEAM_ID } from './api.js';
import { formatLocalTime, getLocalTimezone } from './utils.js';

const WFAN_STREAM = 'https://live.amperwave.net/direct/audacy-wfanamaac-imc';
const STATION_LINKS = [
  { id: 'wfan', label: 'WFAN', url: 'https://www.audacy.com/stations/wfan' },
  { id: 'wfan2', label: 'WFAN2', url: 'https://www.audacy.com/stations/wfan2' },
  { id: 'wado', label: 'WADO', url: 'https://www.audacy.com/stations/wado' },
  { id: 'howto', label: 'HOW TO', url: 'https://www.audacy.com/wfan/how-to-listen-to-yankees-games' },
];

let audio = null;
let wired = false;

export function initRadioBooth() {
  if (wired) return;

  ensureAudio();
  document.getElementById('radioPlayBtn')?.addEventListener('click', playWfan);
  document.getElementById('radioStopBtn')?.addEventListener('click', stopRadio);
  wireStationLinks();

  wired = true;
  refreshRadioBooth();
}

export function refreshRadioBooth() {
  const context = document.getElementById('radioGameContext');
  const links = document.getElementById('radioLinks');
  if (!context) return;

  const game = findFocusGame();
  context.innerHTML = game ? renderGameContext(game) : renderNoGame();

  if (links && !links.dataset.rendered) {
    links.innerHTML = STATION_LINKS.map(link => `
      <button class="radio-link-btn" id="radioOpen-${link.id}" type="button">${escapeHtml(link.label)}</button>
    `).join('');
    links.dataset.rendered = 'true';
    wireStationLinks();
  }
}

async function playWfan() {
  ensureAudio();
  setRadioStatus('Connecting to WFAN...', 'pending');

  if (audio.src !== WFAN_STREAM) {
    audio.src = WFAN_STREAM;
    audio.load();
  }

  try {
    await audio.play();
    setRadioStatus('Playing WFAN live', 'playing');
    setPlayingState(true);
  } catch (e) {
    console.warn('[radio] WFAN playback failed:', e);
    setRadioStatus('Direct stream blocked. Open WFAN.', 'error');
    setPlayingState(false);
  }
}

function stopRadio() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setRadioStatus('Stopped', 'idle');
  setPlayingState(false);
}

function ensureAudio() {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = 'none';
  audio.crossOrigin = 'anonymous';
  audio.addEventListener('playing', () => {
    setRadioStatus('Playing WFAN live', 'playing');
    setPlayingState(true);
  });
  audio.addEventListener('pause', () => {
    if (!audio.src) return;
    setRadioStatus('Paused', 'idle');
    setPlayingState(false);
  });
  audio.addEventListener('error', () => {
    setRadioStatus('Direct stream unavailable. Open WFAN.', 'error');
    setPlayingState(false);
  });
  return audio;
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

function renderGameContext(game) {
  const status = getGameStatus(game);
  const side = yankeesSide(game);
  const groups = getBroadcastGroups(game);
  const radios = groups.radio.length ? groups.radio : [{ name: 'WFAN', fullName: 'WFAN 101.9 FM / 660 AM' }];
  const kicker = status === 'LIVE' ? 'LIVE GAME' : status === 'FINAL' ? 'LAST GAME' : 'NEXT GAME';
  const meta = status === 'LIVE'
    ? (game.detailedState || 'In Progress')
    : `${formatLocalTime(game.date)} ${getLocalTimezone()} - ${game.venue?.name || 'Venue TBD'}`;

  return `
    <div class="radio-game">
      <div class="radio-game-kicker">${kicker}</div>
      <div class="radio-matchup">NYY ${side.label} ${escapeHtml(side.opp.abbreviation || 'OPP')}</div>
      <div class="radio-meta">${escapeHtml(meta)}</div>
      <div class="radio-station-row">
        ${radios.slice(0, 4).map(r => `<span title="${escapeAttr(r.fullName || r.name)}">${escapeHtml(r.name)}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderNoGame() {
  return `
    <div class="radio-game">
      <div class="radio-game-kicker">WFAN LIVE</div>
      <div class="radio-matchup">Yankees Radio</div>
      <div class="radio-meta">Official station stream and station links</div>
    </div>
  `;
}

function wireStationLinks() {
  STATION_LINKS.forEach(link => {
    document.getElementById(`radioOpen-${link.id}`)?.addEventListener('click', () => openExternal(link.url));
  });
}

function setRadioStatus(message, state = 'idle') {
  const status = document.getElementById('radioStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function setPlayingState(isPlaying) {
  document.getElementById('radioPlayBtn')?.classList.toggle('is-playing', isPlaying);
  document.getElementById('radioStopBtn')?.toggleAttribute('disabled', !isPlaying);
}

function openExternal(url) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function yankeesSide(game) {
  const isHome = game.homeTeam.id === TEAM_ID;
  return {
    label: isHome ? 'vs' : '@',
    opp: isHome ? game.awayTeam : game.homeTeam,
  };
}

function involvesYankees(game) {
  return game.homeTeam.id === TEAM_ID || game.awayTeam.id === TEAM_ID;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(str) { return escapeHtml(str); }
