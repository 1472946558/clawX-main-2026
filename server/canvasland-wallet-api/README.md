# canvasland wallet API

This service receives payment callbacks, verifies signatures, prevents duplicate crediting, and exposes wallet balance/records for the desktop client.

## Runtime

```bash
npm install
PORT=3000 npm start
```

Required environment variables are stored outside source control:

```bash
EPAY_ACCOUNT=
EPAY_API_KEY=
EPAY_GATEWAY_URL=https://mzf.mapay.cc/xpay/epay
EPAY_NOTIFY_URL=https://apitoken.unihuax.com/payments/epay/notify
EPAY_RETURN_URL=https://feiniu-ai.cn
EPAY_MERCHANT_NAME=canvasland
BLUEOCEAN_APPID=
BLUEOCEAN_MERCHANT_KEY=
BLUEOCEAN_API_BASE_URL=https://api.hk.blueoceanpay.com
BLUEOCEAN_NOTIFY_URL=https://apitoken.unihuax.com/payments/blueocean/notify
CREEM_API_KEY=
CREEM_WEBHOOK_SECRET=
CREEM_PRODUCT_ID=
CREEM_PRODUCT_ID_USD=
CREEM_PRODUCT_ID_HKD=
CREEM_SUCCESS_URL=https://feiniu-ai.cn
CANVASLAND_NEWAPI_BASE_URL=https://feiniu.space/v1
CANVASLAND_MODEL_GPT54_API_KEY=
CANVASLAND_MODEL_GPT55_API_KEY=
CANVASLAND_MODEL_QWEN36PLUS_API_KEY=
CANVASLAND_MODEL_QWEN37MAX_API_KEY=
POINTS_PER_CNY=100
DATA_DIR=/opt/canvasland-wallet-api/data
```

The four `CANVASLAND_MODEL_*_API_KEY` values are the hidden upstream New API
keys for GPT 5.4, GPT 5.5, Qwen 3.6 Plus, and Qwen 3.7 Max. Keep them only in the
server process environment; never commit them to the desktop client, docs, logs,
or Electron store.

Callback URLs:

```text
https://apitoken.unihuax.com/payments/epay/notify
https://apitoken.unihuax.com/payments/blueocean/notify
https://apitoken.unihuax.com/payments/creem/notify
```

Checkout URLs used by the desktop client:

```text
https://apitoken.unihuax.com/payments/epay/checkout
https://apitoken.unihuax.com/payments/blueocean/checkout
https://apitoken.unihuax.com/payments/creem/checkout
```

Model proxy endpoints used by canvasland/OpenClaw:

```text
https://apitoken.unihuax.com/api/model-plans
https://apitoken.unihuax.com/v1/models
https://apitoken.unihuax.com/v1/chat/completions
```

`/v1/chat/completions` is OpenAI-compatible for non-streaming requests. It
selects the upstream key by model, ignores any client-supplied `pointsUsed`, and
deducts points from the server ledger using the upstream `usage` payload.
Send `x-request-id` or `idempotency-key` to prevent duplicate billing retries.

AI Apps billing endpoints:

```text
POST https://apitoken.unihuax.com/api/usage/quote
POST https://apitoken.unihuax.com/api/usage/debit
```

Both endpoints accept only `workflowId`, `billingTierId`, and an idempotent
`requestId` for debit. Prices are fixed on the server: copywriting 10/15/20/30,
image generation 30/60, and video generation 300/500/600 points. Any
client-supplied point value is ignored. Recharge bonuses are also server-owned;
the CNY 50 package grants 6,000 points (5,000 base plus 1,000 bonus).
