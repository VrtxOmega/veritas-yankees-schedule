/* ─── modal.js — Game detail modal ────────────────────────────────────────── */

import { getGameStatus, formatDate, formatTime, generateICS } from './utils.js';
import { getProbablePitchers, getBroadcasts } from './api.js';

let isOpen = false;

export function openModal(game) {
  const overlay = document.getElementById('modalOverlay');
  const panel = document.getElementById('modalPanel');
  const content = document.getElementById('modalContent');

  content.innerHTML = renderModalContent(game);
  overlay.classList.add('active');
  isOpen = true;

  // Attach event listeners
  content.querySelector('#modalCalendarBtn')?.addEventListener('click', () => downloadCalendar(game));
  content.querySelector('#modalTicketsBtn')?.addEventListener('click', () => openTickets(game));

  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
  document.getElementById('modalClose').onclick = closeModal;
  document.onkeydown = (e) => { if (e.key === 'Escape') closeModal(); };
}

export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  isOpen = false;
  document.onkeydown = null;
}

async function downloadCalendar(game) {
  const ics = generateICS(game);
  
  if (window.electronAPI?.downloadICS) {
    const result = await window.electronAPI.downloadICS(ics);
    if (result.success) {
      updateCalendarBtn();
    }
  } else {
    // Web fallback: Create a blob and download it
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yankees-game-${game.gamePk || Date.now()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateCalendarBtn();
  }
}

function updateCalendarBtn() {
  const btn = document.getElementById('modalCalendarBtn');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = '✓ SAVED';
  btn.style.color = 'var(--green-live)';
  setTimeout(() => { btn.textContent = original; btn.style.color = ''; }, 2000);
}

function openTickets(game) {
  const query = encodeURIComponent(`${game.awayTeam.name} at ${game.homeTeam.name} ${formatDate(game.date)}`);
  const url = `https://www.stubhub.com/search?q=${query}`;
  
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

function renderModalContent(game) {
  const status = getGameStatus(game);
  const isNYYHome = game.homeTeam.id === 147;
  const opponent = isNYYHome ? game.awayTeam : game.homeTeam;
  const nyyTeam = isNYYHome ? game.homeTeam : game.awayTeam;
  const oppTeam = isNYYHome ? game.awayTeam : game.homeTeam;
  const nyyScore = nyyTeam.score ?? 0;
  const oppScore = oppTeam.score ?? 0;
  const broadcasts = getBroadcasts(game);

  const d = new Date(game.date);
  const monthName = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const dayNum = d.getDate();

  // Probable pitchers (would come from API in live version)
  const pitchersHtml = `
    <div class="modal-pitchers">
      <div class="modal-pitcher">
        <div class="modal-pitcher-role">AWAY</div>
        <div class="modal-pitcher-name">${oppTeam.name} Starter</div>
        <div class="modal-pitcher-stat">TBD</div>
      </div>
      <div class="modal-pitcher">
        <div class="modal-pitcher-role">HOME</div>
        <div class="modal-pitcher-name">Yankees Starter</div>
        <div class="modal-pitcher-stat">TBD</div>
      </div>
    </div>`;

  // Score display
  let scoreHtml = '';
  if (status === 'FINAL' || status === 'LIVE') {
    const won = nyyTeam.isWinner;
    scoreHtml = `
      <div class="modal-score-block">
        <div class="modal-score ${won ? 'winner' : ''}">${nyyScore}</div>
        <div style="font-family:var(--font-mono);font-size:28px;color:#555;line-height:1">–</div>
        <div class="modal-score ${!won && status === 'FINAL' ? 'winner' : ''}">${oppScore}</div>
      </div>
      <div class="modal-inning">${game.detailedState || 'FINAL'}</div>`;
  } else {
    scoreHtml = `
      <div class="modal-score-block">
        <div class="modal-score" style="font-size:28px;color:var(--text-muted)">
          ${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}
        </div>
        <div class="modal-inning" style="color:var(--text-muted)">FIRST PITCH · ET</div>
      </div>`;
  }

  // Series info
  let seriesHtml = '';
  if (game.seriesInfo) {
    seriesHtml = `
      <div class="modal-series-info">
        ${game.seriesDescription || 'Regular Season'}<br/>
        ${game.seriesInfo.gameNumber ? `Game ${game.seriesInfo.gameNumber}` : ''}
      </div>`;
  }

  // Weather (mock for now — MLB API has weather in gameData)
  const weatherHtml = `
    <div class="modal-weather">
      <div class="modal-weather-icon">☀️</div>
      <div>
        <div class="modal-weather-temp">72°F</div>
        <div class="modal-weather-desc">Clear</div>
        <div class="modal-weather-wind">Wind: 8mph L</div>
      </div>
    </div>`;

  const nyLogo = getLogoSvg('NYY', '#003087');
  const oppLogo = getLogoSvg(oppTeam.abbreviation, getTeamColor(oppTeam.abbreviation));

  return `
    <div class="modal-game-header">
      <div class="modal-date-badge">
        <span class="modal-date-month">${monthName}</span>
        <span class="modal-date-day">${dayNum}</span>
      </div>
      ${seriesHtml}
    </div>

    <div class="modal-teams">
      <div class="modal-team">
        <div class="modal-team-logo">${nyLogo}</div>
        <span class="modal-team-name" style="color:var(--navy-yankees)">YANKEES</span>
      </div>
      ${scoreHtml}
      <div class="modal-team">
        <div class="modal-team-logo">${oppLogo}</div>
        <span class="modal-team-name">${oppTeam.name}</span>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">GAME DETAILS</div>
      ${renderDetailRows(game, isNYYHome)}
    </div>

    <div class="modal-section">
      <div class="modal-section-title">PROBABLE PITCHERS</div>
      ${pitchersHtml}
    </div>

    <div class="modal-section">
      <div class="modal-section-title">WEATHER FORECAST</div>
      ${weatherHtml}
    </div>

    ${broadcasts.length > 0 ? `
    <div class="modal-section">
      <div class="modal-section-title">WATCH</div>
      <div style="display:flex;gap:8px;">
        ${broadcasts.map(b => `<span class="watch-badge">${b}</span>`).join('')}
      </div>
    </div>` : ''}

    <div class="modal-actions">
      <button class="modal-btn modal-btn-secondary" id="modalTicketsBtn">
        🎟️ TICKETS
      </button>
      <button class="modal-btn modal-btn-primary" id="modalCalendarBtn">
        📅 ADD TO CALENDAR
      </button>
    </div>
  `;
}

function renderDetailRows(game, isNYYHome) {
  const rows = [
    ['VENUE', game.venue?.name || 'TBD'],
    ['LOCATION', game.venue?.city || ''],
    ['DATE', formatDate(game.date)],
    ['TIME', formatTime(game.date) + ' ET'],
    ['SERIES', game.seriesDescription || 'Regular Season'],
  ];
  if (game.dayNight) rows.push(['TIME OF DAY', game.dayNight.toUpperCase()]);

  return rows.map(([label, value]) => `
    <div class="modal-detail-row">
      <span class="modal-detail-label">${label}</span>
      <span class="modal-detail-value">${value}</span>
    </div>
  `).join('');
}

function getLogoSvg(abbr, color) {
  return `<svg width="64" height="64" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="${color}"/>
    <text x="32" y="38" text-anchor="middle" font-family="Oswald,sans-serif"
          font-size="18" font-weight="700" fill="#fff">${abbr}</text>
  </svg>`;
}

function getTeamColor(abbr) {
  const colors = {
    'BOS':'#C62A3A','TOR':'#134A8E','BAL':'#DF4601','TB':'#092D5B',
    'CLE':'#0C2340','CWS':'#000000','KC':'#004687','MIN':'#002B5B',
    'DET':'#0C2340','STL':'#C41E3A','CHC':'#0E3386','NYM':'#003E8C',
    'ATL':'#0C2340','LAD':'#005A9C','SFG':'#FD5A1E','PHI':'#284B93',
    'WSH':'#BD3039','MIA':'#00A3E0','MIL':'#0A2351','CIN':'#C6011F',
    'PIT':'#FDB827','COL':'#33006F','AZ':'#A13334','SD':'#002D62',
    'TEX':'#C0111F','HOU':'#EB6E1F','OAK':'#006847','SEA':'#005C5C',
    'LAA':'#BA0021',
  };
  return colors[abbr] || '#555555';
}

window.openModal = openModal;
