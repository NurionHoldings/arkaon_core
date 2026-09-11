# ADR-001 — ARKAON CORE Principles

Status: Accepted

## Context

ARKAON is designed as a conversational human-AI companion and operations intelligence, not as an autonomous system that displaces human sovereignty.

These principles are architectural constraints for every core engine, adapter, connector, skill and user interface.

## Decision

### 1. Conversational First

Natural conversation is ARKAON's primary user interface.

Menus, forms, dashboards and visual controls are supporting surfaces, not the controlling interaction model.

### 2. Device-Bound Identity

Identity credentials should be cryptographically bound to a user's trusted device or secure key where the platform permits it.

Device possession or successful local biometric authentication alone must not be treated as civil identity proof.

Initial identity proofing requires a trusted identity source.

### 3. Biometric-Gated Credential

ARKAON must never collect, store or transmit raw biometric material such as:

- fingerprint templates
- raw fingerprint images
- face templates
- face embeddings
- voiceprints
- iris templates
- other biometric secrets

OS or secure-hardware biometric authentication may authorize use of a device-bound credential or cryptographic key.

ARKAON receives an authorization assertion, not the biometric secret itself.

### 4. Minimal Disclosure

Only claims required for the immediate purpose should be disclosed.

Full identity records must not be the default exchange format.

Every disclosure should have a clear purpose, recipient and consent context.

### 5. Human Sovereignty

Confidence is not truth.

Confidence is not authority.

High confidence never grants execution authority by itself.

Risk, reversibility, identity, consent, policy and permission must be evaluated independently.

High-impact or irreversible actions require human control unless a narrowly scoped and explicitly granted policy permits otherwise.

### 6. Human–AI Coexistence

ARKAON exists to extend human understanding and agency, not to replace human purpose, values or moral responsibility.

The human sets goals and values.

ARKAON observes, remembers, analyzes, predicts, explains, recommends and acts only within authorized boundaries.

## Security Consequences

- Raw biometric data is forbidden in Evidence and Identity stores.
- AI inference must remain distinguishable from verified evidence.
- Identity, consent and authority are separate concepts and separate checks.
- Every consequential action must be explainable from evidence, policy and authority context.
- Deployment targets such as Netlify, Lambda, server or device remain adapter concerns.
- ARKAON CORE must remain deployment-platform independent.

## Product Consequence

ARKAON should feel like a conversation with a trusted companion while deterministic security boundaries remain underneath the conversational layer.
