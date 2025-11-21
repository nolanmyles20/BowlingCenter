// js/state.js

const STORAGE_KEY = 'bowling_state_v3';

// ---------- helpers ----------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toInt(val, def = 0) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? def : n;
}

function toFloat(val, def = 0) {
  const n = parseFloat(val);
  return Number.isNaN(n) ? def : n;
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
      name: b ? (b.name || b.display_name || `Bowler ${idx + 1}`) : `Bowler ${idx + 1}`,
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

// ---------- CSV seeding for leagues / bowlers / teams / rosters ----------

async function loadCSV(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('CSV fetch failed:', url, res.status);
      return [];
    }
    const text = await res.text();

    const lines = text.split(/\r?\n/);
    let headerLine = '';
    const dataLines = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!headerLine) {
        headerLine = line;
      } else {
        dataLines.push(line);
      }
    }

    if (!headerLine) return [];
    const headers = headerLine.split(',').map(h => h.trim());

    return dataLines.map(line => {
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, i) => {
        if (!h) return; // ignore blank header column
        obj[h] = (cols[i] || '').trim();
      });
      return obj;
    });
  } catch (err) {
    console.warn('CSV fetch error for', url, err);
    return [];
  }
}

let csvSeedPromise = null;

/**
 * Load leagues.csv, bowlers.csv, teams.csv, team_roster.csv
 * and push them into state.bowlers / state.teams / state.leagues.
 * LANE SCORES ARE PRESERVED.
 */
export function seedFromCSVsIfNeeded() {
  if (csvSeedPromise) return csvSeedPromise;

  csvSeedPromise = (async () => {
    try {
      const [leagueRows, bowlerRows, teamRows, rosterRows] = await Promise.all([
        loadCSV('data/leagues.csv'),
        loadCSV('data/bowlers.csv'),
        loadCSV('data/teams.csv'),
        loadCSV('data/team_roster.csv')
      ]);

      if (!leagueRows.length && !bowlerRows.length && !teamRows.length) {
        // Nothing to seed; probably running without CSVs
        return;
      }

      // Preserve lane scores
      const lanesRef = state.lanes;

      // Reset core entities from CSV
      state.bowlers = {};
      state.teams = {};
      state.leagues = {};
      state.nextBowlerId = 1;
      state.nextTeamId = 1;
      state.lanes = lanesRef;

      // ---- Leagues ----
      leagueRows.forEach(row => {
        const name = (row.league || '').trim();
        if (!name) return;
        const hcpBaseVal = toInt(row.hdcp_base, 210);
        state.leagues[name] = {
          id: row.league_id || name,
          name,
          average: toFloat(row.average, 0),
          hcp: toInt(row.hdcp, 0),
          hcpBase: hcpBaseVal || 210,
          hcpPercent: toInt(row.hdcp_percent, 0),
          hcpMax: toInt(row.hdcp_max, 0),
          hcpMin: toInt(row.hdcp_min, 0),
          games: toInt(row.games, 0)
        };
      });

      // ---- Bowlers ----
      const bowlerKeyToId = {};
      bowlerRows.forEach(row => {
        const first = (row.first_name || '').trim();
        const last = (row.last_name || '').trim();
        const nameFromParts = `${first} ${last}`.trim();
        const display = (row.display_name || '').trim() || nameFromParts || 'Unknown';

        const idNum = state.nextBowlerId++;

        const bObj = {
          id: idNum,
          bowlerKey: (row.bowler_id || '').trim(),
          firstName: first,
          lastName: last,
          name: display,
          gender: (row.gender || '').trim(),
          street: (row.street || '').trim(),
          street2: (row.street2 || '').trim(),
          city: (row.city || '').trim(),
          state: (row.state || '').trim(),
          zip: (row.zip || '').trim(),
          phone: (row.phone || '').trim(),
          average: toInt(row.average, 0),
          handicap: toInt(row.hdcp, 0),
          hcpBase: toInt(row.hdcp_base, 0),
          hcpPercent: toInt(row.hdcp_percent, 0),
          hcpMax: toInt(row.hdcp_max, 0),
          hcpMin: toInt(row.hdcp_min, 0),
          games: toInt(row.games, 0),
          payStatus: (row.pay_stat || '').trim(),
          note: (row.note || '').trim(),
          league: (row.league || '').trim()
        };

        state.bowlers[String(idNum)] = bObj;
        if (bObj.bowlerKey) {
          bowlerKeyToId[bObj.bowlerKey] = idNum;
        }
      });

      // ---- Teams ----
      const teamKeyToId = {};
      teamRows.forEach(row => {
        const leagueId = (row.league_id || '').trim();
        const leagueName = (row.league || '').trim();
        const teamNum = (row.team_number || '').trim();
        const teamName = (row.team_name || '').trim() || `Team ${teamNum || state.nextTeamId}`;

        const idNum = state.nextTeamId++;

        const leagueText =
          leagueName ||
          (Object.values(state.leagues).find(lg => lg.id === leagueId)?.name || '');

        state.teams[String(idNum)] = {
          id: idNum,
          name: teamName,
          league: leagueText,
          leagueId,
          teamNumber: teamNum,
          bowlerIds: []
        };

        const key = `${leagueId}:${teamNum}`;
        teamKeyToId[key] = idNum;
      });

      // ---- Rosters ----
      const rosterByTeamId = {};
      rosterRows.forEach(row => {
        const leagueId = (row.league_id || '').trim();
        const teamNum = (row.team_number || '').trim();
        const bowlerKey = (row.bowler_id || '').trim();
        if (!leagueId || !teamNum || !bowlerKey) return;

        const teamKey = `${leagueId}:${teamNum}`;
        const teamId = teamKeyToId[teamKey];
        if (!teamId) return;

        const bowlerIdNum = bowlerKeyToId[bowlerKey];
        if (!bowlerIdNum) return;

        const pos = toInt(row.position, 0);
        if (!rosterByTeamId[teamId]) rosterByTeamId[teamId] = [];
        rosterByTeamId[teamId].push({ pos, bowlerIdNum });
      });

      Object.entries(rosterByTeamId).forEach(([teamIdStr, entries]) => {
        entries.sort((a, b) => a.pos - b.pos);
        state.teams[teamIdStr].bowlerIds = entries.map(e => e.bowlerIdNum);
      });

      saveState();
    } catch (err) {
      console.warn('CSV seeding failed:', err);
    }
  })();

  return csvSeedPromise;
}

// convenience for building league dropdowns
export function listLeagues() {
  return Object.values(state.leagues || {});
}

export function listLeagueNames() {
  return Object.keys(state.leagues || {});
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
