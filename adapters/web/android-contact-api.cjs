'use strict';

/**
 * Android Contact Web Adapter v0.1
 * ─────────────────────────────────────────────────
 * Device Bridge dedicated endpoint.
 *
 * Android already performed READ_CONTACTS.
 * This adapter:
 *   - accepts ephemeral contact snapshot
 *   - runs existing ContactAnalyzer
 *   - returns CONTACT_PROPOSE candidates
 *   - does NOT persist address books
 *   - does NOT merge/delete
 *   - never grants Authority
 */

const {
  ContactAnalyzer,
  CONTACT_METHOD,
} = require('../../products/phone-friend/contacts/contact-analyzer.cjs');

const {
  sanitizeAndroidContact,
  ANDROID_CONTACT_PERMISSION,
} = require('../android/contact-adapter-contract.cjs');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeMethod(value) {
  const method = String(value || CONTACT_METHOD.DUPLICATES)
    .trim()
    .toUpperCase();

  if (!Object.values(CONTACT_METHOD).includes(method)) {
    throw new Error('invalid contact analysis method');
  }

  return method;
}

function sanitizeSnapshot(contacts) {
  if (!Array.isArray(contacts)) {
    throw new Error('contacts must be an array');
  }

  return contacts.map((item) => {
    const sanitized = sanitizeAndroidContact({
      id: item.id,
      name: item.name || item.display_name || '',
      display_name: item.display_name || item.name || '',
      phones: Array.isArray(item.phones) ? item.phones : [],
    });

    /**
     * Minimal fields only for analyze path.
     */
    return {
      id: sanitized.id,
      name: sanitized.name,
      phones: sanitized.phones,
    };
  });
}

function mapProposal(candidate) {
  const contacts = Array.isArray(candidate.contacts)
    ? candidate.contacts
    : candidate.contact
      ? [candidate.contact]
      : [];

  const names = contacts
    .map((c) => String((c && (c.name || c.display_name)) || '').trim())
    .filter((name, index, list) => list.indexOf(name) === index);

  const phones = Array.isArray(candidate.common_phones)
    ? [...candidate.common_phones]
    : contacts
        .flatMap((c) => (Array.isArray(c.phones) ? c.phones : []))
        .map((p) => String(p || '').trim())
        .filter(Boolean);

  return clone({
    id: candidate.id,
    type: candidate.type || 'DUPLICATE_CANDIDATE',
    contact_ids: Array.isArray(candidate.contact_ids)
      ? [...candidate.contact_ids]
      : contacts.map((c) => String(c.id)),
    names,
    phones: [...new Set(phones)],
    score: Number.isFinite(candidate.score) ? candidate.score : 0,
    level: candidate.level || 'LOW',
    proposal_only: true,
    merge_allowed: false,
    delete_allowed: false,
    authority_granted: false,
  });
}

class AndroidContactApi {
  constructor(opts = {}) {
    this.analyzer = opts.analyzer || new ContactAnalyzer();
  }

  analyze(input = {}) {
    const method = normalizeMethod(input.method);

    /**
     * If client explicitly says permission was not granted,
     * do not analyze even if contacts arrived.
     */
    if (input.permission_granted === false) {
      return clone({
        ok: false,
        method,
        candidate_count: 0,
        proposals: [],
        mutated: false,
        authority_granted: false,
        permission_required: ANDROID_CONTACT_PERMISSION.READ,
        error: 'permission_required',
        assistant_text:
          '연락처를 읽으려면 권한이 필요해요. 읽기만 하고 수정하거나 삭제하지 않을게요.',
      });
    }

    let snapshot;
    try {
      snapshot = sanitizeSnapshot(input.contacts || []);
    } catch {
      return clone({
        ok: false,
        method,
        candidate_count: 0,
        proposals: [],
        mutated: false,
        authority_granted: false,
        error: 'invalid_contact_snapshot',
        assistant_text:
          '연락처 형식을 확인하지 못했어요. 연락처는 변경하지 않았어요.',
      });
    }

    try {
      const analysis = this.analyzer.analyze(snapshot, {
        method,
        now: input.now,
      });

      const proposals = this.analyzer
        .propose(analysis, { limit: input.limit })
        .map(mapProposal);

      const count = analysis.candidate_count || 0;

      return clone({
        ok: true,
        method,
        candidate_count: count,
        proposals,
        mutated: false,
        merge_executed: false,
        delete_executed: false,
        authority_granted: false,
        assistant_text:
          count > 0
            ? `중복 가능성이 있는 연락처 ${count}쌍을 찾았어요. 아직 아무것도 합치거나 삭제하지 않았어요.`
            : '지금 기준으로 정리 후보를 찾지 못했어요. 연락처는 변경하지 않았어요.',
      });
    } finally {
      /**
       * Ephemeral only — discard local reference.
       */
      snapshot = null;
    }
  }

  createNetlifyHandler() {
    const api = this;

    return async function handler(event) {
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      };

      if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
      }

      if (event.httpMethod !== 'POST') {
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({
            ok: false,
            candidate_count: 0,
            proposals: [],
            mutated: false,
            authority_granted: false,
            error: 'method_not_allowed',
          }),
        };
      }

      let body = {};
      try {
        body =
          typeof event.body === 'string'
            ? JSON.parse(event.body || '{}')
            : event.body || {};
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            ok: false,
            candidate_count: 0,
            proposals: [],
            mutated: false,
            authority_granted: false,
            error: 'invalid_json',
          }),
        };
      }

      try {
        const view = api.analyze({
          method: body.method,
          contacts: body.contacts,
          permission_granted: body.permission_granted,
          now: body.now,
          limit: body.limit,
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(view),
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            ok: false,
            candidate_count: 0,
            proposals: [],
            mutated: false,
            authority_granted: false,
            error: 'analyze_failed',
            assistant_text:
              '지금은 분석을 완료하지 못했어요. 연락처는 변경하지 않았어요.',
          }),
        };
      }
    };
  }
}

module.exports = {
  AndroidContactApi,
  sanitizeSnapshot,
  mapProposal,
  normalizeMethod,
};
