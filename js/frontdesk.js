// js/frontdesk.js
import {
  getLane,
  updateLane,
  listTeams,
  resetLane,
  getState,
  initStateFromCsv
} from './state.js';

import { loadAllCsv } from './csvLoader.js';

let teamsCache = [];
let fullCsvCache = null;

/* ---------------- CSV loading helpers ---------------- */

async function ensureCsvLoaded() {
  if (fullCsvCache) return fullCsvCache;

  const all = await loadAllCsv();
  fullCsvCache = all || {};
  console.log('loadAllCsv keys:', Object.keys(fullCsvCache));
  return fullCsvCache;
}

async function loadTeamsFromCsv() {
  const all = await ensureCsvLoaded();
  const teams = all.teams || [];

  teamsCache = teams
    .map((t, idx) => {
      // teams.csv headers:
      // team_id,league_id,team_number,team_name
      return {
        id: t.team_id || String(idx + 1),
        name: t.team_name || '',
        league_id: t.league_id || '',
        team_number: t.team_number || ''
      };
    })
    .filter(t => t.id && t.name);

  console.log(`Loaded ${teamsCache.length} teams from teams.csv`);
}

/* ---------------- league & team dropdowns ---------------- */

function getLeagueList() {
  // Prefer CSV leagues
  if (fullCsvCache && Array.isArray(fullCsvCache.leagues)) {
    return fullCsvCache.leagues.map(lg => ({
      id: lg.league_id,
      name: lg.name || ''
    }));
  }

  // Fallback to state, if initStateFromCsv wrote something
  const st = getState();
  const leagueMap = st.leagues || {};
  const names = Object.keys(leagueMap);

  if (names.length > 0) {
    return names.map(id => ({ id, name: leagueMap[id] }));
  }

  // Last resort static list
  return [
    { id: '32170', name: '2025-26 Wednesday Mixed League' }
  ];
}

function buildLeagueOptions(selectedLeagueId) {
  const leagues = getLeagueList();
  let html = '<option value="">-- None --</option>';

  leagues.forEach(lg => {
    const sel =
      selectedLeagueId && String(selectedLeagueId) === String(lg.id)
        ? ' selected'
        : '';
    const label = lg.name
      ? `${lg.id} – ${lg.name}`
      : String(lg.id);
    html += `<option value="${lg.id}"${sel}>${label}</option>`;
  });

  return html;
}

function buildTeamOptions(selectedTeamId, selectedLeagueId) {
  // If no league selected, show all teams (or you can choose to show none)
  let filteredTeams = teamsCache;
  if (selectedLeagueId) {
    filteredTeams = teamsCache.filter(
      t => String(t.league_id) === String(selectedLeagueId)
    );
  }

  let html = '<option value="">-- None --</option>';

  filteredTeams.forEach(t => {
    const sel =
      selectedTeamId && String(selectedTeamId) === String(t.id)
        ? ' selected'
        : '';
    const label = t.name;
    html += `<option value="${t.id}"${sel}>${label}</option>`;
  });

  return html;
}

/* ---------------- build lane players from CSV ---------------- */

async function buildPlayersForLaneFromCsv(laneId, teamId) {
  try {
    if (!teamId) {
      // No team selected → clear players
      updateLane(laneId, {
        teamId: null,
        players: [],
        currentPlayerIndex: 0
      });
      return;
    }

    const all = await ensureCsvLoaded();
    const teams = all.teams || [];
    const rosterRowsRaw = all.team_roster || [];
    const bowlers = all.bowlers || [];

    // Find this team in teams.csv to get league_id + team_number
    const teamMeta =
      teams.find(
        t => String(t.team_id) === String(teamId)
      ) || null;

    console.log('teamMeta for teamId', teamId, ':', teamMeta);

    if (!teamMeta) {
      console.warn('No teamMeta found for teamId', teamId);
      updateLane(laneId, {
        teamId,
        players: [],
        currentPlayerIndex: 0
      });
      return;
    }

    const leagueId = teamMeta.league_id;
    const teamNumber = teamMeta.team_number;

    console.log(
      'Filtering roster by league_id/team_number:',
      leagueId,
      teamNumber
    );

    // Filter roster rows for this league + team_number
    let rosterRows = rosterRowsRaw.filter(r =>
      String(r.league_id).trim() === String(leagueId).trim() &&
      String(r.team_number).trim() === String(teamNumber).trim()
    );

    // Fallback: match by team_name if nothing found
    if (!rosterRows.length) {
      const tn = (teamMeta.team_name || '').trim().toLowerCase();
      console.log('Roster filter by team_name fallback, name =', tn);

      rosterRows = rosterRowsRaw.filter(r =>
        ((r.team_name || '').trim().toLowerCase()) === tn
      );
    }

    console.log(
      'Roster rows after filtering for team',
      teamId,
      ':',
      rosterRows.length
    );

    // Sort roster by position (1,2,3,4,5...)
    const sortedRoster = rosterRows.slice().sort((a, b) => {
      const pa = Number(a.position || 0);
      const pb = Number(b.position || 0);
      return pa - pb;
    });

    // Build lane.players from roster + bowlers
    const players = sortedRoster.map(r => {
      const bowlerIdStr = String(r.bowler_id || '').trim();

      const bowler =
        bowlers.find(
          b => String(b.bowler_id || '').trim() === bowlerIdStr
        ) || {};

      const first =
        r.first_name ||
        bowler.first_name ||
        '';
      const last =
        r.last_name ||
        bowler.last_name ||
        '';
      const name = `${first} ${last}`.trim() || 'Bowler';

      // handicap can come from roster or bowlers
      const hcpRaw =
        r.hcp ??
        r.handicap ??
        bowler.hcp ??
        bowler.handicap ??
        0;
      const handicap = Number(hcpRaw) || 0;

      return {
        bowlerId: bowlerIdStr || null,
        name,
        handicap,
        absent: false,
        games: [
          { rolls: [] },
          { rolls: [] },
          { rolls: [] }
        ]
      };
    });

    console.log(
      `Lane ${laneId} team ${teamId}: built ${players.length} players from CSV roster`
    );

    updateLane(laneId, {
      teamId,
      players,
      currentPlayerIndex: 0
    });
  } catch (err) {
    console.error('Failed to build lane players from CSV roster:', err);
    updateLane(laneId, {
      teamId,
      players: [],
      currentPlayerIndex: 0
    });
  }
}

/* ---------------- render ---------------- */

function renderLanes() {
  const tbody = document.getElementById('lanes-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  for (let laneId = 1; laneId <= 12; laneId++) {
    const lane = getLane(laneId);
    const tr = document.createElement('tr');
    tr.dataset.laneId = laneId;

    const leagueId = lane.league || '';
    const leagueOptions = buildLeagueOptions(leagueId);
    const teamOptions = buildTeamOptions(lane.teamId || '', leagueId);

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
          <option value="standard"${
            lane.mode === 'standard' ? ' selected' : ''
          }>Standard</option>
          <option value="9pin"${
            lane.mode === '9pin' ? ' selected' : ''
          }>9-Pin No-Tap</option>
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
    statusBtn.onclick = e => {
      e.stopPropagation();
      const lane = getLane(laneId);
      updateLane(laneId, { active: !lane.active });
      renderLanes();
    };

    // League dropdown change
    leagueSelect.onchange = e => {
      e.stopPropagation();
      const newLeagueId = leagueSelect.value || null;

      // When league changes:
      // - Save league_id on lane
      // - Clear team & players because they may not belong to new league
      updateLane(laneId, {
        league: newLeagueId,
        teamId: null,
        players: [],
        currentPlayerIndex: 0
      });

      // Re-render to refresh team list based on new league
      renderLanes();
    };

    // Mode change
    modeSelect.onchange = e => {
      e.stopPropagation();
      updateLane(laneId, { mode: modeSelect.value });
      renderLanes();
    };

    // Team change → assigns roster to that lane
    teamSelect.onchange = async e => {
      e.stopPropagation();
      const val = teamSelect.value;
      const teamId = val || null;

      await buildPlayersForLaneFromCsv(laneId, teamId);

      // Re-render so the dropdown shows the updated selection
      renderLanes();
    };

    // Open lane button
    openBtn.onclick = e => {
      e.stopPropagation();
      window.location.href = `lane.html?lane=${laneId}`;
    };

    // Reset game
    resetBtn.onclick = e => {
      e.stopPropagation();
      if (confirm(`Reset game on Lane ${laneId}?`)) {
        resetLane(laneId);
        renderLanes();
      }
    };

    // Clicking the whole row (except on controls) opens lane
    row.onclick = e => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'button' || tag === 'select') return;
      window.location.href = `lane.html?lane=${laneId}`;
    };
  });
}

/* ---------------- init ---------------- */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize any state the rest of the app expects
    await initStateFromCsv();
  } catch (err) {
    console.error(
      'initStateFromCsv failed; continuing with existing lane state:',
      err
    );
  }

  // Ensure CSV data is loaded & teams cache built
  await ensureCsvLoaded();
  await loadTeamsFromCsv();

  // Render front desk lanes
  renderLanes();
});
