'use strict';

/**
 * MemoryContactConnector v0.1
 * ─────────────────────────────────────────────────
 *
 * Android ContactsContract adapter 전
 * READ contract 검증용 in-memory connector.
 *
 * 지원:
 *   CONTACT_READ
 *
 * 미지원:
 *   CONTACT_MERGE
 *   CONTACT_DELETE
 *   CONTACT_WRITE
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_CONTACTS = [
  {
    id: 'contact-1',
    name: '홍길동',
    phones: ['010-1234-5678'],
    last_contacted_at: '2026-08-30T10:00:00+09:00',
  },
  {
    id: 'contact-2',
    name: '홍길동',
    phones: ['01012345678'],
    last_contacted_at: '2026-08-31T10:00:00+09:00',
  },
  {
    id: 'contact-3',
    name: '김철수(회사)',
    phones: ['+82 10-9999-1111'],
    last_contacted_at: '2026-09-01T10:00:00+09:00',
  },
  {
    id: 'contact-4',
    name: '김철수',
    phones: ['010-9999-1111'],
    last_contacted_at: '2026-08-29T10:00:00+09:00',
  },
  {
    id: 'contact-5',
    name: '',
    phones: ['010-5555-7777'],
    last_contacted_at: null,
  },
  {
    id: 'contact-6',
    name: '오래된 거래처',
    phones: ['010-3333-4444'],
    last_contacted_at: '2024-01-01T09:00:00+09:00',
  },
];

class MemoryContactConnector {
  constructor(opts = {}) {
    this._contacts = Array.isArray(opts.contacts)
      ? clone(opts.contacts)
      : clone(DEFAULT_CONTACTS);

    this.read_count = 0;

    /**
     * 현실 변경 카운트는 v0.1에서 항상 0이어야 한다.
     */
    this.mutation_count = 0;
  }

  list() {
    return clone(this._contacts);
  }

  async execute(action) {
    const skill = String((action && action.skill) || '');

    if (skill !== 'CONTACT_READ') {
      return {
        ok: false,
        error: 'contact_mutation_not_supported_v0_1',
        mutation_performed: false,
        authority_granted: false,
      };
    }

    const payload = clone(action.payload || {});

    if (payload.mutate === true) {
      return {
        ok: false,
        error: 'contact_read_cannot_mutate',
        mutation_performed: false,
        authority_granted: false,
      };
    }

    this.read_count += 1;

    return {
      ok: true,
      contacts: this.list(),
      count: this._contacts.length,
      permission: 'READ_ONLY',
      mutation_performed: false,
      authority_granted: false,
    };
  }

  async verify(action, result) {
    return {
      ok: Boolean(
        action &&
          action.skill === 'CONTACT_READ' &&
          result &&
          Array.isArray(result.contacts) &&
          result.mutation_performed === false
      ),
      verified: 'contact_read_completed',
      mutation_verified: false,
      authority_granted: false,
    };
  }

  /**
   * rollback이 필요할 일은 변경이 없으므로
   * rollback은 지원하지 않는다.
   */
}

module.exports = {
  MemoryContactConnector,
  DEFAULT_CONTACTS,
};
