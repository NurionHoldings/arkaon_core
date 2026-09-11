'use strict';

/**
 * CalendarService
 * ─────────────────────────────────────────────
 * PHONE FRIEND — CALENDAR
 *
 * Service는 사용자 요청을 실행용 intent로 구조화할 뿐
 * connector를 직접 호출하지 않는다.
 */

const {
  SKILL_ACTION,
  CAPABILITY,
} = require('./catalog.cjs');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function requiredString(value, field) {
  const text = String(value || '').trim();

  if (!text) {
    throw new Error(`${field} is required`);
  }

  return text;
}

class CalendarService {
  createReadIntent(input = {}) {
    return clone({
      product: 'PHONE_FRIEND',
      product_capability:
        CAPABILITY.CALENDAR,

      capability:
        SKILL_ACTION.CALENDAR_READ,

      /**
       * Catalog default는 READ이지만 skill을 명시해
       * Capability Policy가 WRITE로 붕괴되지 않게 한다.
       */
      domain: 'GENERAL_ASSISTANT',
      action: 'READ',

      title:
        input.title ||
        '일정 조회',

      raw_text:
        input.raw_text ||
        input.utterance ||
        '일정 조회',

      slots: {
        date:
          input.date || null,

        start_at:
          input.start_at || null,

        end_at:
          input.end_at || null,
      },

      authority_granted: false,
    });
  }

  createWriteIntent(input = {}) {
    const title =
      requiredString(
        input.event_title ||
          input.title,
        'event_title'
      );

    const startAt =
      requiredString(
        input.start_at,
        'start_at'
      );

    if (
      Number.isNaN(
        Date.parse(startAt)
      )
    ) {
      throw new Error(
        'start_at is invalid'
      );
    }

    if (
      input.end_at &&
      Number.isNaN(
        Date.parse(
          input.end_at
        )
      )
    ) {
      throw new Error(
        'end_at is invalid'
      );
    }

    return clone({
      product: 'PHONE_FRIEND',

      product_capability:
        CAPABILITY.CALENDAR,

      capability:
        SKILL_ACTION.CALENDAR_WRITE,

      domain: 'GENERAL_ASSISTANT',
      action: 'WRITE',

      title:
        `일정 등록: ${title}`,

      raw_text:
        input.raw_text ||
        input.utterance ||
        title,

      slots: {
        event_title:
          title,

        start_at:
          startAt,

        end_at:
          input.end_at ||
          null,

        location:
          input.location ||
          null,

        notes:
          input.notes ||
          null,
      },

      authority_granted: false,
    });
  }

  /**
   * 실제 실행은 CapabilityRuntime에만 위임한다.
   */
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
        'phone-friend-calendar',

      idempotency_key:
        input.idempotency_key ||
        `calendar-read:${input.subject || 'anon'}:${input.date || 'all'}`,

      gate_context:
        input.gate_context ||
        {},

      now:
        input.now,
    });
  }

  async write(runtime, input = {}) {
    if (
      !runtime ||
      typeof runtime.executeIntent !==
        'function'
    ) {
      throw new Error(
        'capability runtime is required'
      );
    }

    if (
      typeof input.idempotency_key !==
        'string' ||
      input.idempotency_key.trim() ===
        ''
    ) {
      throw new Error(
        'calendar write requires idempotency_key'
      );
    }

    return runtime.executeIntent({
      intent:
        this.createWriteIntent(
          input
        ),

      subject:
        input.subject,

      device_id:
        input.device_id,

      connector:
        input.connector ||
        'phone-friend-calendar',

      idempotency_key:
        input.idempotency_key,

      gate_context: {
        ...(input.gate_context ||
          {}),

        /**
         * Calendar WRITE의 MEDIUM/POLICY_CHECK를
         * 통과하려면 사용자의 정책 확인이 필요하다.
         */
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
  CalendarService,
};
