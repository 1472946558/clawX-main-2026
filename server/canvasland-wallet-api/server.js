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
const epayGatewayUrl = (process.env.EPAY_GATEWAY_URL || 'https://mzf.mapay.cc/xpay/epay').replace(/\/+$/, '');
const epayNotifyUrl = process.env.EPAY_NOTIFY_URL || 'https://apitoken.unihuax.com/payments/epay/notify';
const epayReturnUrl = process.env.EPAY_RETURN_URL || 'https://feiniu-ai.cn';
const epayMerchantName = process.env.EPAY_MERCHANT_NAME || 'canvasland';
const blueOceanKey = process.env.BLUEOCEAN_MERCHANT_KEY || '';
const blueOceanAppid = process.env.BLUEOCEAN_APPID || '';
const blueOceanApiBaseUrl = (process.env.BLUEOCEAN_API_BASE_URL || 'https://api.hk.blueoceanpay.com').replace(/\/+$/, '');
const blueOceanNotifyUrl = process.env.BLUEOCEAN_NOTIFY_URL || 'https://apitoken.unihuax.com/payments/blueocean/notify';
const creemApiKey = process.env.CREEM_API_KEY || '';
const creemWebhookSecret = process.env.CREEM_WEBHOOK_SECRET || '';
const creemDefaultProductId = process.env.CREEM_PRODUCT_ID || '';
const creemProductIds = {
  USD: process.env.CREEM_PRODUCT_ID_USD || creemDefaultProductId,
  HKD: process.env.CREEM_PRODUCT_ID_HKD || creemDefaultProductId,
};
const creemSuccessUrl = process.env.CREEM_SUCCESS_URL || 'https://feiniu-ai.cn';
const creemApiBaseUrl = process.env.CREEM_API_BASE_URL
  || (creemApiKey.startsWith('creem_test_') ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');
const defaultCnyRates = {
  USD: Number(process.env.CREEM_USD_CNY || 6.8),
  HKD: Number(process.env.CREEM_HKD_CNY || 0.87),
};
const rateCacheTtlMs = 30 * 60 * 1000;
let rateCache = null;

app.use(cors());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
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

function epayCompatibleSign(payload, apiKey) {
  const stripped = stripSignFields(payload);
  delete stripped.sign_type;
  delete stripped.signType;
  const signSource = `${toQueryString(stripped)}${apiKey}`;
  return crypto.createHash('md5').update(signSource, 'utf8').digest('hex');
}

function generateOutTradeNo() {
  return `CL${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
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
  const tradeStatus = String(payload.trade_status ?? payload.tradeStatus ?? '').toUpperCase();
  return Number(status) === 1
    || Number(status) === 7
    || tradeStatus === 'TRADE_SUCCESS'
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

function normalizePaymentAmount(value) {
  const amount = safeNumber(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }
  return Number(amount.toFixed(2));
}

async function savePendingOrder({ provider, paymentKind, outTradeNo, tradeNo, amount, points, raw }) {
  const orderNo = String(outTradeNo || tradeNo || '').trim();
  if (!orderNo) return;
  const wallet = await readWallet();
  wallet.orders[orderNo] = {
    ...(wallet.orders[orderNo] || {}),
    credited: Boolean(wallet.orders[orderNo]?.credited),
    provider,
    paymentKind,
    amount,
    points,
    tradeNo,
    raw,
    createdAt: wallet.orders[orderNo]?.createdAt || now(),
    updatedAt: now(),
  };
  await writeWallet(wallet);
}

function normalizeCurrency(value) {
  const currency = String(value || '').toUpperCase();
  return currency === 'HKD' ? 'HKD' : 'USD';
}

async function getCnyRates() {
  if (rateCache && Date.now() - rateCache.fetchedAt < rateCacheTtlMs) {
    return rateCache.rates;
  }
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/CNY', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`rate-http-${response.status}`);
    const data = await response.json();
    const rates = normalizeObject(data.rates);
    const nextRates = {
      USD: rates.USD ? 1 / safeNumber(rates.USD) : defaultCnyRates.USD,
      HKD: rates.HKD ? 1 / safeNumber(rates.HKD) : defaultCnyRates.HKD,
    };
    if (!Number.isFinite(nextRates.USD) || nextRates.USD <= 0) nextRates.USD = defaultCnyRates.USD;
    if (!Number.isFinite(nextRates.HKD) || nextRates.HKD <= 0) nextRates.HKD = defaultCnyRates.HKD;
    rateCache = { rates: nextRates, fetchedAt: Date.now() };
    return nextRates;
  } catch (error) {
    console.warn('[creem rates fallback]', error instanceof Error ? error.message : error);
    return defaultCnyRates;
  }
}

async function cnyRateForCurrency(currency) {
  const rates = await getCnyRates();
  return rates[normalizeCurrency(currency)] || defaultCnyRates[normalizeCurrency(currency)];
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

function creemSignature(rawBody) {
  return crypto.createHmac('sha256', creemWebhookSecret).update(rawBody, 'utf8').digest('hex');
}

function isCreemSignatureValid(req) {
  const signature = String(req.get('creem-signature') || '').replace(/\s+/g, '');
  if (!creemWebhookSecret || !signature || !req.rawBody) return false;
  return timingSafeEqualText(signature, creemSignature(req.rawBody));
}

function pickCreemObject(payload) {
  const body = normalizeObject(payload);
  return normalizeObject(body.object || body.data || body);
}

function amountFromMinorUnits(value) {
  return Number((safeNumber(value) / 100).toFixed(2));
}

async function pointsFromCreemOrder(order, fallbackCurrency) {
  const currency = normalizeCurrency(order.currency || fallbackCurrency);
  const amount = amountFromMinorUnits(order.amount ?? order.amount_paid ?? order.amount_due);
  const cnyRate = await cnyRateForCurrency(currency);
  const cnyAmount = Number((amount * cnyRate).toFixed(2));
  return {
    amount,
    currency,
    cnyRate,
    cnyAmount,
    points: pointsFromAmount(cnyAmount),
  };
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
    currency: raw?.currency,
    cnyRate: raw?.cnyRate,
    cnyAmount: raw?.cnyAmount,
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

app.get('/payments/creem/rates', async (_req, res) => {
  const rates = await getCnyRates();
  res.json({ success: true, rates, checkedAt: now() });
});

app.post('/payments/blueocean/checkout', async (req, res) => {
  try {
    if (!blueOceanAppid || !blueOceanKey) throw new Error('BlueOceanPay is not configured');
    const body = normalizeObject(req.body);
    const amount = normalizePaymentAmount(body.amount);
    const points = Math.max(1, Math.round(safeNumber(body.points) || pointsFromAmount(amount)));
    const paymentMethod = String(body.paymentMethod || 'wechat.qrcode');
    const allowedMethods = new Set(['wechat.qrcode', 'alipay.qrcode']);
    if (!allowedMethods.has(paymentMethod)) throw new Error('Unsupported BlueOceanPay payment method');
    const outTradeNo = generateOutTradeNo();
    const requestPayload = {
      appid: blueOceanAppid,
      payment: paymentMethod,
      total_fee: Math.round(amount * 100),
      out_trade_no: outTradeNo,
      body: String(body.body || 'canvasland wallet top-up').trim(),
      attach: `points=${points}`,
      notify_url: blueOceanNotifyUrl,
    };
    requestPayload.sign = blueOceanSign(requestPayload, blueOceanKey);
    const response = await fetch(`${blueOceanApiBaseUrl}/payment/pay`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(requestPayload),
    });
    const text = await response.text();
    let raw = {};
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = { message: text };
      }
    }
    if (!response.ok) throw new Error(raw.message || raw.error || `BlueOceanPay HTTP ${response.status}`);
    const data = normalizeObject(raw.data || raw);
    const qrcode = String(data.qrcode || '');
    if (!qrcode) throw new Error('BlueOceanPay response did not include a QR code');
    const resolvedOutTradeNo = String(data.out_trade_no || outTradeNo);
    await savePendingOrder({
      provider: 'blueocean',
      paymentKind: paymentMethod === 'alipay.qrcode' ? 'alipay' : 'wechat',
      outTradeNo: resolvedOutTradeNo,
      tradeNo: data.sn,
      amount,
      points,
      raw: data,
    });
    res.json({
      success: true,
      configured: true,
      paymentMethod,
      qrcode,
      outTradeNo: resolvedOutTradeNo,
      sn: data.sn,
      tradeState: data.trade_state,
      totalFee: safeNumber(data.total_fee),
      payAmount: safeNumber(data.pay_amount),
      provider: data.provider || paymentMethod.split('.')[0],
      raw: data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      configured: Boolean(blueOceanAppid && blueOceanKey),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/payments/epay/checkout', async (req, res) => {
  try {
    if (!epayAccount || !epayApiKey) throw new Error('EPAY is not configured');
    const body = normalizeObject(req.body);
    const amount = normalizePaymentAmount(body.amount);
    const points = Math.max(1, Math.round(safeNumber(body.points) || pointsFromAmount(amount)));
    const outTradeNo = generateOutTradeNo();
    const name = String(body.name || `canvasland ${points.toLocaleString()} points`).trim();
    const officialPayload = {
      epayAccount,
      version: 'V2.0.0',
      merchantName: epayMerchantName,
      merchantOrderNo: outTradeNo,
      amount: amount.toFixed(2),
      paymentCurrency: 'CNY',
      checkOutType: '0',
      currency: 'CNY',
      notifyUrl: epayNotifyUrl,
      successUrl: epayReturnUrl,
      failUrl: epayReturnUrl,
      successUrlMethod: 'GET',
      failUrlMethod: 'GET',
      remark: name,
      language: 'CN',
      extendFields: {
        paymentMethod: 'alipay',
        points: String(points),
      },
    };
    let raw = {};
    try {
      const response = await fetch(`${epayGatewayUrl}/capi/openapi/gateway/sendTransaction`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          sign: epaySign(officialPayload, epayApiKey),
          param: officialPayload,
        }),
      });
      const text = await response.text();
      raw = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(raw.message || raw.msg || `EPAY HTTP ${response.status}`);
      if (safeNumber(raw.code) !== 1) throw new Error(raw.message || raw.msg || `EPAY error ${raw.code || 'unknown'}`);
    } catch (officialError) {
      const compatiblePayload = {
        pid: epayAccount,
        type: 'alipay',
        out_trade_no: outTradeNo,
        notify_url: epayNotifyUrl,
        return_url: epayReturnUrl,
        name,
        money: amount.toFixed(2),
        clientip: req.ip || '127.0.0.1',
        device: 'pc',
      };
      const signedPayload = {
        ...compatiblePayload,
        sign: epayCompatibleSign(compatiblePayload, epayApiKey),
        sign_type: 'MD5',
      };
      const response = await fetch(`${epayGatewayUrl}/mapi.php`, {
        method: 'POST',
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams(Object.entries(signedPayload)),
      });
      const text = await response.text();
      try {
        raw = text ? JSON.parse(text) : {};
      } catch {
        raw = { msg: text };
      }
      if (!response.ok) throw new Error(raw.message || raw.msg || `EPAY HTTP ${response.status}`);
    }
    const code = safeNumber(raw.code);
    if (code !== 1) throw new Error(raw.message || raw.msg || `EPAY error ${code || 'unknown'}`);
    const data = normalizeObject(raw.data || raw);
    const qrcode = String(data.qrcode || data.code_url || data.payurl || data.url || data.epayUrl || '');
    if (!qrcode) throw new Error('EPAY response did not include a QR code or pay URL');
    const resolvedOutTradeNo = String(data.merchantOrderNo || data.out_trade_no || outTradeNo);
    await savePendingOrder({
      provider: 'epay',
      paymentKind: 'alipay',
      outTradeNo: resolvedOutTradeNo,
      tradeNo: data.epayOrderNo || data.trade_no,
      amount,
      points,
      raw: data,
    });
    res.json({
      success: true,
      configured: true,
      paymentMethod: 'alipay',
      qrcode,
      payUrl: data.payurl || data.url || data.epayUrl,
      outTradeNo: resolvedOutTradeNo,
      tradeNo: data.epayOrderNo || data.trade_no,
      status: safeNumber(data.status),
      raw: data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      configured: Boolean(epayAccount && epayApiKey),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/payments/creem/checkout', async (req, res) => {
  try {
    if (!creemApiKey) throw new Error('Creem API key is not configured');
    const body = normalizeObject(req.body);
    const amount = safeNumber(body.amount);
    const currency = normalizeCurrency(body.currency);
    const productId = creemProductIds[currency] || creemDefaultProductId;
    if (!productId) throw new Error(`Creem ${currency} product ID is not configured`);
    if (!Number.isFinite(amount) || amount < 1) throw new Error('Creem amount must be at least 1.00');
    const customPrice = Math.round(amount * 100);
    if (customPrice < 100 || customPrice > 99999999) throw new Error('Creem custom price is outside the allowed range');
    const outTradeNo = `CL${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const cnyRate = await cnyRateForCurrency(currency);
    const cnyAmount = Number((amount * cnyRate).toFixed(2));
    const points = pointsFromAmount(cnyAmount);
    const response = await fetch(`${creemApiBaseUrl.replace(/\/+$/, '')}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': creemApiKey,
      },
      body: JSON.stringify({
        product_id: productId,
        request_id: outTradeNo,
        units: 1,
        custom_price: customPrice,
        success_url: creemSuccessUrl,
        metadata: {
          provider: 'canvasland',
          outTradeNo,
          amount: amount.toFixed(2),
          currency,
          cnyRate: String(cnyRate),
          cnyAmount: String(cnyAmount),
          points: String(points),
        },
      }),
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!response.ok) {
      throw new Error(data.message || data.error || `Creem HTTP ${response.status}`);
    }
    const checkoutUrl = data.checkout_url || data.checkoutUrl;
    if (!checkoutUrl) throw new Error('Creem response did not include checkout URL');
    res.json({
      success: true,
      checkoutUrl,
      checkoutId: data.id,
      outTradeNo,
      amount,
      currency,
      cnyRate,
      cnyAmount,
      points,
      status: data.status,
      raw: data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/payments/epay/notify', async (req, res) => {
  const body = normalizeObject(req.body);
  const payload = normalizeObject(body.param || body.data || body);
  const sign = body.sign || payload.sign;
  const validSign = epayApiKey && sign && (
    timingSafeEqualText(sign, epaySign(payload, epayApiKey))
    || timingSafeEqualText(sign, epayCompatibleSign(payload, epayApiKey))
  );
  if (!validSign) {
    console.warn('[epay notify rejected]', { hasKey: Boolean(epayApiKey), hasSign: Boolean(sign), body });
    res.status(400).send('FAIL');
    return;
  }
  const payloadAccount = payload.epayAccount || payload.pid;
  if (epayAccount && payloadAccount && String(payloadAccount) !== epayAccount) {
    res.status(400).send('FAIL');
    return;
  }
  if (isEpayPaid(payload)) {
    await creditWallet({
      provider: 'epay',
      paymentKind: 'alipay',
      outTradeNo: payload.merchantOrderNo || payload.outTradeNo || payload.out_trade_no || payload.orderNo,
      tradeNo: payload.epayOrderNo || payload.tradeNo || payload.trade_no,
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

app.post('/payments/creem/notify', async (req, res) => {
  if (!isCreemSignatureValid(req)) {
    console.warn('[creem notify rejected]', { hasSecret: Boolean(creemWebhookSecret), hasSign: Boolean(req.get('creem-signature')) });
    res.status(400).send('FAIL');
    return;
  }
  const payload = normalizeObject(req.body);
  const eventType = String(payload.eventType || payload.type || '');
  if (eventType === 'checkout.completed') {
    const checkout = pickCreemObject(payload);
    const order = normalizeObject(checkout.order);
    const product = normalizeObject(checkout.product);
    const metadata = normalizeObject(checkout.metadata);
    const configuredProductIds = Object.values(creemProductIds).filter(Boolean);
    const productId = String(order.product || product.id || checkout.product || '');
    if (configuredProductIds.length > 0 && productId && !configuredProductIds.includes(productId)) {
      res.status(400).send('FAIL');
      return;
    }
    const status = String(order.status || checkout.status || '').toLowerCase();
    if (status === 'paid' || status === 'completed') {
      const payment = await pointsFromCreemOrder(order, metadata.currency || product.currency);
      const outTradeNo = checkout.request_id || metadata.outTradeNo || order.id;
      await creditWallet({
        provider: 'creem',
        paymentKind: 'creem',
        outTradeNo,
        tradeNo: order.id || checkout.id,
        amount: payment.amount,
        points: metadata.points ? safeNumber(metadata.points) : payment.points,
        raw: {
          ...checkout,
          currency: payment.currency,
          cnyRate: payment.cnyRate,
          cnyAmount: payment.cnyAmount,
        },
      });
    }
  }
  res.send('SUCCESS');
});

app.listen(port, '127.0.0.1', () => {
  console.log(`canvasland wallet api listening on 127.0.0.1:${port}`);
});
