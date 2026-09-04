'use strict';

/**
 * GateEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Gate Orchestrator
 *
 * Decision.required_gates 를 읽어
 * Identity / Consent / Authority / Biometric 을 조합 검증합니다.
 *
 * 결과:
 *   ALLOW — 필수 게이트 전부 통과
 *   HOLD  — 일부 부족 (missing_gates[])
 *   DENY  — 정책상 불가 / 명시적 거부
 *
 * Gate ALLOW ≠ Execute
 * 실제 실행은 Action / Execution Engine 단계입니다.
 *
 * 고정 원칙:
 *   Confidence !== Authority
 *   Identity !== Authority
 *   Consent !== Authority
 *   Biometric !== Authority
 */

const { IdentityEngine } = require('./identity-engine.cjs');
const { ConsentEngine } = require('./consent-engine.cjs');
const { AuthorityEngine } = require('./authority-engine.cjs');

const GATE_RESULT = Object.freeze({
  ALLOW: 'ALLOW',
  HOLD: 'HOLD',
  DENY: 'DENY',
});

const GATE_NAMES = Object.freeze({
  NONE: 'NONE',
  POLICY: 'POLICY',
  APPROVAL: 'APPROVAL',
  IDENTITY: 'IDENTITY',
  CONSENT: 'CONSENT',
  BIOMETRIC_ASSERTION: 'BIOMETRIC_ASSERTION',
  AUTHORITY: 'AUTHORITY',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeGates(requiredGates) {
  if (!Array.isArray(requiredGates) || requiredGates.length === 0) {
    return [];
  }

  return [...new Set(
    requiredGates
      .filter((g) => typeof g === 'string' && g !== GATE_NAMES.NONE)
  )];
}

class GateEngine {
  constructor(opts = {}) {
    this.identity =
      opts.identityEngine || new IdentityEngine(opts.identity);
    this.consent =
      opts.consentEngine || new ConsentEngine();
    this.authority =
      opts.authorityEngine || new AuthorityEngine();
  }

  /**
   * Decision + runtime context → Gate verdict
   *
   * context:
   * {
   *   subject, device_id,
   *   purpose, recipient, scope, action,
   *   domain, resource,
   *   require_real_name?,
   *   policy_ok?, approval_ok?,
   *   deny?: boolean,
   *   deny_reason?: string,
   *   confidence?: number,   // must NEVER bypass gates
   *   now?
   * }
   */
  evaluate(decision, context = {}) {
    if (!isPlainObject(decision)) {
      throw new Error('decision must be a plain object');
    }

    if (!isPlainObject(context)) {
      throw new Error('context must be a plain object');
    }

    const now =
      context.now instanceof Date
        ? context.now
        : new Date(context.now || Date.now());

    if (Number.isNaN(now.getTime())) {
      throw new Error('context.now is invalid');
    }

    const required = normalizeGates(decision.required_gates);
    const missing = [];
    const checks = {};
    const audit = {
      decision_id: decision.id || null,
      domain: decision.domain || null,
      action: decision.action || context.action || null,
      required_gates: [...required],
      confidence: Number.isFinite(Number(context.confidence))
        ? Number(context.confidence)
        : null,
      confidence_bypassed_gates: false,
      evaluated_at: now.toISOString(),
    };

    // Explicit policy deny
    if (context.deny === true) {
      return clone({
        result: GATE_RESULT.DENY,
        missing_gates: [],
        checks,
        audit: {
          ...audit,
          deny_reason: context.deny_reason || 'policy_deny',
        },
        authority_granted: false,
        execute_ready: false,
      });
    }

    // High confidence must never skip gates
    if (
      Number(context.confidence) >= 0.99 &&
      required.length > 0
    ) {
      audit.confidence_note =
        'High confidence present but cannot bypass required gates';
    }

    for (const gate of required) {
      if (gate === GATE_NAMES.IDENTITY) {
        const verified = this.identity.verifyIdentity({
          subject: context.subject,
          device_id: context.device_id,
          require_real_name: context.require_real_name === true,
          now,
        });
        checks.IDENTITY = verified;
        if (!verified.ok) missing.push(GATE_NAMES.IDENTITY);
        continue;
      }

      if (gate === GATE_NAMES.BIOMETRIC_ASSERTION) {
        const bio = this.identity.verifyBiometricAssertion({
          device_id: context.device_id,
          subject: context.subject,
          now,
        });
        checks.BIOMETRIC_ASSERTION = bio;
        if (!bio.ok) missing.push(GATE_NAMES.BIOMETRIC_ASSERTION);
        continue;
      }

      if (gate === GATE_NAMES.CONSENT) {
        const consent = this.consent.verify({
          subject: context.subject,
          purpose: context.purpose,
          recipient: context.recipient,
          scope: context.scope,
          action: context.action || decision.action,
          decision_id: decision.id,
          now,
        });
        checks.CONSENT = consent;
        if (!consent.ok) missing.push(GATE_NAMES.CONSENT);
        continue;
      }

      if (gate === GATE_NAMES.AUTHORITY) {
        const authz = this.authority.verify({
          subject: context.subject,
          action: context.action || decision.action,
          scope: context.scope,
          domain: context.domain || decision.domain,
          resource: context.resource,
          now,
        });
        checks.AUTHORITY = authz;
        if (!authz.ok) missing.push(GATE_NAMES.AUTHORITY);
        continue;
      }

      if (gate === GATE_NAMES.POLICY) {
        const ok = context.policy_ok === true;
        checks.POLICY = {
          ok,
          reason: ok ? 'policy_ok' : 'policy_not_confirmed',
        };
        if (!ok) missing.push(GATE_NAMES.POLICY);
        continue;
      }

      if (gate === GATE_NAMES.APPROVAL) {
        const ok = context.approval_ok === true;
        checks.APPROVAL = {
          ok,
          reason: ok ? 'approval_ok' : 'approval_not_confirmed',
        };
        if (!ok) missing.push(GATE_NAMES.APPROVAL);
        continue;
      }

      // Unknown gate → HOLD
      checks[gate] = {
        ok: false,
        reason: 'unknown_gate',
      };
      missing.push(gate);
    }

    // Empty required gates (AUTO path) → ALLOW
    if (required.length === 0) {
      return clone({
        result: GATE_RESULT.ALLOW,
        missing_gates: [],
        checks,
        audit,
        authority_granted: false,
        execute_ready: false,
        note: 'No gates required; ALLOW does not mean executed',
      });
    }

    if (missing.length > 0) {
      return clone({
        result: GATE_RESULT.HOLD,
        missing_gates: missing,
        checks,
        audit,
        authority_granted: false,
        execute_ready: false,
      });
    }

    // Consume single-use consent only after all gates pass.
    if (
      checks.CONSENT &&
      checks.CONSENT.ok &&
      checks.CONSENT.consent &&
      checks.CONSENT.consent.single_use
    ) {
      this.consent.markUsed(checks.CONSENT.consent.id, now);
      checks.CONSENT.consent = this.consent.get(
        checks.CONSENT.consent.id
      );
    }

    return clone({
      result: GATE_RESULT.ALLOW,
      missing_gates: [],
      checks,
      audit,
      /**
       * ALLOW means gates passed.
       * It does NOT itself grant a new authority object,
       * and does NOT execute the action.
       */
      authority_granted: false,
      execute_ready: false,
      note: 'Gates passed; execution engine not invoked',
    });
  }

  clear() {
    this.identity.clear();
    this.consent.clear();
    this.authority.clear();
  }
}

module.exports = {
  GateEngine,
  GATE_RESULT,
  GATE_NAMES,
};
