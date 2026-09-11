'use strict';

/**
 * BeliefEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 3
 *
 * Evidence를 이용해 "현재 상황에 대한 잠정적 믿음(Belief)"을 형성합니다.
 *
 * 이 버전은 Bayesian Engine이 아닙니다.
 * Weighted Evidence Belief Model입니다.
 *
 * 핵심 원칙:
 *
 *   Confidence !== Truth
 *   Confidence !== Authority
 *
 * BeliefEngine은 판단 확률/확신도를 계산할 뿐
 * 어떠한 실행 권한도 부여하지 않습니다.
 *
 * Evidence classes:
 *
 *   VERIFIED
 *     - IDENTITY_PROVIDER
 *     - INSTITUTION
 *
 *   AI
 *     - AI_INFERENCE
 *
 *   OTHER
 *     - DEVICE
 *     - USER_STATEMENT
 *     - PLATFORM_API
 *     - SENSOR
 *     - NETWORK
 *     - DERIVED
 *     - BIOMETRIC_ASSERTION
 *
 * AI evidence는 수량이 많더라도 verified evidence를
 * 단순 합산으로 압도하지 못하도록 별도 contribution cap을 둡니다.
 */

const crypto = require('crypto');

const {
  SOURCE_TYPES,
  VERIFIED_SOURCE_TYPES,
} = require('./evidence-engine.cjs');

const DEFAULT_HALF_LIFE_MS = 6 * 60 * 60 * 1000;

const AI_SUPPORT_CAP = 0.60;
const OTHER_SUPPORT_CAP = 0.90;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(0, Math.min(1, n));
}

function stableSerialize(value) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const keys = Object.keys(value).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )
    .join(',')}}`;
}

function beliefId(subject, claim, observedValue) {
  const valueKey = stableSerialize(observedValue);

  const hash = crypto
    .createHash('sha256')
    .update(`${subject}|${claim}|${valueKey}`)
    .digest('hex')
    .slice(0, 20);

  return `belief_${hash}`;
}

function validateEvidence(evidence) {
  if (
    evidence === null ||
    typeof evidence !== 'object' ||
    Array.isArray(evidence)
  ) {
    throw new Error('evidence must be an object');
  }

  if (
    typeof evidence.id !== 'string' ||
    evidence.id.trim() === ''
  ) {
    throw new Error('evidence.id is required');
  }

  if (
    typeof evidence.subject !== 'string' ||
    evidence.subject.trim() === ''
  ) {
    throw new Error('evidence.subject is required');
  }

  if (
    typeof evidence.claim !== 'string' ||
    evidence.claim.trim() === ''
  ) {
    throw new Error('evidence.claim is required');
  }

  if (
    typeof evidence.source_type !== 'string' ||
    !Object.values(SOURCE_TYPES).includes(
      evidence.source_type
    )
  ) {
    throw new Error(
      'evidence.source_type is invalid'
    );
  }

  const trust = Number(evidence.trust_score);

  if (
    !Number.isFinite(trust) ||
    trust < 0 ||
    trust > 1
  ) {
    throw new Error(
      'evidence.trust_score must be between 0 and 1'
    );
  }

  if (
    typeof evidence.collected_at !== 'string' ||
    Number.isNaN(
      Date.parse(evidence.collected_at)
    )
  ) {
    throw new Error(
      'evidence.collected_at must be valid'
    );
  }

  return true;
}

function isExpired(evidence, now) {
  if (!evidence.expires_at) {
    return false;
  }

  const expires = Date.parse(
    evidence.expires_at
  );

  if (!Number.isFinite(expires)) {
    return true;
  }

  return expires <= now.getTime();
}

function evidenceFreshness(
  evidence,
  now
) {
  const collected = Date.parse(
    evidence.collected_at
  );

  if (!Number.isFinite(collected)) {
    return 0;
  }

  if (!evidence.expires_at) {
    return 1;
  }

  const expires = Date.parse(
    evidence.expires_at
  );

  if (
    !Number.isFinite(expires) ||
    expires <= collected
  ) {
    return isExpired(evidence, now)
      ? 0
      : 1;
  }

  const current = now.getTime();

  if (current <= collected) {
    return 1;
  }

  if (current >= expires) {
    return 0;
  }

  return clamp01(
    (expires - current) /
      (expires - collected)
  );
}

function aggregateIndependent(
  weights
) {
  if (
    !Array.isArray(weights) ||
    weights.length === 0
  ) {
    return 0;
  }

  let remaining = 1;

  for (const weight of weights) {
    remaining *=
      1 - clamp01(weight);
  }

  return clamp01(
    1 - remaining
  );
}

function classifyEvidence(evidence) {
  if (
    evidence.verified_source === true ||
    VERIFIED_SOURCE_TYPES.has(
      evidence.source_type
    )
  ) {
    return 'VERIFIED';
  }

  if (
    evidence.source_type ===
    SOURCE_TYPES.AI_INFERENCE
  ) {
    return 'AI';
  }

  return 'OTHER';
}

/**
 * 한 observed_value를 지지하는 증거들의
 * support score를 계산합니다.
 *
 * verified:
 *   최대 1.0
 *
 * other:
 *   aggregate 후 0.90 cap
 *
 * AI:
 *   aggregate 후 0.60 cap
 *
 * 최종:
 *
 * 1 - (1 - verified)
 *     * (1 - other * 0.70)
 *     * (1 - ai * 0.35)
 *
 * 이 구조 때문에 AI evidence가 여러 개 존재해도
 * verified evidence 하나를 단순 숫자 합산으로 압도할 수 없습니다.
 */
function computeSupport(
  evidenceList,
  now
) {
  const verifiedWeights = [];
  const otherWeights = [];
  const aiWeights = [];

  for (const evidence of evidenceList) {
    const freshness =
      evidenceFreshness(
        evidence,
        now
      );

    const effective =
      clamp01(
        evidence.trust_score *
          freshness
      );

    const type =
      classifyEvidence(
        evidence
      );

    if (type === 'VERIFIED') {
      verifiedWeights.push(
        effective
      );
    } else if (type === 'AI') {
      aiWeights.push(
        effective
      );
    } else {
      otherWeights.push(
        effective
      );
    }
  }

  const verified =
    aggregateIndependent(
      verifiedWeights
    );

  const other = Math.min(
    OTHER_SUPPORT_CAP,
    aggregateIndependent(
      otherWeights
    )
  );

  const ai = Math.min(
    AI_SUPPORT_CAP,
    aggregateIndependent(
      aiWeights
    )
  );

  const support =
    1 -
    (1 - verified) *
      (1 - other * 0.70) *
      (1 - ai * 0.35);

  return {
    support: clamp01(support),

    components: {
      verified:
        clamp01(verified),

      other:
        clamp01(other),

      ai:
        clamp01(ai),
    },
  };
}

function applyContradictionPenalty(
  ownSupport,
  competingSupport
) {
  const own =
    clamp01(ownSupport);

  const competitor =
    clamp01(competingSupport);

  /**
   * competing belief가 강할수록
   * confidence를 낮춥니다.
   *
   * 완전히 0으로 만들지 않는 이유:
   * 현실의 여러 가설을 동시에 유지하기 위함.
   */
  return clamp01(
    own *
      (1 - 0.65 * competitor)
  );
}

function applyTemporalDecay(
  confidence,
  updatedAt,
  now,
  halfLifeMs =
    DEFAULT_HALF_LIFE_MS
) {
  const start =
    Date.parse(updatedAt);

  if (!Number.isFinite(start)) {
    return 0;
  }

  const elapsed = Math.max(
    0,
    now.getTime() - start
  );

  if (elapsed === 0) {
    return clamp01(
      confidence
    );
  }

  const halfLife =
    Number(halfLifeMs) > 0
      ? Number(halfLifeMs)
      : DEFAULT_HALF_LIFE_MS;

  const multiplier =
    Math.pow(
      0.5,
      elapsed / halfLife
    );

  return clamp01(
    confidence * multiplier
  );
}

class BeliefEngine {
  constructor(opts = {}) {
    this._beliefs =
      new Map();

    this.halfLifeMs =
      Number(opts.halfLifeMs) > 0
        ? Number(
            opts.halfLifeMs
          )
        : DEFAULT_HALF_LIFE_MS;
  }

  /**
   * Evidence[] → Belief[]
   *
   * 동일:
   *   subject + claim + observed_value
   *
   * 끼리 하나의 belief 후보로 묶습니다.
   */
  update(
    evidenceList,
    opts = {}
  ) {
    if (
      !Array.isArray(
        evidenceList
      )
    ) {
      throw new Error(
        'evidenceList must be an array'
      );
    }

    const now =
      opts.now instanceof Date
        ? opts.now
        : new Date(
            opts.now ||
              Date.now()
          );

    if (
      Number.isNaN(
        now.getTime()
      )
    ) {
      throw new Error(
        'opts.now is invalid'
      );
    }

    const copied =
      evidenceList.map(
        clone
      );

    copied.forEach(
      validateEvidence
    );

    const active =
      copied.filter(
        (evidence) =>
          !isExpired(
            evidence,
            now
          )
      );

    /**
     * 먼저
     * subject + claim별로 묶습니다.
     */
    const claimGroups =
      new Map();

    for (const evidence of active) {
      const groupKey =
        `${evidence.subject}` +
        `\u0000${evidence.claim}`;

      if (
        !claimGroups.has(
          groupKey
        )
      ) {
        claimGroups.set(
          groupKey,
          []
        );
      }

      claimGroups
        .get(groupKey)
        .push(evidence);
    }

    const updatedBeliefs = [];

    for (
      const evidenceGroup
      of claimGroups.values()
    ) {
      const subject =
        evidenceGroup[0].subject;

      const claim =
        evidenceGroup[0].claim;

      /**
       * 같은 observed_value별로
       * 다시 분리합니다.
       */
      const valueGroups =
        new Map();

      for (
        const evidence
        of evidenceGroup
      ) {
        const valueKey =
          stableSerialize(
            evidence.observed_value
          );

        if (
          !valueGroups.has(
            valueKey
          )
        ) {
          valueGroups.set(
            valueKey,
            []
          );
        }

        valueGroups
          .get(valueKey)
          .push(evidence);
      }

      const candidates = [];

      for (
        const [
          valueKey,
          evidence,
        ]
        of valueGroups.entries()
      ) {
        const support =
          computeSupport(
            evidence,
            now
          );

        candidates.push({
          valueKey,
          observedValue:
            clone(
              evidence[0]
                .observed_value
            ),
          evidence,
          support:
            support.support,
          components:
            support.components,
        });
      }

      /**
       * 각 후보 belief는
       * 가장 강한 경쟁 belief의 support를
       * contradiction으로 사용합니다.
       */
      for (
        const candidate
        of candidates
      ) {
        const competitors =
          candidates.filter(
            (other) =>
              other.valueKey !==
              candidate.valueKey
          );

        const strongestCompetitor =
          competitors.reduce(
            (max, item) =>
              Math.max(
                max,
                item.support
              ),
            0
          );

        const confidence =
          applyContradictionPenalty(
            candidate.support,
            strongestCompetitor
          );

        const id =
          beliefId(
            subject,
            claim,
            candidate
              .observedValue
          );

        const previous =
          this._beliefs.get(
            id
          );

        const formedAt =
          previous
            ? previous.formed_at
            : now.toISOString();

        const belief = {
          id,

          subject,

          claim,

          observed_value:
            clone(
              candidate
                .observedValue
            ),

          confidence:
            clamp01(
              confidence
            ),

          support_score:
            clamp01(
              candidate.support
            ),

          contradiction_score:
            clamp01(
              strongestCompetitor
            ),

          support_components:
            clone(
              candidate.components
            ),

          evidence_ids:
            candidate.evidence.map(
              (item) =>
                item.id
            ),

          evidence_count:
            candidate
              .evidence.length,

          verified_evidence_count:
            candidate.evidence.filter(
              (item) =>
                classifyEvidence(
                  item
                ) ===
                'VERIFIED'
            ).length,

          ai_evidence_count:
            candidate.evidence.filter(
              (item) =>
                classifyEvidence(
                  item
                ) === 'AI'
            ).length,

          formed_at:
            formedAt,

          last_updated:
            now.toISOString(),

          /**
           * Belief Engine은
           * Authority를 부여하지 않는다.
           */
          authority_granted:
            false,

          model:
            'WEIGHTED_EVIDENCE_V1',
        };

        this._beliefs.set(
          id,
          clone(belief)
        );

        updatedBeliefs.push(
          clone(belief)
        );
      }
    }

    return updatedBeliefs;
  }

  get(id) {
    const belief =
      this._beliefs.get(id);

    return belief
      ? clone(belief)
      : null;
  }

  list(filter = {}) {
    let beliefs =
      [
        ...this._beliefs.values(),
      ].map(clone);

    if (
      filter.subject !==
      undefined
    ) {
      beliefs =
        beliefs.filter(
          (belief) =>
            belief.subject ===
            filter.subject
        );
    }

    if (
      filter.claim !==
      undefined
    ) {
      beliefs =
        beliefs.filter(
          (belief) =>
            belief.claim ===
            filter.claim
        );
    }

    return beliefs;
  }

  /**
   * 저장된 belief를
   * confidence 순으로 정렬합니다.
   *
   * opts.now가 있으면
   * temporal decay가 적용된
   * effective_confidence도 함께 계산합니다.
   */
  rank(opts = {}) {
    const now =
      opts.now
        ? new Date(
            opts.now
          )
        : null;

    const beliefs =
      this.list(
        opts.filter || {}
      );

    return beliefs
      .map((belief) => {
        const effective =
          now &&
          !Number.isNaN(
            now.getTime()
          )
            ? applyTemporalDecay(
                belief.confidence,
                belief.last_updated,
                now,
                this.halfLifeMs
              )
            : belief.confidence;

        return {
          ...belief,

          effective_confidence:
            clamp01(
              effective
            ),
        };
      })
      .sort(
        (a, b) =>
          b.effective_confidence -
          a.effective_confidence
      );
  }

  /**
   * 특정 belief의
   * 시간감쇠된 confidence를 반환합니다.
   *
   * 저장된 원본 confidence는
   * 변경하지 않습니다.
   */
  decay(
    beliefOrId,
    now = new Date()
  ) {
    const belief =
      typeof beliefOrId ===
      'string'
        ? this.get(
            beliefOrId
          )
        : clone(
            beliefOrId
          );

    if (!belief) {
      return null;
    }

    const target =
      now instanceof Date
        ? now
        : new Date(now);

    if (
      Number.isNaN(
        target.getTime()
      )
    ) {
      throw new Error(
        'now is invalid'
      );
    }

    return {
      ...belief,

      effective_confidence:
        applyTemporalDecay(
          belief.confidence,
          belief.last_updated,
          target,
          this.halfLifeMs
        ),
    };
  }

  remove(id) {
    return this._beliefs.delete(
      id
    );
  }

  clear() {
    this._beliefs.clear();
  }
}

module.exports = {
  BeliefEngine,

  DEFAULT_HALF_LIFE_MS,

  AI_SUPPORT_CAP,
  OTHER_SUPPORT_CAP,

  clamp01,

  stableSerialize,

  beliefId,

  classifyEvidence,

  evidenceFreshness,

  aggregateIndependent,

  computeSupport,

  applyContradictionPenalty,

  applyTemporalDecay,
};
