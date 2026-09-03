const AUTHORITY = Object.freeze({
  L0_OBSERVE: 0,
  L1_ADVISE: 1,
  L2_APPROVAL_EXECUTION: 2,
  L3_AUTONOMOUS: 3,
});

const CYCLE = Object.freeze([
  'OBSERVE',
  'ANALYZE',
  'PROPOSE',
  'APPROVE',
  'EXECUTE',
  'VERIFY',
  'LEARN',
]);

const RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

module.exports = { AUTHORITY, CYCLE, RISK };
