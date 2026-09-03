'use strict';

/**
 * WorldStateEngine 단위 테스트
 * ────────────────────────────────────────────────
 * 완료 조건 10개를 각각 검증합니다.
 *
 *  1. 플랫폼 최초 snapshot 입력
 *  2. current 상태 생성
 *  3. 두 번째 snapshot 입력
 *  4. previous/current 분리
 *  5. diff 정확히 계산
 *  6. history 보존
 *  7. history 최대치 제한
 *  8. 잘못된 platformId/snapshot 거부
 *  9. 외부 객체 변경이 내부 state를 오염시키지 않음
 * 10. StateStore 교체 가능 (인터페이스 계약)
 * ────────────────────────────────────────────────
 */

const { WorldStateEngine, computeDiff, computeTrend } = require('../core/world-state-engine.cjs');
const { MemoryStore, StateStore } = require('../core/state-store.cjs');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─────────────────────────────────────────────

console.log('\n═══ WorldStateEngine Tests ═══\n');

// ── 1. 최초 snapshot 입력 ────────────────────
console.log('▸ TC-1: 최초 snapshot 입력');
{
  const engine = new WorldStateEngine();
  const snap = { orders: 10, revenue: 5000 };
  const result = engine.merge('dosirak-store', snap);
  assert(result !== null && result !== undefined, '결과가 반환됨');
  assert(result.updated_at !== undefined, 'updated_at 존재');
}

// ── 2. current 상태 생성 ────────────────────
console.log('▸ TC-2: current 상태 생성');
{
  const engine = new WorldStateEngine();
  engine.merge('dosirak-store', { orders: 10 });
  const result = engine.merge('dosirak-store', { orders: 10 });
  assert(eq(result.current, { orders: 10 }), 'current가 입력 snapshot과 일치');
}

// ── 3. 두 번째 snapshot 입력 ────────────────
console.log('▸ TC-3: 두 번째 snapshot 입력');
{
  const engine = new WorldStateEngine();
  engine.merge('dosirak-store', { orders: 10 });
  const r2 = engine.merge('dosirak-store', { orders: 15 });
  assert(r2.current.orders === 15, '두 번째 snapshot이 current에 반영');
}

// ── 4. previous/current 분리 ────────────────
console.log('▸ TC-4: previous/current 분리');
{
  const engine = new WorldStateEngine();
  engine.merge('dosirak-store', { orders: 10 });
  const r2 = engine.merge('dosirak-store', { orders: 15 });
  assert(r2.previous.orders === 10, 'previous는 이전 snapshot');
  assert(r2.current.orders === 15, 'current는 최신 snapshot');
}

// ── 5. diff 정확히 계산 ─────────────────────
console.log('▸ TC-5: diff 정확히 계산');
{
  const engine = new WorldStateEngine();
  engine.merge('dosirak-store', { orders: 10, revenue: 5000 });
  const r2 = engine.merge('dosirak-store', { orders: 15, status: 'active' });
  assert(eq(r2.diff.changed.orders, { from: 10, to: 15 }), 'changed: orders 10→15');
  assert(eq(r2.diff.removed.revenue, 5000), 'removed: revenue');
  assert(r2.diff.added.status === 'active', 'added: status');

  // diff() 메서드 별도 호출
  const d = engine.diff('dosirak-store');
  assert(eq(d.changed.orders, { from: 10, to: 15 }), 'diff() 메서드도 동일');
}

// ── 6. history 보존 ─────────────────────────
console.log('▸ TC-6: history 보존');
{
  const engine = new WorldStateEngine();
  engine.merge('p1', { v: 1 });
  engine.merge('p1', { v: 2 });
  engine.merge('p1', { v: 3 });
  const state = engine.getByPlatform('p1');
  assert(state.history.length === 2, 'history에 이전 2개 스냅샷 보존');
  assert(state.history[0].snapshot.v === 1, 'history[0]은 첫 번째 스냅샷');
  assert(state.history[1].snapshot.v === 2, 'history[1]은 두 번째 스냅샷');
}

// ── 7. history 최대치 제한 ───────────────────
console.log('▸ TC-7: history 최대치 제한');
{
  const engine = new WorldStateEngine({ maxHistory: 3 });
  for (let i = 0; i < 10; i++) {
    engine.merge('p1', { v: i });
  }
  const state = engine.getByPlatform('p1');
  assert(state.history.length === 3, `history가 maxHistory(3)으로 제한됨 (실제: ${state.history.length})`);
  // 가장 오래된 건 잘려나가고, 최근 3개만 남아야 함
  assert(state.history[0].snapshot.v === 6, '가장 오래된 history가 올바름');
}

// ── 8. 잘못된 platformId/snapshot 거부 ───────
console.log('▸ TC-8: 잘못된 입력 거부');
{
  const engine = new WorldStateEngine();
  let errors = 0;

  try { engine.merge('', { a: 1 }); }       catch { errors++; }
  try { engine.merge(null, { a: 1 }); }      catch { errors++; }
  try { engine.merge(123, { a: 1 }); }       catch { errors++; }
  try { engine.merge('p1', null); }           catch { errors++; }
  try { engine.merge('p1', 'string'); }       catch { errors++; }
  try { engine.merge('p1', [1, 2, 3]); }     catch { errors++; }
  try { engine.merge('p1', undefined); }      catch { errors++; }

  assert(errors === 7, `잘못된 입력 7건 모두 거부됨 (실제: ${errors})`);
}

// ── 9. 외부 객체 변경이 내부 state 오염 안 됨 ──
console.log('▸ TC-9: 외부 변경으로부터 격리');
{
  const engine = new WorldStateEngine();
  const snap = { orders: 10, nested: { count: 5 } };
  engine.merge('p1', snap);

  // 외부 원본 변경
  snap.orders = 999;
  snap.nested.count = 999;

  const state = engine.getByPlatform('p1');
  assert(state.current.orders === 10, '외부 원본 변경 후에도 current.orders 보존');
  assert(state.current.nested.count === 5, '중첩 객체도 격리');

  // 반환값 변경
  const returned = engine.merge('p1', { orders: 20 });
  returned.current.orders = 888;
  const stateAfter = engine.getByPlatform('p1');
  assert(stateAfter.current.orders === 20, '반환값 변경도 내부 상태에 영향 없음');
}

// ── 10. StateStore 교체 가능 ────────────────
console.log('▸ TC-10: StateStore 교체 가능 (인터페이스 계약)');
{
  // 커스텀 스토어: MemoryStore와 동일하지만 별도 인스턴스
  const customStore = new MemoryStore();
  const engine = new WorldStateEngine({ store: customStore });
  engine.merge('p1', { v: 1 });
  assert(customStore.has('ws:p1'), '주입된 store에 데이터가 저장됨');

  // StateStore 기본 클래스의 메서드는 not-implemented를 던져야 함
  const base = new StateStore();
  let threw = 0;
  try { base.get('x'); }    catch { threw++; }
  try { base.set('x', 1); } catch { threw++; }
  try { base.has('x'); }    catch { threw++; }
  try { base.delete('x'); } catch { threw++; }
  try { base.keys(); }      catch { threw++; }
  try { base.clear(); }     catch { threw++; }
  assert(threw === 6, `StateStore 기본 클래스 6개 메서드 모두 not-implemented (${threw})`);
}

// ── 보너스: computeTrend 유틸 ───────────────
console.log('▸ Bonus: computeTrend 유틸');
{
  assert(computeTrend([1, 2, 3, 4, 5]) === 'increasing', '증가 추세');
  assert(computeTrend([5, 4, 3, 2, 1]) === 'decreasing', '감소 추세');
  assert(computeTrend([3, 3, 3, 3]) === 'stable', '안정');
  assert(computeTrend([1]) === 'insufficient_data', '데이터 부족');
  assert(computeTrend([]) === 'insufficient_data', '빈 배열');
}

// ── 보너스: get() 전체 세계 상태 ────────────
console.log('▸ Bonus: get() 전체 세계 상태');
{
  const engine = new WorldStateEngine();
  engine.merge('p1', { a: 1 });
  engine.merge('p2', { b: 2 });
  const world = engine.get();
  assert(world.platforms.p1 !== undefined, 'p1 존재');
  assert(world.platforms.p2 !== undefined, 'p2 존재');
  assert(world.platforms.p1.current.a === 1, 'p1 current 정확');
}

// ── 보너스: trend() 시계열 ──────────────────
console.log('▸ Bonus: trend() 시계열');
{
  const engine = new WorldStateEngine();
  engine.merge('p1', { orders: 10 });
  engine.merge('p1', { orders: 15 });
  engine.merge('p1', { orders: 20 });
  engine.merge('p1', { orders: 25 });
  const t = engine.trend('p1', 'orders');
  assert(t.trend === 'increasing', 'orders 증가 추세');
  assert(t.values.length === 4, '4개 값 추출');
}

// ── 결과 ─────────────────────────────────────
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
