'use strict';

/**
 * DecisionEngine
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 5
 *
 * World State / Evidence / Belief / Prediction을 받아
 * "무엇을 할 수 있는가"가 아니라
 * "무엇을 제안할 수 있고, 어떤 게이트를 통과해야 하는가"를 결정합니다.
 *
 * 핵심 원칙 (ADR-001):
 *   Confidence !== Truth
 *   Confidence !== Authority
 *   Probability !== Permission
 *
 * DecisionEngine은 실행 권한을 부여하지 않습니다.
 * Identity / Consent / Authority 게이트는 이후 계층에서 연결합니다.
 *
 * 모바일 ARKAON 모델:
 *   기본은 GENERAL_ASSISTANT (폰비서)
 *   위험 상황에서 SAFETY / FINANCIAL / LEGAL 등으로 승격
 */

const crypto = require('crypto');

const DOMAINS = Object.freeze({
  GENERAL_ASSISTANT: 'GENERAL_ASSISTANT',
  COMMUNICATION: 'COMMUNICATION',
  SAFETY: 'SAFETY',
  IDENTITY: 'IDENTITY',
  PRIVACY: 'PRIVACY',
  FINANCIAL: 'FINANCIAL',
  LEGAL: 'LEGAL',
  DEVICE: 'DEVICE',
  PLATFORM: 'PLATFORM',
});

const ACTIONS = Object.freeze({
  READ: 'READ',
  WRITE: 'WRITE',
  WARN: 'WARN',
  BLOCK: 'BLOCK',
  TRANSFER: 'TRANSFER',
  DELETE: 'DELETE',
  SHARE: 'SHARE',
  AUTHENTICATE: 'AUTHENTICATE',
  CONFIGURE: 'CONFIGURE',
  EXECUTE: 'EXECUTE',
});

const RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const REVERSIBILITY = Object.freeze({
  FULLY_REVERSIBLE: 'FULLY_REVERSIBLE',
  PARTIALLY_REVERSIBLE: 'PARTIALLY_REVERSIBLE',
  IRREVERSIBLE: 'IRREVERSIBLE',
});

/**
 * AUTO                  — 저위험·가역·읽기형 자동 수행 가능
 * POLICY_CHECK          — 사용자 정책/설정 확인 필요
 * USER_APPROVAL         — 명시적 사용자 승인 필요
 * IDENTITY_CONSENT_BIO  — 신원 + 동의 + 생체 assertion 게이트
 * DENY                  — 현재 컨텍스트에서 거부
 */
const EXECUTION_MODE = Object.freeze({
  AUTO: 'AUTO',
  POLICY_CHECK: 'POLICY_CHECK',
  USER_APPROVAL: 'USER_APPROVAL',
  IDENTITY_CONSENT_BIO: 'IDENTITY_CONSENT_BIO',
  DENY: 'DENY',
});

const REQUIRED_GATES = Object.freeze({
  NONE: 'NONE',
  POLICY: 'POLICY',
  APPROVAL: 'APPROVAL',
  IDENTITY: 'IDENTITY',
  CONSENT: 'CONSENT',
  BIOMETRIC_ASSERTION: 'BIOMETRIC_ASSERTION',
});

const DEFAULT_MAX_DECISIONS = 200;

/**
 * Domain × Action 기본 위험/가역성 매트릭스.
 * 입력이 명시하면 override 가능.
 */
const DEFAULT_MATRIX = Object.freeze({
  [`${DOMAINS.GENERAL_ASSISTANT}:${ACTIONS.READ}`]: {
    risk: RISK.LOW,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.GENERAL_ASSISTANT}:${ACTIONS.WRITE}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.COMMUNICATION}:${ACTIONS.READ}`]: {
    risk: RISK.LOW,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.COMMUNICATION}:${ACTIONS.WRITE}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.COMMUNICATION}:${ACTIONS.SHARE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.SAFETY}:${ACTIONS.WARN}`]: {
    risk: RISK.LOW,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.SAFETY}:${ACTIONS.BLOCK}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.SAFETY}:${ACTIONS.EXECUTE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.IDENTITY}:${ACTIONS.AUTHENTICATE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.IDENTITY}:${ACTIONS.READ}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.PRIVACY}:${ACTIONS.READ}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.PRIVACY}:${ACTIONS.SHARE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.PRIVACY}:${ACTIONS.DELETE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.FINANCIAL}:${ACTIONS.READ}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.FINANCIAL}:${ACTIONS.TRANSFER}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.FINANCIAL}:${ACTIONS.EXECUTE}`]: {
    risk: RISK.CRITICAL,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.LEGAL}:${ACTIONS.READ}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.LEGAL}:${ACTIONS.EXECUTE}`]: {
    risk: RISK.CRITICAL,
    reversibility: REVERSIBILITY.IRREVERSIBLE,
  },
  [`${DOMAINS.DEVICE}:${ACTIONS.CONFIGURE}`]: {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.DEVICE}:${ACTIONS.EXECUTE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
  [`${DOMAINS.PLATFORM}:${ACTIONS.READ}`]: {
    risk: RISK.LOW,
    reversibility: REVERSIBILITY.FULLY_REVERSIBLE,
  },
  [`${DOMAINS.PLATFORM}:${ACTIONS.EXECUTE}`]: {
    risk: RISK.HIGH,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  },
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function makeId(prefix = 'dec') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function riskRank(risk) {
  switch (risk) {
    case RISK.CRITICAL: return 4;
    case RISK.HIGH: return 3;
    case RISK.MEDIUM: return 2;
    case RISK.LOW: return 1;
    default: return 0;
  }
}

function maxRisk(a, b) {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function resolveDefaults(domain, action) {
  const key = `${domain}:${action}`;
  return DEFAULT_MATRIX[key] || {
    risk: RISK.MEDIUM,
    reversibility: REVERSIBILITY.PARTIALLY_REVERSIBLE,
  };
}

/**
 * Belief/Prediction의 높은 confidence는
 * 실행을 열지 않고, 설명용 근거로만 사용합니다.
 */
function summarizeCognitiveContext(beliefs, predictions) {
  const beliefList = Array.isArray(beliefs) ? beliefs : [];
  const predictionList = Array.isArray(predictions) ? predictions : [];

  const topBelief = beliefList
    .slice()
    .sort((a, b) => clamp01(b.confidence) - clamp01(a.confidence))[0] || null;

  const topPrediction = predictionList
    .slice()
    .sort((a, b) => clamp01(b.probability) - clamp01(a.probability))[0] || null;

  const contradiction = Math.max(
    0,
    ...beliefList.map((b) => clamp01(b.contradiction_score || 0))
  );

  const verifiedSupport = beliefList.some(
    (b) => Number(b.verified_evidence_count || 0) > 0
  );

  const aiOnly = beliefList.length > 0 && beliefList.every(
    (b) => Number(b.ai_evidence_count || 0) > 0 &&
      Number(b.verified_evidence_count || 0) === 0
  );

  return {
    top_belief_id: topBelief ? topBelief.id : null,
    top_belief_confidence: topBelief ? clamp01(topBelief.confidence) : 0,
    top_prediction_id: topPrediction ? topPrediction.id : null,
    top_prediction_probability: topPrediction
      ? clamp01(topPrediction.probability)
      : 0,
    contradiction_score: contradiction,
    has_verified_support: verifiedSupport,
    ai_only_support: aiOnly,
    belief_ids: beliefList.map((b) => b.id).filter(Boolean),
    prediction_ids: predictionList.map((p) => p.id).filter(Boolean),
  };
}

/**
 * 실행 모드와 필수 게이트를 결정합니다.
 * Confidence는 여기서 권한을 열지 않습니다.
 */
function resolveExecution(intent, cognitive) {
  const { domain, action, risk, reversibility } = intent;

  // FINANCIAL transfer / LEGAL execute / CRITICAL → identity + consent + bio
  if (
    risk === RISK.CRITICAL ||
    (domain === DOMAINS.FINANCIAL && action === ACTIONS.TRANSFER) ||
    (domain === DOMAINS.FINANCIAL && action === ACTIONS.EXECUTE) ||
    (domain === DOMAINS.LEGAL && action === ACTIONS.EXECUTE) ||
    (domain === DOMAINS.IDENTITY && action === ACTIONS.AUTHENTICATE) ||
    (domain === DOMAINS.PRIVACY && action === ACTIONS.SHARE) ||
    (domain === DOMAINS.PRIVACY && action === ACTIONS.DELETE)
  ) {
    return {
      execution_mode: EXECUTION_MODE.IDENTITY_CONSENT_BIO,
      required_gates: [
        REQUIRED_GATES.IDENTITY,
        REQUIRED_GATES.CONSENT,
        REQUIRED_GATES.BIOMETRIC_ASSERTION,
      ],
      auto_allowed: false,
    };
  }

  // HIGH risk or irreversible write-like → user approval
  if (
    risk === RISK.HIGH ||
    reversibility === REVERSIBILITY.IRREVERSIBLE
  ) {
    return {
      execution_mode: EXECUTION_MODE.USER_APPROVAL,
      required_gates: [REQUIRED_GATES.APPROVAL],
      auto_allowed: false,
    };
  }

  // SAFETY BLOCK / COMMUNICATION WRITE / DEVICE CONFIG → policy check
  if (
    risk === RISK.MEDIUM ||
    (domain === DOMAINS.SAFETY && action === ACTIONS.BLOCK) ||
    (domain === DOMAINS.COMMUNICATION && action === ACTIONS.WRITE) ||
    (domain === DOMAINS.DEVICE && action === ACTIONS.CONFIGURE)
  ) {
    return {
      execution_mode: EXECUTION_MODE.POLICY_CHECK,
      required_gates: [REQUIRED_GATES.POLICY],
      auto_allowed: false,
    };
  }

  // LOW + fully reversible READ/WARN → auto possible
  if (
    risk === RISK.LOW &&
    reversibility === REVERSIBILITY.FULLY_REVERSIBLE &&
    (action === ACTIONS.READ || action === ACTIONS.WARN)
  ) {
    // AI-only support with contradiction: still auto for WARN/READ,
    // but reasoning notes uncertainty — never upgrades to execute.
    return {
      execution_mode: EXECUTION_MODE.AUTO,
      required_gates: [REQUIRED_GATES.NONE],
      auto_allowed: true,
      uncertainty_note:
        cognitive.contradiction_score > 0 || cognitive.ai_only_support
          ? 'Cognitive support is uncertain; action remains reversible advisory/read-only.'
          : null,
    };
  }

  return {
    execution_mode: EXECUTION_MODE.USER_APPROVAL,
    required_gates: [REQUIRED_GATES.APPROVAL],
    auto_allowed: false,
  };
}

function validateIntent(input) {
  if (!isPlainObject(input)) {
    throw new Error('intent must be a plain object');
  }

  if (
    typeof input.domain !== 'string' ||
    !Object.values(DOMAINS).includes(input.domain)
  ) {
    throw new Error('intent.domain is invalid');
  }

  if (
    typeof input.action !== 'string' ||
    !Object.values(ACTIONS).includes(input.action)
  ) {
    throw new Error('intent.action is invalid');
  }

  if (
    typeof input.title !== 'string' ||
    input.title.trim() === ''
  ) {
    throw new Error('intent.title is required');
  }

  if (input.risk !== undefined && !Object.values(RISK).includes(input.risk)) {
    throw new Error('intent.risk is invalid');
  }

  if (
    input.reversibility !== undefined &&
    !Object.values(REVERSIBILITY).includes(input.reversibility)
  ) {
    throw new Error('intent.reversibility is invalid');
  }

  return true;
}

class DecisionEngine {
  constructor(opts = {}) {
    this._decisions = new Map();
    this.maxDecisions =
      Number(opts.maxDecisions) > 0
        ? Number(opts.maxDecisions)
        : DEFAULT_MAX_DECISIONS;
  }

  /**
   * Intent + optional cognitive context → Decision
   *
   * Intent:
   * {
   *   domain, action, title, summary?,
   *   risk?, reversibility?,
   *   platform_id?, payload?,
   *   beliefs?, predictions?
   * }
   */
  evaluate(intentInput, opts = {}) {
    validateIntent(intentInput);

    const now =
      opts.now instanceof Date
        ? opts.now
        : new Date(opts.now || Date.now());

    if (Number.isNaN(now.getTime())) {
      throw new Error('opts.now is invalid');
    }

    const defaults = resolveDefaults(
      intentInput.domain,
      intentInput.action
    );

    const risk = intentInput.risk || defaults.risk;
    const reversibility =
      intentInput.reversibility || defaults.reversibility;

    const beliefs = Array.isArray(intentInput.beliefs)
      ? intentInput.beliefs
      : Array.isArray(opts.beliefs)
        ? opts.beliefs
        : [];

    const predictions = Array.isArray(intentInput.predictions)
      ? intentInput.predictions
      : Array.isArray(opts.predictions)
        ? opts.predictions
        : [];

    const cognitive = summarizeCognitiveContext(beliefs, predictions);

    // High contradiction does not raise risk for READ/WARN,
    // but can raise risk one step for WRITE/BLOCK/EXECUTE/TRANSFER.
    let effectiveRisk = risk;
    if (
      cognitive.contradiction_score >= 0.5 &&
      ![ACTIONS.READ, ACTIONS.WARN].includes(intentInput.action)
    ) {
      effectiveRisk = maxRisk(risk, RISK.MEDIUM);
      if (risk === RISK.HIGH) {
        effectiveRisk = RISK.CRITICAL;
      } else if (risk === RISK.MEDIUM) {
        effectiveRisk = RISK.HIGH;
      }
    }

    const intent = {
      domain: intentInput.domain,
      action: intentInput.action,
      risk: effectiveRisk,
      reversibility,
    };

    const execution = resolveExecution(intent, cognitive);

    const decision = {
      id: intentInput.id || makeId(),
      platform_id: intentInput.platform_id || null,
      domain: intentInput.domain,
      action: intentInput.action,
      title: intentInput.title.trim(),
      summary:
        typeof intentInput.summary === 'string'
          ? intentInput.summary
          : '',
      risk: effectiveRisk,
      requested_risk: risk,
      reversibility,
      execution_mode: execution.execution_mode,
      required_gates: [...execution.required_gates],
      auto_allowed: execution.auto_allowed === true,
      uncertainty_note: execution.uncertainty_note || null,
      payload: clone(intentInput.payload || {}),
      cognitive: clone(cognitive),
      reasoning: this._buildReasoning(
        intentInput,
        effectiveRisk,
        reversibility,
        execution,
        cognitive
      ),
      /**
       * Decision은 Authority를 부여하지 않는다.
       * Confidence/Probability는 여기 있어도 실행 키가 아니다.
       */
      authority_granted: false,
      confidence_grants_authority: false,
      created_at: now.toISOString(),
      model: 'MOBILE_DOMAIN_DECISION_V1',
    };

    this._store(decision);
    return clone(decision);
  }

  /**
   * 여러 intent를 평가하고 risk/execution severity로 정렬합니다.
   */
  evaluateMany(intents, opts = {}) {
    if (!Array.isArray(intents)) {
      throw new Error('intents must be an array');
    }

    const decisions = intents.map((intent) =>
      this.evaluate(intent, opts)
    );

    return this.rank(decisions);
  }

  _buildReasoning(intent, risk, reversibility, execution, cognitive) {
    const parts = [
      `domain=${intent.domain}`,
      `action=${intent.action}`,
      `risk=${risk}`,
      `reversibility=${reversibility}`,
      `mode=${execution.execution_mode}`,
    ];

    if (cognitive.top_belief_confidence > 0) {
      parts.push(
        `belief_confidence=${cognitive.top_belief_confidence}`
      );
    }

    if (cognitive.contradiction_score > 0) {
      parts.push(
        `contradiction=${cognitive.contradiction_score}`
      );
    }

    parts.push('confidence_is_not_authority=true');

    return parts.join('; ');
  }

  _store(decision) {
    this._decisions.set(decision.id, clone(decision));

    while (this._decisions.size > this.maxDecisions) {
      const oldest = this._decisions.keys().next().value;
      this._decisions.delete(oldest);
    }
  }

  get(id) {
    const item = this._decisions.get(id);
    return item ? clone(item) : null;
  }

  list(filter = {}) {
    let rows = [...this._decisions.values()].map(clone);

    if (filter.domain !== undefined) {
      rows = rows.filter((d) => d.domain === filter.domain);
    }

    if (filter.execution_mode !== undefined) {
      rows = rows.filter(
        (d) => d.execution_mode === filter.execution_mode
      );
    }

    if (filter.platform_id !== undefined) {
      rows = rows.filter(
        (d) => d.platform_id === filter.platform_id
      );
    }

    return rows;
  }

  rank(decisions) {
    const rows = Array.isArray(decisions)
      ? decisions.map(clone)
      : this.list();

    const modeRank = {
      [EXECUTION_MODE.DENY]: 5,
      [EXECUTION_MODE.IDENTITY_CONSENT_BIO]: 4,
      [EXECUTION_MODE.USER_APPROVAL]: 3,
      [EXECUTION_MODE.POLICY_CHECK]: 2,
      [EXECUTION_MODE.AUTO]: 1,
    };

    return rows.sort((a, b) => {
      const riskDiff = riskRank(b.risk) - riskRank(a.risk);
      if (riskDiff !== 0) return riskDiff;
      return (modeRank[b.execution_mode] || 0) -
        (modeRank[a.execution_mode] || 0);
    });
  }

  remove(id) {
    return this._decisions.delete(id);
  }

  clear() {
    this._decisions.clear();
  }
}

module.exports = {
  DecisionEngine,
  DOMAINS,
  ACTIONS,
  RISK,
  REVERSIBILITY,
  EXECUTION_MODE,
  REQUIRED_GATES,
  DEFAULT_MATRIX,
  clamp01,
  resolveDefaults,
  resolveExecution,
  summarizeCognitiveContext,
};
