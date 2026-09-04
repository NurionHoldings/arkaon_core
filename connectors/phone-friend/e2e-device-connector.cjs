'use strict';

/**
 * E2eDeviceConnector
 * ─────────────────────────────────────────────────
 * PHONE FRIEND — unified in-memory device surface for E2E.
 *
 * Delegates to Memory Calendar / Messaging / Safety / Document
 * connectors under one composition root. Android adapter will
 * later replace this with the same execute/verify/rollback contract.
 */

const {
  MemoryCalendarConnector,
  MemoryMessagingConnector,
} = require('./memory-connectors.cjs');

const {
  MemorySafetyConnector,
} = require('./memory-safety-connector.cjs');

const {
  MemoryDocumentConnector,
} = require('./memory-document-connector.cjs');

const {
  MemoryContactConnector,
} = require('./memory-contact-connector.cjs');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function pickBackend(skill, backends) {
  const s = String(skill || '');

  if (s.startsWith('CALENDAR_')) {
    return backends.calendar;
  }

  if (s.startsWith('MESSAGE_')) {
    return backends.messaging;
  }

  if (
    s === 'URL_SCAN' ||
    s === 'TEXT_SCAN' ||
    s === 'FILE_SCAN' ||
    s === 'APK_SCAN' ||
    s === 'PHONE_SCREEN'
  ) {
    return backends.safety;
  }

  if (
    s === 'DOCUMENT_CONVERT' ||
    s === 'DOCUMENT_SIMPLIFY' ||
    s === 'DOCUMENT_ACCESSIBILITY' ||
    s === 'IMAGE_TO_DOCUMENT'
  ) {
    return backends.document;
  }

  if (s === 'CONTACT_READ') {
    return backends.contact;
  }

  return null;
}

class E2eDeviceConnector {
  constructor(opts = {}) {
    this.calendar =
      opts.calendar ||
      new MemoryCalendarConnector({
        events: opts.seedEvents || [
          {
            id: 'e-today',
            title: '기존 미팅',
            start_at: '2026-09-04T10:00:00+09:00',
          },
        ],
      });

    this.messaging =
      opts.messaging ||
      new MemoryMessagingConnector({
        messages: opts.seedMessages || [
          {
            id: 'm-in',
            direction: 'INBOUND',
            from: '엄마',
            to: 'SELF',
            content: '언제 와?',
            sent_at: '2026-09-04T09:00:00+09:00',
          },
        ],
      });

    this.safety =
      opts.safety || new MemorySafetyConnector();

    this.document =
      opts.document || new MemoryDocumentConnector();

    this.contact =
      opts.contact || new MemoryContactConnector(opts.contactOpts || {});

    this.name = 'e2e-device';
  }

  /**
   * Register under Capability service connector names.
   */
  asConnectorMap() {
    const self = this;
    const proxy = {
      async execute(action) {
        return self.execute(action);
      },
      async verify(action, result) {
        return self.verify(action, result);
      },
      async rollback(action, result) {
        return self.rollback(action, result);
      },
    };

    return {
      'phone-friend-calendar': proxy,
      'phone-friend-messaging': proxy,
      'phone-friend-safety': proxy,
      'phone-friend-document': proxy,
      'phone-friend-contact': proxy,
      'phone-friend-device': proxy,
    };
  }

  async execute(action) {
    const backend = pickBackend(
      action && action.skill,
      this
    );

    if (!backend || typeof backend.execute !== 'function') {
      return {
        ok: false,
        error: 'e2e_skill_not_bound',
        skill: action && action.skill,
      };
    }

    return backend.execute(action);
  }

  async verify(action, result) {
    const backend = pickBackend(
      action && action.skill,
      this
    );

    if (!backend || typeof backend.verify !== 'function') {
      return { ok: false, reason: 'verify_backend_missing' };
    }

    return backend.verify(action, result);
  }

  async rollback(action, result) {
    const backend = pickBackend(
      action && action.skill,
      this
    );

    if (!backend || typeof backend.rollback !== 'function') {
      const err = new Error('connector rollback is not available');
      err.code = 'ROLLBACK_UNAVAILABLE';
      throw err;
    }

    return backend.rollback(action, result);
  }

  snapshot() {
    return clone({
      calendar: this.calendar.list(),
      messaging: this.messaging.list
        ? this.messaging.list()
        : null,
      documents: this.document.list(),
      contacts: this.contact.list(),
      messaging_send_count: this.messaging.send_count || 0,
      safety_scan_count: this.safety.scan_count || 0,
    });
  }
}

module.exports = {
  E2eDeviceConnector,
};
