// js/teams.js
import {
  seedFromCSVsIfNeeded,
  listTeams,
  listBowlers,
  createTeam,
  updateTeam,
  deleteTeam,
  setTeamRoster,
  listLeagueNames
} from './state.js';

/* ---------- helpers ---------- */

function buildLeagueOptions(selected) {
  const leagues = listLeagueNames();
  let html = '<option value="">-- None --</option>';
  leagues.forEach(name => {
    const sel = name === selected ? ' selected' : '';
    html += `<option value="${name}"${sel}>${name}</option>`;
  });
  return html;
}

function renderTeamsTable() {
  const tbody = document.getElementById('teams-table-body');
  if (!tbody) return;

  const teams = listTeams().slice().sort((a, b) => {
    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  const bowlersById = {};
  listBowlers().forEach(b => {
    bowlersById[b.id] = b;
  });

  tbody.innerHTML = '';

  teams.forEach(team => {
    const tr = document.createElement('tr');
    tr.dataset.id = team.id;

    const league = team.league || '';

    const rosterNames = (team.bowlerIds || []).map(id => {
      const b = bowlersById[id];
      if (!b) return '';
      return b.name || `${b.firstName || ''} ${b.lastName || ''}`.trim();
    }).filter(Boolean);

    tr.innerHTML = `
      <td>${team.name}</td>
      <td>${league}</td>
      <td>${rosterNames.join(', ')}</td>
      <td>
        <button class="btn-small btn-team-edit">Edit</button>
        <button class="btn-small btn-team-roster">Roster</button>
        <button class="btn-small btn-team-delete">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachTeamRowHandlers();
}

function openRosterEditor(teamId) {
  const team = listTeams().find(t => String(t.id) === String(teamId));
  if (!team) return;

  const allBowlers = listBowlers().slice().sort((a, b) => {
    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  const rosterSelect = document.getElementById('roster-bowlers');
  const rosterTitle = document.getElementById('roster-title');
  const rosterTeamName = document.getElementById('roster-team-name');
  const editorSection = document.getElementById('roster-editor');

  rosterSelect.innerHTML = '';
  rosterTitle.textContent = 'Edit Roster';
  rosterTeamName.textContent = `${team.name} (${team.league || 'No League'})`;

  const currentIds = new Set(team.bowlerIds || []);

  allBowlers.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    const name = b.name || `${b.firstName || ''} ${b.lastName || ''}`.trim();
    opt.textContent = name;
    if (currentIds.has(b.id)) {
      opt.selected = true;
    }
    rosterSelect.appendChild(opt);
  });

  editorSection.dataset.teamId = team.id;
  editorSection.style.display = 'block';
}

function attachTeamRowHandlers() {
  document.querySelectorAll('.btn-team-edit').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const team = listTeams().find(t => String(t.id) === String(id));
      if (!team) return;

      document.getElementById('team-id').value = team.id;
      document.getElementById('team-name').value = team.name || '';
      const leagueSelect = document.getElementById('team-league');
      leagueSelect.innerHTML = buildLeagueOptions(team.league || '');

      document.getElementById('team-form-title').textContent = 'Edit Team';
      document.getElementById('btn-team-save').textContent = 'Update Team';
      document.getElementById('btn-team-cancel').style.display = 'inline-block';
    };
  });

  document.querySelectorAll('.btn-team-roster').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      openRosterEditor(id);
    };
  });

  document.querySelectorAll('.btn-team-delete').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      if (!confirm('Delete this team?')) return;
      deleteTeam(id);
      renderTeamsTable();
      document.getElementById('roster-editor').style.display = 'none';
    };
  });
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  // Import CSV data first (leagues, bowlers, teams, rosters)
  await seedFromCSVsIfNeeded();

  // Set up league dropdown in team form
  const leagueSelect = document.getElementById('team-league');
  if (leagueSelect) {
    leagueSelect.innerHTML = buildLeagueOptions('');
  }

  renderTeamsTable();

  const form = document.getElementById('team-form');
  const cancelBtn = document.getElementById('btn-team-cancel');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const idVal = document.getElementById('team-id').value;
    const name = document.getElementById('team-name').value.trim();
    const league = document.getElementById('team-league').value;

    if (!name) {
      alert('Team name is required');
      return;
    }

    const payload = { name, league };

    if (idVal) {
      updateTeam(idVal, payload);
    } else {
      createTeam(payload);
    }

    form.reset();
    document.getElementById('team-id').value = '';
    document.getElementById('team-form-title').textContent = 'Add Team';
    document.getElementById('btn-team-save').textContent = 'Save Team';
    cancelBtn.style.display = 'none';

    renderTeamsTable();
  });

  cancelBtn.addEventListener('click', () => {
    form.reset();
    document.getElementById('team-id').value = '';
    document.getElementById('team-form-title').textContent = 'Add Team';
    document.getElementById('btn-team-save').textContent = 'Save Team';
    cancelBtn.style.display = 'none';
  });

  // Roster editor buttons
  const rosterSave = document.getElementById('btn-roster-save');
  const rosterCancel = document.getElementById('btn-roster-cancel');
  const rosterEditor = document.getElementById('roster-editor');

  rosterSave.addEventListener('click', () => {
    const teamId = rosterEditor.dataset.teamId;
    if (!teamId) return;

    const sel = document.getElementById('roster-bowlers');
    const selectedIds = Array.from(sel.selectedOptions).map(o => Number(o.value));

    setTeamRoster(teamId, selectedIds);
    renderTeamsTable();
    rosterEditor.style.display = 'none';
  });

  rosterCancel.addEventListener('click', () => {
    rosterEditor.style.display = 'none';
  });
});
