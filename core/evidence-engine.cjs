'use strict';

/**
 * EvidenceEngine
 * ────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 2
 *
 * 관찰(WorldState diff, 센서, 외부 API 등)에서 나온 사실을
 * 구조화·검증·신뢰도 부여하고, 증거 간 보강/모순 관계를 관리합니다.
 *
 * ────────────────────────────────────────────────
 * 핵심 원칙 (ADR-001)
 *   - Confidence는 Truth가 아니며, Confidence는 Authority가 아니다.
 *   - AI_INFERENCE는 Fact와 동일한 증거 등급을 갖지 않는다.
 *   - 생체 원본 데이터(fingerprint_template, face_embedding 등)는
 *     Evidence에 절대 저장하지 않는다.
 *   - 생체인증은 assertion 형태로만 취급한다.
 * ────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { SOURCE_TYPE, BIOMETRIC_RAW_FIELDS } = require('./constants.cjs');

const VALID_SOURCE_TYPES = new Set(Object.values(SOURCE_TYPE));

// ─── 유틸 ────────────────────────────────────

function eid() {
  return `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function now() {
  return new Date().toISOString();
}

// ─── 검증 ────────────────────────────────────

/**
 * 객체 트리 전체를 순회하며 금지된 생체 원본 필드가 있는지 검사합니다.
 */
function containsBiometricRaw(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj)) {
    if (BIOMETRIC_RAW_FIELDS.includes(key)) return key;
    if (typeof obj[key] === 'object') {
      const found = containsBiometricRaw(obj[key]);
      if (found) return found;
    }
  }
  return false;
}

/**
 * Evidence 입력을 정규화하고 검증합니다.
 * 필수 필드 누락, 잘못된 source_type, trust_score 범위 위반,
 * 생체 원본 필드 포함 시 에러를 던집니다.
 */
function normalizeEvidence(input = {}) {
  // 필수 필드 검증
  if (!input.source || typeof input.source !== 'string' || input.source.trim() === '') {
    throw new Error('evidence.source is required (non-empty string)');
  }
  if (!input.source_type || !VALID_SOURCE_TYPES.has(input.source_type)) {
    throw new Error(
      `evidence.source_type must be one of: ${[...VALID_SOURCE_TYPES].join(', ')}`
    );
  }
  if (!input.claim || typeof input.claim !== 'string' || input.claim.trim() === '') {
    throw new Error('evidence.claim is required (non-empty string)');
  }
  if (input.observed_value === undefined) {
    throw new Error('evidence.observed_value is required');
  }

  // trust_score 범위 강제 (0.0 ~ 1.0)
  const rawScore = Number(input.trust_score);
  if (input.trust_score === undefined || input.trust_score === null || isNaN(rawScore)) {
    throw new Error('evidence.trust_score is required (number 0.0~1.0)');
  }
  if (rawScore < 0 || rawScore > 1) {
    throw new Error('evidence.trust_score must be between 0.0 and 1.0');
  }

  // 생체 원본 데이터 금지 (ADR-001 §3)
  const bioField = containsBiometricRaw(input);
  if (bioField) {
    throw new Error(
      `Biometric raw data field "${bioField}" is forbidden in Evidence (ADR-001 §3). ` +
      `Use BIOMETRIC_ASSERTION with assertion-only data.`
    );
  }

  // 만료 시간
  const expiresAt = input.expires_at || null;

  return {
    id: input.id || eid(),
    subject: String(input.subject || '').trim() || null,
    source: input.source.trim(),
    source_type: input.source_type,
    claim: input.claim.trim(),
    observed_value: clone(input.observed_value),
    trust_score: Math.round(rawScore * 1000) / 1000, // 소수점 3자리
    freshness: null, // collect 시 계산
    corroboration: [],
    contradiction: [],
    provenance: input.provenance ? clone(input.provenance) : null,
    collected_at: input.collected_at || now(),
    expires_at: expiresAt,
    metadata: input.metadata ? clone(input.metadata) : {},
  };
}

// ─── EvidenceEngine ─────────────────────────

class EvidenceEngine {
  constructor() {
    this._store = new Map();
  }

  /**
   * 증거를 수집(생성)합니다.
   * 정규화 + 검증 + freshness 계산 후 저장.
   */
  collect(input) {
    const ev = normalizeEvidence(input);
    ev.freshness = this._computeFreshness(ev.collected_at);
    this._store.set(ev.id, clone(ev));
    return clone(ev);
  }

  /**
   * ID로 증거를 조회합니다.
   */
  get(id) {
    const ev = this._store.get(id);
    return ev ? clone(ev) : null;
  }

  /**
   * 모든 증거 또는 필터 조건에 맞는 증거를 반환합니다.
   */
  list(filter = {}) {
    let results = [...this._store.values()];
    if (filter.subject) {
      results = results.filter(e => e.subject === filter.subject);
    }
    if (filter.source_type) {
      results = results.filter(e => e.source_type === filter.source_type);
    }
    if (filter.claim) {
      results = results.filter(e => e.claim === filter.claim);
    }
    if (filter.excludeExpired) {
      const t = new Date().toISOString();
      results = results.filter(e => !e.expires_at || e.expires_at > t);
    }
    return results.map(clone);
  }

  /**
   * 만료된 증거를 제거하고 제거된 수를 반환합니다.
   */
  purgeExpired(asOf) {
    const t = asOf || new Date().toISOString();
    let count = 0;
    for (const [id, ev] of this._store) {
      if (ev.expires_at && ev.expires_at <= t) {
        this._store.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * 동일 subject+claim을 가진 새 증거가 들어올 때,
   * 기존 증거와 보강(corroboration) 또는 모순(contradiction) 관계를 설정합니다.
   *
   * 반환: { merged: Evidence, relations: { corroborated: string[], contradicted: string[] } }
   */
  collectAndRelate(input) {
    const ev = normalizeEvidence(input);
    ev.freshness = this._computeFreshness(ev.collected_at);

    const existing = this.list({ subject: ev.subject, claim: ev.claim });
    const corroborated = [];
    const contradicted = [];

    for (const prev of existing) {
      if (prev.id === ev.id) continue;

      const agree = this._valuesAgree(prev.observed_value, ev.observed_value);
      if (agree) {
        // 보강: 양쪽에 서로를 등록
        corroborated.push(prev.id);
        ev.corroboration.push(prev.id);

        // 기존 증거에도 새 증거 ID 추가
        const stored = this._store.get(prev.id);
        if (stored && !stored.corroboration.includes(ev.id)) {
          stored.corroboration.push(ev.id);
          // 보강된 증거의 trust_score를 소폭 상향 (최대 1.0)
          stored.trust_score = Math.min(1.0,
            Math.round((stored.trust_score + 0.02) * 1000) / 1000
          );
        }
      } else {
        // 모순
        contradicted.push(prev.id);
        ev.contradiction.push(prev.id);

        const stored = this._store.get(prev.id);
        if (stored && !stored.contradiction.includes(ev.id)) {
          stored.contradiction.push(ev.id);
        }
      }
    }

    this._store.set(ev.id, clone(ev));
    return {
      merged: clone(ev),
      relations: { corroborated, contradicted },
    };
  }

  /**
   * AI_INFERENCE 증거인지 여부를 판별합니다.
   * AI 추론은 검증된 소스와 동일 등급이 아닙니다.
   */
  isAiInference(evidenceOrId) {
    const ev = typeof evidenceOrId === 'string'
      ? this.get(evidenceOrId)
      : evidenceOrId;
    return ev ? ev.source_type === SOURCE_TYPE.AI_INFERENCE : false;
  }

  /**
   * 검증된 소스(INSTITUTION, PLATFORM_API, IDENTITY_PROVIDER)인지 판별합니다.
   */
  isVerifiedSource(evidenceOrId) {
    const VERIFIED = new Set([
      SOURCE_TYPE.INSTITUTION,
      SOURCE_TYPE.PLATFORM_API,
      SOURCE_TYPE.IDENTITY_PROVIDER,
    ]);
    const ev = typeof evidenceOrId === 'string'
      ? this.get(evidenceOrId)
      : evidenceOrId;
    return ev ? VERIFIED.has(ev.source_type) : false;
  }

  // ─── 내부 ─────────────────────────────────

  /**
   * freshness 계산: collected_at으로부터 경과 시간(초).
   * 값이 작을수록 신선합니다.
   */
  _computeFreshness(collectedAt) {
    const elapsed = (Date.now() - new Date(collectedAt).getTime()) / 1000;
    return Math.max(0, Math.round(elapsed));
  }

  /**
   * 두 observed_value가 "합의"하는지 판정합니다.
   * 단순 동등 비교. 숫자/문자열/boolean은 === 비교,
   * 객체/배열은 JSON 직렬화 비교.
   */
  _valuesAgree(a, b) {
    if (a === b) return true;
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

module.exports = {
  EvidenceEngine,
  normalizeEvidence,
  containsBiometricRaw,
  VALID_SOURCE_TYPES,
};
