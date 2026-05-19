/* --- roster.js - Active Yankees roster panel ---------------------------- */

import { fetchTeamRoster } from './api.js';

const POSITION_GROUPS = [
  { key: 'P', label: 'PITCHERS', matches: ['P', 'SP', 'RP'] },
  { key: 'C', label: 'CATCHERS', matches: ['C'] },
  { key: 'IF', label: 'INFIELD', matches: ['1B', '2B', '3B', 'SS', 'IF'] },
  { key: 'OF', label: 'OUTFIELD', matches: ['LF', 'CF', 'RF', 'OF'] },
  { key: 'DH', label: 'DH / UTIL', matches: ['DH', 'TWP'] },
];

export async function renderRoster() {
  const list = document.getElementById('rosterList');
  const countEl = document.getElementById('rosterCount');
  const updatedEl = document.getElementById('rosterUpdated');
  if (!list) return;

  list.innerHTML = '<div class="roster-empty">Loading active roster...</div>';

  const result = await fetchTeamRoster('active');
  if (!result.ok) {
    list.innerHTML = '<div class="roster-empty">Roster unavailable</div>';
    if (countEl) countEl.textContent = '--';
    return;
  }

  const players = normalizeRoster(result.data?.roster || []);
  if (countEl) countEl.textContent = `${players.length} ACTIVE`;
  if (updatedEl) {
    updatedEl.textContent = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (!players.length) {
    list.innerHTML = '<div class="roster-empty">No active roster returned</div>';
    return;
  }

  list.innerHTML = POSITION_GROUPS
    .map(group => renderGroup(group, players))
    .filter(Boolean)
    .join('');
}

function normalizeRoster(rows) {
  return rows.map(row => ({
    id: row.person?.id,
    name: row.person?.fullName || 'Unknown Player',
    jerseyNumber: row.jerseyNumber || '--',
    position: row.position?.abbreviation || row.position?.code || 'UTIL',
    status: row.status?.description || '',
  })).sort((a, b) => {
    const aGroup = groupIndex(a.position);
    const bGroup = groupIndex(b.position);
    if (aGroup !== bGroup) return aGroup - bGroup;
    return a.name.localeCompare(b.name);
  });
}

function renderGroup(group, players) {
  const groupPlayers = players.filter(p => group.matches.includes(p.position));
  if (!groupPlayers.length) return '';

  return `
    <div class="roster-group">
      <div class="roster-group-title">${group.label}</div>
      ${groupPlayers.map(renderPlayer).join('')}
    </div>
  `;
}

function renderPlayer(player) {
  return `
    <div class="roster-row" data-player-id="${escapeAttr(player.id || '')}">
      <span class="roster-number">${escapeHtml(player.jerseyNumber)}</span>
      <span class="roster-name">${escapeHtml(shortName(player.name))}</span>
      <span class="roster-position">${escapeHtml(player.position)}</span>
    </div>
  `;
}

function groupIndex(position) {
  const index = POSITION_GROUPS.findIndex(group => group.matches.includes(position));
  return index === -1 ? POSITION_GROUPS.length : index;
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
