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

const SOURCE_TYPE = Object.freeze({
  DEVICE:              'DEVICE',
  USER_STATEMENT:      'USER_STATEMENT',
  BIOMETRIC_ASSERTION: 'BIOMETRIC_ASSERTION',
  IDENTITY_PROVIDER:   'IDENTITY_PROVIDER',
  PLATFORM_API:        'PLATFORM_API',
  INSTITUTION:         'INSTITUTION',
  SENSOR:              'SENSOR',
  NETWORK:             'NETWORK',
  AI_INFERENCE:        'AI_INFERENCE',
  DERIVED:             'DERIVED',
});

/**
 * 생체 원본 데이터로 간주되는 필드명.
 * Evidence에 이 키가 존재하면 즉시 거부한다.
 * (ADR-001 §3 Biometric-Gated Credential)
 */
const BIOMETRIC_RAW_FIELDS = Object.freeze([
  'fingerprint_template',
  'face_embedding',
  'raw_biometric_data',
  'iris_template',
  'voice_print',
  'palm_template',
]);

module.exports = { AUTHORITY, CYCLE, RISK, SOURCE_TYPE, BIOMETRIC_RAW_FIELDS };
