'use strict';

const { EvidenceEngine, SOURCE_TYPES } = require('../core/evidence-engine.cjs');
const { BeliefEngine } = require('../core/belief-engine.cjs');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  }
}

function makeEngine() {
  return {
    evidence: new EvidenceEngine(),
    belief: new BeliefEngine(),
  };
}

function collectAt(ee, input, collectedAt, expiresAt) {
  return ee.collect({
    ...input,
    collected_at: collectedAt,
    expires_at: expiresAt,
  });
}

console.log('\n═══ BeliefEngine Tests ═══\n');

console.log('▸ TC-1: Evidence[] → Belief 생성');
{
  const { evidence, belief } = makeEngine();
  const ev = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });

  const beliefs = belief.form([ev]);

  assert(beliefs.length === 1, 'belief 1개 생성');
  assert(beliefs[0].id.startsWith('blf_'), 'id 접두사 blf_');
  assert(beliefs[0].update_method === 'weighted_evidence_update', '베이지안이 아닌 weighted update');
}

console.log('▸ TC-2: subject + claim 단위 통합');
{
  const { evidence, belief } = makeEngine();
  const a = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });
  const b = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
  });
  const c = evidence.collect({
    subject: 'call:2',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });

  belief.form([a, b, c]);

  assert(
    belief.findBySubjectClaim('call:1', 'trusted').length === 1,
    '동일 subject+claim+value는 하나의 belief'
  );
  assert(
    belief.findBySubjectClaim('call:2', 'trusted').length === 1,
    '다른 subject는 별도 belief'
  );
}

console.log('▸ TC-3: 동일 observed_value 보강 시 confidence 상승');
{
  const { evidence, belief } = makeEngine();
  const a = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.8,
  });

  belief.form([a]);
  const before = belief.findBySubjectClaim('call:1', 'trusted')[0].confidence;

  const b = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.9,
  });

  belief.update([b]);
  const after = belief.findBySubjectClaim('call:1', 'trusted')[0].confidence;

  assert(after > before, '보강 후 confidence 상승');
}

console.log('▸ TC-4: 상충 evidence → confidence 감소 + 경쟁 belief');
{
  const { evidence, belief } = makeEngine();
  const a = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.8,
  });

  belief.form([a]);
  const before = belief.findBySubjectClaim('call:1', 'trusted')[0].confidence;

  const b = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.USER_STATEMENT,
    claim: 'trusted',
    observed_value: false,
    trust_score: 0.7,
  });

  belief.update([b]);
  const rows = belief.findBySubjectClaim('call:1', 'trusted');
  const original = rows.find((x) => x.observed_value === true);

  assert(rows.length === 2, '경쟁 belief 생성');
  assert(original.competing === true, 'competing 표시');
  assert(original.confidence < before, '상충 후 기존 confidence 감소');
}

console.log('▸ TC-5: expired evidence 제외');
{
  const { evidence, belief } = makeEngine();
  const now = new Date('2026-01-01T01:00:00.000Z');

  const live = collectAt(
    evidence,
    {
      subject: 'call:1',
      source_type: SOURCE_TYPES.DEVICE,
      claim: 'trusted',
      observed_value: true,
    },
    '2026-01-01T00:50:00.000Z',
    '2026-01-01T02:00:00.000Z'
  );

  const expired = collectAt(
    evidence,
    {
      subject: 'call:1',
      source_type: SOURCE_TYPES.PLATFORM_API,
      claim: 'trusted',
      observed_value: false,
    },
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:10:00.000Z'
  );

  const beliefs = belief.form([live, expired], now);

  assert(beliefs.length === 1, '만료 증거는 belief를 만들지 않음');
  assert(beliefs[0].observed_value === true, '유효 증거만 반영');
  assert(
    beliefs[0].evidence_ids.includes(expired.id) === false,
    '만료 evidence_id 제외'
  );
}

console.log('▸ TC-6: freshness 반영');
{
  const { evidence, belief } = makeEngine();
  const now = new Date('2026-01-01T00:50:00.000Z');

  const staleTrue = collectAt(
    evidence,
    {
      subject: 'call:1',
      source_type: SOURCE_TYPES.DEVICE,
      claim: 'trusted',
      observed_value: true,
      trust_score: 0.9,
    },
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T01:00:00.000Z'
  );

  const freshFalse = collectAt(
    evidence,
    {
      subject: 'call:1',
      source_type: SOURCE_TYPES.DEVICE,
      claim: 'trusted',
      observed_value: false,
      trust_score: 0.9,
    },
    '2026-01-01T00:40:00.000Z',
    '2026-01-01T01:40:00.000Z'
  );

  belief.form([staleTrue, freshFalse], now);
  const ranked = belief.rank();

  assert(ranked[0].observed_value === false, '더 신선한 증거가 더 높은 belief');
}

console.log('▸ TC-7: verified source 가중치 유지');
{
  const { evidence, belief } = makeEngine();
  const user = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.USER_STATEMENT,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.9,
  });
  const institution = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'trusted',
    observed_value: false,
    trust_score: 0.9,
  });

  belief.form([user, institution]);
  const ranked = belief.rank();

  assert(ranked[0].observed_value === false, 'verified source 쪽이 더 높음');
  assert(ranked[0].verified_evidence_count >= 1, 'verified_evidence_count 기록');
}

console.log('▸ TC-8: AI_INFERENCE가 verified evidence를 압도하지 못함');
{
  const { evidence, belief } = makeEngine();
  const aiItems = [];

  for (let i = 0; i < 12; i++) {
    aiItems.push(
      evidence.collect({
        subject: 'call:1',
        source_type: SOURCE_TYPES.AI_INFERENCE,
        claim: 'phishing',
        observed_value: true,
        trust_score: 0.99,
      })
    );
  }

  const institution = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'phishing',
    observed_value: false,
    trust_score: 0.9,
  });

  belief.form([...aiItems, institution]);
  const ranked = belief.rank(
    belief.findBySubjectClaim('call:1', 'phishing')
  );

  assert(ranked[0].observed_value === false, '기관 검증이 AI 다수결을 이김');
  assert(ranked[0].verified_evidence_count >= 1, '1위 belief에 verified 증거 포함');
}

console.log('▸ TC-9: 시간 경과 belief decay');
{
  const belief = new BeliefEngine({ halfLifeMs: 60 * 60 * 1000 });
  const ee = new EvidenceEngine();
  const ev = ee.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });

  const t0 = new Date('2026-01-01T00:00:00.000Z');
  belief.form([ev], t0);
  const before = belief.list()[0].confidence;

  const t1 = new Date('2026-01-01T01:00:00.000Z');
  belief.decay(t1);
  const after = belief.list()[0].confidence;

  assert(after < before, '반감기 경과 후 confidence 감소');
  assert(Math.abs(after - before * 0.5) < 0.0001, '1 half-life에서 약 절반');
}

console.log('▸ TC-10: evidence_ids provenance 유지');
{
  const { evidence, belief } = makeEngine();
  const a = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });
  const b = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
  });

  belief.form([a, b]);
  const row = belief.list()[0];

  assert(row.evidence_ids.includes(a.id), '첫 evidence id 보존');
  assert(row.evidence_ids.includes(b.id), '둘째 evidence id 보존');
  assert(row.evidence_ids.length === 2, 'evidence_ids 길이 2');
}

console.log('▸ TC-11: confidence 0~1 강제');
{
  const { evidence, belief } = makeEngine();
  const items = [];
  for (let i = 0; i < 8; i++) {
    items.push(
      evidence.collect({
        subject: 'call:1',
        source_type: SOURCE_TYPES.INSTITUTION,
        claim: 'trusted',
        observed_value: true,
        trust_score: 1,
      })
    );
  }

  const rows = belief.form(items);
  assert(
    rows.every((b) => b.confidence >= 0 && b.confidence <= 1),
    '모든 confidence가 0~1'
  );
}

console.log('▸ TC-12: rank() 지원');
{
  const { evidence, belief } = makeEngine();
  const weak = evidence.collect({
    subject: 'a',
    source_type: SOURCE_TYPES.USER_STATEMENT,
    claim: 'x',
    observed_value: true,
    trust_score: 0.4,
  });
  const strong = evidence.collect({
    subject: 'b',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'y',
    observed_value: true,
    trust_score: 0.95,
  });

  belief.form([weak, strong]);
  const ranked = belief.rank();

  assert(ranked.length === 2, 'rank 결과 2개');
  assert(ranked[0].confidence >= ranked[1].confidence, '내림차순');
  assert(ranked[0].subject === 'b', '강한 belief가 1위');
}

console.log('▸ TC-13: 외부 mutation 차단');
{
  const { evidence, belief } = makeEngine();
  const ev = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: { ok: true },
  });

  const rows = belief.form([ev]);
  rows[0].confidence = 0;
  rows[0].evidence_ids.push('tampered');
  rows[0].observed_value.ok = false;

  const stored = belief.get(rows[0].id);

  assert(stored.confidence !== 0, '반환 confidence 변경이 저장값을 오염시키지 않음');
  assert(stored.evidence_ids.includes('tampered') === false, 'evidence_ids 격리');
  assert(stored.observed_value.ok === true, 'observed_value 격리');
}

console.log('▸ TC-14: Confidence ≠ Authority');
{
  const { evidence, belief } = makeEngine();
  const ev = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'execute_refund',
    observed_value: true,
    trust_score: 0.99,
  });

  const [row] = belief.form([ev]);

  assert(row.confidence > 0.4, '높은 confidence 가능');
  assert(row.grants_authority === false, 'confidence가 실행권한을 주지 않음');
  assert(row.authority === null, 'authority는 별도 계층');
}

console.log('▸ Bonus: update 시 belief id 안정');
{
  const { evidence, belief } = makeEngine();
  const a = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });
  belief.form([a]);
  const id = belief.list()[0].id;

  const b = evidence.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
  });
  belief.update([b]);

  assert(belief.list()[0].id === id, '같은 group의 belief id 유지');
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
