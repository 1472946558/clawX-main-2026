# Wallet Model Routing Acceptance Report

Date: 2026-07-15

## Summary

This round fixed model routing, points balance reconciliation, 402 error classification, Creem currency exposure, and normal-user Provider settings visibility.

## What Changed

- Removed HKD from the Creem currency selector because the current Creem Product is USD.
- Standardized server 402 responses as `POINTS_INSUFFICIENT` with `requiredPoints` and `availablePoints`.
- Added wallet reconciliation API without silent mutation.
- Added safe request trace logs with `requestId`, `userId`, `walletAccountId`, `modelPlanId`, and workflow fields.
- Routed ecommerce copywriting AI Apps through Canvasland API instead of local Provider API keys.
- Prevented double debit for ecommerce copywriting when the Canvasland API already billed the request.
- Hid Provider/Base URL/API Key settings from ordinary Settings users; advanced provider settings remain in developer mode.
- Improved Main Chat error parsing so the UI can show “积分不足，本次需要 X 积分，当前可用 Y 积分。” and a recharge action.

## 402 Source

Confirmed source: Canvasland API wallet preflight in `server/canvasland-wallet-api/server.js`.

Evidence:

- requestId: `acceptance-insufficient-20260715202800`
- response: HTTP 402
- body: `POINTS_INSUFFICIENT`, required `30`, available `14`
- no New API call was needed for this preflight failure.

## Old vs New Chain

Old risk:

```text
AI Apps ecommerce copywriting -> local Provider endpoint/API Key -> separate wallet debit
```

New:

```text
AI Apps ecommerce copywriting -> https://apitoken.unihuax.com/v1/chat/completions -> server modelPlanId/workflow billing -> server upstream key -> debit
```

Main Chat direct route:

```text
Renderer -> Electron Main -> https://apitoken.unihuax.com/v1/chat/completions -> server upstream
```

Agent/media route:

```text
Renderer -> Electron Main -> Gateway -> canvasland-newapi provider -> https://apitoken.unihuax.com/v1
```

## Acceptance Results

- Scenario A, insufficient points: verified locally with `requiredPoints=1, availablePoints=0`; verified on production with workflow preflight `requiredPoints=30, availablePoints=14`.
- Scenario B, recharge balance: production latest WeChat paid credit `+10` is counted once.
- Scenario C, model call success: requestId `acceptance-ok-20260715202647` returned `OK` and debited `1` point.
- Scenario D, duplicate replay: same requestId returned HTTP 409 and did not double debit.
- Scenario E, settings save visibility: Provider settings are hidden from ordinary Settings users; existing Provider save/test controls remain available in developer mode.
- Scenario F, identity consistency: wallet balance, records, reconcile, model call, and debit logs all use `userId=local-default` and `walletAccountId=canvasland-wallet-default`.

## Current Production Balance

After the acceptance model call:

```json
{
  "totalGranted": 165,
  "totalUsed": 151,
  "totalAvailable": 14
}
```

Reconciliation:

```json
{
  "storedBalance": 14,
  "calculatedBalance": 14,
  "difference": 0
}
```

## Validation

- `node --check server/canvasland-wallet-api/server.js`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run build:vite`: passed.
- `git diff --check`: passed.
- Production PM2 restart: passed.
- `pnpm run build`: reached successful Vite, Electron main/preload, OpenClaw bundle, plugin bundle, preinstalled skill bundle, and Electron packaging setup, then stalled in the final macOS signing/packaging stage. It was manually interrupted after several minutes with no new output.
- `pnpm harness validate --spec harness/specs/tasks/wallet-model-routing-consistency.md`: blocked by pre-existing untracked/history acceptance artifacts and docs outside the spec touchedAreas; no cleanup was performed.

Full requested final checks are recorded in the task final output.

## Delivery Status

Can deliver for the scoped round: model calling, points, error classification, settings Provider visibility, Creem HKD removal, and reconciliation.

Not included by request: image generation, video generation, Skill, AutoGLM.
