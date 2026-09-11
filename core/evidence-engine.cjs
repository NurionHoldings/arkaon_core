'use strict';

/**
 * EvidenceEngine
 * ────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 2
 *
 * 관찰 결과와 외부 정보를 Evidence로 구조화하고,
 * 출처 유형 / 신뢰도 / 신선도 / 보강 / 충돌 / provenance를 관리합니다.
 *
 * 핵심 원칙:
 *   Confidence는 Truth가 아니다.
 *   Confidence는 Authority가 아니다.
 *   AI inference는 verified evidence와 동일하게 취급하지 않는다.
 *   Raw biometric material은 절대 저장하지 않는다.
 */

const crypto = require('crypto');

const SOURCE_TYPES = Object.freeze({
  DEVICE: 'DEVICE',
  USER_STATEMENT: 'USER_STATEMENT',
  BIOMETRIC_ASSERTION: 'BIOMETRIC_ASSERTION',
  IDENTITY_PROVIDER: 'IDENTITY_PROVIDER',
  PLATFORM_API: 'PLATFORM_API',
  INSTITUTION: 'INSTITUTION',
  SENSOR: 'SENSOR',
  NETWORK: 'NETWORK',
  AI_INFERENCE: 'AI_INFERENCE',
  DERIVED: 'DERIVED',
});

const VERIFIED_SOURCE_TYPES = new Set([
  SOURCE_TYPES.IDENTITY_PROVIDER,
  SOURCE_TYPES.INSTITUTION,
]);

const RAW_BIOMETRIC_KEYS = [
  'fingerprint',
  'fingerprint_template',
  'fingerprintTemplate',
  'fingerprint_image',
  'fingerprintImage',
  'face_template',
  'faceTemplate',
  'face_embedding',
  'faceEmbedding',
  'face_image',
  'faceImage',
  'voiceprint',
  'voice_print',
  'iris_template',
  'irisTemplate',
  'biometric_template',
  'biometricTemplate',
  'raw_biometric',
  'rawBiometric',
  'raw_biometric_data',
  'rawBiometricData',
];

const AI_INFERENCE_TRUST_CAP = 0.75;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'ev') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeTrustScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error('trust_score must be a finite number');
  }
  if (n < 0 || n > 1) {
    throw new Error('trust_score must be between 0 and 1');
  }
  return n;
}

function containsRawBiometricMaterial(value, path = '') {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some((item, index) =>
      containsRawBiometricMaterial(item, `${path}[${index}]`)
    );
  }

  if (!isPlainObject(value)) {
    return false;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();

    const directMatch = RAW_BIOMETRIC_KEYS.some(
      (forbidden) => normalizedKey === forbidden.toLowerCase()
    );

    const semanticMatch =
      normalizedKey.includes('fingerprint') ||
      normalizedKey.includes('face_embedding') ||
      normalizedKey.includes('facetemplate') ||
      normalizedKey.includes('face_template') ||
      normalizedKey.includes('voiceprint') ||
      normalizedKey.includes('iris_template') ||
      normalizedKey.includes('biometric_template') ||
      normalizedKey.includes('raw_biometric');

    if (directMatch || semanticMatch) {
      return true;
    }

    if (containsRawBiometricMaterial(nested, path ? `${path}.${key}` : key)) {
      return true;
    }
  }

  return false;
}

function validateIsoDate(value, fieldName) {
  if (value === null || value === undefined) return null;

  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    throw new Error(`${fieldName} must be a valid ISO date string`);
  }

  return new Date(t).toISOString();
}

class EvidenceEngine {
  constructor(opts = {}) {
    this._items = new Map();
    this.defaultTtlMs =
      Number(opts.defaultTtlMs) > 0
        ? Number(opts.defaultTtlMs)
        : 30 * 60 * 1000;
  }

  validate(input) {
    if (!isPlainObject(input)) {
      throw new Error('evidence must be a plain object');
    }

    if (typeof input.subject !== 'string' || input.subject.trim() === '') {
      throw new Error('subject must be a non-empty string');
    }

    if (typeof input.claim !== 'string' || input.claim.trim() === '') {
      throw new Error('claim must be a non-empty string');
    }

    if (
      typeof input.source_type !== 'string' ||
      !Object.values(SOURCE_TYPES).includes(input.source_type)
    ) {
      throw new Error('source_type is invalid');
    }

    if (
      input.source !== undefined &&
      (typeof input.source !== 'string' || input.source.trim() === '')
    ) {
      throw new Error('source must be a non-empty string when provided');
    }

    if (containsRawBiometricMaterial(input)) {
      throw new Error('raw biometric material is forbidden');
    }

    const trustScore =
      input.trust_score === undefined
        ? this._defaultTrustForSourceType(input.source_type)
        : normalizeTrustScore(input.trust_score);

    if (
      input.source_type === SOURCE_TYPES.BIOMETRIC_ASSERTION &&
      typeof input.observed_value !== 'boolean'
    ) {
      throw new Error(
        'BIOMETRIC_ASSERTION observed_value must be boolean'
      );
    }

    return {
      trustScore,
      collectedAt: validateIsoDate(
        input.collected_at || new Date().toISOString(),
        'collected_at'
      ),
      expiresAt:
        input.expires_at === undefined
          ? null
          : validateIsoDate(input.expires_at, 'expires_at'),
    };
  }

  _defaultTrustForSourceType(sourceType) {
    switch (sourceType) {
      case SOURCE_TYPES.IDENTITY_PROVIDER:
      case SOURCE_TYPES.INSTITUTION:
        return 0.95;

      case SOURCE_TYPES.BIOMETRIC_ASSERTION:
        return 0.9;

      case SOURCE_TYPES.PLATFORM_API:
        return 0.85;

      case SOURCE_TYPES.DEVICE:
      case SOURCE_TYPES.SENSOR:
        return 0.8;

      case SOURCE_TYPES.NETWORK:
        return 0.7;

      case SOURCE_TYPES.USER_STATEMENT:
        return 0.65;

      case SOURCE_TYPES.DERIVED:
        return 0.6;

      case SOURCE_TYPES.AI_INFERENCE:
        return 0.55;

      default:
        return 0.5;
    }
  }

  collect(input) {
    const validation = this.validate(input);

    let trustScore = validation.trustScore;

    if (input.source_type === SOURCE_TYPES.AI_INFERENCE) {
      trustScore = Math.min(trustScore, AI_INFERENCE_TRUST_CAP);
    }

    const collectedAt = validation.collectedAt;

    const expiresAt =
      validation.expiresAt ||
      new Date(
        Date.parse(collectedAt) +
          (Number(input.ttl_ms) > 0
            ? Number(input.ttl_ms)
            : this.defaultTtlMs)
      ).toISOString();

    const evidence = {
      id: input.id || makeId(),
      subject: input.subject.trim(),
      source: input.source ? input.source.trim() : null,
      source_type: input.source_type,
      claim: input.claim.trim(),
      observed_value: clone(input.observed_value),
      trust_score: trustScore,
      collected_at: collectedAt,
      expires_at: expiresAt,
      provenance: clone(input.provenance || {}),
      metadata: clone(input.metadata || {}),
      corroborates: Array.isArray(input.corroborates)
        ? [...input.corroborates]
        : [],
      contradicts: Array.isArray(input.contradicts)
        ? [...input.contradicts]
        : [],
      verified_source: VERIFIED_SOURCE_TYPES.has(input.source_type),
    };

    this._items.set(evidence.id, clone(evidence));
    return clone(evidence);
  }

  get(id) {
    const item = this._items.get(id);
    return item ? clone(item) : null;
  }

  list() {
    return [...this._items.values()].map(clone);
  }

  remove(id) {
    return this._items.delete(id);
  }

  clear() {
    this._items.clear();
  }

  isExpired(evidenceOrId, now = new Date()) {
    const evidence =
      typeof evidenceOrId === 'string'
        ? this.get(evidenceOrId)
        : clone(evidenceOrId);

    if (!evidence) return true;
    if (!evidence.expires_at) return false;

    return Date.parse(evidence.expires_at) <= now.getTime();
  }

  freshness(evidenceOrId, now = new Date()) {
    const evidence =
      typeof evidenceOrId === 'string'
        ? this.get(evidenceOrId)
        : clone(evidenceOrId);

    if (!evidence) return 0;

    const collected = Date.parse(evidence.collected_at);
    const expires = evidence.expires_at
      ? Date.parse(evidence.expires_at)
      : null;

    if (!Number.isFinite(collected)) return 0;

    if (!expires || expires <= collected) {
      return this.isExpired(evidence, now) ? 0 : 1;
    }

    const current = now.getTime();

    if (current <= collected) return 1;
    if (current >= expires) return 0;

    const remaining = expires - current;
    const lifetime = expires - collected;

    return Math.max(0, Math.min(1, remaining / lifetime));
  }

  findBySubjectClaim(subject, claim) {
    return this.list().filter(
      (item) =>
        item.subject === subject &&
        item.claim === claim
    );
  }

  evaluateRelation(subject, claim) {
    const items = this.findBySubjectClaim(subject, claim);

    const active = items.filter((item) => !this.isExpired(item));

    const groups = new Map();

    for (const item of active) {
      const key = JSON.stringify(item.observed_value);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(item);
    }

    const ranked = [...groups.entries()]
      .map(([serializedValue, evidence]) => {
        const weighted = evidence.reduce((sum, item) => {
          return (
            sum +
            item.trust_score *
              this.freshness(item)
          );
        }, 0);

        return {
          observed_value: JSON.parse(serializedValue),
          evidence,
          support_score: weighted,
        };
      })
      .sort((a, b) => b.support_score - a.support_score);

    return {
      subject,
      claim,
      groups: ranked,
      has_contradiction: ranked.length > 1,
      strongest: ranked[0] || null,
    };
  }

  reviewDisclosure(evidenceOrId, allowedClaims = []) {
    const evidence =
      typeof evidenceOrId === 'string'
        ? this.get(evidenceOrId)
        : clone(evidenceOrId);

    if (!evidence) {
      throw new Error('evidence not found');
    }

    const allowed = new Set(allowedClaims);

    return {
      claim: evidence.claim,
      allowed: allowed.has(evidence.claim),
      minimal_disclosure_required: !allowed.has(evidence.claim),
    };
  }
}

module.exports = {
  EvidenceEngine,
  SOURCE_TYPES,
  VERIFIED_SOURCE_TYPES,
  AI_INFERENCE_TRUST_CAP,
  containsRawBiometricMaterial,
  normalizeTrustScore,
};
