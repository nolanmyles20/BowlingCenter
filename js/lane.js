// js/lane.js
// add seedFromCSVsIfNeeded to your imports
import {
  getLane,
  getState,
  saveState,
  addRollForCurrentPlayer,
  toggleCurrentPlayerAbsent,
  advanceToNextPlayer,
  updateLane,
  seedFromCSVsIfNeeded
} from './state.js';

// ⬇️ CHANGED: import popup helper as well
import { scoreGame, maybeShowBowlingPopupForBowler } from './scoring.js';

const VIEW_MODE_KEY_PREFIX = 'lane_view_mode_'; // per lane: 'full' or 'compact';

// Theme storage
const THEME_KEY = 'bowling_theme_v1';
const DEFAULT_THEME = {
  accent: '#facc15',
  rowOdd: '#1e293b',
  rowEven: '#0f172a',
  border: '#991b1b',
  highlight: '#f97316' // separate color for active row + arrows
};

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function applyTheme(theme) {
  const t = theme || DEFAULT_THEME;
  const root = document.documentElement;
  root.style.setProperty('--color-accent', t.accent);
  root.style.setProperty('--color-row-odd', t.rowOdd);
  root.style.setProperty('--color-row-even', t.rowEven);
  root.style.setProperty('--color-score-border', t.border);
  root.style.setProperty('--color-highlight', t.highlight);
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
}

/* ---------------------------------------------------------
   Lane + view helpers
--------------------------------------------------------- */

function getLaneIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('lane') || '1');
}

function getViewMode(laneId) {
  const key = VIEW_MODE_KEY_PREFIX + laneId;
  const stored = localStorage.getItem(key);
  return stored === 'compact' ? 'compact' : 'full';
}

function setViewMode(laneId, mode) {
  const key = VIEW_MODE_KEY_PREFIX + laneId;
  localStorage.setItem(key, mode);
}

/* ---------------------------------------------------------
   Frame / roll helpers
--------------------------------------------------------- */

// Count completed frames (1–9) from rolls array
function countCompletedFrames9(rolls) {
  let frame = 0;
  let i = 0;
  while (frame < 9 && i < rolls.length) {
    const r = rolls[i];
    if (r === 10) {
      frame += 1;
      i += 1;
    } else {
      if (i + 1 >= rolls.length) break;
      frame += 1;
      i += 2;
    }
  }
  return frame;
}

// Did last roll complete a frame (1–9)?
function didLastRollCompleteFrame(rollsBefore, rollsAfter) {
  const beforeFrames = countCompletedFrames9(rollsBefore);
  const afterFrames = countCompletedFrames9(rollsAfter);
  return afterFrames > beforeFrames;
}

// Determine if we are on the 2nd ball of frames 1–9 and how many pins so far
function getSecondBallContextFrames1to9(rolls) {
  let frame = 0;
  let i = 0;

  while (frame < 9 && i < rolls.length) {
    const r = rolls[i];

    if (r === 10) {
      frame += 1;
      i += 1;
    } else {
      if (i + 1 >= rolls.length) {
        return {
          isSecondBall: true,
          frameIndex: frame,
          pinsSoFar: rolls[i] || 0
        };
      }
      frame += 1;
      i += 2;
    }
  }

  return { isSecondBall: false };
}

// Guess current frame index (1–10) based on current bowler/game
function getCurrentFrameForLane(lane) {
  const players = lane.players || [];
  const idx = lane.currentPlayerIndex || 0;
  const player = players[idx];
  if (!player || !Array.isArray(player.games)) return 1;

  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const game = player.games[gIndex] || { rolls: [] };
  const rolls = Array.isArray(game.rolls) ? game.rolls : [];
  const completed = countCompletedFrames9(rolls);
  return Math.min(10, completed + 1);
}

/* ---------------------------------------------------------
   Is game fully complete?  (robust version)
--------------------------------------------------------- */

function isPlayerGameComplete(rolls) {
  if (!rolls || !rolls.length) return false;

  let frame = 1;
  let i = 0;

  while (frame <= 10 && i < rolls.length) {
    const r1 = rolls[i] ?? 0;

    if (frame <= 9) {
      // frames 1–9
      if (r1 === 10) {
        // strike
        i += 1;
      } else {
        if (i + 1 >= rolls.length) return false; // missing 2nd ball
        const r2 = rolls[i + 1] ?? 0;
        // don't enforce pin total here; scoring.js does that
        i += 2;
      }
    } else {
      // 10th frame
      if (i + 1 >= rolls.length) return false;
      const r2 = rolls[i + 1] ?? 0;
      const isStrikeOrSpare = (r1 === 10) || (r1 + r2 === 10);

      if (isStrikeOrSpare) {
        // need 3rd ball
        if (i + 2 >= rolls.length) return false;
        i += 3;
      } else {
        // open – just 2 balls
        i += 2;
      }
    }

    frame += 1;
  }

  return frame > 10; // we successfully advanced past 10
}

// Only consider *non-absent* bowlers
function isGameFullyComplete(lane) {
  const allPlayers = lane.players || [];
  const players = allPlayers.filter(p => p && !p.absent);
  if (!players.length) return false;

  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  let anyStarted = false;

  for (const p of players) {
    const games = p.games || [];
    const game = games[gIndex] || { rolls: [] };
    const rolls = Array.isArray(game.rolls) ? game.rolls : [];

    if (rolls.length > 0) anyStarted = true;
    if (!isPlayerGameComplete(rolls)) return false;
  }

  return anyStarted;
}

/* ---------------------------------------------------------
   League base helper (for absent scoring)
--------------------------------------------------------- */

function getLeagueBaseForLane(lane) {
  try {
    const state = getState();
    if (lane.league && state.leagues && state.leagues[lane.league]) {
      const lg = state.leagues[lane.league];
      if (typeof lg.hcpBase === 'number') return lg.hcpBase;
    }
  } catch {
    // ignore
  }
  return 210;
}

/* ---------------------------------------------------------
   Auto-absent scoring (full game fill)
--------------------------------------------------------- */

function fillAbsentForCurrentGame(laneId) {
  const lane = getLane(laneId);
  const players = lane.players || [];
  if (!players.length) return;

  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const leagueBase = getLeagueBaseForLane(lane);

  let changed = false;

  players.forEach((p) => {
    if (!p || !p.absent) return;

    const games = p.games || [];
    if (!games[gIndex]) games[gIndex] = { rolls: [] };
    const game = games[gIndex];

    if (!Array.isArray(game.rolls)) game.rolls = [];
    if (game.rolls.length > 0) return; // already filled for this game

    const hcp = p.handicap || 0;
    const gameAverage = Math.max(0, leagueBase - hcp); // average pins per game
    const perFrame = gameAverage / 10;

    // simple open-frame model: two rolls adding up close to perFrame, never >10
    let r1 = Math.floor(perFrame * 0.6);
    if (r1 < 0) r1 = 0;
    if (r1 > 9) r1 = 9;

    let r2 = Math.round(perFrame - r1);
    if (r2 < 0) r2 = 0;
    if (r1 + r2 > 10) r2 = 10 - r1;

    const frameRolls = [];
    for (let f = 1; f <= 10; f++) {
      frameRolls.push(r1, r2);
    }

    game.rolls = frameRolls;
    changed = true;
  });

  if (changed) saveState();
}

/* ---------------------------------------------------------
   Pin buttons
--------------------------------------------------------- */

function renderPinButtons(lane) {
  const container = document.getElementById('pin-buttons');
  if (!container) return;
  container.innerHTML = '';

  const players = lane.players || [];
  const currentIndex = lane.currentPlayerIndex || 0;
  const player = players[currentIndex] || { games: [{ rolls: [] }] };
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const game = player.games?.[gIndex] || { rolls: [] };
  const rolls = Array.isArray(game.rolls) ? game.rolls : [];

  let maxPins = 10;
  const ctx = getSecondBallContextFrames1to9(rolls);
  if (ctx.isSecondBall && ctx.frameIndex < 9) {
    const remaining = 10 - ctx.pinsSoFar;
    maxPins = Math.max(0, Math.min(10, remaining));
  }

  for (let pins = 0; pins <= maxPins; pins++) {
    const btn = document.createElement('button');
    btn.className = 'btn-pin';
    btn.textContent = pins;
    btn.onclick = () => handleRoll(lane.id, pins);
    container.appendChild(btn);
  }
}

/* ---------------------------------------------------------
   Game-complete popup helpers
--------------------------------------------------------- */

// ... (UNCHANGED code for game-complete modals, renderScore, etc.)
// (kept exactly as you pasted – omitted here only for brevity)

/* ---------------------------------------------------------
   Handle roll input
--------------------------------------------------------- */

function handleRoll(laneId, pins) {
  const lane = getLane(laneId);
  if (!lane.active) {
    alert('Lane is not active');
    return;
  }

  const banner = document.getElementById('next-game-banner');
  if (banner) banner.classList.add('hidden');

  const playersBefore = lane.players || [];
  const currentIndex = lane.currentPlayerIndex || 0;
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const currentPlayerBefore = playersBefore[currentIndex] || { games: [{ rolls: [] }] };
  const gameBefore = currentPlayerBefore.games?.[gIndex] || { rolls: [] };
  const rollsBefore = Array.isArray(gameBefore.rolls) ? [...gameBefore.rolls] : [];

  let effectivePins = pins;

  // 9-pin no-tap logic
  if (lane.mode === '9pin') {
    const ctx = getSecondBallContextFrames1to9(rollsBefore);
    const isFirstBallOfFrame = !ctx.isSecondBall;
    if (isFirstBallOfFrame && pins === 9) {
      effectivePins = 10;
    }
  }

  addRollForCurrentPlayer(laneId, effectivePins);

  const laneAfter = getLane(laneId);
  const playersAfter = laneAfter.players || [];
  const currentPlayerAfter = playersAfter[currentIndex] || { games: [{ rolls: [] }] };
  const gameAfter = currentPlayerAfter.games?.[gIndex] || { rolls: [] };
  const rollsAfter = Array.isArray(gameAfter.rolls) ? gameAfter.rolls : [];

  // ⬇️ NEW: trigger popup (strike/spare/gutter) for **active** bowler
  // maybeShowBowlingPopupForBowler will ignore absent bowlers automatically
  maybeShowBowlingPopupForBowler(rollsAfter, currentPlayerAfter, 10);

  if (didLastRollCompleteFrame(rollsBefore, rollsAfter)) {
    advanceToNextPlayer(laneId);
  }

  renderScore(laneId);
  renderPinButtons(getLane(laneId));

  checkAndHandleGameComplete(laneId);
}

/* ---------------------------------------------------------
   Scoring grid helpers, renderScore, lane header, menu, settings,
   game buttons, and DOMContentLoaded init
--------------------------------------------------------- */

// (All of that stays exactly as you already have it)
