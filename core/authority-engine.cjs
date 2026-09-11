'use strict';

/**
 * AuthorityEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Gate Layer · Authority
 *
 * "이 주체가 이 행동을 할 권한이 있는가"만 봅니다.
 *
 * 고정 원칙:
 *   Identity ≠ Authority
 *   Consent ≠ Authority
 *   Biometric success ≠ Authority
 *
 * Identity/Consent/Biometric이 모두 있어도
 * Authority grant가 없으면 실행 권한이 생기지 않습니다.
 */

const crypto = require('crypto');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'authz') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

class AuthorityEngine {
  constructor() {
    this._grants = new Map();
  }

  /**
   * Authority grant 등록.
   *
   * 필수:
   *   subject, action, scope
   *
   * 선택:
   *   domain, resource, expires_at, conditions
   */
  grant(input = {}) {
    if (!isPlainObject(input)) {
      throw new Error('authority grant must be a plain object');
    }

    for (const field of ['subject', 'action', 'scope']) {
      if (
        typeof input[field] !== 'string' ||
        input[field].trim() === ''
      ) {
        throw new Error(`authority.${field} is required`);
      }
    }

    if (input.expires_at && Number.isNaN(Date.parse(input.expires_at))) {
      throw new Error('authority.expires_at is invalid');
    }

    const grant = {
      id: input.id || makeId(),
      subject: input.subject.trim(),
      action: input.action.trim(),
      scope: input.scope.trim(),
      domain: input.domain || null,
      resource: input.resource || null,
      expires_at: input.expires_at || null,
      conditions: clone(input.conditions || {}),
      granted_by: input.granted_by || null,
      granted_at: input.granted_at || new Date().toISOString(),
      provenance: clone(input.provenance || {}),
      status: 'ACTIVE',
      /**
       * This object IS an authority grant.
       * Identity/Consent/Biometric alone never create this.
       */
      is_authority_grant: true,
    };

    this._grants.set(grant.id, clone(grant));
    return clone(grant);
  }

  get(id) {
    const item = this._grants.get(id);
    return item ? clone(item) : null;
  }

  list(filter = {}) {
    let rows = [...this._grants.values()].map(clone);

    if (filter.subject) {
      rows = rows.filter((g) => g.subject === filter.subject);
    }
    if (filter.action) {
      rows = rows.filter((g) => g.action === filter.action);
    }
    if (filter.scope) {
      rows = rows.filter((g) => g.scope === filter.scope);
    }

    return rows;
  }

  isExpired(grant, now = new Date()) {
    if (!grant) return true;
    if (!grant.expires_at) return false;
    return Date.parse(grant.expires_at) <= now.getTime();
  }

  /**
   * subject + action + scope (+ optional domain/resource) 검증.
   */
  verify(opts = {}) {
    const now =
      opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());

    for (const field of ['subject', 'action', 'scope']) {
      if (
        typeof opts[field] !== 'string' ||
        opts[field].trim() === ''
      ) {
        return {
          ok: false,
          reason: `missing_${field}`,
          grant: null,
        };
      }
    }

    const matches = this.list({
      subject: opts.subject,
      action: opts.action,
      scope: opts.scope,
    }).filter((g) => {
      if (g.status !== 'ACTIVE') return false;
      if (this.isExpired(g, now)) return false;
      if (opts.domain && g.domain && g.domain !== opts.domain) {
        return false;
      }
      if (opts.resource && g.resource && g.resource !== opts.resource) {
        return false;
      }
      return true;
    });

    if (matches.length === 0) {
      return {
        ok: false,
        reason: 'authority_missing_or_expired',
        grant: null,
      };
    }

    return {
      ok: true,
      reason: 'authority_granted',
      grant: clone(matches[0]),
    };
  }

  /**
   * Explicit proofs that Identity / Consent / Biometric
   * do NOT create authority.
   */
  fromIdentity(_identityResult) {
    return {
      ok: false,
      reason: 'identity_is_not_authority',
      grant: null,
    };
  }

  fromConsent(_consentResult) {
    return {
      ok: false,
      reason: 'consent_is_not_authority',
      grant: null,
    };
  }

  fromBiometric(_biometricResult) {
    return {
      ok: false,
      reason: 'biometric_is_not_authority',
      grant: null,
    };
  }

  revoke(id) {
    const stored = this._grants.get(id);
    if (!stored) return false;
    stored.status = 'REVOKED';
    return true;
  }

  clear() {
    this._grants.clear();
  }
}

module.exports = {
  AuthorityEngine,
};
