// js/lane.js
import { getLane, updateLane, getState } from './state.js';
import { scoreGame } from './scoring.js';

function getLaneIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('lane') || '1');
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

function renderScore(laneId) {
  const lane = getLane(laneId);
  const scoring = scoreGame(lane.rolls);

  const framesDiv = document.getElementById('frames');
  framesDiv.innerHTML = '';

  scoring.frames.forEach(frame => {
    const el = document.createElement('div');
    el.className = 'frame';
    el.innerHTML = `
      <div class="frame-number">Frame ${frame.frame}</div>
      <div class="frame-rolls">${frame.rolls.join(', ')}</div>
      <div class="frame-score">Frame: ${frame.frame_score}</div>
      <div class="frame-total">Total: ${frame.running_total}</div>
    `;
    framesDiv.appendChild(el);
  });

  document.getElementById('total-score').textContent = scoring.total;
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
    <p>Status: <strong>${lane.active ? 'Active' : 'Inactive'}</strong></p>
    <p>League: ${leagueText}</p>
    <p>Mode: ${modeText}</p>
    <p>Team: ${teamText}</p>
  `;
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
});
