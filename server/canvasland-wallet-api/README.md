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
BLUEOCEAN_APPID=
BLUEOCEAN_MERCHANT_KEY=
POINTS_PER_CNY=100
DATA_DIR=/opt/canvasland-wallet-api/data
```

Callback URLs:

```text
https://apitoken.unihuax.com/payments/epay/notify
https://apitoken.unihuax.com/payments/blueocean/notify
```
