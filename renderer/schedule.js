/* ─── schedule.js — Schedule data, filtering, rendering ─────────────────── */

// ⚠️ NOTE: getGameStatus is defined and exported LOCALLY in this file (see
// below). DO NOT add it to the utils.js import — utils.js may also export
// one, but importing it here would collide with the local declaration and
// throw "Identifier 'getGameStatus' has already been declared" at module
// load, which silently breaks the entire app.

import { MONTHS_SHORT, DAYS_SHORT, formatDay, formatWeekday,
         formatTime, isToday, getMonthIndex, pluralize,
         cacheGet, cacheSet } from './utils.js';
import { isNearMeGame, getDistanceFromStL, getVenueForTeam, NEAR_ME_RADIUS } from './geo.js';
import { getBroadcasts } from './api.js';

export let allGames = [];
export let filteredGames = [];
export let rivalryGames = { sox: [], mets: [], stl: [] };
export let nearMeGames = [];

const RIVALRY_TEAM_IDS = {
  sox: 111,    // Boston Red Sox
  mets: 121,   // New York Mets
  stl: 138,    // St. Louis Cardinals
};

let scheduleExpanded = false;

export async function loadSchedule() {
  // Try cache first
  const cached = cacheGet('schedule');
  if (cached) {
    replaceArray(allGames, cached);
    processGames();
    return true;
  }

  const { fetchSchedule, extractGames } = await import('./api.js');
  const result = await fetchSchedule();
  if (!result.ok) {
    // Try to use cached stale data
    const stale = cacheGet('schedule_stale');
    if (stale) { replaceArray(allGames, stale); processGames(); }
    return false;
  }

  const { games, offseason } = extractGames(result.data);
  if (offseason) {
    // Season hasn't started or schedule not published — use placeholder
    replaceArray(allGames, generatePlaceholderSchedule());
  } else {
    replaceArray(allGames, games);
  }

  cacheSet('schedule', allGames);
  processGames();
  return true;
}

function replaceArray(target, source) {
  target.length = 0;
  for (const item of source) target.push(item);
}

function processGames() {
  // Mutate in place so any code holding references to these arrays/object
  // (including destructured imports) sees the updated data.
  replaceArray(nearMeGames, allGames.filter(g => {
    if (!g.venue?.lat) return false;
    return isNearMeGame(g.venue?.id, g.venue?.lat, g.venue?.lng);
  }));

  rivalryGames.sox  = allGames.filter(g => g.homeTeam.id === RIVALRY_TEAM_IDS.sox  || g.awayTeam.id === RIVALRY_TEAM_IDS.sox);
  rivalryGames.mets = allGames.filter(g => g.homeTeam.id === RIVALRY_TEAM_IDS.mets || g.awayTeam.id === RIVALRY_TEAM_IDS.mets);
  rivalryGames.stl  = allGames.filter(g => g.homeTeam.id === RIVALRY_TEAM_IDS.stl  || g.awayTeam.id === RIVALRY_TEAM_IDS.stl);

  replaceArray(filteredGames, allGames);
}

export function filterGames(nearMeOnly, liveOnly) {
  const next = allGames.filter(g => {
    if (liveOnly && getGameStatus(g) !== 'LIVE') return false;
    if (nearMeOnly) {
      const venue = getVenueForTeam(g.homeTeam.id) || getVenueForTeam(g.awayTeam.id);
      if (venue) {
        if (venue.dist === null || venue.dist > NEAR_ME_RADIUS) return false;
      } else if (!g.venue?.lat) {
        return false;
      }
    }
    return true;
  });
  replaceArray(filteredGames, next);
}

export function getGamesByMonth(monthIndex) {
  return filteredGames.filter(g => getMonthIndex(g.date) === monthIndex);
}

export function getGamesForToday() {
  return allGames.filter(g => isToday(g.date));
}

export function getLiveGames() {
  return allGames.filter(g => getGameStatus(g) === 'LIVE');
}

export function getGameStatus(game) {
  const status = game.status?.statusCode || game.status?.abstractGameState;
  const detailed = game.status?.detailedState;
  if (detailed === 'In Progress' || status === 'L' || status === 'I') return 'LIVE';
  if (detailed === 'Final' || status === 'F' || status === 'FT') return 'FINAL';
  return 'UPCOMING';
}

export function getRivalryRecord(rivalryArr) {
  const nyy = rivalryArr.filter(g => g.homeTeam.id === 147 || g.awayTeam.id === 147);
  const won = nyy.filter(g => {
    if (g.homeTeam.id === 147) return g.homeTeam.isWinner;
    if (g.awayTeam.id === 147) return g.awayTeam.isWinner;
    return false;
  });
  const lost = nyy.filter(g => {
    if (g.homeTeam.id === 147) return !g.homeTeam.isWinner;
    if (g.awayTeam.id === 147) return !g.awayTeam.isWinner;
    return false;
  });
  const played = nyy.filter(g => getGameStatus(g) === 'FINAL');
  if (played.length === 0) return null;
  return { won: won.length, lost: lost.length };
}

export function getNextRivalryGame(rivalryArr) {
  const now = Date.now();
  const upcoming = rivalryArr
    .filter(g => getGameStatus(g) === 'UPCOMING' && new Date(g.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return upcoming[0] || null;
}

export function renderSchedule(games, container, monthFilter) {
  const grouped = {};
  games.forEach(g => {
    const key = g.dateStr;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(g);
  });

  const sortedDates = Object.keys(grouped).sort();
  if (sortedDates.length === 0) {
    container.innerHTML = `
      <div class="error-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>No games match your filters</p>
      </div>`;
    return;
  }

  let html = '';
  const isMobile = window.innerWidth <= 768;
  const isCurrentMonth = filteredGames.some(g => isToday(g.date));
  
  let datesToRender = sortedDates;
  let showExpandBtn = false;

  // On mobile, if we haven't expanded and we're looking at the current month,
  // slice to show Today + 5 games.
  if (isMobile && !scheduleExpanded && isCurrentMonth) {
    const todayStr = new Date().toISOString().split('T')[0];
    const startIndex = sortedDates.findIndex(d => d >= todayStr);
    
    if (startIndex !== -1) {
      datesToRender = sortedDates.slice(startIndex, startIndex + 6);
      if (sortedDates.length > startIndex + 6) {
        showExpandBtn = true;
      }
    }
  }

  datesToRender.forEach(dateKey => {
    const dayGames = grouped[dateKey];
    const d = new Date(dateKey + 'T12:00:00');
    html += `
      <div class="game-date-divider">
        <span class="game-date-divider-date">${DAYS_SHORT[d.getDay()]} · ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}</span>
        <div class="game-date-divider-line"></div>
      </div>`;

    dayGames.forEach(game => {
      html += renderGameCard(game, dateKey);
    });
  });

  if (showExpandBtn) {
    html += `
      <button class="expand-schedule-btn" id="expandScheduleBtn">
        VIEW FULL MONTH <span class="arrow">▾</span>
      </button>`;
  }

  container.innerHTML = html;

  // Attach click listeners
  if (showExpandBtn) {
    document.getElementById('expandScheduleBtn').addEventListener('click', () => {
      scheduleExpanded = true;
      renderSchedule();
    });
  }
  container.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', async () => {
      const pk = parseInt(card.dataset.pk);
      const game = allGames.find(g => g.gamePk === pk);
      if (game) {
        const { openModal } = await import('./modal.js');
        openModal(game);
      }
    });
  });
}

function renderGameCard(game, dateKey) {
  const status = getGameStatus(game);
  const d = new Date(game.date);
  const day = formatDay(game.date);
  const weekday = formatWeekday(game.date);

  const isNYYHome = game.homeTeam.id === 147;
  const opponent = isNYYHome ? game.awayTeam : game.homeTeam;
  const nyyScore = isNYYHome ? game.homeTeam.score : game.awayTeam.score;
  const oppScore = isNYYHome ? game.awayTeam.score : game.homeTeam.score;
  const nyyWon = game.homeTeam.id === 147 ? game.homeTeam.isWinner : game.awayTeam.isWinner;

  const venue = getVenueForTeam(game.homeTeam.id);
  const nearMe = venue ? venue.dist !== null && venue.dist <= NEAR_ME_RADIUS : false;
  const distance = venue?.dist ?? (game.venue?.lat ? getDistanceFromStL(game.venue.lat, game.venue.lng) : null);

  const broadcasts = getBroadcasts(game) || [];
  const watchHtml = broadcasts.map(b => {
    const s = b.toUpperCase();
    const cls = s.includes('ESPN') ? 'espn' :
                s.includes('YES') ? 'yes' :
                s.includes('MLB') ? 'mlb' :
                (s.includes('FOX') || s.includes('FS1')) ? 'fox' :
                s.includes('APPLE') ? 'apple' :
                (s.includes('PRIME') || s.includes('AMAZON')) ? 'prime' :
                s.includes('PEACOCK') ? 'peacock' :
                s.includes('TBS') ? 'tbs' :
                s.includes('ROKU') ? 'roku' : '';
    return `<span class="watch-badge ${cls}">${b}</span>`;
  }).join('');

  let statusHtml = '';
  if (status === 'FINAL') {
    const wlClass = nyyWon ? 'win' : 'loss';
    statusHtml = `
      <div class="game-card-result">
        <div class="game-card-score ${wlClass}">${nyyScore} - ${oppScore}</div>
        <div class="game-card-wl ${wlClass}">${nyyWon ? 'W' : 'L'}</div>
      </div>`;
  } else if (status === 'LIVE') {
    statusHtml = `
      <div class="game-card-result">
        <div class="game-card-score">${nyyScore || 0} - ${oppScore || 0}</div>
        <div class="game-card-wl" style="color:var(--green-live)">LIVE</div>
      </div>`;
  } else {
    statusHtml = `
      <div class="game-card-time">
        <div class="game-card-time-value">${formatTime(game.date)}</div>
        <div class="game-card-time-label">ET</div>
      </div>`;
  }

  const nearMeClass = nearMe ? 'near-me' : '';
  const liveClass = status === 'LIVE' ? 'live' : '';
  const todayClass = isToday(game.date) ? 'today' : '';

  return `
    <div class="game-card ${nearMeClass} ${liveClass} ${todayClass}" data-pk="${game.gamePk}">
      <div class="game-card-date">
        <span class="game-card-month">${MONTHS_SHORT[d.getMonth()]}</span>
        <span class="game-card-day">${day}</span>
        <span class="game-card-weekday">${weekday}</span>
      </div>
      <div class="game-card-matchup">
        <span class="game-card-vs">${isNYYHome ? 'vs' : '@'}</span>
        <div class="game-card-opponent">
          <div class="game-card-opponent-name">${opponent.abbreviation || opponent.name}</div>
          <div class="game-card-opponent-city">${game.venue?.city || ''}</div>
        </div>
      </div>
      <div class="game-card-venue">
        <span class="game-card-venue-name">${game.venue?.name || 'TBD'}</span>
        <span class="game-card-venue-city">${game.venue?.city || ''}</span>
        ${nearMe && distance !== null ? `<span class="game-card-distance">▲ ${distance}mi from StL</span>` : ''}
      </div>
      <div class="game-card-info">
        ${statusHtml}
        <div class="game-card-watch">${watchHtml || '<span class="watch-badge">MLB.TV</span>'}</div>
      </div>
    </div>`;
}

// ─── Placeholder schedule for offseason / pre-launch ──────────────────────
function generatePlaceholderSchedule() {
  const games = [];
  const months = [2, 3, 4, 5, 6, 7, 8, 9]; // Mar-Oct

  const yankeeStadium = {
    id: 3312, name: 'Yankee Stadium', city: 'Bronx, NY',
    lat: 40.8296, lng: -73.9262,
  };

  // Each opponent paired with their actual home venue.
  const opponents = [
    { id: 111, name: 'Boston Red Sox',       abbr: 'BOS',
      venue: { id: 3,    name: 'Fenway Park',                  city: 'Boston, MA',         lat: 42.3467, lng: -71.0972 } },
    { id: 141, name: 'Toronto Blue Jays',    abbr: 'TOR',
      venue: { id: 14,   name: 'Rogers Centre',                city: 'Toronto, ON',        lat: 43.6414, lng: -79.3914 } },
    { id: 110, name: 'Baltimore Orioles',    abbr: 'BAL',
      venue: { id: 2,    name: 'Oriole Park at Camden Yards',  city: 'Baltimore, MD',      lat: 39.2839, lng: -76.6216 } },
    { id: 139, name: 'Tampa Bay Rays',       abbr: 'TB',
      venue: { id: 12,   name: 'Tropicana Field',              city: 'St. Petersburg, FL', lat: 27.7682, lng: -82.6534 } },
    { id: 114, name: 'Cleveland Guardians',  abbr: 'CLE',
      venue: { id: 5,    name: 'Progressive Field',            city: 'Cleveland, OH',      lat: 41.4961, lng: -81.6852 } },
    { id: 145, name: 'Chicago White Sox',    abbr: 'CWS',
      venue: { id: 4,    name: 'Guaranteed Rate Field',        city: 'Chicago, IL',        lat: 41.8300, lng: -87.6338 } },
    { id: 118, name: 'Kansas City Royals',   abbr: 'KC',
      venue: { id: 7,    name: 'Kauffman Stadium',             city: 'Kansas City, MO',    lat: 39.0517, lng: -94.4806 } },
    { id: 142, name: 'Minnesota Twins',      abbr: 'MIN',
      venue: { id: 3309, name: 'Target Field',                 city: 'Minneapolis, MN',    lat: 44.9817, lng: -93.2777 } },
    { id: 116, name: 'Detroit Tigers',       abbr: 'DET',
      venue: { id: 2394, name: 'Comerica Park',                city: 'Detroit, MI',        lat: 42.3390, lng: -83.0485 } },
    { id: 138, name: 'St. Louis Cardinals',  abbr: 'STL',
      venue: { id: 2889, name: 'Busch Stadium',                city: 'St. Louis, MO',      lat: 38.6227, lng: -90.2029 } },
    { id: 144, name: 'Atlanta Braves',       abbr: 'ATL',
      venue: { id: 4705, name: 'Truist Park',                  city: 'Cumberland, GA',     lat: 33.8908, lng: -84.4677 } },
    { id: 121, name: 'New York Mets',        abbr: 'NYM',
      venue: { id: 3289, name: 'Citi Field',                   city: 'Queens, NY',         lat: 40.7571, lng: -73.8458 } },
    { id: 119, name: 'Los Angeles Dodgers',  abbr: 'LAD',
      venue: { id: 22,   name: 'Dodger Stadium',               city: 'Los Angeles, CA',    lat: 34.0568, lng: -118.2441 } },
  ];

  // Generate games for most days of the month — MLB teams play ~25–26
  // games/month, typically with off-days clustered around travel. We'll
  // include every day and let games fall on whichever weekday they land on.
  const allDaysInRange = (max) => {
    const out = [];
    for (let d = 1; d <= max; d++) out.push(d);
    return out;
  };

  let gameNum = 0;
  months.forEach(month => {
    const daysInMonth = new Date(2026, month + 1, 0).getDate();
    // March: only opening week (Opening Day is typically late March).
    // All other months: every day, with Mondays skipped as rest days.
    let monthDays;
    if (month === 2) {
      monthDays = [27, 28, 29, 30, 31].filter(d => d <= daysInMonth);
    } else {
      monthDays = allDaysInRange(daysInMonth).filter(d => {
        // Skip Mondays as a typical rest day.
        const weekday = new Date(2026, month, d).getDay();
        return weekday !== 1;
      });
    }

    monthDays.forEach(day => {
      if (day > daysInMonth) return;

      const dateStr = `2026-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isHome = gameNum % 3 !== 0;
      const opp = opponents[gameNum % opponents.length];
      const venue = isHome ? yankeeStadium : opp.venue;

      const hour = 19 + (gameNum % 4);
      const min = gameNum % 2 === 0 ? '05' : '10';
      const date = `${dateStr}T${String(hour).padStart(2,'0')}:${min}:00Z`;

      games.push({
        gamePk: 202600000 + gameNum,
        date,
        dateStr,
        type: 'R',
        status: 'S',
        detailedState: 'Scheduled',
        abstractState: 'Preview',
        scheduled: true,
        homeTeam: isHome
          ? { id: 147, name: 'New York Yankees', abbreviation: 'NYY', score: null, isWinner: null }
          : { id: opp.id, name: opp.name, abbreviation: opp.abbr, score: null, isWinner: null },
        awayTeam: !isHome
          ? { id: 147, name: 'New York Yankees', abbreviation: 'NYY', score: null, isWinner: null }
          : { id: opp.id, name: opp.name, abbreviation: opp.abbr, score: null, isWinner: null },
        venue: { ...venue },
        seriesInfo: null,
        dayNight: hour > 17 ? 'night' : 'day',
        firstPitch: date,
        seriesDescription: 'Regular Season',
      });
      gameNum++;
    });
  });

  return games;
}
