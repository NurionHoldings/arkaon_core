'use strict';

/**
 * StateStore Interface & MemoryStore Implementation
 * ─────────────────────────────────────────────────
 * ARKAON CORE — Cognitive State Engine
 *
 * StateStore는 WorldStateEngine이 플랫폼 상태를 저장·조회하는
 * 저장소 계약(contract)입니다.
 *
 * v0.1  : MemoryStore (in-process Map)
 * 이후  : PostgresStore / RedisStore / DeviceStore (ARKAON CALL)
 *
 * ──────────────────────────────────────────────
 * 핵심 원칙
 *   Confidence는 Truth가 아니며, Confidence는 Authority가 아니다.
 * ──────────────────────────────────────────────
 */

/**
 * StateStore 인터페이스 계약.
 * 모든 구현체는 아래 메서드를 반드시 제공해야 합니다.
 *
 * get(key)           → value | null
 * set(key, value)    → void
 * has(key)           → boolean
 * delete(key)        → boolean
 * keys()             → string[]
 * clear()            → void
 */
class StateStore {
  get(_key)    { throw new Error('StateStore.get() not implemented'); }
  set(_key, _v){ throw new Error('StateStore.set() not implemented'); }
  has(_key)    { throw new Error('StateStore.has() not implemented'); }
  delete(_key) { throw new Error('StateStore.delete() not implemented'); }
  keys()       { throw new Error('StateStore.keys() not implemented'); }
  clear()      { throw new Error('StateStore.clear() not implemented'); }
}

/**
 * MemoryStore — Map 기반 인메모리 구현.
 * 테스트·로컬 개발·단말 경량 모드에서 사용합니다.
 */
class MemoryStore extends StateStore {
  constructor() {
    super();
    this._map = new Map();
  }

  get(key) {
    const v = this._map.get(key);
    if (v === undefined) return null;
    // 방어적 복사: 외부 변경이 내부 상태를 오염시키지 않도록
    return JSON.parse(JSON.stringify(v));
  }

  set(key, value) {
    if (typeof key !== 'string' || key === '') {
      throw new Error('StateStore key must be a non-empty string');
    }
    // 방어적 복사: 저장 시점의 값을 격리
    this._map.set(key, JSON.parse(JSON.stringify(value)));
  }

  has(key) {
    return this._map.has(key);
  }

  delete(key) {
    return this._map.delete(key);
  }

  keys() {
    return [...this._map.keys()];
  }

  clear() {
    this._map.clear();
  }
}

module.exports = { StateStore, MemoryStore };
