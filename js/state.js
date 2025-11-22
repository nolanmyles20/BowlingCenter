// js/state.js

const STORAGE_KEY = 'bowling_state_v8';

// ---------- helpers ----------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// simple CSV parser (no quoted commas)
function parseCsv(text) {
  if (!text) return [];
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

// ---------- default state ----------

const DEFAULT_STATE = {
  lanes: {},
  bowlers: {},
  teams: {},
  leagues: {},          // leagues keyed by league name
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

    if (!raw) {
      Object.values(state.lanes).forEach(normalizeLane);
      return state;
    }

    const parsed = JSON.parse(raw);

    // IMPORTANT: only restore LANES + next IDs from storage.
    // bowlers/teams/leagues will always come from CSV.
    if (parsed.lanes) {
      Object.keys(parsed.lanes).forEach(k => {
        state.lanes[k] = { ...state.lanes[k], ...parsed.lanes[k] };
      });
    }

    if (typeof parsed.nextBowlerId === 'number') {
      state.nextBowlerId = parsed.nextBowlerId;
    }
    if (typeof parsed.nextTeamId === 'number') {
      state.nextTeamId = parsed.nextTeamId;
    }

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
  // We still store the full state, but on NEXT load we only trust lanes.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- leagues helper ----------

export function listLeagueNames() {
  const leaguesObj = state.leagues || {};
  return Object.values(leaguesObj)
    .map(lg => lg.name || lg.leagueName || lg.league || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
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

// Force add-roll: ignores "absent" flag (for auto-absent scoring)
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
    team.bowlerIds = (team.bowlerIds || []).filter(bid => String(bid) !== String(id));
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
  state.teams[key].bowlerIds = bowlerIds.map(String);
  saveState();
  return state.teams[key];
}

// ---------- leagues + CSV bootstrap ----------

export function listLeagues() {
  return Object.values(state.leagues);
}

let csvInitialized = false;

export async function initStateFromCsv() {
  if (csvInitialized) return;
  csvInitialized = true;

  // wipe in-memory league / team / bowler data
  state.leagues = {};
  state.teams = {};
  state.bowlers = {};

  async function loadCsvText(path) {
    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (!resp.ok) {
        console.warn('CSV not found or HTTP error:', path, resp.status);
        return null;
      }
      return await resp.text();
    } catch (err) {
      console.warn('Error loading CSV:', path, err);
      return null;
    }
  }

  const [
    leaguesText,
    teamsText,
    bowlersText,
    rosterText
  ] = await Promise.all([
    loadCsvText('data/leagues.csv'),
    loadCsvText('data/teams.csv'),
    loadCsvText('data/bowlers.csv'),
    loadCsvText('data/team_roster.csv')
  ]);

  const leagueIdToName = {};

  // leagues.csv: league_id,name,season,center_id
  if (leaguesText) {
    const rows = parseCsv(leaguesText);
    rows.forEach(r => {
      const id = r.league_id || r.id || r.LEAGUE_ID || r.ID;
      const name = r.name || r.Name || '';
      if (!name) return;

      leagueIdToName[id] = name;
      state.leagues[name] = {
        id: id || name,
        name,
        season: r.season || r.Season || '',
        center_id: r.center_id || r.center || ''
      };
    });
  }

  // teams.csv: team_id,name,league_id
  if (teamsText) {
    const rows = parseCsv(teamsText);
    rows.forEach(r => {
      const idRaw = r.team_id || r.id || r.TEAM_ID || r.ID;
      if (!idRaw) return;
      const id = Number(idRaw);
      const name = r.name || r.team_name || r.Team || `Team ${id}`;
      const leagueId = r.league_id || r.LEAGUE_ID || '';
      const leagueName = r.league || leagueIdToName[leagueId] || '';

      state.teams[String(id)] = {
        id,
        name,
        league: leagueName,
        bowlerIds: []
      };
    });
  }

  // bowlers.csv: we support both the simple and extended version
  if (bowlersText) {
    const rows = parseCsv(bowlersText);
    rows.forEach(r => {
      const bid = r.bowler_id || r.id || r.BOWLER_ID || r.ID;
      if (!bid) return;

      const first = r.first_name || r.FirstName || r.first || '';
      const last = r.last_name || r.LastName || r.last || '';
      const gender = r.gender || r.sex || r.Gender || '';
      const leagueId = r.league_id || r.LeagueId || r.league || '';
      const leagueName = leagueIdToName[leagueId] || r.league || '';

      const hRaw = r.handicap || r.hdcp || r.HDCP || '0';
      const handicap = Number(hRaw) || 0;

      const name = [first, last].filter(Boolean).join(' ') || (r.name || r.Name || 'Bowler');

      state.bowlers[String(bid)] = {
        id: bid,
        name,
        gender,
        handicap,
        league: leagueName
      };
    });
  }

  // team_roster.csv: team_id,bowler_id,(position?)
  if (rosterText) {
    const rows = parseCsv(rosterText);
    rows.forEach(r => {
      const tIdRaw = r.team_id || r.TEAM_ID;
      const bId = r.bowler_id || r.BOWLER_ID || r.bowler || r.BOWLER;
      if (!tIdRaw || !bId) return;

      const tKey = String(Number(tIdRaw));
      const team = state.teams[tKey];
      if (!team) return;

      if (!Array.isArray(team.bowlerIds)) team.bowlerIds = [];
      if (!team.bowlerIds.includes(String(bId))) {
        team.bowlerIds.push(String(bId));
      }
    });
  }

  // After loading CSV, re-normalize lanes and resync players from team rosters
  Object.values(state.lanes).forEach(lane => {
    normalizeLane(lane);
    if (lane.teamId) {
      syncLanePlayersFromTeam(lane);
    }
  });

  // Persist lanes + any runtime edits
  saveState();
}
