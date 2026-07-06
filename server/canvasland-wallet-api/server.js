import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const walletFile = path.join(dataDir, 'wallet.json');
const pointsPerCny = Number(process.env.POINTS_PER_CNY || 100);
const epayApiKey = process.env.EPAY_API_KEY || '';
const epayAccount = process.env.EPAY_ACCOUNT || '';
const blueOceanKey = process.env.BLUEOCEAN_MERCHANT_KEY || '';
const blueOceanAppid = process.env.BLUEOCEAN_APPID || '';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

function now() {
  return new Date().toISOString();
}

function emptyWallet() {
  return {
    totalGranted: 0,
    totalUsed: 0,
    totalAvailable: 0,
    records: [],
    orders: {},
  };
}

async function readWallet() {
  try {
    const raw = await readFile(walletFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...emptyWallet(),
      ...parsed,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
    };
  } catch {
    return emptyWallet();
  }
}

async function writeWallet(wallet) {
  await mkdir(dataDir, { recursive: true });
  const paidRecords = wallet.records.filter((record) => record.status === 'paid');
  const usedRecords = wallet.records.filter((record) => record.kind === 'usage' || record.status === 'used');
  const totalGranted = paidRecords.reduce((sum, record) => sum + safeNumber(record.points), 0);
  const totalUsed = usedRecords.reduce((sum, record) => sum + safeNumber(record.points), 0);
  const next = {
    ...wallet,
    totalGranted,
    totalUsed,
    totalAvailable: Math.max(0, totalGranted - totalUsed),
    records: wallet.records.slice(0, 500),
  };
  await writeFile(walletFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function safeNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function stripSignFields(value) {
  const result = {};
  for (const [key, item] of Object.entries(normalizeObject(value))) {
    if (key === 'sign' || key === 'key' || item === undefined || item === null || item === '') continue;
    if (Array.isArray(item)) {
      if (item.length > 0) result[key] = item;
      continue;
    }
    if (typeof item === 'object') {
      const nested = stripSignFields(item);
      if (Object.keys(nested).length > 0) result[key] = nested;
      continue;
    }
    result[key] = item;
  }
  return result;
}

function toQueryString(value) {
  return Object.keys(value)
    .sort()
    .map((key) => {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return `${key}={${toQueryString(item)}}`;
      }
      return `${key}=${item}`;
    })
    .join('&');
}

function epaySign(payload, apiKey) {
  const signSource = `${toQueryString(stripSignFields(payload))}&key=${apiKey}`;
  return crypto.createHash('sha256').update(signSource, 'utf8').digest('hex').toUpperCase();
}

function blueOceanSign(payload, merchantKey) {
  const signSource = `${toQueryString(stripSignFields(payload))}&key=${merchantKey}`;
  return crypto.createHash('md5').update(signSource, 'utf8').digest('hex').toUpperCase();
}

function timingSafeEqualText(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a).trim().toUpperCase());
  const right = Buffer.from(String(b).trim().toUpperCase());
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isEpayPaid(payload) {
  const status = payload.status ?? payload.orderStatus ?? payload.tradeStatus;
  return Number(status) === 7
    || String(status || '').toUpperCase() === 'SUCCESS'
    || String(payload.transactionStatus || '').toUpperCase() === 'SUCCESS';
}

function isBlueOceanPaid(payload) {
  return ['SUCCESS', 'TRADE_SUCCESS', 'PAY_SUCCESS', 'PAID', 'COMPLETED', 'FINISHED'].includes(
    String(payload.trade_state ?? payload.tradeState ?? payload.status ?? '').toUpperCase(),
  );
}

function pointsFromAmount(amount) {
  return Math.max(0, Math.round(safeNumber(amount) * pointsPerCny));
}

function pointsFromBlueOcean(payload) {
  const attach = typeof payload.attach === 'string' ? payload.attach : '';
  const match = attach.match(/(?:^|[;&,\s])points=(\d+)/i);
  if (match) return Number(match[1]);
  const fee = safeNumber(payload.total_fee ?? payload.totalFee ?? payload.pay_amount ?? payload.payAmount);
  return pointsFromAmount(fee / 100);
}

function pointsFromEpay(payload) {
  const extendFields = normalizeObject(payload.extendFields);
  if (extendFields.points) return Math.max(0, Math.round(safeNumber(extendFields.points)));
  return pointsFromAmount(payload.amount ?? payload.payAmount ?? payload.money ?? payload.totalAmount);
}

async function creditWallet({ provider, paymentKind, outTradeNo, tradeNo, amount, points, raw }) {
  const orderNo = String(outTradeNo || tradeNo || '').trim();
  if (!orderNo) {
    return { credited: false, reason: 'missing-order-number' };
  }
  const wallet = await readWallet();
  const existing = wallet.orders[orderNo];
  if (existing?.credited) {
    return { credited: false, duplicate: true, record: existing.record };
  }
  const record = {
    id: orderNo,
    kind: 'topup',
    outTradeNo: orderNo,
    provider,
    paymentKind,
    amount: Number(safeNumber(amount).toFixed(2)),
    points: Math.max(0, Math.round(points)),
    status: 'paid',
    createdAt: existing?.createdAt || now(),
    paidAt: now(),
    description: `${provider} ${paymentKind} callback`,
  };
  wallet.orders[orderNo] = {
    credited: true,
    provider,
    paymentKind,
    amount: record.amount,
    points: record.points,
    tradeNo,
    record,
    raw,
    updatedAt: now(),
  };
  wallet.records = [
    record,
    ...wallet.records.filter((item) => item.outTradeNo !== orderNo && item.id !== orderNo),
  ];
  const next = await writeWallet(wallet);
  return { credited: true, record, wallet: next };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'canvasland-wallet-api', time: now() });
});

app.get('/api/wallet/balance', async (_req, res) => {
  const wallet = await readWallet();
  const saved = await writeWallet(wallet);
  res.json({
    success: true,
    wallet: {
      totalGranted: saved.totalGranted,
      totalUsed: saved.totalUsed,
      totalAvailable: saved.totalAvailable,
    },
  });
});

app.get('/api/wallet/records', async (_req, res) => {
  const wallet = await readWallet();
  res.json({ success: true, records: wallet.records });
});

app.post('/payments/epay/notify', async (req, res) => {
  const body = normalizeObject(req.body);
  const payload = normalizeObject(body.param || body.data || body);
  const sign = body.sign || payload.sign;
  if (!epayApiKey || !sign || !timingSafeEqualText(sign, epaySign(payload, epayApiKey))) {
    console.warn('[epay notify rejected]', { hasKey: Boolean(epayApiKey), hasSign: Boolean(sign), body });
    res.status(400).send('FAIL');
    return;
  }
  if (epayAccount && payload.epayAccount && String(payload.epayAccount) !== epayAccount) {
    res.status(400).send('FAIL');
    return;
  }
  if (isEpayPaid(payload)) {
    await creditWallet({
      provider: 'epay',
      paymentKind: 'alipay',
      outTradeNo: payload.merchantOrderNo || payload.outTradeNo || payload.orderNo,
      tradeNo: payload.epayOrderNo || payload.tradeNo,
      amount: safeNumber(payload.amount ?? payload.payAmount ?? payload.money ?? payload.totalAmount),
      points: pointsFromEpay(payload),
      raw: payload,
    });
  }
  res.send('SUCCESS');
});

app.post('/payments/blueocean/notify', async (req, res) => {
  const payload = normalizeObject(req.body);
  const sign = payload.sign;
  if (!blueOceanKey || !sign || !timingSafeEqualText(sign, blueOceanSign(payload, blueOceanKey))) {
    console.warn('[blueocean notify rejected]', { hasKey: Boolean(blueOceanKey), hasSign: Boolean(sign), payload });
    res.status(400).send('FAIL');
    return;
  }
  if (blueOceanAppid && payload.appid && String(payload.appid) !== blueOceanAppid) {
    res.status(400).send('FAIL');
    return;
  }
  if (isBlueOceanPaid(payload)) {
    const fee = safeNumber(payload.total_fee ?? payload.totalFee ?? payload.pay_amount ?? payload.payAmount);
    await creditWallet({
      provider: 'blueocean',
      paymentKind: String(payload.provider || '').toLowerCase() === 'alipay' ? 'alipay' : 'wechat',
      outTradeNo: payload.out_trade_no || payload.outTradeNo,
      tradeNo: payload.sn || payload.transaction_id || payload.transactionId,
      amount: Number((fee / 100).toFixed(2)),
      points: pointsFromBlueOcean(payload),
      raw: payload,
    });
  }
  res.send('SUCCESS');
});

app.listen(port, '127.0.0.1', () => {
  console.log(`canvasland wallet api listening on 127.0.0.1:${port}`);
});
