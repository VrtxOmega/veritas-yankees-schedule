/* ─── api.js — MLB Stats API v1 client ───────────────────────────────────── */

const BASE = 'https://statsapi.mlb.com/api/v1';
const TEAM_ID = 147; // Yankees

// ─── Core fetch helper ─────────────────────────────────────────────────────
async function mlbFetch(path) {
  const url = BASE + path;
  if (window.electronAPI?.fetchMLB) {
    return window.electronAPI.fetchMLB(url);
  }
  // Browser dev fallback (CORS preflight may apply)
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'Veritas-Yankees-Schedule/1.0' },
    mode: 'cors',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── API calls ─────────────────────────────────────────────────────────────
export async function fetchSchedule() {
  try {
    const path = `/schedule?sportId=117&season=2026&teamId=${TEAM_ID}&hydrate=team,venue,game(seriesDecisions,seriesSummary)`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    console.error('[API] Schedule fetch failed:', e);
    return { ok: false, error: e.message };
  }
}

export async function fetchLiveGame(gamePk) {
  try {
    const path = `/v1.1/game/${gamePk}/feed/live`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchStandings() {
  try {
    const path = `/standings?season=2026&leagueId=103&hydrate=team`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchTeamRoster() {
  try {
    const path = `/teams/${TEAM_ID}/roster?rosterType=40Man`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchPlayerStats(playerId) {
  try {
    const path = `/people/${playerId}/stats?stats=season&season=2026`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Team season stats for a given group ('hitting' or 'pitching'). The MLB
 * Stats API returns aggregated team-level stats under stats[0].splits[0].stat.
 */
export async function fetchTeamSeasonStats(group = 'hitting', season = 2026) {
  try {
    const path = `/teams/${TEAM_ID}/stats?season=${season}&stats=season&group=${group}`;
    const data = await mlbFetch(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Top N home-run hitters on the Yankees for the given season. Uses the
 * /stats leaders-style query scoped to teamId. Returns array of
 * { name, id, hr } sorted descending.
 */
export async function fetchTeamHRLeaders(season = 2026, limit = 5) {
  try {
    const path = `/stats?stats=season&group=hitting&season=${season}` +
                 `&teamId=${TEAM_ID}&sortStat=homeRuns&order=desc&limit=${limit}` +
                 `&playerPool=All`;
    const data = await mlbFetch(path);
    const splits = data?.stats?.[0]?.splits || [];
    const leaders = splits.map(s => ({
      id: s.player?.id,
      name: s.player?.fullName || '',
      hr: parseInt(s.stat?.homeRuns) || 0,
    })).filter(b => b.name && b.hr > 0);
    return { ok: true, leaders };
  } catch (e) {
    return { ok: false, error: e.message, leaders: [] };
  }
}

// ─── Data helpers ───────────────────────────────────────────────────────────
export function getBroadcasts(game) {
  const broadcasts = [];
  const content = game.content || {};
  const media = content.media || {};
  const episodes = media.episodes || [];
  episodes.forEach(ep => {
    if (ep.gameWindowStart && ep.callLetters) {
      broadcasts.push(ep.callLetters);
    }
  });
  return [...new Set(broadcasts)].slice(0, 3);
}

export function getProbablePitchers(game) {
  const pitchers = { home: null, away: null };
  const gameData = game.gameData || {};
  const probables = gameData.probablePitchers || [];
  probables.forEach(p => {
    if (p.team?.id === gameData.teams?.home?.id) pitchers.home = p;
    if (p.team?.id === gameData.teams?.away?.id) pitchers.away = p;
  });
  return pitchers;
}

export function extractGames(scheduleData) {
  const games = [];
  const dates = scheduleData.dates || [];

  // Empty dates array means offseason / schedule not yet published
  if (!dates || dates.length === 0) {
    return { games: [], offseason: true };
  }

  dates.forEach(dateEntry => {
    (dateEntry.games || []).forEach(g => {
      games.push(normalizeGame(g, dateEntry.date));
    });
  });

  return { games, offseason: games.length === 0 };
}

function normalizeGame(g, dateStr) {
  const gd = g.gameData || {};
  const teams = g.teams || {};
  const status = g.status || {};

  return {
    gamePk: g.gamePk,
    date: g.gameDate,
    dateStr,
    type: gd.type || 'R',
    status: status.statusCode || 'S',
    detailedState: status.detailedState || status.abstractGameState || 'Scheduled',
    abstractState: status.abstractGameState || 'Scheduled',
    scheduled: status.statusCode === 'S' || status.statusCode === 'PRE' || !status.statusCode,
    homeTeam: {
      id: teams.home?.team?.id,
      name: teams.home?.team?.name,
      abbreviation: teams.home?.team?.abbreviation,
      logoUrl: `https://www.mlbstatic.com/team-logos/${teams.home?.team?.id}.svg`,
      score: teams.home?.score,
      isWinner: teams.home?.isWinner,
    },
    awayTeam: {
      id: teams.away?.team?.id,
      name: teams.away?.team?.name,
      abbreviation: teams.away?.team?.abbreviation,
      logoUrl: `https://www.mlbstatic.com/team-logos/${teams.away?.team?.id}.svg`,
      score: teams.away?.score,
      isWinner: teams.away?.isWinner,
    },
    venue: {
      id: gd.venue?.id,
      name: gd.venue?.name,
      city: gd.venue?.location?.city,
      lat: gd.venue?.coordinates?.lat,
      lng: gd.venue?.coordinates?.lng,
    },
    seriesInfo: g.seriesInfo || null,
    dayNight: gd.dayNight,
    firstPitch: gd.datetime?.dateTime,
    seriesDescription: gd.seriesDescription,
  };
}

export { TEAM_ID };
