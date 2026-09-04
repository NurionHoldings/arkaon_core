'use strict';

const {
  DecisionEngine,
} = require(
  '../core/decision-engine.cjs'
);

const {
  GateEngine,
} = require(
  '../core/gate-engine.cjs'
);

const {
  ActionRuntime,
} = require(
  '../core/action-runtime.cjs'
);

const {
  AuditEngine,
} = require(
  '../core/audit-engine.cjs'
);

const {
  ExecutionEngine,
} = require(
  '../core/execution-engine.cjs'
);

const {
  FriendChatService,
} = require(
  '../products/phone-friend/capabilities/friend-chat-service.cjs'
);

const {
  CalendarService,
} = require(
  '../products/phone-friend/capabilities/calendar-service.cjs'
);

const {
  MessagingService,
} = require(
  '../products/phone-friend/capabilities/messaging-service.cjs'
);

const {
  CapabilityRuntime,
} = require(
  '../products/phone-friend/runtime/capability-runtime.cjs'
);

const {
  MemoryCalendarConnector,
  MemoryMessagingConnector,
} = require(
  '../connectors/phone-friend/memory-connectors.cjs'
);

let passed = 0;
let failed = 0;

function assert(
  condition,
  label
) {
  if (condition) {
    passed++;
    console.log(
      `  ✅ ${label}`
    );
  } else {
    failed++;
    console.error(
      `  ❌ FAIL: ${label}`
    );
  }
}

function assertThrows(
  fn,
  label
) {
  try {
    fn();
    failed++;
    console.error(
      `  ❌ FAIL: ${label}`
    );
  } catch {
    passed++;
    console.log(
      `  ✅ ${label}`
    );
  }
}

async function run() {
  console.log(
    '\n═══ PHONE FRIEND Practical Capability Tests ═══\n'
  );

  const audit =
    new AuditEngine();

  const actionRuntime =
    new ActionRuntime({
      auditEngine:
        audit,
    });

  const calendarConnector =
    new MemoryCalendarConnector({
      events: [
        {
          id: 'e-old',
          title: '기존 일정',
          start_at:
            '2026-09-04T09:00:00+09:00',
        },
      ],
    });

  const messagingConnector =
    new MemoryMessagingConnector({
      messages: [
        {
          id: 'm1',
          direction:
            'INBOUND',
          from: '엄마',
          to: 'SELF',
          content:
            '집에 언제 와?',
          sent_at:
            '2026-09-04T09:00:00+09:00',
        },
      ],
    });

  const executionEngine =
    new ExecutionEngine({
      actionRuntime,

      auditEngine:
        audit,

      connectors: {
        'phone-friend-calendar':
          calendarConnector,

        'phone-friend-messaging':
          messagingConnector,
      },
    });

  const runtime =
    new CapabilityRuntime({
      decisionEngine:
        new DecisionEngine(),

      gateEngine:
        new GateEngine(),

      actionRuntime,

      executionEngine,
    });

  const chat =
    new FriendChatService();

  const calendar =
    new CalendarService();

  const messaging =
    new MessagingService();


  console.log(
    '▸ TC-1: FRIEND_CHAT 기본 대화'
  );

  {
    const result =
      chat.respond({
        text:
          '오늘 좀 힘들었어',
      });

    assert(
      result.ok === true,
      '대화 응답 생성'
    );

    assert(
      result
        .capability ===
        'FRIEND_CHAT',
      'FRIEND_CHAT capability'
    );

    assert(
      result
        .authority_granted ===
        false,
      '대화는 Authority 아님'
    );

    assert(
      result
        .execution_required ===
        false,
      '잡담은 외부 실행 불필요'
    );
  }


  console.log(
    '▸ TC-2: 빈 대화 clarification'
  );

  {
    const result =
      chat.respond({
        text: '',
      });

    assert(
      result.ok === false,
      '빈 입력 감지'
    );

    assert(
      result.kind ===
        'CLARIFY',
      'clarify 응답'
    );
  }


  console.log(
    '▸ TC-3: CALENDAR_READ intent'
  );

  {
    const intent =
      calendar.createReadIntent({
        date:
          '2026-09-04',
      });

    assert(
      intent.capability ===
        'CALENDAR_READ',
      'CALENDAR_READ 생성'
    );

    assert(
      intent
        .authority_granted ===
        false,
      'Calendar capability가 Authority 부여 안 함'
    );
  }


  console.log(
    '▸ TC-4: 일정 조회 실제 실행'
  );

  {
    const result =
      await calendar.read(
        runtime,
        {
          subject:
            'user:1',

          date:
            '2026-09-04',

          idempotency_key:
            'calendar-read-1',

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        true,
      '일정 조회 실행'
    );

    assert(
      result.execution
        .connector_result
        .events.length ===
        1,
      '기존 일정 조회'
    );

    assert(
      result
        .authority_granted ===
        false,
      '실행 후에도 Product Authority false'
    );
  }


  console.log(
    '▸ TC-5: CALENDAR_WRITE 필수 필드'
  );

  {
    assertThrows(
      () =>
        calendar
          .createWriteIntent({
            event_title:
              '병원',
          }),

      'start_at 없으면 거부'
    );
  }


  console.log(
    '▸ TC-6: Calendar WRITE policy 미확인 → HOLD'
  );

  {
    const result =
      await calendar.write(
        runtime,
        {
          subject:
            'user:1',

          event_title:
            '병원',

          start_at:
            '2026-09-05T15:00:00+09:00',

          idempotency_key:
            'cal-write-hold',

          policy_ok:
            false,

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        false,
      'policy 없으면 실행 안 함'
    );

    assert(
      result.status ===
        'HOLD',
      'Gate HOLD'
    );
  }


  console.log(
    '▸ TC-7: Calendar WRITE policy 확인 → 실행'
  );

  {
    const result =
      await calendar.write(
        runtime,
        {
          subject:
            'user:1',

          event_title:
            '병원',

          start_at:
            '2026-09-05T15:00:00+09:00',

          location:
            '세종',

          idempotency_key:
            'cal-write-1',

          policy_ok:
            true,

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        true,
      '일정 등록 실행'
    );

    assert(
      result.execution
        .connector_result
        .event.title ===
        '병원',
      '병원 일정 생성'
    );
  }


  console.log(
    '▸ TC-8: Calendar 중복 idempotency'
  );

  {
    const before =
      calendarConnector
        .list().length;

    const first =
      await calendar.write(
        runtime,
        {
          subject:
            'user:1',

          event_title:
            '회의',

          start_at:
            '2026-09-06T14:00:00+09:00',

          idempotency_key:
            'cal-dup',

          policy_ok:
            true,

          now:
            '2026-09-04T11:01:00+09:00',
        }
      );

    const second =
      await calendar.write(
        runtime,
        {
          subject:
            'user:1',

          event_title:
            '회의',

          start_at:
            '2026-09-06T14:00:00+09:00',

          idempotency_key:
            'cal-dup',

          policy_ok:
            true,

          now:
            '2026-09-04T11:02:00+09:00',
        }
      );

    const after =
      calendarConnector
        .list().length;

    assert(
      after ===
        before + 1,
      '중복 일정 1회만 생성'
    );

    assert(
      second.execution
        .idempotent_replay ===
        true,
      'Execution idempotent replay'
    );

    assert(
      first.execution
        .execution_id ===
        second.execution
          .execution_id,
      '동일 execution 재사용'
    );
  }


  console.log(
    '▸ TC-9: MESSAGE_SEND recipient 누락'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          content:
            '조금 늦어',

          idempotency_key:
            'msg-slot-1',
        }
      );

    assert(
      result.status ===
        'NEEDS_SLOT',
      'recipient slot 필요'
    );

    assert(
      result.needs_slot ===
        'recipient',
      'recipient 요청'
    );
  }


  console.log(
    '▸ TC-10: MESSAGE_SEND content 누락'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          recipient:
            '엄마',

          idempotency_key:
            'msg-slot-2',
        }
      );

    assert(
      result.status ===
        'NEEDS_SLOT',
      'content slot 필요'
    );

    assert(
      result.needs_slot ===
        'content',
      'content 요청'
    );
  }


  console.log(
    '▸ TC-11: MESSAGE_READ'
  );

  {
    const result =
      await messaging.read(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '엄마',

          idempotency_key:
            'msg-read-1',

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        true,
      '문자 읽기 실행'
    );

    assert(
      result.execution
        .connector_result
        .messages.length ===
        1,
      '엄마 문자 조회'
    );
  }


  console.log(
    '▸ TC-12: MESSAGE_SEND policy 미확인 HOLD'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '엄마',

          content:
            '조금 늦어',

          idempotency_key:
            'msg-hold',

          policy_ok:
            false,

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        false,
      'policy 없으면 문자 미발송'
    );

    assert(
      result.status ===
        'HOLD',
      '문자 Gate HOLD'
    );
  }


  console.log(
    '▸ TC-13: MESSAGE_SEND 정상'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '엄마',

          content:
            '조금 늦어',

          idempotency_key:
            'msg-send-1',

          policy_ok:
            true,

          now:
            '2026-09-04T11:00:00+09:00',
        }
      );

    assert(
      result.executed ===
        true,
      '문자 발송 실행'
    );

    assert(
      result.execution
        .connector_result
        .message.to ===
        '엄마',
      'recipient 정확'
    );

    assert(
      result.execution
        .connector_result
        .message.content ===
        '조금 늦어',
      'content 정확'
    );
  }


  console.log(
    '▸ TC-14: 문자 idempotency'
  );

  {
    const before =
      messagingConnector
        .send_count;

    const first =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '김사장',

          content:
            '3시에 전화드리겠습니다',

          idempotency_key:
            'msg-dup',

          policy_ok:
            true,

          now:
            '2026-09-04T11:10:00+09:00',
        }
      );

    const second =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '김사장',

          content:
            '3시에 전화드리겠습니다',

          idempotency_key:
            'msg-dup',

          policy_ok:
            true,

          now:
            '2026-09-04T11:11:00+09:00',
        }
      );

    assert(
      messagingConnector
        .send_count ===
        before + 1,
      '실제 문자 전송 1회'
    );

    assert(
      second.execution
        .idempotent_replay ===
        true,
      '중복 요청 replay'
    );

    assert(
      first.execution
        .execution_id ===
        second.execution
          .execution_id,
      '기존 execution 반환'
    );
  }


  console.log(
    '▸ TC-15: Capability → Core Target'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '테스트',

          content:
            '안녕하세요',

          idempotency_key:
            'msg-core-target',

          policy_ok:
            true,

          now:
            '2026-09-04T11:20:00+09:00',
        }
      );

    assert(
      result.target.domain ===
        'COMMUNICATION',
      'Messaging → COMMUNICATION'
    );

    assert(
      result.target.action ===
        'WRITE',
      'MESSAGE_SEND → WRITE'
    );
  }


  console.log(
    '▸ TC-16: Product Layer Gate 우회 금지'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '누군가',

          content:
            '테스트',

          idempotency_key:
            'msg-no-bypass',

          policy_ok:
            false,

          /**
           * 이런 Product 입력이 들어와도
           * 권한으로 인정돼서는 안 된다.
           */
          gate_context: {
            authority_granted:
              true,
            confidence:
              1,
          },

          now:
            '2026-09-04T11:30:00+09:00',
        }
      );

    assert(
      result.executed ===
        false,
      '가짜 authority/confidence로 Gate 우회 불가'
    );

    assert(
      result
        .authority_granted ===
        false,
      'Product Authority 항상 false'
    );
  }


  console.log(
    '▸ TC-17: Calendar rollback 가능'
  );

  {
    const result =
      await calendar.write(
        runtime,
        {
          subject:
            'user:1',

          event_title:
            '취소할 일정',

          start_at:
            '2026-09-07T10:00:00+09:00',

          idempotency_key:
            'cal-rollback',

          policy_ok:
            true,

          now:
            '2026-09-04T11:40:00+09:00',
        }
      );

    const executionId =
      result.execution
        .execution_id;

    const rolled =
      await executionEngine
        .rollback(
          executionId
        );

    assert(
      rolled.status ===
        'ROLLED_BACK',
      'Calendar rollback 성공'
    );

    assert(
      !calendarConnector
        .list()
        .some(
          (event) =>
            event.title ===
            '취소할 일정'
        ),
      'rollback 후 일정 제거'
    );
  }


  console.log(
    '▸ TC-18: SMS rollback 미지원'
  );

  {
    const result =
      await messaging.send(
        runtime,
        {
          subject:
            'user:1',

          recipient:
            '엄마',

          content:
            '이미 보낸 문자',

          idempotency_key:
            'msg-no-rollback',

          policy_ok:
            true,

          now:
            '2026-09-04T11:50:00+09:00',
        }
      );

    let rejected = false;

    try {
      await executionEngine
        .rollback(
          result.execution
            .execution_id
        );
    } catch {
      rejected = true;
    }

    assert(
      rejected === true,
      'SMS rollback 거부'
    );
  }


  console.log(
    '▸ TC-19: Execution audit 생성'
  );

  {
    const events =
      audit.list();

    assert(
      events.some(
        (item) =>
          item.event ===
          'ACTION_READY'
      ),
      'ACTION_READY audit 존재'
    );

    assert(
      events.some(
        (item) =>
          item.event ===
          'EXECUTION_STARTED'
      ),
      'EXECUTION_STARTED audit 존재'
    );

    assert(
      events.some(
        (item) =>
          item.event ===
          'EXECUTION_SUCCEEDED'
      ),
      'EXECUTION_SUCCEEDED audit 존재'
    );

    assert(
      audit.verifyChain()
        .ok === true,
      'Audit hash chain 정상'
    );
  }


  console.log(
    '▸ TC-20: Memory Connector defensive copy'
  );

  {
    const list =
      calendarConnector
        .list();

    if (
      list.length > 0
    ) {
      list[0].title =
        '악의적 수정';
    }

    const again =
      calendarConnector
        .list();

    assert(
      again.length === 0 ||
      again[0].title !==
        '악의적 수정',
      'Calendar defensive copy'
    );
  }


  console.log(
    `\n═══ Results: ${passed} passed, ${failed} failed ═══\n`
  );

  process.exit(
    failed > 0
      ? 1
      : 0
  );
}

run().catch(
  (error) => {
    console.error(
      error
    );

    process.exit(1);
  }
);
