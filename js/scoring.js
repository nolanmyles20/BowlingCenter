// js/scoring.js

// ================== SCORING ==================

export function scoreGame(rolls, maxFrames = 10) {
  const frames = [];
  let rollIndex = 0;
  let runningTotal = 0;

  for (let frameNum = 1; frameNum <= maxFrames; frameNum++) {
    if (rollIndex >= rolls.length) break;

    if (frameNum < maxFrames) {
      // Strike
      if (rolls[rollIndex] === 10) {
        const bonus1 = rolls[rollIndex + 1] ?? 0;
        const bonus2 = rolls[rollIndex + 2] ?? 0;
        const frameScore = 10 + bonus1 + bonus2;
        runningTotal += frameScore;

        frames.push({
          frame: frameNum,
          rolls: [10],
          frame_score: frameScore,
          running_total: runningTotal
        });

        rollIndex += 1;
      } else {
        const first = rolls[rollIndex];
        const second = rolls[rollIndex + 1] ?? 0;
        const framePins = first + second;
        let frameScore;

        if (framePins === 10) {
          const bonus = rolls[rollIndex + 2] ?? 0;
          frameScore = 10 + bonus;
        } else {
          frameScore = framePins;
        }

        runningTotal += frameScore;
        frames.push({
          frame: frameNum,
          rolls: [first, second],
          frame_score: frameScore,
          running_total: runningTotal
        });

        rollIndex += 2;
      }
    } else {
      // 10th frame
      const first = rolls[rollIndex] ?? 0;
      const second = rolls[rollIndex + 1];
      const third = rolls[rollIndex + 2];

      const used = [first];
      if (second !== undefined) used.push(second);
      if (third !== undefined) used.push(third);

      const frameScore = used.reduce((sum, r) => sum + (r ?? 0), 0);
      runningTotal += frameScore;

      frames.push({
        frame: frameNum,
        rolls: used,
        frame_score: frameScore,
        running_total: runningTotal
      });

      break;
    }
  }

  return { frames, total: runningTotal };
}

// ================== POPUP CONFIG (JSON-DRIVEN) ==================

const POPUP_IMAGES_CONFIG_URL = 'config/popup_images.json';

let popupImagesConfig = {
  strike: [],
  spare: [],
  gutter: [],
  perfect: [],
  turkey: []
};

let bowlingPopupTimeout = null;
let bowlingPopupSequence = 0;

export async function loadPopupImagesConfig() {
  try {
    const res = await fetch(POPUP_IMAGES_CONFIG_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    popupImagesConfig = {
      strike: Array.isArray(data.strike) ? data.strike : [],
      spare: Array.isArray(data.spare) ? data.spare : [],
      gutter: Array.isArray(data.gutter) ? data.gutter : [],
      perfect: Array.isArray(data.perfect) ? data.perfect : [],
      turkey: Array.isArray(data.turkey) ? data.turkey : []
    };

    console.log('Popup images config loaded', popupImagesConfig);
  } catch (err) {
    console.error('Failed to load popup image config:', err);
  }
}

void loadPopupImagesConfig();

export function showBowlingPopup(type) {
  const popup = document.getElementById('bowling-popup');
  const img = document.getElementById('bowling-popup-img');
  const label = document.getElementById('bowling-popup-label');

  if (!popup || !img) {
    console.warn('Popup elements not found in DOM');
    return;
  }

  const pool = popupImagesConfig[type];
  if (!Array.isArray(pool) || pool.length === 0) {
    console.warn('No popup images configured for type:', type);
    return;
  }

  if (label) {
    if (type === 'perfect') {
      label.textContent = 'PERFECT GAME';
    } else if (type === 'turkey') {
      label.textContent = 'TURKEY';
    } else {
      label.textContent = (type || '').toUpperCase();
    }
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const imgSrc = pool[randomIndex];

  bowlingPopupSequence += 1;
  const thisSeq = bowlingPopupSequence;

  if (bowlingPopupTimeout) {
    clearTimeout(bowlingPopupTimeout);
    bowlingPopupTimeout = null;
  }

  popup.classList.add('hidden');

  img.onload = () => {
    if (thisSeq !== bowlingPopupSequence) return;

    popup.classList.remove('hidden');

    bowlingPopupTimeout = setTimeout(() => {
      popup.classList.add('hidden');
    }, 3000);
  };

  img.onerror = () => {
    if (thisSeq !== bowlingPopupSequence) return;
    console.warn('Failed to load popup image:', imgSrc);
    popup.classList.add('hidden');
  };

  img.src = '';
  img.src = imgSrc;
}

// ================== EVENT DETECTION ==================

export function detectPopupEventForRoll(rolls, maxFrames = 10) {
  if (!Array.isArray(rolls) || rolls.length === 0) return null;

  const lastRollIndex = rolls.length - 1;

  const frameMeta = [];
  let rollIndex = 0;

  for (let frameNum = 1; frameNum <= maxFrames; frameNum++) {
    if (rollIndex >= rolls.length) break;

    if (frameNum < maxFrames) {
      if (rolls[rollIndex] === 10) {
        frameMeta.push({
          frame: frameNum,
          rollIndices: [rollIndex]
        });
        rollIndex += 1;
      } else {
        const firstIdx = rollIndex;
        const secondIdx = rollIndex + 1;

        frameMeta.push({
          frame: frameNum,
          rollIndices: [firstIdx, secondIdx]
        });

        rollIndex += 2;
      }
    } else {
      const firstIdx = rollIndex;
      const secondIdx = rollIndex + 1;
      const thirdIdx = rollIndex + 2;

      const used = [firstIdx];
      if (secondIdx < rolls.length) used.push(secondIdx);
      if (thirdIdx < rolls.length) used.push(thirdIdx);

      frameMeta.push({
        frame: frameNum,
        rollIndices: used
      });
      break;
    }
  }

  const frame = frameMeta.find(f => f.rollIndices.includes(lastRollIndex));
  if (!frame) return null;

  const indices = frame.rollIndices;
  const frameNum = frame.frame;

  if (frameNum < maxFrames) {
    const firstIdx = indices[0];
    const firstPins = rolls[firstIdx] ?? 0;
    const secondIdx = indices[1];
    const secondPins = secondIdx !== undefined ? (rolls[secondIdx] ?? 0) : 0;

    if (lastRollIndex === firstIdx && firstPins === 10) return 'strike';

    if (
      secondIdx !== undefined &&
      lastRollIndex === secondIdx &&
      firstPins + secondPins === 10
    ) {
      return 'spare';
    }

    if (lastRollIndex === firstIdx && firstPins === 0) return 'gutter';

    if (
      secondIdx !== undefined &&
      lastRollIndex === secondIdx &&
      firstPins === 0 &&
      secondPins === 0
    ) {
      return 'gutter';
    }
  } else {
    const firstIdx = indices[0];
    const secondIdx = indices[1];

    const firstPins = rolls[firstIdx] ?? 0;
    const secondPins = secondIdx !== undefined ? (rolls[secondIdx] ?? 0) : 0;

    if (lastRollIndex === firstIdx && firstPins === 10) return 'strike';

    if (
      secondIdx !== undefined &&
      lastRollIndex === secondIdx &&
      firstPins + secondPins === 10
    ) {
      return 'spare';
    }

    if (lastRollIndex === firstIdx && firstPins === 0) return 'gutter';

    if (
      secondIdx !== undefined &&
      lastRollIndex === secondIdx &&
      firstPins === 0 &&
      secondPins === 0
    ) {
      return 'gutter';
    }
  }

  return null;
}

// ================== MAIN POPUP HELPER ==================

export function maybeShowBowlingPopupForBowler(rolls, bowler, maxFrames = 10) {
  if (!bowler || bowler.absent) return;

  const scoring = scoreGame(rolls, maxFrames);
  if (scoring.total === 300) {
    showBowlingPopup('perfect');
    return;
  }

  if (rolls.length >= 3) {
    const r1 = rolls[rolls.length - 1];
    const r2 = rolls[rolls.length - 2];
    const r3 = rolls[rolls.length - 3];

    if (r1 === 10 && r2 === 10 && r3 === 10) {
      showBowlingPopup('turkey');
      return;
    }
  }

  const eventType = detectPopupEventForRoll(rolls, maxFrames);
  if (!eventType) return;

  showBowlingPopup(eventType);
}

// =========================================================
// =============  ABS BOWLER SCORING FIX  ==================
// =========================================================

/**
 * Compute the displayed total for a bowler.
 * - If bowler.absent => ALWAYS returns **210**
 * - Otherwise        => game total + handicap
 */
export function computeDisplayedTotal(rolls, bowler, maxFrames = 10) {
  if (bowler && bowler.absent) {
    return 210;
  }

  const { total } = scoreGame(rolls, maxFrames);
  const hcp = bowler && Number.isFinite(bowler.hcp) ? bowler.hcp : 0;

  return total + hcp;
}
