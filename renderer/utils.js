/* ─── utils.js — Date/time, formatting, ICS generation ──────────────────── */

export const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                       'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
export const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
export const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function formatDay(dateStr) {
  const d = new Date(dateStr);
  return d.getDate();
}

export function formatWeekday(dateStr) {
  const d = new Date(dateStr);
  return DAYS_SHORT[d.getDay()];
}

export function formatTime(dateStr, tz = 'America/New_York') {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: tz
    });
  } catch { return 'TBD'; }
}

export function formatLocalTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch { return 'TBD'; }
}

export function getLocalTimezone() {
  try {
    const d = new Date();
    // Short code like 'CT', 'ET', 'PT'
    return d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
  } catch { return 'LT'; }
}

export function formatTimeAgo(dateStr) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function isSameDay(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function isToday(dateStr) {
  return isSameDay(dateStr, new Date());
}

export function getMonthIndex(dateStr) {
  return new Date(dateStr).getMonth(); // 0-indexed
}

// Removed re-export to avoid circular dependency with schedule.js

export function generateICS(game) {
  const d = new Date(game.date);
  const end = new Date(d.getTime() + 3 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const fmt = dt => `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  const home = game.homeTeam?.name || 'Yankees';
  const away = game.awayTeam?.name || 'Opponent';
  const venue = game.venue?.name || 'Yankee Stadium';
  const summary = `${away} @ ${home}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VERITAS Yankees 2026//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(d)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${venue}`,
    `DESCRIPTION:Yankees 2026 Season Game`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

export function pluralize(n, word) {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Bump CACHE_VERSION whenever the shape of cached data changes (e.g. when
// the placeholder schedule generator is updated). Any old cache entries
// keyed under previous versions become unreachable and effectively expire.
const CACHE_VERSION = 'v4';

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`yanks_${CACHE_VERSION}_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Cache expires after 24h
    if (Date.now() - ts > 86400000) return null;
    return data;
  } catch { return null; }
}

export function cacheSet(key, data) {
  try {
    localStorage.setItem(`yanks_${CACHE_VERSION}_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}
