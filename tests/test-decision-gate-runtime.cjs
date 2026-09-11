'use strict';

/**
 * Decision ↔ Gate ↔ ActionRuntime AUTHORITY 정합성 통합 테스트
 */

const {
  DecisionEngine,
  DOMAINS,
  ACTIONS,
  RISK,
  REQUIRED_GATES,
  SECURE_GATES,
  EXECUTION_MODE,
} = require('../core/decision-engine.cjs');

const {
  GateEngine,
  GATE_RESULT,
  GATE_NAMES,
} = require('../core/gate-engine.cjs');

const {
  IdentityEngine,
  CLAIM_TYPES,
} = require('../core/identity-engine.cjs');

const { ConsentEngine } = require('../core/consent-engine.cjs');
const { AuthorityEngine } = require('../core/authority-engine.cjs');

const {
  ActionRuntime,
  ACTION_RUNTIME_STATUS,
} = require('../core/action-runtime.cjs');

const { AuditEngine } = require('../core/audit-engine.cjs');

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

console.log('\n═══ Decision–Gate–Runtime Alignment Tests ═══\n');

const BASE = new Date('2026-09-04T00:00:00.000Z');

console.log('▸ TC-1: REQUIRED_GATES.AUTHORITY 존재');
{
  assert(
    REQUIRED_GATES.AUTHORITY === 'AUTHORITY',
    'AUTHORITY gate 상수'
  );
  assert(
    SECURE_GATES.includes(REQUIRED_GATES.AUTHORITY),
    'SECURE_GATES에 AUTHORITY 포함'
  );
}

console.log('▸ TC-2: FINANCIAL TRANSFER → 4 gates');
{
  const d = new DecisionEngine().evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '30만원 송금',
  }, { now: BASE });

  assert(
    SECURE_GATES.every((g) => d.required_gates.includes(g)),
    'TRANSFER = Identity+Consent+Bio+Authority'
  );
}

console.log('▸ TC-3: LEGAL EXECUTE → 4 gates');
{
  const d = new DecisionEngine().evaluate({
    domain: DOMAINS.LEGAL,
    action: ACTIONS.EXECUTE,
    title: '법적 실행',
  }, { now: BASE });

  assert(
    SECURE_GATES.every((g) => d.required_gates.includes(g)),
    'LEGAL EXECUTE에 AUTHORITY 포함'
  );
}

console.log('▸ TC-4: PRIVACY SHARE/DELETE → AUTHORITY');
{
  const share = new DecisionEngine().evaluate({
    domain: DOMAINS.PRIVACY,
    action: ACTIONS.SHARE,
    title: '공유',
  }, { now: BASE });

  const del = new DecisionEngine().evaluate({
    domain: DOMAINS.PRIVACY,
    action: ACTIONS.DELETE,
    title: '삭제',
  }, { now: BASE });

  assert(
    share.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'PRIVACY SHARE AUTHORITY'
  );
  assert(
    del.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'PRIVACY DELETE AUTHORITY'
  );
}

console.log('▸ TC-5: SAFETY EXECUTE → AUTHORITY');
{
  const d = new DecisionEngine().evaluate({
    domain: DOMAINS.SAFETY,
    action: ACTIONS.EXECUTE,
    title: '고위험 안전 조치',
  }, { now: BASE });

  assert(
    d.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'SAFETY EXECUTE AUTHORITY'
  );
  assert(
    d.execution_mode === EXECUTION_MODE.IDENTITY_CONSENT_BIO,
    'SAFETY EXECUTE 보안 모드'
  );
}

console.log('▸ TC-6: HIGH risk 경로 AUTHORITY 의무');
{
  const d = new DecisionEngine().evaluate({
    domain: DOMAINS.GENERAL_ASSISTANT,
    action: ACTIONS.READ,
    title: '강제 HIGH',
    risk: RISK.HIGH,
  }, { now: BASE });

  assert(
    d.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'HIGH risk에 AUTHORITY'
  );
  assert(
    d.required_gates.includes(REQUIRED_GATES.APPROVAL),
    'HIGH risk에 APPROVAL'
  );
}

console.log('▸ TC-7: high confidence가 AUTHORITY 대체 불가');
{
  const d = new DecisionEngine().evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '고확신 송금',
    beliefs: [{
      id: 'b1',
      confidence: 0.999,
      contradiction_score: 0,
      verified_evidence_count: 5,
      ai_evidence_count: 0,
    }],
  }, { now: BASE });

  assert(
    d.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'confidence 높아도 AUTHORITY 유지'
  );
  assert(d.authority_granted === false, 'Decision authority_granted false');
  assert(
    d.confidence_grants_authority === false,
    'confidence_grants_authority false'
  );
}

console.log('▸ TC-8: Gate ALLOW인데 AUTHORITY 누락이면 ActionRuntime 거부');
{
  const runtime = new ActionRuntime();
  const decision = new DecisionEngine().evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '송금',
  }, { now: BASE });

  // 구조적으로 Decision은 AUTHORITY를 요구한다.
  assert(
    decision.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'Decision이 AUTHORITY를 이미 요구'
  );

  // 만약 Gate가 AUTHORITY 없이 ALLOW를 위조해도 Runtime이 막는다.
  assertThrows(
    () =>
      runtime.prepare({
        decision,
        gate_result: {
          result: 'ALLOW',
          execute_ready: false,
          checks: {
            IDENTITY: { ok: true },
            CONSENT: { ok: true, consent: { id: 'c1' } },
            BIOMETRIC_ASSERTION: { ok: true },
            // AUTHORITY 누락
          },
          audit: { decision_id: decision.id },
        },
        connector: 'bank',
        idempotency_key: 'pay-x',
      }),
    'AUTHORITY 누락 Gate ALLOW → Runtime 거부'
  );
}

console.log('▸ TC-9: Decision → Gate → Runtime 정상 계약');
{
  const identity = new IdentityEngine();
  const consent = new ConsentEngine();
  const authority = new AuthorityEngine();
  const gate = new GateEngine({
    identityEngine: identity,
    consentEngine: consent,
    authorityEngine: authority,
  });
  const audit = new AuditEngine();
  const runtime = new ActionRuntime({ auditEngine: audit });

  const decision = new DecisionEngine().evaluate({
    id: 'dec-align-1',
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '30만원 송금',
    payload: { amount: 300000 },
  }, { now: BASE });

  identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: true,
  });
  identity.registerBiometricAssertion({
    claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
    observed_value: true,
    device_id: 'device-1',
    collected_at: BASE.toISOString(),
  });
  consent.grant({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    decision_id: 'dec-align-1',
    expires_at: '2026-09-04T01:00:00.000Z',
  });
  authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
  });

  const hold = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    domain: 'FINANCIAL',
    require_real_name: true,
    now: BASE,
  });

  // Without filling all context, may still HOLD if something missing —
  // with all proofs above should ALLOW
  assert(hold.result === GATE_RESULT.ALLOW, '전체 proof 후 Gate ALLOW');
  assert(hold.execute_ready === false, 'Gate execute_ready false 유지');
  assert(
    hold.checks.AUTHORITY && hold.checks.AUTHORITY.ok === true,
    'Gate AUTHORITY check 통과'
  );

  const action = runtime.prepare({
    decision,
    gate_result: hold,
    connector: 'bank',
    idempotency_key: 'align-pay-1',
    reversible: false,
  });

  assert(
    action.status === ACTION_RUNTIME_STATUS.READY,
    'ActionRuntime READY'
  );
  assert(
    action.gate_provenance.authority_proof === true,
    'authority_proof true'
  );
}

console.log('▸ TC-10: AUTHORITY 없이 Gate HOLD');
{
  const gate = new GateEngine();
  const decision = new DecisionEngine().evaluate({
    id: 'dec-hold-auth',
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '송금',
  }, { now: BASE });

  gate.identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: true,
  });
  gate.identity.registerBiometricAssertion({
    claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
    observed_value: true,
    device_id: 'device-1',
    collected_at: BASE.toISOString(),
  });
  gate.consent.grant({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    decision_id: 'dec-hold-auth',
    expires_at: '2026-09-04T01:00:00.000Z',
  });
  // authority 미등록

  const verdict = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    domain: 'FINANCIAL',
    require_real_name: true,
    now: BASE,
  });

  assert(verdict.result === GATE_RESULT.HOLD, 'AUTHORITY 없으면 HOLD');
  assert(
    verdict.missing_gates.includes(GATE_NAMES.AUTHORITY),
    'missing_gates에 AUTHORITY'
  );
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
