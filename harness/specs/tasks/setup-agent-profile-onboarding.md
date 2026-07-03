---
id: setup-agent-profile-onboarding
title: Configure the main Agent profile from first-run setup
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Replace the first setup screen with a main Agent profile form that persists the Agent name and persona through the typed Main-process host API boundary.
touchedAreas:
  - harness/specs/tasks/setup-agent-profile-onboarding.md
  - shared/host-api/contract.ts
  - src/lib/host-api.ts
  - src/pages/Setup/index.tsx
  - electron/services/agents-api.ts
  - electron/utils/agent-config.ts
  - shared/i18n/locales/*/setup.json
  - tests/unit/agent-config.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/host-services.test.ts
  - tests/e2e/app-smoke.spec.ts
expectedUserBehavior:
  - The first screen shown on a fresh profile asks for the main Agent name and persona instead of nickname and birthday.
  - Continuing from the first screen saves the Agent profile before moving to runtime checks.
  - The saved persona is written to the main Agent bootstrap files so subsequent runtime sessions can use it as context.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
requiredTests:
  - tests/unit/agent-config.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/unit/host-services.test.ts
  - tests/e2e/app-smoke.spec.ts
acceptance:
  - Renderer calls `hostApi.agents.updateProfile`; it does not use direct IPC or Gateway HTTP.
  - Main process validates the payload, updates the Agent config name, and writes Agent persona files under the configured Agent workspace.
  - Existing setup skip behavior still works.
docs:
  required: false
---

## Background

canvasland already models Agent identity through OpenClaw workspace bootstrap files such as
`IDENTITY.md`, `SOUL.md`, and `AGENTS.md`. The first-run setup should collect the main Agent
profile up front and persist it through the same typed host-api boundary used by the rest of the
renderer.
