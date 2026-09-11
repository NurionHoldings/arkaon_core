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
  CapabilityRuntime,
} = require(
  '../products/phone-friend/runtime/capability-runtime.cjs'
);

const {
  SafetyGuardService,
} = require(
  '../products/phone-friend/capabilities/safety-guard-service.cjs'
);

const {
  DigitalSupportService,
} = require(
  '../products/phone-friend/capabilities/digital-support-service.cjs'
);

const {
  SafetyPipeline,
  PIPELINE_RESULT,
} = require(
  '../products/phone-friend/runtime/safety-pipeline.cjs'
);

const {
  MemorySafetyConnector,
  detectDoubleExtension,
  inspectText,
  inspectApk,
} = require(
  '../connectors/phone-friend/memory-safety-connector.cjs'
);

const {
  MemoryDocumentConnector,
} = require(
  '../connectors/phone-friend/memory-document-connector.cjs'
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
    '\n═══ PHONE FRIEND Safety + Digital Support Tests ═══\n'
  );

  const audit =
    new AuditEngine();

  const actionRuntime =
    new ActionRuntime({
      auditEngine:
        audit,
    });

  const safetyConnector =
    new MemorySafetyConnector();

  const documentConnector =
    new MemoryDocumentConnector();

  const executionEngine =
    new ExecutionEngine({
      actionRuntime,

      auditEngine:
        audit,

      connectors: {
        'phone-friend-safety':
          safetyConnector,

        'phone-friend-document':
          documentConnector,
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

  const safety =
    new SafetyGuardService();

  const digital =
    new DigitalSupportService();

  const pipeline =
    new SafetyPipeline({
      safetyService:
        safety,

      digitalService:
        digital,

      capabilityRuntime:
        runtime,
    });

  console.log(
    '▸ TC-1: URL scan'
  );

  {
    const result =
      await safety.scanUrl(
        runtime,
        {
          subject:
            'user:1',

          url:
            'https://example.com/help',

          idempotency_key:
            'url-safe-1',
        }
      );

    assert(
      result.executed ===
        true,
      'URL scan 실행'
    );

    assert(
      result.execution
        .connector_result
        .risk ===
        'LOW',
      '일반 URL LOW'
    );

    assert(
      result
        .authority_granted ===
        false,
      'Safety 결과 Authority false'
    );
  }

  console.log(
    '▸ TC-2: shortened URL 주의'
  );

  {
    const result =
      await safety.scanUrl(
        runtime,
        {
          subject:
            'user:1',

          url:
            'https://bit.ly/test',

          idempotency_key:
            'url-short-1',
        }
      );

    assert(
      result.execution
        .connector_result
        .risk_score > 0,
      '단축 URL risk signal'
    );
  }

  console.log(
    '▸ TC-3: phishing text signal'
  );

  {
    const result =
      await safety.scanText(
        runtime,
        {
          subject:
            'user:1',

          text:
            '검찰입니다. 안전계좌로 지금 송금하세요.',

          idempotency_key:
            'text-risk-1',
        }
      );

    assert(
      ['HIGH', 'CRITICAL']
        .includes(
          result.execution
            .connector_result
            .risk
        ),
      '기관 사칭 송금 요청 HIGH 이상'
    );

    assert(
      result.execution
        .connector_result
        .findings.length >
        0,
      '위험 findings 생성'
    );
  }

  console.log(
    '▸ TC-4: remote control text signal'
  );

  {
    const inspection =
      inspectText(
        '원격지원 앱 AnyDesk를 설치해 주세요'
      );

    assert(
      inspection.score >=
        40,
      '원격제어 요청 높은 score'
    );
  }

  console.log(
    '▸ TC-5: double extension 탐지'
  );

  {
    assert(
      detectDoubleExtension(
        'invoice.pdf.apk'
      ) === true,
      'pdf.apk 탐지'
    );

    assert(
      detectDoubleExtension(
        'normal.pdf'
      ) === false,
      'normal pdf 허용'
    );
  }

  console.log(
    '▸ TC-6: APK sensitive permission'
  );

  {
    const inspection =
      inspectApk({
        requested_permissions: [
          'android.permission.READ_SMS',
          'android.permission.READ_CONTACTS',
          'android.permission.SYSTEM_ALERT_WINDOW',
        ],

        signer: null,

        source:
          'sms',
      });

    assert(
      inspection.score >=
        60,
      '민감권한 APK HIGH 수준'
    );
  }

  console.log(
    '▸ TC-7: APK scan은 설치하지 않음'
  );

  {
    const result =
      await safety.scanApk(
        runtime,
        {
          subject:
            'user:1',

          filename:
            'security.apk',

          requested_permissions: [
            'android.permission.READ_SMS',
          ],

          source:
            'sms',

          idempotency_key:
            'apk-scan-1',
        }
      );

    const scan =
      result.execution
        .connector_result;

    assert(
      scan.provenance
        .apk_installed ===
        false,
      'APK 설치 안 함'
    );

    assert(
      scan.provenance
        .file_executed ===
        false,
      '파일 실행 안 함'
    );
  }

  console.log(
    '▸ TC-8: 낯선번호 screening'
  );

  {
    const result =
      await safety.screenPhone(
        runtime,
        {
          subject:
            'user:1',

          number:
            '02-1234-5678',

          known_contact:
            false,

          repeated_calls:
            4,

          reported_count:
            10,

          institution_claim:
            '금융감독원',

          verified_institution:
            false,

          idempotency_key:
            'phone-risk-1',
        }
      );

    assert(
      ['HIGH', 'CRITICAL']
        .includes(
          result.execution
            .connector_result
            .risk
        ),
      '낯선번호 위험상승'
    );
  }

  console.log(
    '▸ TC-9: 알려진 연락처 낮은 위험'
  );

  {
    const result =
      await safety.screenPhone(
        runtime,
        {
          subject:
            'user:1',

          number:
            '010-1111-2222',

          known_contact:
            true,

          idempotency_key:
            'phone-known-1',
        }
      );

    assert(
      result.execution
        .connector_result
        .risk ===
        'LOW',
      'known contact LOW'
    );
  }

  console.log(
    '▸ TC-10: File scan normal PDF'
  );

  {
    const result =
      await safety.scanFile(
        runtime,
        {
          subject:
            'user:1',

          filename:
            'contract.pdf',

          mime_type:
            'application/pdf',

          source:
            'email_known',

          idempotency_key:
            'file-safe-1',
        }
      );

    assert(
      result.execution
        .connector_result
        .risk ===
        'LOW',
      '일반 PDF LOW'
    );
  }

  console.log(
    '▸ TC-11: disguised APK HIGH'
  );

  {
    const result =
      await safety.scanFile(
        runtime,
        {
          subject:
            'user:1',

          filename:
            'invoice.pdf.apk',

          mime_type:
            'application/pdf',

          source:
            'unknown_sender',

          idempotency_key:
            'file-risk-1',
        }
      );

    assert(
      ['HIGH', 'CRITICAL']
        .includes(
          result.execution
            .connector_result
            .risk
        ),
      '위장 APK HIGH 이상'
    );
  }

  console.log(
    '▸ TC-12: scan 결과가 안전 보증하지 않음'
  );

  {
    const result =
      await safety.scanFile(
        runtime,
        {
          subject:
            'user:1',

          filename:
            'safe.pdf',

          idempotency_key:
            'not-guarantee-1',
        }
      );

    assert(
      result.execution
        .connector_result
        .provenance
        .safety_guaranteed ===
        false,
      'LOW라도 safety guarantee false'
    );
  }

  console.log(
    '▸ TC-13: simplify intent'
  );

  {
    const intent =
      digital
        .createSimplifyIntent({
          text:
            '본 계약의 목적은...',
        });

    assert(
      intent.capability ===
        'DOCUMENT_SIMPLIFY',
      'simplify skill'
    );

    assert(
      intent.action ===
        'READ',
      '설명은 READ'
    );
  }

  console.log(
    '▸ TC-14: simplify 실행'
  );

  {
    const result =
      await digital.simplify(
        runtime,
        {
          subject:
            'user:1',

          text:
            '복잡한 문장입니다.',

          idempotency_key:
            'simplify-1',
        }
      );

    assert(
      result.executed ===
        true,
      '쉬운말 실행'
    );

    assert(
      result.execution
        .connector_result
        .simplified_text
        .includes(
          '쉬운 설명'
        ),
      '쉬운말 결과'
    );
  }

  console.log(
    '▸ TC-15: unsupported conversion format'
  );

  {
    assertThrows(
      () =>
        digital
          .createConvertIntent({
            filename:
              'a.docx',

            output_format:
              'exe',
          }),
      'exe output format 거부'
    );
  }

  console.log(
    '▸ TC-16: 변환은 WRITE'
  );

  {
    const intent =
      digital
        .createConvertIntent({
          filename:
            'a.docx',

          output_format:
            'pdf',
        });

    assert(
      intent.action ===
        'WRITE',
      '문서변환 WRITE'
    );
  }

  console.log(
    '▸ TC-17: document connector는 safety_scan_id 요구'
  );

  {
    const connector =
      new MemoryDocumentConnector();

    const result =
      await connector.execute({
        skill:
          'DOCUMENT_CONVERT',

        idempotency_key:
          'direct-1',

        payload: {
          filename:
            'a.docx',

          output_format:
            'pdf',
        },
      });

    assert(
      result.ok ===
        false,
      '사전검사 없는 변환 차단'
    );

    assert(
      result.error ===
        'safety_scan_required',
      'safety scan 요구'
    );
  }

  console.log(
    '▸ TC-18: executable document conversion 금지'
  );

  {
    const connector =
      new MemoryDocumentConnector();

    const result =
      await connector.execute({
        skill:
          'DOCUMENT_CONVERT',

        idempotency_key:
          'exe-direct',

        payload: {
          filename:
            'bad.apk',

          output_format:
            'pdf',

          safety_scan_id:
            'scan-x',
        },
      });

    assert(
      result.ok ===
        false,
      'APK document conversion 거부'
    );
  }

  console.log(
    '▸ TC-19: Safe PDF → scan → convert'
  );

  {
    const result =
      await pipeline
        .scanThenConvert({
          subject:
            'user:1',

          filename:
            'document.txt',

          mime_type:
            'text/plain',

          source_text:
            'hello',

          output_format:
            'pdf',

          idempotency_key:
            'pipe-safe-1',

          policy_ok:
            true,

          now:
            '2026-09-04T12:00:00+09:00',
        });

    assert(
      result
        .safety_decision
        .pipeline_result ===
        PIPELINE_RESULT.PROCEED,
      'LOW 파일 PROCEED'
    );

    assert(
      result.executed ===
        true,
      '변환 실행'
    );

    assert(
      result
        .conversion_result
        .execution
        .connector_result
        .document
        .safety_scan_id,
      'scan provenance 변환에 전달'
    );
  }

  console.log(
    '▸ TC-20: 위험 APK → 변환 중단'
  );

  {
    const result =
      await pipeline
        .scanThenConvert({
          subject:
            'user:1',

          filename:
            'invoice.pdf.apk',

          mime_type:
            'application/pdf',

          source:
            'unknown_sender',

          output_format:
            'pdf',

          idempotency_key:
            'pipe-risk-1',

          policy_ok:
            true,
        });

    assert(
      result.status ===
        'BLOCKED_BY_SAFETY',
      '위험파일 변환 중단'
    );

    assert(
      result.executed ===
        false,
      'document connector 미실행'
    );

    assert(
      result.file_deleted ===
        false,
      '자동삭제 안 함'
    );
  }

  console.log(
    '▸ TC-21: MEDIUM은 review 필요'
  );

  {
    const result =
      await pipeline
        .scanThenConvert({
          subject:
            'user:1',

          filename:
            'download.js',

          source:
            'known',

          output_format:
            'txt',

          idempotency_key:
            'pipe-review-1',

          policy_ok:
            true,
        });

    assert(
      [
        'SAFETY_REVIEW_REQUIRED',
        'BLOCKED_BY_SAFETY',
      ].includes(
        result.status
      ),
      '실행형 파일 자동변환 금지 또는 review'
    );
  }

  console.log(
    '▸ TC-22: Safety 결과 Authority false'
  );

  {
    const result =
      await safety.scanText(
        runtime,
        {
          subject:
            'user:1',

          text:
            '테스트',

          idempotency_key:
            'auth-false-1',
        }
      );

    assert(
      result
        .authority_granted ===
        false,
      'Product result Authority false'
    );

    assert(
      result.execution
        .connector_result
        .authority_granted ===
        false,
      'Connector도 Authority false'
    );
  }

  console.log(
    '▸ TC-23: Safety scan은 network lookup 없음'
  );

  {
    const result =
      await safety.scanUrl(
        runtime,
        {
          subject:
            'user:1',

          url:
            'https://example.com',

          idempotency_key:
            'network-none-1',
        }
      );

    assert(
      result.execution
        .connector_result
        .provenance
        .network_lookup ===
        false,
      'prototype은 URL fetch 안 함'
    );
  }

  console.log(
    '▸ TC-24: Document conversion idempotency'
  );

  {
    const first =
      await pipeline
        .scanThenConvert({
          subject:
            'user:1',

          filename:
            'idem.txt',

          source_text:
            'idempotent',

          output_format:
            'pdf',

          idempotency_key:
            'doc-idem',

          safety_idempotency_key:
            'doc-idem-scan',

          policy_ok:
            true,
        });

    const second =
      await pipeline
        .scanThenConvert({
          subject:
            'user:1',

          filename:
            'idem.txt',

          source_text:
            'idempotent',

          output_format:
            'pdf',

          idempotency_key:
            'doc-idem',

          safety_idempotency_key:
            'doc-idem-scan',

          policy_ok:
            true,
        });

    assert(
      second
        .conversion_result
        .execution
        .idempotent_replay ===
        true,
      '문서변환 중복 실행 방지'
    );

    assert(
      first
        .conversion_result
        .execution
        .execution_id ===
      second
        .conversion_result
        .execution
        .execution_id,
      '동일 execution 재사용'
    );
  }

  console.log(
    '▸ TC-25: accessibility output'
  );

  {
    const result =
      await digital
        .accessibility(
          runtime,
          {
            subject:
              'user:1',

            text:
              '작은 글씨 문서',

            large_text:
              true,

            simplify:
              true,

            idempotency_key:
              'accessibility-1',

            policy_ok:
              true,
          }
        );

    assert(
      result.executed ===
        true,
      '접근성 변환 실행'
    );

    assert(
      result.execution
        .connector_result
        .document
        .large_text ===
        true,
      'large_text 적용'
    );
  }

  console.log(
    '▸ TC-26: Audit chain'
  );

  {
    assert(
      audit.size() >
        0,
      'audit entries 존재'
    );

    assert(
      audit.verifyChain()
        .ok ===
        true,
      'audit hash chain 정상'
    );
  }

  console.log(
    '▸ TC-27: Safety Connector defensive copy'
  );

  {
    const result =
      await safety.scanText(
        runtime,
        {
          subject:
            'user:1',

          text:
            '검찰입니다 송금하세요',

          idempotency_key:
            'def-copy-safety',
        }
      );

    result.execution
      .connector_result
      .findings
      .push({
        code: 'EVIL',
      });

    const stored =
      executionEngine
        .getExecution(
          result.execution
            .execution_id
        );

    assert(
      !stored
        .connector_result
        .findings
        .some(
          (item) =>
            item.code ===
            'EVIL'
        ),
      'Safety execution defensive copy'
    );
  }

  console.log(
    '▸ TC-28: Document Connector defensive copy'
  );

  {
    const list =
      documentConnector
        .list();

    if (
      list.length > 0
    ) {
      list[0]
        .output_format =
        'evil';
    }

    const again =
      documentConnector
        .list();

    assert(
      again.length ===
        0 ||
      again[0]
        .output_format !==
        'evil',
      'Document defensive copy'
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
