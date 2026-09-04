'use strict';

/**
 * DeviceBridgeContract v0.1
 * ─────────────────────────────────────────────────
 * Android Device Bridge ↔ PHONE FRIEND API envelope.
 *
 * Bridge never grants Authority.
 * Contact snapshots are ephemeral request payloads only.
 */

const {
  sanitizeAndroidContact,
  ANDROID_CONTACT_PERMISSION,
} = require('./contact-adapter-contract.cjs');

const BRIDGE_CAPABILITY = Object.freeze({
  CONTACT_ANALYZE: 'CONTACT_ANALYZE',
});

const BRIDGE_STATUS = Object.freeze({
  NEED_PERMISSION: 'NEED_PERMISSION',
  ANALYZING: 'ANALYZING',
  PROPOSED: 'PROPOSED',
  EMPTY: 'EMPTY',
  ERROR: 'ERROR',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeContactSnapshot(contacts) {
  if (!Array.isArray(contacts)) {
    throw new Error('contacts must be an array');
  }

  return contacts.map((item) => sanitizeAndroidContact(item));
}

function buildBridgeRequest(partial = {}) {
  return clone({
    capability: BRIDGE_CAPABILITY.CONTACT_ANALYZE,
    method: String(partial.method || 'DUPLICATES').toUpperCase(),
    permission_granted: partial.permission_granted === true,
    contacts: Array.isArray(partial.contacts) ? partial.contacts : [],
    utterance: partial.utterance || null,
    subject: partial.subject || null,
    device_id: partial.device_id || null,
    /**
     * Absolute: bridge never grants authority.
     */
    authority_granted: false,
  });
}

function buildBridgeResponse(partial = {}) {
  return clone({
    status: partial.status || BRIDGE_STATUS.ERROR,
    scenario: partial.scenario || 'CONTACT_MAINTENANCE',
    assistant_text: partial.assistant_text || '',
    progress: Array.isArray(partial.progress) ? partial.progress : [],
    proposals: Array.isArray(partial.proposals) ? partial.proposals : [],
    candidate_count: Number(partial.candidate_count) || 0,
    mutated: false,
    merge_executed: false,
    delete_executed: false,
    permission_required:
      partial.permission_required || ANDROID_CONTACT_PERMISSION.READ,
    /**
     * Absolute.
     */
    authority_granted: false,
  });
}

module.exports = {
  BRIDGE_CAPABILITY,
  BRIDGE_STATUS,
  ANDROID_CONTACT_PERMISSION,
  sanitizeContactSnapshot,
  buildBridgeRequest,
  buildBridgeResponse,
};
