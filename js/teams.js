// js/teams.js
import {
  listTeams,
  listBowlers,
  createTeam,
  updateTeam,
  deleteTeam,
  setTeamRoster
} from './state.js';

const LEAGUES = [
  'Open Bowling',
  'Tuesday Mixed',
  'Men\'s League',
  'Women\'s League',
  'Youth League'
];

let currentRosterTeamId = null;

function populateLeagueSelect() {
  const select = document.getElementById('team-league');
  select.innerHTML = '<option value="">-- None --</option>' +
    LEAGUES.map(l => `<option value="${l}">${l}</option>`).join('');
}

function populateRosterBowlers() {
  const select = document.getElementById('roster-bowlers');
  const bowlers = listBowlers();
  select.innerHTML = bowlers.map(b => {
    const label = b.league ? `${b.name} (${b.league})` : b.name;
    return `<option value="${b.id}">${label}</option>`;
  }).join('');
}

function renderTeams() {
  const teams = listTeams();
  const tbody = document.getElementById('teams-table-body');
  tbody.innerHTML = '';

  const bowlers = listBowlers();
  const bowlersById = {};
  bowlers.forEach(b => { bowlersById[b.id] = b; });

  teams.forEach(t => {
    const tr = document.createElement('tr');
    tr.dataset.id = t.id;

    const rosterNames = (t.bowlerIds || [])
      .map(id => bowlersById[id]?.name || `(ID ${id})`)
      .join(', ');

    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.league || ''}</td>
      <td>${rosterNames || '<em>No bowlers</em>'}</td>
      <td>
        <button class="btn-small btn-team-edit">Edit</button>
        <button class="btn-small btn-team-delete">Delete</button>
        <button class="btn-small btn-team-roster">Edit Roster</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachTeamRowHandlers();
}

function attachTeamRowHandlers() {
  document.querySelectorAll('.btn-team-edit').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const cells = row.children;
      document.getElementById('team-id').value = id;
      document.getElementById('team-name').value = cells[0].textContent;
      document.getElementById('team-league').value = cells[1].textContent || '';

      document.getElementById('team-form-title').textContent = 'Edit Team';
      document.getElementById('btn-team-save').textContent = 'Update Team';
      document.getElementById('btn-team-cancel').style.display = 'inline-block';
    };
  });

  document.querySelectorAll('.btn-team-delete').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      if (confirm('Delete this team?')) {
        deleteTeam(id);
        renderTeams();
      }
    };
  });

  document.querySelectorAll('.btn-team-roster').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      openRosterEditor(Number(id));
    };
  });
}

function resetTeamForm() {
  document.getElementById('team-id').value = '';
  document.getElementById('team-name').value = '';
  document.getElementById('team-league').value = '';

  document.getElementById('team-form-title').textContent = 'Add Team';
  document.getElementById('btn-team-save').textContent = 'Save Team';
  document.getElementById('btn-team-cancel').style.display = 'none';
}

function onTeamSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('team-id').value;
  const name = document.getElementById('team-name').value.trim();
  const league = document.getElementById('team-league').value;

  if (!name) {
    alert('Team name is required');
    return;
  }

  if (id) {
    updateTeam(id, { name, league });
  } else {
    createTeam({ name, league });
  }

  resetTeamForm();
  renderTeams();
}

function openRosterEditor(teamId) {
  currentRosterTeamId = teamId;
  const teams = listTeams();
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  document.getElementById('roster-team-name').textContent = team.name;
  document.getElementById('roster-title').textContent = `Edit Roster: ${team.name}`;
  populateRosterBowlers();

  const select = document.getElementById('roster-bowlers');
  const idsSet = new Set((team.bowlerIds || []).map(String));
  Array.from(select.options).forEach(opt => {
    opt.selected = idsSet.has(opt.value);
  });

  document.getElementById('roster-editor').style.display = 'block';
}

function closeRosterEditor() {
  document.getElementById('roster-editor').style.display = 'none';
  currentRosterTeamId = null;
}

function onRosterSave() {
  if (!currentRosterTeamId) return;
  const select = document.getElementById('roster-bowlers');
  const selectedIds = Array.from(select.selectedOptions).map(o => Number(o.value));
  setTeamRoster(currentRosterTeamId, selectedIds);
  renderTeams();
  closeRosterEditor();
}

document.addEventListener('DOMContentLoaded', () => {
  populateLeagueSelect();
  populateRosterBowlers();
  renderTeams();

  document.getElementById('team-form').addEventListener('submit', onTeamSubmit);
  document.getElementById('btn-team-cancel').addEventListener('click', resetTeamForm);
  document.getElementById('btn-roster-save').addEventListener('click', onRosterSave);
  document.getElementById('btn-roster-cancel').addEventListener('click', closeRosterEditor);
});
