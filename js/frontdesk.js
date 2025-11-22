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
let fullCsvCache = null; // NEW: cache all CSV data so we can build rosters

/* ---------------- helpers ---------------- */

// Load teams directly from teams.csv, NOT from localStorage
async function loadTeamsFromCsv() {
  try {
    const all = await loadAllCsv();          // NEW: keep whole object
    fullCsvCache = all;                      // NEW: cache it globally

    const teams = all.teams || [];

    // Map CSV rows into the shape the UI expects:
    // { id, name, league }
    teamsCache = teams
      .map((t, idx) => {
        return {
          // These names match your teams.csv headers:
          // team_id, league_id, team_number, team_name
          id: t.team_id || t.id || t.TeamID || String(idx + 1),
          name: t.team_name || t.name || t.TeamName,
          league: t.league_name || t.league || t.LeagueName || ''
        };
      })
      .filter(t => t.id && t.name); // keep only valid rows

    console.log(`Loaded ${teamsCache.length} teams from teams.csv`);
  } catch (err) {
    console.error('Failed to load teams from CSV, falling back to listTeams():', err);
    // Absolute last-resort fallback – localStorage path
    teamsCache = listTeams();
  }
}

// get league names from state.leagues, or fall back to a hardcoded list
function getLeagueNames() {
  const st = getState();
  const leagueMap = st.leagues || {};
  const names = Object.keys(leagueMap);

  if (names.length > 0) {
    return names;
  }

  // Fallback if leagues.csv wasn't found or is empty
  return [
    'Open Bowling',
    'Tuesday Mixed',
    "Men's League",
    "Women's League",
    'Youth League'
  ];
}

function buildLeagueOptions(selectedLeague) {
  const leagues = getLeagueNames();
  let html = '<option value="">-- None --</option>';

  leagues.forEach(lg => {
    const sel = lg === selectedLeague ? ' selected' : '';
    html += `<option value="${lg}"${sel}>${lg}</option>`;
  });

  return html;
}

function buildTeamOptions(selectedId) {
  let html = '<option value="">-- None --</option>';
  teamsCache.forEach(t => {
    const label = t.league ? `${t.name} (${t.league})` : t.name;

    // IMPORTANT: treat IDs as strings (no Number())
    const sel =
      selectedId && String(selectedId) === String(t.id) ? ' selected' : '';

    html += `<option value="${t.id}"${sel}>${label}</option>`;
  });
  return html;
}

/* ---------------- helpers: build lane players from CSV ---------------- */

// NEW: Build the lane.players array for a given lane + teamId from CSV
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

    // Ensure we have CSV data cached
    if (!fullCsvCache) {
      fullCsvCache = await loadAllCsv();
    }

    const {
      teams = [],
      bowlers = []
    } = fullCsvCache;

    const rosterRowsRaw =
      fullCsvCache.team_roster ||
      fullCsvCache.teamRosters ||
      fullCsvCache.rosters ||
      [];

    // Find metadata for this team (to get league_id + team_number)
    const teamMeta =
      teams.find(
        t =>
          String(t.team_id || t.id || t.TeamID) === String(teamId)
      ) || null;

    let rosterRows = rosterRowsRaw;

    if (teamMeta) {
      const leagueId =
        teamMeta.league_id ||
        teamMeta.leagueId ||
        teamMeta.league_id_fk ||
        teamMeta.league;
      const teamNumber =
        teamMeta.team_number ||
        teamMeta.teamNumber ||
        teamMeta.number;

      if (leagueId && teamNumber != null) {
        rosterRows = rosterRowsRaw.filter(r =>
          String(r.league_id) === String(leagueId) &&
          String(r.team_number) === String(teamNumber)
        );
      }
    }

    // Fallback: match by team_name if needed
    if (teamMeta && (!rosterRows || rosterRows.length === 0)) {
      const tn = (teamMeta.team_name || teamMeta.teamName || '').trim().toLowerCase();
      rosterRows = rosterRowsRaw.filter(r =>
        (r.team_name || '').trim().toLowerCase() === tn
      );
    }

    // Sort roster by position so lane order matches the lineup
    const sortedRoster = (rosterRows || []).slice().sort((a, b) => {
      const pa = Number(a.position || a.pos_number || a.pos || 0);
      const pb = Number(b.position || b.pos_number || b.pos || 0);
      return pa - pb;
    });

    // Map roster rows to lane "players" with handicap from bowlers.csv
    const players = sortedRoster.map(r => {
      const bowlerIdStr = String(r.bowler_id || r.bowlerId || r.BowlerID || '');
      const bowler =
        bowlers.find(
          b => String(b.bowler_id || b.id || b.BowlerID) === bowlerIdStr
        ) || {};

      const first =
        bowler.first_name ||
        bowler.FirstName ||
        r.first_name ||
        r.FirstName ||
        '';
      const last =
        bowler.last_name ||
        bowler.LastName ||
        r.last_name ||
        r.LastName ||
        '';
      const name = `${first} ${last}`.trim() || 'Bowler';

      const hcpRaw =
        r.hcp ??
        r.handicap ??
        bowler.hcp ??
        bowler.handicap ??
        bowler.Hcp ??
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
    // Fallback: still at least save the teamId and clear players
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

    const leagueOptions = buildLeagueOptions(lane.league || '');
    const teamOptions = buildTeamOptions(lane.teamId || '');

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
      updateLane(laneId, { league: leagueSelect.value });
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
      // IMPORTANT: keep as string (e.g. "32170-01")
      const teamId = val || null;

      // NEW: build players from CSV roster + bowler stats
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
    // Initialize full state from CSV (leagues, bowlers, teams, rosters)
    await initStateFromCsv();
  } catch (err) {
    console.error(
      'initStateFromCsv failed; continuing with existing lane state:',
      err
    );
    // Even if this fails, we still load teams from CSV next.
  }

  // Always load teams from teams.csv for the dropdown
  await loadTeamsFromCsv();

  // Now render lanes using the fresh teams list
  renderLanes();
});
