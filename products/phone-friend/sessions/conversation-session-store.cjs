'use strict';

/**
 * ConversationSessionStore
 * ─────────────────────────────────────────────────
 * PHONE FRIEND — Product/Capability Layer
 *
 * Multi-turn 대화 상태를 보관합니다.
 * StateStore(Core)를 주입받아 Memory / Device / Server로 교체 가능합니다.
 */

const crypto = require('crypto');
const { MemoryStore } = require('../../../core/state-store.cjs');

const SESSION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  WAITING_SLOT: 'WAITING_SLOT',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  WAITING_GATE: 'WAITING_GATE',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'sess') {
  return `${prefix}_${crypto.randomUUID()}`;
}

class ConversationSessionStore {
  constructor(opts = {}) {
    this.store = opts.store || new MemoryStore();
    this.ttlMs =
      Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
  }

  _key(id) {
    return `conv:${id}`;
  }

  create(input = {}) {
    const now = input.now ? new Date(input.now) : new Date();
    const id = input.id || makeId();

    const session = {
      id,
      subject: input.subject || null,
      device_id: input.device_id || null,
      status: SESSION_STATUS.ACTIVE,
      intent: input.intent ? clone(input.intent) : null,
      slots: clone(input.slots || {}),
      pending_question: null,
      candidate_options: [],
      decision_id: null,
      gate_result: null,
      confirmation_required: false,
      confirmed: false,
      turns: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + this.ttlMs).toISOString(),
    };

    this.store.set(this._key(id), session);
    return clone(session);
  }

  get(id, now = new Date()) {
    const session = this.store.get(this._key(id));
    if (!session) return null;

    if (this.isExpired(session, now)) {
      session.status = SESSION_STATUS.EXPIRED;
      this.store.set(this._key(id), session);
      return clone(session);
    }

    return clone(session);
  }

  isExpired(session, now = new Date()) {
    if (!session || !session.expires_at) return false;
    const t = now instanceof Date ? now : new Date(now);
    return Date.parse(session.expires_at) <= t.getTime();
  }

  update(id, patch = {}, now = new Date()) {
    const current = this.get(id, now);
    if (!current) {
      throw new Error('session_not_found');
    }

    if (current.status === SESSION_STATUS.EXPIRED) {
      throw new Error('session_expired');
    }

    const next = {
      ...current,
      ...clone(patch),
      id: current.id,
      created_at: current.created_at,
      updated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    };

    // preserve nested merges for slots/turns carefully
    if (patch.slots) {
      next.slots = {
        ...current.slots,
        ...clone(patch.slots),
      };
    }

    if (Array.isArray(patch.turns)) {
      next.turns = clone(patch.turns);
    }

    this.store.set(this._key(id), next);
    return clone(next);
  }

  appendTurn(id, turn, now = new Date()) {
    const current = this.get(id, now);
    if (!current) throw new Error('session_not_found');
    if (current.status === SESSION_STATUS.EXPIRED) {
      throw new Error('session_expired');
    }

    const turns = [...current.turns, clone(turn)];
    return this.update(id, { turns }, now);
  }

  touch(id, now = new Date()) {
    const t = now instanceof Date ? now : new Date(now);
    return this.update(
      id,
      {
        expires_at: new Date(t.getTime() + this.ttlMs).toISOString(),
      },
      t
    );
  }

  delete(id) {
    return this.store.delete(this._key(id));
  }

  clear() {
    for (const key of this.store.keys()) {
      if (key.startsWith('conv:')) {
        this.store.delete(key);
      }
    }
  }
}

module.exports = {
  ConversationSessionStore,
  SESSION_STATUS,
  DEFAULT_TTL_MS,
};
