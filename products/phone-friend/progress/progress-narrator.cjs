'use strict';

/**
 * ProgressNarrator
 * ─────────────────────────────────────────────────
 * User-facing progress language for PHONE FRIEND.
 *
 * Internal codes (ANSWER / IDLE) stay internal.
 * Users see living-friend narration instead.
 */

const PROGRESS_STAGE = Object.freeze({
  UNDERSTANDING: 'UNDERSTANDING',
  PLANNING: 'PLANNING',
  CHECKING_PERMISSION: 'CHECKING_PERMISSION',
  ANALYZING: 'ANALYZING',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  COMPLETE: 'COMPLETE',
  CAUTION: 'CAUTION',
  BLOCKED: 'BLOCKED',
  HANDOFF: 'HANDOFF',
});

const CHARACTER_MOOD = Object.freeze({
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  WORKING: 'WORKING',
  CAUTION: 'CAUTION',
  HAPPY: 'HAPPY',
  SLEEP: 'SLEEP',
});

const STAGE_COPY = Object.freeze({
  [PROGRESS_STAGE.UNDERSTANDING]:
    '무엇을 원하는지 이해하고 있어요.',
  [PROGRESS_STAGE.PLANNING]:
    '어떻게 도와드릴지 정리하고 있어요.',
  [PROGRESS_STAGE.CHECKING_PERMISSION]:
    '필요한 접근 권한을 확인하고 있어요.',
  [PROGRESS_STAGE.ANALYZING]:
    '내용을 비교하고 확인하고 있어요.',
  [PROGRESS_STAGE.WAITING_CONFIRMATION]:
    '여기부터는 확인이 필요해요.',
  [PROGRESS_STAGE.EXECUTING]:
    '확인한 작업을 진행하고 있어요.',
  [PROGRESS_STAGE.VERIFYING]:
    '제대로 반영됐는지 확인하고 있어요.',
  [PROGRESS_STAGE.COMPLETE]: '다 됐어요.',
  [PROGRESS_STAGE.CAUTION]:
    '조심해야 할 부분이 보여요.',
  [PROGRESS_STAGE.BLOCKED]:
    '여기서 멈췄어요. 이유를 알려드릴게요.',
  [PROGRESS_STAGE.HANDOFF]:
    '전문 축으로 연결하고 있어요.',
});

const STAGE_TO_MOOD = Object.freeze({
  [PROGRESS_STAGE.UNDERSTANDING]: CHARACTER_MOOD.THINKING,
  [PROGRESS_STAGE.PLANNING]: CHARACTER_MOOD.THINKING,
  [PROGRESS_STAGE.CHECKING_PERMISSION]: CHARACTER_MOOD.THINKING,
  [PROGRESS_STAGE.ANALYZING]: CHARACTER_MOOD.WORKING,
  [PROGRESS_STAGE.WAITING_CONFIRMATION]: CHARACTER_MOOD.LISTENING,
  [PROGRESS_STAGE.EXECUTING]: CHARACTER_MOOD.WORKING,
  [PROGRESS_STAGE.VERIFYING]: CHARACTER_MOOD.WORKING,
  [PROGRESS_STAGE.COMPLETE]: CHARACTER_MOOD.HAPPY,
  [PROGRESS_STAGE.CAUTION]: CHARACTER_MOOD.CAUTION,
  [PROGRESS_STAGE.BLOCKED]: CHARACTER_MOOD.CAUTION,
  [PROGRESS_STAGE.HANDOFF]: CHARACTER_MOOD.THINKING,
});

const MOOD_LABEL = Object.freeze({
  [CHARACTER_MOOD.LISTENING]: '응, 듣고 있어.',
  [CHARACTER_MOOD.THINKING]: '잠깐만, 확인해볼게.',
  [CHARACTER_MOOD.WORKING]: '지금 살펴보고 있어.',
  [CHARACTER_MOOD.CAUTION]: '이건 조심해야 할 것 같아.',
  [CHARACTER_MOOD.HAPPY]: '다 했어.',
  [CHARACTER_MOOD.SLEEP]: '필요할 때 불러줘.',
});

const MARK = Object.freeze({
  done: 'done',
  active: 'active',
  pending: 'pending',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

class ProgressNarrator {
  narrate(stage, detail, mark) {
    const key = PROGRESS_STAGE[stage]
      ? stage
      : PROGRESS_STAGE.UNDERSTANDING;
    const resolvedMark = MARK[mark] || MARK.active;

    return clone({
      stage: key,
      text: detail || STAGE_COPY[key],
      mark: resolvedMark,
      symbol:
        resolvedMark === 'done'
          ? '✓'
          : resolvedMark === 'active'
            ? '●'
            : '○',
      mood: STAGE_TO_MOOD[key] || CHARACTER_MOOD.LISTENING,
      authority_granted: false,
    });
  }

  buildSteps(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => {
      if (typeof item === 'string') return this.narrate(item);
      return this.narrate(item.stage, item.text, item.mark);
    });
  }

  moodFromSteps(steps) {
    if (!Array.isArray(steps) || !steps.length) {
      return CHARACTER_MOOD.LISTENING;
    }
    const active = [...steps].reverse().find((s) => s.mark === 'active');
    if (active) return active.mood;
    return steps[steps.length - 1].mood || CHARACTER_MOOD.LISTENING;
  }

  moodLabel(mood) {
    return MOOD_LABEL[mood] || MOOD_LABEL[CHARACTER_MOOD.LISTENING];
  }

  /**
   * Map capability/runtime outcomes into progress steps.
   */
  fromRuntimeStatus(status, detail) {
    const map = {
      WAITING_CONFIRMATION: PROGRESS_STAGE.WAITING_CONFIRMATION,
      CONFIRM: PROGRESS_STAGE.WAITING_CONFIRMATION,
      HOLD: PROGRESS_STAGE.BLOCKED,
      DENY: PROGRESS_STAGE.BLOCKED,
      WARN: PROGRESS_STAGE.CAUTION,
      HANDOFF: PROGRESS_STAGE.HANDOFF,
      COMPLETE: PROGRESS_STAGE.COMPLETE,
      EXECUTED: PROGRESS_STAGE.COMPLETE,
      CHAT: PROGRESS_STAGE.COMPLETE,
      ANSWER: PROGRESS_STAGE.COMPLETE,
      CLARIFY: PROGRESS_STAGE.WAITING_CONFIRMATION,
      BLOCKED_BY_SAFETY: PROGRESS_STAGE.CAUTION,
    };
    const stage = map[status] || PROGRESS_STAGE.UNDERSTANDING;
    return this.narrate(
      stage,
      detail,
      stage === PROGRESS_STAGE.COMPLETE ||
        stage === PROGRESS_STAGE.BLOCKED
        ? 'done'
        : 'active'
    );
  }
}

module.exports = {
  ProgressNarrator,
  PROGRESS_STAGE,
  CHARACTER_MOOD,
  STAGE_COPY,
  STAGE_TO_MOOD,
  MOOD_LABEL,
  MARK,
};
