# Wallet Reconciliation

Date: 2026-07-15

## Identity

- userId: `local-default`
- walletAccountId: `canvasland-wallet-default`
- The current production wallet is a single local wallet JSON account. The IDs are now explicit in wallet, model, debit, and reconciliation responses/logs.

## Production Reconciliation Result

Endpoint:

```text
GET https://apitoken.unihuax.com/api/admin/wallet/reconcile?userId=local-default
```

Result after the successful model acceptance call:

```json
{
  "storedBalance": 14,
  "calculatedBalance": 14,
  "difference": 0,
  "lifetimeEarned": 165,
  "lifetimeSpent": 151
}
```

Formula:

```text
expectedBalance = confirmed credits - confirmed debits
14 = 165 - 151
```

## Ledger Rules Verified

- Confirmed credits counted only when `status=paid`.
- Debits counted when `kind=usage` or `status=used`.
- Pending payment orders remain in `orders` and are not counted as balance.
- Duplicate `requestId` returns HTTP 409 and reuses the existing usage record.

## Screenshot Flow Checks

- Creem pending order `+3394`: not counted, because pending orders are excluded from `credits`.
- WeChat paid `+10`: counted exactly once as a `blueocean/wechat` paid top-up.
- AI usage: counted once per unique `requestId`.
- Duplicate request replay: `acceptance-ok-20260715202647` returned 409 and did not add a second debit.

Latest verified credit:

```json
{
  "id": "CL20260715114111DDA4B186",
  "provider": "blueocean",
  "paymentKind": "wechat",
  "status": "paid",
  "points": 10,
  "amount": 0.1
}
```

Latest verified debit:

```json
{
  "id": "acceptance-ok-20260715202647",
  "provider": "newapi",
  "paymentKind": "model",
  "modelPlanId": "gpt-5.4",
  "status": "used",
  "points": 1
}
```

## Admin Reconcile API

Added:

```text
GET /api/admin/wallet/reconcile?userId=...
```

Response includes:

- `storedBalance`
- `calculatedBalance`
- `difference`
- `lifetimeEarned`
- `lifetimeSpent`
- `credits`
- `debits`
- `orders`
- `userId`
- `walletAccountId`

If `difference !== 0`, the server emits a `wallet_reconciliation` warning log with request/user/account/balance fields. It does not silently repair balances.

