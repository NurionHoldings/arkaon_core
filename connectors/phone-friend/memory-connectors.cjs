'use strict';

/**
 * PHONE FRIEND Memory Connectors
 * ────────────────────────────────────────────────
 *
 * Android Calendar / SMS Connector가 들어오기 전
 * 실행 계약을 검증하기 위한 in-memory 구현.
 */

const crypto = require('crypto');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

class MemoryCalendarConnector {
  constructor(opts = {}) {
    this._events =
      Array.isArray(
        opts.events
      )
        ? clone(
            opts.events
          )
        : [];

    this._writes =
      new Map();
  }

  list() {
    return clone(
      this._events
    );
  }

  async execute(action) {
    const skill =
      action.skill;

    const payload =
      clone(
        action.payload ||
        {}
      );

    if (
      skill ===
      'CALENDAR_READ'
    ) {
      let rows =
        this.list();

      if (payload.date) {
        const date =
          String(
            payload.date
          );

        rows =
          rows.filter(
            (event) =>
              String(
                event.start_at ||
                  ''
              ).startsWith(
                date
              )
          );
      }

      return {
        ok: true,
        events: rows,
      };
    }

    if (
      skill ===
      'CALENDAR_WRITE'
    ) {
      const key =
        action.idempotency_key;

      if (
        this._writes.has(
          key
        )
      ) {
        return clone(
          this._writes.get(
            key
          )
        );
      }

      if (
        !payload.event_title ||
        !payload.start_at
      ) {
        return {
          ok: false,
          error:
            'calendar_fields_missing',
        };
      }

      const event = {
        id:
          id('calendar'),

        title:
          payload
            .event_title,

        start_at:
          payload.start_at,

        end_at:
          payload.end_at ||
          null,

        location:
          payload.location ||
          null,

        notes:
          payload.notes ||
          null,

        created_at:
          new Date()
            .toISOString(),
      };

      this._events.push(
        clone(event)
      );

      const result = {
        ok: true,
        event:
          clone(event),
      };

      this._writes.set(
        key,
        clone(result)
      );

      return result;
    }

    return {
      ok: false,
      error:
        'calendar_skill_not_bound',
    };
  }

  async verify(
    action,
    result
  ) {
    if (
      action.skill ===
      'CALENDAR_READ'
    ) {
      return {
        ok: true,
        verified:
          'read_completed',
      };
    }

    if (
      action.skill ===
        'CALENDAR_WRITE' &&
      result &&
      result.event
    ) {
      const exists =
        this._events.some(
          (event) =>
            event.id ===
            result.event.id
        );

      return {
        ok: exists,
        verified:
          exists
            ? 'calendar_event_exists'
            : 'calendar_event_missing',
      };
    }

    return {
      ok: false,
    };
  }

  async rollback(
    action,
    result
  ) {
    if (
      action.skill !==
        'CALENDAR_WRITE' ||
      !result ||
      !result.event
    ) {
      return {
        ok: false,
        error:
          'calendar_rollback_not_applicable',
      };
    }

    const index =
      this._events.findIndex(
        (event) =>
          event.id ===
          result.event.id
      );

    if (index < 0) {
      return {
        ok: false,
        error:
          'calendar_event_not_found',
      };
    }

    this._events.splice(
      index,
      1
    );

    return {
      ok: true,
      removed_event_id:
        result.event.id,
    };
  }
}


class MemoryMessagingConnector {
  constructor(opts = {}) {
    this._messages =
      Array.isArray(
        opts.messages
      )
        ? clone(
            opts.messages
          )
        : [];

    this._sends =
      new Map();

    this.send_count = 0;
  }

  list() {
    return clone(
      this._messages
    );
  }

  async execute(action) {
    const skill =
      action.skill;

    const payload =
      clone(
        action.payload ||
        {}
      );

    if (
      skill ===
      'MESSAGE_READ'
    ) {
      let rows =
        this.list();

      if (
        payload.recipient
      ) {
        rows =
          rows.filter(
            (message) =>
              message.from ===
                payload.recipient ||
              message.to ===
                payload.recipient
          );
      }

      const limit =
        Number.isInteger(
          payload.limit
        ) &&
        payload.limit > 0
          ? payload.limit
          : 10;

      return {
        ok: true,

        messages:
          rows
            .slice(-limit)
            .reverse(),
      };
    }

    if (
      skill ===
      'MESSAGE_SEND'
    ) {
      const key =
        action.idempotency_key;

      if (
        this._sends.has(
          key
        )
      ) {
        return clone(
          this._sends.get(
            key
          )
        );
      }

      if (
        !payload.recipient ||
        !payload.content
      ) {
        return {
          ok: false,
          error:
            'message_fields_missing',
        };
      }

      const message = {
        id:
          id('message'),

        direction:
          'OUTBOUND',

        to:
          payload.recipient,

        from:
          'SELF',

        content:
          payload.content,

        sent_at:
          new Date()
            .toISOString(),
      };

      this._messages.push(
        clone(message)
      );

      this.send_count += 1;

      const result = {
        ok: true,
        message:
          clone(message),
      };

      this._sends.set(
        key,
        clone(result)
      );

      return result;
    }

    return {
      ok: false,
      error:
        'messaging_skill_not_bound',
    };
  }

  async verify(
    action,
    result
  ) {
    if (
      action.skill ===
      'MESSAGE_READ'
    ) {
      return {
        ok: true,
        verified:
          'message_read_completed',
      };
    }

    if (
      action.skill ===
        'MESSAGE_SEND' &&
      result &&
      result.message
    ) {
      const exists =
        this._messages.some(
          (message) =>
            message.id ===
            result.message.id
        );

      return {
        ok: exists,

        verified:
          exists
            ? 'message_send_recorded'
            : 'message_missing',
      };
    }

    return {
      ok: false,
    };
  }

  /**
   * 일반 SMS는 실제 발송 후 rollback 불가능하다고 본다.
   * 따라서 rollback() 자체를 제공하지 않는다.
   */
}

module.exports = {
  MemoryCalendarConnector,
  MemoryMessagingConnector,
};
