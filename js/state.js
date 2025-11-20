// js/state.js

const STORAGE_KEY = 'bowling_state_v2';

// ---------- helpers ----------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- default state ----------

const DEFAULT_STATE = {
  lanes: {},
  bowlers: {},
  teams: {},
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
    players: [],      // [{ bowlerId, name, handicap, absent, rolls: [] }]
    currentPlayerIndex: 0
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
    if (parsed.lanes) {
      Object.keys(parsed.lanes).forEach(k => {
        state.lanes[k] = { ...state.lanes[k], ...parsed.lanes[k] };
      });
    }
    if (parsed.nextBowlerId) state.nextBowlerId = parsed.nextBowlerId;
    if (parsed.nextTeamId) state.nextTeamId = parsed.nextTeamId;

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
  const lane = state.lanes[key];

  if (!Array.isArray(lane.players)) lane.players = [];
  if (typeof lane.currentPlayerIndex !== 'number') lane.currentPlayerIndex = 0;

  return lane;
}

function syncLanePlayersFromTeam(lane) {
  if (!lane.teamId) {
    return;
  }

  const team = state.teams[String(lane.teamId)];
  if (!team || !Array.isArray(team.bowlerIds) || !team.bowlerIds.length) {
    return;
  }

  const roster = team.bowlerIds.slice(0, 4); // cap at 4
  lane.players = roster.map((bid, idx) => {
    const b = state.bowlers[String(bid)];
    return {
      bowlerId: bid,
      name: b ? b.name : `Bowler ${idx + 1}`,
      handicap: b ? (b.handicap || 0) : 0,
      absent: false,
      rolls: []
    };
  });
  lane.currentPlayerIndex = 0;
}

// Check if lane players are synced with team roster
function lanePlayersOutOfSync(lane) {
  if (!lane.teamId) return false;

  const team = state.teams[String(lane.teamId)];
  if (!team || !Array.isArray(team.bowlerIds)) return false;

  const roster = team.bowlerIds.slice(0, 4);
  if (!roster.length) return false;

  // If no players or lengths differ, out of sync
  if (!Array.isArray(lane.players) || lane.players.length !== roster.length) {
    return true;
  }

  // If any bowlerId doesn't match the roster order, out of sync
  for (let i = 0; i < roster.length; i++) {
    if (lane.players[i].bowlerId !== roster[i]) {
      return true;
    }
  }
  return false;
}

export function getLane(laneId) {
  const lane = ensureLane(laneId);

  // If lane has a team and players are missing or not matching roster, resync
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

  // If team changed, force resync from new team
  if (patch.teamId !== undefined && patch.teamId !== prevTeamId) {
    syncLanePlayersFromTeam(lane);
  }

  saveState();
  return lane;
}

export function resetLane(laneId) {
  const lane = ensureLane(laneId);
  lane.players.forEach(p => {
    p.rolls = [];
  });
  lane.currentPlayerIndex = 0;
  saveState();
  return lane;
}

// used by lane.js
export function addRollForCurrentPlayer(laneId, pins) {
  const lane = getLane(laneId);
  if (!lane.players.length) {
    lane.players = [{
      bowlerId: null,
      name: 'Player 1',
      handicap: 0,
      absent: false,
      rolls: []
    }];
  }
  const idx = lane.currentPlayerIndex || 0;
  const player = lane.players[idx];
  if (!player.absent) {
    if (!Array.isArray(player.rolls)) player.rolls = [];
    player.rolls.push(pins);
    saveState();
  }
}

export function toggleCurrentPlayerAbsent(laneId) {
  const lane = getLane(laneId);
  if (!lane.players.length) return;
  const idx = lane.currentPlayerIndex || 0;
  const player = lane.players[idx];
  player.absent = !player.absent;
  saveState();
}

export function advanceToNextPlayer(laneId) {
  const lane = getLane(laneId);
  const players = lane.players;
  if (!players.length) return;

  let idx = lane.currentPlayerIndex || 0;
  const startIdx = idx;
  do {
    idx = (idx + 1) % players.length;
    if (!players[idx].absent) break;
  } while (idx !== startIdx);

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
