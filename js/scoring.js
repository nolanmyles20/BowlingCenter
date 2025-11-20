// js/scoring.js

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
