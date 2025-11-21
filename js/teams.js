// js/teams.js
import {
  listTeams,
  listBowlers,
  createBowler,
  createTeam,
  updateTeam,
  deleteTeam,
  setTeamRoster
} from './state.js';


// ---- CSV config ----
// leagues.csv: name,hcpBase
// bowlers.csv: name,gender,handicap,league
// teams.csv:   name,league,bowlers  (bowlers is a semicolon-separated list of bowler names)
const LEAGUES_CSV_URL = 'data/leagues.csv';
const BOWLERS_CSV_URL = 'data/bowlers.csv';
const TEAMS_CSV_URL = 'data/teams.csv';

let LEAGUES = [];         // from leagues.csv
let currentRosterTeamId = null;

// ---- CSV helpers ----

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (!cols.length || cols[0] === '') continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    rows.push(obj);
  }

  return rows;
}

async function loadLeaguesFromCsv() {
  try {
    const res = await fetch(LEAGUES_CSV_URL);
    if (!res.ok) return;
    const text = await res.text();
    const rows = parseCsv(text);
    LEAGUES = rows.map(r => r.name).filter(Boolean);
  } catch (err) {
    console.warn('Failed to load leagues.csv:', err);
    LEAGUES = [];
  }
}

async function loadInitialBowlersFromCsv() {
  try {
    const res = await fetch(BOWLERS_CSV_URL);
    if (!res.ok) return;
    const text = await res.text();
    const rows = parseCsv(text);

    const existing = listBowlers();
    for (const row of rows) {
      const name = (row.name || '').trim();
      if (!name) continue;

      const league = (row.league || '').trim();
      const gender = (row.gender || '').trim();
      const handicap = parseInt(row.handicap || '0', 10) || 0;

      const already = existing.find(
        b =>
          b.name.trim().toLowerCase() === name.toLowerCase() &&
          (b.league || '').trim().toLowerCase() === league.toLowerCase()
      );
      if (!already) {
        // create bowler in state
        // (team import later will link them by name)
        createBowler({ name, gender, handicap, league });
      }
    }
  } catch (err) {
    console.warn('Failed to load bowlers.csv:', err);
  }
}

async function loadInitialTeamsFromCsv() {
  try {
    const res = await fetch(TEAMS_CSV_URL);
    if (!res.ok) return;
    const text = await res.text();
    const rows = parseCsv(text);

    const existingTeams = listTeams();
    const allBowlers = listBowlers();

    // small map from name(lower) -> id for convenience
    const bowlerNameMap = {};
    allBowlers.forEach(b => {
      bowlerNameMap[b.name.trim().toLowerCase()] = b.id;
    });

    for (const row of rows) {
      const name = (row.name || '').trim();
      if (!name) continue;
      const league = (row.league || '').trim();
      const bowlersField = (row.bowlers || '').trim();

      // find or create team
      let team = existingTeams.find(
        t =>
          t.name.trim().toLowerCase() === name.toLowerCase() &&
          (t.league || '').trim().toLowerCase() === league.toLowerCase()
      );

      if (!team) {
        team = createTeam({ name, league });
      }

      if (bowlersField) {
        const bowlerNames = bowlersField
          .split(';')
          .map(s => s.trim())
          .filter(Boolean);

        const rosterIds = [];
        bowlerNames.forEach(n => {
          const bId = bowlerNameMap[n.toLowerCase()];
          if (bId != null) {
            rosterIds.push(bId);
          }
        });

        if (rosterIds.length) {
          setTeamRoster(team.id, rosterIds);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load teams.csv:', err);
  }
}

// ---- UI helpers ----

function populateLeagueSelect() {
  const select = document.getElementById('team-league');
  const options =
    '<option value="">-- None --</option>' +
    LEAGUES.map(l => `<option value="${l}">${l}</option>`).join('');
  select.innerHTML = options;
}

function populateRosterBowlers() {
  const select = document.getElementById('roster-bowlers');
  const bowlers = listBowlers();
  select.innerHTML = bowlers
    .map(b => {
      const label = b.league ? `${b.name} (${b.league})` : b.name;
      return `<option value="${b.id}">${label}</option>`;
    })
    .join('');
}

function renderTeams() {
  const teams = listTeams();
  const tbody = document.getElementById('teams-table-body');
  tbody.innerHTML = '';

  const bowlers = listBowlers();
  const bowlersById = {};
  bowlers.forEach(b => {
    bowlersById[b.id] = b;
  });

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

// ---- init ----

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    // 1) load leagues + bowlers from CSV
    await loadLeaguesFromCsv();
    await loadInitialBowlersFromCsv();

    // 2) now load teams from CSV (they reference bowlers by name)
    await loadInitialTeamsFromCsv();

    // 3) build dropdowns & tables
    populateLeagueSelect();
    populateRosterBowlers();
    renderTeams();

    document
      .getElementById('team-form')
      .addEventListener('submit', onTeamSubmit);
    document
      .getElementById('btn-team-cancel')
      .addEventListener('click', resetTeamForm);
    document
      .getElementById('btn-roster-save')
      .addEventListener('click', onRosterSave);
    document
      .getElementById('btn-roster-cancel')
      .addEventListener('click', closeRosterEditor);
  })();
});
