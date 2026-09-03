'use strict';

const {
  EvidenceEngine,
  SOURCE_TYPES,
} = require(
  '../core/evidence-engine.cjs'
);

const {
  BeliefEngine,
  AI_SUPPORT_CAP,
  clamp01,
  stableSerialize,
  aggregateIndependent,
  applyTemporalDecay,
} = require(
  '../core/belief-engine.cjs'
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
  '\n═══ BeliefEngine Tests ═══\n'
);

/**
 * 고정된 기준시간
 */
const BASE =
  new Date(
    '2026-09-04T00:00:00.000Z'
  );

function makeEvidence(
  overrides = {}
) {
  const engine =
    new EvidenceEngine({
      defaultTtlMs:
        60 * 60 * 1000,
    });

  return engine.collect({
    subject:
      'call:001',

    source:
      'test',

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
      new Date(
        BASE.getTime() +
          60 *
            60 *
            1000
      ).toISOString(),

    ...overrides,
  });
}

console.log(
  '▸ TC-1: Evidence[] → Belief 생성'
);

{
  const evidence =
    makeEvidence();

  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [evidence],
      { now: BASE }
    );

  assert(
    beliefs.length === 1,
    'belief 1개 생성'
  );

  assert(
    beliefs[0].subject ===
      'call:001',
    'subject 유지'
  );

  assert(
    beliefs[0].claim ===
      'is_phishing',
    'claim 유지'
  );

  assert(
    beliefs[0]
      .observed_value ===
      true,
    'observed_value 유지'
  );
}

console.log(
  '▸ TC-2: subject + claim 통합'
);

{
  const a =
    makeEvidence({
      id: 'ev-a',
      trust_score: 0.7,
    });

  const b =
    makeEvidence({
      id: 'ev-b',
      source_type:
        SOURCE_TYPES
          .PLATFORM_API,
      trust_score: 0.8,
    });

  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [a, b],
      { now: BASE }
    );

  assert(
    beliefs.length === 1,
    '동일 subject/claim/value는 belief 하나'
  );

  assert(
    beliefs[0]
      .evidence_count ===
      2,
    'evidence 2개 통합'
  );
}

console.log(
  '▸ TC-3: corroboration confidence 상승'
);

{
  const singleEngine =
    new BeliefEngine();

  const one =
    singleEngine.update(
      [
        makeEvidence({
          id: 'single',
          trust_score: 0.6,
        }),
      ],
      { now: BASE }
    )[0];

  const multiEngine =
    new BeliefEngine();

  const multiple =
    multiEngine.update(
      [
        makeEvidence({
          id: 'a',
          trust_score: 0.6,
        }),

        makeEvidence({
          id: 'b',
          source_type:
            SOURCE_TYPES
              .PLATFORM_API,
          trust_score: 0.7,
        }),
      ],
      { now: BASE }
    )[0];

  assert(
    multiple.confidence >
      one.confidence,
    '보강 evidence가 confidence 상승'
  );
}

console.log(
  '▸ TC-4: contradiction 경쟁 belief 생성'
);

{
  const yes =
    makeEvidence({
      id: 'yes',
      observed_value:
        true,
      trust_score: 0.8,
    });

  const no =
    makeEvidence({
      id: 'no',
      observed_value:
        false,
      source_type:
        SOURCE_TYPES
          .PLATFORM_API,
      trust_score: 0.8,
    });

  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [yes, no],
      { now: BASE }
    );

  assert(
    beliefs.length === 2,
    '상충 observed_value는 belief 2개 생성'
  );

  assert(
    beliefs.every(
      (b) =>
        b.contradiction_score >
        0
    ),
    '두 belief 모두 contradiction 인식'
  );
}

console.log(
  '▸ TC-5: contradiction confidence 감소'
);

{
  const noConflict =
    new BeliefEngine()
      .update(
        [
          makeEvidence({
            id: 'a',
            trust_score:
              0.8,
          }),
        ],
        { now: BASE }
      )[0];

  const conflicting =
    new BeliefEngine()
      .update(
        [
          makeEvidence({
            id: 'a',
            trust_score:
              0.8,
          }),

          makeEvidence({
            id: 'b',
            observed_value:
              false,
            trust_score:
              0.8,
          }),
        ],
        { now: BASE }
      )
      .find(
        (b) =>
          b.observed_value ===
          true
      );

  assert(
    conflicting.confidence <
      noConflict.confidence,
    '상충 evidence가 confidence 감소'
  );
}

console.log(
  '▸ TC-6: expired evidence 제외'
);

{
  const expired =
    makeEvidence({
      id: 'expired',
      expires_at:
        '2026-09-03T23:59:00.000Z',
    });

  const active =
    makeEvidence({
      id: 'active',
      expires_at:
        '2026-09-04T01:00:00.000Z',
    });

  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [
        expired,
        active,
      ],
      { now: BASE }
    );

  assert(
    beliefs.length === 1,
    'expired evidence 제외 후 belief 생성'
  );

  assert(
    beliefs[0]
      .evidence_ids
      .includes(
        'active'
      ),
    'active evidence 포함'
  );

  assert(
    !beliefs[0]
      .evidence_ids
      .includes(
        'expired'
      ),
    'expired evidence 미포함'
  );
}

console.log(
  '▸ TC-7: freshness 반영'
);

{
  const fresh =
    makeEvidence({
      id: 'fresh',
      collected_at:
        '2026-09-04T00:00:00.000Z',
      expires_at:
        '2026-09-04T01:00:00.000Z',
    });

  const stale =
    makeEvidence({
      id: 'stale',
      collected_at:
        '2026-09-03T23:00:00.000Z',
      expires_at:
        '2026-09-04T00:10:00.000Z',
    });

  const now =
    new Date(
      '2026-09-04T00:05:00.000Z'
    );

  const freshBelief =
    new BeliefEngine()
      .update(
        [fresh],
        { now }
      )[0];

  const staleBelief =
    new BeliefEngine()
      .update(
        [stale],
        { now }
      )[0];

  assert(
    freshBelief.confidence >
      staleBelief.confidence,
    '더 신선한 evidence가 높은 confidence'
  );
}

console.log(
  '▸ TC-8: verified source 가중치 유지'
);

{
  const institution =
    makeEvidence({
      id: 'institution',
      source_type:
        SOURCE_TYPES
          .INSTITUTION,
      trust_score: 0.95,
    });

  const user =
    makeEvidence({
      id: 'user',
      source_type:
        SOURCE_TYPES
          .USER_STATEMENT,
      trust_score: 0.95,
    });

  const verifiedBelief =
    new BeliefEngine()
      .update(
        [institution],
        { now: BASE }
      )[0];

  const userBelief =
    new BeliefEngine()
      .update(
        [user],
        { now: BASE }
      )[0];

  assert(
    verifiedBelief
      .confidence >
      userBelief
        .confidence,
    '동일 trust라도 verified source 영향이 더 큼'
  );

  assert(
    verifiedBelief
      .verified_evidence_count ===
      1,
    'verified evidence count 기록'
  );
}

console.log(
  '▸ TC-9: 다수 AI inference가 verified evidence를 압도하지 않음'
);

{
  const institution =
    makeEvidence({
      id: 'verified',
      source_type:
        SOURCE_TYPES
          .INSTITUTION,
      observed_value:
        false,
      trust_score: 0.95,
    });

  const aiEvidence = [];

  for (
    let i = 0;
    i < 20;
    i++
  ) {
    aiEvidence.push(
      makeEvidence({
        id: `ai-${i}`,
        source_type:
          SOURCE_TYPES
            .AI_INFERENCE,
        observed_value:
          true,
        trust_score:
          0.75,
      })
    );
  }

  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [
        institution,
        ...aiEvidence,
      ],
      { now: BASE }
    );

  const verified =
    beliefs.find(
      (b) =>
        b.observed_value ===
        false
    );

  const ai =
    beliefs.find(
      (b) =>
        b.observed_value ===
        true
    );

  assert(
    ai.support_components.ai <=
      AI_SUPPORT_CAP,
    'AI aggregate contribution cap 적용'
  );

  assert(
    verified.confidence >
      ai.confidence,
    'verified belief가 다수 AI belief보다 강함'
  );
}

console.log(
  '▸ TC-10: 시간 decay'
);

{
  const engine =
    new BeliefEngine({
      halfLifeMs:
        60 *
        60 *
        1000,
    });

  const belief =
    engine.update(
      [
        makeEvidence({
          id: 'decay',
        }),
      ],
      { now: BASE }
    )[0];

  const afterHalfLife =
    engine.decay(
      belief.id,
      new Date(
        BASE.getTime() +
          60 *
            60 *
            1000
      )
    );

  assert(
    afterHalfLife
      .effective_confidence <
      belief.confidence,
    '시간 경과 후 confidence 감소'
  );

  const ratio =
    afterHalfLife
      .effective_confidence /
    belief.confidence;

  assert(
    ratio > 0.49 &&
      ratio < 0.51,
    'half-life 후 약 50% confidence'
  );
}

console.log(
  '▸ TC-11: evidence_ids provenance 유지'
);

{
  const a =
    makeEvidence({
      id: 'provenance-a',
    });

  const b =
    makeEvidence({
      id: 'provenance-b',
    });

  const belief =
    new BeliefEngine()
      .update(
        [a, b],
        { now: BASE }
      )[0];

  assert(
    belief.evidence_ids
      .includes(
        'provenance-a'
      ),
    '첫 번째 evidence id 보존'
  );

  assert(
    belief.evidence_ids
      .includes(
        'provenance-b'
      ),
    '두 번째 evidence id 보존'
  );
}

console.log(
  '▸ TC-12: confidence 0~1'
);

{
  const engine =
    new BeliefEngine();

  const beliefs =
    engine.update(
      [
        makeEvidence({
          id: 'x1',
          trust_score: 1,
        }),

        makeEvidence({
          id: 'x2',
          source_type:
            SOURCE_TYPES
              .PLATFORM_API,
          trust_score: 1,
        }),

        makeEvidence({
          id: 'x3',
          source_type:
            SOURCE_TYPES
              .INSTITUTION,
          trust_score: 1,
        }),
      ],
      { now: BASE }
    );

  assert(
    beliefs.every(
      (b) =>
        b.confidence >= 0 &&
        b.confidence <= 1
    ),
    '모든 confidence가 0~1'
  );
}

console.log(
  '▸ TC-13: rank()'
);

{
  const strong =
    makeEvidence({
      id: 'strong',
      subject: 'a',
      trust_score: 0.95,
      source_type:
        SOURCE_TYPES
          .INSTITUTION,
    });

  const weak =
    makeEvidence({
      id: 'weak',
      subject: 'b',
      trust_score: 0.3,
    });

  const engine =
    new BeliefEngine();

  engine.update(
    [strong, weak],
    { now: BASE }
  );

  const ranked =
    engine.rank();

  assert(
    ranked.length === 2,
    'rank 결과 2개'
  );

  assert(
    ranked[0].confidence >=
      ranked[1].confidence,
    'confidence 내림차순'
  );
}

console.log(
  '▸ TC-14: 외부 mutation 차단'
);

{
  const evidence =
    makeEvidence({
      id: 'mutation',
      observed_value: {
        risk: 'high',
      },
    });

  const engine =
    new BeliefEngine();

  const belief =
    engine.update(
      [evidence],
      { now: BASE }
    )[0];

  belief.observed_value.risk =
    'low';

  belief.evidence_ids.push(
    'evil'
  );

  const stored =
    engine.get(
      belief.id
    );

  assert(
    stored
      .observed_value
      .risk ===
      'high',
    '반환 belief 수정이 내부 observed_value 오염 안 함'
  );

  assert(
    !stored
      .evidence_ids
      .includes('evil'),
    '반환 evidence_ids 수정도 내부 상태 오염 안 함'
  );
}

console.log(
  '▸ TC-15: Confidence !== Authority'
);

{
  const evidence =
    makeEvidence({
      id: 'authority-test',
      source_type:
        SOURCE_TYPES
          .INSTITUTION,
      trust_score: 1,
    });

  const belief =
    new BeliefEngine()
      .update(
        [evidence],
        { now: BASE }
      )[0];

  assert(
    belief.confidence >
      0.9,
    '매우 높은 confidence 생성 가능'
  );

  assert(
    belief
      .authority_granted ===
      false,
    '높은 confidence여도 authority 미부여'
  );
}

console.log(
  '▸ TC-16: invalid evidence 거부'
);

{
  const engine =
    new BeliefEngine();

  assertThrows(
    () =>
      engine.update(
        [{}],
        { now: BASE }
      ),
    '필수 evidence 필드 없는 객체 거부'
  );

  assertThrows(
    () =>
      engine.update(
        'not-array',
        { now: BASE }
      ),
    'evidenceList 비배열 거부'
  );
}

console.log(
  '▸ TC-17: get/list/remove/clear'
);

{
  const engine =
    new BeliefEngine();

  const belief =
    engine.update(
      [
        makeEvidence({
          id: 'manage',
        }),
      ],
      { now: BASE }
    )[0];

  assert(
    engine.get(
      belief.id
    ) !== null,
    'get 동작'
  );

  assert(
    engine.list()
      .length === 1,
    'list 동작'
  );

  engine.remove(
    belief.id
  );

  assert(
    engine.get(
      belief.id
    ) === null,
    'remove 동작'
  );

  engine.update(
    [
      makeEvidence({
        id: 'manage-2',
      }),
    ],
    { now: BASE }
  );

  engine.clear();

  assert(
    engine.list()
      .length === 0,
    'clear 동작'
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
    clamp01(0.4) ===
      0.4,
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
    '객체 key 순서와 무관한 serialization'
  );
}

console.log(
  '▸ Bonus: aggregateIndependent'
);

{
  const single =
    aggregateIndependent(
      [0.5]
    );

  const multiple =
    aggregateIndependent(
      [0.5, 0.5]
    );

  assert(
    multiple > single,
    '독립 보강 evidence aggregation'
  );

  assert(
    multiple < 1,
    'aggregation은 1 미만'
  );
}

console.log(
  '▸ Bonus: applyTemporalDecay'
);

{
  const initial = 0.8;

  const decayed =
    applyTemporalDecay(
      initial,
      BASE.toISOString(),
      new Date(
        BASE.getTime() +
          60 *
            60 *
            1000
      ),
      60 *
        60 *
        1000
    );

  assert(
    decayed > 0.39 &&
      decayed < 0.41,
    'half-life decay 정확'
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
