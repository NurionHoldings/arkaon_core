'use strict';

const {
  WorldStateEngine,
} = require(
  '../core/world-state-engine.cjs'
);

const {
  EvidenceEngine,
  SOURCE_TYPES,
} = require(
  '../core/evidence-engine.cjs'
);

const {
  BeliefEngine,
} = require(
  '../core/belief-engine.cjs'
);

const {
  PredictionEngine,
  PREDICTION_TYPES,
  IMPACT_LEVELS,
  clamp01,
  stableSerialize,
  impactLevel,
  extractMetricSeries,
  analyzeSeries,
  projectNextValue,
} = require(
  '../core/prediction-engine.cjs'
);

let passed = 0;
let failed = 0;

function assert(
  condition,
  label
) {
  if (condition) {
    passed++;

    console.log(
      `  ✅ ${label}`
    );
  } else {
    failed++;

    console.error(
      `  ❌ FAIL: ${label}`
    );
  }
}

function assertThrows(
  fn,
  label
) {
  try {
    fn();

    failed++;

    console.error(
      `  ❌ FAIL: ${label}`
    );
  } catch {
    passed++;

    console.log(
      `  ✅ ${label}`
    );
  }
}

console.log(
  '\n═══ PredictionEngine Tests ═══\n'
);

const BASE =
  new Date(
    '2026-09-04T00:00:00.000Z'
  );

function makeWorldState() {
  const engine =
    new WorldStateEngine();

  engine.merge(
    'dosirak-store',
    {
      orders: 10,
      revenue: 100,
      status: 'active',
    }
  );

  engine.merge(
    'dosirak-store',
    {
      orders: 15,
      revenue: 120,
      status: 'active',
    }
  );

  engine.merge(
    'dosirak-store',
    {
      orders: 20,
      revenue: 140,
      status: 'active',
    }
  );

  engine.merge(
    'dosirak-store',
    {
      orders: 25,
      revenue: 160,
      status: 'active',
    }
  );

  return engine.getByPlatform(
    'dosirak-store'
  );
}

function makeBelief(
  opts = {}
) {
  const evidenceEngine =
    new EvidenceEngine({
      defaultTtlMs:
        60 *
        60 *
        1000,
    });

  const beliefEngine =
    new BeliefEngine();

  const evidence =
    evidenceEngine.collect({
      id:
        opts.evidenceId ||
        'ev-default',

      subject:
        opts.subject ||
        'store:001',

      source:
        opts.source ||
        'institution',

      source_type:
        opts.sourceType ||
        SOURCE_TYPES
          .INSTITUTION,

      claim:
        opts.claim ||
        'fraud_risk',

      observed_value:
        opts.observedValue ===
        undefined
          ? true
          : opts.observedValue,

      trust_score:
        opts.trustScore ===
        undefined
          ? 0.95
          : opts.trustScore,

      collected_at:
        BASE.toISOString(),

      expires_at:
        new Date(
          BASE.getTime() +
            60 *
              60 *
              1000
        ).toISOString(),
    });

  return beliefEngine.update(
    [evidence],
    {
      now: BASE,
    }
  )[0];
}

console.log(
  '▸ TC-1: trend prediction 생성'
);

{
  const worldState =
    makeWorldState();

  const engine =
    new PredictionEngine();

  const predictions =
    engine.predictTrends(
      worldState,
      {
        now: BASE,
      }
    );

  assert(
    predictions.length >= 2,
    'numeric metric predictions 생성'
  );

  const orders =
    predictions.find(
      (item) =>
        item
          .predicted_state
          .metric ===
        'orders'
    );

  assert(
    orders !== undefined,
    'orders prediction 존재'
  );

  assert(
    orders.type ===
      PREDICTION_TYPES
        .TREND,
    'TREND type'
  );
}

console.log(
  '▸ TC-2: 증가 추세 탐지'
);

{
  const worldState =
    makeWorldState();

  const engine =
    new PredictionEngine();

  const orders =
    engine
      .predictTrends(
        worldState,
        {
          now: BASE,
        }
      )
      .find(
        (item) =>
          item
            .predicted_state
            .metric ===
          'orders'
      );

  assert(
    orders
      .predicted_state
      .direction ===
      'INCREASING',
    'orders 증가 추세'
  );

  assert(
    orders
      .predicted_state
      .projected_next_value >
      orders
        .predicted_state
        .current_value,
    '다음 값 증가 projection'
  );
}

console.log(
  '▸ TC-3: non-numeric metric 제외'
);

{
  const worldState =
    makeWorldState();

  const predictions =
    new PredictionEngine()
      .predictTrends(
        worldState,
        {
          now: BASE,
        }
      );

  assert(
    !predictions.some(
      (item) =>
        item
          .predicted_state
          .metric ===
        'status'
    ),
    '문자열 metric은 trend prediction 제외'
  );
}

console.log(
  '▸ TC-4: probability 0~1'
);

{
  const worldState =
    makeWorldState();

  const predictions =
    new PredictionEngine()
      .predictTrends(
        worldState,
        {
          now: BASE,
        }
      );

  assert(
    predictions.every(
      (item) =>
        item.probability >=
          0 &&
        item.probability <=
          1
    ),
    '모든 probability 0~1'
  );
}

console.log(
  '▸ TC-5: confidence 0~1'
);

{
  const predictions =
    new PredictionEngine()
      .predictTrends(
        makeWorldState(),
        {
          now: BASE,
        }
      );

  assert(
    predictions.every(
      (item) =>
        item.confidence >=
          0 &&
        item.confidence <=
          1
    ),
    '모든 confidence 0~1'
  );
}

console.log(
  '▸ TC-6: horizon / expires_at'
);

{
  const prediction =
    new PredictionEngine()
      .predictTrends(
        makeWorldState(),
        {
          now: BASE,
          horizonMinutes: 30,
        }
      )[0];

  assert(
    prediction
      .horizon_minutes ===
      30,
    'horizon 30분'
  );

  assert(
    Date.parse(
      prediction
        .expires_at
    ) -
      Date.parse(
        prediction
          .created_at
      ) ===
      30 *
        60 *
        1000,
    'expires_at이 horizon과 일치'
  );
}

console.log(
  '▸ TC-7: belief projection 생성'
);

{
  const belief =
    makeBelief();

  const predictions =
    new PredictionEngine()
      .predictBeliefs(
        'dosirak-store',
        [belief],
        {
          now: BASE,
        }
      );

  assert(
    predictions.length === 1,
    'belief 1개 → prediction 1개'
  );

  assert(
    predictions[0].type ===
      PREDICTION_TYPES
        .BELIEF_PROJECTION,
    'BELIEF_PROJECTION type'
  );

  assert(
    predictions[0]
      .basis
      .belief_id ===
      belief.id,
    'belief provenance 유지'
  );
}

console.log(
  '▸ TC-8: belief evidence_ids provenance'
);

{
  const belief =
    makeBelief({
      evidenceId:
        'ev-provenance',
    });

  const prediction =
    new PredictionEngine()
      .predictBeliefs(
        'dosirak-store',
        [belief],
        {
          now: BASE,
        }
      )[0];

  assert(
    prediction
      .basis
      .evidence_ids
      .includes(
        'ev-provenance'
      ),
    'evidence id provenance 유지'
  );
}

console.log(
  '▸ TC-9: conflicting belief 반영'
);

{
  const ee =
    new EvidenceEngine();

  const be =
    new BeliefEngine();

  const yes =
    ee.collect({
      id: 'yes',
      subject:
        'call:001',
      source:
        'device',
      source_type:
        SOURCE_TYPES.DEVICE,
      claim:
        'is_phishing',
      observed_value:
        true,
      trust_score:
        0.8,
      collected_at:
        BASE.toISOString(),
      expires_at:
        '2026-09-04T01:00:00.000Z',
    });

  const no =
    ee.collect({
      id: 'no',
      subject:
        'call:001',
      source:
        'api',
      source_type:
        SOURCE_TYPES
          .PLATFORM_API,
      claim:
        'is_phishing',
      observed_value:
        false,
      trust_score:
        0.8,
      collected_at:
        BASE.toISOString(),
      expires_at:
        '2026-09-04T01:00:00.000Z',
    });

  const beliefs =
    be.update(
      [yes, no],
      {
        now: BASE,
      }
    );

  const prediction =
    new PredictionEngine()
      .predictBeliefs(
        'arkaon-call',
        beliefs,
        {
          now: BASE,
        }
      )[0];

  assert(
    prediction
      .basis
      .contradiction_score >
      0,
    'contradiction score 전달'
  );

  assert(
    prediction.confidence <=
      prediction
        .basis
        .belief_confidence,
    '충돌이 prediction confidence를 높이지 않음'
  );
}

console.log(
  '▸ TC-10: verified evidence provenance'
);

{
  const belief =
    makeBelief({
      sourceType:
        SOURCE_TYPES
          .INSTITUTION,
    });

  const prediction =
    new PredictionEngine()
      .predictBeliefs(
        'arkaon-call',
        [belief],
        {
          now: BASE,
        }
      )[0];

  assert(
    prediction
      .basis
      .verified_evidence_count ===
      1,
    'verified evidence count 유지'
  );
}

console.log(
  '▸ TC-11: AI inference는 verified로 승격되지 않음'
);

{
  const belief =
    makeBelief({
      sourceType:
        SOURCE_TYPES
          .AI_INFERENCE,
      trustScore:
        0.75,
    });

  const prediction =
    new PredictionEngine()
      .predictBeliefs(
        'arkaon-call',
        [belief],
        {
          now: BASE,
        }
      )[0];

  assert(
    prediction
      .basis
      .verified_evidence_count ===
      0,
    'AI belief는 verified count 0'
  );

  assert(
    prediction
      .basis
      .ai_evidence_count ===
      1,
    'AI evidence count 유지'
  );
}

console.log(
  '▸ TC-12: Prediction !== Authority'
);

{
  const belief =
    makeBelief({
      trustScore: 1,
    });

  const prediction =
    new PredictionEngine()
      .predictBeliefs(
        'arkaon-call',
        [belief],
        {
          now: BASE,
        }
      )[0];

  assert(
    prediction
      .authority_granted ===
      false,
    '높은 prediction이어도 authority 미부여'
  );
}

console.log(
  '▸ TC-13: 전체 predict pipeline'
);

{
  const worldState =
    makeWorldState();

  const belief =
    makeBelief();

  const engine =
    new PredictionEngine();

  const predictions =
    engine.predict(
      {
        platform_id:
          'dosirak-store',
        worldState,
        beliefs:
          [belief],
      },
      {
        now: BASE,
      }
    );

  assert(
    predictions.some(
      (item) =>
        item.type ===
        PREDICTION_TYPES
          .TREND
    ),
    'pipeline에 TREND 포함'
  );

  assert(
    predictions.some(
      (item) =>
        item.type ===
        PREDICTION_TYPES
          .BELIEF_PROJECTION
    ),
    'pipeline에 BELIEF_PROJECTION 포함'
  );
}

console.log(
  '▸ TC-14: deterministic rule'
);

{
  const engine =
    new PredictionEngine({
      rules: [
        {
          id:
            'high-orders',

          description:
            'Orders may exceed operational threshold',

          when:
            (context) =>
              context
                .worldState
                .current
                .orders >= 25,

          probability:
            0.88,

          impact_score:
            0.7,

          claim:
            'operational_pressure',

          predicted_state: {
            pressure:
              'high',
          },

          horizon_minutes:
            45,
        },
      ],
    });

  const predictions =
    engine.predict(
      {
        platform_id:
          'dosirak-store',

        worldState:
          makeWorldState(),

        beliefs: [],
      },
      {
        now: BASE,
      }
    );

  const rulePrediction =
    predictions.find(
      (item) =>
        item.type ===
        PREDICTION_TYPES.RULE
    );

  assert(
    rulePrediction !==
      undefined,
    'rule prediction 생성'
  );

  assert(
    rulePrediction
      .probability ===
      0.88,
    'rule probability 유지'
  );

  assert(
    rulePrediction
      .impact ===
      IMPACT_LEVELS.HIGH,
    'impact HIGH'
  );
}

console.log(
  '▸ TC-15: rule 불일치시 생성 안 함'
);

{
  const engine =
    new PredictionEngine({
      rules: [
        {
          id:
            'never',

          when:
            () => false,
        },
      ],
    });

  const predictions =
    engine.predictRules(
      {
        platform_id:
          'dosirak-store',
      },
      {
        now: BASE,
      }
    );

  assert(
    predictions.length === 0,
    '불일치 rule prediction 없음'
  );
}

console.log(
  '▸ TC-16: 외부 mutation 차단'
);

{
  const belief =
    makeBelief();

  const engine =
    new PredictionEngine();

  const prediction =
    engine.predictBeliefs(
      'arkaon-call',
      [belief],
      {
        now: BASE,
      }
    )[0];

  prediction
    .basis
    .evidence_ids
    .push(
      'evil'
    );

  const stored =
    engine.get(
      prediction.id
    );

  assert(
    !stored
      .basis
      .evidence_ids
      .includes(
        'evil'
      ),
    '반환 prediction mutation이 저장값 오염 안 함'
  );
}

console.log(
  '▸ TC-17: maxPredictions 제한'
);

{
  const engine =
    new PredictionEngine({
      maxPredictions: 2,
    });

  for (
    let i = 0;
    i < 3;
    i++
  ) {
    engine.predictRules(
      {
        platform_id:
          `p-${i}`,
      },
      {
        now:
          new Date(
            BASE.getTime() +
              i * 1000
          ),
      }
    );
  }

  /**
   * rules가 없어서 위 호출은
   * 저장을 만들지 않습니다.
   *
   * 별도 rule engine으로 확인.
   */
  const ruleEngine =
    new PredictionEngine({
      maxPredictions: 2,

      rules: [
        {
          id:
            'always',
          when:
            () => true,
        },
      ],
    });

  for (
    let i = 0;
    i < 3;
    i++
  ) {
    ruleEngine.predictRules(
      {
        platform_id:
          `p-${i}`,
      },
      {
        now:
          new Date(
            BASE.getTime() +
              i * 1000
          ),
      }
    );
  }

  assert(
    ruleEngine.list()
      .length === 2,
    'maxPredictions 초과 시 오래된 항목 제거'
  );
}

console.log(
  '▸ TC-18: rank'
);

{
  const engine =
    new PredictionEngine({
      rules: [
        {
          id: 'low',
          when:
            () => true,
          probability:
            0.3,
        },

        {
          id: 'high',
          when:
            () => true,
          probability:
            0.9,
        },
      ],
    });

  engine.predictRules(
    {
      platform_id:
        'p1',
    },
    {
      now: BASE,
    }
  );

  const ranked =
    engine.rank();

  assert(
    ranked.length === 2,
    'rank 결과 2개'
  );

  assert(
    ranked[0]
      .probability >=
      ranked[1]
        .probability,
    'probability 내림차순'
  );
}

console.log(
  '▸ TC-19: expiration'
);

{
  const engine =
    new PredictionEngine({
      rules: [
        {
          id:
            'expire',

          when:
            () => true,

          horizon_minutes:
            10,
        },
      ],
    });

  const prediction =
    engine.predictRules(
      {
        platform_id:
          'p1',
      },
      {
        now: BASE,
      }
    )[0];

  assert(
    engine.isExpired(
      prediction,
      new Date(
        BASE.getTime() +
          5 *
            60 *
            1000
      )
    ) === false,
    'horizon 전 미만료'
  );

  assert(
    engine.isExpired(
      prediction,
      new Date(
        BASE.getTime() +
          11 *
            60 *
            1000
      )
    ) === true,
    'horizon 후 만료'
  );
}

console.log(
  '▸ TC-20: invalid input 거부'
);

{
  const engine =
    new PredictionEngine();

  assertThrows(
    () =>
      engine.predict(
        {},
        {
          now: BASE,
        }
      ),
    'platform_id 없는 context 거부'
  );

  assertThrows(
    () =>
      engine.predictBeliefs(
        '',
        [],
        {
          now: BASE,
        }
      ),
    '빈 platformId 거부'
  );

  assertThrows(
    () =>
      engine.predictBeliefs(
        'p1',
        'bad',
        {
          now: BASE,
        }
      ),
    'beliefs 비배열 거부'
  );
}

console.log(
  '▸ Bonus: extractMetricSeries'
);

{
  const values =
    extractMetricSeries(
      makeWorldState(),
      'orders'
    );

  assert(
    values.length === 4,
    'orders history + current 4개 추출'
  );

  assert(
    values[0] === 10 &&
      values[3] === 25,
    'series 순서 정확'
  );
}

console.log(
  '▸ Bonus: analyzeSeries'
);

{
  const increasing =
    analyzeSeries(
      [1, 2, 3, 4]
    );

  const decreasing =
    analyzeSeries(
      [4, 3, 2, 1]
    );

  const stable =
    analyzeSeries(
      [3, 3, 3, 3]
    );

  assert(
    increasing.direction ===
      'INCREASING',
    '증가 분석'
  );

  assert(
    decreasing.direction ===
      'DECREASING',
    '감소 분석'
  );

  assert(
    stable.direction ===
      'STABLE',
    '안정 분석'
  );
}

console.log(
  '▸ Bonus: projectNextValue'
);

{
  assert(
    projectNextValue(
      [10, 15, 20]
    ) === 25,
    '평균 delta 기반 next value'
  );

  assert(
    projectNextValue(
      [10]
    ) === null,
    '데이터 부족 시 null'
  );
}

console.log(
  '▸ Bonus: impactLevel'
);

{
  assert(
    impactLevel(
      0.1
    ) ===
      IMPACT_LEVELS.LOW,
    'LOW impact'
  );

  assert(
    impactLevel(
      0.5
    ) ===
      IMPACT_LEVELS.MEDIUM,
    'MEDIUM impact'
  );

  assert(
    impactLevel(
      0.7
    ) ===
      IMPACT_LEVELS.HIGH,
    'HIGH impact'
  );

  assert(
    impactLevel(
      0.9
    ) ===
      IMPACT_LEVELS.CRITICAL,
    'CRITICAL impact'
  );
}

console.log(
  '▸ Bonus: clamp01'
);

{
  assert(
    clamp01(-1) === 0,
    '음수 clamp'
  );

  assert(
    clamp01(2) === 1,
    '1 초과 clamp'
  );

  assert(
    clamp01(0.5) ===
      0.5,
    '정상값 유지'
  );
}

console.log(
  '▸ Bonus: stableSerialize'
);

{
  const a =
    stableSerialize({
      b: 2,
      a: 1,
    });

  const b =
    stableSerialize({
      a: 1,
      b: 2,
    });

  assert(
    a === b,
    '객체 key 순서 무관'
  );
}

console.log(
  '▸ Bonus: get/list/remove/clear'
);

{
  const engine =
    new PredictionEngine({
      rules: [
        {
          id:
            'manage',

          when:
            () => true,
        },
      ],
    });

  const prediction =
    engine.predictRules(
      {
        platform_id:
          'p1',
      },
      {
        now: BASE,
      }
    )[0];

  assert(
    engine.get(
      prediction.id
    ) !== null,
    'get 동작'
  );

  assert(
    engine.list()
      .length === 1,
    'list 동작'
  );

  engine.remove(
    prediction.id
  );

  assert(
    engine.get(
      prediction.id
    ) === null,
    'remove 동작'
  );

  engine.predictRules(
    {
      platform_id:
        'p1',
    },
    {
      now:
        new Date(
          BASE.getTime() +
            1000
        ),
    }
  );

  engine.clear();

  assert(
    engine.list()
      .length === 0,
    'clear 동작'
  );
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(
  failed > 0
    ? 1
    : 0
);
