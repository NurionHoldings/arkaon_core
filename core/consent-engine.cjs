'use strict';

/**
 * ConsentEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Gate Layer · Consent
 *
 * "이 행동에 사용자가 동의했는가"만 봅니다.
 *
 * Consent는 purpose / recipient / scope 에 바인딩됩니다.
 * "MJN 실명 전달 동의" ≠ "금융 송금 동의"
 *
 * Consent ≠ Authority
 */

const crypto = require('crypto');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'cns') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

class ConsentEngine {
  constructor() {
    this._items = new Map();
  }

  /**
   * Consent 등록.
   *
   * 필수:
   *   subject, purpose, recipient, scope, action
   *
   * 선택:
   *   expires_at, single_use, decision_id, metadata
   */
  grant(input = {}) {
    if (!isPlainObject(input)) {
      throw new Error('consent must be a plain object');
    }

    for (const field of [
      'subject',
      'purpose',
      'recipient',
      'scope',
      'action',
    ]) {
      if (
        typeof input[field] !== 'string' ||
        input[field].trim() === ''
      ) {
        throw new Error(`consent.${field} is required`);
      }
    }

    if (input.expires_at) {
      if (Number.isNaN(Date.parse(input.expires_at))) {
        throw new Error('consent.expires_at is invalid');
      }
    }

    const consent = {
      id: input.id || makeId(),
      subject: input.subject.trim(),
      purpose: input.purpose.trim(),
      recipient: input.recipient.trim(),
      scope: input.scope.trim(),
      action: input.action.trim(),
      decision_id: input.decision_id || null,
      single_use: input.single_use === true,
      used: false,
      used_at: null,
      expires_at: input.expires_at || null,
      granted_at: input.granted_at || new Date().toISOString(),
      provenance: clone(input.provenance || {}),
      metadata: clone(input.metadata || {}),
      /**
       * Consent never grants authority by itself.
       */
      authority_granted: false,
      status: 'ACTIVE',
    };

    this._items.set(consent.id, clone(consent));
    return clone(consent);
  }

  get(id) {
    const item = this._items.get(id);
    return item ? clone(item) : null;
  }

  list(filter = {}) {
    let rows = [...this._items.values()].map(clone);

    if (filter.subject) {
      rows = rows.filter((c) => c.subject === filter.subject);
    }
    if (filter.purpose) {
      rows = rows.filter((c) => c.purpose === filter.purpose);
    }
    if (filter.recipient) {
      rows = rows.filter((c) => c.recipient === filter.recipient);
    }
    if (filter.action) {
      rows = rows.filter((c) => c.action === filter.action);
    }

    return rows;
  }

  isExpired(consent, now = new Date()) {
    if (!consent) return true;
    if (!consent.expires_at) return false;
    return Date.parse(consent.expires_at) <= now.getTime();
  }

  /**
   * Exact binding 검증:
   *   subject + purpose + recipient + scope + action
   */
  verify(opts = {}) {
    const now =
      opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());

    for (const field of [
      'subject',
      'purpose',
      'recipient',
      'scope',
      'action',
    ]) {
      if (
        typeof opts[field] !== 'string' ||
        opts[field].trim() === ''
      ) {
        return {
          ok: false,
          reason: `missing_${field}`,
          consent: null,
        };
      }
    }

    const matches = this.list({
      subject: opts.subject,
      purpose: opts.purpose,
      recipient: opts.recipient,
      action: opts.action,
    }).filter((c) => {
      if (c.status !== 'ACTIVE') return false;
      if (c.scope !== opts.scope) return false;
      if (this.isExpired(c, now)) return false;
      if (c.single_use && c.used) return false;
      if (
        opts.decision_id &&
        c.decision_id &&
        c.decision_id !== opts.decision_id
      ) {
        return false;
      }
      return true;
    });

    if (matches.length === 0) {
      return {
        ok: false,
        reason: 'consent_missing_or_mismatched',
        consent: null,
      };
    }

    const consent = matches[0];

    /**
     * verify()는 검사만 수행합니다.
     * single-use 소모는 Gate ALLOW 이후 markUsed()로만 합니다.
     * HOLD 상태에서 동의가 먼저 소모되면 안 됩니다.
     */
    return {
      ok: true,
      reason: 'consent_valid',
      consent: clone(consent),
      authority_granted: false,
    };
  }

  markUsed(id, now = new Date()) {
    const stored = this._items.get(id);
    if (!stored) return false;
    if (!stored.single_use) return true;
    if (stored.used) return false;

    const when = now instanceof Date ? now : new Date(now);
    stored.used = true;
    stored.used_at = when.toISOString();
    stored.status = 'USED';
    return true;
  }

  revoke(id) {
    const stored = this._items.get(id);
    if (!stored) return false;
    stored.status = 'REVOKED';
    return true;
  }

  clear() {
    this._items.clear();
  }
}

module.exports = {
  ConsentEngine,
};
