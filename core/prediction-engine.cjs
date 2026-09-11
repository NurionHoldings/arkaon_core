'use strict';

/**
 * PredictionEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 4
 *
 * World State + Belief를 바탕으로
 * 미래의 "가능한 상태(Prediction)"를 구조화합니다.
 *
 * 이 버전은 Machine Learning Prediction Model이 아닙니다.
 *
 * deterministic:
 *   - trend analysis
 *   - belief projection
 *   - optional rules
 *
 * 을 사용하는 초기 Prediction Model입니다.
 *
 * 핵심 원칙:
 *
 *   Prediction !== Future Fact
 *   Probability !== Truth
 *   Confidence !== Authority
 *
 * PredictionEngine은 실행 권한을 부여하지 않습니다.
 */

const crypto = require('crypto');

const DEFAULT_HORIZON_MINUTES = 60;
const DEFAULT_MAX_PREDICTIONS = 100;

const PREDICTION_TYPES = Object.freeze({
  TREND: 'TREND',
  BELIEF_PROJECTION: 'BELIEF_PROJECTION',
  RULE: 'RULE',
});

const IMPACT_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

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

function predictionId(parts) {
  const serialized = stableSerialize(parts);

  const hash = crypto
    .createHash('sha256')
    .update(serialized)
    .digest('hex')
    .slice(0, 20);

  return `prediction_${hash}`;
}

function normalizeHorizon(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_HORIZON_MINUTES;
  }

  return Math.max(1, Math.round(n));
}

function impactLevel(score) {
  const value = clamp01(score);

  if (value >= 0.85) {
    return IMPACT_LEVELS.CRITICAL;
  }

  if (value >= 0.65) {
    return IMPACT_LEVELS.HIGH;
  }

  if (value >= 0.35) {
    return IMPACT_LEVELS.MEDIUM;
  }

  return IMPACT_LEVELS.LOW;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function validateWorldStateEntry(entry) {
  if (!isPlainObject(entry)) {
    throw new Error(
      'worldState entry must be a plain object'
    );
  }

  if (
    typeof entry.platformId !== 'string' ||
    entry.platformId.trim() === ''
  ) {
    throw new Error(
      'worldState.platformId is required'
    );
  }

  if (!isPlainObject(entry.current)) {
    throw new Error(
      'worldState.current must be a plain object'
    );
  }

  return true;
}

function validateBelief(belief) {
  if (!isPlainObject(belief)) {
    throw new Error(
      'belief must be an object'
    );
  }

  if (
    typeof belief.id !== 'string' ||
    belief.id.trim() === ''
  ) {
    throw new Error(
      'belief.id is required'
    );
  }

  if (
    typeof belief.subject !== 'string' ||
    belief.subject.trim() === ''
  ) {
    throw new Error(
      'belief.subject is required'
    );
  }

  if (
    typeof belief.claim !== 'string' ||
    belief.claim.trim() === ''
  ) {
    throw new Error(
      'belief.claim is required'
    );
  }

  const confidence =
    Number(belief.confidence);

  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error(
      'belief.confidence must be between 0 and 1'
    );
  }

  return true;
}

/**
 * WorldState entry에서 특정 numeric metric의
 * history + current 값을 추출합니다.
 */
function extractMetricSeries(
  worldState,
  metric
) {
  validateWorldStateEntry(
    worldState
  );

  const values = [];

  const history =
    Array.isArray(
      worldState.history
    )
      ? worldState.history
      : [];

  for (const item of history) {
    if (
      item &&
      item.snapshot &&
      typeof item.snapshot[
        metric
      ] === 'number' &&
      Number.isFinite(
        item.snapshot[
          metric
        ]
      )
    ) {
      values.push(
        item.snapshot[
          metric
        ]
      );
    }
  }

  if (
    typeof worldState.current[
      metric
    ] === 'number' &&
    Number.isFinite(
      worldState.current[
        metric
      ]
    )
  ) {
    values.push(
      worldState.current[
        metric
      ]
    );
  }

  return values;
}

/**
 * numeric series의 추세를 계산합니다.
 *
 * 반환:
 *
 * {
 *   direction:
 *     INCREASING |
 *     DECREASING |
 *     STABLE |
 *     INSUFFICIENT_DATA,
 *
 *   strength: 0~1,
 *   delta,
 *   average_delta,
 *   sample_count
 * }
 */
function analyzeSeries(values) {
  if (
    !Array.isArray(values) ||
    values.length < 2
  ) {
    return {
      direction:
        'INSUFFICIENT_DATA',
      strength: 0,
      delta: 0,
      average_delta: 0,
      sample_count:
        Array.isArray(values)
          ? values.length
          : 0,
    };
  }

  let up = 0;
  let down = 0;
  let flat = 0;

  const deltas = [];

  for (
    let i = 1;
    i < values.length;
    i++
  ) {
    const delta =
      values[i] -
      values[i - 1];

    deltas.push(delta);

    if (delta > 0) {
      up++;
    } else if (delta < 0) {
      down++;
    } else {
      flat++;
    }
  }

  const transitions =
    values.length - 1;

  const upRatio =
    up / transitions;

  const downRatio =
    down / transitions;

  let direction =
    'STABLE';

  let strength =
    Math.max(
      upRatio,
      downRatio
    );

  if (upRatio >= 0.6) {
    direction =
      'INCREASING';
  } else if (
    downRatio >= 0.6
  ) {
    direction =
      'DECREASING';
  } else {
    direction =
      'STABLE';

    strength =
      flat / transitions;
  }

  const totalDelta =
    values[
      values.length - 1
    ] - values[0];

  const averageDelta =
    deltas.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / deltas.length;

  return {
    direction,
    strength:
      clamp01(strength),
    delta:
      totalDelta,
    average_delta:
      averageDelta,
    sample_count:
      values.length,
  };
}

/**
 * simple linear continuation.
 *
 * 현재 값에 평균 delta를
 * 한 step 적용한 값입니다.
 *
 * 실제 시계열 forecasting 모델이 아니며,
 * 초기 deterministic projection입니다.
 */
function projectNextValue(
  values
) {
  const analysis =
    analyzeSeries(values);

  if (
    analysis.direction ===
    'INSUFFICIENT_DATA'
  ) {
    return null;
  }

  const current =
    values[
      values.length - 1
    ];

  return (
    current +
    analysis.average_delta
  );
}

function trendProbability(
  analysis
) {
  if (
    !analysis ||
    analysis.direction ===
      'INSUFFICIENT_DATA'
  ) {
    return 0;
  }

  const sampleBonus =
    Math.min(
      0.15,
      Math.max(
        0,
        analysis.sample_count -
          2
      ) * 0.03
    );

  if (
    analysis.direction ===
    'STABLE'
  ) {
    return clamp01(
      0.50 +
        analysis.strength *
          0.20 +
        sampleBonus
    );
  }

  return clamp01(
    0.55 +
      analysis.strength *
        0.25 +
      sampleBonus
  );
}

function beliefProbability(
  belief
) {
  validateBelief(belief);

  const confidence =
    clamp01(
      belief.confidence
    );

  const contradiction =
    clamp01(
      belief.contradiction_score ||
        0
    );

  /**
   * Belief Engine에서 이미
   * contradiction penalty가 적용돼 있지만
   * Prediction 단계에서는
   * "미래 projection의 불확실성"을 추가 반영합니다.
   *
   * 최대 추가 penalty 15%.
   */
  return clamp01(
    confidence *
      (1 -
        contradiction *
          0.15)
  );
}

function beliefConfidence(
  belief
) {
  validateBelief(belief);

  const confidence =
    clamp01(
      belief.confidence
    );

  const contradiction =
    clamp01(
      belief.contradiction_score ||
        0
    );

  return clamp01(
    confidence *
      (1 -
        contradiction *
          0.25)
  );
}

class PredictionEngine {
  constructor(opts = {}) {
    this._predictions =
      new Map();

    this.maxPredictions =
      Number(
        opts.maxPredictions
      ) > 0
        ? Number(
            opts.maxPredictions
          )
        : DEFAULT_MAX_PREDICTIONS;

    this.defaultHorizonMinutes =
      normalizeHorizon(
        opts.defaultHorizonMinutes ||
          DEFAULT_HORIZON_MINUTES
      );

    this.rules =
      Array.isArray(
        opts.rules
      )
        ? [...opts.rules]
        : [];
  }

  /**
   * World State의 numeric metric에 대해
   * trend 기반 prediction을 생성합니다.
   */
  predictTrends(
    worldState,
    opts = {}
  ) {
    validateWorldStateEntry(
      worldState
    );

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

    const horizon =
      normalizeHorizon(
        opts.horizonMinutes ||
          this.defaultHorizonMinutes
      );

    const current =
      worldState.current;

    const predictions = [];

    for (
      const [
        metric,
        currentValue,
      ]
      of Object.entries(
        current
      )
    ) {
      if (
        typeof currentValue !==
          'number' ||
        !Number.isFinite(
          currentValue
        )
      ) {
        continue;
      }

      const values =
        extractMetricSeries(
          worldState,
          metric
        );

      const analysis =
        analyzeSeries(
          values
        );

      if (
        analysis.direction ===
        'INSUFFICIENT_DATA'
      ) {
        continue;
      }

      const probability =
        trendProbability(
          analysis
        );

      const projectedValue =
        projectNextValue(
          values
        );

      const confidence =
        clamp01(
          probability *
            Math.min(
              1,
              analysis.sample_count /
                5
            )
        );

      const impactScore =
        clamp01(
          Math.min(
            1,
            Math.abs(
              analysis.delta
            ) /
              Math.max(
                1,
                Math.abs(
                  values[0]
                )
              )
          )
        );

      const createdAt =
        now.toISOString();

      const expiresAt =
        new Date(
          now.getTime() +
            horizon *
              60 *
              1000
        ).toISOString();

      const prediction = {
        id: predictionId({
          type:
            PREDICTION_TYPES.TREND,
          platform_id:
            worldState.platformId,
          metric,
          direction:
            analysis.direction,
          created_at:
            createdAt,
        }),

        platform_id:
          worldState.platformId,

        type:
          PREDICTION_TYPES.TREND,

        subject:
          `platform:${worldState.platformId}`,

        claim:
          `metric:${metric}`,

        predicted_state: {
          metric,
          direction:
            analysis.direction,
          current_value:
            currentValue,
          projected_next_value:
            projectedValue,
        },

        description:
          `${metric} trend is ${analysis.direction}`,

        probability:
          probability,

        confidence:
          confidence,

        impact_score:
          impactScore,

        impact:
          impactLevel(
            impactScore
          ),

        horizon_minutes:
          horizon,

        basis: {
          source:
            'WORLD_STATE_TREND',
          metric,
          values:
            clone(values),
          analysis:
            clone(analysis),
        },

        authority_granted:
          false,

        created_at:
          createdAt,

        expires_at:
          expiresAt,

        model:
          'DETERMINISTIC_TREND_V1',
      };

      this._store(
        prediction
      );

      predictions.push(
        clone(
          prediction
        )
      );
    }

    return predictions;
  }

  /**
   * Belief[]을 미래 가능성으로 projection 합니다.
   */
  predictBeliefs(
    platformId,
    beliefs,
    opts = {}
  ) {
    if (
      typeof platformId !==
        'string' ||
      platformId.trim() ===
        ''
    ) {
      throw new Error(
        'platformId must be a non-empty string'
      );
    }

    if (
      !Array.isArray(
        beliefs
      )
    ) {
      throw new Error(
        'beliefs must be an array'
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

    const horizon =
      normalizeHorizon(
        opts.horizonMinutes ||
          this.defaultHorizonMinutes
      );

    const predictions = [];

    for (
      const rawBelief
      of beliefs
    ) {
      const belief =
        clone(
          rawBelief
        );

      validateBelief(
        belief
      );

      const probability =
        beliefProbability(
          belief
        );

      const confidence =
        beliefConfidence(
          belief
        );

      const contradiction =
        clamp01(
          belief.contradiction_score ||
            0
        );

      const verifiedCount =
        Number(
          belief
            .verified_evidence_count
        ) || 0;

      const aiCount =
        Number(
          belief
            .ai_evidence_count
        ) || 0;

      /**
       * verified evidence가 있을수록
       * impact 신뢰성 가중.
       *
       * AI evidence 개수는
       * impact 증가에 사용하지 않습니다.
       */
      const impactScore =
        clamp01(
          0.35 +
            Math.min(
              0.35,
              verifiedCount *
                0.10
            ) +
            confidence *
              0.30
        );

      const createdAt =
        now.toISOString();

      const expiresAt =
        new Date(
          now.getTime() +
            horizon *
              60 *
              1000
        ).toISOString();

      const prediction = {
        id: predictionId({
          type:
            PREDICTION_TYPES
              .BELIEF_PROJECTION,
          platform_id:
            platformId,
          belief_id:
            belief.id,
          observed_value:
            belief
              .observed_value,
          created_at:
            createdAt,
        }),

        platform_id:
          platformId,

        type:
          PREDICTION_TYPES
            .BELIEF_PROJECTION,

        subject:
          belief.subject,

        claim:
          belief.claim,

        predicted_state:
          clone(
            belief
              .observed_value
          ),

        description:
          `Belief projection for ${belief.subject}:${belief.claim}`,

        probability:
          probability,

        confidence:
          confidence,

        impact_score:
          impactScore,

        impact:
          impactLevel(
            impactScore
          ),

        horizon_minutes:
          horizon,

        basis: {
          source:
            'BELIEF',

          belief_id:
            belief.id,

          belief_confidence:
            belief.confidence,

          contradiction_score:
            contradiction,

          evidence_ids:
            Array.isArray(
              belief
                .evidence_ids
            )
              ? [
                  ...belief
                    .evidence_ids,
                ]
              : [],

          verified_evidence_count:
            verifiedCount,

          ai_evidence_count:
            aiCount,

          belief_model:
            belief.model ||
            null,
        },

        /**
         * Belief 또는 Prediction의
         * 높은 confidence가
         * 실행 권한으로 변환되지 않습니다.
         */
        authority_granted:
          false,

        created_at:
          createdAt,

        expires_at:
          expiresAt,

        model:
          'BELIEF_PROJECTION_V1',
      };

      this._store(
        prediction
      );

      predictions.push(
        clone(
          prediction
        )
      );
    }

    return predictions;
  }

  /**
   * 선택적 deterministic rule prediction.
   *
   * Rule contract:
   *
   * {
   *   id: string,
   *   description?: string,
   *   when(context) => boolean,
   *   probability?: number | function(context),
   *   impact_score?: number | function(context),
   *   predicted_state?: any | function(context),
   *   claim?: string,
   *   subject?: string,
   *   horizon_minutes?: number
   * }
   */
  predictRules(
    context,
    opts = {}
  ) {
    if (
      !isPlainObject(
        context
      )
    ) {
      throw new Error(
        'context must be a plain object'
      );
    }

    const platformId =
      context.platform_id ||
      (
        context.worldState &&
        context.worldState
          .platformId
      );

    if (
      typeof platformId !==
        'string' ||
      platformId.trim() ===
        ''
    ) {
      throw new Error(
        'context.platform_id is required'
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

    const predictions = [];

    for (
      const rule
      of this.rules
    ) {
      if (
        !rule ||
        typeof rule.id !==
          'string' ||
        typeof rule.when !==
          'function'
      ) {
        continue;
      }

      let matched = false;

      try {
        matched =
          rule.when(
            clone(
              context
            )
          ) === true;
      } catch {
        matched = false;
      }

      if (!matched) {
        continue;
      }

      const rawProbability =
        typeof rule.probability ===
          'function'
          ? rule.probability(
              clone(
                context
              )
            )
          : rule.probability;

      const probability =
        clamp01(
          rawProbability ===
            undefined
            ? 0.6
            : rawProbability
        );

      const rawImpact =
        typeof rule.impact_score ===
          'function'
          ? rule.impact_score(
              clone(
                context
              )
            )
          : rule.impact_score;

      const impactScore =
        clamp01(
          rawImpact ===
            undefined
            ? 0.5
            : rawImpact
        );

      const rawState =
        typeof rule.predicted_state ===
          'function'
          ? rule.predicted_state(
              clone(
                context
              )
            )
          : rule.predicted_state;

      const horizon =
        normalizeHorizon(
          rule.horizon_minutes ||
            opts.horizonMinutes ||
            this
              .defaultHorizonMinutes
        );

      const createdAt =
        now.toISOString();

      const expiresAt =
        new Date(
          now.getTime() +
            horizon *
              60 *
              1000
        ).toISOString();

      const prediction = {
        id: predictionId({
          type:
            PREDICTION_TYPES.RULE,
          platform_id:
            platformId,
          rule_id:
            rule.id,
          created_at:
            createdAt,
        }),

        platform_id:
          platformId,

        type:
          PREDICTION_TYPES.RULE,

        subject:
          rule.subject ||
          `platform:${platformId}`,

        claim:
          rule.claim ||
          `rule:${rule.id}`,

        predicted_state:
          clone(
            rawState ===
              undefined
              ? true
              : rawState
          ),

        description:
          rule.description ||
          `Rule ${rule.id} matched`,

        probability:
          probability,

        confidence:
          probability,

        impact_score:
          impactScore,

        impact:
          impactLevel(
            impactScore
          ),

        horizon_minutes:
          horizon,

        basis: {
          source:
            'DETERMINISTIC_RULE',
          rule_id:
            rule.id,
        },

        authority_granted:
          false,

        created_at:
          createdAt,

        expires_at:
          expiresAt,

        model:
          'DETERMINISTIC_RULE_V1',
      };

      this._store(
        prediction
      );

      predictions.push(
        clone(
          prediction
        )
      );
    }

    return predictions;
  }

  /**
   * 전체 prediction pipeline.
   */
  predict(
    context,
    opts = {}
  ) {
    if (
      !isPlainObject(
        context
      )
    ) {
      throw new Error(
        'context must be a plain object'
      );
    }

    const worldState =
      context.worldState ||
      null;

    const beliefs =
      Array.isArray(
        context.beliefs
      )
        ? context.beliefs
        : [];

    const platformId =
      context.platform_id ||
      (
        worldState &&
        worldState
          .platformId
      );

    if (
      typeof platformId !==
        'string' ||
      platformId.trim() ===
        ''
    ) {
      throw new Error(
        'platform_id is required'
      );
    }

    const results = [];

    if (worldState) {
      results.push(
        ...this.predictTrends(
          worldState,
          opts
        )
      );
    }

    if (
      beliefs.length > 0
    ) {
      results.push(
        ...this.predictBeliefs(
          platformId,
          beliefs,
          opts
        )
      );
    }

    if (
      this.rules.length > 0
    ) {
      results.push(
        ...this.predictRules(
          {
            ...clone(
              context
            ),
            platform_id:
              platformId,
          },
          opts
        )
      );
    }

    return results;
  }

  _store(prediction) {
    this._predictions.set(
      prediction.id,
      clone(
        prediction
      )
    );

    while (
      this._predictions.size >
      this.maxPredictions
    ) {
      const oldestKey =
        this._predictions
          .keys()
          .next()
          .value;

      this._predictions.delete(
        oldestKey
      );
    }
  }

  get(id) {
    const prediction =
      this._predictions.get(
        id
      );

    return prediction
      ? clone(
          prediction
        )
      : null;
  }

  list(filter = {}) {
    let predictions =
      [
        ...this
          ._predictions
          .values(),
      ].map(clone);

    if (
      filter.platform_id !==
      undefined
    ) {
      predictions =
        predictions.filter(
          (prediction) =>
            prediction
              .platform_id ===
            filter
              .platform_id
        );
    }

    if (
      filter.type !==
      undefined
    ) {
      predictions =
        predictions.filter(
          (prediction) =>
            prediction.type ===
            filter.type
        );
    }

    return predictions;
  }

  rank(filter = {}) {
    return this.list(
      filter
    ).sort(
      (a, b) => {
        if (
          b.probability !==
          a.probability
        ) {
          return (
            b.probability -
            a.probability
          );
        }

        return (
          b.confidence -
          a.confidence
        );
      }
    );
  }

  isExpired(
    predictionOrId,
    now = new Date()
  ) {
    const prediction =
      typeof predictionOrId ===
        'string'
        ? this.get(
            predictionOrId
          )
        : clone(
            predictionOrId
          );

    if (!prediction) {
      return true;
    }

    if (
      !prediction.expires_at
    ) {
      return false;
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

    return (
      Date.parse(
        prediction
          .expires_at
      ) <=
      target.getTime()
    );
  }

  remove(id) {
    return this
      ._predictions
      .delete(id);
  }

  clear() {
    this._predictions.clear();
  }
}

module.exports = {
  PredictionEngine,

  PREDICTION_TYPES,
  IMPACT_LEVELS,

  DEFAULT_HORIZON_MINUTES,
  DEFAULT_MAX_PREDICTIONS,

  clamp01,
  stableSerialize,
  predictionId,
  normalizeHorizon,
  impactLevel,

  extractMetricSeries,
  analyzeSeries,
  projectNextValue,
  trendProbability,

  beliefProbability,
  beliefConfidence,
};
