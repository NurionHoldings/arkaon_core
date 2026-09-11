'use strict';

/**
 * WorldStateEngine
 * ────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine · Layer 1
 *
 * 모든 플랫폼의 현재(current) / 이전(previous) / 이력(history) 상태를
 * 통합 관리합니다. 관찰(Observe) 결과가 여기에 병합되고,
 * Evidence·Belief·Prediction·Decision 엔진이 이 상태를 읽습니다.
 *
 * 저장소는 StateStore 인터페이스를 통해 주입되므로
 * Memory / PostgreSQL / Device 등 교체 가능합니다.
 *
 * ────────────────────────────────────────────────
 * 핵심 원칙
 *   Confidence는 Truth가 아니며, Confidence는 Authority가 아니다.
 * ────────────────────────────────────────────────
 */

const { MemoryStore } = require('./state-store.cjs');

const DEFAULT_MAX_HISTORY = 50;

/**
 * 깊은 복사 유틸 (JSON-safe 객체 전용)
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 두 객체(plain) 사이의 변경점을 계산합니다.
 * 반환: { added: {}, removed: {}, changed: { key: { from, to } } }
 * 중첩 객체는 1-depth 비교 후 값이 다르면 통째로 changed에 넣습니다.
 */
function computeDiff(prev, curr) {
  prev = prev || {};
  curr = curr || {};
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const added = {};
  const removed = {};
  const changed = {};

  for (const k of allKeys) {
    const inPrev = Object.prototype.hasOwnProperty.call(prev, k);
    const inCurr = Object.prototype.hasOwnProperty.call(curr, k);
    if (!inPrev && inCurr) {
      added[k] = clone(curr[k]);
    } else if (inPrev && !inCurr) {
      removed[k] = clone(prev[k]);
    } else if (JSON.stringify(prev[k]) !== JSON.stringify(curr[k])) {
      changed[k] = { from: clone(prev[k]), to: clone(curr[k]) };
    }
  }
  return { added, removed, changed };
}

/**
 * 숫자 배열의 단순 추세를 판정합니다.
 * 'increasing' | 'decreasing' | 'stable' | 'insufficient_data'
 */
function computeTrend(values) {
  if (!Array.isArray(values) || values.length < 2) return 'insufficient_data';
  let up = 0;
  let down = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
    else if (values[i] < values[i - 1]) down++;
  }
  const total = values.length - 1;
  if (up / total >= 0.6) return 'increasing';
  if (down / total >= 0.6) return 'decreasing';
  return 'stable';
}

class WorldStateEngine {
  /**
   * @param {object} opts
   * @param {import('./state-store.cjs').StateStore} [opts.store] - 저장소 (기본: MemoryStore)
   * @param {number} [opts.maxHistory] - 플랫폼당 최대 이력 보관 수 (기본 50)
   */
  constructor(opts = {}) {
    this.store = opts.store || new MemoryStore();
    this.maxHistory = Number(opts.maxHistory) || DEFAULT_MAX_HISTORY;
  }

  // ─── 내부 키 규칙 ──────────────────────────

  _key(platformId) { return `ws:${platformId}`; }

  // ─── 입력 검증 ─────────────────────────────

  _validatePlatformId(platformId) {
    if (typeof platformId !== 'string' || platformId.trim() === '') {
      throw new Error('platformId must be a non-empty string');
    }
  }

  _validateSnapshot(snapshot) {
    if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('snapshot must be a non-null plain object');
    }
  }

  // ─── 핵심 API ──────────────────────────────

  /**
   * 플랫폼 스냅샷을 세계 상태에 병합합니다.
   * 최초 호출 시 current를 생성하고,
   * 이후 호출 시 current → previous로 밀고 새 current를 설정합니다.
   *
   * @param {string} platformId
   * @param {object} snapshot - 플랫폼에서 수집한 스냅샷 (plain object)
   * @returns {{ current, previous, diff, updated_at }}
   */
  merge(platformId, snapshot) {
    this._validatePlatformId(platformId);
    this._validateSnapshot(snapshot);

    const key = this._key(platformId);
    const now = new Date().toISOString();
    const existing = this.store.get(key);

    if (!existing) {
      // 최초 스냅샷
      const entry = {
        platformId,
        current: clone(snapshot),
        previous: null,
        history: [],
        created_at: now,
        updated_at: now,
      };
      this.store.set(key, entry);
      return {
        current: clone(snapshot),
        previous: null,
        diff: { added: clone(snapshot), removed: {}, changed: {} },
        updated_at: now,
      };
    }

    // 기존 상태 업데이트
    const diff = computeDiff(existing.current, snapshot);
    const history = existing.history.slice(); // 복사
    history.push({ snapshot: clone(existing.current), recorded_at: existing.updated_at });

    // 최대 이력 제한
    while (history.length > this.maxHistory) {
      history.shift();
    }

    const updated = {
      platformId,
      current: clone(snapshot),
      previous: clone(existing.current),
      history,
      created_at: existing.created_at,
      updated_at: now,
    };
    this.store.set(key, updated);

    return {
      current: clone(snapshot),
      previous: clone(existing.current),
      diff,
      updated_at: now,
    };
  }

  /**
   * 현재 상태와 직전 상태의 차이를 반환합니다.
   * merge()를 한 번도 호출하지 않은 플랫폼이면 null.
   */
  diff(platformId) {
    this._validatePlatformId(platformId);
    const entry = this.store.get(this._key(platformId));
    if (!entry) return null;
    return computeDiff(entry.previous, entry.current);
  }

  /**
   * 이력에서 특정 메트릭(키)의 시계열 값을 추출하고 추세를 판정합니다.
   * @param {string} platformId
   * @param {string} metric - snapshot 내 1-depth 키 이름
   * @returns {{ values: any[], trend: string } | null}
   */
  trend(platformId, metric) {
    this._validatePlatformId(platformId);
    if (typeof metric !== 'string' || metric === '') {
      throw new Error('metric must be a non-empty string');
    }
    const entry = this.store.get(this._key(platformId));
    if (!entry) return null;

    const values = [];
    for (const h of entry.history) {
      if (h.snapshot && Object.prototype.hasOwnProperty.call(h.snapshot, metric)) {
        values.push(h.snapshot[metric]);
      }
    }
    // 현재값도 포함
    if (entry.current && Object.prototype.hasOwnProperty.call(entry.current, metric)) {
      values.push(entry.current[metric]);
    }

    return { values, trend: computeTrend(values) };
  }

  /**
   * 전체 세계 상태를 반환합니다.
   * @returns {object} { platforms: { [id]: entry } }
   */
  get() {
    const platforms = {};
    for (const key of this.store.keys()) {
      if (key.startsWith('ws:')) {
        const entry = this.store.get(key);
        platforms[entry.platformId] = clone(entry);
      }
    }
    return { platforms };
  }

  /**
   * 특정 플랫폼의 상태를 반환합니다.
   * @returns {object|null}
   */
  getByPlatform(platformId) {
    this._validatePlatformId(platformId);
    const entry = this.store.get(this._key(platformId));
    return entry ? clone(entry) : null;
  }
}

module.exports = { WorldStateEngine, computeDiff, computeTrend };
