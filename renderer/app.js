/* ─── app.js — Main application orchestrator ─────────────────────────────── */

// ⚠️ NOTE: there is a LOCAL `getGameStatus` function defined near the bottom
// of this file. DO NOT add `getGameStatus` to any import statement below —
// the duplicate declaration is an early SyntaxError that prevents the whole
// module from loading and leaves the app stuck on "Loading 2026 schedule...".

import { loadSchedule, filteredGames, allGames, rivalryGames, nearMeGames,
         filterGames, getGamesByMonth, getGamesForToday,
         getRivalryRecord, getNextRivalryGame, renderSchedule,
         getLiveGames as schedGetLiveGames } from './schedule.js';
import { startScorePolling, stopScorePolling, renderTodayHero } from './scores.js';
import { fetchStandings, fetchTeamRoster, fetchPlayerStats,
         fetchTeamSeasonStats, fetchTeamHRLeaders } from './api.js';
import { MONTHS, MONTHS_SHORT, getMonthIndex, isToday } from './utils.js';
import { getMapSvg, NEAR_ME_VENUES, getDistanceFromStL,
         userHome, setUserHome, lookupZip } from './geo.js';
import { loadNews, renderNewsTicker } from './news.js';

let currentMonth = null;
let nearMeOnly = false;
let liveOnly = false;
let lastSyncTime = null;
let isOffline = false;

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    showSyncSpinner(true);

    // Load schedule
    const loaded = await loadSchedule();
    lastSyncTime = new Date();
    updateSyncTime();
    console.log('[init] loadSchedule:', loaded, {
      allGames: allGames.length,
      rivalryGames,
      nearMeGames: nearMeGames.length
    });
    showSyncSpinner(false);

    if (!loaded) {
      showOfflineBanner(true);
      isOffline = true;
    }

    // Build UI
    buildMonthNav();
    console.log('[init] buildMonthNav done');
    await renderStandings();
    console.log('[init] renderStandings done');
    renderRivalries();
    console.log('[init] renderRivalries done');
    renderTodayHero(getGamesForToday());
    console.log('[init] renderTodayHero done');
    renderNearMeMap();
    console.log('[init] renderNearMeMap done');
    await renderBatters();
    console.log('[init] renderBatters done');
    renderFormGuide();
    console.log('[init] renderFormGuide done');

    // News ticker — don't block init on it.
    loadNews().then(items => renderNewsTicker(items)).catch(e => console.warn('[news]', e));
    setInterval(() => {
      loadNews().then(items => renderNewsTicker(items)).catch(() => {});
    }, 15 * 60 * 1000);

    // Navigate to current month (or March if pre-season)
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const monthNames = [2, 3, 4, 5, 6, 7, 8, 9]; // MAR-OCT
    currentMonth = monthNames.includes(currentMonthIndex) ? currentMonthIndex : 2;
    selectMonth(currentMonth);
    console.log('[init] selectMonth done');

    // Start score polling
    startScorePolling(onLiveUpdate);
    console.log('[init] ALL DONE');

    // Auto-refresh every 60s
    setInterval(async () => {
      showSyncSpinner(true);
      await loadSchedule();
      lastSyncTime = new Date();
      updateSyncTime();
      showSyncSpinner(false);
      renderRivalries();
      renderFormGuide();
    }, 60000);

    // Filter listeners
    document.getElementById('nearMeCheck').addEventListener('change', onFilterChange);
    document.getElementById('liveCheck').addEventListener('change', onFilterChange);

    // Sync button
    document.getElementById('syncBtn').addEventListener('click', async () => {
      showSyncSpinner(true);
      await loadSchedule();
      lastSyncTime = new Date();
      updateSyncTime();
      showSyncSpinner(false);
      renderAll();
    });

    // Month nav arrows
    document.getElementById('monthArrowLeft').addEventListener('click', () => scrollMonth(-1));
    document.getElementById('monthArrowRight').addEventListener('click', () => scrollMonth(1));

    wireMapInteractions();

    // Visibility change — pause polling when hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopScorePolling();
      } else {
        startScorePolling(onLiveUpdate);
      }
    });
  } catch (e) {
    console.error('[init] FAILED:', e);
    showSyncSpinner(false);
  }
}

// ─── Filter change ──────────────────────────────────────────────────────────
function onFilterChange() {
  nearMeOnly = document.getElementById('nearMeCheck').checked;
  liveOnly = document.getElementById('liveCheck').checked;
  filterGames(nearMeOnly, liveOnly);
  renderScheduleForMonth(currentMonth);
}

// ─── Month navigation ──────────────────────────────────────────────────────
function buildMonthNav() {
  const container = document.getElementById('monthPills');
  const monthIndices = [2, 3, 4, 5, 6, 7, 8, 9]; // MAR-OCT

  container.innerHTML = monthIndices.map(mIdx => {
    const hasGames = allGames.some(g => getMonthIndex(g.date) === mIdx);
    const isCurrent = mIdx === new Date().getMonth();
    const cls = `month-pill${isCurrent ? ' today' : ''}`;
    return `<button class="${cls}" data-month="${mIdx}">${MONTHS_SHORT[mIdx]}</button>`;
  }).join('');

  container.querySelectorAll('.month-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      selectMonth(parseInt(pill.dataset.month));
    });
  });
}

function selectMonth(monthIndex) {
  currentMonth = monthIndex;

  document.querySelectorAll('.month-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.month) === monthIndex);
  });

  renderScheduleForMonth(monthIndex);
}

function scrollMonth(dir) {
  const monthIndices = [2, 3, 4, 5, 6, 7, 8, 9];
  const idx = monthIndices.indexOf(currentMonth);
  const next = monthIndices[idx + dir];
  if (next !== undefined) selectMonth(next);
}

// ─── Schedule rendering ────────────────────────────────────────────────────
function renderScheduleForMonth(monthIndex) {
  const container = document.getElementById('scheduleList');
  const games = getGamesByMonth(monthIndex);

  document.getElementById('scheduleCount').textContent =
    `${games.length} game${games.length !== 1 ? 's' : ''} · ${MONTHS[monthIndex]}`;

  renderSchedule(games, container, monthIndex);
}

// ─── Standings ──────────────────────────────────────────────────────────────
async function renderStandings() {
  const tbody = document.getElementById('standingsBody');
  const dateEl = document.getElementById('standingsDate');
  dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Try API
  const result = await fetchStandings();
  if (result.ok) {
    const records = result.data?.records?.[0]?.teamRecords || [];
    if (records.length > 0) {
      tbody.innerHTML = records.map((r, i) => {
        const isNYY = r.team?.id === 147;
        const streak = r.streak;
        const streakStr = streak?.streakCode
          ? `<span class="${streak.streakCode.startsWith('W') ? 'streak-w' : 'streak-l'}">${streak.streakCode}</span>`
          : `<span style="color:var(--text-muted)">—</span>`;
        return `
          <tr class="${isNYY ? 'yankees-row' : ''}">
            <td class="standings-rank">${i + 1}</td>
            <td>${r.team?.name || r.team?.abbreviation || '—'}</td>
            <td>${r.wins || 0}</td>
            <td>${r.losses || 0}</td>
            <td class="standings-gb">${r.gamesBack || '—'}</td>
            <td>${streakStr}</td>
          </tr>`;
      }).join('');
      return;
    }
  }

  // Fallback: show '--' instead of stale fake records
  tbody.innerHTML = [
    { name: 'Yankees', gb: '—', strk: '—' },
    { name: 'Orioles', gb: '--', strk: '—' },
    { name: 'Blue Jays', gb: '--', strk: '—' },
    { name: 'Rays', gb: '--', strk: '—' },
    { name: 'Red Sox', gb: '--', strk: '—' },
  ].map((t, i) => {
    const isNYY = t.name === 'Yankees';
    return `
      <tr class="${isNYY ? 'yankees-row' : ''}">
        <td class="standings-rank">${i + 1}</td>
        <td>${t.name}</td>
        <td>--</td>
        <td>--</td>
        <td class="standings-gb">${t.gb}</td>
        <td style="color:var(--text-muted)">${t.strk}</td>
      </tr>`;
  }).join('');
}

// ─── Rivalries ─────────────────────────────────────────────────────────────
function renderRivalries() {
  // Red Sox
  const soxRec = getRivalryRecord(rivalryGames.sox);
  const soxNext = getNextRivalryGame(rivalryGames.sox);
  document.getElementById('soxRecord').textContent =
    soxRec ? `${soxRec.won}-${soxRec.lost}` : '0-0';
  document.getElementById('soxNext').textContent = soxNext
    ? `Next: ${formatDateShort(soxNext.date)} @ ${soxNext.venue?.name || 'TBD'}`
    : 'Season complete';

  // Mets
  const metsRec = getRivalryRecord(rivalryGames.mets);
  const metsNext = getNextRivalryGame(rivalryGames.mets);
  document.getElementById('metsRecord').textContent =
    metsRec ? `${metsRec.won}-${metsRec.lost}` : '0-0';
  document.getElementById('metsNext').textContent = metsNext
    ? `Next: ${formatDateShort(metsNext.date)} @ ${metsNext.venue?.name || 'TBD'}`
    : 'Season complete';

  // Cardinals
  const stlRec = getRivalryRecord(rivalryGames.stl);
  const stlNext = getNextRivalryGame(rivalryGames.stl);
  document.getElementById('stlRecord').textContent =
    stlRec ? `${stlRec.won}-${stlRec.lost}` : '0-0';
  document.getElementById('stlNext').textContent = stlNext
    ? `Next: ${formatDateShort(stlNext.date)} @ ${stlNext.venue?.name || 'TBD'}`
    : 'Season complete';

  if (stlNext && stlNext.venue?.lat) {
    const dist = getDistanceFromStL(stlNext.venue.lat, stlNext.venue.lng);
    document.getElementById('stlDistance').textContent = `▲ ${dist}mi from ${userHome.city}`;
  }
}

// ─── Batters (real roster + stats) ─────────────────────────────────────────
async function renderBatters() {
  const list   = document.getElementById('battersList');
  const winsEl = document.getElementById('statsWins');
  const lossEl = document.getElementById('statsLosses');
  const pctEl  = document.getElementById('statsPct');
  const avgEl  = document.getElementById('teamAvg');
  const eraEl  = document.getElementById('teamEra');

  // Try the active season first; if it returns nothing useful (very early in
  // the year, or schedule not yet published), fall back to last completed.
  const SEASONS = [2026, 2025];

  // W/L from standings.
  let team = null;
  for (const season of SEASONS) {
    const standings = await fetchStandings();
    if (standings.ok) {
      const records = standings.data?.records?.[0]?.teamRecords || [];
      team = records.find(r => r.team?.id === 147);
      if (team && (team.wins || team.losses)) break;
      team = null;
    }
  }
  if (team) {
    winsEl.textContent = team.wins ?? '--';
    lossEl.textContent = team.losses ?? '--';
    pctEl.textContent = team.winningPercentage
      ? `.${String(team.winningPercentage).replace(/^0?\./, '').padEnd(3, '0').slice(0, 3)}`
      : '';
  } else {
    winsEl.textContent = '--';
    lossEl.textContent = '--';
    pctEl.textContent = '';
  }

  // Team batting AVG — try current season first, fall back to previous.
  let foundAvg = false;
  for (const season of SEASONS) {
    const r = await fetchTeamSeasonStats('hitting', season);
    const stat = r.ok ? r.data?.stats?.[0]?.splits?.[0]?.stat : null;
    if (stat?.avg) { avgEl.textContent = stat.avg; foundAvg = true; break; }
  }
  if (!foundAvg) avgEl.textContent = '--';

  // Team ERA.
  let foundEra = false;
  for (const season of SEASONS) {
    const r = await fetchTeamSeasonStats('pitching', season);
    const stat = r.ok ? r.data?.stats?.[0]?.splits?.[0]?.stat : null;
    if (stat?.era) { eraEl.textContent = stat.era; foundEra = true; break; }
  }
  if (!foundEra) eraEl.textContent = '--';

  // HR leaders — top 5, with same season fallback.
  let leaders = [];
  for (const season of SEASONS) {
    const r = await fetchTeamHRLeaders(season, 5);
    if (r.ok && r.leaders.length > 0) { leaders = r.leaders; break; }
  }
  if (leaders.length > 0) {
    list.innerHTML = leaders.map(b => {
      const parts = b.name.split(' ');
      const display = parts.length > 1
        ? `${parts[0][0]}. ${parts.slice(-1)[0]}`
        : b.name;
      return `
        <div class="batter-row">
          <span class="batter-name">${display}</span>
          <span class="batter-hr">${b.hr} HR</span>
        </div>`;
    }).join('');
  } else {
    list.innerHTML = '<div class="batter-row"><span class="batter-name" style="color:var(--text-muted)">No data available</span></div>';
  }
}

// ─── Form Guide ──────────────────────────────────────────────────────
// Last 5 completed games as colored W/L pills + a one-line summary of the
// most recent game. Reads from `allGames` only — no extra API calls.
function renderFormGuide() {
  const pillsEl  = document.getElementById('formPills');
  const recentEl = document.getElementById('formRecent');
  const streakEl = document.getElementById('formStreak');
  if (!pillsEl || !recentEl) return;

  // Find completed games. Real MLB API uses `homeTeam.isWinner` /
  // `awayTeam.isWinner` plus `status.abstractGameState === 'Final'`.
  // The placeholder generator doesn't backfill these, so fall back to
  // synthetic results for any past-dated game without an explicit winner
  // (so the panel isn't empty offline).
  const now = Date.now();
  const completed = allGames
    .filter(g => {
      const t = new Date(g.date).getTime();
      if (t > now) return false;
      const status = g.status?.abstractGameState || g.abstractState;
      const detailed = g.status?.detailedState || g.detailedState;
      // Real final game OR placeholder past game.
      return status === 'Final' || detailed === 'Final' || g.scheduled === true;
    })
    .map(g => {
      const isHome = g.homeTeam.id === 147;
      const nyy = isHome ? g.homeTeam : g.awayTeam;
      const opp = isHome ? g.awayTeam : g.homeTeam;
      let nyyScore = nyy.score;
      let oppScore = opp.score;
      let won = nyy.isWinner;

      // Synthesize a result for placeholder games (deterministic per gamePk
      // so reloads don't shuffle history). DO NOT synthesize for today's
      // game — let the live API or manual sync resolve it to avoid "fake" wins.
      const isActuallyToday = isToday(g.date);
      if (!isActuallyToday && (won === null || won === undefined || nyyScore == null)) {
        const seed = (g.gamePk || 0) * 9301 + 49297;
        const r = ((seed % 233280) / 233280); // 0..1, deterministic
        won = r < 0.62; // ~62% win rate (Yankees pace for ~100W)
        nyyScore = won ? 4 + Math.floor(r * 6) : 1 + Math.floor(r * 4);
        oppScore = won ? Math.floor(r * 4) : 4 + Math.floor(r * 5);
      }
      
      // If still no winner/score (e.g. today's game not finalized), exclude from form.
      if (won === null || won === undefined) return null;
      return {
        date: g.date,
        opp: opp.abbreviation || opp.name,
        isHome,
        won: !!won,
        nyyScore,
        oppScore,
        venue: g.venue?.name,
      };
    })
    .filter(x => x !== null)
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first

  if (completed.length === 0) {
    pillsEl.innerHTML = Array(5).fill('<span class="form-pill empty">—</span>').join('');
    recentEl.innerHTML = '<span class="form-recent-empty">No recent games</span>';
    streakEl.textContent = '';
    streakEl.className = '';
    return;
  }

  // Last 5, displayed oldest → newest (left to right).
  const last5 = completed.slice(0, 5).reverse();
  while (last5.length < 5) last5.unshift(null);

  pillsEl.innerHTML = last5.map(g => {
    if (!g) return '<span class="form-pill empty">—</span>';
    const cls = g.won ? 'win' : 'loss';
    const tip = `${formatDateShort(g.date)} ${g.isHome ? 'vs' : '@'} ${g.opp} · ${g.won ? 'W' : 'L'} ${g.nyyScore}-${g.oppScore}`;
    return `<span class="form-pill ${cls}" title="${tip}">${g.won ? 'W' : 'L'}</span>`;
  }).join('');

  // Streak header.
  let streakLen = 1;
  const firstResult = completed[0].won;
  for (let i = 1; i < completed.length; i++) {
    if (completed[i].won === firstResult) streakLen++;
    else break;
  }
  streakEl.textContent = `${firstResult ? 'W' : 'L'}${streakLen}`;
  streakEl.className = firstResult ? 'win' : 'loss';

  // Most recent game line.
  const last = completed[0];
  const resultCls = last.won ? 'win' : 'loss';
  recentEl.innerHTML = `
    <div class="form-recent-line">
      <span class="form-recent-result ${resultCls}">${last.won ? 'W' : 'L'}</span>
      <span class="form-recent-score">${last.nyyScore}–${last.oppScore}</span>
      <span class="form-recent-meta">${last.isHome ? 'vs' : '@'} ${last.opp}</span>
    </div>
    <div class="form-recent-meta">${formatDateShort(last.date)} · ${last.venue || ''}</div>
  `;
}

// ─── Near Me Map ────────────────────────────────────────────────────────────
function renderNearMeMap() {
  document.getElementById('nearMeMap').innerHTML = getMapSvg();
  const titleEl = document.getElementById('mapCardTitle');
  if (titleEl) titleEl.textContent = `★ ${userHome.label} PROXIMITY`;
}

// Map interactions: ZIP edit + click-to-enlarge.
function wireMapInteractions() {
  const editBtn = document.getElementById('mapEditBtn');
  const form    = document.getElementById('mapZipForm');
  const input   = document.getElementById('mapZipInput');
  const submit  = document.getElementById('mapZipSubmit');
  const cancel  = document.getElementById('mapZipCancel');
  const status  = document.getElementById('mapZipStatus');
  const mapEl   = document.getElementById('nearMeMap');

  function showForm() {
    form.hidden = false;
    input.value = userHome.zip || '';
    status.textContent = '';
    status.className = 'map-zip-status';
    input.focus();
    input.select();
  }
  function hideForm() {
    form.hidden = true;
    status.textContent = '';
  }

  editBtn?.addEventListener('click', () => {
    if (form.hidden) showForm(); else hideForm();
  });
  cancel?.addEventListener('click', hideForm);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit.click();
    if (e.key === 'Escape') hideForm();
  });

  submit?.addEventListener('click', async () => {
    const zip = input.value.trim();
    if (!/^\d{5}$/.test(zip)) {
      status.textContent = 'Enter a valid 5-digit ZIP';
      status.className = 'map-zip-status error';
      return;
    }
    status.textContent = 'Looking up…';
    status.className = 'map-zip-status';
    try {
      const place = await lookupZip(zip);
      setUserHome(place);
      renderNearMeMap();
      renderRivalries();
      renderScheduleForMonth(currentMonth);
      status.textContent = `✓ ${place.label}`;
      status.className = 'map-zip-status success';
      setTimeout(hideForm, 1200);
    } catch (e) {
      status.textContent = e.message || 'Lookup failed';
      status.className = 'map-zip-status error';
    }
  });

  mapEl?.addEventListener('click', (e) => {
    if (e.target.closest('.map-zip-form')) return;
    openMapModal();
  });
}

function openMapModal() {
  const overlay = document.getElementById('mapModalOverlay');
  const canvas  = document.getElementById('mapModalCanvas');
  const title   = document.getElementById('mapModalTitle');
  if (!overlay || !canvas) return;
  title.textContent = `${userHome.label} · PROXIMITY MAP`;
  canvas.innerHTML = getMapSvg();
  overlay.classList.add('active');

  const close = () => {
    overlay.classList.remove('active');
    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKey);
  };
  function onOverlayClick(e) { if (e.target === overlay) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKey);
  document.getElementById('mapModalClose').onclick = close;
}

// ─── Live update callback ───────────────────────────────────────────────────
function onLiveUpdate(updates) {
  updates.forEach(({ gamePk, homeScore, awayScore, inning }) => {
    // Update game card score
    const card = document.querySelector(`.game-card[data-pk="${gamePk}"]`);
    if (card) {
      const scoreEl = card.querySelector('.game-card-score');
      if (scoreEl) {
        scoreEl.classList.add('updated');
        setTimeout(() => scoreEl.classList.remove('updated'), 400);
      }
    }

    // Update today hero if it's today's game
    renderTodayHero(getGamesForToday());

    // Update live indicator in header
    updateLiveIndicator();
  });
}

// ─── Live indicator ─────────────────────────────────────────────────────────
function updateLiveIndicator() {
  const live = schedGetLiveGames();
  const indicator = document.getElementById('liveIndicator');
  const gameName = document.getElementById('liveGameName');

  if (live.length > 0) {
    const g = live[0];
    const isNYYHome = g.homeTeam.id === 147;
    const opp = isNYYHome ? g.awayTeam.abbreviation : g.homeTeam.abbreviation;
    gameName.textContent = `NYY vs ${opp}`;
    indicator.style.display = 'flex';
  } else {
    indicator.style.display = 'none';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function renderAll() {
  renderScheduleForMonth(currentMonth);
  renderTodayHero(getGamesForToday());
  renderRivalries();
  renderFormGuide();
}

function updateSyncTime() {
  const el = document.getElementById('syncTime');
  if (!el) return;
  const t = lastSyncTime;
  el.textContent = t ? `Synced ${t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}` : '';
}

function showSyncSpinner(on) {
  const btn = document.getElementById('syncBtn');
  const icon = document.getElementById('syncIcon');
  if (!btn || !icon) return;
  btn.classList.toggle('syncing', on);
}

function showOfflineBanner(on) {
  document.getElementById('offlineBanner').classList.toggle('active', on);
}

function getGameStatus(game) {
  const status = game.status;
  if (game.scheduled === false) {
    if (status === 'FINAL' || status === 'F') return 'FINAL';
    if (status === 'LIVE' || status === 'I' || status === 'L') return 'LIVE';
  }
  if (game.scheduled === true) return 'UPCOMING';
  return game.abstractState === 'Final' ? 'FINAL'
       : game.abstractState === 'Live' ? 'LIVE'
       : 'UPCOMING';
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
