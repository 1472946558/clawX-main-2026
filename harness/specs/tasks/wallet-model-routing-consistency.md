---
id: wallet-model-routing-consistency
title: Unify canvasland wallet and model routing
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Route ordinary user chat, agent chat, and AI Apps through the canvasland wallet API with server-owned model plans, classify insufficient-points and upstream failures, reconcile wallet balances, and hide provider credentials from ordinary users.
touchedAreas:
  - harness/specs/tasks/wallet-model-routing-consistency.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - server/canvasland-wallet-api/server.js
  - shared/host-api/contract.ts
  - electron/services/**
  - electron/utils/**
  - src/lib/host-api.ts
  - src/stores/chat/**
  - src/stores/chat.ts
  - src/pages/TokenTopUp/index.tsx
  - src/pages/Settings/**
  - src/components/settings/**
  - shared/i18n/locales/*/*.json
  - tests/unit/**
  - tests/e2e/**
  - docs/acceptance/wallet-model-routing/**
expectedUserBehavior:
  - Ordinary users do not see or edit provider Base URL, API Key, Provider, protocol, User-Agent, or New API fields.
  - Ordinary chat, agent chat, and AI Apps submit model plan or workflow identifiers and rely on the server to choose upstream credentials.
  - A 402 insufficient-points response displays the required and available point counts with a recharge action.
  - Upstream model failures are classified without exposing credentials or request headers.
  - Wallet balance, sidebar balance, wallet records, chat billing, agent billing, AI Apps billing, and payment records use one wallet account identity.
  - Creem no longer offers an HKD selector until a real HKD Creem product is configured.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - backend-communication-boundary
  - renderer-main-boundary
  - api-client-transport-policy
  - host-api-fallback-policy
  - gateway-readiness-policy
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm harness validate --spec harness/specs/tasks/wallet-model-routing-consistency.md
  - pnpm run typecheck
  - pnpm run build:vite
  - git diff --check
  - tests/unit/canvasland-wallet-server.test.ts
  - tests/unit/chat-target-routing.test.ts
  - tests/unit/host-services.test.ts
  - tests/e2e/main-navigation.spec.ts
acceptance:
  - Request traces identify the real Renderer -> Electron Main -> Gateway/direct -> Canvasland API -> New API paths with request ids and redacted user/account identifiers.
  - `/v1/chat/completions` returns standard `POINTS_INSUFFICIENT` JSON for insufficient points and avoids an upstream request in that case.
  - `/api/admin/wallet/reconcile?userId=...` reports stored and calculated balances, credit/debit details, and differences without silently mutating the ledger.
  - Duplicate request ids remain idempotent and do not double debit.
  - Settings provider credentials are hidden outside developer/admin mode and explicit save/test/default controls are available for advanced settings.
  - Acceptance reports document 402 source, old/new call chains, wallet reconciliation, identity consistency, settings save behavior, changed files, evidence, and delivery status.
docs:
  required: true
---

## Scope

- Ordinary chat and agent routing, model-plan billing errors, wallet reconciliation, identity logging, user-facing settings visibility, and Creem currency selector cleanup.

## Out of scope

- New image, video, Skill, AutoGLM, or unrelated agent-runtime features.
