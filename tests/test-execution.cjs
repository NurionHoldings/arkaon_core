'use strict';

const {
  AuditEngine,
} = require(
  '../core/audit-engine.cjs'
);

const {
  ActionRuntime,
  ACTION_RUNTIME_STATUS,
} = require(
  '../core/action-runtime.cjs'
);

const {
  ExecutionEngine,
} = require(
  '../core/execution-engine.cjs'
);

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

function assertThrows(fn, label) {
  try {
    fn();
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  } catch {
    passed++;
    console.log(`  ✅ ${label}`);
  }
}

async function assertRejects(fn, label) {
  try {
    await fn();
    failed++;
    console.error(`  ❌ FAIL: ${label}`);
  } catch {
    passed++;
    console.log(`  ✅ ${label}`);
  }
}

function makeDecision(overrides = {}) {
  return {
    id: 'dec-1',
    domain: 'GENERAL_ASSISTANT',
    action: 'READ',
    risk: 'LOW',
    reversibility: 'FULLY_REVERSIBLE',
    required_gates: [],
    ...overrides,
  };
}

function makeGate(overrides = {}) {
  return {
    result: 'ALLOW',
    execute_ready: false,
    checks: {},
    audit: {
      decision_id: 'dec-1',
    },
    ...overrides,
  };
}

function makeSystem(connector, actionOpts = {}) {
  const audit = new AuditEngine();

  const runtime = new ActionRuntime({
    auditEngine: audit,
  });

  const execution =
    new ExecutionEngine({
      actionRuntime: runtime,
      auditEngine: audit,
      connectors: {
        test: connector,
      },
    });

  const action =
    runtime.prepare({
      decision:
        actionOpts.decision ||
        makeDecision(),

      gate_result:
        actionOpts.gate ||
        makeGate(),

      connector: 'test',

      idempotency_key:
        actionOpts.idempotency_key ||
        'idem-1',

      payload:
        actionOpts.payload || {
          value: 1,
        },

      reversible:
        actionOpts.reversible,

      retry_safe:
        actionOpts.retry_safe,

      max_retries:
        actionOpts.max_retries,

      verify_required:
        actionOpts.verify_required,
    });

  return {
    audit,
    runtime,
    execution,
    action,
  };
}

async function run() {
  console.log(
    '\n═══ Action / Execution / Audit Tests ═══\n'
  );

  console.log(
    '▸ TC-1: Gate ALLOW만 ActionRuntime READY 생성'
  );

  {
    const audit = new AuditEngine();
    const runtime =
      new ActionRuntime({
        auditEngine: audit,
      });

    const action =
      runtime.prepare({
        decision:
          makeDecision(),
        gate_result:
          makeGate(),
        connector:
          'test',
        idempotency_key:
          'i1',
      });

    assert(
      action.status ===
        ACTION_RUNTIME_STATUS.READY,
      'ALLOW 후 READY 생성'
    );

    assert(
      action.gate_provenance
        .gate_result === 'ALLOW',
      'Gate provenance 보존'
    );
  }

  console.log(
    '▸ TC-2: HOLD / DENY 실행준비 차단'
  );

  {
    const runtime =
      new ActionRuntime();

    assertThrows(
      () =>
        runtime.prepare({
          decision:
            makeDecision(),
          gate_result:
            makeGate({
              result: 'HOLD',
            }),
          connector:
            'x',
          idempotency_key:
            'x',
        }),
      'HOLD 차단'
    );

    assertThrows(
      () =>
        runtime.prepare({
          decision:
            makeDecision(),
          gate_result:
            makeGate({
              result: 'DENY',
            }),
          connector:
            'x',
          idempotency_key:
            'y',
        }),
      'DENY 차단'
    );
  }

  console.log(
    '▸ TC-3: Gate가 execute_ready=true를 스스로 주면 거부'
  );

  {
    const runtime =
      new ActionRuntime();

    assertThrows(
      () =>
        runtime.prepare({
          decision:
            makeDecision(),
          gate_result:
            makeGate({
              execute_ready: true,
            }),
          connector:
            'x',
          idempotency_key:
            'z',
        }),
      'Gate self-authorize 금지'
    );
  }

  console.log(
    '▸ TC-4: idempotency key 필수'
  );

  {
    const runtime =
      new ActionRuntime();

    assertThrows(
      () =>
        runtime.prepare({
          decision:
            makeDecision(),
          gate_result:
            makeGate(),
          connector:
            'x',
        }),
      'idempotency key 없으면 거부'
    );
  }

  console.log(
    '▸ TC-5: HIGH risk는 AUTHORITY proof 필수'
  );

  {
    const runtime =
      new ActionRuntime();

    assertThrows(
      () =>
        runtime.prepare({
          decision:
            makeDecision({
              domain:
                'FINANCIAL',
              action:
                'TRANSFER',
              risk: 'HIGH',
              reversibility:
                'IRREVERSIBLE',
            }),

          gate_result:
            makeGate({
              checks: {
                IDENTITY: {
                  ok: true,
                },
                CONSENT: {
                  ok: true,
                },
                BIOMETRIC_ASSERTION: {
                  ok: true,
                },
              },
            }),

          connector:
            'bank',

          idempotency_key:
            'pay-1',
        }),
      'AUTHORITY 없는 HIGH risk 거부'
    );
  }

  console.log(
    '▸ TC-6: HIGH risk + AUTHORITY proof 허용'
  );

  {
    const runtime =
      new ActionRuntime();

    const action =
      runtime.prepare({
        decision:
          makeDecision({
            domain:
              'FINANCIAL',
            action:
              'TRANSFER',
            risk: 'HIGH',
            reversibility:
              'IRREVERSIBLE',
            required_gates: [
              'IDENTITY',
              'CONSENT',
              'BIOMETRIC_ASSERTION',
              'AUTHORITY',
            ],
          }),

        gate_result:
          makeGate({
            checks: {
              IDENTITY: {
                ok: true,
              },

              CONSENT: {
                ok: true,
                consent: {
                  id: 'consent-1',
                },
              },

              BIOMETRIC_ASSERTION: {
                ok: true,
              },

              AUTHORITY: {
                ok: true,
                grant: {
                  id: 'authz-1',
                },
              },
            },
          }),

        connector:
          'bank',

        idempotency_key:
          'pay-2',
      });

    assert(
      action.status ===
        ACTION_RUNTIME_STATUS.READY,
      'explicit authority 후 READY'
    );

    assert(
      action.gate_provenance
        .authority_id ===
        'authz-1',
      'authority provenance 유지'
    );

    assert(
      action.gate_provenance
        .consent_id ===
        'consent-1',
      'consent provenance 유지'
    );
  }

  console.log(
    '▸ TC-7: 정상 connector 실행'
  );

  {
    let calls = 0;

    const connector = {
      async execute(action) {
        calls++;
        return {
          ok: true,
          echoed:
            action.payload.value,
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action
          .runtime_action_id
      );

    assert(
      result.status ===
        ACTION_RUNTIME_STATUS.SUCCEEDED,
      '실행 성공'
    );

    assert(
      calls === 1,
      'connector 1회 호출'
    );
  }

  console.log(
    '▸ TC-8: duplicate idempotency 실행 방지'
  );

  {
    let calls = 0;

    const connector = {
      async execute() {
        calls++;
        return {
          ok: true,
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const first =
      await execution.execute(
        action.runtime_action_id
      );

    /**
     * 같은 runtime action은 상태가 READY가 아니므로
     * 직접 execute 재호출이 거부된다.
     * 대신 동일 idempotency의 별도 READY action을 만들어
     * replay behavior를 검증한다.
     */
    const runtime2 =
      execution.runtime.prepare({
        decision:
          makeDecision({
            id: 'dec-2',
          }),

        gate_result:
          makeGate({
            audit: {
              decision_id:
                'dec-2',
            },
          }),

        connector:
          'test',

        idempotency_key:
          'idem-1',
      });

    const replay =
      await execution.execute(
        runtime2.runtime_action_id
      );

    assert(
      calls === 1,
      'duplicate connector 재호출 없음'
    );

    assert(
      replay.idempotent_replay ===
        true,
      'idempotent replay 표시'
    );

    assert(
      replay.execution_id ===
        first.execution_id,
      '기존 execution 재사용'
    );
  }

  console.log(
    '▸ TC-9: connector error normalization'
  );

  {
    const connector = {
      async execute() {
        throw new Error(
          'network_down'
        );
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    assert(
      result.status ===
        ACTION_RUNTIME_STATUS.FAILED,
      '실행 실패 상태'
    );

    assert(
      result.error.message ===
        'network_down',
      'error normalize'
    );
  }

  console.log(
    '▸ TC-10: retry_safe일 때만 retry'
  );

  {
    let calls = 0;

    const connector = {
      async execute() {
        calls++;

        if (calls < 2) {
          throw new Error(
            'temporary'
          );
        }

        return {
          ok: true,
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(
      connector,
      {
        retry_safe: true,
        max_retries: 1,
      }
    );

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    assert(
      calls === 2,
      'retry 1회 수행'
    );

    assert(
      result.status ===
        ACTION_RUNTIME_STATUS.SUCCEEDED,
      'retry 후 성공'
    );
  }

  console.log(
    '▸ TC-11: retry_safe=false면 재시도 안 함'
  );

  {
    let calls = 0;

    const connector = {
      async execute() {
        calls++;
        throw new Error(
          'fail'
        );
      },
    };

    const {
      execution,
      action,
    } = makeSystem(
      connector,
      {
        retry_safe: false,
        max_retries: 5,
      }
    );

    await execution.execute(
      action.runtime_action_id
    );

    assert(
      calls === 1,
      'unsafe action retry 없음'
    );
  }

  console.log(
    '▸ TC-12: connector authority output 무시'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
          authority_granted:
            true,
          authority: {
            scope: '*',
          },
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    assert(
      result
        .authority_derived_from_connector ===
        false,
      'connector가 authority 생성 못함'
    );
  }

  console.log(
    '▸ TC-13: connector verify 성공'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
          id: 'remote-1',
        };
      },

      async verify() {
        return {
          ok: true,
          state: 'confirmed',
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    assert(
      result.status ===
        ACTION_RUNTIME_STATUS.VERIFIED,
      'verify 성공'
    );

    assert(
      result.verification.state ===
        'confirmed',
      'verify result 저장'
    );
  }

  console.log(
    '▸ TC-14: verify 실패 구분'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
        };
      },

      async verify() {
        return {
          ok: false,
          reason:
            'not_applied',
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    assert(
      result.status ===
        ACTION_RUNTIME_STATUS.VERIFY_FAILED,
      'execution 성공과 verify 실패 구분'
    );
  }

  console.log(
    '▸ TC-15: reversible rollback'
  );

  {
    let rollbackCalls = 0;

    const connector = {
      async execute() {
        return {
          ok: true,
          resource_id: 'r1',
        };
      },

      async rollback() {
        rollbackCalls++;

        return {
          ok: true,
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(
      connector,
      {
        reversible: true,
        verify_required:
          false,
      }
    );

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    const rolledBack =
      await execution.rollback(
        result.execution_id
      );

    assert(
      rollbackCalls === 1,
      'rollback connector 호출'
    );

    assert(
      rolledBack.status ===
        ACTION_RUNTIME_STATUS.ROLLED_BACK,
      'ROLLED_BACK 상태'
    );
  }

  console.log(
    '▸ TC-16: irreversible rollback 금지'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
        };
      },

      async rollback() {
        return {
          ok: true,
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(
      connector,
      {
        reversible: false,
        verify_required:
          false,
      }
    );

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    await assertRejects(
      () =>
        execution.rollback(
          result.execution_id
        ),
      'irreversible rollback 거부'
    );
  }

  console.log(
    '▸ TC-17: Audit append-only chain'
  );

  {
    const audit =
      new AuditEngine();

    audit.append({
      event: 'A',
      data: {
        x: 1,
      },
    });

    audit.append({
      event: 'B',
      data: {
        y: 2,
      },
    });

    const check =
      audit.verifyChain();

    assert(
      check.ok === true,
      'audit hash chain 정상'
    );

    assert(
      audit.size() === 2,
      'append 2건'
    );

    assert(
      typeof audit.update ===
        'undefined',
      'audit update API 없음'
    );

    assert(
      typeof audit.delete ===
        'undefined',
      'audit delete API 없음'
    );
  }

  console.log(
    '▸ TC-18: Audit 반환값 mutation 차단'
  );

  {
    const audit =
      new AuditEngine();

    audit.append({
      event: 'A',
      data: {
        nested: {
          value: 1,
        },
      },
    });

    const rows =
      audit.list();

    rows[0].data.nested.value =
      999;

    const again =
      audit.get(1);

    assert(
      again.data.nested.value ===
        1,
      'audit 내부값 보호'
    );
  }

  console.log(
    '▸ TC-19: provenance audit 유지'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
        };
      },
    };

    const {
      audit,
      execution,
      action,
    } = makeSystem(connector);

    await execution.execute(
      action.runtime_action_id
    );

    const events =
      audit.list({
        action_id:
          action.runtime_action_id,
      });

    assert(
      events.some(
        (e) =>
          e.event ===
          'ACTION_READY'
      ),
      'ACTION_READY audit'
    );

    assert(
      events.some(
        (e) =>
          e.event ===
          'EXECUTION_STARTED'
      ),
      'EXECUTION_STARTED audit'
    );

    assert(
      events.some(
        (e) =>
          e.event ===
          'EXECUTION_SUCCEEDED'
      ),
      'EXECUTION_SUCCEEDED audit'
    );
  }

  console.log(
    '▸ TC-20: 외부 mutation 차단'
  );

  {
    const connector = {
      async execute() {
        return {
          ok: true,
          nested: {
            value: 1,
          },
        };
      },
    };

    const {
      execution,
      action,
    } = makeSystem(connector);

    const result =
      await execution.execute(
        action.runtime_action_id
      );

    result.connector_result
      .nested.value = 999;

    const stored =
      execution.getExecution(
        result.execution_id
      );

    assert(
      stored.connector_result
        .nested.value === 1,
      'execution 결과 defensive copy'
    );
  }

  console.log(
    `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
  );

  process.exit(
    failed > 0 ? 1 : 0
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
