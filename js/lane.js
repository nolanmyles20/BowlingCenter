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
   PIN BUTTONS
--------------------------------------------------------- */

function renderPinButtons(lane) {
  const container = document.getElementById('pin-buttons');
  container.innerHTML = '';
  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'btn-pin';
    btn.textContent = i;
    btn.onclick = () => handleRoll(lane.id, i);
    container.appendChild(btn);
  }
}

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
      // need two balls for a full frame
      if (i + 1 >= rolls.length) break; // incomplete frame waiting for 2nd ball
      frame += 1;
      i += 2;
    }
  }
  return frame;
}

function didLastRollCompleteFrame(rollsBefore, rollsAfter) {
  const beforeFrames = countCompletedFrames9(rollsBefore);
  const afterFrames = countCompletedFrames9(rollsAfter);
  return afterFrames > beforeFrames;
}

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

  // Simple 9-pin no-tap logic
  if (lane.mode === '9pin') {
    const ballsSoFar = rollsBefore.length;
    const frameRollCount = ballsSoFar % 2;
    if (frameRollCount === 0 && pins === 9) {
      effectivePins = 10;
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
      // Extra slots beyond real team: show as ABSENT and skip in rotation (they're not in state)
      const scoring = scoreGame([]);
      const fullFrames = buildFullFrames([]);
      players.push({
        name: `Player ${i + 1}`,
        handicap: 0,
        absent: true,       // visually marked absent
        isCurrent: false,   // never current (not in lane.players)
        scoring,
        fullFrames
      });
    }
  }

  // Header frames from Player 1
  const headerFrames = players[0].fullFrames;
  const visibleFramesHeader =
    viewMode === 'compact' ? headerFrames.slice(6) : headerFrames;

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

  scoreboard.appendChild(headerRow);

  // Player rows
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
        ${p.scoring.total || 0}${p.handicap ? ' +H' + p.handicap : ''}
      </div>
    `;
    row.appendChild(labelCell);

    let framesToShow =
      viewMode === 'compact' ? p.fullFrames.slice(6) : p.fullFrames;

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

    scoreboard.appendChild(row);
  });

  // Scratch team total = sum of non-absent players' totals
  const teamTotal = players
    .filter(p => !p.absent)
    .reduce((sum, p) => sum + (p.scoring.total || 0), 0);

  document.getElementById('total-score').textContent = teamTotal;

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
}

function handleSkipBowler(laneId) {
  advanceToNextPlayer(laneId);
  renderScore(laneId);
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
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const laneId = getLaneIdFromQuery();
  const lane = getLane(laneId);

  renderLaneInfo(laneId);
  renderPinButtons(lane);
  renderScore(laneId);

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
