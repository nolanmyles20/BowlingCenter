// js/lane.js
import {
  getLane,
  getState,
  saveState,
  addRollForCurrentPlayer,
  toggleCurrentPlayerAbsent,
  advanceToNextPlayer,
  updateLane
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

function didLastRollCompleteFrame(rollsBefore, rollsAfter) {
  const beforeFrames = countCompletedFrames9(rollsBefore);
  const afterFrames = countCompletedFrames9(rollsAfter);
  return afterFrames > beforeFrames;
}

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
   PIN BUTTONS
--------------------------------------------------------- */

function renderPinButtons(lane) {
  const container = document.getElementById('pin-buttons');
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
   HANDLE ROLL
--------------------------------------------------------- */

function handleRoll(laneId, pins) {
  const lane = getLane(laneId);
  if (!lane.active) {
    alert('Lane is not active');
    return;
  }

  const playersBefore = lane.players || [];
  const currentIndex = lane.currentPlayerIndex || 0;
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));
  const currentPlayerBefore = playersBefore[currentIndex] || { games: [{ rolls: [] }] };
  const gameBefore = currentPlayerBefore.games?.[gIndex] || { rolls: [] };
  const rollsBefore = Array.isArray(gameBefore.rolls) ? [...gameBefore.rolls] : [];

  let effectivePins = pins;

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

  return [symbols[0] ?? '', (symbols[1] ?? '') + (symbols[2] ? ' ' + symbols[2] : '')];
}

function renderScore(laneId) {
  const lane = getLane(laneId);
  const viewMode = getViewMode(laneId);
  const gIndex = Math.max(0, Math.min(2, (lane.currentGame || 1) - 1));

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';

  const playersSrc = lane.players || [];
  const players = [];

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
        isCurrent: i === (lane.currentPlayerIndex || 0),
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

  // TEAM ROW (current game)
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
      <div class="rolls-top">${teamRunning || ''}</div>
      <div class="rolls-bottom">&nbsp;</div>
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
    <div class="rolls-top">${teamTotalWithHcp}</div>
    <div class="rolls-bottom">Scr ${teamScratchTotal} Hcp ${teamHcpTotal}</div>
  `;
  teamRow.appendChild(teamTotalCell);

  scoreboard.appendChild(teamRow);

  document.getElementById('total-score').textContent = teamScratchTotal;

  const toggleBtn = document.getElementById('view-toggle');
  toggleBtn.textContent =
    viewMode === 'full' ? 'Show Last 4 Frames' : 'Show All 10 Frames';

  renderSeriesRecap(laneId);
}

/* ---------------------------------------------------------
   SERIES RECAP (3 GAMES)
--------------------------------------------------------- */

function renderSeriesRecap(laneId) {
  const lane = getLane(laneId);
  const playersSrc = lane.players || [];
  const recap = document.getElementById('series-recap');
  if (!recap) return;

  let html = `
    <h3>Series Recap (3 Games)</h3>
    <table class="recap-table">
      <thead>
        <tr>
          <th>Bowler</th>
          <th>G1 Scr</th><th>G1+H</th>
          <th>G2 Scr</th><th>G2+H</th>
          <th>G3 Scr</th><th>G3+H</th>
          <th>Series Scr</th><th>Series+H</th>
        </tr>
      </thead>
      <tbody>
  `;

  const teamTotals = {
    gScr: [0, 0, 0],
    gHcp: [0, 0, 0],
    seriesScr: 0,
    seriesHcp: 0
  };

  playersSrc.forEach(src => {
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

    teamTotals.gScr[0] += gScr[0];
    teamTotals.gScr[1] += gScr[1];
    teamTotals.gScr[2] += gScr[2];
    teamTotals.gHcp[0] += hcp;
    teamTotals.gHcp[1] += hcp;
    teamTotals.gHcp[2] += hcp;
    teamTotals.seriesScr += seriesScr;
    teamTotals.seriesHcp += hcp * 3;

    html += `
      <tr>
        <td>${name}</td>
        <td>${gScr[0]}</td><td>${gWithH[0]}</td>
        <td>${gScr[1]}</td><td>${gWithH[1]}</td>
        <td>${gScr[2]}</td><td>${gWithH[2]}</td>
        <td>${seriesScr}</td><td>${seriesWithH}</td>
      </tr>
    `;
  });

  const teamSeriesWithH = teamTotals.seriesScr + teamTotals.seriesHcp;

  html += `
      </tbody>
      <tfoot>
        <tr>
          <th>Team Totals</th>
          <th>${teamTotals.gScr[0]}</th><th>${teamTotals.gScr[0] + teamTotals.gHcp[0]}</th>
          <th>${teamTotals.gScr[1]}</th><th>${teamTotals.gScr[1] + teamTotals.gHcp[1]}</th>
          <th>${teamTotals.gScr[2]}</th><th>${teamTotals.gScr[2] + teamTotals.gHcp[2]}</th>
          <th>${teamTotals.seriesScr}</th><th>${teamSeriesWithH}</th>
        </tr>
      </tfoot>
    </table>
  `;

  recap.innerHTML = html;
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

  game.rolls[index - 1] = pins;
  saveState();
  renderScore(laneId);
  renderPinButtons(getLane(laneId));
}

/* ---------------------------------------------------------
   GAME SWITCHER
--------------------------------------------------------- */

function setGame(laneId, gameNum) {
  updateLane(laneId, { currentGame: gameNum });
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
   INIT
--------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const laneId = getLaneIdFromQuery();
  const lane = getLane(laneId);

  renderLaneInfo(laneId);
  renderScore(laneId);
  renderPinButtons(lane);

  const toggleBtn = document.getElementById('view-toggle');
  toggleBtn.addEventListener('click', () => {
    const current = getViewMode(laneId);
    const next = current === 'full' ? 'compact' : 'full';
    setViewMode(laneId, next);
    renderScore(laneId);
  });

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

  document.getElementById('lane-menu-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'lane-menu-overlay') {
      closeMenu();
    }
  });

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
