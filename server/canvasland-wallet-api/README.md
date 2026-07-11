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
POINTS_PER_CNY=100
DATA_DIR=/opt/canvasland-wallet-api/data
```

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
