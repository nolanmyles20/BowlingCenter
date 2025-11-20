// js/frontdesk.js
import { getLane, updateLane, listTeams, resetLane } from './state.js';

let teamsCache = [];

function loadTeams() {
  teamsCache = listTeams();
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

function renderLanes() {
  const tbody = document.getElementById('lanes-table-body');
  tbody.innerHTML = '';

  for (let laneId = 1; laneId <= 12; laneId++) {
    const lane = getLane(laneId);
    const tr = document.createElement('tr');
    tr.dataset.laneId = laneId;

    const teamOptions = buildTeamOptions(lane.teamId);

    tr.innerHTML = `
      <td>${laneId}</td>
      <td>
        <button class="btn-small btn-status">
          ${lane.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td>
        <input class="lane-league-input" value="${lane.league || ''}" />
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

function attachLaneHandlers() {
  document.querySelectorAll('#lanes-table-body tr').forEach(row => {
    const laneId = Number(row.dataset.laneId);
    const statusBtn = row.querySelector('.btn-status');
    const leagueInput = row.querySelector('.lane-league-input');
    const modeSelect = row.querySelector('.lane-mode-select');
    const teamSelect = row.querySelector('.lane-team-select');
    const openBtn = row.querySelector('.btn-open');
    const resetBtn = row.querySelector('.btn-reset');

    statusBtn.onclick = () => {
      const lane = getLane(laneId);
      updateLane(laneId, { active: !lane.active });
      renderLanes();
    };

    leagueInput.onchange = () => {
      updateLane(laneId, { league: leagueInput.value.trim() });
    };

    modeSelect.onchange = () => {
      updateLane(laneId, { mode: modeSelect.value });
      renderLanes();
    };

    teamSelect.onchange = () => {
      const val = teamSelect.value;
      const teamId = val ? Number(val) : null;
      // when team changes, clear players so lane will sync new team on open
      updateLane(laneId, {
        teamId,
        players: [],
        currentPlayerIndex: 0
      });
      renderLanes();
    };

    openBtn.onclick = () => {
      window.location.href = `lane.html?lane=${laneId}`;
    };

    resetBtn.onclick = () => {
      if (confirm(`Reset game on Lane ${laneId}?`)) {
        resetLane(laneId);
        renderLanes();
      }
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadTeams();
  renderLanes();
});
