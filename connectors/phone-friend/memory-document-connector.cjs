'use strict';

/**
 * MemoryDocumentConnector
 * ────────────────────────────────────────────────
 *
 * 실제 LibreOffice/OCR/PDF 변환기가 아니라
 * DIGITAL_SUPPORT 실행 계약 검증용 Memory Connector.
 *
 * 실행 파일/APK는 document converter에서 다루지 않는다.
 */

const crypto =
  require('crypto');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  return `document_${crypto.randomUUID()}`;
}

function extension(
  filename
) {
  const name =
    String(
      filename ||
      ''
    );

  const index =
    name.lastIndexOf('.');

  if (index < 0) {
    return '';
  }

  return name
    .slice(index + 1)
    .toLowerCase();
}

const FORBIDDEN_EXECUTABLE_EXTENSIONS =
  new Set([
    'apk',
    'exe',
    'scr',
    'bat',
    'cmd',
    'com',
    'msi',
    'vbs',
    'jar',
  ]);

class MemoryDocumentConnector {
  constructor() {
    this._outputs =
      [];

    this._writes =
      new Map();
  }

  list() {
    return clone(
      this._outputs
    );
  }

  async execute(action) {
    const skill =
      action.skill;

    const payload =
      clone(
        action.payload ||
        {}
      );

    if (
      skill ===
      'DOCUMENT_SIMPLIFY'
    ) {
      const text =
        String(
          payload.text ||
          ''
        );

      if (!text) {
        return {
          ok: false,
          error:
            'text_missing',
        };
      }

      /**
       * 실제 LLM simplifier가 들어오기 전 deterministic placeholder.
       */
      return {
        ok: true,

        original_text:
          text,

        simplified_text:
          `쉬운 설명: ${text}`,

        model:
          'DETERMINISTIC_PLACEHOLDER_V1',
      };
    }

    if (
      skill ===
      'DOCUMENT_ACCESSIBILITY'
    ) {
      const text =
        String(
          payload.text ||
          ''
        );

      if (!text) {
        return {
          ok: false,
          error:
            'text_missing',
        };
      }

      const output = {
        id:
          makeId(),

        type:
          'ACCESSIBLE_DOCUMENT',

        text,

        large_text:
          payload.large_text !==
          false,

        line_spacing:
          payload.line_spacing ||
          'WIDE',

        simplify:
          payload.simplify !==
          false,
      };

      this._outputs.push(
        clone(output)
      );

      return {
        ok: true,
        document:
          clone(output),
      };
    }

    if (
      skill ===
        'DOCUMENT_CONVERT' ||
      skill ===
        'IMAGE_TO_DOCUMENT'
    ) {
      const filename =
        String(
          payload.filename ||
          ''
        );

      if (!filename) {
        return {
          ok: false,
          error:
            'filename_missing',
        };
      }

      const ext =
        extension(
          filename
        );

      if (
        FORBIDDEN_EXECUTABLE_EXTENSIONS.has(
          ext
        )
      ) {
        return {
          ok: false,

          error:
            'executable_document_conversion_forbidden',
        };
      }

      if (
        !payload
          .safety_scan_id
      ) {
        return {
          ok: false,

          error:
            'safety_scan_required',
        };
      }

      const key =
        action
          .idempotency_key;

      if (
        this._writes.has(
          key
        )
      ) {
        return clone(
          this._writes.get(
            key
          )
        );
      }

      const output = {
        id:
          makeId(),

        source_filename:
          filename,

        output_format:
          payload
            .output_format ||
          'pdf',

        safety_scan_id:
          payload
            .safety_scan_id,

        extracted_text:
          payload
            .extracted_text ||
          null,

        created_at:
          new Date()
            .toISOString(),
      };

      this._outputs.push(
        clone(output)
      );

      const result = {
        ok: true,

        document:
          clone(output),
      };

      this._writes.set(
        key,
        clone(result)
      );

      return result;
    }

    return {
      ok: false,

      error:
        'document_skill_not_bound',
    };
  }

  async verify(
    action,
    result
  ) {
    if (
      action.skill ===
      'DOCUMENT_SIMPLIFY'
    ) {
      return {
        ok:
          Boolean(
            result &&
            result
              .simplified_text
          ),

        verified:
          'simplification_completed',
      };
    }

    if (
      result &&
      result.document
    ) {
      const exists =
        this._outputs.some(
          (item) =>
            item.id ===
            result.document.id
        );

      return {
        ok:
          exists,

        verified:
          exists
            ? 'document_output_exists'
            : 'document_output_missing',
      };
    }

    return {
      ok: false,
    };
  }

  async rollback(
    action,
    result
  ) {
    if (
      !result ||
      !result.document
    ) {
      return {
        ok: false,

        error:
          'document_rollback_not_applicable',
      };
    }

    const index =
      this._outputs.findIndex(
        (item) =>
          item.id ===
          result.document.id
      );

    if (
      index < 0
    ) {
      return {
        ok: false,

        error:
          'document_output_not_found',
      };
    }

    this._outputs.splice(
      index,
      1
    );

    return {
      ok: true,

      removed_document_id:
        result.document.id,
    };
  }
}

module.exports = {
  MemoryDocumentConnector,
  FORBIDDEN_EXECUTABLE_EXTENSIONS,
};
