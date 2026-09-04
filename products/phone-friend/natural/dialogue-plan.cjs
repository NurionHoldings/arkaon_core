'use strict';

/**
 * DialoguePlan
 * ─────────────────────────────────────────────────
 * Structured understanding of what the user wants.
 *
 * Dialogue plan ≠ Consent
 * Dialogue plan ≠ Authority
 * "사용자가 원하는 것 같다" ≠ Decision / Gate
 */

const PLAN_STATUS = Object.freeze({
  CLARIFY: 'CLARIFY',
  PLANNED: 'PLANNED',
  WAITING_PERMISSION: 'WAITING_PERMISSION',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  READY_FOR_CAPABILITY: 'READY_FOR_CAPABILITY',
  CANCELLED: 'CANCELLED',
  ANSWERED: 'ANSWERED',
});

const RISK_BOUNDARY = Object.freeze({
  NONE: 'NONE',
  READ: 'READ',
  ANALYZE: 'ANALYZE',
  WRITE: 'WRITE',
  SHARE: 'SHARE',
  TRANSFER: 'TRANSFER',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} partial
 * @returns {object} dialogue plan (never grants authority)
 */
function createDialoguePlan(partial = {}) {
  return clone({
    goal: partial.goal || null,
    capability_candidates: Array.isArray(partial.capability_candidates)
      ? [...partial.capability_candidates]
      : [],
    slots: clone(partial.slots || {}),
    missing_slots: Array.isArray(partial.missing_slots)
      ? [...partial.missing_slots]
      : [],
    ambiguity: Array.isArray(partial.ambiguity)
      ? [...partial.ambiguity]
      : [],
    risk_boundary: partial.risk_boundary || RISK_BOUNDARY.NONE,
    mutate: partial.mutate === true,
    status: partial.status || PLAN_STATUS.CLARIFY,
    notes: partial.notes || null,
    /**
     * Absolute: NLP never grants authority.
     */
    authority_granted: false,
  });
}

module.exports = {
  PLAN_STATUS,
  RISK_BOUNDARY,
  createDialoguePlan,
};
