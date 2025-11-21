// js/lane.js
// js/lane.js
import {
  seedFromCSVsIfNeeded,
  getLane,
  getState,
  saveState,
  addRollForCurrentPlayer,
  forceAddRollForCurrentPlayer,
  toggleCurrentPlayerAbsent,
  advanceToNextPlayer,
  updateLane
} from './state.js';
import { scoreGame } from './scoring.js';

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
        // don't enforce pin sum, scoring.js handles actual scoring
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
   Auto-absent scoring
   Uses forceAddRollForCurrentPlayer so absents actually get scores.
--------------------------------------------------------- */

function autoProcessAbsent(laneId) {
  let safety = 0;

  while (safety++ < 40) {
    const lane = getLane(laneId);
    const players = lane.players || [];
    if (!players.length) break;

    const currentIndex = lane.currentPlayerIndex || 0;
    const player = players[currentIndex];
    if (!player || !player.absent) break; // stop when we reach a present bowler

    const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
    const games = player.games || [];
    const game = games[gIndex] || { rolls: [] };
    const rolls = Array.isArray(game.rolls) ? game.rolls : [];

    // if this player's game is already complete, just move on
    if (isPlayerGameComplete(rolls)) {
      advanceToNextPlayer(laneId);
      continue;
    }

    const laneNow = getLane(laneId);
    const leagueBase = getLeagueBaseForLane(laneNow);
    const hcp = player.handicap || 0;
    const gameAverage = Math.max(0, leagueBase - hcp);
    const perFrame = gameAverage / 10;

    // simple open-frame model: two rolls that sum close to perFrame, never > 10
    let r1 = Math.floor(perFrame * 0.6);
    if (r1 < 0) r1 = 0;
    if (r1 > 9) r1 = 9;

    let r2 = Math.round(perFrame - r1);
    if (r2 < 0) r2 = 0;
    if (r1 + r2 > 10) r2 = 10 - r1;

    // IMPORTANT: use forceAddRoll... so absent bowlers actually get rolls
    forceAddRollForCurrentPlayer(laneId, r1);
    forceAddRollForCurrentPlayer(laneId, r2);

    advanceToNextPlayer(laneId);
  }
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

// current-game only table
function buildSingleGameSummaryHtml(lane) {
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const players = lane.players || [];

  let rows = '';
  players.forEach((p) => {
    if (!p) return;
    const games = p.games || [];
    const game = games[gIndex] || { rolls: [] };
    const s = scoreGame(game.rolls || []);
    const scratch = s.total || 0;
    const hcp = p.handicap || 0;
    const totalH = scratch + hcp;

    rows += `
      <tr>
        <td>${p.name || 'Bowler'}</td>
        <td>${scratch}</td>
        <td>${hcp}</td>
        <td>${totalH}</td>
      </tr>
    `;
  });

  return `
    <table class="recap-table game-complete-table">
      <thead>
        <tr>
          <th>Bowler</th>
          <th>Scratch</th>
          <th>Hcp</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// full 3-game + series summary
function buildSeriesSummaryHtml(lane) {
  const playersSrc = lane.players || [];
  let rows = '';

  playersSrc.forEach(src => {
    if (!src) return;
    const name = src.name || 'Bowler';
    const hcp = src.handicap || 0;
    const games = src.games || [{ rolls: [] }, { rolls: [] }, { rolls: [] }];

    const gScr = [];
    const gWithH = [];
    for (let gi = 0; gi < 3; gi++) {
      const g = games[gi] || { rolls: [] };
      const s = scoreGame(g.rolls || []);
      const scr = s.total || 0;
      gScr[gi] = scr;
      gWithH[gi] = scr + hcp;
    }

    const seriesScr = gScr[0] + gScr[1] + gScr[2];
    const seriesWithH = seriesScr + hcp * 3;

    rows += `
      <tr>
        <td>${name}</td>
        <td>${gScr[0]}</td><td>${gWithH[0]}</td>
        <td>${gScr[1]}</td><td>${gWithH[1]}</td>
        <td>${gScr[2]}</td><td>${gWithH[2]}</td>
        <td>${seriesScr}</td><td>${seriesWithH}</td>
      </tr>
    `;
  });

  return `
    <table class="recap-table game-complete-table">
      <thead>
        <tr>
          <th>Bowler</th>
          <th>G1 Scr</th><th>G1+H</th>
          <th>G2 Scr</th><th>G2+H</th>
          <th>G3 Scr</th><th>G3+H</th>
          <th>Series Scr</th><th>Series+H</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function showGameCompleteModal(laneId) {
  const lane = getLane(laneId);
  const currentGame = lane.currentGame || 1;

  const overlay = document.getElementById('game-complete-overlay');
  const title = document.getElementById('game-complete-title');
  const summary = document.getElementById('game-complete-summary');
  const nextBtn = document.getElementById('game-complete-next-btn');

  if (!overlay || !title || !summary || !nextBtn) return;

  if (currentGame < 3) {
    title.textContent = `Game ${currentGame} Complete`;
    summary.innerHTML = buildSingleGameSummaryHtml(lane);
    nextBtn.textContent = `Start Game ${currentGame + 1}`;
    nextBtn.dataset.nextGame = String(currentGame + 1);
    nextBtn.disabled = false;
  } else {
    title.textContent = 'Series Complete';
    summary.innerHTML = buildSeriesSummaryHtml(lane);
    nextBtn.textContent = 'Series Complete';
    nextBtn.dataset.nextGame = '';
    nextBtn.disabled = true;
  }

  overlay.classList.remove('hidden');
}

function hideGameCompleteModal() {
  const overlay = document.getElementById('game-complete-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function checkAndHandleGameComplete(laneId) {
  const lane = getLane(laneId);
  if (!isGameFullyComplete(lane)) return;
  renderScore(laneId); // clears highlight
  showGameCompleteModal(laneId);
}

function startNextGameFromModal(laneId) {
  const nextBtn = document.getElementById('game-complete-next-btn');
  if (!nextBtn) return;

  const nextGameStr = nextBtn.dataset.nextGame || '';
  const nextGame = Number(nextGameStr);

  hideGameCompleteModal();
  if (!nextGame || Number.isNaN(nextGame)) return;

  updateLane(laneId, { currentGame: nextGame, currentPlayerIndex: 0 });

  const banner = document.getElementById('next-game-banner');
  if (banner) {
    banner.textContent = `Bowl to start Game ${nextGame}`;
    banner.classList.remove('hidden');
  }

  autoProcessAbsent(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

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

  if (didLastRollCompleteFrame(rollsBefore, rollsAfter)) {
    advanceToNextPlayer(laneId);
  }

  autoProcessAbsent(laneId);

  renderScore(laneId);
  renderPinButtons(getLane(laneId));

  checkAndHandleGameComplete(laneId);
}

/* ---------------------------------------------------------
   Scoring grid helpers
--------------------------------------------------------- */

function buildFullFrames(frames) {
  const full = [];
  for (let i = 1; i <= 10; i++) {
    const existing = frames.find(f => f.frame === i);
    if (existing) {
      full.push({
        frame: existing.frame,
        rolls: existing.rolls,
        frame_score: existing.frame_score,
        running_total: existing.running_total
      });
    } else {
      full.push({
        frame: i,
        rolls: [],
        frame_score: null,
        running_total: null
      });
    }
  }
  return full;
}

function formatFrameRolls(frameIndex, frame) {
  const rolls = frame.rolls || [];

  if (frameIndex < 9) {
    if (rolls[0] === 10) return ['X', ''];
    const first = rolls[0];
    const second = rolls[1];

    if (first == null && second == null) return ['', ''];

    const firstVal = first === 0 ? '-' : (first ?? '');
    if (first != null && second != null && first + second === 10) {
      return [firstVal, '/'];
    }
    const secondVal = second === 0 ? '-' : (second ?? '');
    return [firstVal, secondVal];
  }

  const symbols = rolls.map((r, i) => {
    if (r === 10) return 'X';
    if (i > 0 && (rolls[i - 1] ?? 0) + r === 10) return '/';
    return r === 0 ? '-' : (r ?? '');
  });

  const first = symbols[0] ?? '';
  const second = [symbols[1], symbols[2]].filter(Boolean).join(' ');
  return [first, second];
}

/* ---------------------------------------------------------
   Render scoreboard
--------------------------------------------------------- */

function renderScore(laneId) {
  const lane = getLane(laneId);
  const viewMode = getViewMode(laneId);
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const gameComplete = isGameFullyComplete(lane);

  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;
  scoreboard.innerHTML = '';

  const playersSrc = lane.players || [];
  const players = [];

  // Normalize 4 rows
  for (let i = 0; i < 4; i++) {
    if (i < playersSrc.length) {
      const src = playersSrc[i];
      const game = src.games?.[gIndex] || { rolls: [] };
      const scoring = scoreGame(game.rolls || []);
      const fullFrames = buildFullFrames(scoring.frames);
      players.push({
        name: src.name || `Player ${i + 1}`,
        handicap: src.handicap || 0,
        absent: !!src.absent,
        isCurrent: !gameComplete && i === (lane.currentPlayerIndex || 0),
        scoring,
        fullFrames
      });
    } else {
      const scoring = scoreGame([]);
      const fullFrames = buildFullFrames([]);
      players.push({
        name: `Player ${i + 1}`,
        handicap: 0,
        absent: true,
        isCurrent: false,
        scoring,
        fullFrames
      });
    }
  }

  const currentFrame = getCurrentFrameForLane(lane);
  let startFrame = 1;
  let endFrame = 10;

  if (viewMode === 'compact') {
    startFrame = currentFrame - 3;
    if (startFrame < 1) startFrame = 1;
    endFrame = startFrame + 3;
    if (endFrame > 10) {
      endFrame = 10;
      startFrame = Math.max(1, endFrame - 3);
    }
  }

  const headerFrames = players[0].fullFrames;
  const visibleFramesHeader = headerFrames.slice(startFrame - 1, endFrame);

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'scoreboard-row scoreboard-header';

  const gameLabel = document.createElement('div');
  gameLabel.className = 'scoreboard-cell label-cell';
  gameLabel.textContent = `Game ${lane.currentGame || 1}`;
  headerRow.appendChild(gameLabel);

  visibleFramesHeader.forEach(frame => {
    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell frame-number-cell';
    cell.textContent = frame.frame;
    headerRow.appendChild(cell);
  });

  const totalHeaderCell = document.createElement('div');
  totalHeaderCell.className = 'scoreboard-cell frame-number-cell';
  totalHeaderCell.textContent = 'TOT';
  headerRow.appendChild(totalHeaderCell);

  scoreboard.appendChild(headerRow);

  // Player rows
  players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'scoreboard-row player-row';
    if (p.isCurrent) row.classList.add('current');

    const labelCell = document.createElement('div');
    labelCell.className = 'scoreboard-cell label-cell player-label-cell';

    const absentText = p.absent ? ' (ABS)' : '';

    const arrowsHtml = p.isCurrent
      ? `
        <div class="current-arrows">
          <span class="arrow-seg">➤</span>
          <span class="arrow-seg">➤</span>
          <span class="arrow-seg">➤</span>
          <span class="arrow-seg">➤</span>
        </div>
      `
      : '';

    labelCell.innerHTML = `
      <div class="player-name${p.absent ? ' absent' : ''}">
        ${p.name}${absentText}
      </div>
      <div class="player-total">
        HCP ${p.handicap || 0}
      </div>
      ${arrowsHtml}
    `;
    row.appendChild(labelCell);

    const framesToShow = p.fullFrames.slice(startFrame - 1, endFrame);

    framesToShow.forEach((frame) => {
      const cell = document.createElement('div');
      cell.className = 'scoreboard-cell player-frame-cell';

      const [firstSymbol, secondSymbol] = formatFrameRolls(frame.frame - 1, frame);
      const frameScore = frame.running_total;

      cell.innerHTML = `
        <div class="frame-score">${frameScore != null ? frameScore : ''}</div>
        <div class="rolls-row">
          <span class="roll roll1">${firstSymbol}</span>
          <span class="roll roll2">${secondSymbol}</span>
        </div>
      `;

      row.appendChild(cell);
    });

    const scratchTotal = p.scoring.total || 0;
    const hcp = p.handicap || 0;
    const totalWithHcp = scratchTotal + hcp;

    const totalCell = document.createElement('div');
    totalCell.className = 'scoreboard-cell player-frame-cell';
    totalCell.innerHTML = `
      <div class="frame-score">${totalWithHcp}</div>
      <div class="rolls-row">
        <span class="roll roll1">Scr ${scratchTotal}</span>
        <span class="roll roll2">Hcp ${hcp}</span>
      </div>
    `;
    row.appendChild(totalCell);

    scoreboard.appendChild(row);
  });

  // TEAM ROW
  const teamRow = document.createElement('div');
  teamRow.className = 'scoreboard-row player-row';

  const teamLabelCell = document.createElement('div');
  teamLabelCell.className = 'scoreboard-cell label-cell player-label-cell';
  teamLabelCell.innerHTML = `
    <div class="player-name">Team</div>
    <div class="player-total">&nbsp;</div>
  `;
  teamRow.appendChild(teamLabelCell);

  const realPlayersForTotals = players.filter((_, idx) => idx < playersSrc.length);

  for (let f = startFrame; f <= endFrame; f++) {
    const frameIndex = f - 1;
    let teamRunning = 0;
    realPlayersForTotals.forEach(p => {
      const fr = p.fullFrames[frameIndex];
      if (fr && fr.running_total != null) {
        teamRunning += fr.running_total;
      }
    });

    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell player-frame-cell';
    cell.innerHTML = `
      <div class="frame-score">${teamRunning || ''}</div>
      <div class="rolls-row">
        <span class="roll">&nbsp;</span>
      </div>
    `;
    teamRow.appendChild(cell);
  }

  let teamScratchTotal = 0;
  let teamHcpTotal = 0;
  realPlayersForTotals.forEach(p => {
    teamScratchTotal += p.scoring.total || 0;
    teamHcpTotal += p.handicap || 0;
  });

  const teamTotalWithHcp = teamScratchTotal + teamHcpTotal;

  const teamTotalCell = document.createElement('div');
  teamTotalCell.className = 'scoreboard-cell player-frame-cell';
  teamTotalCell.innerHTML = `
    <div class="frame-score">${teamTotalWithHcp}</div>
    <div class="rolls-row">
      <span class="roll roll1">Scr ${teamScratchTotal}</span>
      <span class="roll roll2">Hcp ${teamHcpTotal}</span>
    </div>
  `;
  teamRow.appendChild(teamTotalCell);

  scoreboard.appendChild(teamRow);

  const toggleBtn = document.getElementById('view-toggle');
  if (toggleBtn) {
    toggleBtn.textContent =
      viewMode === 'full' ? 'Show Last 4 Frames' : 'Show All 10 Frames';
  }
}

/* ---------------------------------------------------------
   Lane header info
--------------------------------------------------------- */

function renderLaneInfo(laneId) {
  const lane = getLane(laneId);
  const state = getState();
  const team = lane.teamId ? state.teams[String(lane.teamId)] : null;

  const info = document.getElementById('lane-info');
  const title = document.getElementById('lane-title');

  if (title) title.textContent = `Lane ${laneId}`;
  if (!info) return;

  const leagueText = lane.league || 'None';
  const modeText = lane.mode === '9pin' ? '9-Pin No-Tap' : 'Standard';
  const teamText =
    team ? `${team.name} (${team.league || 'No league'})` : 'None';

  info.innerHTML = `
    <div class="lane-info-line">
      <span class="lane-info-label">Status:</span>
      <span class="lane-info-value">${lane.active ? 'Active' : 'Inactive'}</span>
    </div>
    <div class="lane-info-line">
      <span class="lane-info-label">League:</span>
      <span class="lane-info-value">${leagueText}</span>
    </div>
    <div class="lane-info-line">
      <span class="lane-info-label">Mode:</span>
      <span class="lane-info-value">${modeText}</span>
    </div>
    <div class="lane-info-line">
      <span class="lane-info-label">Team:</span>
      <span class="lane-info-value">${teamText}</span>
    </div>
  `;
}

/* ---------------------------------------------------------
   Lane menu actions
--------------------------------------------------------- */

function openMenu() {
  const overlay = document.getElementById('lane-menu-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function closeMenu() {
  const overlay = document.getElementById('lane-menu-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function handleMarkAbsent(laneId) {
  toggleCurrentPlayerAbsent(laneId);
  autoProcessAbsent(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

function handleSkipBowler(laneId) {
  advanceToNextPlayer(laneId);
  autoProcessAbsent(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

function handleScoreCorrection(laneId) {
  const lane = getLane(laneId);
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const players = lane.players || [];
  if (!players.length) {
    alert('No players on lane');
    return;
  }

  const idx = lane.currentPlayerIndex || 0;
  const player = players[idx];
  const game = player.games?.[gIndex] || { rolls: [] };
  const rolls = game.rolls || [];
  if (!rolls.length) {
    alert('This bowler has no rolls in this game yet');
    return;
  }

  const rollNumStr = prompt(`Enter roll number to change (1–${rolls.length})`);
  if (!rollNumStr) return;

  const index = Number(rollNumStr);
  if (Number.isNaN(index) || index < 1 || index > rolls.length) {
    alert('Invalid roll number');
    return;
  }

  const newVal = prompt('Enter new pin count (0–10)');
  if (newVal === null) return;
  const pins = Number(newVal);
  if (Number.isNaN(pins) || pins < 0 || pins > 10) {
    alert('Invalid pin count');
    return;
  }

  game.rolls[index - 1] = pins;
  saveState();
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

/* ---------------------------------------------------------
   Settings modal
--------------------------------------------------------- */

function openSettingsModal() {
  closeMenu();
  const theme = loadTheme();
  const accent = document.getElementById('theme-accent');
  const rowOdd = document.getElementById('theme-row-odd');
  const rowEven = document.getElementById('theme-row-even');
  const border = document.getElementById('theme-border');
  const highlight = document.getElementById('theme-highlight');

  if (accent) accent.value = theme.accent;
  if (rowOdd) rowOdd.value = theme.rowOdd;
  if (rowEven) rowEven.value = theme.rowEven;
  if (border) border.value = theme.border;
  if (highlight) highlight.value = theme.highlight;

  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function closeSettingsModal() {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function saveSettingsFromForm() {
  const accent = document.getElementById('theme-accent');
  const rowOdd = document.getElementById('theme-row-odd');
  const rowEven = document.getElementById('theme-row-even');
  const border = document.getElementById('theme-border');
  const highlight = document.getElementById('theme-highlight');

  const theme = {
    accent: accent?.value || DEFAULT_THEME.accent,
    rowOdd: rowOdd?.value || DEFAULT_THEME.rowOdd,
    rowEven: rowEven?.value || DEFAULT_THEME.rowEven,
    border: border?.value || DEFAULT_THEME.border,
    highlight: highlight?.value || DEFAULT_THEME.highlight
  };

  saveTheme(theme);
  applyTheme(theme);
  closeSettingsModal();
}

/* ---------------------------------------------------------
   Game buttons
--------------------------------------------------------- */

function setGame(laneId, gameNum) {
  updateLane(laneId, { currentGame: gameNum });
  autoProcessAbsent(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));

  ['game1-btn', 'game2-btn', 'game3-btn'].forEach((id, idx) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (idx === gameNum - 1) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(loadTheme());

  // Make sure CSV data is loaded into state before we touch lanes/teams/bowlers
  await initStateFromCsv();

  const laneId = getLaneIdFromQuery();
  const lane = getLane(laneId);

  renderLaneInfo(laneId);

  // process absents immediately (e.g., if first bowler is absent)
  autoProcessAbsent(laneId);

  renderScore(laneId);
  renderPinButtons(getLane(laneId));
  checkAndHandleGameComplete(laneId);

  const toggleBtn = document.getElementById('view-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = getViewMode(laneId);
      const next = current === 'full' ? 'compact' : 'full';
      setViewMode(laneId, next);
      renderScore(laneId);
    });
  }

  // menu wiring
  const menuBtn = document.getElementById('lane-menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', openMenu);

  const menuClose = document.getElementById('menu-close-btn');
  const menuCloseBottom = document.getElementById('menu-close-bottom-btn');
  if (menuClose) menuClose.addEventListener('click', closeMenu);
  if (menuCloseBottom) menuCloseBottom.addEventListener('click', closeMenu);

  const overlay = document.getElementById('lane-menu-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeMenu();
    });
  }

  const absentBtn = document.getElementById('menu-absent-btn');
  if (absentBtn) {
    absentBtn.addEventListener('click', () => handleMarkAbsent(laneId));
  }

  const skipBtn = document.getElementById('menu-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => handleSkipBowler(laneId));
  }

  const correctBtn = document.getElementById('menu-correct-btn');
  if (correctBtn) {
    correctBtn.addEventListener('click', () => handleScoreCorrection(laneId));
  }

  const settingsBtn = document.getElementById('menu-settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }

  const settingsOverlay = document.getElementById('settings-overlay');
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettingsModal();
    });
  }

  const settingsClose = document.getElementById('settings-close-btn');
  const settingsCloseBottom = document.getElementById('settings-close-bottom-btn');
  if (settingsClose) settingsClose.addEventListener('click', closeSettingsModal);
  if (settingsCloseBottom) settingsCloseBottom.addEventListener('click', closeSettingsModal);

  const settingsSave = document.getElementById('settings-save-btn');
  if (settingsSave) settingsSave.addEventListener('click', saveSettingsFromForm);

  // Game complete modal
  const gcClose = document.getElementById('game-complete-close');
  const gcNext = document.getElementById('game-complete-next-btn');
  const gcOverlay = document.getElementById('game-complete-overlay');

  if (gcClose) gcClose.addEventListener('click', hideGameCompleteModal);
  if (gcNext) gcNext.addEventListener('click', () => startNextGameFromModal(laneId));
  if (gcOverlay) {
    gcOverlay.addEventListener('click', (e) => {
      if (e.target === gcOverlay) hideGameCompleteModal();
    });
  }

  // game buttons
  const g1 = document.getElementById('game1-btn');
  const g2 = document.getElementById('game2-btn');
  const g3 = document.getElementById('game3-btn');

  if (g1 && g2 && g3) {
    g1.addEventListener('click', () => setGame(laneId, 1));
    g2.addEventListener('click', () => setGame(laneId, 2));
    g3.addEventListener('click', () => setGame(laneId, 3));

    setGame(laneId, lane.currentGame || 1);
  }
});
