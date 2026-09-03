const crypto = require('crypto');
const { AUTHORITY, RISK } = require('./constants.cjs');

function id(prefix='act') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeAction(input = {}) {
  return {
    action_id: input.action_id || id(),
    platform: String(input.platform || '').trim(),
    skill: String(input.skill || '').trim(),
    title: String(input.title || '').trim(),
    summary: String(input.summary || '').trim(),
    risk: input.risk || RISK.MEDIUM,
    requested_authority: Number(input.requested_authority ?? AUTHORITY.L1_ADVISE),
    required_approval: input.required_approval !== false,
    reversible: input.reversible !== false,
    payload: input.payload || {},
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    created_at: input.created_at || new Date().toISOString(),
    status: input.status || 'PROPOSED',
  };
}

function decide(action, policy) {
  const a = normalizeAction(action);
  const p = policy || {};
  const hardApproval =
    a.risk === RISK.CRITICAL ||
    a.risk === RISK.HIGH ||
    p.always_require_approval === true ||
    (Array.isArray(p.approval_actions) && p.approval_actions.includes(a.skill));

  const max = Number(p.max_autonomous_authority ?? AUTHORITY.L1_ADVISE);
  const autonomousAllowed =
    !hardApproval &&
    a.requested_authority <= max &&
    a.requested_authority === AUTHORITY.L3_AUTONOMOUS;

  return {
    ...a,
    required_approval: hardApproval || !autonomousAllowed,
    execution_mode: autonomousAllowed ? 'AUTO' : 'HUMAN_APPROVAL',
  };
}

function approve(action, actor='human-admin') {
  return {
    ...action,
    status: 'APPROVED',
    approved_by: actor,
    approved_at: new Date().toISOString(),
  };
}

function reject(action, actor='human-admin', reason='') {
  return {
    ...action,
    status: 'REJECTED',
    rejected_by: actor,
    rejected_at: new Date().toISOString(),
    rejection_reason: String(reason || '').slice(0, 1000),
  };
}

module.exports = { normalizeAction, decide, approve, reject };
