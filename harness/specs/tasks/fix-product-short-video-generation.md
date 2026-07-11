---
id: fix-product-short-video-generation
title: Fix provider-backed product short-video generation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Let the AI Apps product short-video workbench create and inspect real video-generation tasks through the current provider, with selectable video models, explicit task metadata, status refresh, result URLs, and actionable provider errors.
touchedAreas:
  - harness/specs/tasks/fix-product-short-video-generation.md
  - shared/host-api/contract.ts
  - src/lib/host-api.ts
  - electron/services/ai-apps-api.ts
  - src/pages/AiApps/index.tsx
  - shared/i18n/locales/*/skills.json
  - tests/unit/ai-apps-api.test.ts
  - tests/e2e/skills-gateway-readiness.spec.ts
expectedUserBehavior:
  - The product short-video form accepts product text, selling points, target platform, aspect ratio, and a selectable video model.
  - The model selector prefers video-capable models declared by the current provider and keeps seedance-2.0-720p as the default fallback option.
  - Submitting creates a provider task through the current provider and immediately shows the local job id, provider task id, normalized status, and a redacted raw-response summary.
  - Asynchronous provider tasks expose an explicit status-query action.
  - Completed jobs show the provider video URL in a player or as an openable result.
  - Unsupported providers and provider failures show a specific, actionable reason.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
requiredTests:
  - pnpm run typecheck
  - tests/unit/ai-apps-api.test.ts
  - tests/e2e/skills-gateway-readiness.spec.ts
acceptance:
  - Renderer uses typed hostApi aiApps methods and does not call provider or Gateway endpoints directly.
  - Main resolves the current provider, its configured video models, credentials, and compatible video endpoints.
  - Video creation returns localJobId, providerTaskId, status, and a redacted raw-response summary.
  - Status refresh normalizes provider states and surfaces result URLs or provider error details.
  - E2E covers the visible product fields, platform, ratio, model selector, task metadata, and status-query action.
docs:
  required: true
---

## Background

The existing product short-video runner is tied to a single Feiniu model and
waits inside Main until a downloadable file exists. The workbench fields are
mostly uncontrolled and do not expose provider task identity or asynchronous
state. This task makes the provider task lifecycle explicit while preserving
the host-api boundary.
