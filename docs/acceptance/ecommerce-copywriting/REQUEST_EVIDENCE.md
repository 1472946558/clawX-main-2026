# Ecommerce Copywriting Request Evidence

Date: 2026-07-14

## Public Wallet Endpoints Checked

Base URL:

```text
https://apitoken.unihuax.com
```

Health:

```json
{
  "ok": true,
  "service": "canvasland-wallet-api",
  "time": "2026-07-14T07:48:26.282Z"
}
```

Model plans:

```json
{
  "success": true,
  "models": [
    { "id": "gpt-5.4", "runtimeModel": "gpt-5.4", "configured": true },
    { "id": "gpt-5.5", "runtimeModel": "gpt-5.5", "configured": true },
    { "id": "qwen3.6-plus", "runtimeModel": "qwen3.6-plus", "configured": true },
    { "id": "qwen3.7-max", "runtimeModel": "qwen3.7-max", "configured": true }
  ]
}
```

## Initial Blocked Attempt

The first production quote confirmed that ecommerce copywriting short-tier generation requires 10 points, while the test account had 0 available points.

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

Initial request id:

```text
acceptance-insufficient-1784015333629
```

Response:

```json
{
  "status": 402,
  "body": {
    "error": {
      "message": "Insufficient canvasland points"
    }
  }
}
```

Balance and record count were unchanged:

```json
{
  "beforeRecordCount": 15,
  "afterRecordCount": 15,
  "newRecord": null,
  "totalAvailable": 0
}
```

## Admin Test Credit

SSH access was then provided by the operator. The production server wallet file was backed up before adjustment, and the test points were added to the real server wallet ledger, not to frontend state.

Wallet backup:

```text
/opt/canvasland-wallet-api/data/wallet.json.bak-admin-add-20260714-1784015574415
```

Admin credit record:

```json
{
  "id": "admin-add-ecommerce-copywriting-20260714-1784015574416",
  "kind": "topup",
  "provider": "admin",
  "paymentKind": "admin_add",
  "points": 50,
  "status": "paid",
  "description": "Admin test credit for ecommerce copywriting production acceptance"
}
```

Balance after credit:

```json
{
  "totalGranted": 70,
  "totalUsed": 20,
  "totalAvailable": 50
}
```

## Real Production Generation

Request id / task id:

```text
ecommerce-copywriting-real-1784015623268
```

Model:

```text
gpt-5.4
```

Input:

```text
产品名称：裤子
核心卖点：透气、舒适、适合夏季通勤
目标平台：天猫
品牌语气：专业、简洁
目标人群：年轻上班族
使用场景：通勤、办公室、日常休闲
```

Generation summary:

```json
{
  "responseStatus": 200,
  "elapsedMs": 27817,
  "quotePoints": 10,
  "pointsUsed": 10,
  "beforeAvailable": 50,
  "afterAvailable": 40,
  "parseError": null
}
```

Structured output summary:

```json
{
  "titleOptions": 5,
  "sellingPoints": 3,
  "detailPageBody": true,
  "videoScriptScenes": 3,
  "keywords": 8
}
```

Usage ledger record:

```json
{
  "id": "ecommerce-copywriting-real-1784015623268",
  "kind": "usage",
  "provider": "newapi",
  "paymentKind": "ai-app",
  "workflowId": "ecommerce-copywriting",
  "billingTierId": "short",
  "points": 10,
  "status": "used",
  "description": "ecommerce-copywriting short"
}
```

Full raw evidence:

```text
docs/acceptance/ecommerce-copywriting/evidence/real-generation.json
```

## Generated Content Summary

The real model returned five distinct title options, three selling points, a detail page module with positioning, audience, core benefits, use cases, body, and CTA, a video script with hook, three scenes, visual descriptions, voiceovers, and ending, plus eight keywords.

Representative generated titles:

```text
夏季通勤透气舒适裤子年轻上班族日常百搭
透气舒适通勤裤子适合办公室与日常休闲
年轻上班族夏季通勤裤子轻松应对办公室日常
```

Representative keywords:

```text
裤子, 夏季裤子, 通勤裤子, 透气裤子, 舒适裤子, 办公室穿搭, 年轻上班族裤子, 日常休闲裤
```

## Idempotency Evidence

Replaying `/v1/chat/completions` with the same request id returned `409` and reused the existing billed usage record:

```json
{
  "replayStatus": 409,
  "message": "Duplicate requestId; usage was already billed"
}
```

Calling `/api/usage/debit` with the same request id returned `duplicate: true` and did not change balance:

```json
{
  "duplicateDebitStatus": 200,
  "duplicate": true,
  "pointsUsed": 10,
  "beforeAvailable": 40,
  "afterAvailable": 40
}
```

Full raw evidence:

```text
docs/acceptance/ecommerce-copywriting/evidence/idempotency.json
```

## Insufficient-Balance Evidence

The balance was temporarily lowered to 5 available points with an audited admin test debit.

Wallet backup:

```text
/opt/canvasland-wallet-api/data/wallet.json.bak-admin-force-low-20260714-1784015692070
```

Admin test debit:

```json
{
  "id": "admin-force-low-balance-20260714-1784015692071",
  "kind": "usage",
  "provider": "admin",
  "paymentKind": "admin_adjust",
  "points": 35,
  "status": "used",
  "description": "Admin test debit to force ecommerce copywriting insufficient-balance acceptance"
}
```

Request id:

```text
ecommerce-copywriting-insufficient-1784015704274
```

Result:

```json
{
  "availablePoints": 5,
  "requiredPoints": 10,
  "responseStatus": 402,
  "message": "Insufficient canvasland points",
  "beforeRecordCount": 18,
  "afterRecordCount": 18,
  "newRecord": null
}
```

Full raw evidence:

```text
docs/acceptance/ecommerce-copywriting/evidence/insufficient-balance.json
```

## Balance Restored After Negative Test

The test account was restored after the insufficient-balance scenario.

Wallet backup:

```text
/opt/canvasland-wallet-api/data/wallet.json.bak-admin-restore-20260714-1784015750931
```

Restore record:

```json
{
  "id": "admin-restore-after-insufficient-20260714-1784015750932",
  "kind": "topup",
  "provider": "admin",
  "paymentKind": "admin_add",
  "points": 45,
  "status": "paid",
  "description": "Admin restore test balance after ecommerce copywriting insufficient-balance acceptance"
}
```

Final balance:

```json
{
  "totalGranted": 115,
  "totalUsed": 65,
  "totalAvailable": 50
}
```

## Controlled Parse-Failure Evidence

The non-JSON fallback scenario is documented as a controlled exception test. It verifies that raw text is preserved, "structured parse failed" is shown, and repeated title/selling/detail cards are not created.

```text
docs/acceptance/ecommerce-copywriting/evidence/parse-failure.json
```

## Screenshot Evidence

Page-level E2E screenshot after the interaction/result-structure fix:

```text
output/playwright/acceptance/phase-2-ecommerce-copywriting.png
```

Production API evidence is stored as JSON files under:

```text
docs/acceptance/ecommerce-copywriting/evidence/
```

## Final Result

The real production chain is PASS:

- real model call returned structured JSON
- 10 points were deducted
- a real usage ledger record was created
- idempotency prevented duplicate billing
- insufficient balance blocked generation before upstream model use
- parse failure fallback does not create duplicated cards
