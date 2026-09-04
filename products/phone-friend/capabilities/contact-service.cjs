'use strict';

/**
 * ContactService v0.1
 * ─────────────────────────────────────────────────
 * CONTACT_READ only for organize-scan.
 * Never deletes/merges without a later Gate path.
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

class ContactService {
  createReadScanIntent(input = {}) {
    return clone({
      product: 'PHONE_FRIEND',
      product_capability: 'DIGITAL_SUPPORT',
      capability: 'CONTACT_READ',
      domain: 'PRIVACY',
      action: 'READ',
      title: '연락처 읽기(정리 후보 조회)',
      raw_text: input.raw_text || '연락처 중복 후보 조회',
      slots: {
        op: 'scan_duplicates',
        method: input.method || 'DUPLICATES',
        mutate: false,
      },
      authority_granted: false,
    });
  }

  async scanDuplicates(runtime, input = {}) {
    if (!runtime || typeof runtime.executeIntent !== 'function') {
      throw new Error('capability runtime is required');
    }

    return runtime.executeIntent({
      intent: this.createReadScanIntent(input),
      subject: input.subject,
      device_id: input.device_id,
      connector: input.connector || 'phone-friend-contact',
      idempotency_key:
        input.idempotency_key ||
        `contact-scan:${input.subject || 'anon'}:${input.method || 'DUPLICATES'}`,
      gate_context: {
        ...(input.gate_context || {}),
        policy_ok:
          input.policy_ok === true ||
          Boolean(input.gate_context && input.gate_context.policy_ok),
      },
      retry_safe: true,
      reversible: true,
      verify_required: true,
      now: input.now,
    });
  }
}

module.exports = {
  ContactService,
};
