'use strict';

/**
 * Phone Friend Capability Policy
 * ─────────────────────────────────────────────────
 * Capability 기본 도메인/액션을 CORE Decision 입력으로 매핑하고,
 * 위험 상승 시나리오는 더 강한 CORE domain/action으로 escalate 합니다.
 *
 * 예:
 *   IMAGE_EDIT → GENERAL WRITE
 *   "사진을 SNS에 올려줘" → PRIVACY SHARE
 *   키오스크 상품 선택 → DEVICE/LIFE assist
 *   결제/송금 발생 → FINANCIAL TRANSFER
 *
 * 이 정책은 Authority를 부여하지 않습니다.
 */

const { DOMAINS, ACTIONS } = require('../../../core/decision-engine.cjs');
const {
  PRODUCT_ID,
  CAPABILITY,
  SKILL_ACTION,
  getCapability,
  resolveProductCapability,
} = require('../capabilities/catalog.cjs');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Intent(+slots) → CORE Decision 입력으로 쓸 domain/action 결정
 */
function resolveCoreTarget(intent = {}) {
  const skill = intent.capability || SKILL_ACTION.UNKNOWN;
  const productCapability =
    intent.product_capability || resolveProductCapability(skill);
  const catalog = getCapability(productCapability);
  const slots = intent.slots || {};
  const text = String(intent.raw_text || intent.title || '');

  let domain = intent.domain || (catalog && catalog.core_domain) || DOMAINS.GENERAL_ASSISTANT;
  let action = intent.action || (catalog && catalog.core_action) || ACTIONS.READ;
  let escalation = null;

  // IMAGE: 편집은 약함, 공유/게시는 PRIVACY SHARE
  if (
    productCapability === CAPABILITY.IMAGE ||
    skill === SKILL_ACTION.IMAGE_EDIT ||
    skill === SKILL_ACTION.IMAGE_SHARE
  ) {
    const shareIntent =
      skill === SKILL_ACTION.IMAGE_SHARE ||
      slots.share === true ||
      slots.destination === 'sns' ||
      /(sns|인스타|페이스북|업로드|올려|공유|게시)/i.test(text);

    if (shareIntent) {
      domain = DOMAINS.PRIVACY;
      action = ACTIONS.SHARE;
      escalation = 'IMAGE_EDIT→PRIVACY_SHARE';
    } else {
      domain = DOMAINS.GENERAL_ASSISTANT;
      action = ACTIONS.WRITE;
    }
  }

  // LIFE_AGENT: 선택/안내는 중간, 결제·송금은 FINANCIAL
  if (
    productCapability === CAPABILITY.LIFE_AGENT ||
    skill === SKILL_ACTION.KIOSK_ASSIST ||
    skill === SKILL_ACTION.MONEY_TRANSFER
  ) {
    const paymentIntent =
      skill === SKILL_ACTION.MONEY_TRANSFER ||
      slots.payment === true ||
      slots.amount != null ||
      action === ACTIONS.TRANSFER ||
      /(결제|결제해|카드|송금|이체|원\s*보내|만\s*원)/.test(text);

    if (paymentIntent) {
      domain = DOMAINS.FINANCIAL;
      action = ACTIONS.TRANSFER;
      escalation = escalation || 'LIFE_AGENT→FINANCIAL_TRANSFER';
    }
  }

  // CALL proxy → ARKAON CALL handoff marker (still no authority)
  let handoff = null;
  if (productCapability === CAPABILITY.CALL && skill === SKILL_ACTION.CALL_PROXY) {
    handoff = {
      product: 'ARKAON_CALL',
      reason: 'call_specialist_axis',
    };
  }

  return clone({
    product: PRODUCT_ID,
    product_capability: productCapability,
    skill_action: skill,
    domain,
    action,
    escalation,
    handoff,
    /**
     * Product policy never grants authority.
     */
    authority_granted: false,
  });
}

module.exports = {
  resolveCoreTarget,
};
