'use strict';

/**
 * ProgressStore
 * ─────────────────────────────────────────────────
 * Accumulates user-visible progress steps per session.
 * Presentation memory only — never Authority.
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

class ProgressStore {
  constructor() {
    this._bySession = new Map();
  }

  get(sessionKey) {
    const key = String(sessionKey || '');
    if (!key) return [];
    return clone(this._bySession.get(key) || []);
  }

  /**
   * Replace session progress with a new checklist (typical per-turn).
   */
  set(sessionKey, steps) {
    const key = String(sessionKey || '');
    if (!key) return [];
    const list = Array.isArray(steps) ? clone(steps) : [];
    this._bySession.set(key, list);
    return clone(list);
  }

  /**
   * Append steps, de-duplicating identical stage+text tails.
   */
  append(sessionKey, steps) {
    const key = String(sessionKey || '');
    if (!key) return [];
    const current = this._bySession.get(key) || [];
    const incoming = Array.isArray(steps) ? steps : [];
    const next = [...current];

    for (const step of incoming) {
      const last = next[next.length - 1];
      if (
        last &&
        last.stage === step.stage &&
        last.text === step.text
      ) {
        next[next.length - 1] = clone(step);
      } else {
        next.push(clone(step));
      }
    }

    this._bySession.set(key, next);
    return clone(next);
  }

  clear(sessionKey) {
    this._bySession.delete(String(sessionKey || ''));
  }
}

module.exports = {
  ProgressStore,
};
