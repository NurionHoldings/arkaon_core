# ADR-001: ARKAON CORE 핵심 원칙

- **상태**: 확정 (Accepted)
- **일자**: 2026-09-04
- **작성**: ARKAON Architecture Board

---

## 맥락

ARKAON은 범용 Autonomous Human-AI Operations Intelligence로서,
플랫폼 독립적인 인지(Cognitive) 엔진과 대화형 신원 자격증명 체계를 갖춘다.
아래 다섯 원칙은 모든 ARKAON 모듈(CORE, CALL, AI법친, MJN, 부업장터 등)에
관통하는 설계 제약이며, 이후 ADR은 이 원칙 위에 세부 결정을 쌓는다.

---

## 원칙

### 1. Conversational First

ARKAON의 기본 사용자 인터페이스는 **대화**다.
GUI·대시보드·폼은 대화를 보조하는 수단이지 대체재가 아니다.

### 2. Device-Bound Identity

신원 자격증명(Credential)은 특정 사용자 기기와 **암호학적으로 결합**한다.
자격증명이 기기 밖으로 복사·이동되는 구조를 기본값으로 삼지 않는다.

### 3. Biometric-Gated Credential

생체정보 자체는 ARKAON이 **보유하지 않는다**.
OS/보안 하드웨어의 생체인증 **성공 결과**(assertion)로
신원 Credential 사용만 허용한다.

**금지 사항:**
- `fingerprint_template`, `face_embedding`, `raw_biometric_data` 등
  생체 원본·임베딩의 저장·전송·로깅 일체 금지.

**허용 형태:**
```json
{
  "source_type": "BIOMETRIC_ASSERTION",
  "claim": "device_user_present",
  "observed_value": true,
  "authenticator": "OS_BIOMETRIC",
  "trust_score": 0.98
}
```

### 4. Minimal Disclosure

상대 서비스에는 **필요한 Identity Claim만** 전달한다.
전체 개인정보 전달을 기본값으로 삼지 않는다.

### 5. Human Sovereignty

- **Confidence는 Truth가 아니며, Confidence는 Authority가 아니다.**
- ARKAON이 99% 확신하더라도 실행 권한이 없으면 실행하지 못한다.
- 55%의 불확실한 판단이라도 가역적·저위험 행동(정보 알림 등)은 수행할 수 있다.
- **고위험·비가역 행동의 최종 통제권은 사용자에게 있다.**

---

## 결과

- 모든 Cognitive Engine 모듈은 위 원칙을 코드 수준에서 강제한다.
- Evidence Engine은 `AI_INFERENCE`를 검증된 소스(`INSTITUTION`, `PLATFORM_API` 등)와
  동일 등급으로 취급하지 않는다.
- 생체 원본 데이터가 Evidence에 포함되면 즉시 거부한다.
- 이 ADR을 위반하는 설계 변경은 별도 ADR로 명시적 승인을 받아야 한다.
