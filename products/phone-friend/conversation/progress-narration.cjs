'use strict';

/**
 * @deprecated Use products/phone-friend/progress/progress-narrator.cjs
 * Compatibility shim — do not add new logic here.
 */

const narrator = require('../progress/progress-narrator.cjs');

function narrate(stage, detail) {
  return new narrator.ProgressNarrator().narrate(stage, detail);
}

function moodLabel(mood) {
  return new narrator.ProgressNarrator().moodLabel(mood);
}

function buildProgress(stages) {
  return new narrator.ProgressNarrator().buildSteps(stages);
}

module.exports = {
  PROGRESS_STAGE: narrator.PROGRESS_STAGE,
  CHARACTER_MOOD: narrator.CHARACTER_MOOD,
  STAGE_COPY: narrator.STAGE_COPY,
  STAGE_TO_MOOD: narrator.STAGE_TO_MOOD,
  MOOD_LABEL: narrator.MOOD_LABEL,
  narrate,
  moodLabel,
  buildProgress,
};
