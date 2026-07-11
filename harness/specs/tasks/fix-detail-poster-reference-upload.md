---
id: fix-detail-poster-reference-upload
title: Fix detail poster reference image upload and generation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Connect the AI Apps reference-image picker, staged files, model capability checks, and generated-image preview end to end.
touchedAreas:
  - src/pages/AiApps/index.tsx
  - src/lib/host-api.ts
  - shared/host-api/contract.ts
  - electron/services/files-api.ts
  - electron/services/ai-apps-api.ts
  - shared/i18n/locales/**/skills.json
expectedUserBehavior:
  - The detail-poster upload button opens the native image picker and previews a staged PNG, JPEG, or WebP file with its name and size.
  - Unsupported files are rejected and a staged reference can be removed.
  - Generation works without a reference, includes staged reference metadata for supported models, and reports unsupported-model or Provider errors visibly.
  - A completed image generation renders the generated local image in the result panel.
requiredProfiles:
  - fast
  - comms
requiredTests:
  - tests/unit/ai-apps-api.test.ts
  - tests/e2e/skills-gateway-readiness.spec.ts
acceptance:
  - Renderer uses hostApi.dialog.open and hostApi.files.stagePaths without direct IPC.
  - Reference inputs are validated in Main before Provider dispatch.
  - TypeScript checks, locale parity, targeted unit tests, and Electron E2E pass.
  - Comms replay and compare pass.
docs:
  required: true
---

Stage 3 acceptance specification for the detail image / poster generation module.
