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

// Path to your JSON config:
// Example file: public/config/popup_images.json
// {
//   "strike": [
//     "images/strike/strike1.png",
//     "images/strike/strike2.png",
//     "BowlingCenter/images/IMG_5219.gif"
//   ],
//   "spare": [
//     "images/spare/spare1.png"
//   ],
//   "gutter": [
//     "images/gutter/gutter1.png"
//   ]
// }
const POPUP_IMAGES_CONFIG_URL = 'config/popup_images.json';

let popupImagesConfig = {
  strike: [],
  spare: [],
  gutter: ["images/gutter/IMG_5219.gif"]
};

let bowlingPopupTimeout = null;

/**
 * Load popup images config from JSON.
 * Call once on app startup (we also fire it automatically below).
 */
export async function loadPopupImagesConfig() {
  try {
    const res = await fetch(POPUP_IMAGES_CONFIG_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    popupImagesConfig = {
      strike: Array.isArray(data.strike) ? data.strike : [],
      spare: Array.isArray(data.spare) ? data.spare : [],
      gutter: Array.isArray(data.gutter) ? data.gutter : []
    };

    console.log('Popup images config loaded', popupImagesConfig);
  } catch (err) {
    console.error('Failed to load popup image config:', err);
  }
}

// Fire-and-forget auto-load (optional; you can also call it explicitly elsewhere)
void loadPopupImagesConfig();

/**
 * Low-level popup function. Shows a random image for the given type:
 * type = 'strike' | 'spare' | 'gutter'
 */
export function showBowlingPopup(type) {
  const pool = popupImagesConfig[type];

  if (!Array.isArray(pool) || pool.length === 0) {
    return; // nothing configured for this type
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const imgSrc = pool[randomIndex];

  const popup = document.getElementById('bowling-popup');
  const img = document.getElementById('bowling-popup-img');
  if (!popup || !img) return;

  img.src = imgSrc;

  // Show popup
  popup.classList.remove('hidden');

  // Clear any previous timer
  if (bowlingPopupTimeout) {
    clearTimeout(bowlingPopupTimeout);
  }

  // Hide after 3 seconds
  bowlingPopupTimeout = setTimeout(() => {
    popup.classList.add('hidden');
  }, 3000);
}

// ================== EVENT DETECTION FOR LATEST ROLL ==================

/**
 * Detects what event (strike/spare/gutter) the **latest roll** produced.
 * Rolls = full rolls array for the bowler AFTER pushing the newest roll.
 * Returns: 'strike' | 'spare' | 'gutter' | null
 */
export function detectPopupEventForRoll(rolls, maxFrames = 10) {
  if (!Array.isArray(rolls) || rolls.length === 0) return null;

  const lastRollIndex = rolls.length - 1;
  const lastPins = rolls[lastRollIndex];

  // Build frame metadata (which roll indices belong to which frame)
  const frameMeta = [];
  let rollIndex = 0;

  for (let frameNum = 1; frameNum <= maxFrames; frameNum++) {
    if (rollIndex >= rolls.length) break;

    if (frameNum < maxFrames) {
      if (rolls[rollIndex] === 10) {
        // Strike frame (single roll)
        frameMeta.push({
          frame: frameNum,
          rollIndices: [rollIndex]
        });
        rollIndex += 1;
      } else {
        const firstIdx = rollIndex;
        const secondIdx = rollIndex + 1;
        const first = rolls[firstIdx];
        const second = rolls[secondIdx] ?? 0;

        frameMeta.push({
          frame: frameNum,
          rollIndices: [firstIdx, secondIdx]
        });

        rollIndex += 2;
      }
    } else {
      // 10th frame can have up to 3 rolls
      const firstIdx = rollIndex;
      const secondIdx = rollIndex + 1;
      const thirdIdx = rollIndex + 2;

      const usedIndices = [firstIdx];
      if (secondIdx < rolls.length) usedIndices.push(secondIdx);
      if (thirdIdx < rolls.length) usedIndices.push(thirdIdx);

      frameMeta.push({
        frame: frameNum,
        rollIndices: usedIndices
      });
      break;
    }
  }

  // Find which frame the latest roll belongs to
  const frame = frameMeta.find(f => f.rollIndices.includes(lastRollIndex));
  if (!frame) {
    // no frame found, just check for gutter
    return lastPins === 0 ? 'gutter' : null;
  }

  const indices = frame.rollIndices;
  const frameNum = frame.frame;

  // STRIKE
  // In frames 1-9: first roll of the frame is 10 and it's the latest roll
  if (frameNum < maxFrames) {
    const firstIdx = indices[0];
    const firstPins = rolls[firstIdx];
    if (lastRollIndex === firstIdx && firstPins === 10) {
      return 'strike';
    }

    // SPARE: second roll of the frame completes 10
    if (indices.length >= 2) {
      const secondIdx = indices[1];
      const secondPins = rolls[secondIdx] ?? 0;
      const sumFirstTwo = (rolls[firstIdx] ?? 0) + secondPins;
      if (lastRollIndex === secondIdx && sumFirstTwo === 10) {
        return 'spare';
      }
    }
  } else {
    // 10th frame:
    const firstIdx = indices[0];
    const secondIdx = indices[1];
    const thirdIdx = indices[2];

    const firstPins = rolls[firstIdx] ?? 0;
    const secondPins = secondIdx !== undefined ? (rolls[secondIdx] ?? 0) : 0;

    // Strike if latest roll is the **first roll** in 10th and it's 10
    if (lastRollIndex === firstIdx && firstPins === 10) {
      return 'strike';
    }

    // Spare if latest roll is the **second roll** in 10th and first+second = 10
    if (secondIdx !== undefined && lastRollIndex === secondIdx && firstPins + secondPins === 10) {
      return 'spare';
    }

    // We can optionally treat a 0 in 10th as gutter too
    if (lastPins === 0) {
      return 'gutter';
    }
  }

  // GUTTER (any frame) – any single roll of 0 pins
  if (lastPins === 0) {
    return 'gutter';
  }

  return null;
}

// ================== MAIN HELPER (RESPECTS ABSENT FLAG) ==================

/**
 * Call this right after you push a new roll into the bowler's rolls array.
 *
 * @param {number[]} rolls - full rolls array for this bowler (after latest roll)
 * @param {object} bowler - bowler object from your state (must contain .absent)
 * @param {number} [maxFrames=10]
 */
export function maybeShowBowlingPopupForBowler(rolls, bowler, maxFrames = 10) {
  // Only active bowlers (not absent)
  if (!bowler || bowler.absent) return;

  const eventType = detectPopupEventForRoll(rolls, maxFrames);
  if (!eventType) return;

  showBowlingPopup(eventType);
}
