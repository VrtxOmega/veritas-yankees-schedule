/* ─── geo.js — Haversine distance + venue data ───────────────────────────── */

export const ST_LOUIS = { lat: 38.6270, lng: -90.1994, name: 'St. Louis, MO' };

// ─── User home location ───────────────────────────────────────────────────────────────────────
const HOME_STORAGE_KEY = 'yanks_user_home';
const DEFAULT_HOME = {
  zip: '63101', lat: 38.6270, lng: -90.1994,
  city: 'St. Louis', state: 'MO', label: 'ST. LOUIS, MO',
};
function loadHome() {
  try {
    const raw = localStorage.getItem(HOME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed;
    }
  } catch {}
  return { ...DEFAULT_HOME };
}
// Mutated in place so importers see updates via live bindings + shared object refs.
export const userHome = loadHome();

// Venues within ~350mi of StL — Yankees opponents + nearby
export const NEAR_ME_VENUES = [
  // AL Central / nearby NL
  { teamId: 138, abbr: 'STL', name: 'Busch Stadium', city: 'St. Louis, MO',
    lat: 38.6227, lng: -90.2029, league: 'NL', dist: null },
  { teamId: 112, abbr: 'CHC', name: 'Wrigley Field', city: 'Chicago, IL',
    lat: 41.9484, lng: -87.6553, league: 'NL', dist: null },
  { teamId: 145, abbr: 'CWS', name: 'Guaranteed Rate Field', city: 'Chicago, IL',
    lat: 41.8299, lng: -87.6309, league: 'AL', dist: null },
  { teamId: 118, abbr: 'KC', name: 'Kauffman Stadium', city: 'Kansas City, MO',
    lat: 39.0517, lng: -94.4806, league: 'AL', dist: null },
  { teamId: 142, abbr: 'MIN', name: 'Target Field', city: 'Minneapolis, MN',
    lat: 44.9817, lng: -93.2777, league: 'AL', dist: null },
  { teamId: 116, abbr: 'DET', name: 'Comerica Park', city: 'Detroit, MI',
    lat: 42.3390, lng: -83.0485, league: 'AL', dist: null },
  // Tigers/Indians can stretch to edge of range
  { teamId: 114, abbr: 'CLE', name: 'Progressive Field', city: 'Cleveland, OH',
    lat: 41.4958, lng: -81.6871, league: 'AL', dist: null },
];

// Pre-compute distances from the user's home; recomputed when home changes.
function recomputeDistances() {
  NEAR_ME_VENUES.forEach(v => {
    v.dist = Math.round(haversine(userHome.lat, userHome.lng, v.lat, v.lng));
  });
}
recomputeDistances();

/**
 * Update the user's home location (mutates `userHome` in place so existing
 * importers see the change), persists to localStorage, and recomputes distances.
 */
export function setUserHome(next) {
  Object.assign(userHome, {
    zip: next.zip || userHome.zip,
    lat: typeof next.lat === 'number' ? next.lat : userHome.lat,
    lng: typeof next.lng === 'number' ? next.lng : userHome.lng,
    city: next.city || userHome.city,
    state: next.state || userHome.state,
    label: next.label || `${(next.city || userHome.city).toUpperCase()}, ${(next.state || userHome.state).toUpperCase()}`,
  });
  try { localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(userHome)); } catch {}
  recomputeDistances();
  return userHome;
}

/**
 * Geocode a US ZIP via Zippopotamus (no API key). Returns full home object or throws.
 */
export async function lookupZip(zip) {
  const cleaned = String(zip).trim();
  if (!/^\d{5}$/.test(cleaned)) throw new Error('ZIP must be 5 digits');
  const url = `https://api.zippopotam.us/us/${cleaned}`;
  let raw;
  if (window.electronAPI?.fetchText) {
    raw = await window.electronAPI.fetchText(url);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Lookup failed: HTTP ${res.status}`);
    raw = await res.text();
  }
  const data = JSON.parse(raw);
  const place = (data.places || [])[0];
  if (!place) throw new Error('ZIP not found');
  const city = place['place name'];
  const state = place['state abbreviation'];
  return {
    zip: cleaned,
    lat: parseFloat(place.latitude),
    lng: parseFloat(place.longitude),
    city, state,
    label: `${city.toUpperCase()}, ${state}`,
  };
}

export const NEAR_ME_TEAM_IDS = new Set(NEAR_ME_VENUES.map(v => v.teamId));
export const NEAR_ME_RADIUS = 350; // miles

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * Math.PI / 180; }

export function getVenueForTeam(teamId) {
  return NEAR_ME_VENUES.find(v => v.teamId === teamId) || null;
}

export function isNearMeGame(venueId, venueLat, venueLng) {
  // If we have a mapped near-me venue, use it
  const venue = NEAR_ME_VENUES.find(v => v.teamId === venueId);
  if (venue) return venue.dist !== null && venue.dist <= NEAR_ME_RADIUS;

  // Otherwise check distance directly
  if (venueLat && venueLng) {
    const dist = haversine(userHome.lat, userHome.lng, venueLat, venueLng);
    return dist <= NEAR_ME_RADIUS;
  }
  return false;
}

export function getDistanceFromStL(lat, lng) {
  return Math.round(haversine(userHome.lat, userHome.lng, lat, lng));
}
export const getDistanceFromHome = getDistanceFromStL;

// SVG map positions for near-me venues (in viewBox 0 0 400 200)
export const MAP_POSITIONS = {
  'STL': { x: 195, y: 130, cx: 195, cy: 130 },
  'CHC': { x: 215, y: 70,  cx: 215, cy: 70  },
  'CWS': { x: 205, y: 72,  cx: 205, cy: 72  },
  'KC':  { x: 155, y: 115, cx: 155, cy: 115 },
  'MIN': { x: 170, y: 30,  cx: 170, cy: 30  },
  'DET': { x: 255, y: 65,  cx: 255, cy: 65  },
  'CLE': { x: 280, y: 85,  cx: 280, cy: 85  },
};

export function getMapSvg() {
  const venues = NEAR_ME_VENUES.filter(v => v.dist !== null);

  const pins = venues.map(v => {
    const pos = MAP_POSITIONS[v.abbr];
    if (!pos) return '';
    const isStL = v.abbr === 'STL';
    const color = v.league === 'NL' ? '#C41E3A' : '#003087';
    return `
      <g class="map-pin" data-venue="${v.abbr}">
        <circle cx="${pos.cx}" cy="${pos.cy}" r="8" fill="${isStL ? '#D4AF37' : color}" opacity="0.2"/>
        <circle cx="${pos.cx}" cy="${pos.cy}" r="4" fill="${isStL ? '#D4AF37' : color}"/>
        <text x="${pos.x}" y="${pos.y - 10}" text-anchor="middle"
              font-family="JetBrains Mono, monospace" font-size="9" font-weight="600"
              fill="${isStL ? '#D4AF37' : '#999'}">${v.abbr}</text>
        <text x="${pos.x}" y="${pos.y + 20}" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="7"
              fill="#555">${Math.round(v.dist)}mi</text>
      </g>
    `;
  }).join('');

  // Connection lines STL-CHI, STL-KC
  const lines = `
    <line x1="195" y1="130" x2="215" y2="70" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="195" y1="130" x2="205" y2="72" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="195" y1="130" x2="155" y2="115" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="195" y1="130" x2="255" y2="65" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="195" y1="130" x2="280" y2="85" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>
  `;

  // Home location label (uses live userHome reference)
  const youLabel = `
    <text x="195" y="155" text-anchor="middle"
          font-family="JetBrains Mono, monospace" font-size="8" font-weight="700"
          fill="#D4AF37">★ ${userHome.city.toUpperCase()}</text>
  `;

  return `
    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;display:block;">
      <!-- Background grid -->
      <defs>
        <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a1a" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="400" height="200" fill="#0d0d0d"/>
      <rect width="400" height="200" fill="url(#mapGrid)"/>

      <!-- Approximate US Midwest outline (simplified) -->
      <path d="M 100 10 L 320 10 L 350 60 L 340 140 L 280 190 L 100 190 L 60 100 Z"
            fill="none" stroke="#2a2a2a" stroke-width="1"/>

      ${lines}
      ${pins}
      ${youLabel}

      <!-- Legend -->
      <text x="10" y="190" font-family="Inter, sans-serif" font-size="7" fill="#444">
        ● AL &nbsp;&nbsp; <tspan fill="#C41E3A">● NL</tspan> &nbsp;&nbsp; <tspan fill="#D4AF37">★ YOU</tspan>
      </text>
    </svg>
  `;
}
