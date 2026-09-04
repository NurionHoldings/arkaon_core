'use strict';

/**
 * MemorySafetyConnector
 * ────────────────────────────────────────────────
 *
 * STATIC / HEURISTIC PROTOTYPE ONLY.
 *
 * 실제 antivirus / sandbox / reputation service가 아니다.
 * URL을 방문하지 않고, 파일을 실행하지 않고,
 * APK를 설치하지 않는다.
 *
 * 입력 문자열 + metadata만 검사한다.
 */

const crypto = require('crypto');

const RISK_SCORE = Object.freeze({
  LOW: 0,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 85,
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function scanId() {
  return `scan_${crypto.randomUUID()}`;
}

function clamp100(value) {
  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(n)
    )
  );
}

function riskFromScore(
  score
) {
  const n =
    clamp100(score);

  if (
    n >=
    RISK_SCORE.CRITICAL
  ) {
    return 'CRITICAL';
  }

  if (
    n >=
    RISK_SCORE.HIGH
  ) {
    return 'HIGH';
  }

  if (
    n >=
    RISK_SCORE.MEDIUM
  ) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function fileExtension(
  filename
) {
  const name =
    String(
      filename ||
      ''
    ).toLowerCase();

  const parts =
    name.split('.');

  if (
    parts.length < 2
  ) {
    return '';
  }

  return parts.pop();
}

function detectDoubleExtension(
  filename
) {
  const name =
    String(
      filename ||
      ''
    ).toLowerCase();

  return /\.(pdf|doc|docx|jpg|jpeg|png|txt|hwp)\.(apk|exe|scr|bat|cmd|js|vbs)$/i.test(
    name
  );
}

function inspectUrl(url) {
  const value =
    String(
      url ||
      ''
    ).trim();

  let score = 0;
  const findings = [];

  if (
    !/^https?:\/\//i.test(
      value
    )
  ) {
    score += 15;
    findings.push({
      code:
        'NON_HTTP_SCHEME_OR_MALFORMED',
      severity:
        'MEDIUM',
    });
  }

  if (
    /(^|\/\/)\d{1,3}(?:\.\d{1,3}){3}(?:[:/]|$)/.test(
      value
    )
  ) {
    score += 25;
    findings.push({
      code:
        'RAW_IP_URL',
      severity:
        'MEDIUM',
    });
  }

  if (
    /(login|verify|secure|bank|금융|인증|본인확인).*(\.zip|\.apk|download)/i.test(
      value
    )
  ) {
    score += 35;
    findings.push({
      code:
        'SOCIAL_ENGINEERING_DOWNLOAD_PATTERN',
      severity:
        'HIGH',
    });
  }

  if (
    /(bit\.ly|tinyurl\.com|t\.co|goo\.gl)\//i.test(
      value
    )
  ) {
    score += 15;
    findings.push({
      code:
        'SHORTENED_URL',
      severity:
        'MEDIUM',
    });
  }

  if (
    /@/.test(value)
  ) {
    score += 20;
    findings.push({
      code:
        'URL_AT_SIGN',
      severity:
        'MEDIUM',
    });
  }

  return {
    score:
      clamp100(score),
    findings,
  };
}

function inspectText(text) {
  const value =
    String(
      text ||
      ''
    );

  let score = 0;
  const findings = [];

  const patterns = [
    {
      re:
        /(검찰|경찰|금감원|금융감독원).*(송금|이체|안전계좌|보호계좌)/i,
      // HIGH threshold (RISK_SCORE.HIGH = 60) — 기관 사칭 송금은 HIGH 이상
      score: 60,
      code:
        'INSTITUTION_TRANSFER_REQUEST',
    },
    {
      re:
        /(원격제어|원격지원|anydesk|teamviewer|퀵서포트|quicksupport)/i,
      score: 45,
      code:
        'REMOTE_CONTROL_REQUEST',
    },
    {
      re:
        /(apk|앱 설치|설치파일|보안앱).*(설치|다운로드|받아)/i,
      score: 40,
      code:
        'APK_INSTALL_REQUEST',
    },
    {
      re:
        /(인증번호|otp|비밀번호|계좌번호).*(알려|보내|입력)/i,
      score: 35,
      code:
        'SECRET_REQUEST',
    },
    {
      re:
        /(당첨|환급|지원금|미납|과태료).*(링크|주소|클릭)/i,
      score: 25,
      code:
        'URGENCY_LINK_PATTERN',
    },
  ];

  for (
    const pattern
    of patterns
  ) {
    if (
      pattern.re.test(
        value
      )
    ) {
      score +=
        pattern.score;

      findings.push({
        code:
          pattern.code,

        severity:
          pattern.score >= 40
            ? 'HIGH'
            : 'MEDIUM',
      });
    }
  }

  return {
    score:
      clamp100(score),

    findings,
  };
}

function inspectFile(
  payload
) {
  const filename =
    String(
      payload.filename ||
      ''
    );

  const ext =
    fileExtension(
      filename
    );

  let score = 0;
  const findings = [];

  const executable =
    new Set([
      'apk',
      'exe',
      'scr',
      'bat',
      'cmd',
      'com',
      'msi',
      'jar',
      'vbs',
      'js',
    ]);

  if (
    executable.has(ext)
  ) {
    score +=
      ext === 'apk'
        ? 45
        : 55;

    findings.push({
      code:
        'EXECUTABLE_FILE_TYPE',

      severity:
        'HIGH',

      extension:
        ext,
    });
  }

  if (
    detectDoubleExtension(
      filename
    )
  ) {
    score += 45;

    findings.push({
      code:
        'DOUBLE_EXTENSION',

      severity:
        'HIGH',
    });
  }

  if (
    payload.mime_type &&
    /pdf/i.test(
      payload.mime_type
    ) &&
    executable.has(ext)
  ) {
    score += 30;

    findings.push({
      code:
        'MIME_EXTENSION_MISMATCH',

      severity:
        'HIGH',
    });
  }

  if (
    payload.source &&
    /(sms|unknown|unknown_sender|messenger_unknown)/i.test(
      payload.source
    ) &&
    executable.has(ext)
  ) {
    score += 25;

    findings.push({
      code:
        'UNKNOWN_SOURCE_EXECUTABLE',

      severity:
        'HIGH',
    });
  }

  return {
    score:
      clamp100(score),

    findings,
  };
}

function inspectApk(
  payload
) {
  let score = 0;
  const findings = [];

  const permissions =
    Array.isArray(
      payload
        .requested_permissions
    )
      ? payload
          .requested_permissions
          .map(
            (item) =>
              String(
                item
              ).toUpperCase()
          )
      : [];

  const sensitive =
    [
      'READ_SMS',
      'RECEIVE_SMS',
      'SEND_SMS',
      'READ_CALL_LOG',
      'WRITE_CALL_LOG',
      'READ_CONTACTS',
      'SYSTEM_ALERT_WINDOW',
      'BIND_ACCESSIBILITY_SERVICE',
      'REQUEST_INSTALL_PACKAGES',
      'ANSWER_PHONE_CALLS',
    ];

  const matched =
    sensitive.filter(
      (permission) =>
        permissions.some(
          (actual) =>
            actual.includes(
              permission
            )
        )
    );

  if (
    matched.length >= 1
  ) {
    score +=
      Math.min(
        55,
        matched.length * 12
      );

    findings.push({
      code:
        'SENSITIVE_ANDROID_PERMISSIONS',

      severity:
        matched.length >= 3
          ? 'HIGH'
          : 'MEDIUM',

      permissions:
        matched,
    });
  }

  if (
    !payload.signer
  ) {
    score += 15;

    findings.push({
      code:
        'SIGNER_UNKNOWN',

      severity:
        'MEDIUM',
    });
  }

  if (
    payload.source &&
    /(sms|unknown|messenger_unknown)/i.test(
      payload.source
    )
  ) {
    score += 25;

    findings.push({
      code:
        'APK_FROM_UNTRUSTED_CHANNEL',

      severity:
        'HIGH',
    });
  }

  return {
    score:
      clamp100(score),

    findings,
  };
}

function inspectPhone(
  payload
) {
  let score = 0;
  const findings = [];

  if (
    payload.known_contact ===
    true
  ) {
    return {
      score: 0,
      findings: [],
    };
  }

  if (
    Number(
      payload.repeated_calls
    ) >= 3
  ) {
    score += 20;

    findings.push({
      code:
        'REPEATED_UNKNOWN_CALLS',

      severity:
        'MEDIUM',
    });
  }

  if (
    Number(
      payload.reported_count
    ) >= 5
  ) {
    score += 40;

    findings.push({
      code:
        'COMMUNITY_REPORT_SIGNAL',

      severity:
        'HIGH',
    });
  }

  if (
    payload
      .institution_claim &&
    payload
      .verified_institution !==
      true
  ) {
    score += 35;

    findings.push({
      code:
        'UNVERIFIED_INSTITUTION_CLAIM',

      severity:
        'HIGH',
    });
  }

  return {
    score:
      clamp100(score),

    findings,
  };
}

class MemorySafetyConnector {
  constructor() {
    this.scan_count = 0;
  }

  async execute(action) {
    const skill =
      action.skill;

    const payload =
      clone(
        action.payload ||
        {}
      );

    let analysis;

    if (
      skill ===
      'URL_SCAN'
    ) {
      analysis =
        inspectUrl(
          payload.url
        );
    } else if (
      skill ===
      'TEXT_SCAN'
    ) {
      analysis =
        inspectText(
          payload.text
        );
    } else if (
      skill ===
      'FILE_SCAN'
    ) {
      analysis =
        inspectFile(
          payload
        );
    } else if (
      skill ===
      'APK_SCAN'
    ) {
      analysis =
        inspectApk(
          payload
        );
    } else if (
      skill ===
      'PHONE_SCREEN'
    ) {
      analysis =
        inspectPhone(
          payload
        );
    } else {
      return {
        ok: false,
        error:
          'safety_skill_not_bound',
      };
    }

    this.scan_count++;

    const scan = {
      ok: true,

      scan_id:
        scanId(),

      risk_score:
        analysis.score,

      risk:
        riskFromScore(
          analysis.score
        ),

      findings:
        clone(
          analysis.findings
        ),

      provenance: {
        engine:
          'MEMORY_STATIC_HEURISTIC_V1',

        network_lookup:
          false,

        file_executed:
          false,

        apk_installed:
          false,

        safety_guaranteed:
          false,
      },

      authority_granted:
        false,
    };

    return scan;
  }

  async verify(
    action,
    result
  ) {
    return {
      ok:
        Boolean(
          result &&
          result.scan_id &&
          result.risk
        ),

      verified:
        'static_scan_completed',

      safety_guaranteed:
        false,
    };
  }
}

module.exports = {
  MemorySafetyConnector,
  RISK_SCORE,
  riskFromScore,
  fileExtension,
  detectDoubleExtension,
  inspectUrl,
  inspectText,
  inspectFile,
  inspectApk,
  inspectPhone,
};
