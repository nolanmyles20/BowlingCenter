// js/lane.js
import { getLane, updateLane, getState } from './state.js';
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

function handleRoll(laneId, pins) {
  const lane = getLane(laneId);
  if (!lane.active) {
    alert('Lane is not active');
    return;
  }

  let effectivePins = pins;

  // Simple 9-pin no-tap: if first ball of frame and 9, treat as strike 10
  if (lane.mode === '9pin') {
    const ballsSoFar = lane.rolls.length;
    const frameRollCount = ballsSoFar % 2;
    if (frameRollCount === 0 && pins === 9) {
      effectivePins = 10;
    }
  }

  const newRolls = lane.rolls.concat(effectivePins);
  updateLane(laneId, { rolls: newRolls });

  renderScore(laneId);
}

function formatFrameRolls(frameIndex, frame, totalFrames) {
  const rolls = frame.rolls;

  // Frames 1–9
  if (frameIndex < 9) {
    if (rolls[0] === 10) {
      return ['X', ''];
    }
    const first = rolls[0] ?? '';
    const second = rolls[1] ?? '';

    if (first + second === 10 && second !== '') {
      return [first, '/'];
    }
    return [first === 0 ? '-' : first, second === 0 ? '-' : second];
  }

  // 10th frame – up to 3 rolls
  const symbols = rolls.map((r, i) => {
    if (r === 10) return 'X';
    if (i > 0 && (rolls[i - 1] ?? 0) + r === 10) return '/';
    return r === 0 ? '-' : r;
  });

  return [symbols[0] ?? '', symbols.slice(1).join(' ') || ''];
}

function renderScore(laneId) {
  const lane = getLane(laneId);
  const scoring = scoreGame(lane.rolls);
  const viewMode = getViewMode(laneId);

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';

  const frames = scoring.frames;
  const totalFrames = frames.length;

  // Decide which frames to show
  let visibleFrames = frames;
  if (viewMode === 'compact' && totalFrames > 4) {
    visibleFrames = frames.slice(totalFrames - 4);
  }

  // Header row (frame numbers)
  const headerRow = document.createElement('div');
  headerRow.className = 'scoreboard-row scoreboard-header';

  const blankHead = document.createElement('div');
  blankHead.className = 'scoreboard-cell label-cell';
  blankHead.textContent = 'Game 1';
  headerRow.appendChild(blankHead);

  visibleFrames.forEach(frame => {
    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell frame-number-cell';
    cell.textContent = frame.frame;
    headerRow.appendChild(cell);
  });

  scoreboard.appendChild(headerRow);

  // Rolls row
  const rollsRow = document.createElement('div');
  rollsRow.className = 'scoreboard-row rolls-row';

  const rollsLabel = document.createElement('div');
  rollsLabel.className = 'scoreboard-cell label-cell small-label';
  rollsLabel.textContent = 'Rolls';
  rollsRow.appendChild(rollsLabel);

  visibleFrames.forEach((frame) => {
    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell frame-rolls-cell';

    const [top, bottom] = formatFrameRolls(frame.frame - 1, frame, totalFrames);

    cell.innerHTML = `
      <div class="rolls-top">${top}</div>
      <div class="rolls-bottom">${bottom}</div>
    `;
    rollsRow.appendChild(cell);
  });

  scoreboard.appendChild(rollsRow);

  // Frame totals row
  const totalsRow = document.createElement('div');
  totalsRow.className = 'scoreboard-row totals-row';

  const totalsLabel = document.createElement('div');
  totalsLabel.className = 'scoreboard-cell label-cell small-label';
  totalsLabel.textContent = 'Total';
  totalsRow.appendChild(totalsLabel);

  visibleFrames.forEach(frame => {
    const cell = document.createElement('div');
    cell.className = 'scoreboard-cell frame-total-cell';
    cell.textContent = frame.running_total;
    totalsRow.appendChild(cell);
  });

  scoreboard.appendChild(totalsRow);

  // Game total
  document.getElementById('total-score').textContent = scoring.total;

  // Update toggle button text
  const toggleBtn = document.getElementById('view-toggle');
  if (viewMode === 'full') {
    toggleBtn.textContent = 'Show Last 4 Frames';
  } else {
    toggleBtn.textContent = 'Show All 10 Frames';
  }
}

function renderLaneInfo(laneId) {
  const lane = getLane(laneId);
  const state = getState();
  const team = lane.teamId ? state.teams[String(lane.teamId)] : null;

  const info = document.getElementById('lane-info');
  document.getElementById('lane-title').textContent = `Lane ${laneId}`;

  const leagueText = lane.league || 'None';
  const modeText = lane.mode === '9pin' ? '9-Pin No-Tap' : 'Standard';
  const teamText = team ? `${team.name} (${team.league || 'No league'})` : 'None';

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

/* -------- Lane Menu Logic (popup) -------- */

function openMenu() {
  document.getElementById('lane-menu-overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('lane-menu-overlay').classList.add('hidden');
}

// Very simple placeholder behaviors for now:

function handleMarkAbsent() {
  alert('Mark Bowler Absent – placeholder (we will hook into bowlers/teams next).');
}

function handleSkipBowler() {
  alert('Skip Bowler / Next Bowler – placeholder (per-bowler turn tracking comes next).');
}

function handleScoreCorrection(laneId) {
  const lane = getLane(laneId);
  if (!lane.rolls.length) {
    alert('No rolls yet for this lane.');
    return;
  }

  const totalRolls = lane.rolls.length;
  const idxStr = prompt(`Score Correction:\nEnter roll number to change (1–${totalRolls})`);
  if (!idxStr) return;
  const idx = Number(idxStr);
  if (!Number.isInteger(idx) || idx < 1 || idx > totalRolls) {
    alert('Invalid roll number.');
    return;
  }

  const currentValue = lane.rolls[idx - 1];
  const newStr = prompt(`Current value is ${currentValue}. Enter new pin count (0–10):`);
  if (newStr === null) return;
  const newVal = Number(newStr);
  if (!Number.isInteger(newVal) || newVal < 0 || newVal > 10) {
    alert('Invalid pin count.');
    return;
  }

  const newRolls = [...lane.rolls];
  newRolls[idx - 1] = newVal;
  updateLane(laneId, { rolls: newRolls });
  renderScore(laneId);
}

document.addEventListener('DOMContentLoaded', () => {
  const laneId = getLaneIdFromQuery();
  const lane = getLane(laneId);
  if (!lane) {
    alert('Invalid lane');
    return;
  }

  renderLaneInfo(laneId);
  renderPinButtons(lane);
  renderScore(laneId);

  // Frame view toggle
  const toggleBtn = document.getElementById('view-toggle');
  toggleBtn.addEventListener('click', () => {
    const current = getViewMode(laneId);
    const next = current === 'full' ? 'compact' : 'full';
    setViewMode(laneId, next);
    renderScore(laneId);
  });

  // Menu button + modal
  const menuBtn = document.getElementById('lane-menu-btn');
  const menuOverlay = document.getElementById('lane-menu-overlay');
  const menuCloseTop = document.getElementById('menu-close-btn');
  const menuCloseBottom = document.getElementById('menu-close-bottom-btn');
  const absentBtn = document.getElementById('menu-absent-btn');
  const correctBtn = document.getElementById('menu-correct-btn');
  const skipBtn = document.getElementById('menu-skip-btn');

  menuBtn.addEventListener('click', openMenu);
  menuCloseTop.addEventListener('click', closeMenu);
  menuCloseBottom.addEventListener('click', closeMenu);

  // Click outside window closes menu
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) {
      closeMenu();
    }
  });

  absentBtn.addEventListener('click', () => {
    handleMarkAbsent();
    // keep menu open for now
  });

  correctBtn.addEventListener('click', () => {
    handleScoreCorrection(laneId);
  });

  skipBtn.addEventListener('click', () => {
    handleSkipBowler();
  });
});
