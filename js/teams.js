// js/teams.js
// Load teams, leagues, bowlers, and team rosters directly from CSV in /data
// No localStorage, no state.js

/* ---------- in-memory data ---------- */

let leagues = [];      // [{ id, name, season, centerId }]
let bowlers = [];      // [{ id, firstName, lastName, gender, handicap, name }]
let teams = [];        // [{ id, teamId, name, leagueId, leagueName, teamNumber, bowlerIds: [bowlerId,...] }]
let leagueNames = [];  // ["2025-26 Wednesday Mixed League", ...]

/* ---------- CSV helpers ---------- */

async function fetchCSV(path) {
  const res = await fetch(path);
  if (!res.ok) {
    console.error('Failed to load CSV:', path, res.status);
    return [];
  }
  const text = await res.text();
  return parseCSV(text);
}

// Simple CSV parser – assumes no quoted commas in data
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] || '').trim();
    });
    rows.push(obj);
  }

  return rows;
}

/* ---------- data loading from CSV ---------- */

async function loadDataFromCSVs() {
  // NOTE: all CSVs live in /data
  const [leagueRows, bowlerRows, teamRows, rosterRows] = await Promise.all([
    fetchCSV('data/leagues.csv'),
    fetchCSV('data/bowlers.csv'),
    fetchCSV('data/teams.csv'),
    fetchCSV('data/team_roster.csv')
  ]);

  // ---- Leagues ----
  const leagueById = {};
  leagues = leagueRows.map(row => {
    const id = (row.league_id || '').trim();
    const name = (row.name || '').trim();
    const season = (row.season || '').trim();
    const centerId = (row.center_id || '').trim();

    if (id && name) {
      leagueById[id] = name;
    }

    return { id, name, season, centerId };
  });

  leagueNames = Array.from(new Set(leagues.map(l => l.name).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  // ---- Bowlers ----
  const bowlersById = {};
  bowlers = bowlerRows.map(row => {
    const id = (row.bowler_id || '').trim();
    const firstName = (row.first_name || '').trim();
    const lastName = (row.last_name || '').trim();
    const gender = (row.gender || '').trim();
    const handicap = row.hcp ? Number(row.hcp) || 0 : 0;
    const name = `${firstName} ${lastName}`.trim();

    const b = { id, firstName, lastName, gender, handicap, name };
    if (id) bowlersById[id] = b;
    return b;
  });

  // ---- Team roster (league_id + team_number) -> [bowler_id,...] ----
  const rosterByTeamKey = {};
  rosterRows.forEach(row => {
    const leagueId = (row.league_id || '').trim();
    const teamNumber = (row.team_number || '').trim(); // numeric string "1", "2", etc.
    const bowlerId = (row.bowler_id || '').trim();

    if (!leagueId || !teamNumber || !bowlerId) return;

    const key = `${leagueId}|${teamNumber}`;
    if (!rosterByTeamKey[key]) rosterByTeamKey[key] = [];
    rosterByTeamKey[key].push(bowlerId);
  });

  // ---- Teams ----
  teams = teamRows.map(row => {
    const teamId = (row.team_id || '').trim();         // "32170-01"
    const leagueId = (row.league_id || '').trim();     // "32170"
    const teamNumber = (row.team_number || '').trim(); // "1", "2", ...
    const teamName = (row.team_name || '').trim();

    const key = `${leagueId}|${teamNumber}`;
    const bowlerIds = rosterByTeamKey[key] || [];
    const leagueName = leagueById[leagueId] || '';

    return {
      id: teamId || key, // internal unique id
      teamId,
      name: teamName,
      leagueId,
      leagueName,
      teamNumber,
      bowlerIds
    };
  });

  // expose for render helpers
  window.__bowlersById = bowlersById;
}

/* ---------- UI helpers ---------- */

// league filter dropdown for Teams & Rosters table
function buildLeagueFilterOptions() {
  const select = document.getElementById('league-filter');
  if (!select) return;

  // Extract unique league names actually used by teams
  const usedLeagueNames = Array.from(
    new Set(teams.map(t => t.leagueName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  let html = `<option value="">All Leagues</option>`;
  usedLeagueNames.forEach(name => {
    html += `<option value="${name}">${name}</option>`;
  });

  select.innerHTML = html;
}

// league options for the Add/Edit Team form
function buildLeagueOptions(selected) {
  let html = '<option value="">-- None --</option>';
  leagueNames.forEach(name => {
    const sel = name === selected ? ' selected' : '';
    html += `<option value="${name}"${sel}>${name}</option>`;
  });
  return html;
}

function renderTeamsTable(filterLeague = '') {
  const tbody = document.getElementById('teams-table-body');
  if (!tbody) return;

  const bowlersById = window.__bowlersById || {};

  let filtered = teams;

  // APPLY LEAGUE FILTER
  if (filterLeague) {
    filtered = teams.filter(t => t.leagueName === filterLeague);
  }

  const sortedTeams = filtered.slice().sort((a, b) => {
    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  tbody.innerHTML = '';

  sortedTeams.forEach(team => {
    const tr = document.createElement('tr');
    tr.dataset.id = team.id;

    const rosterNames = (team.bowlerIds || [])
      .map(bid => {
        const b = bowlersById[bid];
        if (!b) return '';
        return b.name || `${b.firstName || ''} ${b.lastName || ''}`.trim();
      })
      .filter(Boolean);

    tr.innerHTML = `
      <td>${team.name}</td>
      <td>${team.leagueName || ''}</td>
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
  const team = teams.find(t => String(t.id) === String(teamId));
  if (!team) return;

  const allBowlers = bowlers.slice().sort((a, b) =>
    (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
  );

  const rosterSelect = document.getElementById('roster-bowlers');
  const rosterTitle = document.getElementById('roster-title');
  const rosterTeamName = document.getElementById('roster-team-name');
  const editorSection = document.getElementById('roster-editor');
  const rosterSearch = document.getElementById('roster-search');

  rosterSelect.innerHTML = '';
  rosterTitle.textContent = 'Edit Roster';
  rosterTeamName.textContent = `${team.name} (${team.leagueName || 'No League'})`;

  // Clear previous search when opening editor for a new team
  if (rosterSearch) {
    rosterSearch.value = '';
  }

  const currentIds = new Set(team.bowlerIds || []);

  allBowlers.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name || `${b.firstName || ''} ${b.lastName || ''}`.trim();
    if (currentIds.has(b.id)) opt.selected = true;
    rosterSelect.appendChild(opt);
  });

  editorSection.dataset.teamId = team.id;
  editorSection.style.display = 'block';
}

/* ---------- in-memory CRUD (no persistence) ---------- */

function createTeamInMemory({ name, leagueName }) {
  const id = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  teams.push({
    id,
    teamId: id,
    name,
    leagueId: '',
    leagueName,
    teamNumber: '',
    bowlerIds: []
  });
  return id;
}

function updateTeamInMemory(id, { name, leagueName }) {
  const team = teams.find(t => String(t.id) === String(id));
  if (!team) return;
  team.name = name;
  team.leagueName = leagueName;
}

function deleteTeamInMemory(id) {
  const idx = teams.findIndex(t => String(t.id) === String(id));
  if (idx >= 0) {
    teams.splice(idx, 1);
  }
}

function setTeamRosterInMemory(teamId, bowlerIds) {
  const team = teams.find(t => String(t.id) === String(teamId));
  if (!team) return;
  team.bowlerIds = bowlerIds.slice();
}

/* ---------- row button handlers ---------- */

function attachTeamRowHandlers() {
  document.querySelectorAll('.btn-team-edit').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const team = teams.find(t => String(t.id) === String(id));
      if (!team) return;

      document.getElementById('team-id').value = team.id;
      document.getElementById('team-name').value = team.name || '';
      const leagueSelect = document.getElementById('team-league');
      leagueSelect.innerHTML = buildLeagueOptions(team.leagueName || '');

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
      deleteTeamInMemory(id);
      renderTeamsTable(document.getElementById('league-filter').value);
      document.getElementById('roster-editor').style.display = 'none';
    };
  });
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDataFromCSVs();
  } catch (err) {
    console.error('Error loading CSV data for teams:', err);
  }

  // Set up league dropdown in team form
  const leagueSelect = document.getElementById('team-league');
  if (leagueSelect) {
    leagueSelect.innerHTML = buildLeagueOptions('');
  }

  // Build league filter dropdown
  buildLeagueFilterOptions();

  // Render table the first time (no filter)
  renderTeamsTable('');

  // Hook up league filter
  const leagueFilter = document.getElementById('league-filter');
  if (leagueFilter) {
    leagueFilter.addEventListener('change', e => {
      renderTeamsTable(e.target.value);
    });
  }

  // Form handlers
  const form = document.getElementById('team-form');
  const cancelBtn = document.getElementById('btn-team-cancel');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const idVal = document.getElementById('team-id').value;
    const name = document.getElementById('team-name').value.trim();
    const leagueName = document.getElementById('team-league').value;

    if (!name) {
      alert('Team name is required');
      return;
    }

    const payload = { name, leagueName };

    if (idVal) updateTeamInMemory(idVal, payload);
    else createTeamInMemory(payload);

    form.reset();
    document.getElementById('team-id').value = '';
    document.getElementById('team-form-title').textContent = 'Add Team';
    document.getElementById('btn-team-save').textContent = 'Save Team';
    cancelBtn.style.display = 'none';

    renderTeamsTable(document.getElementById('league-filter').value);
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
    const selectedIds = Array.from(sel.selectedOptions).map(o => o.value);

    setTeamRosterInMemory(teamId, selectedIds);
    renderTeamsTable(document.getElementById('league-filter').value);
    rosterEditor.style.display = 'none';
  });

  rosterCancel.addEventListener('click', () => {
    rosterEditor.style.display = 'none';
  });

  // NEW: Roster editor search for bowlers
  const rosterSearch = document.getElementById('roster-search');
  if (rosterSearch) {
    rosterSearch.addEventListener('input', () => {
      const q = rosterSearch.value.toLowerCase();
      const sel = document.getElementById('roster-bowlers');
      if (!sel) return;

      Array.from(sel.options).forEach(opt => {
        const text = opt.textContent.toLowerCase();
        opt.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }
});
