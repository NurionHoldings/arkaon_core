'use strict';

/**
 * SafetyPipeline
 * ─────────────────────────────────────────────────
 *
 * DIGITAL_SUPPORT 실행 전 파일에 대해
 * SAFETY_GUARD 사전검사를 수행한다.
 *
 * SAFE/LOW:
 *   document operation 진행 가능
 *
 * MEDIUM:
 *   사용자에게 주의/HOLD 권장
 *
 * HIGH/CRITICAL:
 *   document operation 중단
 *
 * 중요:
 * "SAFE"는 완전한 무해 보증이 아니다.
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

const PIPELINE_RESULT =
  Object.freeze({
    PROCEED: 'PROCEED',
    REVIEW: 'REVIEW',
    BLOCK_OPERATION:
      'BLOCK_OPERATION',
  });

class SafetyPipeline {
  constructor(opts = {}) {
    if (!opts.safetyService) {
      throw new Error(
        'safetyService is required'
      );
    }

    if (!opts.digitalService) {
      throw new Error(
        'digitalService is required'
      );
    }

    if (!opts.capabilityRuntime) {
      throw new Error(
        'capabilityRuntime is required'
      );
    }

    this.safety =
      opts.safetyService;

    this.digital =
      opts.digitalService;

    this.runtime =
      opts.capabilityRuntime;
  }

  _scanResult(
    safetyResult
  ) {
    return (
      safetyResult &&
      safetyResult.execution &&
      safetyResult.execution
        .connector_result
    );
  }

  classify(
    safetyResult
  ) {
    const scan =
      this._scanResult(
        safetyResult
      );

    if (!scan) {
      return {
        pipeline_result:
          PIPELINE_RESULT.REVIEW,

        reason:
          'safety_result_missing',
      };
    }

    const risk =
      String(
        scan.risk ||
        'UNKNOWN'
      ).toUpperCase();

    if (
      risk === 'HIGH' ||
      risk === 'CRITICAL'
    ) {
      return {
        pipeline_result:
          PIPELINE_RESULT
            .BLOCK_OPERATION,

        reason:
          'high_risk_input',

        risk,
      };
    }

    if (
      risk === 'MEDIUM' ||
      risk === 'UNKNOWN'
    ) {
      return {
        pipeline_result:
          PIPELINE_RESULT.REVIEW,

        reason:
          'manual_review_recommended',

        risk,
      };
    }

    return {
      pipeline_result:
        PIPELINE_RESULT.PROCEED,

      reason:
        'no_high_risk_signal_detected',

      risk,
    };
  }

  async scanThenConvert(
    input = {}
  ) {
    const safetyResult =
      await this.safety
        .scanFile(
          this.runtime,
          {
            subject:
              input.subject,

            device_id:
              input.device_id,

            filename:
              input.filename,

            size_bytes:
              input.size_bytes,

            mime_type:
              input.mime_type,

            sha256:
              input.sha256,

            source:
              input.source,

            metadata:
              input.metadata,

            idempotency_key:
              input
                .safety_idempotency_key ||
              `scan:${input.idempotency_key}`,

            now:
              input.now,
          }
        );

    const classification =
      this.classify(
        safetyResult
      );

    if (
      classification
        .pipeline_result ===
      PIPELINE_RESULT
        .BLOCK_OPERATION
    ) {
      return clone({
        status:
          'BLOCKED_BY_SAFETY',

        executed:
          false,

        safety_result:
          safetyResult,

        safety_decision:
          classification,

        /**
         * 파일 삭제/격리는 하지 않는다.
         */
        file_deleted:
          false,

        authority_granted:
          false,
      });
    }

    if (
      classification
        .pipeline_result ===
      PIPELINE_RESULT.REVIEW &&
      input
        .allow_review_override !==
        true
    ) {
      return clone({
        status:
          'SAFETY_REVIEW_REQUIRED',

        executed:
          false,

        safety_result:
          safetyResult,

        safety_decision:
          classification,

        authority_granted:
          false,
      });
    }

    const scan =
      this._scanResult(
        safetyResult
      );

    const converted =
      await this.digital
        .convert(
          this.runtime,
          {
            subject:
              input.subject,

            device_id:
              input.device_id,

            filename:
              input.filename,

            output_format:
              input.output_format,

            mime_type:
              input.mime_type,

            source_text:
              input.source_text,

            source:
              input.source,

            safety_scan_id:
              scan &&
              scan.scan_id,

            idempotency_key:
              input.idempotency_key,

            policy_ok:
              input.policy_ok,

            gate_context:
              input.gate_context,

            now:
              input.now,
          }
        );

    return clone({
      status:
        converted.status,

      executed:
        converted.executed,

      safety_result:
        safetyResult,

      safety_decision:
        classification,

      conversion_result:
        converted,

      authority_granted:
        false,
    });
  }
}

module.exports = {
  SafetyPipeline,
  PIPELINE_RESULT,
};
