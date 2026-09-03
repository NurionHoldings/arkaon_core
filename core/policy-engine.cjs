const { AUTHORITY } = require('./constants.cjs');

const GLOBAL_HARD_POLICY = Object.freeze({
  max_autonomous_authority: AUTHORITY.L3_AUTONOMOUS,
  always_approval_domains: [
    'payment_refund',
    'settlement_finalization',
    'legal_decision',
    'account_delete',
    'bulk_data_delete',
    'credential_rotation',
    'privacy_export',
    'high_value_vendor_change',
  ],
});

function requiresHumanApproval(action = {}, platformPolicy = {}) {
  const skill = String(action.skill || '');
  if (GLOBAL_HARD_POLICY.always_approval_domains.includes(skill)) return true;
  if (action.risk === 'HIGH' || action.risk === 'CRITICAL') return true;
  if (platformPolicy.always_require_approval === true) return true;
  if ((platformPolicy.approval_actions || []).includes(skill)) return true;
  return false;
}

module.exports = { GLOBAL_HARD_POLICY, requiresHumanApproval };
