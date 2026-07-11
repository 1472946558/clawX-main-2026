---
id: provider-model-list-selection
title: Fetch and select Provider models through Main
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Replace manual model-id entry in the add-provider flow with a Main-owned OpenAI-compatible model lookup and require a fetched model selection before saving.
touchedAreas:
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - harness/specs/tasks/provider-model-list-selection.md
  - harness/specs/scenarios/gateway-backend-communication.md
  - shared/host-api/contract.ts
  - src/lib/host-api.ts
  - src/stores/providers.ts
  - electron/services/providers-api.ts
  - electron/services/providers/provider-validation.ts
  - src/components/settings/ProvidersSettings.tsx
  - shared/i18n/locales/*/settings.json
  - tests/e2e/provider-lifecycle.spec.ts
  - tests/e2e/developer-mode.spec.ts
  - tests/unit/provider-validation.test.ts
  - tests/unit/host-services.test.ts
expectedUserBehavior:
  - A user can enter a New API or Feiniu-compatible Base URL and API key, fetch available models, select one, and save the provider.
  - The selected model persists in ProviderAccount.model and remains available after relaunch.
  - Lookup failures distinguish an invalid Base URL, invalid API key, network error, empty model list, and unsupported response format.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
  - comms-regression
  - docs-sync
requiredTests:
  - tests/e2e/provider-lifecycle.spec.ts
  - tests/unit/i18n-locale-parity.test.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - The renderer calls providers.fetchModels through src/lib/host-api.ts and never fetches the provider endpoint directly.
  - Main requests {baseUrl}/models first and {baseUrl}/v1/models second with Authorization: Bearer {apiKey}.
  - Both { data: [{ id }] } and [{ id }] response shapes are accepted and deduplicated.
  - API keys are not included in request logs or error messages.
  - Saving is disabled until the user selects a model returned by the current Base URL and API key lookup.
  - The selected model is saved in ProviderAccount.model.
docs:
  required: true
---

## Scope

- Add a typed `providers.fetchModels` host-api action.
- Implement the OpenAI-compatible model-list request and error classification in Electron Main.
- Replace the add-provider Model ID text field with a fetch button and model dropdown for API-key providers that expose model selection.
- Cover the fetch/select/save/persistence flow with Electron E2E.

## Out of scope

- AI Apps and image-generation provider settings.
- OAuth provider authentication behavior.
- Non-OpenAI-compatible model discovery protocols.
