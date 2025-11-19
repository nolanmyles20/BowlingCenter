// js/state.js

const STORAGE_KEY = 'bowling_state_v1';

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
    rolls: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // Merge parsed over default to ensure new fields don't break old saves
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (e) {
    console.warn('Failed to load state, resetting:', e);
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();

export function getState() {
  return state;
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Lane helpers
export function getLane(laneId) {
  return state.lanes[String(laneId)];
}

export function updateLane(laneId, patch) {
  const key = String(laneId);
  state.lanes[key] = { ...state.lanes[key], ...patch };
  saveState();
  return state.lanes[key];
}

export function resetLane(laneId) {
  const lane = getLane(laneId);
  lane.rolls = [];
  saveState();
  return lane;
}

// Bowler helpers
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
  // Remove from any team roster
  Object.values(state.teams).forEach(team => {
    team.bowlerIds = team.bowlerIds.filter(bid => bid !== Number(id));
  });
  delete state.bowlers[key];
  saveState();
}

// Team helpers
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
  // Clear from lanes
  Object.values(state.lanes).forEach(lane => {
    if (lane.teamId === Number(id)) lane.teamId = null;
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
