'use strict';

/**
 * ContactAnalyzer v0.1
 * ─────────────────────────────────────────────────
 *
 * Pure local analysis.
 *
 * 입력 연락처를 변경하지 않는다.
 *
 * 탐지:
 * - 동일/정규화 전화번호
 * - 이름 완전 일치
 * - 이름 유사
 * - 이름 없는 연락처
 * - 장기간 사용하지 않은 후보
 *
 * 결과는 후보(Propose)일 뿐 사실/Authority가 아니다.
 */

const CONTACT_METHOD = Object.freeze({
  DUPLICATES: 'DUPLICATES',
  NO_NAME: 'NO_NAME',
  INACTIVE: 'INACTIVE',
});

const DUPLICATE_LEVEL = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const DEFAULT_INACTIVE_DAYS = 365;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 한국 번호 중심의 최소 정규화.
 * +82 10-1234-5678 → 01012345678
 */
function normalizePhone(raw) {
  let value = String(raw || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (!value) return '';

  if (value.startsWith('+82')) {
    value = `0${value.slice(3)}`;
  } else if (value.startsWith('82') && value.length >= 11) {
    value = `0${value.slice(2)}`;
  }

  return value.replace(/\D/g, '');
}

function normalizeName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s()[\]{}._-]/g, '')
    .replace(/(회사|직장|업무|개인)$/g, '');
}

function hasName(contact) {
  const name = String(
    (contact && (contact.name || contact.display_name)) || ''
  ).trim();
  return name.length > 0;
}

function levenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () =>
    new Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function nameSimilarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLength = Math.max(a.length, b.length);
  return clamp01(1 - levenshtein(a, b) / maxLength);
}

function phoneSet(contact) {
  const values = [];

  if (Array.isArray(contact && contact.phones)) {
    values.push(...contact.phones);
  }

  if (contact && contact.phone) {
    values.push(contact.phone);
  }

  return new Set(values.map(normalizePhone).filter(Boolean));
}

function commonPhones(a, b) {
  const one = phoneSet(a);
  const two = phoneSet(b);
  return [...one].filter((number) => two.has(number));
}

function duplicateScore(a, b) {
  const phones = commonPhones(a, b);
  const similarity = nameSimilarity(
    a.name || a.display_name,
    b.name || b.display_name
  );

  let score = 0;
  const reasons = [];

  if (phones.length > 0) {
    score += 0.75;
    reasons.push({
      code: 'SAME_NORMALIZED_PHONE',
      weight: 0.75,
      phones,
    });
  }

  if (similarity === 1) {
    score += 0.2;
    reasons.push({
      code: 'SAME_NORMALIZED_NAME',
      weight: 0.2,
    });
  } else if (similarity >= 0.65) {
    score += 0.12;
    reasons.push({
      code: 'SIMILAR_NAME',
      weight: 0.12,
      similarity,
    });
  }

  /**
   * 전화번호 없이 이름만 같은 경우는
   * 자동 중복으로 강하게 취급하지 않는다.
   */
  if (phones.length === 0 && similarity === 1) {
    score = Math.min(score, 0.45);
  }

  return {
    score: clamp01(score),
    reasons,
    name_similarity: similarity,
    common_phones: phones,
  };
}

function duplicateLevel(score) {
  const value = clamp01(score);
  if (value >= 0.75) return DUPLICATE_LEVEL.HIGH;
  if (value >= 0.45) return DUPLICATE_LEVEL.MEDIUM;
  return DUPLICATE_LEVEL.LOW;
}

function contactLastActivity(contact) {
  const values = [
    contact && contact.last_contacted_at,
    contact && contact.last_call_at,
    contact && contact.last_message_at,
    contact && contact.updated_at,
  ]
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  if (values.length === 0) return null;
  return Math.max(...values);
}

class ContactAnalyzer {
  analyze(contacts, opts = {}) {
    if (!Array.isArray(contacts)) {
      throw new Error('contacts must be an array');
    }

    const method = String(
      opts.method || CONTACT_METHOD.DUPLICATES
    ).toUpperCase();

    if (!Object.values(CONTACT_METHOD).includes(method)) {
      throw new Error('invalid contact analysis method');
    }

    const copied = contacts.map(clone);

    if (method === CONTACT_METHOD.DUPLICATES) {
      return this._duplicates(copied);
    }

    if (method === CONTACT_METHOD.NO_NAME) {
      return this._noName(copied);
    }

    return this._inactive(copied, opts);
  }

  _duplicates(contacts) {
    const candidates = [];

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const result = duplicateScore(contacts[i], contacts[j]);

        if (result.score < 0.45) continue;

        candidates.push({
          id: `dup:${contacts[i].id}:${contacts[j].id}`,
          type: 'DUPLICATE_CANDIDATE',
          contact_ids: [contacts[i].id, contacts[j].id],
          contacts: [clone(contacts[i]), clone(contacts[j])],
          score: result.score,
          level: duplicateLevel(result.score),
          reasons: clone(result.reasons),
          name_similarity: result.name_similarity,
          common_phones: clone(result.common_phones),
          mutate: false,
          authority_granted: false,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      method: CONTACT_METHOD.DUPLICATES,
      total_contacts: contacts.length,
      candidate_count: candidates.length,
      candidates,
      mutated: false,
      authority_granted: false,
    };
  }

  _noName(contacts) {
    const candidates = contacts
      .filter((contact) => !hasName(contact))
      .map((contact) => ({
        id: `noname:${contact.id}`,
        type: 'NO_NAME_CANDIDATE',
        contact: clone(contact),
        score: 1,
        level: DUPLICATE_LEVEL.HIGH,
        mutate: false,
        authority_granted: false,
      }));

    return {
      method: CONTACT_METHOD.NO_NAME,
      total_contacts: contacts.length,
      candidate_count: candidates.length,
      candidates,
      mutated: false,
      authority_granted: false,
    };
  }

  _inactive(contacts, opts = {}) {
    const now = opts.now ? new Date(opts.now) : new Date();

    if (Number.isNaN(now.getTime())) {
      throw new Error('opts.now is invalid');
    }

    const inactiveDays = Number.isFinite(Number(opts.inactive_days))
      ? Math.max(1, Number(opts.inactive_days))
      : DEFAULT_INACTIVE_DAYS;

    const cutoff = now.getTime() - inactiveDays * 24 * 60 * 60 * 1000;

    const candidates = contacts
      .map((contact) => ({
        contact,
        last: contactLastActivity(contact),
      }))
      .filter((item) => item.last === null || item.last < cutoff)
      .map((item) => ({
        id: `inactive:${item.contact.id}`,
        type: 'INACTIVE_CANDIDATE',
        contact: clone(item.contact),
        last_activity_at: item.last
          ? new Date(item.last).toISOString()
          : null,
        inactive_days_threshold: inactiveDays,
        mutate: false,
        authority_granted: false,
      }));

    return {
      method: CONTACT_METHOD.INACTIVE,
      total_contacts: contacts.length,
      candidate_count: candidates.length,
      candidates,
      mutated: false,
      authority_granted: false,
    };
  }

  propose(analysis, opts = {}) {
    if (!analysis || !Array.isArray(analysis.candidates)) {
      throw new Error('analysis.candidates is required');
    }

    const limit =
      Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 20;

    return analysis.candidates.slice(0, limit).map((candidate) => ({
      ...clone(candidate),

      /**
       * 모든 제안은 preview only.
       */
      proposal_only: true,
      merge_allowed: false,
      delete_allowed: false,
      authority_granted: false,
    }));
  }
}

module.exports = {
  ContactAnalyzer,
  CONTACT_METHOD,
  DUPLICATE_LEVEL,
  DEFAULT_INACTIVE_DAYS,
  normalizePhone,
  normalizeName,
  hasName,
  levenshtein,
  nameSimilarity,
  phoneSet,
  commonPhones,
  duplicateScore,
  duplicateLevel,
  contactLastActivity,
};
