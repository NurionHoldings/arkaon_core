'use strict';

const { DecisionEngine, DOMAINS, ACTIONS, REQUIRED_GATES } = require(
  '../core/decision-engine.cjs'
);
const {
  IdentityEngine,
  CLAIM_TYPES,
  containsRawBiometric,
} = require('../core/identity-engine.cjs');
const { ConsentEngine } = require('../core/consent-engine.cjs');
const { AuthorityEngine } = require('../core/authority-engine.cjs');
const {
  GateEngine,
  GATE_RESULT,
  GATE_NAMES,
} = require('../core/gate-engine.cjs');

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

console.log('\n═══ Gate Layer Tests ═══\n');

const BASE = new Date('2026-09-04T00:00:00.000Z');

console.log('▸ TC-1: identity assertion 등록/검증');
{
  const id = new IdentityEngine();
  const cred = id.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: true,
    display_name: '최인석',
  });

  const verified = id.verifyIdentity({
    subject: 'user:inseok',
    device_id: 'device-1',
    require_real_name: true,
    now: BASE,
  });

  assert(cred.id.startsWith('cred_'), 'credential 등록');
  assert(verified.ok === true, 'identity 검증 통과');
}

console.log('▸ TC-2: raw biometric 저장 금지');
{
  const id = new IdentityEngine();

  assertThrows(
    () =>
      id.registerCredential({
        subject: 'u',
        device_id: 'd',
        fingerprint_template: 'FORBIDDEN',
      }),
    'credential fingerprint 거부'
  );

  assertThrows(
    () =>
      id.registerBiometricAssertion({
        claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
        observed_value: true,
        device_id: 'd',
        metadata: { face_embedding: [1, 2] },
      }),
    'assertion face_embedding 거부'
  );

  assert(
    containsRawBiometric({ a: { raw_biometric_data: 'x' } }) === true,
    '중첩 raw biometric 탐지'
  );
}

console.log('▸ TC-3: device-bound credential 검증');
{
  const id = new IdentityEngine();
  id.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    device_bound: false,
  });

  const verified = id.verifyIdentity({
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  assert(verified.ok === false, 'device_bound=false 거부');
}

console.log('▸ TC-4: real-name verified claim 구분');
{
  const id = new IdentityEngine();
  id.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: false,
  });

  const without = id.verifyIdentity({
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  const withRealName = id.verifyIdentity({
    subject: 'user:inseok',
    device_id: 'device-1',
    require_real_name: true,
    now: BASE,
  });

  assert(without.ok === true, '일반 identity 통과');
  assert(withRealName.ok === false, '실명 요구 시 거부');
}

console.log('▸ TC-5: consent purpose/recipient/scope 바인딩');
{
  const consent = new ConsentEngine();
  consent.grant({
    subject: 'user:inseok',
    purpose: 'disclose_real_name',
    recipient: 'MJN',
    scope: 'identity.display_name',
    action: 'SHARE',
  });

  const ok = consent.verify({
    subject: 'user:inseok',
    purpose: 'disclose_real_name',
    recipient: 'MJN',
    scope: 'identity.display_name',
    action: 'SHARE',
    now: BASE,
  });

  const reuseAsTransfer = consent.verify({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    now: BASE,
  });

  assert(ok.ok === true, 'exact consent 통과');
  assert(reuseAsTransfer.ok === false, '다른 purpose/recipient 재사용 거부');
}

console.log('▸ TC-6: consent expiry');
{
  const consent = new ConsentEngine();
  consent.grant({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    expires_at: '2026-09-03T23:00:00.000Z',
  });

  const verified = consent.verify({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    now: BASE,
  });

  assert(verified.ok === false, '만료 consent 거부');
}

console.log('▸ TC-7: single-use consent');
{
  const consent = new ConsentEngine();
  consent.grant({
    id: 'cns-once',
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    single_use: true,
    expires_at: '2026-09-04T01:00:00.000Z',
  });

  const first = consent.verify({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    now: BASE,
  });

  assert(first.ok === true, '첫 검사 통과');

  consent.markUsed('cns-once', BASE);

  const second = consent.verify({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    now: BASE,
  });

  assert(second.ok === false, 'single-use 재사용 거부');
}

console.log('▸ TC-8: authority scope/action 검증');
{
  const authority = new AuthorityEngine();
  authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
    resource: 'bank:primary',
  });

  const ok = authority.verify({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
    now: BASE,
  });

  const badAction = authority.verify({
    subject: 'user:inseok',
    action: 'DELETE',
    scope: 'financial.transfer',
    now: BASE,
  });

  assert(ok.ok === true, 'authority action/scope 통과');
  assert(badAction.ok === false, '다른 action 거부');
}

console.log('▸ TC-9: expired authority 거부');
{
  const authority = new AuthorityEngine();
  authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    expires_at: '2026-09-03T12:00:00.000Z',
  });

  const verified = authority.verify({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    now: BASE,
  });

  assert(verified.ok === false, '만료 authority 거부');
}

console.log('▸ TC-10: biometric assertion freshness');
{
  const id = new IdentityEngine({
    biometricFreshnessMs: 5 * 60 * 1000,
  });

  id.registerBiometricAssertion({
    claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
    observed_value: true,
    device_id: 'device-1',
    subject: 'user:inseok',
    collected_at: '2026-09-04T00:00:00.000Z',
  });

  const fresh = id.verifyBiometricAssertion({
    device_id: 'device-1',
    now: new Date('2026-09-04T00:02:00.000Z'),
  });

  const stale = id.verifyBiometricAssertion({
    device_id: 'device-1',
    now: new Date('2026-09-04T00:10:00.000Z'),
  });

  assert(fresh.ok === true, '신선한 biometric 통과');
  assert(stale.ok === false, 'stale biometric 거부');
  assert(fresh.authority_granted === false, 'biometric ≠ authority');
}

console.log('▸ TC-11: Decision.required_gates 해석');
{
  const decisionEngine = new DecisionEngine();
  const decision = decisionEngine.evaluate({
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '30만원 송금해',
  }, { now: BASE });

  assert(
    decision.required_gates.includes(REQUIRED_GATES.IDENTITY) &&
      decision.required_gates.includes(REQUIRED_GATES.CONSENT) &&
      decision.required_gates.includes(REQUIRED_GATES.BIOMETRIC_ASSERTION),
    '송금 Decision이 Identity+Consent+Bio 요구'
  );
}

console.log('▸ TC-12/13: missing_gates + ALLOW/HOLD/DENY');
{
  const gate = new GateEngine();
  const decision = {
    id: 'dec-transfer',
    domain: 'FINANCIAL',
    action: 'TRANSFER',
    required_gates: [
      GATE_NAMES.IDENTITY,
      GATE_NAMES.CONSENT,
      GATE_NAMES.BIOMETRIC_ASSERTION,
      GATE_NAMES.AUTHORITY,
    ],
  };

  const hold = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    now: BASE,
  });

  assert(hold.result === GATE_RESULT.HOLD, '미충족 시 HOLD');
  assert(hold.missing_gates.length >= 1, 'missing_gates 반환');

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
    decision_id: 'dec-transfer',
    expires_at: '2026-09-04T01:00:00.000Z',
  });
  gate.authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
  });

  const allow = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    domain: 'FINANCIAL',
    now: BASE,
  });

  assert(allow.result === GATE_RESULT.ALLOW, '전부 통과 시 ALLOW');
  assert(allow.execute_ready === false, 'ALLOW여도 아직 미실행');

  const deny = gate.evaluate(decision, {
    deny: true,
    deny_reason: 'policy_block',
    now: BASE,
  });

  assert(deny.result === GATE_RESULT.DENY, '정책 DENY');
}

console.log('▸ TC-14: Identity ≠ Authority');
{
  const authority = new AuthorityEngine();
  const fromIdentity = authority.fromIdentity({ ok: true });
  assert(
    fromIdentity.ok === false &&
      fromIdentity.reason === 'identity_is_not_authority',
    'Identity ≠ Authority'
  );
}

console.log('▸ TC-15: Consent ≠ Authority');
{
  const authority = new AuthorityEngine();
  const fromConsent = authority.fromConsent({ ok: true });
  assert(
    fromConsent.ok === false &&
      fromConsent.reason === 'consent_is_not_authority',
    'Consent ≠ Authority'
  );
}

console.log('▸ TC-16: Biometric ≠ Authority');
{
  const authority = new AuthorityEngine();
  const fromBio = authority.fromBiometric({ ok: true });
  assert(
    fromBio.ok === false &&
      fromBio.reason === 'biometric_is_not_authority',
    'Biometric ≠ Authority'
  );
}

console.log('▸ TC-17: high confidence가 gate 우회 못함');
{
  const gate = new GateEngine();
  const decision = {
    id: 'dec-1',
    action: 'TRANSFER',
    required_gates: [GATE_NAMES.IDENTITY, GATE_NAMES.AUTHORITY],
  };

  const result = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    confidence: 0.999,
    now: BASE,
  });

  assert(result.result === GATE_RESULT.HOLD, '고확신에도 HOLD');
  assert(
    result.audit.confidence_bypassed_gates === false,
    'confidence bypass 없음'
  );
  assert(result.missing_gates.includes(GATE_NAMES.IDENTITY), 'IDENTITY 부족');
}

console.log('▸ TC-18: 외부 mutation 차단');
{
  const gate = new GateEngine();
  gate.identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
  });

  const decision = {
    id: 'dec-m',
    action: 'READ',
    required_gates: [GATE_NAMES.IDENTITY],
  };

  const result = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  result.missing_gates.push('evil');
  result.authority_granted = true;

  assert(
    Array.isArray(result.missing_gates),
    'result 구조 유지'
  );

  const again = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  assert(!again.missing_gates.includes('evil'), 'mutation 미전파');
  assert(again.authority_granted === false, 'authority 변조 불가');
}

console.log('▸ TC-19: provenance/audit context 유지');
{
  const gate = new GateEngine();
  gate.identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    provenance: { issuer: 'NICE' },
  });

  const decision = {
    id: 'dec-audit',
    domain: 'GENERAL_ASSISTANT',
    action: 'READ',
    required_gates: [GATE_NAMES.IDENTITY],
  };

  const result = gate.evaluate(decision, {
    subject: 'user:inseok',
    device_id: 'device-1',
    confidence: 0.4,
    now: BASE,
  });

  assert(result.audit.decision_id === 'dec-audit', 'decision_id audit');
  assert(result.audit.evaluated_at !== undefined, 'evaluated_at 존재');
  assert(
    result.checks.IDENTITY.credential.provenance.issuer === 'NICE',
    'identity provenance 유지'
  );
}

console.log('▸ TC-20: 송금 대화 시나리오 end-to-end');
{
  const gate = new GateEngine();
  const decisionEngine = new DecisionEngine();

  const decision = decisionEngine.evaluate({
    id: 'dec-send-300k',
    domain: DOMAINS.FINANCIAL,
    action: ACTIONS.TRANSFER,
    title: '30만원 송금해',
    payload: { amount: 300000, recipient_name: '김○○' },
  }, { now: BASE });

  // 1) 아직 게이트 없음 → HOLD
  let verdict = gate.evaluate(decision, {
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
  assert(verdict.result === GATE_RESULT.HOLD, '초기 HOLD');

  // 2) 본인확인 credential + biometric
  gate.identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: true,
    display_name: '최인석',
  });
  gate.identity.registerBiometricAssertion({
    claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
    observed_value: true,
    device_id: 'device-1',
    collected_at: BASE.toISOString(),
  });

  // 3) 송금 동의
  gate.consent.grant({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    decision_id: 'dec-send-300k',
    single_use: true,
    expires_at: '2026-09-04T00:30:00.000Z',
  });

  // 4) Authority still missing if AUTHORITY gate added
  const withAuthority = {
    ...decision,
    required_gates: [
      ...decision.required_gates,
      GATE_NAMES.AUTHORITY,
    ],
  };

  verdict = gate.evaluate(withAuthority, {
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

  assert(
    verdict.result === GATE_RESULT.HOLD &&
      verdict.missing_gates.includes(GATE_NAMES.AUTHORITY),
    '동의+생체만으로 AUTHORITY 자동 생성 안 됨'
  );

  gate.authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
  });

  verdict = gate.evaluate(withAuthority, {
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

  assert(verdict.result === GATE_RESULT.ALLOW, '권한 검증 후 ALLOW');
  assert(verdict.execute_ready === false, '실행은 다음 엔진');
}

console.log('▸ Bonus: POLICY/APPROVAL gates');
{
  const gate = new GateEngine();
  const decision = {
    id: 'dec-msg',
    action: 'WRITE',
    required_gates: [GATE_NAMES.POLICY],
  };

  const hold = gate.evaluate(decision, { now: BASE });
  const allow = gate.evaluate(decision, { policy_ok: true, now: BASE });

  assert(hold.result === GATE_RESULT.HOLD, 'policy 미확인 HOLD');
  assert(allow.result === GATE_RESULT.ALLOW, 'policy_ok ALLOW');
}

console.log('▸ Bonus: AUTO decision empty gates');
{
  const gate = new GateEngine();
  const decisionEngine = new DecisionEngine();
  const decision = decisionEngine.evaluate({
    domain: DOMAINS.GENERAL_ASSISTANT,
    action: ACTIONS.READ,
    title: '오늘 일정',
  }, { now: BASE });

  const verdict = gate.evaluate(decision, { now: BASE });
  assert(verdict.result === GATE_RESULT.ALLOW, 'AUTO path ALLOW');
  assert(verdict.execute_ready === false, '여전히 미실행');
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
