// js/state.js

const STORAGE_KEY = 'bowling_state_v6';

// ---------- helpers ----------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Very small CSV parser (comma-separated, header row)
function parseCsv(text) {
  if (!text) return [];
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    return row;
  });
}

// ---------- default state ----------

const DEFAULT_STATE = {
  lanes: {},
  bowlers: {},
  teams: {},
  leagues: {},          // store leagues + hcp base, etc
  nextBowlerId: 1,
  nextTeamId: 1
};

// Initialize lanes 1..12
for (let i = 1; i <= 12; i++) {
  DEFAULT_STATE.lanes[String(i)] = {
    id: i,
    active: false,
    league: '',
    mode: 'standard', // or '9pin'
    teamId: null,
    players: [],      // [{ bowlerId, name, handicap, absent, games:[{rolls:[]},{rolls:[]},{rolls:[]}]}]
    currentPlayerIndex: 0,
    currentGame: 1    // 1,2,3
  };
}

// ---------- load/save ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_STATE);

    const parsed = JSON.parse(raw);
    const state = deepClone(DEFAULT_STATE);

    if (parsed.bowlers) state.bowlers = parsed.bowlers;
    if (parsed.teams) state.teams = parsed.teams;
    if (parsed.leagues) state.leagues = parsed.leagues;
    if (parsed.lanes) {
      Object.keys(parsed.lanes).forEach(k => {
        state.lanes[k] = { ...state.lanes[k], ...parsed.lanes[k] };
      });
    }
    if (parsed.nextBowlerId) state.nextBowlerId = parsed.nextBowlerId;
    if (parsed.nextTeamId) state.nextTeamId = parsed.nextTeamId;

    // normalize lanes
    Object.values(state.lanes).forEach(normalizeLane);

    return state;
  } catch (e) {
    console.warn('Failed to load state, resetting:', e);
    return deepClone(DEFAULT_STATE);
  }
}

let state = loadState();

export function getState() {
  return state;
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- lane + players ----------

function ensureLane(laneId) {
  const key = String(laneId);
  if (!state.lanes[key]) {
    state.lanes[key] = deepClone(DEFAULT_STATE.lanes['1']);
    state.lanes[key].id = laneId;
  }
  normalizeLane(state.lanes[key]);
  return state.lanes[key];
}

function ensurePlayerGames(player) {
  if (!Array.isArray(player.games) || player.games.length < 3) {
    const existingRolls = Array.isArray(player.rolls) ? player.rolls : [];
    const games = [
      { rolls: [] },
      { rolls: [] },
      { rolls: [] }
    ];
    // migrate old single-game rolls into game 1 if present
    if (existingRolls.length && (!player.games || !player.games.length)) {
      games[0].rolls = existingRolls;
    }
    player.games = games;
  }
}

function normalizeLane(lane) {
  if (!lane) return;
  if (typeof lane.currentPlayerIndex !== 'number') lane.currentPlayerIndex = 0;
  if (!Array.isArray(lane.players)) lane.players = [];
  if (typeof lane.currentGame !== 'number' || lane.currentGame < 1 || lane.currentGame > 3) {
    lane.currentGame = 1;
  }
  lane.players.forEach(ensurePlayerGames);
}

function syncLanePlayersFromTeam(lane) {
  if (!lane.teamId) return;

  const team = state.teams[String(lane.teamId)];
  if (!team || !Array.isArray(team.bowlerIds) || !team.bowlerIds.length) return;

  const roster = team.bowlerIds.slice(0, 4); // cap at 4
  lane.players = roster.map((bid, idx) => {
    const b = state.bowlers[String(bid)];
    const base = {
      bowlerId: bid,
      name: b ? b.name : `Bowler ${idx + 1}`,
      handicap: b ? (b.handicap || 0) : 0,
      absent: false,
      games: [
        { rolls: [] },
        { rolls: [] },
        { rolls: [] }
      ]
    };
    return base;
  });
  lane.currentPlayerIndex = 0;
}

function lanePlayersOutOfSync(lane) {
  if (!lane.teamId) return false;

  const team = state.teams[String(lane.teamId)];
  if (!team || !Array.isArray(team.bowlerIds)) return false;

  const roster = team.bowlerIds.slice(0, 4);
  if (!roster.length) return false;

  if (!Array.isArray(lane.players) || lane.players.length !== roster.length) {
    return true;
  }

  for (let i = 0; i < roster.length; i++) {
    if (lane.players[i].bowlerId !== roster[i]) {
      return true;
    }
  }
  return false;
}

export function getLane(laneId) {
  const lane = ensureLane(laneId);

  if (lane.teamId && lanePlayersOutOfSync(lane)) {
    syncLanePlayersFromTeam(lane);
    saveState();
  }

  return lane;
}

export function updateLane(laneId, patch) {
  const lane = ensureLane(laneId);
  const prevTeamId = lane.teamId;

  Object.assign(lane, patch);
  normalizeLane(lane);

  if (patch.teamId !== undefined && patch.teamId !== prevTeamId) {
    syncLanePlayersFromTeam(lane);
  }

  saveState();
  return lane;
}

function getCurrentGameIndex(lane) {
  normalizeLane(lane);
  let g = lane.currentGame || 1;
  if (g < 1) g = 1;
  if (g > 3) g = 3;
  return g - 1;
}

export function resetLane(laneId) {
  const lane = ensureLane(laneId);
  const gameIdx = getCurrentGameIndex(lane);
  lane.players.forEach(p => {
    ensurePlayerGames(p);
    p.games[gameIdx].rolls = [];
  });
  lane.currentPlayerIndex = 0;
  saveState();
  return lane;
}

// ---------- rolls / turn order ----------

// Normal add-roll: respects "absent" flag (won't write rolls for absent bowler)
export function addRollForCurrentPlayer(laneId, pins) {
  const lane = getLane(laneId);
  const gameIdx = getCurrentGameIndex(lane);

  if (!lane.players.length) {
    lane.players = [{
      bowlerId: null,
      name: 'Player 1',
      handicap: 0,
      absent: false,
      games: [
        { rolls: [] },
        { rolls: [] },
        { rolls: [] }
      ]
    }];
  }

  const idx = lane.currentPlayerIndex || 0;
  const player = lane.players[idx];
  ensurePlayerGames(player);

  // do not score for absent bowlers in normal flow
  if (player.absent) return;

  const game = player.games[gameIdx];
  if (!Array.isArray(game.rolls)) game.rolls = [];
  game.rolls.push(pins);
  saveState();
}

// Force add-roll: ignores "absent" flag (used by auto-absent logic)
export function forceAddRollForCurrentPlayer(laneId, pins) {
  const lane = getLane(laneId);
  const gameIdx = getCurrentGameIndex(lane);
  if (!lane.players.length) return;

  const idx = lane.currentPlayerIndex || 0;
  const player = lane.players[idx];
  ensurePlayerGames(player);

  const game = player.games[gameIdx];
  if (!Array.isArray(game.rolls)) game.rolls = [];
  game.rolls.push(pins);
  saveState();
}

export function toggleCurrentPlayerAbsent(laneId) {
  const lane = getLane(laneId);
  if (!lane.players.length) return;
  const idx = lane.currentPlayerIndex || 0;
  const player = lane.players[idx];
  player.absent = !player.absent;
  saveState();
}

// Simple next-player: does NOT skip absent
// (lane.js's autoProcessAbsent handles absent scoring/advancing)
export function advanceToNextPlayer(laneId) {
  const lane = getLane(laneId);
  const players = lane.players;
  if (!players.length) return;

  let idx = lane.currentPlayerIndex || 0;
  idx = (idx + 1) % players.length;

  lane.currentPlayerIndex = idx;
  saveState();
}

// ---------- bowlers ----------

export function listBowlers() {
  return Object.values(state.bowlers);
}

export function createBowler({ name, gender = '', handicap = 0, league = '' }) {
  const id = state.nextBowlerId++;
  state.bowlers[String(id)] = { id, name, gender, handicap, league };
  saveState();
  return state.bowlers[String(id)];
}

export function updateBowler(id, patch) {
  const key = String(id);
  if (!state.bowlers[key]) return null;
  state.bowlers[key] = { ...state.bowlers[key], ...patch };
  saveState();
  return state.bowlers[key];
}

export function deleteBowler(id) {
  const key = String(id);
  Object.values(state.teams).forEach(team => {
    team.bowlerIds = (team.bowlerIds || []).filter(bid => bid !== Number(id));
  });
  delete state.bowlers[key];
  saveState();
}

// ---------- teams ----------

export function listTeams() {
  return Object.values(state.teams);
}

export function createTeam({ name, league = '' }) {
  const id = state.nextTeamId++;
  state.teams[String(id)] = { id, name, league, bowlerIds: [] };
  saveState();
  return state.teams[String(id)];
}

export function updateTeam(id, patch) {
  const key = String(id);
  if (!state.teams[key]) return null;
  state.teams[key] = { ...state.teams[key], ...patch };
  saveState();
  return state.teams[key];
}

export function deleteTeam(id) {
  const key = String(id);
  Object.values(state.lanes).forEach(lane => {
    if (lane.teamId === Number(id)) {
      lane.teamId = null;
      lane.players = [];
      lane.currentPlayerIndex = 0;
    }
  });
  delete state.teams[key];
  saveState();
}

export function setTeamRoster(teamId, bowlerIds) {
  const key = String(teamId);
  if (!state.teams[key]) return null;
  state.teams[key].bowlerIds = bowlerIds.map(Number);
  saveState();
  return state.teams[key];
}

// ---------- CSV INIT ----------

const CSV_PATHS = {
  leagues: 'data/leagues.csv',
  bowlers: 'data/bowlers.csv',
  teams: 'data/teams.csv',
  roster: 'data/team_roster.csv'
};

let csvInitialized = false;
let csvInitPromise = null;

/**
 * Load leagues, bowlers, teams, and team rosters from CSV files
 * and populate state.leagues / state.bowlers / state.teams.
 *
 * Safe to call multiple times: the actual work happens once.
 */
export function initStateFromCsv() {
  if (csvInitialized) return Promise.resolve();
  if (csvInitPromise) return csvInitPromise;

  csvInitPromise = (async () => {
    try {
      const [leaguesRes, bowlersRes, teamsRes, rosterRes] = await Promise.all([
        fetch(CSV_PATHS.leagues).catch(() => null),
        fetch(CSV_PATHS.bowlers).catch(() => null),
        fetch(CSV_PATHS.teams).catch(() => null),
        fetch(CSV_PATHS.roster).catch(() => null)
      ]);

      const leaguesText = leaguesRes && leaguesRes.ok ? await leaguesRes.text() : '';
      const bowlersText = bowlersRes && bowlersRes.ok ? await bowlersRes.text() : '';
      const teamsText   = teamsRes && teamsRes.ok   ? await teamsRes.text()   : '';
      const rosterText  = rosterRes && rosterRes.ok ? await rosterRes.text()  : '';

      const leagueRows = parseCsv(leaguesText);
      const bowlerRows = parseCsv(bowlersText);
      const teamRows   = parseCsv(teamsText);
      const rosterRows = parseCsv(rosterText);

      // --- Leagues ---
      const leagues = {};
      leagueRows.forEach(row => {
        const name = row.name || row.league_name || row.League || '';
        if (!name) return;
        const id = row.league_id || row.id || name;
        const hcpBase =
          row.hcp_base ? Number(row.hcp_base) :
          row.hdcp_base ? Number(row.hdcp_base) :
          210;

        leagues[name] = {
          id,
          name,
          season: row.season || '',
          centerId: row.center_id || '',
          hcpBase: Number.isFinite(hcpBase) ? hcpBase : 210
        };
      });

      // --- Bowlers ---
      const bowlers = {};
      let maxBowlerNum = 0;

      bowlerRows.forEach(row => {
        const bowlerIdRaw = row.bowler_id || row.id || '';
        if (!bowlerIdRaw) return;

        // handle IDs like b001 → 1
        const numMatch = String(bowlerIdRaw).match(/\d+/);
        const numericId = numMatch ? Number(numMatch[0]) : Number(bowlerIdRaw) || 0;
        if (numericId > maxBowlerNum) maxBowlerNum = numericId;

        const first = row.first_name || row.FirstName || '';
        const last  = row.last_name  || row.LastName  || '';
        const name = (first + ' ' + last).trim() || bowlerIdRaw;

        const gender = row.gender || row.Gender || '';

        // Try to pull handicap from any reasonable column
        let handicap = 0;
        const hPins = row.hdcp_pins || row.handicap || row.hcp || row.HDCP || '';
        if (hPins !== '') {
          const hNum = Number(hPins);
          if (Number.isFinite(hNum)) handicap = hNum;
        }

        const leagueName = row.league_name || row.league || '';

        bowlers[String(numericId)] = {
          id: numericId,
          name,
          gender,
          handicap,
          league: leagueName
        };
      });

      // --- Teams ---
      const teams = {};
      let maxTeamNum = 0;

      teamRows.forEach(row => {
        const teamIdRaw = row.team_id || row.id || '';
        if (!teamIdRaw) return;

        const numMatch = String(teamIdRaw).match(/\d+/);
        const numericId = numMatch ? Number(numMatch[0]) : Number(teamIdRaw) || 0;
        if (numericId > maxTeamNum) maxTeamNum = numericId;

        const name = row.team_name || row.name || row.Team || `Team ${numericId}`;
        const leagueName = row.league_name || row.league || '';

        teams[String(numericId)] = {
          id: numericId,
          name,
          league: leagueName,
          bowlerIds: []
        };
      });

      // --- Team roster (team -> bowler IDs) ---
      rosterRows.forEach(row => {
        const teamRaw = row.team_id || row.team || row.TeamID || '';
        const bowlerRaw = row.bowler_id || row.bowler || row.BowlerID || '';
        if (!teamRaw || !bowlerRaw) return;

        const tMatch = String(teamRaw).match(/\d+/);
        const teamId = tMatch ? Number(tMatch[0]) : Number(teamRaw) || 0;
        const bMatch = String(bowlerRaw).match(/\d+/);
        const bowlerId = bMatch ? Number(bMatch[0]) : Number(bowlerRaw) || 0;
        if (!teamId || !bowlerId) return;

        if (!teams[String(teamId)]) {
          teams[String(teamId)] = {
            id: teamId,
            name: `Team ${teamId}`,
            league: '',
            bowlerIds: []
          };
          if (teamId > maxTeamNum) maxTeamNum = teamId;
        }

        if (!bowlers[String(bowlerId)]) {
          // orphan bowler in roster with no row – create minimal record
          bowlers[String(bowlerId)] = {
            id: bowlerId,
            name: `Bowler ${bowlerId}`,
            gender: '',
            handicap: 0,
            league: ''
          };
          if (bowlerId > maxBowlerNum) maxBowlerNum = bowlerId;
        }

        const arr = teams[String(teamId)].bowlerIds;
        if (!arr.includes(bowlerId)) arr.push(bowlerId);
      });

      // --- Merge into state (CSV is source of truth for these) ---
      state.leagues = leagues;
      state.bowlers = bowlers;
      state.teams   = teams;

      // Make sure next IDs won't collide
      if (maxBowlerNum >= 1) state.nextBowlerId = maxBowlerNum + 1;
      if (maxTeamNum >= 1)   state.nextTeamId   = maxTeamNum + 1;

      // Normalize lanes now that teams/bowlers exist
      Object.values(state.lanes).forEach(normalizeLane);

      saveState();
      csvInitialized = true;
    } catch (err) {
      console.error('Error initializing from CSV:', err);
      csvInitialized = false;   // allow retry
      csvInitPromise = null;
    }
  })();

  return csvInitPromise;
}
