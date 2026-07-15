# Wallet And Model Routing Request Trace

Date: 2026-07-15

## Call Graph

```text
Renderer Chat
-> src/stores/chat.ts
-> src/lib/host-api.ts chat.sendDirect
-> Electron Main electron/services/chat-api.ts
-> https://apitoken.unihuax.com/v1/chat/completions
-> server/canvasland-wallet-api/server.js
-> CANVASLAND_NEWAPI_BASE_URL /chat/completions
```

```text
Renderer Chat with attachments / non-direct runs
-> src/stores/chat.ts
-> src/lib/host-api.ts chat.sendWithMedia
-> Electron Main electron/services/chat-api.ts
-> Gateway chat.send
-> OpenClaw provider account canvasland-newapi
-> https://apitoken.unihuax.com/v1
-> server/canvasland-wallet-api/server.js
-> CANVASLAND_NEWAPI_BASE_URL
```

```text
Renderer AI Apps ecommerce-copywriting
-> electron/services/ai-apps-api.ts
-> https://apitoken.unihuax.com/v1/chat/completions
-> server/canvasland-wallet-api/server.js metadata.workflowId/billingTierId
-> wallet preflight + upstream model + debit in the same server path
```

```text
Renderer Wallet / Sidebar
-> electron/services/canvasland-api.ts
-> https://apitoken.unihuax.com/api/wallet/balance
-> server/canvasland-wallet-api/server.js
```

## Endpoints Found

- Main Chat direct text: `https://apitoken.unihuax.com/v1/chat/completions`.
- Agent / media Chat: Gateway `chat.send`, using `canvasland-newapi/<runtimeModel>` and provider base URL `https://apitoken.unihuax.com/v1`.
- AI Apps ecommerce copywriting: now `https://apitoken.unihuax.com/v1/chat/completions` with `metadata.workflowId` and `metadata.billingTierId`.
- AI Apps image/video provider paths remain out of this round and still reference the legacy New API/image provider constants.
- Wallet balance: `https://apitoken.unihuax.com/api/wallet/balance`.
- Wallet records: `https://apitoken.unihuax.com/api/wallet/records`.
- Wallet reconciliation: `https://apitoken.unihuax.com/api/admin/wallet/reconcile?userId=...`.

## Legacy Base URL Findings

- `feiniu-ai.xyz`: no active code hit found in this repository audit.
- `https://feiniu.space/v1`: still present as the server-side upstream `CANVASLAND_NEWAPI_BASE_URL` default and AI Apps image/video code path. It is not exposed to normal users as a chat Provider setting after this change.
- `https://apitoken.unihuax.com`: used by wallet, model plan API, Main Chat direct route, Gateway provider config, and ecommerce copywriting.

## Real Request Evidence

Successful model call:

- requestId: `acceptance-ok-20260715202647`
- endpoint: `POST https://apitoken.unihuax.com/v1/chat/completions`
- modelPlanId: `gpt-5.4`
- response: HTTP 200, assistant content `OK`
- usage: `canvasland_usage.pointsUsed=1`

Duplicate replay:

- requestId: `acceptance-ok-20260715202647`
- response: HTTP 409
- body: `success=false`, `duplicate=true`, message `Duplicate requestId; usage was already billed`
- wallet balance remained consistent after replay.

Insufficient points preflight:

- requestId: `acceptance-insufficient-20260715202800`
- endpoint: `POST https://apitoken.unihuax.com/v1/chat/completions`
- metadata: `workflowId=ecommerce-copywriting`, `billingTierId=deep`
- response: HTTP 402
- body:

```json
{
  "success": false,
  "errorCode": "POINTS_INSUFFICIENT",
  "message": "积分不足",
  "requiredPoints": 30,
  "availablePoints": 14
}
```

PM2 trace lines were verified with only non-sensitive fields:

```text
[model-call] {"requestId":"acceptance-ok-20260715202647","userId":"local-default","walletAccountId":"canvasland-wallet-default","modelPlanId":"gpt-5.4"}
[model-call] {"requestId":"acceptance-insufficient-20260715202800","userId":"local-default","walletAccountId":"canvasland-wallet-default","modelPlanId":"gpt-5.4","workflowId":"ecommerce-copywriting","billingTierId":"deep"}
```

No Authorization header, API key, webhook secret, or password was logged.

