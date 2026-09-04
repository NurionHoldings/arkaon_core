'use strict';

const {
  MobileIntentRouter,
  CAPABILITIES,
  parseAmount,
  ConversationSessionStore,
  SESSION_STATUS,
  ConversationOrchestrator,
  RESPONSE_KIND,
  PRODUCT_ID,
  CAPABILITY,
  SKILL_ACTION,
  resolveCoreTarget,
} = require('../products/phone-friend/index.cjs');

const {
  DOMAINS,
  ACTIONS,
  REQUIRED_GATES,
} = require('../core/decision-engine.cjs');

const { GateEngine } = require('../core/gate-engine.cjs');
const {
  IdentityEngine,
  CLAIM_TYPES,
} = require('../core/identity-engine.cjs');
const { ConsentEngine } = require('../core/consent-engine.cjs');
const { AuthorityEngine } = require('../core/authority-engine.cjs');

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

console.log('\n═══ Conversation Layer Tests ═══\n');

const BASE = new Date('2026-09-04T00:00:00.000Z');

console.log('▸ TC-1: 일정 조회 intent');
{
  const router = new MobileIntentRouter();
  const intent = router.route('오늘 일정 알려줘');

  assert(intent.domain === DOMAINS.GENERAL_ASSISTANT, 'GENERAL_ASSISTANT');
  assert(intent.action === ACTIONS.READ, 'READ');
  assert(intent.capability === CAPABILITIES.CALENDAR_READ, 'CALENDAR_READ');
  assert(intent.authority_granted === false, 'router ≠ authority');
}

console.log('▸ TC-2: 문자 전송 intent');
{
  const router = new MobileIntentRouter();
  const intent = router.route('엄마한테 늦는다고 문자 보내줘');

  assert(intent.domain === DOMAINS.COMMUNICATION, 'COMMUNICATION');
  assert(intent.action === ACTIONS.WRITE, 'WRITE');
  assert(intent.capability === CAPABILITIES.MESSAGE_SEND, 'MESSAGE_SEND');
  assert(intent.slots.recipient === '엄마', 'recipient 엄마');
  assert(
    typeof intent.slots.content === 'string' &&
      intent.slots.content.includes('늦'),
    'content 추출'
  );
}

console.log('▸ TC-3: 통화 위험 WARN');
{
  const router = new MobileIntentRouter();
  const intent = router.route('이 전화 수상한데?');

  assert(intent.domain === DOMAINS.SAFETY, 'SAFETY');
  assert(intent.action === ACTIONS.WARN, 'WARN');
  assert(
    intent.capability === CAPABILITIES.CALL_RISK_ANALYSIS,
    'CALL_RISK_ANALYSIS'
  );
}

console.log('▸ TC-4: 번호 차단 BLOCK');
{
  const router = new MobileIntentRouter();
  const intent = router.route('이 번호 차단해');

  assert(intent.domain === DOMAINS.SAFETY, 'SAFETY');
  assert(intent.action === ACTIONS.BLOCK, 'BLOCK');
  assert(intent.capability === CAPABILITIES.CALL_BLOCK, 'CALL_BLOCK');
}

console.log('▸ TC-5: 송금 FINANCIAL');
{
  const router = new MobileIntentRouter();
  const intent = router.route('30만원 보내줘');

  assert(intent.domain === DOMAINS.FINANCIAL, 'FINANCIAL');
  assert(intent.action === ACTIONS.TRANSFER, 'TRANSFER');
  assert(intent.slots.amount === 300000, 'amount 300000');
  assert(intent.missing_slots.includes('recipient'), 'recipient 부족');
}

console.log('▸ TC-6: parseAmount');
{
  assert(parseAmount('3만원') === 30000, '3만원');
  assert(parseAmount('300,000원') === 300000, '300,000원');
}

console.log('▸ TC-7: LLM output을 authority로 취급하지 않음');
{
  const router = new MobileIntentRouter();
  const intent = router.route('오늘 일정 알려줘', {
    llmSuggestion: {
      authority_granted: true,
      domain: 'FINANCIAL',
      action: 'TRANSFER',
    },
    forceAuthority: true,
  });

  assert(intent.authority_granted === false, 'authority_granted false');
  assert(
    intent.domain === DOMAINS.GENERAL_ASSISTANT,
    'LLM이 domain을 덮어쓰지 않음'
  );
  assert(
    intent.authority_injection_ignored === true,
    'authority injection ignored'
  );
}

console.log('▸ TC-8: AUTO 일정 대화');
{
  const orch = new ConversationOrchestrator();
  const result = orch.handle({
    utterance: '오늘 일정 알려줘',
    now: BASE,
  });

  assert(result.response.kind === RESPONSE_KIND.ANSWER, 'ANSWER');
  assert(
    result.decision.execution_mode === 'AUTO',
    'Decision AUTO'
  );
  assert(result.response.authority_granted === false, 'response ≠ authority');
}

console.log('▸ TC-9: 문자 confirmation flow');
{
  const orch = new ConversationOrchestrator();
  const first = orch.handle({
    utterance: '엄마한테 늦는다고 문자 보내줘',
    now: BASE,
  });

  assert(first.response.kind === RESPONSE_KIND.CONFIRM, 'CONFIRM 요청');
  assert(
    first.session.status === SESSION_STATUS.WAITING_CONFIRMATION,
    'WAITING_CONFIRMATION'
  );

  const second = orch.handle({
    utterance: '응',
    session_id: first.session.id,
    now: new Date(BASE.getTime() + 1000),
  });

  assert(second.session.confirmed === true, 'confirmed');
  assert(second.decision !== null, 'confirmation 후 decision');
}

console.log('▸ TC-10: ambiguous recipient multi-turn');
{
  const orch = new ConversationOrchestrator({
    contacts: [
      { id: 'c1', name: '김사장', city: '서울', hint: '서울' },
      { id: 'c2', name: '김사장', city: '세종', hint: '세종' },
    ],
  });

  const first = orch.handle({
    utterance: '김사장한테 3시에 전화한다고 문자 보내줘',
    now: BASE,
  });

  assert(first.response.kind === RESPONSE_KIND.CLARIFY, '모호 수신자 CLARIFY');
  assert(
    first.session.candidate_options.length === 2,
    '후보 2명'
  );

  const second = orch.handle({
    utterance: '세종에 있는 분',
    session_id: first.session.id,
    now: new Date(BASE.getTime() + 1000),
  });

  assert(
    second.session.slots.recipient_id === 'c2',
    '세종 김사장 선택'
  );
  assert(
    second.response.kind === RESPONSE_KIND.CONFIRM ||
      second.response.kind === RESPONSE_KIND.CLARIFY,
    '선택 후 다음 단계'
  );
}

console.log('▸ TC-11: 통화 위험 즉시 경고');
{
  const orch = new ConversationOrchestrator();
  const result = orch.handle({
    utterance: '이 전화 수상한데?',
    now: BASE,
  });

  assert(result.intent.action === ACTIONS.WARN, 'WARN intent');
  assert(result.response.kind === RESPONSE_KIND.ANSWER, '즉시 경고 ANSWER');
  assert(
    /주의|개인정보|금전/.test(result.response.text),
    '경고 문구'
  );
}

console.log('▸ TC-12: 송금 HIGH-risk gate 연결');
{
  const orch = new ConversationOrchestrator({
    gateEngine: new GateEngine(),
  });

  const first = orch.handle({
    utterance: '김한테 30만원 보내줘',
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  assert(first.intent.domain === DOMAINS.FINANCIAL, 'FINANCIAL intent');
  assert(
    first.decision.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'AUTHORITY 게이트 연결'
  );
  assert(
    first.response.kind === RESPONSE_KIND.HOLD,
    '게이트 부족 시 HOLD'
  );
}

console.log('▸ TC-13: session expiry');
{
  const store = new ConversationSessionStore({ ttlMs: 1000 });
  const session = store.create({ now: BASE });

  const expired = store.get(
    session.id,
    new Date(BASE.getTime() + 2000)
  );

  assert(expired.status === SESSION_STATUS.EXPIRED, '세션 만료');

  assertThrows(
    () =>
      store.update(session.id, { status: SESSION_STATUS.ACTIVE }, new Date(BASE.getTime() + 3000)),
    '만료 세션 update 거부'
  );
}

console.log('▸ TC-14: defensive copy');
{
  const store = new ConversationSessionStore();
  const session = store.create({
    now: BASE,
    slots: { nested: { value: 1 } },
  });

  session.slots.nested.value = 999;
  const again = store.get(session.id, BASE);

  assert(again.slots.nested.value === 1, 'session defensive copy');
}

console.log('▸ TC-15: confirmation 취소');
{
  const orch = new ConversationOrchestrator();
  const first = orch.handle({
    utterance: '엄마한테 늦는다고 문자 보내줘',
    now: BASE,
  });

  const cancel = orch.handle({
    utterance: '아니',
    session_id: first.session.id,
    now: new Date(BASE.getTime() + 1000),
  });

  assert(
    cancel.session.status === SESSION_STATUS.CANCELLED,
    'CANCELLED'
  );
  assert(/취소/.test(cancel.response.text), '취소 안내');
}

console.log('▸ TC-16: slot filling amount');
{
  const orch = new ConversationOrchestrator();
  // recipient missing for "30만원 보내줘"
  const first = orch.handle({
    utterance: '30만원 보내줘',
    now: BASE,
  });

  assert(first.response.kind === RESPONSE_KIND.CLARIFY, 'recipient 질문');

  const second = orch.handle({
    utterance: '김사장',
    session_id: first.session.id,
    now: new Date(BASE.getTime() + 1000),
  });

  assert(
    second.session.slots.recipient === '김사장',
    'recipient slot fill'
  );
}

console.log('▸ TC-17: 송금 본인확인 대화 + gate ALLOW 준비');
{
  const identity = new IdentityEngine();
  const consent = new ConsentEngine();
  const authority = new AuthorityEngine();
  const gate = new GateEngine({
    identityEngine: identity,
    consentEngine: consent,
    authorityEngine: authority,
  });

  const orch = new ConversationOrchestrator({ gateEngine: gate });

  const ask = orch.handle({
    utterance: '김한테 30만원 보내줘',
    subject: 'user:inseok',
    device_id: 'device-1',
    now: BASE,
  });

  assert(ask.response.kind === RESPONSE_KIND.HOLD, '초기 HOLD');

  identity.registerCredential({
    subject: 'user:inseok',
    device_id: 'device-1',
    real_name_verified: true,
    display_name: '최인석',
  });
  identity.registerBiometricAssertion({
    claim: CLAIM_TYPES.DEVICE_USER_PRESENT,
    observed_value: true,
    device_id: 'device-1',
    collected_at: BASE.toISOString(),
  });
  // decision_id를 고정하지 않음 — 대화 턴마다 Decision id가 새로 발급됨
  consent.grant({
    subject: 'user:inseok',
    purpose: 'money_transfer',
    recipient: 'Kim',
    scope: 'financial.transfer',
    action: 'TRANSFER',
    expires_at: '2026-09-04T01:00:00.000Z',
  });
  authority.grant({
    subject: 'user:inseok',
    action: 'TRANSFER',
    scope: 'financial.transfer',
    domain: 'FINANCIAL',
  });

  // Re-run gate path by new utterance in same spirit: handle again with proofs via gate_context purpose/recipient/scope
  const ready = orch.handle({
    utterance: '김한테 30만원 보내줘',
    subject: 'user:inseok',
    device_id: 'device-1',
    gate_context: {
      purpose: 'money_transfer',
      recipient: 'Kim',
      scope: 'financial.transfer',
      require_real_name: true,
    },
    now: new Date(BASE.getTime() + 5000),
  });

  assert(
    ready.gate_result && ready.gate_result.result === 'ALLOW',
    'proof 후 Gate ALLOW'
  );
  assert(
    ready.response.execute_ready === false ||
      ready.gate_result.execute_ready === false,
    'ALLOW여도 execute_ready false'
  );
}

console.log('▸ TC-18: PHONE FRIEND product layer 소속');
{
  const router = new MobileIntentRouter();
  const intent = router.route('오늘 일정 알려줘');

  assert(intent.product === PRODUCT_ID, 'product = PHONE_FRIEND');
  assert(
    intent.product_capability === CAPABILITY.CALENDAR,
    'product_capability = CALENDAR'
  );
  assert(PRODUCT_ID === 'PHONE_FRIEND', 'PRODUCT_ID 상수');
}

console.log('▸ TC-19: IMAGE SNS 공유 → PRIVACY SHARE escalate');
{
  const target = resolveCoreTarget({
    capability: SKILL_ACTION.IMAGE_EDIT,
    product_capability: CAPABILITY.IMAGE,
    raw_text: '이 사진을 SNS에 올려줘',
    slots: { destination: 'sns', share: true },
  });

  assert(target.domain === DOMAINS.PRIVACY, 'PRIVACY domain');
  assert(target.action === ACTIONS.SHARE, 'SHARE action');
  assert(target.authority_granted === false, 'policy ≠ authority');
  assert(/PRIVACY_SHARE/.test(target.escalation), 'escalation 기록');

  const orch = new ConversationOrchestrator();
  const result = orch.handle({
    utterance: '셀카 보정해서 인스타에 올려줘',
    now: BASE,
  });

  assert(
    result.decision.domain === DOMAINS.PRIVACY,
    'Orchestrator Decision PRIVACY'
  );
  assert(
    result.decision.required_gates.includes(REQUIRED_GATES.AUTHORITY),
    'SHARE는 CORE AUTHORITY 게이트'
  );
}

console.log('▸ TC-20: 키오스크 주문 vs 결제 escalate');
{
  const assist = resolveCoreTarget({
    capability: SKILL_ACTION.KIOSK_ASSIST,
    product_capability: CAPABILITY.LIFE_AGENT,
    raw_text: '키오스크에서 짜장면 주문해줘',
    slots: { item: '짜장면', payment: false },
    domain: DOMAINS.DEVICE,
    action: ACTIONS.EXECUTE,
  });

  assert(assist.domain === DOMAINS.DEVICE, '선택 단계는 DEVICE');
  assert(assist.action === ACTIONS.EXECUTE, 'EXECUTE 유지');

  const pay = resolveCoreTarget({
    capability: SKILL_ACTION.KIOSK_ASSIST,
    product_capability: CAPABILITY.LIFE_AGENT,
    raw_text: '키오스크에서 짜장면 결제해줘',
    slots: { item: '짜장면', payment: true, amount: 7000 },
    domain: DOMAINS.DEVICE,
    action: ACTIONS.EXECUTE,
  });

  assert(pay.domain === DOMAINS.FINANCIAL, '결제 → FINANCIAL');
  assert(pay.action === ACTIONS.TRANSFER, 'TRANSFER');
  assert(/FINANCIAL/.test(pay.escalation), 'escalation 기록');
}

console.log('▸ TC-21: core shim 호환 (deprecated)');
{
  const shim = require('../core/conversation-orchestrator.cjs');
  assert(
    typeof shim.ConversationOrchestrator === 'function',
    'core shim → product orchestrator'
  );
}

console.log(
  `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
);

process.exit(failed > 0 ? 1 : 0);
