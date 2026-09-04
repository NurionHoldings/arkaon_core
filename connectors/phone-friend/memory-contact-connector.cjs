'use strict';

/**
 * MemoryContactConnector
 * ─────────────────────────────────────────────────
 * In-memory contact book for CONTACT_READ scans.
 * Does not delete/merge contacts.
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_CONTACTS = [
  { id: 'c1', name: '김사장', phone: '010-1111-2222', city: '서울' },
  { id: 'c2', name: '김 사장', phone: '010-1111-2222', city: '서울' },
  { id: 'c3', name: '엄마', phone: '010-3333-4444', city: null },
  { id: 'c4', name: '어머니', phone: '010-3333-4444', city: null },
  { id: 'c5', name: '', phone: '010-5555-6666', city: null },
  { id: 'c6', name: '미저장', phone: '010-5555-6666', city: null },
  { id: 'c7', name: '약국', phone: '044-123-4567', city: '세종' },
  { id: 'c8', name: '세종약국', phone: '044-123-4567', city: '세종' },
  { id: 'c9', name: '친구A', phone: '010-7777-8888', last_contact_days: 400 },
  { id: 'c10', name: '친구A', phone: '010-7777-9999', last_contact_days: 10 },
  { id: 'c11', name: '동생', phone: '010-2222-3333', city: null },
  { id: 'c12', name: '남동생', phone: '010-2222-3333', city: null },
  { id: 'c13', name: '학교', phone: '042-000-1111', city: '대전' },
];

class MemoryContactConnector {
  constructor(opts = {}) {
    this._contacts = Array.isArray(opts.contacts)
      ? clone(opts.contacts)
      : clone(DEFAULT_CONTACTS);
  }

  list() {
    return clone(this._contacts);
  }

  async execute(action) {
    const skill = action && action.skill;
    const payload = clone((action && action.payload) || {});

    if (skill !== 'CONTACT_READ') {
      return { ok: false, error: 'contact_skill_not_bound' };
    }

    if (payload.mutate === true) {
      return {
        ok: false,
        error: 'contact_mutation_forbidden_in_read_scan',
        deleted: false,
        merged: false,
      };
    }

    const rows = this.list();
    const byPhone = new Map();

    for (const row of rows) {
      const phone = String(row.phone || '').trim();
      if (!phone) continue;
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(row);
    }

    const duplicateGroups = [];
    for (const [phone, group] of byPhone.entries()) {
      if (group.length >= 2) {
        duplicateGroups.push({
          phone,
          contacts: group,
        });
      }
    }

    return {
      ok: true,
      op: 'scan_duplicates',
      duplicate_group_count: duplicateGroups.length,
      duplicate_contact_count: duplicateGroups.reduce(
        (sum, group) => sum + group.contacts.length,
        0
      ),
      groups: clone(duplicateGroups),
      mutated: false,
      deleted: false,
      merged: false,
      authority_granted: false,
    };
  }

  async verify(action, result) {
    return {
      ok: Boolean(result && result.ok === true && result.mutated === false),
      verified: 'contact_read_scan_completed',
      mutated: false,
    };
  }
}

module.exports = {
  MemoryContactConnector,
  DEFAULT_CONTACTS,
};
