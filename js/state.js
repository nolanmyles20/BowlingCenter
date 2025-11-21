// js/state.js

const STORAGE_KEY = 'bowling_state_v4';


// ---------- helpers ----------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- default state ----------

const DEFAULT_STATE = {
  lanes: {},
  bowlers: {},
  teams: {},
  leagues: {},          // leagues store for hcp base etc
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
    const state = deepClone(DEFAULT_STATE);

    if (raw) {
      const parsed = JSON.parse(raw);

      // Only restore lane-related data (status, selections, scores).
      if (parsed.lanes) {
        Object.keys(parsed.lanes).forEach(k => {
          state.lanes[k] = { ...state.lanes[k], ...parsed.lanes[k] };
        });
      }
    }

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
  // Only persist lane status, selections, and scoring.
  const toPersist = {
    lanes: state.lanes
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
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

// Normal add-roll: ALWAYS writes the roll for the current player.
// (Absent handling is done in lane.js via autoProcessAbsent, not here.)
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

// Simple next-player: does NOT skip absent.
// autoProcessAbsent in lane.js handles absent bowlers and scoring/advancing.
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

// ---------- leagues + CSV init ----------

/**
 * Initialize state from CSV rows.
 * This is called once on first load (when there is no saved state).
 *
 * bowlersRows: [{ id?, name, gender?, handicap?, league? }, ...]
 * teamsRows:   [{ id?, name, league?, bowler1Id?, bowler2Id?, ... }, ...]
 * leaguesRows: [{ name, hcpBase? }, ...]
 */
export function initStateFromCsv(bowlersRows = [], teamsRows = [], leaguesRows = []) {
  // If we already have data, do not override user’s saved localStorage.
  const hasAnyData =
    Object.keys(state.bowlers).length ||
    Object.keys(state.teams).length ||
    Object.keys(state.leagues).length;

  if (hasAnyData) {
    return;
  }

  // --- Leagues ---
  if (Array.isArray(leaguesRows)) {
    leaguesRows.forEach(lg => {
      if (!lg) return;
      const name = (lg.name || '').trim();
      if (!name) return;

      const base = Number(lg.hcpBase);
      state.leagues[name] = {
        name,
        hcpBase: Number.isFinite(base) ? base : 210
      };
    });
  }

  // --- Bowlers ---
  let maxBowlerId = 0;
  if (Array.isArray(bowlersRows)) {
    bowlersRows.forEach(row => {
      if (!row) return;
      let id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) {
        id = maxBowlerId + 1;
      }
      maxBowlerId = Math.max(maxBowlerId, id);

      state.bowlers[String(id)] = {
        id,
        name: row.name || `Bowler ${id}`,
        gender: row.gender || '',
        handicap: Number.isFinite(Number(row.handicap)) ? Number(row.handicap) : 0,
        league: row.league || ''
      };
    });
  }
  state.nextBowlerId = maxBowlerId + 1;

  // --- Teams ---
  let maxTeamId = 0;
  if (Array.isArray(teamsRows)) {
    teamsRows.forEach(row => {
      if (!row) return;
      let id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) {
        id = maxTeamId + 1;
      }
      maxTeamId = Math.max(maxTeamId, id);

      // Try to read up to 4 bowler id fields from CSV
      const bowlerIds = [];
      const bowlerKeys = [
        'bowler1Id', 'bowler2Id', 'bowler3Id', 'bowler4Id',
        'bowler1', 'bowler2', 'bowler3', 'bowler4'
      ];
      bowlerKeys.forEach(k => {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
          const bid = Number(row[k]);
          if (Number.isFinite(bid)) bowlerIds.push(bid);
        }
      });

      state.teams[String(id)] = {
        id,
        name: row.name || `Team ${id}`,
        league: row.league || '',
        bowlerIds
      };
    });
  }
  state.nextTeamId = maxTeamId + 1;

  saveState();
}
