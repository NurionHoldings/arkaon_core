'use strict';

const {
  EvidenceEngine,
  SOURCE_TYPES,
  AI_INFERENCE_TRUST_CAP,
  containsRawBiometricMaterial,
} = require('../core/evidence-engine.cjs');

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

function assertThrows(fn, label) {
  try {
    fn();
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  } catch {
    passed++;
    console.log(`  ✅ ${label}`);
  }
}

console.log('\n═══ EvidenceEngine Tests ═══\n');

console.log('▸ TC-1: evidence 생성');
{
  const engine = new EvidenceEngine();

  const ev = engine.collect({
    subject: 'call:001',
    source: 'device',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'incoming_call',
    observed_value: true,
  });

  assert(typeof ev.id === 'string', 'id 생성');
  assert(ev.subject === 'call:001', 'subject 저장');
  assert(ev.claim === 'incoming_call', 'claim 저장');
}

console.log('▸ TC-2: 필수 필드 검증');
{
  const engine = new EvidenceEngine();

  assertThrows(
    () =>
      engine.collect({
        source_type: SOURCE_TYPES.DEVICE,
        claim: 'x',
        observed_value: true,
      }),
    'subject 누락 거부'
  );

  assertThrows(
    () =>
      engine.collect({
        subject: 'x',
        source_type: SOURCE_TYPES.DEVICE,
        observed_value: true,
      }),
    'claim 누락 거부'
  );
}

console.log('▸ TC-3: trust_score 범위');
{
  const engine = new EvidenceEngine();

  assertThrows(
    () =>
      engine.collect({
        subject: 'x',
        source_type: SOURCE_TYPES.DEVICE,
        claim: 'x',
        observed_value: true,
        trust_score: 1.1,
      }),
    '1 초과 trust_score 거부'
  );

  assertThrows(
    () =>
      engine.collect({
        subject: 'x',
        source_type: SOURCE_TYPES.DEVICE,
        claim: 'x',
        observed_value: true,
        trust_score: -0.1,
      }),
    '0 미만 trust_score 거부'
  );
}

console.log('▸ TC-4: 잘못된 source_type 거부');
{
  const engine = new EvidenceEngine();

  assertThrows(
    () =>
      engine.collect({
        subject: 'x',
        source_type: 'UNKNOWN',
        claim: 'x',
        observed_value: true,
      }),
    '알 수 없는 source_type 거부'
  );
}

console.log('▸ TC-5: expiration');
{
  const engine = new EvidenceEngine();

  const ev = engine.collect({
    subject: 'x',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'x',
    observed_value: true,
    collected_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T00:10:00.000Z',
  });

  assert(
    engine.isExpired(ev, new Date('2026-01-01T00:05:00.000Z')) === false,
    '만료 전 false'
  );

  assert(
    engine.isExpired(ev, new Date('2026-01-01T00:11:00.000Z')) === true,
    '만료 후 true'
  );
}

console.log('▸ TC-6: freshness');
{
  const engine = new EvidenceEngine();

  const ev = engine.collect({
    subject: 'x',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'x',
    observed_value: true,
    collected_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T01:00:00.000Z',
  });

  const fresh = engine.freshness(
    ev,
    new Date('2026-01-01T00:30:00.000Z')
  );

  assert(
    fresh > 0.49 && fresh < 0.51,
    '중간 시점 freshness 약 0.5'
  );
}

console.log('▸ TC-7: 동일 subject/claim 결합');
{
  const engine = new EvidenceEngine();

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
  });

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
  });

  const list = engine.findBySubjectClaim('call:1', 'trusted');

  assert(list.length === 2, '동일 subject/claim 2개 조회');
}

console.log('▸ TC-8: corroborating evidence');
{
  const engine = new EvidenceEngine();

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.8,
  });

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.PLATFORM_API,
    claim: 'trusted',
    observed_value: true,
    trust_score: 0.9,
  });

  const relation = engine.evaluateRelation('call:1', 'trusted');

  assert(relation.groups.length === 1, '동일 값 하나의 그룹');
  assert(relation.strongest.evidence.length === 2, '2개 증거 보강');
}

console.log('▸ TC-9: contradiction 감지');
{
  const engine = new EvidenceEngine();

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.USER_STATEMENT,
    claim: 'trusted',
    observed_value: true,
  });

  engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'trusted',
    observed_value: false,
  });

  const relation = engine.evaluateRelation('call:1', 'trusted');

  assert(relation.has_contradiction === true, '충돌 감지');
  assert(relation.groups.length === 2, '상반된 값 2개 그룹');
}

console.log('▸ TC-10: provenance 보존');
{
  const engine = new EvidenceEngine();

  const ev = engine.collect({
    subject: 'x',
    source_type: SOURCE_TYPES.PLATFORM_API,
    source: 'MJN',
    claim: 'payment_status',
    observed_value: 'paid',
    provenance: {
      endpoint: '/payments/1',
      request_id: 'req-1',
    },
  });

  assert(ev.provenance.endpoint === '/payments/1', 'endpoint 보존');
  assert(ev.provenance.request_id === 'req-1', 'request_id 보존');
}

console.log('▸ TC-11: 외부 객체 mutation 차단');
{
  const engine = new EvidenceEngine();

  const metadata = { nested: { value: 1 } };

  const ev = engine.collect({
    subject: 'x',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'x',
    observed_value: true,
    metadata,
  });

  metadata.nested.value = 999;

  const stored = engine.get(ev.id);

  assert(
    stored.metadata.nested.value === 1,
    '입력 객체 변경이 저장값을 오염시키지 않음'
  );

  stored.metadata.nested.value = 888;

  const storedAgain = engine.get(ev.id);

  assert(
    storedAgain.metadata.nested.value === 1,
    '반환 객체 변경도 저장값에 영향 없음'
  );
}

console.log('▸ TC-12: AI inference와 verified source 구분');
{
  const engine = new EvidenceEngine();

  const ai = engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.AI_INFERENCE,
    claim: 'phishing',
    observed_value: true,
    trust_score: 0.99,
  });

  const institution = engine.collect({
    subject: 'call:1',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'phishing',
    observed_value: true,
  });

  assert(
    ai.trust_score <= AI_INFERENCE_TRUST_CAP,
    'AI inference trust 상한 적용'
  );

  assert(ai.verified_source === false, 'AI inference는 verified source 아님');

  assert(
    institution.verified_source === true,
    'INSTITUTION은 verified source'
  );
}

console.log('▸ TC-13: raw biometric 저장 금지');
{
  const engine = new EvidenceEngine();

  assertThrows(
    () =>
      engine.collect({
        subject: 'identity:1',
        source_type: SOURCE_TYPES.BIOMETRIC_ASSERTION,
        claim: 'device_user_present',
        observed_value: true,
        metadata: {
          fingerprint_template: 'FORBIDDEN',
        },
      }),
    'fingerprint template 거부'
  );

  assertThrows(
    () =>
      engine.collect({
        subject: 'identity:1',
        source_type: SOURCE_TYPES.BIOMETRIC_ASSERTION,
        claim: 'device_user_present',
        observed_value: true,
        metadata: {
          nested: {
            face_embedding: [0.1, 0.2],
          },
        },
      }),
    '중첩 face embedding 거부'
  );
}

console.log('▸ TC-14: biometric assertion은 boolean만 허용');
{
  const engine = new EvidenceEngine();

  assertThrows(
    () =>
      engine.collect({
        subject: 'identity:1',
        source_type: SOURCE_TYPES.BIOMETRIC_ASSERTION,
        claim: 'device_user_present',
        observed_value: 'yes',
      }),
    '문자열 biometric assertion 거부'
  );

  const ev = engine.collect({
    subject: 'identity:1',
    source_type: SOURCE_TYPES.BIOMETRIC_ASSERTION,
    claim: 'device_user_present',
    observed_value: true,
  });

  assert(ev.observed_value === true, 'boolean assertion 허용');
}

console.log('▸ TC-15: minimal disclosure review');
{
  const engine = new EvidenceEngine();

  const ev = engine.collect({
    subject: 'identity:1',
    source_type: SOURCE_TYPES.IDENTITY_PROVIDER,
    claim: 'age_over_19',
    observed_value: true,
  });

  const allowed = engine.reviewDisclosure(ev, ['age_over_19']);

  assert(allowed.allowed === true, '허용 claim 통과');
  assert(
    allowed.minimal_disclosure_required === false,
    '허용 claim은 추가 최소공개 검토 불필요'
  );

  const denied = engine.reviewDisclosure(ev, ['real_name_verified']);

  assert(denied.allowed === false, '비허용 claim 차단');
  assert(
    denied.minimal_disclosure_required === true,
    '비허용 claim은 최소공개 검토 필요'
  );
}

console.log('▸ Bonus: containsRawBiometricMaterial');
{
  assert(
    containsRawBiometricMaterial({
      a: {
        b: {
          fingerprint_template: 'x',
        },
      },
    }) === true,
    '깊은 중첩 raw biometric 탐지'
  );

  assert(
    containsRawBiometricMaterial({
      authenticator: 'OS_BIOMETRIC',
      success: true,
    }) === false,
    'OS biometric assertion metadata는 허용'
  );
}

console.log('▸ Bonus: 기본 trust score');
{
  const engine = new EvidenceEngine();

  const institution = engine.collect({
    subject: 'x',
    source_type: SOURCE_TYPES.INSTITUTION,
    claim: 'x',
    observed_value: true,
  });

  const ai = engine.collect({
    subject: 'x2',
    source_type: SOURCE_TYPES.AI_INFERENCE,
    claim: 'x',
    observed_value: true,
  });

  assert(
    institution.trust_score > ai.trust_score,
    '기관 기본 신뢰도가 AI 추론보다 높음'
  );
}

console.log('▸ Bonus: get/list/remove/clear');
{
  const engine = new EvidenceEngine();

  const a = engine.collect({
    subject: 'a',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'x',
    observed_value: true,
  });

  const b = engine.collect({
    subject: 'b',
    source_type: SOURCE_TYPES.DEVICE,
    claim: 'y',
    observed_value: false,
  });

  assert(engine.get(a.id) !== null, 'get 동작');
  assert(engine.list().length === 2, 'list 동작');

  engine.remove(a.id);

  assert(engine.get(a.id) === null, 'remove 동작');
  assert(engine.list().length === 1, 'remove 후 list 반영');

  engine.clear();

  assert(engine.list().length === 0, 'clear 동작');
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
