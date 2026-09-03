'use strict';

/**
 * BeliefEngine
 * ────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 3
 *
 * Evidence의 trust_score, freshness, 보강, 충돌을 이용해
 * subject+claim 단위 Belief를 형성·갱신·감쇠·랭킹합니다.
 *
 * 이 모듈은 베이지안 추론이 아닙니다.
 * 방법은 weighted evidence update 입니다.
 *
 * 핵심 원칙 (ADR-001):
 *   Confidence는 Truth가 아니다.
 *   Confidence는 Authority가 아니다.
 *   AI_INFERENCE는 verified evidence를 압도하지 못한다.
 */

const crypto = require('crypto');
const {
  EvidenceEngine,
  SOURCE_TYPES,
  VERIFIED_SOURCE_TYPES,
} = require('./evidence-engine.cjs');

const UPDATE_METHOD = 'weighted_evidence_update';
const UNCERTAINTY_PRIOR = 1.0;
const VERIFIED_WEIGHT = 2.0;
const DEFAULT_WEIGHT = 1.0;
const AI_WEIGHT = 0.15;
const AI_VS_VERIFIED_CAP = 0.99;
const DEFAULT_HALF_LIFE_MS = 24 * 60 * 60 * 1000;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'blf') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function valueKey(observedValue) {
  return JSON.stringify(observedValue);
}

function groupKey(subject, claim, observedValue) {
  return `${subject}::${claim}::${valueKey(observedValue)}`;
}

function isVerifiedEvidence(ev) {
  return (
    ev.verified_source === true ||
    VERIFIED_SOURCE_TYPES.has(ev.source_type)
  );
}

function isAiInference(ev) {
  return ev.source_type === SOURCE_TYPES.AI_INFERENCE;
}

function sourceWeight(ev) {
  if (isVerifiedEvidence(ev)) return VERIFIED_WEIGHT;
  if (isAiInference(ev)) return AI_WEIGHT;
  return DEFAULT_WEIGHT;
}

class BeliefEngine {
  /**
   * @param {object} [opts]
   * @param {EvidenceEngine} [opts.evidenceEngine]
   * @param {number} [opts.halfLifeMs]
   * @param {number} [opts.uncertaintyPrior]
   */
  constructor(opts = {}) {
    this._ee = opts.evidenceEngine || new EvidenceEngine();
    this.halfLifeMs =
      Number(opts.halfLifeMs) > 0
        ? Number(opts.halfLifeMs)
        : DEFAULT_HALF_LIFE_MS;
    this.uncertaintyPrior =
      Number(opts.uncertaintyPrior) > 0
        ? Number(opts.uncertaintyPrior)
        : UNCERTAINTY_PRIOR;
    this._beliefs = new Map();
    this._evidence = new Map();
  }

  /**
   * Evidence[]로부터 Belief를 생성하고 저장합니다.
   * 기존 증거 풀을 이번 목록으로 교체합니다.
   */
  form(evidenceList = [], now = new Date()) {
    this._evidence.clear();
    this._ingestEvidence(evidenceList);
    return this._rebuild(now);
  }

  /**
   * 새 Evidence를 풀에 합치고 subject+claim Belief를 다시 계산합니다.
   */
  update(newEvidenceList = [], now = new Date()) {
    this._ingestEvidence(newEvidenceList);
    return this._rebuild(now);
  }

  /**
   * 시간 경과에 따라 confidence를 반감기 기준으로 감쇠합니다.
   * Evidence를 다시 읽지 않고 Belief 자체에 감쇠를 적용합니다.
   */
  decay(now = new Date(), beliefs) {
    const target = Array.isArray(beliefs)
      ? beliefs.map(clone)
      : this.list();

    const t = now instanceof Date ? now.getTime() : Date.parse(now);

    const next = target.map((belief) => {
      const last = Date.parse(belief.last_updated || belief.formed_at);
      if (!Number.isFinite(last) || !Number.isFinite(t) || t <= last) {
        return this._seal(belief);
      }

      const elapsed = t - last;
      const factor = Math.pow(0.5, elapsed / this.halfLifeMs);
      const decayed = this._seal({
        ...belief,
        confidence: clamp01(belief.confidence * factor),
        last_updated: new Date(t).toISOString(),
        decayed_at: new Date(t).toISOString(),
      });

      if (!Array.isArray(beliefs) && this._beliefs.has(decayed.id)) {
        this._beliefs.set(decayed.id, clone(decayed));
      }

      return decayed;
    });

    if (!Array.isArray(beliefs)) {
      return this.list();
    }

    return next;
  }

  /**
   * confidence 내림차순 랭킹.
   * Confidence는 Authority가 아니므로 권한 필드는 정렬에 사용하지 않습니다.
   */
  rank(beliefs) {
    const rows = Array.isArray(beliefs) ? beliefs.map(clone) : this.list();
    return rows.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return (b.verified_evidence_count || 0) - (a.verified_evidence_count || 0);
    });
  }

  get(id) {
    const item = this._beliefs.get(id);
    return item ? clone(item) : null;
  }

  list() {
    return [...this._beliefs.values()].map(clone);
  }

  findBySubjectClaim(subject, claim) {
    return this.list().filter(
      (item) => item.subject === subject && item.claim === claim
    );
  }

  clear() {
    this._beliefs.clear();
    this._evidence.clear();
  }

  // ─── 내부 ─────────────────────────────────

  _ingestEvidence(list) {
    if (!Array.isArray(list)) {
      throw new Error('evidence list must be an array');
    }

    for (const item of list) {
      if (!item || typeof item !== 'object') {
        throw new Error('evidence must be an object');
      }
      if (typeof item.id !== 'string' || item.id.trim() === '') {
        throw new Error('evidence.id is required');
      }
      if (typeof item.subject !== 'string' || item.subject.trim() === '') {
        throw new Error('evidence.subject is required');
      }
      if (typeof item.claim !== 'string' || item.claim.trim() === '') {
        throw new Error('evidence.claim is required');
      }
      this._evidence.set(item.id, clone(item));
    }
  }

  _rebuild(now) {
    const instant = now instanceof Date ? now : new Date(now);
    const active = [...this._evidence.values()].filter(
      (ev) => !this._ee.isExpired(ev, instant)
    );

    const buckets = new Map();

    for (const ev of active) {
      const key = `${ev.subject}::${ev.claim}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          subject: ev.subject,
          claim: ev.claim,
          items: [],
        });
      }
      buckets.get(key).items.push(ev);
    }

    const previousByGroup = new Map();
    for (const belief of this._beliefs.values()) {
      previousByGroup.set(
        groupKey(belief.subject, belief.claim, belief.observed_value),
        belief
      );
    }

    const nextBeliefs = new Map();

    for (const bucket of buckets.values()) {
      const formed = this._formClaimBeliefs(
        bucket.subject,
        bucket.claim,
        bucket.items,
        instant,
        previousByGroup
      );
      for (const belief of formed) {
        nextBeliefs.set(belief.id, belief);
      }
    }

    this._beliefs = nextBeliefs;
    return this.list();
  }

  _formClaimBeliefs(subject, claim, items, now, previousByGroup) {
    const groups = new Map();

    for (const ev of items) {
      const key = valueKey(ev.observed_value);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(ev);
    }

    const scored = [...groups.entries()].map(([key, evidence]) => {
      let rawSupport = evidence.reduce((sum, ev) => {
        const fresh = this._ee.freshness(ev, now);
        return sum + ev.trust_score * fresh * sourceWeight(ev);
      }, 0);

      return {
        key,
        observed_value: JSON.parse(key),
        evidence,
        rawSupport,
        verifiedCount: evidence.filter(isVerifiedEvidence).length,
        aiOnly: evidence.every(isAiInference),
      };
    });

    const verifiedMax = Math.max(
      0,
      ...scored
        .filter((g) => g.verifiedCount > 0)
        .map((g) => g.rawSupport)
    );

    if (verifiedMax > 0) {
      for (const g of scored) {
        if (g.aiOnly) {
          g.rawSupport = Math.min(
            g.rawSupport,
            verifiedMax * AI_VS_VERIFIED_CAP
          );
        }
      }
    }

    const totalSupport = scored.reduce((s, g) => s + g.rawSupport, 0);
    const competing = scored.length > 1;
    const iso = now.toISOString();

    const beliefs = scored.map((g) => {
      const denom = g.rawSupport + totalSupport - g.rawSupport + this.uncertaintyPrior;
      const confidence = clamp01(g.rawSupport / denom);

      const group = groupKey(subject, claim, g.observed_value);
      const prev = previousByGroup.get(group);

      return this._seal({
        id: prev ? prev.id : makeId(),
        subject,
        claim,
        observed_value: clone(g.observed_value),
        confidence,
        evidence_ids: g.evidence.map((ev) => ev.id),
        competing,
        competing_values: competing ? scored.length : 1,
        support_score: g.rawSupport,
        verified_evidence_count: g.verifiedCount,
        update_method: UPDATE_METHOD,
        formed_at: prev ? prev.formed_at : iso,
        last_updated: iso,
        decayed_at: null,
        grants_authority: false,
        authority: null,
        principle: 'Confidence is not Truth. Confidence is not Authority.',
      });
    });

    return beliefs;
  }

  _seal(belief) {
    const sealed = clone(belief);
    sealed.confidence = clamp01(sealed.confidence);
    sealed.grants_authority = false;
    sealed.authority = null;
    return sealed;
  }
}

module.exports = {
  BeliefEngine,
  UPDATE_METHOD,
  VERIFIED_WEIGHT,
  AI_WEIGHT,
  UNCERTAINTY_PRIOR,
};
