'use strict';

/**
 * DigitalSupportService
 * ───────────────────────────────────────────────
 * PHONE FRIEND — DIGITAL_SUPPORT
 *
 * 문서변환 / 쉬운말 / 큰글씨 / 이미지→문서 등의
 * 요청을 구조화한다.
 *
 * 실제 파일 처리는 Connector가 담당하며,
 * 안전검사가 필요한 경우 SafetyPipeline을 사용한다.
 */

const {
  CAPABILITY,
  SKILL_ACTION,
} = require('./catalog.cjs');

const DIGITAL_SKILL = Object.freeze({
  DOCUMENT_CONVERT:
    SKILL_ACTION.DOCUMENT_CONVERT,

  DOCUMENT_SIMPLIFY:
    'DOCUMENT_SIMPLIFY',

  DOCUMENT_ACCESSIBILITY:
    'DOCUMENT_ACCESSIBILITY',

  IMAGE_TO_DOCUMENT:
    'IMAGE_TO_DOCUMENT',
});

const OUTPUT_FORMATS =
  new Set([
    'pdf',
    'txt',
    'html',
    'md',
    'docx',
  ]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value || '').trim();
}

class DigitalSupportService {
  createConvertIntent(
    input = {}
  ) {
    const filename =
      normalize(
        input.filename
      );

    const outputFormat =
      normalize(
        input.output_format
      ).toLowerCase();

    if (!filename) {
      throw new Error(
        'filename is required'
      );
    }

    if (
      !OUTPUT_FORMATS.has(
        outputFormat
      )
    ) {
      throw new Error(
        'unsupported output_format'
      );
    }

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.DIGITAL_SUPPORT,

      capability:
        DIGITAL_SKILL
          .DOCUMENT_CONVERT,

      /**
       * 변환은 새 산출물을 생성하므로
       * READ가 아니라 WRITE로 올린다.
       */
      domain:
        'GENERAL_ASSISTANT',

      action:
        'WRITE',

      title:
        `${filename} → ${outputFormat} 변환`,

      raw_text:
        input.raw_text ||
        filename,

      slots: {
        filename,

        output_format:
          outputFormat,

        mime_type:
          input.mime_type ||
          null,

        source_text:
          input.source_text ||
          null,

        source:
          input.source ||
          null,

        safety_scan_id:
          input.safety_scan_id ||
          null,
      },

      authority_granted:
        false,
    });
  }

  createSimplifyIntent(
    input = {}
  ) {
    const text =
      normalize(
        input.text
      );

    if (!text) {
      throw new Error(
        'text is required'
      );
    }

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.DIGITAL_SUPPORT,

      capability:
        DIGITAL_SKILL
          .DOCUMENT_SIMPLIFY,

      domain:
        'GENERAL_ASSISTANT',

      action:
        'READ',

      title:
        '문서 쉬운말 설명',

      raw_text:
        input.raw_text ||
        text,

      slots: {
        text,

        reading_level:
          input.reading_level ||
          'EASY',
      },

      authority_granted:
        false,
    });
  }

  createAccessibilityIntent(
    input = {}
  ) {
    const text =
      normalize(
        input.text
      );

    if (!text) {
      throw new Error(
        'text is required'
      );
    }

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.DIGITAL_SUPPORT,

      capability:
        DIGITAL_SKILL
          .DOCUMENT_ACCESSIBILITY,

      domain:
        'GENERAL_ASSISTANT',

      action:
        'WRITE',

      title:
        '문서 접근성 변환',

      raw_text:
        input.raw_text ||
        text,

      slots: {
        text,

        large_text:
          input.large_text !==
          false,

        line_spacing:
          input.line_spacing ||
          'WIDE',

        simplify:
          input.simplify !==
          false,
      },

      authority_granted:
        false,
    });
  }

  createImageToDocumentIntent(
    input = {}
  ) {
    const filename =
      normalize(
        input.filename
      );

    if (!filename) {
      throw new Error(
        'filename is required'
      );
    }

    return clone({
      product:
        'PHONE_FRIEND',

      product_capability:
        CAPABILITY.DIGITAL_SUPPORT,

      capability:
        DIGITAL_SKILL
          .IMAGE_TO_DOCUMENT,

      domain:
        'GENERAL_ASSISTANT',

      action:
        'WRITE',

      title:
        `이미지 문서화: ${filename}`,

      raw_text:
        input.raw_text ||
        filename,

      slots: {
        filename,

        extracted_text:
          input.extracted_text ||
          null,

        output_format:
          input.output_format ||
          'pdf',

        safety_scan_id:
          input.safety_scan_id ||
          null,
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

    if (
      typeof input.idempotency_key !==
        'string' ||
      input.idempotency_key.trim() ===
        ''
    ) {
      throw new Error(
        'digital support write/read requires idempotency_key'
      );
    }

    return runtime.executeIntent({
      intent,

      subject:
        input.subject,

      device_id:
        input.device_id,

      connector:
        input.connector ||
        'phone-friend-document',

      idempotency_key:
        input.idempotency_key,

      gate_context: {
        ...(input.gate_context ||
          {}),

        policy_ok:
          input.policy_ok ===
          true ||
          Boolean(
            input.gate_context &&
            input.gate_context
              .policy_ok
          ),
      },

      retry_safe:
        intent.action ===
        'READ',

      max_retries:
        intent.action ===
        'READ'
          ? 1
          : 0,

      reversible:
        true,

      verify_required:
        true,

      now:
        input.now,
    });
  }

  async convert(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createConvertIntent(
        input
      ),
      input
    );
  }

  async simplify(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createSimplifyIntent(
        input
      ),
      input
    );
  }

  async accessibility(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createAccessibilityIntent(
        input
      ),
      input
    );
  }

  async imageToDocument(
    runtime,
    input = {}
  ) {
    return this._execute(
      runtime,
      this.createImageToDocumentIntent(
        input
      ),
      input
    );
  }
}

module.exports = {
  DigitalSupportService,
  DIGITAL_SKILL,
  OUTPUT_FORMATS,
};
