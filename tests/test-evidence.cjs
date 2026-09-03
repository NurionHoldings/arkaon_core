'use strict';

/**
 * EvidenceEngine 단위 테스트
 * ────────────────────────────────────────────────
 * 완료 조건 15개를 각각 검증합니다.
 *
 *  01. evidence 생성
 *  02. 필수 필드 검증
 *  03. trust_score 0~1 범위 강제
 *  04. 잘못된 source_type 거부
 *  05. expiration 처리
 *  06. freshness 계산
 *  07. 동일 subject/claim 증거 결합
 *  08. corroborating evidence 신뢰도 반영
 *  09. contradicting evidence 표시
 *  10. provenance 보존
 *  11. 외부 객체 mutation 차단
 *  12. AI inference와 verified source 구분
 *  13. biometric assertion에는 raw biometric data 저장 금지
 *  14. 최소 공개 원칙 위반 데이터 감지 기반 마련
 *  15. 모든 테스트 PASS
 * ────────────────────────────────────────────────
 */

const {
  EvidenceEngine,
  normalizeEvidence,
  containsBiometricRaw,
} = require('../core/evidence-engine.cjs');
const { SOURCE_TYPE } = require('../core/constants.cjs');

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

function throws(fn, label) {
  try { fn(); assert(false, label + ' (should have thrown)'); }
  catch { assert(true, label); }
}

// ─────────────────────────────────────────────

console.log('\n═══ EvidenceEngine Tests ═══\n');

// ── 01. evidence 생성 ───────────────────────
console.log('▸ TC-01: evidence 생성');
{
  const engine = new EvidenceEngine();
  const ev = engine.collect({
    source: 'dosirak-api',
    source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'order_count',
    observed_value: 42,
    trust_score: 0.9,
    subject: 'dosirak-store',
  });
  assert(ev.id.startsWith('ev_'), 'id가 ev_ 접두사');
  assert(ev.source === 'dosirak-api', 'source 보존');
  assert(ev.observed_value === 42, 'observed_value 보존');
  assert(ev.collected_at !== undefined, 'collected_at 생성');
}

// ── 02. 필수 필드 검증 ──────────────────────
console.log('▸ TC-02: 필수 필드 검증');
{
  throws(() => normalizeEvidence({}), 'source 누락 시 거부');
  throws(() => normalizeEvidence({ source: 'x' }), 'source_type 누락 시 거부');
  throws(() => normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE
  }), 'claim 누락 시 거부');
  throws(() => normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE, claim: 'c'
  }), 'observed_value 누락 시 거부');
  throws(() => normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE, claim: 'c',
    observed_value: true,
  }), 'trust_score 누락 시 거부');
}

// ── 03. trust_score 0~1 범위 강제 ───────────
console.log('▸ TC-03: trust_score 0~1 범위 강제');
{
  throws(() => normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c', observed_value: 1, trust_score: 1.5,
  }), 'trust_score > 1.0 거부');

  throws(() => normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c', observed_value: 1, trust_score: -0.1,
  }), 'trust_score < 0.0 거부');

  const ev = normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c', observed_value: 1, trust_score: 0.555,
  });
  assert(ev.trust_score === 0.555, 'trust_score 0.555 허용');

  const evZero = normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c', observed_value: 1, trust_score: 0,
  });
  assert(evZero.trust_score === 0, 'trust_score 0 허용');

  const evOne = normalizeEvidence({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c', observed_value: 1, trust_score: 1,
  });
  assert(evOne.trust_score === 1, 'trust_score 1 허용');
}

// ── 04. 잘못된 source_type 거부 ─────────────
console.log('▸ TC-04: 잘못된 source_type 거부');
{
  throws(() => normalizeEvidence({
    source: 'x', source_type: 'MAGIC_ORACLE',
    claim: 'c', observed_value: 1, trust_score: 0.5,
  }), 'MAGIC_ORACLE 거부');

  throws(() => normalizeEvidence({
    source: 'x', source_type: '',
    claim: 'c', observed_value: 1, trust_score: 0.5,
  }), '빈 문자열 거부');
}

// ── 05. expiration 처리 ─────────────────────
console.log('▸ TC-05: expiration 처리');
{
  const engine = new EvidenceEngine();
  const past = new Date(Date.now() - 60000).toISOString(); // 1분 전
  const future = new Date(Date.now() + 3600000).toISOString(); // 1시간 후

  engine.collect({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'expired_claim', observed_value: true, trust_score: 0.8,
    subject: 'test', expires_at: past,
  });
  engine.collect({
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'valid_claim', observed_value: true, trust_score: 0.8,
    subject: 'test', expires_at: future,
  });

  const purged = engine.purgeExpired();
  assert(purged === 1, '만료된 증거 1건 제거');

  const remaining = engine.list({ excludeExpired: true });
  assert(remaining.length === 1, '유효한 증거 1건만 남음');
  assert(remaining[0].claim === 'valid_claim', '유효한 claim 확인');
}

// ── 06. freshness 계산 ──────────────────────
console.log('▸ TC-06: freshness 계산');
{
  const engine = new EvidenceEngine();
  const ev = engine.collect({
    source: 'x', source_type: SOURCE_TYPE.SENSOR,
    claim: 'temperature', observed_value: 23.5, trust_score: 0.95,
    subject: 'office',
  });
  assert(typeof ev.freshness === 'number', 'freshness는 number');
  assert(ev.freshness >= 0, 'freshness >= 0');
}

// ── 07. 동일 subject/claim 증거 결합 ────────
console.log('▸ TC-07: 동일 subject/claim 증거 결합 (collectAndRelate)');
{
  const engine = new EvidenceEngine();
  const r1 = engine.collectAndRelate({
    source: 'api-a', source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'order_count', observed_value: 100, trust_score: 0.9,
    subject: 'dosirak',
  });
  const r2 = engine.collectAndRelate({
    source: 'api-b', source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'order_count', observed_value: 100, trust_score: 0.85,
    subject: 'dosirak',
  });
  assert(r2.relations.corroborated.length === 1, '보강 관계 1건 감지');
  assert(r2.merged.corroboration.includes(r1.merged.id), '새 증거에 기존 증거 ID 보강');
}

// ── 08. corroborating evidence 신뢰도 반영 ──
console.log('▸ TC-08: corroborating evidence 신뢰도 반영');
{
  const engine = new EvidenceEngine();
  const r1 = engine.collectAndRelate({
    source: 'api-a', source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'active_vendors', observed_value: 50, trust_score: 0.8,
    subject: 'dosirak',
  });
  const originalScore = r1.merged.trust_score;

  engine.collectAndRelate({
    source: 'api-b', source_type: SOURCE_TYPE.INSTITUTION,
    claim: 'active_vendors', observed_value: 50, trust_score: 0.9,
    subject: 'dosirak',
  });

  const updated = engine.get(r1.merged.id);
  assert(updated.trust_score > originalScore, '보강 시 기존 증거 trust_score 상승');
  assert(updated.trust_score <= 1.0, 'trust_score 최대 1.0');
}

// ── 09. contradicting evidence 표시 ─────────
console.log('▸ TC-09: contradicting evidence 표시');
{
  const engine = new EvidenceEngine();
  const r1 = engine.collectAndRelate({
    source: 'api-a', source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'is_fraud', observed_value: false, trust_score: 0.7,
    subject: 'call-123',
  });
  const r2 = engine.collectAndRelate({
    source: 'police-db', source_type: SOURCE_TYPE.INSTITUTION,
    claim: 'is_fraud', observed_value: true, trust_score: 0.95,
    subject: 'call-123',
  });
  assert(r2.relations.contradicted.length === 1, '모순 관계 1건 감지');
  assert(r2.merged.contradiction.includes(r1.merged.id), '새 증거에 모순 ID 기록');

  const prev = engine.get(r1.merged.id);
  assert(prev.contradiction.includes(r2.merged.id), '기존 증거에도 모순 ID 기록');
}

// ── 10. provenance 보존 ─────────────────────
console.log('▸ TC-10: provenance 보존');
{
  const engine = new EvidenceEngine();
  const prov = { api_version: '2.1', endpoint: '/api/orders', request_id: 'req-abc' };
  const ev = engine.collect({
    source: 'dosirak-api', source_type: SOURCE_TYPE.PLATFORM_API,
    claim: 'snapshot', observed_value: { orders: 10 }, trust_score: 0.9,
    provenance: prov,
  });
  assert(ev.provenance !== null, 'provenance가 보존됨');
  assert(ev.provenance.api_version === '2.1', 'provenance 내용 일치');
  assert(ev.provenance.request_id === 'req-abc', 'provenance request_id 일치');

  // 원본 변경이 저장된 값에 영향 없음
  prov.api_version = '9.9';
  const stored = engine.get(ev.id);
  assert(stored.provenance.api_version === '2.1', 'provenance 격리');
}

// ── 11. 외부 객체 mutation 차단 ─────────────
console.log('▸ TC-11: 외부 객체 mutation 차단');
{
  const engine = new EvidenceEngine();
  const input = {
    source: 'x', source_type: SOURCE_TYPE.DEVICE,
    claim: 'status', observed_value: { active: true }, trust_score: 0.8,
    subject: 'p1',
  };
  const ev = engine.collect(input);

  // 입력 원본 변경
  input.observed_value.active = false;
  const stored = engine.get(ev.id);
  assert(stored.observed_value.active === true, '입력 원본 변경 후에도 stored 보존');

  // 반환값 변경
  ev.trust_score = 0;
  const stored2 = engine.get(ev.id);
  assert(stored2.trust_score === 0.8, '반환값 변경도 stored에 영향 없음');
}

// ── 12. AI inference와 verified source 구분 ──
console.log('▸ TC-12: AI inference와 verified source 구분');
{
  const engine = new EvidenceEngine();
  const aiEv = engine.collect({
    source: 'arkaon-llm', source_type: SOURCE_TYPE.AI_INFERENCE,
    claim: 'likely_phishing', observed_value: true, trust_score: 0.75,
    subject: 'call-456',
  });
  const instEv = engine.collect({
    source: 'police-verification-server', source_type: SOURCE_TYPE.INSTITUTION,
    claim: 'spoofed_number', observed_value: true, trust_score: 0.99,
    subject: 'call-456',
  });

  assert(engine.isAiInference(aiEv) === true, 'AI_INFERENCE 판별');
  assert(engine.isAiInference(instEv) === false, 'INSTITUTION은 AI가 아님');
  assert(engine.isVerifiedSource(instEv) === true, 'INSTITUTION은 verified');
  assert(engine.isVerifiedSource(aiEv) === false, 'AI_INFERENCE는 verified가 아님');

  // ID로도 판별 가능
  assert(engine.isAiInference(aiEv.id) === true, 'ID로 AI_INFERENCE 판별');
  assert(engine.isVerifiedSource(instEv.id) === true, 'ID로 verified 판별');
}

// ── 13. biometric assertion에 raw biometric data 저장 금지 ──
console.log('▸ TC-13: biometric raw data 저장 금지 (ADR-001 §3)');
{
  const engine = new EvidenceEngine();

  // 허용: assertion 형태
  const ok = engine.collect({
    source: 'device-auth', source_type: SOURCE_TYPE.BIOMETRIC_ASSERTION,
    claim: 'device_user_present', observed_value: true, trust_score: 0.98,
    metadata: { authenticator: 'OS_BIOMETRIC' },
  });
  assert(ok.id.startsWith('ev_'), 'BIOMETRIC_ASSERTION assertion 형태 허용');

  // 금지: fingerprint_template
  throws(() => engine.collect({
    source: 'device', source_type: SOURCE_TYPE.BIOMETRIC_ASSERTION,
    claim: 'identity', observed_value: true, trust_score: 0.9,
    fingerprint_template: 'AQID...',
  }), 'fingerprint_template 포함 시 거부');

  // 금지: face_embedding
  throws(() => engine.collect({
    source: 'device', source_type: SOURCE_TYPE.BIOMETRIC_ASSERTION,
    claim: 'identity', observed_value: true, trust_score: 0.9,
    metadata: { face_embedding: [0.1, 0.2, 0.3] },
  }), 'metadata 내 face_embedding 포함 시 거부');

  // 금지: raw_biometric_data (중첩)
  throws(() => engine.collect({
    source: 'device', source_type: SOURCE_TYPE.BIOMETRIC_ASSERTION,
    claim: 'identity', observed_value: { raw_biometric_data: 'binary...' },
    trust_score: 0.9,
  }), 'observed_value 내 raw_biometric_data 포함 시 거부');

  // containsBiometricRaw 직접 테스트
  assert(containsBiometricRaw({ a: { iris_template: 'x' } }) === 'iris_template',
    'containsBiometricRaw 중첩 탐지');
  assert(containsBiometricRaw({ safe: true }) === false,
    'containsBiometricRaw 안전한 객체는 false');
}

// ── 14. 최소 공개 원칙 위반 데이터 감지 기반 ──
console.log('▸ TC-14: 최소 공개 원칙 위반 감지 기반');
{
  // 현재는 biometric raw field 금지가 기본 방어선.
  // 향후 PII 감지(주민번호, 카드번호 등)로 확장될 기반.
  // 지금은 containsBiometricRaw가 확실하게 동작하는지 추가 확인.
  assert(
    containsBiometricRaw({ voice_print: 'data' }) === 'voice_print',
    'voice_print 감지'
  );
  assert(
    containsBiometricRaw({ palm_template: 'data' }) === 'palm_template',
    'palm_template 감지'
  );
  assert(
    containsBiometricRaw({ nested: { deep: { fingerprint_template: 'x' } } }) === 'fingerprint_template',
    '3-depth 중첩 fingerprint_template 감지'
  );
}

// ── 15. 모든 테스트 PASS (이 항목 자체가 최종 결과) ──
console.log('▸ TC-15: 전체 결과');

// ── 보너스: list 필터 ───────────────────────
console.log('▸ Bonus: list 필터');
{
  const engine = new EvidenceEngine();
  engine.collect({
    source: 'a', source_type: SOURCE_TYPE.DEVICE,
    claim: 'c1', observed_value: 1, trust_score: 0.5, subject: 's1',
  });
  engine.collect({
    source: 'b', source_type: SOURCE_TYPE.AI_INFERENCE,
    claim: 'c2', observed_value: 2, trust_score: 0.6, subject: 's2',
  });
  assert(engine.list({ subject: 's1' }).length === 1, 'subject 필터');
  assert(engine.list({ source_type: SOURCE_TYPE.AI_INFERENCE }).length === 1, 'source_type 필터');
  assert(engine.list().length === 2, '전체 조회');
}

// ── 결과 ─────────────────────────────────────
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
  console.error('⚠️  일부 테스트 실패');
}
process.exit(failed > 0 ? 1 : 0);
