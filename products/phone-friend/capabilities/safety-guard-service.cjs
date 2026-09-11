'use strict';

/**
 * SafetyGuardService
 * ─────────────────────────────────────────────────
 * PHONE FRIEND — SAFETY_GUARD
 *
 * 외부 입력(URL / TEXT / FILE / APK / PHONE NUMBER)을
 * "실행하거나 열지 않고" 사전 검사하도록 요청하는 Product Service.
 *
 * Product Layer는 위험도를 판단할 수 있지만
 * Authority / 삭제권한 / 차단권한을 생성하지 않는다.
 */

const {
  CAPABILITY,
} = require('./catalog.cjs');

const SAFETY_SKILL = Object.freeze({
  URL_SCAN: 'URL_SCAN',
  TEXT_SCAN: 'TEXT_SCAN',
  FILE_SCAN: 'FILE_SCAN',
  APK_SCAN: 'APK_SCAN',
  PHONE_SCREEN: 'PHONE_SCREEN',
});

const SAFETY_INPUT_TYPE = Object.freeze({
  URL: 'URL',
  TEXT: 'TEXT',
  FILE: 'FILE',
  APK: 'APK',
  PHONE: 'PHONE',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value || '').trim();
}

function required(value, field) {
  const text = normalize(value);

  if (!text) {
    throw new Error(`${field} is required`);
  }

  return text;
}

class SafetyGuardService {
  createUrlScanIntent(input = {}) {
    const url =
      required(
        input.url,
        'url'
      );

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.SAFETY_GUARD,

      capability:
        SAFETY_SKILL.URL_SCAN,

      domain:
        'SAFETY',

      action:
        'WARN',

      title:
        'URL 안전 사전검사',

      raw_text:
        input.raw_text ||
        `URL 검사 ${url}`,

      slots: {
        input_type:
          SAFETY_INPUT_TYPE.URL,

        url,
      },

      authority_granted:
        false,
    });
  }

  createTextScanIntent(input = {}) {
    const text =
      required(
        input.text,
        'text'
      );

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.SAFETY_GUARD,

      capability:
        SAFETY_SKILL.TEXT_SCAN,

      domain:
        'SAFETY',

      action:
        'WARN',

      title:
        '문자·텍스트 위험신호 검사',

      raw_text:
        input.raw_text ||
        text,

      slots: {
        input_type:
          SAFETY_INPUT_TYPE.TEXT,

        text,
      },

      authority_granted:
        false,
    });
  }

  createFileScanIntent(input = {}) {
    const filename =
      required(
        input.filename,
        'filename'
      );

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.SAFETY_GUARD,

      capability:
        SAFETY_SKILL.FILE_SCAN,

      domain:
        'SAFETY',

      action:
        'WARN',

      title:
        `파일 사전검사: ${filename}`,

      raw_text:
        input.raw_text ||
        filename,

      slots: {
        input_type:
          SAFETY_INPUT_TYPE.FILE,

        filename,

        size_bytes:
          Number.isFinite(
            Number(
              input.size_bytes
            )
          )
            ? Number(
                input.size_bytes
              )
            : null,

        mime_type:
          input.mime_type ||
          null,

        sha256:
          input.sha256 ||
          null,

        source:
          input.source ||
          null,

        metadata:
          clone(
            input.metadata ||
            {}
          ),
      },

      authority_granted:
        false,
    });
  }

  createApkScanIntent(input = {}) {
    const filename =
      required(
        input.filename,
        'filename'
      );

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.SAFETY_GUARD,

      capability:
        SAFETY_SKILL.APK_SCAN,

      domain:
        'SAFETY',

      action:
        'WARN',

      title:
        `APK 사전검사: ${filename}`,

      raw_text:
        input.raw_text ||
        filename,

      slots: {
        input_type:
          SAFETY_INPUT_TYPE.APK,

        filename,

        package_name:
          input.package_name ||
          null,

        signer:
          input.signer ||
          null,

        requested_permissions:
          Array.isArray(
            input.requested_permissions
          )
            ? [
                ...input
                  .requested_permissions,
              ]
            : [],

        source:
          input.source ||
          null,

        sha256:
          input.sha256 ||
          null,

        metadata:
          clone(
            input.metadata ||
            {}
          ),
      },

      authority_granted:
        false,
    });
  }

  createPhoneScreenIntent(input = {}) {
    const number =
      required(
        input.number,
        'number'
      );

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.SAFETY_GUARD,

      capability:
        SAFETY_SKILL.PHONE_SCREEN,

      domain:
        'SAFETY',

      action:
        'WARN',

      title:
        `낯선번호 검사: ${number}`,

      raw_text:
        input.raw_text ||
        number,

      slots: {
        input_type:
          SAFETY_INPUT_TYPE.PHONE,

        number,

        known_contact:
          input.known_contact ===
          true,

        repeated_calls:
          Number.isInteger(
            input.repeated_calls
          )
            ? input.repeated_calls
            : 0,

        reported_count:
          Number.isInteger(
            input.reported_count
          )
            ? input.reported_count
            : 0,

        institution_claim:
          input.institution_claim ||
          null,

        verified_institution:
          input.verified_institution ===
          true,
      },

      authority_granted:
        false,
    });
  }

  async _execute(
    runtime,
    intent,
    input
  ) {
    if (
      !runtime ||
      typeof runtime.executeIntent !==
        'function'
    ) {
      throw new Error(
        'capability runtime is required'
      );
    }

    const key =
      input.idempotency_key ||
      `safety:${intent.capability}:${JSON.stringify(intent.slots)}`;

    return runtime.executeIntent({
      intent,

      subject:
        input.subject,

      device_id:
        input.device_id,

      connector:
        input.connector ||
        'phone-friend-safety',

      idempotency_key:
        key,

      gate_context:
        input.gate_context ||
        {},

      retry_safe:
        true,

      max_retries:
        Number.isInteger(
          input.max_retries
        )
          ? input.max_retries
          : 1,

      reversible:
        true,

      verify_required:
        true,

      now:
        input.now,
    });
  }

  async scanUrl(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createUrlScanIntent(
        input
      ),
      input
    );
  }

  async scanText(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createTextScanIntent(
        input
      ),
      input
    );
  }

  async scanFile(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createFileScanIntent(
        input
      ),
      input
    );
  }

  async scanApk(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createApkScanIntent(
        input
      ),
      input
    );
  }

  async screenPhone(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createPhoneScreenIntent(
        input
      ),
      input
    );
  }
}

module.exports = {
  SafetyGuardService,
  SAFETY_SKILL,
  SAFETY_INPUT_TYPE,
};
