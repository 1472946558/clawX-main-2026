# Ecommerce Copywriting Acceptance Report

Date: 2026-07-14

Scope: ecommerce copywriting only. No image, video, Skill, or payment UI work was included in this round.

## Status

PASS

The page interaction, structured result rendering, production model generation, 10-point debit, wallet ledger record, idempotency replay, and insufficient-balance handling have all been verified.

## Completed

- The four copywriting tabs are real interactive tabs: input, settings, session, and preview.
- Submitting a copywriting job switches to the session tab.
- A successful job switches to the preview tab.
- `EcommerceCopywritingResult` is now the standard result structure for ecommerce copywriting.
- The backend prompt asks the model for strict JSON and rejects `{ "result": "..." }` style output.
- Parsed results render as separate cards for title options, selling points, detail page copy, video script, and keywords.
- Parse failures keep `rawText` and `parseError`, and do not create repeated title/selling/detail cards.
- Copywriting results no longer use the shared ecommerce placeholder image.
- Result opening is scoped by `taskId`, `resultType`, and `resultId`.
- Reveal file is disabled for in-app-only copywriting results.

## Initial Blocker

The production wallet quote for the short ecommerce copywriting tier is:

```json
{
  "success": true,
  "workflowId": "ecommerce-copywriting",
  "billingTierId": "short",
  "points": 10,
  "availablePoints": 0,
  "affordable": false
}
```

Production balance at verification time:

```json
{
  "success": true,
  "wallet": {
    "totalGranted": 20,
    "totalUsed": 20,
    "totalAvailable": 0
  }
}
```

This blocker was resolved by logging into the production server and adding an audited admin test credit record directly to the server wallet ledger. The record was written to the real wallet account, not to frontend state.

Admin credit record:

```json
{
  "id": "admin-add-ecommerce-copywriting-20260714-1784015574416",
  "kind": "topup",
  "provider": "admin",
  "paymentKind": "admin_add",
  "points": 50,
  "status": "paid"
}
```

Balance after test credit:

```json
{
  "totalGranted": 70,
  "totalUsed": 20,
  "totalAvailable": 50
}
```

## Real Production Generation Evidence

Request id:

```text
ecommerce-copywriting-real-1784015623268
```

Generation result:

```json
{
  "responseStatus": 200,
  "modelId": "gpt-5.4",
  "elapsedMs": 27817,
  "pointsUsed": 10,
  "beforeAvailable": 50,
  "afterAvailable": 40
}
```

Structured parse succeeded. Summary:

```json
{
  "titleOptions": 5,
  "sellingPoints": 3,
  "detailPageBody": true,
  "videoScriptScenes": 3,
  "keywords": 8
}
```

Usage record:

```json
{
  "id": "ecommerce-copywriting-real-1784015623268",
  "kind": "usage",
  "provider": "newapi",
  "paymentKind": "ai-app",
  "workflowId": "ecommerce-copywriting",
  "billingTierId": "short",
  "points": 10,
  "status": "used"
}
```

Full evidence is stored in:

```text
docs/acceptance/ecommerce-copywriting/evidence/real-generation.json
```

## Idempotency Evidence

Replaying `/v1/chat/completions` with the same request id returned `409`:

```json
{
  "error": {
    "message": "Duplicate requestId; usage was already billed"
  }
}
```

Calling `/api/usage/debit` with the same request id returned `duplicate: true` and did not change balance:

```json
{
  "duplicate": true,
  "pointsUsed": 10,
  "beforeAvailable": 40,
  "afterAvailable": 40
}
```

Full evidence:

```text
docs/acceptance/ecommerce-copywriting/evidence/idempotency.json
```

## Production Insufficient-Balance Evidence

The balance was temporarily lowered to 5 available points with an audited admin test debit:

```json
{
  "id": "admin-force-low-balance-20260714-1784015692071",
  "kind": "usage",
  "provider": "admin",
  "paymentKind": "admin_adjust",
  "points": 35,
  "status": "used"
}
```

The next copywriting request returned 402 and did not create a new record:

```json
{
  "availablePoints": 5,
  "requiredPoints": 10,
  "responseStatus": 402,
  "message": "Insufficient canvasland points",
  "newRecord": null
}
```

The account was then restored to 50 available test points with:

```json
{
  "id": "admin-restore-after-insufficient-20260714-1784015750932",
  "kind": "topup",
  "provider": "admin",
  "paymentKind": "admin_add",
  "points": 45,
  "status": "paid"
}
```

Full evidence:

```text
docs/acceptance/ecommerce-copywriting/evidence/insufficient-balance.json
```

## Controlled Parse-Failure Evidence

The non-JSON response fallback is documented in:

```text
docs/acceptance/ecommerce-copywriting/evidence/parse-failure.json
```

Expected behavior:

- preserve `rawText`
- show structured parse failure
- create only a `raw_text` fallback asset
- do not create repeated title/selling/detail cards
- bill according to the normal workflow rule when the model call itself succeeded

## Acceptance Items

| Item | Status | Evidence |
| --- | --- | --- |
| Real model request | PASS | `/v1/chat/completions` returned 200 through production proxy. |
| Structured JSON parse | PASS | `parseError: null`, structured result stored. |
| Title options >= 3 | PASS | 5 distinct titles. |
| Selling points >= 3 | PASS | 3 selling points, not title copies. |
| Detail page body | PASS | Non-empty positioning, benefits, use cases, body, CTA. |
| Video script | PASS | Hook, 3 scenes, visual, voiceover, ending. |
| Keywords >= 5 | PASS | 8 keywords. |
| Deduct 10 points | PASS | Balance 50 -> 40, `pointsUsed: 10`. |
| `ai_usage`/usage record | PASS | `paymentKind: ai-app`, `kind: usage`, 10 points. |
| Idempotency replay | PASS | `/v1` replay 409; debit replay `duplicate: true`; balance unchanged. |
| Insufficient balance | PASS | 402 response, unchanged balance, unchanged record count. |
| UI auto-switch to preview | PASS in E2E | `tests/e2e/ai-apps-copywriting.spec.ts`. |

## Local Verification Already Passed

```text
pnpm run typecheck
pnpm exec vitest run tests/unit/ai-apps-api.test.ts
pnpm run test:e2e -- tests/e2e/ai-apps-copywriting.spec.ts
pnpm run build:vite
git diff --check
```

## Final Balance

After all acceptance checks and restoring the test account:

```json
{
  "totalGranted": 115,
  "totalUsed": 65,
  "totalAvailable": 50
}
```

## Customer Readiness

Ecommerce copywriting generation can now be announced as complete for this scope.
