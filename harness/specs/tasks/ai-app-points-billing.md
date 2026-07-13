---
id: ai-app-points-billing
title: Add tiered points billing to AI Apps
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Price copywriting, image, and video generation in canvasland points, keep pricing server-owned, debit successful jobs idempotently, and present high-value recharge packages without exposing currency conversion inside AI generation flows.
touchedAreas:
  - harness/specs/tasks/ai-app-points-billing.md
  - shared/ai-workflows.ts
  - shared/host-api/contract.ts
  - electron/services/ai-apps-api.ts
  - server/canvasland-wallet-api/server.js
  - src/pages/AiApps/index.tsx
  - src/pages/TokenTopUp/index.tsx
  - shared/i18n/locales/*/skills.json
  - shared/i18n/locales/*/common.json
  - tests/unit/ai-apps-api.test.ts
  - tests/unit/canvasland-wallet-server.test.ts
  - tests/e2e/main-navigation.spec.ts
expectedUserBehavior:
  - Copywriting offers 10, 15, 20, and 30 point depth tiers.
  - Image generation offers a 30 point standard tier and a 60 point Pro tier.
  - Video generation offers 300, 500, and 600 point duration and quality tiers.
  - The selected tier shows points and included benefits such as Pro quality, priority generation, and watermark-free delivery without displaying a currency equivalent.
  - A successful generation debits the server wallet exactly once using the job id as the idempotency key.
  - Failed generation does not debit points, and insufficient balance is reported before dispatch when possible.
  - The wallet emphasizes recharge packages and bonus points, including a 5,000 plus 1,000 point package.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
  - comms-regression
requiredTests:
  - pnpm run typecheck
  - tests/unit/ai-apps-api.test.ts
  - tests/unit/i18n-locale-parity.test.ts
  - tests/e2e/main-navigation.spec.ts
acceptance:
  - Renderer only submits a workflow tier id through typed hostApi methods.
  - The wallet server maps workflow and tier ids to an authoritative points price and ignores client-supplied point values.
  - Duplicate request ids cannot debit the wallet twice.
  - AI job records expose the charged points and selected tier after successful billing.
  - All visible text is localized in English, Chinese, Japanese, and Russian.
  - Docs describe the points tiers and server-owned billing behavior.
docs:
  required: true
---

The AI Apps catalog already has real provider-backed text, image, and video execution. This task adds the commercial points layer around those workflows while preserving the renderer/Main boundary and the hidden upstream-provider architecture.
