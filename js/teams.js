// js/teams.js
import {
  listTeams,
  listBowlers,
  createTeam,
  updateTeam,
  deleteTeam,
  setTeamRoster,
  getState
} from './state.js';

const LEAGUES = [
  'Open Bowling',
  'Tuesday Mixed',
  "Men's League",
  "Women\'s League",
  'Youth League'
];

const TEAMS_CSV_URL = 'data/teams.csv'; // expected headers: team_id,team_name,league (extra columns ignored)

/* ------------------------------------------------
   Small CSV helper (very forgiving)
-------------------------------------------------- */

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

/* ------------------------------------------------
   Seed teams from CSV if state has none
-------------------------------------------------- */

async function seedTeamsFromCsvIfEmpty() {
  const existing = listTeams();
  if (existing && existing.length) return; // already have teams

  try {
    const resp = await fetch(TEAMS_CSV_URL);
    if (!resp.ok) return;
    const text = await resp.text();
    const rows = parseCsv(text);

    rows.forEach(row => {
      // try a few possible header names
      const name =
        row.team_name ||
        row.TeamName ||
        row.name ||
        row.Name ||
        '';
      const league =
        row.league ||
        row.League ||
        row.league_name ||
        '';

      if (!name) return;
      createTeam({ name, league });
    });
  } catch (err) {
    console.warn('Could not seed teams from CSV:', err);
  }
}

/* ------------------------------------------------
   League select + bowler options
-------------------------------------------------- */

function populateLeagueSelect(selectedLeague = '') {
  const sel = document.getElementById('team-league');
  if (!sel) return;

  const state = getState();
  const leagueKeys = Object.keys(state.leagues || {});
  const allLeagues = Array.from(new Set([...LEAGUES, ...leagueKeys]));

  sel.innerHTML = '<option value="">-- None --</option>';

  allLeagues.forEach(lg => {
    if (!lg) return;
    const opt = document.createElement('option');
    opt.value = lg;
    opt.textContent = lg;
    if (lg === selectedLeague) opt.selected = true;
    sel.appendChild(opt);
  });
}

function formatBowlerName(b) {
  if (!b) return '';
  if (b.name) return b.name;
  const parts = [];
  if (b.first_name) parts.push(b.first_name);
  if (b.last_name) parts.push(b.last_name);
  return parts.join(' ') || 'Bowler';
}

function populateRosterBowlers(selectedIds = []) {
  const sel = document.getElementById('roster-bowlers');
  if (!sel) return;

  const bowlers = listBowlers();
  const selectedSet = new Set(selectedIds.map(id => Number(id)));

  // sort by last name if we can guess it, otherwise by name
  bowlers.sort((a, b) => {
    const an = (a.last_name || a.name || '').toLowerCase();
    const bn = (b.last_name || b.name || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  sel.innerHTML = '';

  bowlers.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    const name = formatBowlerName(b);
    const leagueTag = b.league ? ` (${b.league})` : '';
    opt.textContent = name + leagueTag;
    if (selectedSet.has(Number(b.id))) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });
}

/* ------------------------------------------------
   Team form helpers
-------------------------------------------------- */

function resetTeamForm() {
  document.getElementById('team-id').value = '';
  document.getElementById('team-name').value = '';
  populateLeagueSelect('');
  document.getElementById('team-form-title').textContent = 'Add Team';
  document.getElementById('btn-team-cancel').style.display = 'none';
}

function openFormForTeam(team) {
  document.getElementById('team-id').value = team.id;
  document.getElementById('team-name').value = team.name || '';
  populateLeagueSelect(team.league || '');
  document.getElementById('team-form-title').textContent = 'Edit Team';
  document.getElementById('btn-team-cancel').style.display = 'inline-block';
}

/* ------------------------------------------------
   Roster editor helpers
-------------------------------------------------- */

let currentRosterTeamId = null;

function openRosterEditor(team) {
  currentRosterTeamId = team.id;
  const panel = document.getElementById('roster-editor');
  const title = document.getElementById('roster-title');
  const nameEl = document.getElementById('roster-team-name');

  if (title) title.textContent = 'Edit Roster';
  if (nameEl) nameEl.textContent = team.name || '';
  if (panel) panel.style.display = '';

  const bowlerIds = (team.bowlerIds || []).map(Number);
  populateRosterBowlers(bowlerIds);
}

function closeRosterEditor() {
  const panel = document.getElementById('roster-editor');
  if (panel) panel.style.display = 'none';
  currentRosterTeamId = null;
}

/* ------------------------------------------------
   Render teams table
-------------------------------------------------- */

function renderTeams() {
  const tbody = document.getElementById('teams-table-body');
  if (!tbody) return;

  const teams = listTeams();
  const bowlers = listBowlers();
  const bowlerMap = new Map();
  bowlers.forEach(b => bowlerMap.set(Number(b.id), b));

  if (!teams.length) {
    tbody.innerHTML = '<tr><td colspan="4">No teams yet. Add one above.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  teams.forEach(team => {
    const tr = document.createElement('tr');
    tr.dataset.teamId = team.id;

    const leagueText = team.league || '';

    const rosterNames = (team.bowlerIds || [])
      .map(id => {
        const b = bowlerMap.get(Number(id));
        return formatBowlerName(b);
      })
      .filter(Boolean)
      .join(', ');

    tr.innerHTML = `
      <td>${team.name || ''}</td>
      <td>${leagueText}</td>
      <td>${rosterNames || '<span style="color:#9ca3af;">(empty)</span>'}</td>
      <td>
        <button class="btn-small btn-edit">Edit</button>
        <button class="btn-small btn-roster">Roster</button>
        <button class="btn-small btn-secondary btn-delete">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachRowHandlers();
}

/* ------------------------------------------------
   Row button handlers
-------------------------------------------------- */

function attachRowHandlers() {
  const tbody = document.getElementById('teams-table-body');
  if (!tbody) return;

  tbody.querySelectorAll('tr').forEach(tr => {
    const teamId = Number(tr.dataset.teamId);
    if (!teamId) return;
    const team = listTeams().find(t => Number(t.id) === teamId);
    if (!team) return;

    const editBtn = tr.querySelector('.btn-edit');
    const rosterBtn = tr.querySelector('.btn-roster');
    const deleteBtn = tr.querySelector('.btn-delete');

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFormForTeam(team);
      });
    }

    if (rosterBtn) {
      rosterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRosterEditor(team);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete team "${team.name}"?`)) {
          deleteTeam(team.id);
          renderTeams();
          closeRosterEditor();
          resetTeamForm();
        }
      });
    }
  });
}

/* ------------------------------------------------
   Form submit handlers
-------------------------------------------------- */

function onTeamSubmit(e) {
  e.preventDefault();

  const idStr = document.getElementById('team-id').value.trim();
  const name = document.getElementById('team-name').value.trim();
  const league = document.getElementById('team-league').value.trim();

  if (!name) {
    alert('Team name is required');
    return;
  }

  if (idStr) {
    const id = Number(idStr);
    updateTeam(id, { name, league });
  } else {
    createTeam({ name, league });
  }

  resetTeamForm();
  renderTeams();
}

function onRosterSave() {
  if (!currentRosterTeamId) return;
  const sel = document.getElementById('roster-bowlers');
  if (!sel) return;

  const ids = Array.from(sel.selectedOptions || []).map(opt => Number(opt.value));
  setTeamRoster(currentRosterTeamId, ids);
  renderTeams();
  closeRosterEditor();
}

/* ------------------------------------------------
   Init
-------------------------------------------------- */

async function initTeamsPage() {
  await seedTeamsFromCsvIfEmpty();

  populateLeagueSelect();
  populateRosterBowlers();
  renderTeams();

  const form = document.getElementById('team-form');
  if (form) form.addEventListener('submit', onTeamSubmit);

  const cancelBtn = document.getElementById('btn-team-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', resetTeamForm);

  const rosterSave = document.getElementById('btn-roster-save');
  if (rosterSave) rosterSave.addEventListener('click', onRosterSave);

  const rosterCancel = document.getElementById('btn-roster-cancel');
  if (rosterCancel) rosterCancel.addEventListener('click', closeRosterEditor);
}

document.addEventListener('DOMContentLoaded', () => {
  initTeamsPage();
});
