// js/lane.js
import {
  getLane,
  getState,
  saveState,
  addRollForCurrentPlayer,
  toggleCurrentPlayerAbsent,
  advanceToNextPlayer
} from './state.js';
import { scoreGame } from './scoring.js';

const VIEW_MODE_KEY_PREFIX = 'lane_view_mode_'; // per lane: 'full' or 'compact'

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
   FRAME / ROLL HELPERS
--------------------------------------------------------- */

// Count how many frames (1–9) are fully completed in a roll sequence
function countCompletedFrames9(rolls) {
  let frame = 0;
  let i = 0;
  while (frame < 9 && i < rolls.length) {
    const r = rolls[i];
    if (r === 10) {
      // strike, one-ball frame
      frame += 1;
      i += 1;
    } else {
      if (i + 1 >= rolls.length) break; // incomplete second ball
      frame += 1;
      i += 2;
    }
  }
  return frame;
}

// Did the last roll finish a frame 1–9?
function didLastRollCompleteFrame(rollsBefore, rollsAfter) {
  const beforeFrames = countCompletedFrames9(rollsBefore);
  const afterFrames = countCompletedFrames9(rollsAfter);
  return afterFrames > beforeFrames;
}

/**
 * For frames 1–9 only:
 * Look at existing rolls and see if we are waiting for the second ball of a frame,
 * and if so, how many pins have already been knocked down.
 *
 * Returns:
 *   { isSecondBall: true, frameIndex, pinsSoFar }  for frames 1–9
 *   or { isSecondBall: false }
 */
function getSecondBallContextFrames1to9(rolls) {
  let frame = 0;
  let i = 0;

  while (frame < 9 && i < rolls.length) {
    const r = rolls[i];

    if (r === 10) {
      // Strike, full frame in one roll
      frame += 1;
      i += 1;
    } else {
      if (i + 1 >= rolls.length) {
        // We have only the first ball of this frame (1–9)
        return {
          isSecondBall: true,
          frameIndex: frame,      // 0-based frame index
          pinsSoFar: rolls[i] || 0
        };
      }
      // We have both balls for this frame, move on
      frame += 1;
      i += 2;
    }
  }

  return { isSecondBall: false };
}

// Determine current frame (1–10) based on the CURRENT bowler
function getCurrentFrameForLane(lane) {
  const players = lane.players || [];
  const idx = lane.currentPlayerIndex || 0;
  const player = players[idx];
  if (!player || !Array.isArray(player.rolls)) return 1;
  const completed = countCompletedFrames9(player.rolls);
  return Math.min(10, completed + 1);
}

/* ---------------------------------------------------------
   PIN BUTTONS
--------------------------------------------------------- */

function renderPinButtons(lane) {
  const container = document.getElementById('pin-buttons');
  container.innerHTML = '';

  const players = lane.players || [];
  const currentIndex = lane.currentPlayerIndex || 0;
  const player = players[currentIndex] || { rolls: [] };
  const rolls = Array.isArray(player.rolls) ? player.rolls : [];

  // Default: allow 0–10 pins
  let maxPins = 10;

  // For frames 1–9, if we are on the 2nd ball of the frame,
  // only allow up to (10 - firstBallPins)
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
   HANDLE ROLL
--------------------------------------------------------- */

function handleRoll(laneId, pins) {
  const lane = getLane(laneId);
  if (!lane.active) {
    alert('Lane is not active');
    return;
  }

  // Snapshot rolls for current player BEFORE this roll
  const playersBefore = lane.players || [];
  const currentIndex = lane.currentPlayerIndex || 0;
  const currentPlayerBefore = playersBefore[currentIndex] || { rolls: [] };
  const rollsBefore = Array.isArray(currentPlayerBefore.rolls)
    ? [...currentPlayerBefore.rolls]
    : [];

  let effectivePins = pins;

  // Simple 9-pin no-tap logic for the FIRST ball of a frame
  if (lane.mode === '9pin') {
    const ctx = getSecondBallContextFrames1to9(rollsBefore);
    const isFirstBallOfFrame = !ctx.isSecondBall; // if not waiting for 2nd, we're at first ball
    if (isFirstBallOfFrame && pins === 9) {
      effectivePins = 10; // treat 9 as strike
    }
  }

  // Add roll to current player
  addRollForCurrentPlayer(laneId, effectivePins);

  // Get state AFTER roll
  const laneAfter = getLane(laneId);
  const playersAfter = laneAfter.players || [];
  const currentPlayerAfter = playersAfter[currentIndex] || { rolls: [] };
  const rollsAfter = Array.isArray(currentPlayerAfter.rolls)
    ? currentPlayerAfter.rolls
    : [];

  // If this roll completed a frame (1–9), rotate to next player
  if (didLastRollCompleteFrame(rollsBefore, rollsAfter)) {
    advanceToNextPlayer(laneId);
  }

  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

/* ---------------------------------------------------------
   SCORING GRID
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

  // Frames 1–9
  if (frameIndex < 9) {
    if (rolls[0] === 10) {
      return ['X', ''];
    }
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

  // 10th frame (up to 3 balls)
  const symbols = rolls.map((r, i) => {
    if (r === 10) return 'X';
    if (i > 0 && (rolls[i - 1] ?? 0) + r === 10) return '/';
    return r === 0 ? '-' : (r ?? '');
  });

  return [symbols[0] ?? '', (symbols[1] ?? '') + (symbols[2] ? ' ' + symbols[2] : '')];
}

function renderScore(laneId) {
  const lane = getLane(laneId);
  const viewMode = getViewMode(laneId);

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';

  const playersSrc = lane.players || [];
  const players = [];

  // Build up to 4 visual rows
  for (let i = 0; i < 4; i++) {
    if (i < playersSrc.length) {
      const src = playersSrc[i];
      const scoring = scoreGame(src.rolls || []);
      const fullFrames = buildFullFrames(scoring.frames);
      players.push({
        name: src.name || `Player ${i + 1}`,
        handicap: src.handicap || 0,
        absent: !!src.absent,
        isCurrent: i === (lane.currentPlayerIndex || 0),
        scoring,
        fullFrames
      });
    } else {
      // Extra slots beyond real team: show as ABSENT and skip in rotation (they're not in lane.players)
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

  // Decide which frames to show (window of 4 in compact mode, 10 in full)
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

  const numFramesVisible = endFrame - startFrame + 1;

  // Header frames from Player 1
  const headerFrames = players[0].fullFrames;
  const visibleFramesHeader = headerFrames.slice(startFrame - 1, endFrame);

  const headerRow = document.createElement('div');
  headerRow.className = 'scoreboard-row scoreboard-header';

  const gameLabel = document.createElement('div');
  gameLabel.className = 'scoreboard-cell label-cell';
  gameLabel.textContent = 'Game 1';
  headerRow.appendChild(gameLabel);

  visibleFramesHeader.forEach(frame => {
    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell frame-number-cell';
    cell.textContent = frame.frame;
    headerRow.appendChild(cell);
  });

  // Extra column header for totals
  const totalHeaderCell = document.createElement('div');
  totalHeaderCell.className = 'scoreboard-cell frame-number-cell';
  totalHeaderCell.textContent = 'TOT';
  headerRow.appendChild(totalHeaderCell);

  scoreboard.appendChild(headerRow);

  // Player rows with per-player totals column
  players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'scoreboard-row player-row';
    if (p.isCurrent) row.classList.add('current');

    const labelCell = document.createElement('div');
    labelCell.className = 'scoreboard-cell label-cell player-label-cell';

    const arrow = p.isCurrent ? '▶ ' : '';
    const absentText = p.absent ? ' (ABS)' : '';

    labelCell.innerHTML = `
      <div class="player-name${p.absent ? ' absent' : ''}">
        ${arrow}${p.name}${absentText}
      </div>
      <div class="player-total">
        HCP ${p.handicap || 0}
      </div>
    `;
    row.appendChild(labelCell);

    const framesToShow = p.fullFrames.slice(startFrame - 1, endFrame);

    framesToShow.forEach((frame) => {
      const cell = document.createElement('div');
      cell.className = 'scoreboard-cell player-frame-cell';

      const [top, bottom] = formatFrameRolls(frame.frame - 1, frame);
      const running = frame.running_total;

      cell.innerHTML = `
        <div class="rolls-top">${top}</div>
        <div class="rolls-bottom">${bottom}</div>
        <div class="frame-running">${running != null ? running : ''}</div>
      `;

      row.appendChild(cell);
    });

    // Per player totals column (right of the frames)
    const scratchTotal = p.scoring.total || 0;
    const hcp = p.handicap || 0;
    const totalWithHcp = scratchTotal + hcp;

    const totalCell = document.createElement('div');
    totalCell.className = 'scoreboard-cell player-frame-cell';
    totalCell.innerHTML = `
      <div class="rolls-top">${totalWithHcp}</div>
      <div class="rolls-bottom">Scr ${scratchTotal}</div>
    `;
    row.appendChild(totalCell);

    scoreboard.appendChild(row);
  });

  // ------------ TEAM ROW ------------
  const teamRow = document.createElement('div');
  teamRow.className = 'scoreboard-row player-row'; // reuse styles

  const teamLabelCell = document.createElement('div');
  teamLabelCell.className = 'scoreboard-cell label-cell player-label-cell';
  teamLabelCell.innerHTML = `
    <div class="player-name">Team</div>
    <div class="player-total">&nbsp;</div>
  `;
  teamRow.appendChild(teamLabelCell);

  // Only count real players (the ones from state, not filler rows)
  const realPlayersForTotals = players.filter((_, idx) => idx < playersSrc.length);

  // Per-frame team running total (sum of each bowler's running_total for that frame)
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
      <div class="rolls-top">${teamRunning || ''}</div>
      <div class="rolls-bottom">&nbsp;</div>
    `;
    teamRow.appendChild(cell);
  }

  // Team totals column (scratch + handicap) in bottom-right
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
    <div class="rolls-top">${teamTotalWithHcp}</div>
    <div class="rolls-bottom">Scr ${teamScratchTotal} Hcp ${teamHcpTotal}</div>
  `;
  teamRow.appendChild(teamTotalCell);

  scoreboard.appendChild(teamRow);

  // Scratch team total (for the big number below the scoreboard)
  document.getElementById('total-score').textContent = teamScratchTotal;

  const toggleBtn = document.getElementById('view-toggle');
  toggleBtn.textContent =
    viewMode === 'full' ? 'Show Last 4 Frames' : 'Show All 10 Frames';
}

/* ---------------------------------------------------------
   LANE INFO HEADER
--------------------------------------------------------- */

function renderLaneInfo(laneId) {
  const lane = getLane(laneId);
  const state = getState();
  const team = lane.teamId ? state.teams[String(lane.teamId)] : null;

  const info = document.getElementById('lane-info');
  document.getElementById('lane-title').textContent = `Lane ${laneId}`;

  const leagueText = lane.league || 'None';
  const modeText = lane.mode === '9pin' ? '9-Pin No-Tap' : 'Standard';
  const teamText =
    team ? `${team.name} (${team.league || 'No league'})` : 'None';

  info.innerHTML = `
    <div class="lane-info-line"><strong>Status:</strong> ${lane.active ? 'Active' : 'Inactive'}</div>
    <div class="lane-info-line"><strong>League:</strong> ${leagueText}</div>
    <div class="lane-info-line"><strong>Mode:</strong> ${modeText}</div>
    <div class="lane-info-line"><strong>Team:</strong> ${teamText}</div>
  `;
}

/* ---------------------------------------------------------
   MENU (ABSENT, SKIP, SCORE CORRECTION)
--------------------------------------------------------- */

function openMenu() {
  document.getElementById('lane-menu-overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('lane-menu-overlay').classList.add('hidden');
}

function handleMarkAbsent(laneId) {
  toggleCurrentPlayerAbsent(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

function handleSkipBowler(laneId) {
  advanceToNextPlayer(laneId);
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

function handleScoreCorrection(laneId) {
  const lane = getLane(laneId);
  const players = lane.players || [];
  if (!players.length) {
    alert('No players on lane');
    return;
  }

  const idx = lane.currentPlayerIndex || 0;
  const player = players[idx];
  const rolls = player.rolls || [];
  if (!rolls.length) {
    alert('This bowler has no rolls yet');
    return;
  }

  const rollNum = prompt(`Enter roll number to change (1–${rolls.length})`);
  if (!rollNum) return;

  const index = Number(rollNum);
  if (isNaN(index) || index < 1 || index > rolls.length) {
    alert('Invalid roll number');
    return;
  }

  const newVal = prompt(`Enter new pin count (0–10)`);
  if (newVal === null) return;

  const pins = Number(newVal);
  if (isNaN(pins) || pins < 0 || pins > 10) {
    alert('Invalid pin count');
    return;
  }

  player.rolls[index - 1] = pins;
  saveState();
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const laneId = getLaneIdFromQuery();
  const lane = getLane(laneId);

  renderLaneInfo(laneId);
  renderScore(laneId);
  renderPinButtons(lane);

  // View toggle
  const toggleBtn = document.getElementById('view-toggle');
  toggleBtn.addEventListener('click', () => {
    const current = getViewMode(laneId);
    const next = current === 'full' ? 'compact' : 'full';
    setViewMode(laneId, next);
    renderScore(laneId);
  });

  // Menu bindings
  document.getElementById('lane-menu-btn').addEventListener('click', openMenu);
  document.getElementById('menu-close-btn').addEventListener('click', closeMenu);
  document.getElementById('menu-close-bottom-btn').addEventListener('click', closeMenu);

  document.getElementById('menu-absent-btn').addEventListener('click', () =>
    handleMarkAbsent(laneId)
  );
  document.getElementById('menu-correct-btn').addEventListener('click', () =>
    handleScoreCorrection(laneId)
  );
  document.getElementById('menu-skip-btn').addEventListener('click', () =>
    handleSkipBowler(laneId)
  );

  // Click outside modal closes it
  document.getElementById('lane-menu-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'lane-menu-overlay') {
      closeMenu();
    }
  });
});
