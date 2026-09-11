'use strict';

/**
 * PHONE FRIEND — Product / Capability Layer
 * ─────────────────────────────────────────────────
 *
 * ARKAON CORE = 범용 두뇌 + 안전장치
 * PHONE FRIEND = 생활형 AI 제품축 (Core 위 Capability Layer)
 * ARKAON CALL  = 전화·통화 전문축 (별도 제품, CALL capability에서 handoff)
 *
 * 이 레이어는 Decision/Gate/ActionRuntime을 우회하지 않는다.
 */

const catalog = require('./capabilities/catalog.cjs');
const { resolveCoreTarget } = require('./policies/capability-policy.cjs');
const {
  MobileIntentRouter,
  CAPABILITIES,
  INTENT_SOURCE,
  parseAmount,
  extractRecipient,
  extractMessageContent,
  normalizeText,
} = require('./intents/mobile-intent-router.cjs');
const {
  ConversationSessionStore,
  SESSION_STATUS,
  DEFAULT_TTL_MS,
} = require('./sessions/conversation-session-store.cjs');
const {
  ConversationOrchestrator,
  RESPONSE_KIND,
  isAffirmative,
  isNegative,
} = require('./conversation/orchestrator.cjs');

module.exports = {
  // identity
  PRODUCT_ID: catalog.PRODUCT_ID,
  CAPABILITY: catalog.CAPABILITY,
  SKILL_ACTION: catalog.SKILL_ACTION,
  CATALOG: catalog.CATALOG,
  getCapability: catalog.getCapability,
  resolveProductCapability: catalog.resolveProductCapability,

  // policy
  resolveCoreTarget,

  // conversation surface
  MobileIntentRouter,
  CAPABILITIES,
  INTENT_SOURCE,
  parseAmount,
  extractRecipient,
  extractMessageContent,
  normalizeText,
  ConversationSessionStore,
  SESSION_STATUS,
  DEFAULT_TTL_MS,
  ConversationOrchestrator,
  RESPONSE_KIND,
  isAffirmative,
  isNegative,
};
