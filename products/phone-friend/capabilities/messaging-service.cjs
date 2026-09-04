'use strict';

/**
 * MessagingService
 * ─────────────────────────────────────────────
 * PHONE FRIEND — MESSAGING
 *
 * MESSAGE_READ / MESSAGE_SEND intent 생성.
 *
 * 발송은 recipient + content가 반드시 확정돼야 한다.
 */

const {
  SKILL_ACTION,
  CAPABILITY,
} = require('./catalog.cjs');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value || '').trim();
}

class MessagingService {
  createReadIntent(input = {}) {
    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.MESSAGING,

      capability:
        SKILL_ACTION.MESSAGE_READ,

      /**
       * Catalog default는 WRITE이므로 READ skill은 명시한다.
       */
      domain: 'COMMUNICATION',
      action: 'READ',

      title:
        '문자 조회',

      raw_text:
        input.raw_text ||
        input.utterance ||
        '최근 문자 조회',

      slots: {
        recipient:
          input.recipient ||
          null,

        limit:
          Number.isInteger(
            input.limit
          ) &&
          input.limit > 0
            ? input.limit
            : 10,
      },

      authority_granted:
        false,
    });
  }

  createSendIntent(input = {}) {
    const recipient =
      normalize(
        input.recipient
      );

    const content =
      normalize(
        input.content
      );

    if (!recipient) {
      return clone({
        ok: false,

        needs_slot:
          'recipient',

        question:
          '누구에게 보낼까요?',

        capability:
          SKILL_ACTION.MESSAGE_SEND,

        authority_granted:
          false,
      });
    }

    if (!content) {
      return clone({
        ok: false,

        needs_slot:
          'content',

        question:
          `${recipient}님께 어떤 내용을 보낼까요?`,

        capability:
          SKILL_ACTION.MESSAGE_SEND,

        authority_granted:
          false,
      });
    }

    return clone({
      ok: true,

      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.MESSAGING,

      capability:
        SKILL_ACTION.MESSAGE_SEND,

      domain: 'COMMUNICATION',
      action: 'WRITE',

      title:
        `${recipient}에게 문자 보내기`,

      raw_text:
        input.raw_text ||
        input.utterance ||
        content,

      slots: {
        recipient,
        content,
      },

      authority_granted:
        false,
    });
  }

  async read(runtime, input = {}) {
    if (
      !runtime ||
      typeof runtime.executeIntent !==
        'function'
    ) {
      throw new Error(
        'capability runtime is required'
      );
    }

    return runtime.executeIntent({
      intent:
        this.createReadIntent(
          input
        ),

      subject:
        input.subject,

      device_id:
        input.device_id,

      connector:
        input.connector ||
        'phone-friend-messaging',

      idempotency_key:
        input.idempotency_key ||
        `message-read:${input.subject || 'anon'}:${Date.parse(input.now || new Date()) || 0}`,

      gate_context:
        input.gate_context ||
        {},

      now:
        input.now,
    });
  }

  async send(runtime, input = {}) {
    const intent =
      this.createSendIntent(
        input
      );

    if (
      intent.ok === false
    ) {
      return clone({
        status:
          'NEEDS_SLOT',

        needs_slot:
          intent.needs_slot,

        question:
          intent.question,

        authority_granted:
          false,
      });
    }

    if (
      typeof input.idempotency_key !==
        'string' ||
      input.idempotency_key.trim() ===
        ''
    ) {
      throw new Error(
        'message send requires idempotency_key'
      );
    }

    return runtime.executeIntent({
      intent,

      subject:
        input.subject,

      device_id:
        input.device_id,

      connector:
        input.connector ||
        'phone-friend-messaging',

      idempotency_key:
        input.idempotency_key,

      gate_context: {
        ...(input.gate_context ||
          {}),

        policy_ok:
          input.policy_ok ===
          true ||
          Boolean(
            input.gate_context &&
            input.gate_context
              .policy_ok
          ),
      },

      now:
        input.now,
    });
  }
}

module.exports = {
  MessagingService,
};
