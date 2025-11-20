// js/frontdesk.js
import { getLane, updateLane, listTeams, resetLane } from './state.js';

const LEAGUES = [
  'Open Bowling',
  'Tuesday Mixed',
  "Men\'s League",
  "Women\'s League",
  'Youth League'
];

let teamsCache = [];

/* ---------------- helpers ---------------- */

function loadTeams() {
  teamsCache = listTeams();
}

function buildLeagueOptions(selectedLeague) {
  let html = '<option value="">-- None --</option>';
  LEAGUES.forEach(lg => {
    const sel = lg === selectedLeague ? ' selected' : '';
    html += `<option value="${lg}"${sel}>${lg}</option>`;
  });
  return html;
}

function buildTeamOptions(selectedId) {
  let html = '<option value="">-- None --</option>';
  teamsCache.forEach(t => {
    const label = t.league ? `${t.name} (${t.league})` : t.name;
    const sel = selectedId && Number(selectedId) === Number(t.id) ? ' selected' : '';
    html += `<option value="${t.id}"${sel}>${label}</option>`;
  });
  return html;
}

/* ---------------- render ---------------- */

function renderLanes() {
  const tbody = document.getElementById('lanes-table-body');
  tbody.innerHTML = '';

  for (let laneId = 1; laneId <= 12; laneId++) {
    const lane = getLane(laneId);
    const tr = document.createElement('tr');
    tr.dataset.laneId = laneId;

    const leagueOptions = buildLeagueOptions(lane.league || '');
    const teamOptions = buildTeamOptions(lane.teamId);

    tr.innerHTML = `
      <td>${laneId}</td>
      <td>
        <button class="btn-small btn-status">
          ${lane.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td>
        <select class="lane-league-select">
          ${leagueOptions}
        </select>
      </td>
      <td>
        <select class="lane-mode-select">
          <option value="standard"${lane.mode === 'standard' ? ' selected' : ''}>Standard</option>
          <option value="9pin"${lane.mode === '9pin' ? ' selected' : ''}>9-Pin No-Tap</option>
        </select>
      </td>
      <td>
        <select class="lane-team-select">
          ${teamOptions}
        </select>
      </td>
      <td>
        <button class="btn-small btn-open">Open</button>
        <button class="btn-small btn-reset">Reset Game</button>
      </td>
    `;

    tbody.appendChild(tr);
  }

  attachLaneHandlers();
}

/* ---------------- events ---------------- */

function attachLaneHandlers() {
  document.querySelectorAll('#lanes-table-body tr').forEach(row => {
    const laneId = Number(row.dataset.laneId);
    const statusBtn = row.querySelector('.btn-status');
    const leagueSelect = row.querySelector('.lane-league-select');
    const modeSelect = row.querySelector('.lane-mode-select');
    const teamSelect = row.querySelector('.lane-team-select');
    const openBtn = row.querySelector('.btn-open');
    const resetBtn = row.querySelector('.btn-reset');

    // Toggle Active/Inactive
    statusBtn.onclick = (e) => {
      e.stopPropagation();
      const lane = getLane(laneId);
      updateLane(laneId, { active: !lane.active });
      renderLanes();
    };

    // League dropdown change
    leagueSelect.onchange = (e) => {
      e.stopPropagation();
      updateLane(laneId, { league: leagueSelect.value });
    };

    // Mode change
    modeSelect.onchange = (e) => {
      e.stopPropagation();
      updateLane(laneId, { mode: modeSelect.value });
      renderLanes();
    };

    // Team change → assigns roster to that lane
    teamSelect.onchange = (e) => {
      e.stopPropagation();
      const val = teamSelect.value;
      const teamId = val ? Number(val) : null;
      updateLane(laneId, {
        teamId,
        players: [],          // clear cached players; lane.js / state.js will rebuild from team
        currentPlayerIndex: 0
      });
      renderLanes();
    };

    // Open lane button
    openBtn.onclick = (e) => {
      e.stopPropagation();
      window.location.href = `lane.html?lane=${laneId}`;
    };

    // Reset game
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Reset game on Lane ${laneId}?`)) {
        resetLane(laneId);
        renderLanes();
      }
    };

    // Clicking the whole row (except on controls) opens lane
    row.onclick = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'button' || tag === 'select') return;
      window.location.href = `lane.html?lane=${laneId}`;
    };
  });
}

/* ---------------- init ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  loadTeams();
  renderLanes();
});
