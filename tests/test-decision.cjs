'use strict';

const {
  DecisionEngine,
  DOMAINS,
  ACTIONS,
  RISK,
  REVERSIBILITY,
  EXECUTION_MODE,
  REQUIRED_GATES,
  resolveDefaults,
  clamp01,
} = require('../core/decision-engine.cjs');

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

console.log('\n═══ DecisionEngine Tests ═══\n');

const BASE = new Date('2026-09-04T00:00:00.000Z');

console.log('▸ TC-1: 도메인 상수 존재');
{
  const required = [
    'GENERAL_ASSISTANT',
    'COMMUNICATION',
    'SAFETY',
    'IDENTITY',
    'PRIVACY',
    'FINANCIAL',
    'LEGAL',
    'DEVICE',
    'PLATFORM',
  ];

  assert(
    required.every((d) => DOMAINS[d] === d),
    '9개 모바일 도메인 정의'
  );
}

console.log('▸ TC-2: 일정 조회 → AUTO');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.GENERAL_ASSISTANT,
    action: ACTIONS.READ,
    title: '오늘 일정 보여줘',
  }, { now: BASE });

  assert(d.domain === DOMAINS.GENERAL_ASSISTANT, 'GENERAL_ASSISTANT');
  assert(d.action === ACTIONS.READ, 'READ');
  assert(d.risk === RISK.LOW, 'LOW risk');
  assert(d.execution_mode === EXECUTION_MODE.AUTO, 'AUTO 수행');
  assert(d.auto_allowed === true, 'auto_allowed true');
}

console.log('▸ TC-3: 문자 전송 → POLICY_CHECK');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.COMMUNICATION,
    action: ACTIONS.WRITE,
    title: '회의 중이라고 문자 보내줘',
  }, { now: BASE });

  assert(d.domain === DOMAINS.COMMUNICATION, 'COMMUNICATION');
  assert(d.risk === RISK.MEDIUM, 'MEDIUM risk');
  assert(
    d.execution_mode === EXECUTION_MODE.POLICY_CHECK,
    'POLICY_CHECK'
  );
  assert(
    d.required_gates.includes(REQUIRED_GATES.POLICY),
    'POLICY gate'
  );
}

console.log('▸ TC-4: 피싱 경고 → AUTO WARN');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.SAFETY,
    action: ACTIONS.WARN,
    title: '이 전화 피싱 같아',
    beliefs: [
      {
        id: 'blf-1',
        confidence: 0.7,
        contradiction_score: 0.1,
        verified_evidence_count: 0,
        ai_evidence_count: 1,
      },
    ],
  }, { now: BASE });

  assert(d.domain === DOMAINS.SAFETY, 'SAFETY');
  assert(d.action === ACTIONS.WARN, 'WARN');
  assert(d.risk === RISK.LOW, 'LOW risk');
  assert(d.execution_mode === EXECUTION_MODE.AUTO, '즉시 경고 AUTO');
  assert(d.authority_granted === false, '경고여도 authority 없음');
}

console.log('▸ TC-5: 통화 차단 → POLICY_CHECK');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.SAFETY,
    action: ACTIONS.BLOCK,
    title: '이 통화를 차단해',
  }, { now: BASE });

  assert(d.risk === RISK.MEDIUM, 'BLOCK MEDIUM');
  assert(
    d.execution_mode === EXECUTION_MODE.POLICY_CHECK,
    '차단은 POLICY_CHECK'
  );
  assert(d.auto_allowed === false, '자동 차단 금지');
}

console.log('▸ TC-6: 송금 → IDENTITY_CONSENT_BIO');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '30만원 송금해',
    payload: { amount: 300000 },
  }, { now: BASE });

  assert(d.domain === DOMAINS.FINANCIAL, 'FINANCIAL');
  assert(d.action === ACTIONS.TRANSFER, 'TRANSFER');
  assert(d.risk === RISK.HIGH, 'HIGH risk');
  assert(
    d.reversibility === REVERSIBILITY.IRREVERSIBLE,
    '비가역'
  );
  assert(
    d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    'Identity+Consent+Bio'
  );
  assert(
    d.required_gates.includes(REQUIRED_GATES.IDENTITY) &&
      d.required_gates.includes(REQUIRED_GATES.CONSENT) &&
      d.required_gates.includes(REQUIRED_GATES.BIOMETRIC_ASSERTION),
    '3개 게이트 모두 필요'
  );
}

console.log('▸ TC-7: Confidence !== Authority');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '고확신 송금',
    beliefs: [
      {
        id: 'blf-high',
        confidence: 0.99,
        contradiction_score: 0,
        verified_evidence_count: 3,
        ai_evidence_count: 0,
      },
    ],
  }, { now: BASE });

  assert(d.cognitive.top_belief_confidence === 0.99, '높은 confidence 기록');
  assert(d.authority_granted === false, 'authority_granted false');
  assert(
    d.confidence_grants_authority === false,
    'confidence_grants_authority false'
  );
  assert(
    d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    '높은 confidence여도 게이트 유지'
  );
}

console.log('▸ TC-8: 잘못된 domain/action 거부');
{
  const engine = new DecisionEngine();

  assertThrows(
    () =>
      engine.evaluate({
        domain: 'UNKNOWN',
        action: ACTIONS.READ,
        title: 'x',
      }),
    '잘못된 domain 거부'
  );

  assertThrows(
    () =>
      engine.evaluate({
        domain: DOMAINS.SAFETY,
        action: 'FLY',
        title: 'x',
      }),
    '잘못된 action 거부'
  );

  assertThrows(
    () =>
      engine.evaluate({
        domain: DOMAINS.SAFETY,
        action: ACTIONS.WARN,
      }),
    'title 누락 거부'
  );
}

console.log('▸ TC-9: risk/reversibility override');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.GENERAL_ASSISTANT,
    action: ACTIONS.READ,
    title: '민감 일정',
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  }, { now: BASE });

  assert(d.risk === RISK.HIGH, 'override risk 적용');
  assert(
    d.execution_mode === EXECUTION_MODE.USER_APPROVAL ||
      d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    'override로 자동 수행 막힘'
  );
}

console.log('▸ TC-10: contradiction이 WRITE 위험 상승');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.COMMUNICATION,
    action: ACTIONS.WRITE,
    title: '상충 상황 메시지',
    beliefs: [
      {
        id: 'a',
        confidence: 0.6,
        contradiction_score: 0.8,
        verified_evidence_count: 0,
        ai_evidence_count: 1,
      },
    ],
  }, { now: BASE });

  assert(d.requested_risk === RISK.MEDIUM, '기본 MEDIUM 요청');
  assert(d.risk === RISK.HIGH, 'contradiction으로 HIGH 승격');
  assert(
    d.execution_mode === EXECUTION_MODE.USER_APPROVAL,
    '승격 후 USER_APPROVAL'
  );
}

console.log('▸ TC-11: READ는 contradiction으로도 AUTO 유지 가능');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.GENERAL_ASSISTANT,
    action: ACTIONS.READ,
    title: '상충 있어도 조회',
    beliefs: [
      {
        id: 'a',
        confidence: 0.5,
        contradiction_score: 0.9,
        verified_evidence_count: 0,
        ai_evidence_count: 1,
      },
    ],
  }, { now: BASE });

  assert(d.risk === RISK.LOW, 'READ risk 유지');
  assert(d.execution_mode === EXECUTION_MODE.AUTO, '조회는 AUTO 가능');
  assert(
    typeof d.uncertainty_note === 'string' &&
      d.uncertainty_note.length > 0,
    '불확실성 메모 기록'
  );
}

console.log('▸ TC-12: privacy share → identity gates');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.PRIVACY,
    action: ACTIONS.SHARE,
    title: '개인정보 공유',
  }, { now: BASE });

  assert(
    d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    'PRIVACY SHARE는 강한 게이트'
  );
}

console.log('▸ TC-13: legal execute → CRITICAL path');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.LEGAL,
    action: ACTIONS.EXECUTE,
    title: '법적 조치 실행',
  }, { now: BASE });

  assert(d.risk === RISK.CRITICAL, 'LEGAL EXECUTE CRITICAL');
  assert(
    d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    'LEGAL EXECUTE 강한 게이트'
  );
}

console.log('▸ TC-14: evaluateMany + rank');
{
  const engine = new DecisionEngine();
  const ranked = engine.evaluateMany([
    {
      domain: DOMAINS.GENERAL_ASSISTANT,
      action: ACTIONS.READ,
      title: '일정',
    },
    {
      domain: DOMAINS.FINANCIAL,
      action: ACTIONS.TRANSFER,
      title: '송금',
    },
    {
      domain: DOMAINS.SAFETY,
      action: ACTIONS.WARN,
      title: '경고',
    },
  ], { now: BASE });

  assert(ranked.length === 3, '3개 결정');
  assert(
    ranked[0].domain === DOMAINS.FINANCIAL,
    '가장 위험한 결정이 1위'
  );
}

console.log('▸ TC-15: 외부 mutation 차단');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.SAFETY,
    action: ACTIONS.WARN,
    title: '경고',
    payload: { nested: { ok: true } },
    beliefs: [{ id: 'b1', confidence: 0.4 }],
  }, { now: BASE });

  d.payload.nested.ok = false;
  d.cognitive.belief_ids.push('evil');
  d.authority_granted = true;

  const stored = engine.get(d.id);

  assert(stored.payload.nested.ok === true, 'payload 격리');
  assert(
    !stored.cognitive.belief_ids.includes('evil'),
    'belief_ids 격리'
  );
  assert(stored.authority_granted === false, 'authority 변조 불가');
}

console.log('▸ TC-16: get/list/remove/clear');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.DEVICE,
    action: ACTIONS.CONFIGURE,
    title: '설정 변경',
    platform_id: 'phone-1',
  }, { now: BASE });

  assert(engine.get(d.id) !== null, 'get');
  assert(engine.list({ platform_id: 'phone-1' }).length === 1, 'list filter');
  engine.remove(d.id);
  assert(engine.get(d.id) === null, 'remove');
  engine.evaluate({
    domain: DOMAINS.DEVICE,
    action: ACTIONS.CONFIGURE,
    title: '다시',
  }, { now: BASE });
  engine.clear();
  assert(engine.list().length === 0, 'clear');
}

console.log('▸ TC-17: prediction provenance 전달');
{
  const engine = new DecisionEngine();
  const d = engine.evaluate({
    domain: DOMAINS.SAFETY,
    action: ACTIONS.WARN,
    title: '예측 기반 경고',
    predictions: [
      { id: 'pred-1', probability: 0.82 },
      { id: 'pred-2', probability: 0.4 },
    ],
  }, { now: BASE });

  assert(d.cognitive.top_prediction_id === 'pred-1', 'top prediction');
  assert(
    d.cognitive.prediction_ids.includes('pred-1'),
    'prediction provenance'
  );
}

console.log('▸ TC-18: default matrix');
{
  const transfer = resolveDefaults(
    DOMAINS.FINANCIAL,
    ACTIONS.TRANSFER
  );
  const read = resolveDefaults(
    DOMAINS.GENERAL_ASSISTANT,
    ACTIONS.READ
  );

  assert(transfer.risk === RISK.HIGH, 'TRANSFER default HIGH');
  assert(
    transfer.reversibility === REVERSIBILITY.IRREVERSIBLE,
    'TRANSFER irreversible'
  );
  assert(read.risk === RISK.LOW, 'READ default LOW');
}

console.log('▸ Bonus: clamp01');
{
  assert(clamp01(-1) === 0, '음수 clamp');
  assert(clamp01(2) === 1, '1 초과 clamp');
  assert(clamp01(0.3) === 0.3, '정상값');
}

console.log('▸ Bonus: ACTIONS 존재');
{
  assert(
    ACTIONS.READ &&
      ACTIONS.WRITE &&
      ACTIONS.WARN &&
      ACTIONS.BLOCK &&
      ACTIONS.TRANSFER,
    '핵심 action verbs'
  );
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
