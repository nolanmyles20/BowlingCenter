// js/frontdesk.js
import { getState, updateLane, resetLane, listTeams } from './state.js';

const LEAGUES = [
  'Open Bowling',
  'Tuesday Mixed',
  'Men\'s League',
  'Women\'s League',
  'Youth League'
];

function renderLanes() {
  const state = getState();
  const tbody = document.querySelector('#lanes-table tbody');
  tbody.innerHTML = '';

  const teams = listTeams();

  Object.values(state.lanes).forEach(lane => {
    const tr = document.createElement('tr');
    tr.dataset.lane = lane.id;

    const teamOptions = [
      '<option value="">-- None --</option>',
      ...teams.map(t => {
        const sel = t.id === lane.teamId ? 'selected' : '';
        const label = t.league ? `${t.name} (${t.league})` : t.name;
        return `<option value="${t.id}" ${sel}>${label}</option>`;
      })
    ].join('');

    const leagueOptions = [
      '<option value="">-- None --</option>',
      ...LEAGUES.map(l => {
        const sel = l === lane.league ? 'selected' : '';
        return `<option value="${l}" ${sel}>${l}</option>`;
      })
    ].join('');

    const modeOptions = `
      <option value="standard" ${lane.mode === 'standard' ? 'selected' : ''}>Standard</option>
      <option value="9pin" ${lane.mode === '9pin' ? 'selected' : ''}>9-Pin</option>
    `;

    tr.innerHTML = `
      <td>${lane.id}</td>
      <td><input type="checkbox" class="lane-active" ${lane.active ? 'checked' : ''}></td>
      <td><select class="lane-league">${leagueOptions}</select></td>
      <td><select class="lane-mode">${modeOptions}</select></td>
      <td><select class="lane-team">${teamOptions}</select></td>
      <td>
        <button class="btn-small btn-save">Save</button>
        <button class="btn-small btn-reset">Reset Game</button>
        <a href="lane.html?lane=${lane.id}" class="btn-small">Open Lane</a>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachHandlers();
}

function attachHandlers() {
  document.querySelectorAll('.btn-save').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const laneId = Number(row.dataset.lane);
      const active = row.querySelector('.lane-active').checked;
      const league = row.querySelector('.lane-league').value;
      const mode = row.querySelector('.lane-mode').value;
      const teamVal = row.querySelector('.lane-team').value;
      const teamId = teamVal ? Number(teamVal) : null;

      updateLane(laneId, { active, league, mode, teamId });
      alert(`Lane ${laneId} saved`);
    };
  });

  document.querySelectorAll('.btn-reset').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const laneId = Number(row.dataset.lane);
      resetLane(laneId);
      alert(`Lane ${laneId} game reset`);
    };
  });
}

document.addEventListener('DOMContentLoaded', renderLanes);
