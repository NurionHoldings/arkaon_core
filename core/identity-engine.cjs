'use strict';

/**
 * IdentityEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Gate Layer · Identity
 *
 * "누구인가"만 봅니다.
 *
 * 절대 저장하지 않음:
 *   fingerprint templates, face embeddings, voiceprints, raw biometric data
 *
 * 다루는 것:
 *   device_user_present (biometric assertion result only)
 *   real_name_verified
 *   device_bound
 *   credential_valid
 *
 * Identity ≠ Authority
 * Biometric success ≠ Authority
 */

const crypto = require('crypto');

const RAW_BIOMETRIC_KEYS = [
  'fingerprint',
  'fingerprint_template',
  'fingerprintTemplate',
  'face_embedding',
  'faceEmbedding',
  'face_template',
  'voiceprint',
  'voice_print',
  'iris_template',
  'biometric_template',
  'raw_biometric',
  'raw_biometric_data',
  'rawBiometricData',
];

const CLAIM_TYPES = Object.freeze({
  DEVICE_USER_PRESENT: 'device_user_present',
  REAL_NAME_VERIFIED: 'real_name_verified',
  DEVICE_BOUND: 'device_bound',
  CREDENTIAL_VALID: 'credential_valid',
});

const DEFAULT_BIOMETRIC_FRESHNESS_MS = 5 * 60 * 1000;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function containsRawBiometric(value) {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some((item) => containsRawBiometric(item));
  }

  if (!isPlainObject(value)) return false;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = String(key).toLowerCase();
    const forbidden = RAW_BIOMETRIC_KEYS.some(
      (k) => normalized === k.toLowerCase()
    );
    const semantic =
      normalized.includes('fingerprint') ||
      normalized.includes('face_embedding') ||
      normalized.includes('face_template') ||
      normalized.includes('voiceprint') ||
      normalized.includes('iris_template') ||
      normalized.includes('raw_biometric');

    if (forbidden || semantic) return true;
    if (containsRawBiometric(nested)) return true;
  }

  return false;
}

class IdentityEngine {
  constructor(opts = {}) {
    this._credentials = new Map();
    this._assertions = new Map();
    this.biometricFreshnessMs =
      Number(opts.biometricFreshnessMs) > 0
        ? Number(opts.biometricFreshnessMs)
        : DEFAULT_BIOMETRIC_FRESHNESS_MS;
  }

  /**
   * Device-bound identity credential 등록.
   * raw biometric 포함 시 거부.
   */
  registerCredential(input = {}) {
    if (!isPlainObject(input)) {
      throw new Error('credential must be a plain object');
    }

    if (containsRawBiometric(input)) {
      throw new Error('raw biometric material is forbidden');
    }

    if (typeof input.subject !== 'string' || input.subject.trim() === '') {
      throw new Error('subject is required');
    }

    if (typeof input.device_id !== 'string' || input.device_id.trim() === '') {
      throw new Error('device_id is required');
    }

    const credential = {
      id: input.id || makeId('cred'),
      subject: input.subject.trim(),
      device_id: input.device_id.trim(),
      device_bound: input.device_bound !== false,
      credential_valid: input.credential_valid !== false,
      real_name_verified: input.real_name_verified === true,
      display_name:
        typeof input.display_name === 'string'
          ? input.display_name
          : null,
      issuer:
        typeof input.issuer === 'string' ? input.issuer : null,
      claims: Array.isArray(input.claims)
        ? [...input.claims]
        : [],
      provenance: clone(input.provenance || {}),
      created_at: input.created_at || new Date().toISOString(),
      expires_at: input.expires_at || null,
      /**
       * Identity never grants authority.
       */
      authority_granted: false,
    };

    this._credentials.set(credential.id, clone(credential));
    return clone(credential);
  }

  /**
   * OS biometric assertion만 등록.
   * observed_value는 boolean이어야 하며 raw biometric 금지.
   */
  registerBiometricAssertion(input = {}) {
    if (!isPlainObject(input)) {
      throw new Error('assertion must be a plain object');
    }

    if (containsRawBiometric(input)) {
      throw new Error('raw biometric material is forbidden');
    }

    if (input.claim !== CLAIM_TYPES.DEVICE_USER_PRESENT) {
      throw new Error(
        'biometric assertion claim must be device_user_present'
      );
    }

    if (typeof input.observed_value !== 'boolean') {
      throw new Error(
        'biometric assertion observed_value must be boolean'
      );
    }

    if (typeof input.device_id !== 'string' || input.device_id.trim() === '') {
      throw new Error('device_id is required');
    }

    const assertion = {
      id: input.id || makeId('bio'),
      subject: input.subject ? String(input.subject).trim() : null,
      device_id: input.device_id.trim(),
      claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
      observed_value: input.observed_value,
      authenticator: input.authenticator || 'OS_BIOMETRIC',
      collected_at: input.collected_at || new Date().toISOString(),
      provenance: clone(input.provenance || {}),
      authority_granted: false,
    };

    this._assertions.set(assertion.id, clone(assertion));
    return clone(assertion);
  }

  getCredential(id) {
    const item = this._credentials.get(id);
    return item ? clone(item) : null;
  }

  listCredentials(filter = {}) {
    let rows = [...this._credentials.values()].map(clone);
    if (filter.subject) {
      rows = rows.filter((c) => c.subject === filter.subject);
    }
    if (filter.device_id) {
      rows = rows.filter((c) => c.device_id === filter.device_id);
    }
    return rows;
  }

  isCredentialExpired(credential, now = new Date()) {
    if (!credential) return true;
    if (!credential.expires_at) return false;
    return Date.parse(credential.expires_at) <= now.getTime();
  }

  /**
   * verified identity credential 존재 여부.
   */
  verifyIdentity(opts = {}) {
    const now =
      opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());

    const subject = opts.subject;
    const deviceId = opts.device_id;
    const requireRealName = opts.require_real_name === true;

    const candidates = this.listCredentials({
      subject,
      device_id: deviceId,
    }).filter((c) => {
      if (!c.credential_valid) return false;
      if (!c.device_bound) return false;
      if (this.isCredentialExpired(c, now)) return false;
      if (requireRealName && !c.real_name_verified) return false;
      if (deviceId && c.device_id !== deviceId) return false;
      return true;
    });

    if (candidates.length === 0) {
      return {
        ok: false,
        reason: 'identity_credential_missing_or_invalid',
        credential: null,
      };
    }

    return {
      ok: true,
      reason: 'identity_verified',
      credential: clone(candidates[0]),
    };
  }

  /**
   * 최근 biometric assertion freshness 검사.
   */
  verifyBiometricAssertion(opts = {}) {
    const now =
      opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
    const deviceId = opts.device_id;
    const maxAge =
      Number(opts.maxAgeMs) > 0
        ? Number(opts.maxAgeMs)
        : this.biometricFreshnessMs;

    let rows = [...this._assertions.values()].map(clone);

    if (deviceId) {
      rows = rows.filter((a) => a.device_id === deviceId);
    }

    rows = rows
      .filter((a) => a.observed_value === true)
      .sort(
        (a, b) =>
          Date.parse(b.collected_at) - Date.parse(a.collected_at)
      );

    if (rows.length === 0) {
      return {
        ok: false,
        reason: 'biometric_assertion_missing',
        assertion: null,
      };
    }

    const latest = rows[0];
    const age = now.getTime() - Date.parse(latest.collected_at);

    if (!Number.isFinite(age) || age > maxAge || age < 0) {
      return {
        ok: false,
        reason: 'biometric_assertion_stale',
        assertion: clone(latest),
      };
    }

    return {
      ok: true,
      reason: 'biometric_assertion_fresh',
      assertion: clone(latest),
      /**
       * Critical: biometric success is NOT authority.
       */
      authority_granted: false,
    };
  }

  clear() {
    this._credentials.clear();
    this._assertions.clear();
  }
}

module.exports = {
  IdentityEngine,
  CLAIM_TYPES,
  DEFAULT_BIOMETRIC_FRESHNESS_MS,
  containsRawBiometric,
};
