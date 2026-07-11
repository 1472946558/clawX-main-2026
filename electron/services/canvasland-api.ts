import type {
  BlueOceanPayConfig,
  BlueOceanPayConfigPayload,
  BlueOceanPayConfigResult,
  BlueOceanPayCreatePaymentPayload,
  BlueOceanPayPaymentMethod,
  BlueOceanPayPaymentResult,
  BlueOceanPayQueryPayload,
  BlueOceanPayQueryResult,
  CanvaslandBalanceResult,
  CanvaslandWalletBalance,
  CanvaslandWalletRecord,
  CanvaslandTopUpInfo,
  CanvaslandTopUpMethod,
  CanvaslandTokenUsage,
  CreemCheckoutResult,
  CreemCreateCheckoutPayload,
  CreemCurrency,
  CreemRatesResult,
  EpayConfig,
  EpayConfigPayload,
  EpayConfigResult,
  EpayCreatePaymentPayload,
  EpayPaymentMethod,
  EpayPaymentResult,
  EpayQueryPayload,
  EpayQueryResult,
} from '@shared/host-api/contract';
import { createHash, randomBytes } from 'crypto';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { proxyAwareFetch } from '../utils/proxy-fetch';
import { getProviderService } from './providers/provider-service';
import { getcanvaslandProviderStore } from './providers/store-instance';
import { deleteProviderSecret, getProviderSecret, setProviderSecret } from './secrets/secret-store';
import { isRecord } from './payload-utils';
import { renderQrPngDataUrl } from '../utils/qr-png';

const CANVASLAND_ACCOUNT_ID = 'canvasland-newapi';
const BLUEOCEAN_SECRET_ID = 'canvasland-blueoceanpay';
const BLUEOCEAN_CONFIG_KEY = 'blueOceanPay';
const EPAY_SECRET_ID = 'canvasland-epay';
const EPAY_CONFIG_KEY = 'epay';
const WALLET_LEDGER_KEY = 'walletLedger';
const DEFAULT_ROOT_URL = 'https://feiniu.space';
const DEFAULT_BLUEOCEAN_API_BASE_URL = 'https://api.hk.blueoceanpay.com';
const DEFAULT_WALLET_API_BASE_URL = 'https://apitoken.unihuax.com';
const DEFAULT_BLUEOCEAN_NOTIFY_URL = `${DEFAULT_WALLET_API_BASE_URL}/payments/blueocean/notify`;
const DEFAULT_EPAY_NOTIFY_URL = `${DEFAULT_WALLET_API_BASE_URL}/payments/epay/notify`;
const DEFAULT_PAYMENT_RETURN_URL = 'https://feiniu-ai.cn';
const DEFAULT_QUOTA_PER_UNIT = 500000;
const DEFAULT_CREEM_RATES: Record<CreemCurrency, number> = {
  USD: 6.8,
  HKD: 0.87,
};
const TOKENS_PER_POINT = 100;
const BLUEOCEAN_QR_PAYMENT_METHODS = new Set<BlueOceanPayPaymentMethod>([
  'wechat.qrcode',
  'alipay.qrcode',
]);
const EPAY_PAYMENT_METHODS = new Set<EpayPaymentMethod>(['alipay']);

type WalletLedgerEntry = CanvaslandWalletRecord;

function normalizeRootUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_ROOT_URL;
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
}

function buildApiUrl(rootUrl: string, path: string): string {
  return `${normalizeRootUrl(rootUrl)}${path}`;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function getFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function getFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && 'data' in value) return value.data;
  return value;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await proxyAwareFetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }
  if (!response.ok) {
    const message = isRecord(parsed) && typeof parsed.message === 'string'
      ? parsed.message
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

function parseTokenUsage(value: unknown): CanvaslandTokenUsage | undefined {
  const data = unwrapData(value);
  if (!isRecord(data)) return undefined;
  const directTotalGranted = getFirstNumber(data, [
    'total_granted',
    'totalGranted',
    'total_quota',
    'totalQuota',
    'unlimited_quota',
  ]);
  const totalUsed = getFirstNumber(data, [
    'total_used',
    'totalUsed',
    'used_quota',
    'usedQuota',
    'used',
  ]);
  const totalAvailable = getFirstNumber(data, [
    'total_available',
    'totalAvailable',
    'remain_quota',
    'remainQuota',
    'available_quota',
    'availableQuota',
    'quota',
  ]);
  const totalGranted = directTotalGranted
    ?? (
      typeof totalUsed === 'number' && typeof totalAvailable === 'number'
        ? totalUsed + totalAvailable
        : totalAvailable
    );
  return {
    name: getFirstString(data, ['name', 'token_name', 'tokenName', 'key_name']),
    totalGranted,
    totalUsed,
    totalAvailable,
    unlimitedQuota: getBoolean(data.unlimited_quota),
    expiresAt: getFirstNumber(data, ['expires_at', 'expiresAt', 'expired_time']),
  };
}

function unwrapArrayData(value: unknown): unknown[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of ['items', 'logs', 'records', 'data']) {
      const nested = data[key];
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value.trim();
  }
  const number = getNumber(value);
  if (typeof number === 'number') {
    const millis = number > 10_000_000_000 ? number : number * 1000;
    return new Date(millis).toISOString();
  }
  return undefined;
}

function pointsFromTokenUsage(record: Record<string, unknown>): number | undefined {
  const explicitQuota = getFirstNumber(record, [
    'quota',
    'used_quota',
    'usedQuota',
    'total_quota',
    'totalQuota',
  ]);
  if (typeof explicitQuota === 'number' && explicitQuota > 0) {
    return Math.ceil(explicitQuota / TOKENS_PER_POINT);
  }
  let tokens = getFirstNumber(record, [
    'token_used',
    'tokenUsed',
    'total_tokens',
    'totalTokens',
  ]);
  if (tokens === undefined) {
    const promptTokens = getFirstNumber(record, ['prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens']);
    const completionTokens = getFirstNumber(record, ['completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens']);
    if (promptTokens !== undefined || completionTokens !== undefined) {
      tokens = (promptTokens ?? 0) + (completionTokens ?? 0);
    }
  }
  if (typeof tokens === 'number' && tokens > 0) {
    return Math.ceil(tokens / TOKENS_PER_POINT);
  }
  return undefined;
}

function parseTokenLogRecords(value: unknown): CanvaslandWalletRecord[] {
  return unwrapArrayData(value)
    .filter(isRecord)
    .map((record, index): CanvaslandWalletRecord | null => {
      const createdAt = normalizeTimestamp(
        record.created_at
        ?? record.createdAt
        ?? record.timestamp
        ?? record.time
        ?? record.created_time,
      );
      const points = pointsFromTokenUsage(record);
      if (!createdAt || !points) return null;
      const id = getFirstString(record, ['id', 'log_id', 'request_id'])
        || `newapi-${createdAt}-${index}`;
      const tokenUsed = getFirstNumber(record, [
        'token_used',
        'tokenUsed',
        'total_tokens',
        'totalTokens',
      ]);
      return {
        id,
        kind: 'usage',
        provider: 'newapi',
        paymentKind: 'model',
        points,
        status: 'used',
        createdAt,
        model: getFirstString(record, ['model_name', 'modelName', 'model']),
        tokenUsed,
        description: getFirstString(record, ['prompt', 'content', 'type_name', 'typeName', 'request_type']),
      };
    })
    .filter((record): record is CanvaslandWalletRecord => Boolean(record));
}

function parseTopUpInfo(value: unknown): CanvaslandTopUpInfo | undefined {
  const data = unwrapData(value);
  if (!isRecord(data)) return undefined;
  const amountOptions = Array.isArray(data.amount_options)
    ? data.amount_options
      .map((item) => getNumber(item))
      .filter((item): item is number => typeof item === 'number')
    : undefined;
  const payMethods = Array.isArray(data.pay_methods)
    ? data.pay_methods
      .filter(isRecord)
      .map((item): CanvaslandTopUpMethod => ({
        name: typeof item.name === 'string' ? item.name : undefined,
        type: typeof item.type === 'string' ? item.type : undefined,
        minTopup: typeof item.min_topup === 'string' ? item.min_topup : undefined,
      }))
    : undefined;
  return {
    enabled: Boolean(
      data.enable_online_topup
      || data.enable_stripe_topup
      || data.enable_creem_topup
      || data.enable_waffo_topup
      || data.enable_waffo_pancake_topup,
    ),
    redemptionEnabled: getBoolean(data.enable_redemption),
    amountOptions,
    payMethods,
    topupLink: typeof data.topup_link === 'string' ? data.topup_link : undefined,
  };
}

function parseStatus(value: unknown): {
  quotaPerUnit: number;
  quotaDisplayType: string;
  customCurrencySymbol?: string;
  customCurrencyExchangeRate?: number;
} {
  const data = isRecord(value) ? value : {};
  return {
    quotaPerUnit: getNumber(data.quota_per_unit) || DEFAULT_QUOTA_PER_UNIT,
    quotaDisplayType: typeof data.quota_display_type === 'string' ? data.quota_display_type : 'USD',
    customCurrencySymbol: typeof data.custom_currency_symbol === 'string' ? data.custom_currency_symbol : undefined,
    customCurrencyExchangeRate: getNumber(data.custom_currency_exchange_rate),
  };
}

function formatPoints(points: number): string {
  return `${Math.max(0, Math.round(points)).toLocaleString()} 积分`;
}

function normalizeWalletRecord(value: unknown): WalletLedgerEntry | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : undefined;
  const outTradeNo = typeof value.outTradeNo === 'string' ? value.outTradeNo : undefined;
  const provider = value.provider === 'blueocean' || value.provider === 'epay' || value.provider === 'creem'
    ? value.provider
    : undefined;
  const paymentKind = value.paymentKind === 'wechat' || value.paymentKind === 'alipay' || value.paymentKind === 'creem'
    ? value.paymentKind
    : undefined;
  const amount = getNumber(value.amount);
  const points = getNumber(value.points);
  const status = value.status === 'paid' ? 'paid' : 'pending';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : undefined;
  const paidAt = typeof value.paidAt === 'string' ? value.paidAt : undefined;
  if (!id || !outTradeNo || !provider || !paymentKind || amount === undefined || points === undefined || !createdAt) {
    return null;
  }
  return {
    id,
    kind: 'topup',
    outTradeNo,
    provider,
    paymentKind,
    amount,
    currency: value.currency === 'USD' || value.currency === 'HKD' || value.currency === 'CNY' ? value.currency : undefined,
    cnyRate: getNumber(value.cnyRate),
    cnyAmount: getNumber(value.cnyAmount),
    points: Math.max(0, Math.round(points)),
    status,
    createdAt,
    paidAt,
  };
}

async function getWalletLedger(): Promise<WalletLedgerEntry[]> {
  const store = await getcanvaslandProviderStore();
  const raw = store.get(WALLET_LEDGER_KEY) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeWalletRecord)
    .filter((record): record is WalletLedgerEntry => Boolean(record))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function setWalletLedger(records: WalletLedgerEntry[]): Promise<void> {
  const store = await getcanvaslandProviderStore();
  store.set(WALLET_LEDGER_KEY, records.slice(0, 200));
}

function calculateWalletBalance(records: WalletLedgerEntry[]): CanvaslandWalletBalance {
  const totalGranted = records
    .filter((record) => record.status === 'paid')
    .reduce((sum, record) => sum + record.points, 0);
  const totalUsed = records
    .filter((record) => record.kind === 'usage' || record.status === 'used')
    .reduce((sum, record) => sum + record.points, 0);
  return {
    totalGranted,
    totalUsed,
    totalAvailable: Math.max(0, totalGranted - totalUsed),
  };
}

async function fetchRemoteWallet(): Promise<{
  wallet?: CanvaslandWalletBalance;
  records: CanvaslandWalletRecord[];
}> {
  const balanceRaw = await fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/api/wallet/balance`).catch(() => null);
  const recordsRaw = await fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/api/wallet/records`).catch(() => null);
  const walletData = unwrapData(balanceRaw);
  const walletSource = isRecord(walletData) && isRecord(walletData.wallet) ? walletData.wallet : walletData;
  const totalGranted = isRecord(walletSource) ? getNumber(walletSource.totalGranted) : undefined;
  const totalUsed = isRecord(walletSource) ? getNumber(walletSource.totalUsed) : undefined;
  const totalAvailable = isRecord(walletSource) ? getNumber(walletSource.totalAvailable) : undefined;
  const records = unwrapArrayData(recordsRaw)
    .map(normalizeWalletRecord)
    .filter((record): record is WalletLedgerEntry => Boolean(record));
  return {
    wallet: {
      totalGranted: totalGranted ?? 0,
      totalUsed: totalUsed ?? 0,
      totalAvailable: totalAvailable ?? Math.max(0, (totalGranted ?? 0) - (totalUsed ?? 0)),
    },
    records,
  };
}

function mergeWalletRecords(...recordGroups: CanvaslandWalletRecord[][]): CanvaslandWalletRecord[] {
  const byId = new Map<string, CanvaslandWalletRecord>();
  for (const record of recordGroups.flat()) {
    const key = record.outTradeNo || record.id;
    if (!byId.has(key)) {
      byId.set(key, record);
      continue;
    }
    const existing = byId.get(key)!;
    if (existing.status !== 'paid' && record.status === 'paid') {
      byId.set(key, record);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.paidAt || b.createdAt) - Date.parse(a.paidAt || a.createdAt));
}

async function savePendingWalletOrder(record: Omit<WalletLedgerEntry, 'status' | 'createdAt'>): Promise<void> {
  const ledger = await getWalletLedger();
  const nextRecord: WalletLedgerEntry = {
    ...record,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const nextLedger = [
    nextRecord,
    ...ledger.filter((item) => item.outTradeNo !== nextRecord.outTradeNo),
  ];
  await setWalletLedger(nextLedger);
}

async function markWalletOrderPaid(outTradeNo: string | undefined): Promise<WalletLedgerEntry | null> {
  const orderNo = outTradeNo?.trim();
  if (!orderNo) return null;
  const ledger = await getWalletLedger();
  const index = ledger.findIndex((record) => record.outTradeNo === orderNo);
  if (index < 0) return null;
  const existing = ledger[index];
  if (existing.status === 'paid') return existing;
  const paidRecord: WalletLedgerEntry = {
    ...existing,
    status: 'paid',
    paidAt: new Date().toISOString(),
  };
  const nextLedger = [...ledger];
  nextLedger[index] = paidRecord;
  await setWalletLedger(nextLedger);
  return paidRecord;
}

function isBlueOceanPaidState(state: unknown): boolean {
  if (typeof state !== 'string') return false;
  const normalized = state.trim().toUpperCase();
  return [
    'SUCCESS',
    'TRADE_SUCCESS',
    'PAY_SUCCESS',
    'PAID',
    'COMPLETED',
    'FINISHED',
  ].includes(normalized);
}

function isEpayPaidStatus(status: unknown): boolean {
  const value = getNumber(status);
  return value === 1 || value === 7;
}

function normalizeBlueOceanBaseUrl(url: string | undefined): string {
  const trimmed = url?.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_BLUEOCEAN_API_BASE_URL;
}

function normalizeOptionalUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed || undefined;
}

function normalizeEpayGatewayUrl(url: string | undefined): string {
  const trimmed = url?.trim().replace(/\/+$/, '') || '';
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const openApiIndex = normalizedPath.toLowerCase().indexOf('/capi/openapi');
    if (openApiIndex >= 0) {
      parsed.pathname = normalizedPath.slice(0, openApiIndex);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    }
    if ((normalizedPath === '' || normalizedPath === '/') && parsed.hostname.toLowerCase() === 'mzf.mapay.cc') {
      parsed.pathname = '/xpay/epay';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function generateOutTradeNo(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `CL${stamp}${randomBytes(4).toString('hex').toUpperCase()}`;
}

function toBlueOceanSignValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

function signBlueOceanPayload(payload: Record<string, unknown>, merchantKey: string): string {
  const signString = Object.keys(payload)
    .filter((key) => key !== 'sign')
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')
    .sort()
    .map((key) => `${key}=${toBlueOceanSignValue(payload[key])}`)
    .join('&');
  return createHash('md5')
    .update(`${signString}&key=${merchantKey}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function toEpaySignValue(value: unknown): string {
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined && value[key] !== null && value[key] !== '')
      .sort()
      .map((key) => `${key}=${toEpaySignValue(value[key])}`)
      .join('&')}}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function signEpayParam(param: Record<string, unknown>, apiKey: string): string {
  const signString = Object.keys(param)
    .filter((key) => param[key] !== undefined && param[key] !== null && param[key] !== '')
    .sort()
    .map((key) => `${key}=${toEpaySignValue(param[key])}`)
    .join('&');
  return createHash('sha256')
    .update(`${signString}&key=${apiKey}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function signEpayCompatibleParam(param: Record<string, unknown>, apiKey: string): string {
  const signString = Object.keys(param)
    .filter((key) => key !== 'sign' && key !== 'sign_type')
    .filter((key) => param[key] !== undefined && param[key] !== null && param[key] !== '')
    .sort()
    .map((key) => `${key}=${String(param[key])}`)
    .join('&');
  return createHash('md5')
    .update(`${signString}${apiKey}`, 'utf8')
    .digest('hex');
}

async function getEpayConfig(): Promise<EpayConfig> {
  const store = await getcanvaslandProviderStore();
  const value = store.get(EPAY_CONFIG_KEY) as EpayConfig | undefined;
  if (!value || typeof value !== 'object') {
    return {
      notifyUrl: DEFAULT_EPAY_NOTIFY_URL,
      returnUrl: DEFAULT_PAYMENT_RETURN_URL,
      siteName: 'canvasland',
    };
  }
  return {
    gatewayUrl: typeof value.gatewayUrl === 'string' ? normalizeEpayGatewayUrl(value.gatewayUrl) : undefined,
    pid: typeof value.pid === 'string' ? value.pid : undefined,
    notifyUrl: normalizeOptionalUrl(typeof value.notifyUrl === 'string' ? value.notifyUrl : undefined) || DEFAULT_EPAY_NOTIFY_URL,
    returnUrl: normalizeOptionalUrl(typeof value.returnUrl === 'string' ? value.returnUrl : undefined) || DEFAULT_PAYMENT_RETURN_URL,
    siteName: typeof value.siteName === 'string' ? value.siteName : undefined,
  };
}

async function setEpayConfig(config: EpayConfig): Promise<void> {
  const store = await getcanvaslandProviderStore();
  store.set(EPAY_CONFIG_KEY, {
    gatewayUrl: normalizeEpayGatewayUrl(config.gatewayUrl),
    pid: config.pid?.trim() || '',
    notifyUrl: normalizeOptionalUrl(config.notifyUrl) || DEFAULT_EPAY_NOTIFY_URL,
    returnUrl: normalizeOptionalUrl(config.returnUrl) || DEFAULT_PAYMENT_RETURN_URL,
    siteName: config.siteName?.trim() || 'canvasland',
  });
}

async function getEpayMerchantKey(): Promise<string | null> {
  const secret = await getProviderSecret(EPAY_SECRET_ID);
  return secret?.type === 'api_key' ? secret.apiKey : null;
}

async function requireEpayCredentials(): Promise<{
  config: Required<Pick<EpayConfig, 'gatewayUrl' | 'pid' | 'notifyUrl' | 'returnUrl'>> & Pick<EpayConfig, 'siteName'>;
  merchantKey: string;
}> {
  const config = await getEpayConfig();
  const merchantKey = await getEpayMerchantKey();
  const gatewayUrl = normalizeEpayGatewayUrl(config.gatewayUrl);
  const pid = config.pid?.trim();
  const notifyUrl = normalizeOptionalUrl(config.notifyUrl);
  const returnUrl = normalizeOptionalUrl(config.returnUrl);
  if (!gatewayUrl || !pid || !merchantKey || !notifyUrl || !returnUrl) {
    throw new Error('Epay is not configured');
  }
  return {
    config: {
      gatewayUrl,
      pid,
      notifyUrl,
      returnUrl,
      siteName: config.siteName?.trim() || 'canvasland',
    },
    merchantKey,
  };
}

function normalizeEpayPaymentMethod(value: unknown): EpayPaymentMethod {
  return typeof value === 'string' && EPAY_PAYMENT_METHODS.has(value as EpayPaymentMethod)
    ? value as EpayPaymentMethod
    : 'alipay';
}

function epayUrl(gatewayUrl: string, path: string): string {
  return `${normalizeEpayGatewayUrl(gatewayUrl)}${path}`;
}

async function fetchEpayJson(
  gatewayUrl: string,
  path: string,
  param: Record<string, unknown>,
  apiKey: string,
): Promise<unknown> {
  const response = await proxyAwareFetch(epayUrl(gatewayUrl, path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'canvasland/1.0',
    },
    body: JSON.stringify({
      sign: signEpayParam(param, apiKey),
      param,
    }),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { msg: text };
    }
  }
  if (!response.ok) {
    const message = isRecord(parsed)
      ? typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.msg === 'string'
          ? parsed.msg
          : `HTTP ${response.status}`
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function fetchEpayCompatibleJson(
  gatewayUrl: string,
  endpoint: string,
  param: Record<string, unknown>,
  apiKey: string,
): Promise<unknown> {
  const signedParam = {
    ...param,
    sign: signEpayCompatibleParam(param, apiKey),
    sign_type: 'MD5',
  };
  const response = await proxyAwareFetch(epayUrl(gatewayUrl, `/${endpoint.replace(/^\/+/, '')}`), {
    method: 'POST',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'User-Agent': 'canvasland/1.0',
    },
    body: Object.entries(signedParam).reduce((body, [key, value]) => {
      body.append(key, String(value));
      return body;
    }, new URLSearchParams()),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { msg: text };
    }
  }
  if (!response.ok) {
    const message = isRecord(parsed)
      ? typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.msg === 'string'
          ? parsed.msg
          : `HTTP ${response.status}`
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function queryEpayCompatibleOrder(
  gatewayUrl: string,
  pid: string,
  apiKey: string,
  payload: EpayQueryPayload,
): Promise<unknown> {
  const params = new URLSearchParams({
    act: 'order',
    pid,
    key: apiKey,
  });
  if (payload.tradeNo?.trim()) {
    params.set('trade_no', payload.tradeNo.trim());
  }
  if (payload.outTradeNo?.trim()) {
    params.set('out_trade_no', payload.outTradeNo.trim());
  }
  const response = await proxyAwareFetch(epayUrl(gatewayUrl, `/api.php?${params.toString()}`), {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'canvasland/1.0',
    },
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { msg: text };
    }
  }
  if (!response.ok) {
    throw new Error(isRecord(parsed) && typeof parsed.msg === 'string' ? parsed.msg : `HTTP ${response.status}`);
  }
  return parsed;
}

function unwrapEpayData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid Epay response');
  const code = getNumber(value.code);
  if (code !== 1) {
    const message = typeof value.message === 'string'
      ? value.message
      : typeof value.msg === 'string'
        ? value.msg
        : `Epay error ${code ?? 'unknown'}`;
    throw new Error(message);
  }
  return isRecord(value.data) ? value.data : value;
}

function resolveEpayQrOrPayUrl(data: Record<string, unknown>): { qrcode: string; payUrl?: string } {
  const qrcode = typeof data.qrcode === 'string'
    ? data.qrcode
    : typeof data.code_url === 'string'
      ? data.code_url
      : typeof data.payurl === 'string'
        ? data.payurl
        : typeof data.url === 'string'
          ? data.url
          : typeof data.epayUrl === 'string'
            ? data.epayUrl
            : '';
  const payUrl = typeof data.payurl === 'string'
    ? data.payurl
    : typeof data.url === 'string'
      ? data.url
      : typeof data.epayUrl === 'string'
        ? data.epayUrl
        : undefined;
  return { qrcode, payUrl };
}

async function getBlueOceanConfig(): Promise<BlueOceanPayConfig> {
  const store = await getcanvaslandProviderStore();
  const value = store.get(BLUEOCEAN_CONFIG_KEY) as BlueOceanPayConfig | undefined;
  if (!value || typeof value !== 'object') {
    return {
      apiBaseUrl: DEFAULT_BLUEOCEAN_API_BASE_URL,
      notifyUrl: DEFAULT_BLUEOCEAN_NOTIFY_URL,
    };
  }
  return {
    appid: typeof value.appid === 'string' ? value.appid : undefined,
    apiBaseUrl: normalizeBlueOceanBaseUrl(value.apiBaseUrl),
    notifyUrl: normalizeOptionalUrl(typeof value.notifyUrl === 'string' ? value.notifyUrl : undefined) || DEFAULT_BLUEOCEAN_NOTIFY_URL,
  };
}

async function setBlueOceanConfig(config: BlueOceanPayConfig): Promise<void> {
  const store = await getcanvaslandProviderStore();
  store.set(BLUEOCEAN_CONFIG_KEY, {
    appid: config.appid?.trim() || '',
    apiBaseUrl: normalizeBlueOceanBaseUrl(config.apiBaseUrl),
    notifyUrl: normalizeOptionalUrl(config.notifyUrl) || DEFAULT_BLUEOCEAN_NOTIFY_URL,
  });
}

async function getBlueOceanMerchantKey(): Promise<string | null> {
  const secret = await getProviderSecret(BLUEOCEAN_SECRET_ID);
  return secret?.type === 'api_key' ? secret.apiKey : null;
}

async function requireBlueOceanCredentials(): Promise<{
  config: Required<Pick<BlueOceanPayConfig, 'appid' | 'apiBaseUrl'>> & Pick<BlueOceanPayConfig, 'notifyUrl'>;
  merchantKey: string;
}> {
  const config = await getBlueOceanConfig();
  const merchantKey = await getBlueOceanMerchantKey();
  const appid = config.appid?.trim();
  if (!appid || !merchantKey) {
    throw new Error('BlueOceanPay is not configured');
  }
  return {
    config: {
      appid,
      apiBaseUrl: normalizeBlueOceanBaseUrl(config.apiBaseUrl),
      notifyUrl: normalizeOptionalUrl(config.notifyUrl),
    },
    merchantKey,
  };
}

async function fetchBlueOceanJson(
  apiBaseUrl: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const response = await proxyAwareFetch(`${normalizeBlueOceanBaseUrl(apiBaseUrl)}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'canvasland/1.0 NetType/WIFI Language/zh_CN',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : `HTTP ${response.status}`);
  }
  return parsed;
}

function unwrapBlueOceanData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid BlueOceanPay response');
  const code = getNumber(value.code);
  if (code !== 200) {
    const message = typeof value.message === 'string' ? value.message : `BlueOceanPay error ${code ?? 'unknown'}`;
    throw new Error(message);
  }
  const data = value.data;
  if (!isRecord(data)) return {};
  return data;
}

function toInt(value: unknown): number | undefined {
  const number = getNumber(value);
  return typeof number === 'number' ? Math.round(number) : undefined;
}

function normalizeBlueOceanPaymentMethod(value: unknown): BlueOceanPayPaymentMethod {
  return typeof value === 'string' && BLUEOCEAN_QR_PAYMENT_METHODS.has(value as BlueOceanPayPaymentMethod)
    ? value as BlueOceanPayPaymentMethod
    : 'wechat.qrcode';
}

function normalizeCreemCurrency(value: unknown): CreemCurrency {
  return value === 'HKD' ? 'HKD' : 'USD';
}

function normalizeCreemRates(value: unknown): Record<CreemCurrency, number> {
  const data = unwrapData(value);
  const source = isRecord(data) && isRecord(data.rates) ? data.rates : data;
  return {
    USD: isRecord(source) ? getNumber(source.USD) ?? DEFAULT_CREEM_RATES.USD : DEFAULT_CREEM_RATES.USD,
    HKD: isRecord(source) ? getNumber(source.HKD) ?? DEFAULT_CREEM_RATES.HKD : DEFAULT_CREEM_RATES.HKD,
  };
}

async function fetchCreemRates(): Promise<Record<CreemCurrency, number>> {
  const raw = await fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/payments/creem/rates`).catch(() => null);
  return normalizeCreemRates(raw);
}

async function fetchCreemCheckout(payload: CreemCreateCheckoutPayload): Promise<unknown> {
  return fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/payments/creem/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

async function fetchBlueOceanServerCheckout(payload: BlueOceanPayCreatePaymentPayload): Promise<BlueOceanPayPaymentResult> {
  const raw = await fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/payments/blueocean/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = unwrapData(raw);
  if (!isRecord(data)) throw new Error('Invalid BlueOceanPay checkout response');
  const qrcode = typeof data.qrcode === 'string' ? data.qrcode : '';
  if (!qrcode) throw new Error('BlueOceanPay response did not include a QR code');
  return {
    success: true,
    configured: true,
    paymentMethod: normalizeBlueOceanPaymentMethod(data.paymentMethod ?? payload.paymentMethod),
    qrcode,
    qrcodeDataUrl: renderQrPngDataUrl(qrcode),
    outTradeNo: typeof data.outTradeNo === 'string' ? data.outTradeNo : undefined,
    sn: typeof data.sn === 'string' ? data.sn : undefined,
    tradeState: typeof data.tradeState === 'string' ? data.tradeState : undefined,
    totalFee: toInt(data.totalFee),
    payAmount: toInt(data.payAmount),
    provider: typeof data.provider === 'string' ? data.provider : undefined,
    raw: data,
  };
}

async function fetchEpayServerCheckout(payload: EpayCreatePaymentPayload): Promise<EpayPaymentResult> {
  const raw = await fetchJson(`${DEFAULT_WALLET_API_BASE_URL}/payments/epay/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = unwrapData(raw);
  if (!isRecord(data)) throw new Error('Invalid EPAY checkout response');
  const qrcode = typeof data.qrcode === 'string' ? data.qrcode : '';
  if (!qrcode) throw new Error('EPAY response did not include a QR code or pay URL');
  return {
    success: true,
    configured: true,
    paymentMethod: normalizeEpayPaymentMethod(data.paymentMethod ?? payload.paymentMethod),
    qrcode,
    qrcodeDataUrl: renderQrPngDataUrl(qrcode),
    payUrl: typeof data.payUrl === 'string' ? data.payUrl : undefined,
    outTradeNo: typeof data.outTradeNo === 'string' ? data.outTradeNo : undefined,
    tradeNo: typeof data.tradeNo === 'string' ? data.tradeNo : undefined,
    status: toInt(data.status),
    raw: data,
  };
}

export function createCanvaslandApi(): CompleteHostServiceRegistry['canvasland'] {
  return {
    balance: async (): Promise<CanvaslandBalanceResult> => {
      const providerService = getProviderService();
      const account = await providerService.getAccount(CANVASLAND_ACCOUNT_ID);
      const key = await providerService.getAccountApiKey(CANVASLAND_ACCOUNT_ID);
      const endpoint = normalizeRootUrl(account?.baseUrl || DEFAULT_ROOT_URL);
      const topUpUrl = `${endpoint}/console/topup`;
      const walletRecords = await getWalletLedger();
      const remoteWallet = await fetchRemoteWallet();
      const mergedInitialRecords = mergeWalletRecords(remoteWallet.records, walletRecords);
      const wallet = remoteWallet.records.length > 0
        ? calculateWalletBalance(mergedInitialRecords)
        : (remoteWallet.wallet ?? calculateWalletBalance(walletRecords));

      if (!account || !key) {
        return {
          success: true,
          configured: false,
          endpoint,
          topUpUrl,
          wallet,
          walletRecords,
          token: {
            name: 'canvasland New API',
            totalGranted: wallet.totalGranted,
            totalUsed: wallet.totalUsed,
            totalAvailable: wallet.totalAvailable,
            unlimitedQuota: false,
          },
          displayBalance: formatPoints(wallet.totalAvailable),
          displayUsed: formatPoints(wallet.totalUsed),
          checkedAt: new Date().toISOString(),
        };
      }

      const statusPromise = fetchJson(buildApiUrl(endpoint, '/api/status')).catch(() => ({}));
      const tokenUsagePromise = fetchJson(buildApiUrl(endpoint, '/api/usage/token'), {
        headers: { Authorization: `Bearer ${key}` },
      }).catch(() => null);
      const tokenLogsPromise = fetchJson(buildApiUrl(endpoint, `/api/log/token?key=${encodeURIComponent(key)}`))
        .catch(() => null);
      const topupPromise = fetchJson(buildApiUrl(endpoint, '/api/user/topup/info'), {
        headers: { Authorization: `Bearer ${key}` },
      }).catch(() => null);

      const [statusRaw, tokenUsageRaw, tokenLogsRaw, topupRaw] = await Promise.all([
        statusPromise,
        tokenUsagePromise,
        tokenLogsPromise,
        topupPromise,
      ]);
      const status = parseStatus(statusRaw);
      const remoteToken = parseTokenUsage(tokenUsageRaw);
      const remoteUsageRecords = tokenLogsRaw ? parseTokenLogRecords(tokenLogsRaw) : [];
      const combinedWalletRecords = [
        ...mergeWalletRecords(remoteWallet.records, walletRecords),
        ...remoteUsageRecords,
      ].sort((a, b) => Date.parse(b.paidAt || b.createdAt) - Date.parse(a.paidAt || a.createdAt));
      const combinedWallet = calculateWalletBalance(combinedWalletRecords);
      const token: CanvaslandTokenUsage = remoteToken ?? {
        name: account.label || 'canvasland New API',
        totalGranted: combinedWallet.totalGranted,
        totalUsed: combinedWallet.totalUsed,
        totalAvailable: combinedWallet.totalAvailable,
        unlimitedQuota: false,
      };
      const topup = topupRaw ? parseTopUpInfo(topupRaw) : undefined;
      return {
        success: true,
        configured: true,
        endpoint,
        topUpUrl: topup?.topupLink || topUpUrl,
        token,
        wallet: combinedWallet,
        walletRecords: combinedWalletRecords,
        quotaPerUnit: status.quotaPerUnit,
        quotaDisplayType: status.quotaDisplayType,
        displayBalance: formatPoints(combinedWallet.totalAvailable),
        displayUsed: formatPoints(combinedWallet.totalUsed),
        topup,
        checkedAt: new Date().toISOString(),
      };
    },
    blueOceanConfig: async (): Promise<BlueOceanPayConfigResult> => {
      const config = await getBlueOceanConfig();
      const merchantKey = await getBlueOceanMerchantKey();
      return {
        success: true,
        configured: true,
        hasMerchantKey: Boolean(merchantKey),
        config,
      };
    },
    saveBlueOceanConfig: async (payload: BlueOceanPayConfigPayload): Promise<{ success: true }> => {
      const appid = payload.appid?.trim();
      if (!appid) throw new Error('BlueOceanPay appid is required');
      const apiBaseUrl = normalizeBlueOceanBaseUrl(payload.apiBaseUrl);
      const notifyUrl = normalizeOptionalUrl(payload.notifyUrl) || DEFAULT_BLUEOCEAN_NOTIFY_URL;
      if (!/^https?:\/\//i.test(apiBaseUrl)) throw new Error('BlueOceanPay API base URL must use http or https');
      if (!/^https?:\/\//i.test(notifyUrl)) throw new Error('BlueOceanPay notify URL must use http or https');

      await setBlueOceanConfig({ appid, apiBaseUrl, notifyUrl });
      const merchantKey = payload.merchantKey?.trim();
      if (merchantKey) {
        await setProviderSecret({
          type: 'api_key',
          accountId: BLUEOCEAN_SECRET_ID,
          apiKey: merchantKey,
        });
      }
      return { success: true };
    },
    clearBlueOceanConfig: async (): Promise<{ success: true }> => {
      const store = await getcanvaslandProviderStore();
      store.delete(BLUEOCEAN_CONFIG_KEY);
      await deleteProviderSecret(BLUEOCEAN_SECRET_ID);
      return { success: true };
    },
    createBlueOceanWechatPayment: async (
      payload: BlueOceanPayCreatePaymentPayload,
    ): Promise<BlueOceanPayPaymentResult> => {
      try {
        const configSnapshot = await getBlueOceanConfig();
        const merchantKeySnapshot = await getBlueOceanMerchantKey();
        if (!configSnapshot.appid || !merchantKeySnapshot) {
          const payment = await fetchBlueOceanServerCheckout(payload);
          if (payment.outTradeNo) {
            const amount = Number(payload.amount);
            await savePendingWalletOrder({
              id: payment.outTradeNo,
              outTradeNo: payment.outTradeNo,
              provider: 'blueocean',
              paymentKind: normalizeBlueOceanPaymentMethod(payload.paymentMethod) === 'alipay.qrcode' ? 'alipay' : 'wechat',
              amount: Number.isFinite(amount) ? amount : 0,
              points: Math.round(payload.points || (Number.isFinite(amount) ? amount * 100 : 0)),
            });
          }
          return payment;
        }
        const { config, merchantKey } = await requireBlueOceanCredentials();
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Invalid payment amount');
        }
        const totalFee = Math.round(amount * 100);
        const outTradeNo = generateOutTradeNo();
        const paymentMethod = normalizeBlueOceanPaymentMethod(payload.paymentMethod);
        const requestPayload: Record<string, unknown> = {
          appid: config.appid,
          payment: paymentMethod,
          total_fee: totalFee,
          out_trade_no: outTradeNo,
          body: payload.body?.trim() || 'canvasland wallet top-up',
          attach: payload.points ? `points=${Math.round(payload.points)}` : undefined,
          notify_url: config.notifyUrl,
        };
        requestPayload.sign = signBlueOceanPayload(requestPayload, merchantKey);
        const raw = await fetchBlueOceanJson(config.apiBaseUrl, '/payment/pay', requestPayload);
        const data = unwrapBlueOceanData(raw);
        const qrcode = typeof data.qrcode === 'string' ? data.qrcode : '';
        if (!qrcode) throw new Error('BlueOceanPay response did not include a QR code');
        const resolvedOutTradeNo = typeof data.out_trade_no === 'string' ? data.out_trade_no : outTradeNo;
        await savePendingWalletOrder({
          id: resolvedOutTradeNo,
          outTradeNo: resolvedOutTradeNo,
          provider: 'blueocean',
          paymentKind: paymentMethod === 'alipay.qrcode' ? 'alipay' : 'wechat',
          amount,
          points: Math.round(payload.points || amount * 100),
        });
        return {
          success: true,
          configured: true,
          paymentMethod,
          qrcode,
          qrcodeDataUrl: renderQrPngDataUrl(qrcode),
          outTradeNo: resolvedOutTradeNo,
          sn: typeof data.sn === 'string' ? data.sn : undefined,
          tradeState: typeof data.trade_state === 'string' ? data.trade_state : undefined,
          totalFee: toInt(data.total_fee),
          payAmount: toInt(data.pay_amount),
          provider: typeof data.provider === 'string' ? data.provider : paymentMethod.split('.')[0],
          raw: data,
        };
      } catch (error) {
        return {
          success: false,
          configured: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    queryBlueOceanPayment: async (payload: BlueOceanPayQueryPayload): Promise<BlueOceanPayQueryResult> => {
      try {
        const { config, merchantKey } = await requireBlueOceanCredentials();
        const sn = payload.sn?.trim();
        const outTradeNo = payload.outTradeNo?.trim();
        if (!sn && !outTradeNo) throw new Error('Order number is required');
        const requestPayload: Record<string, unknown> = {
          appid: config.appid,
          sn,
          out_trade_no: outTradeNo,
        };
        requestPayload.sign = signBlueOceanPayload(requestPayload, merchantKey);
        const raw = await fetchBlueOceanJson(config.apiBaseUrl, '/order/query', requestPayload);
        const data = unwrapBlueOceanData(raw);
        const resolvedOutTradeNo = typeof data.out_trade_no === 'string' ? data.out_trade_no : outTradeNo;
        if (isBlueOceanPaidState(data.trade_state)) {
          await markWalletOrderPaid(resolvedOutTradeNo);
        }
        return {
          success: true,
          tradeState: typeof data.trade_state === 'string' ? data.trade_state : undefined,
          outTradeNo: resolvedOutTradeNo,
          sn: typeof data.sn === 'string' ? data.sn : sn,
          raw: data,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    epayConfig: async (): Promise<EpayConfigResult> => {
      const config = await getEpayConfig();
      const merchantKey = await getEpayMerchantKey();
      return {
        success: true,
        configured: true,
        hasMerchantKey: Boolean(merchantKey),
        config,
      };
    },
    saveEpayConfig: async (payload: EpayConfigPayload): Promise<{ success: true }> => {
      const gatewayUrl = normalizeEpayGatewayUrl(payload.gatewayUrl);
      const pid = payload.pid?.trim();
      const notifyUrl = normalizeOptionalUrl(payload.notifyUrl) || DEFAULT_EPAY_NOTIFY_URL;
      const returnUrl = normalizeOptionalUrl(payload.returnUrl) || DEFAULT_PAYMENT_RETURN_URL;
      if (!gatewayUrl) throw new Error('Epay gateway URL is required');
      if (!/^https?:\/\//i.test(gatewayUrl)) throw new Error('Epay gateway URL must use http or https');
      if (!pid) throw new Error('Epay merchant ID is required');
      if (!/^https?:\/\//i.test(notifyUrl)) throw new Error('Epay notify URL must use http or https');
      if (!/^https?:\/\//i.test(returnUrl)) throw new Error('Epay return URL must use http or https');

      await setEpayConfig({
        gatewayUrl,
        pid,
        notifyUrl,
        returnUrl,
        siteName: payload.siteName?.trim() || 'canvasland',
      });
      const merchantKey = payload.merchantKey?.trim();
      if (merchantKey) {
        await setProviderSecret({
          type: 'api_key',
          accountId: EPAY_SECRET_ID,
          apiKey: merchantKey,
        });
      }
      return { success: true };
    },
    clearEpayConfig: async (): Promise<{ success: true }> => {
      const store = await getcanvaslandProviderStore();
      store.delete(EPAY_CONFIG_KEY);
      await deleteProviderSecret(EPAY_SECRET_ID);
      return { success: true };
    },
    createEpayPayment: async (payload: EpayCreatePaymentPayload): Promise<EpayPaymentResult> => {
      try {
        const configSnapshot = await getEpayConfig();
        const merchantKeySnapshot = await getEpayMerchantKey();
        if (!configSnapshot.gatewayUrl || !configSnapshot.pid || !merchantKeySnapshot) {
          const payment = await fetchEpayServerCheckout(payload);
          if (payment.outTradeNo) {
            const amount = Number(payload.amount);
            await savePendingWalletOrder({
              id: payment.outTradeNo,
              outTradeNo: payment.outTradeNo,
              provider: 'epay',
              paymentKind: 'alipay',
              amount: Number.isFinite(amount) ? amount : 0,
              points: Math.round(payload.points || (Number.isFinite(amount) ? amount * 100 : 0)),
            });
          }
          return payment;
        }
        const { config, merchantKey } = await requireEpayCredentials();
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount');
        const paymentMethod = normalizeEpayPaymentMethod(payload.paymentMethod);
        const outTradeNo = generateOutTradeNo();
        const orderName = payload.name?.trim() || `canvasland ${Math.round(payload.points || 0).toLocaleString()} points`;
        const officialPayload: Record<string, unknown> = {
          epayAccount: config.pid,
          version: 'V2.0.0',
          merchantName: config.siteName || 'canvasland',
          merchantOrderNo: outTradeNo,
          amount: amount.toFixed(2),
          paymentCurrency: 'CNY',
          checkOutType: '0',
          currency: 'CNY',
          notifyUrl: config.notifyUrl,
          successUrl: config.returnUrl,
          failUrl: config.returnUrl,
          successUrlMethod: 'GET',
          failUrlMethod: 'GET',
          remark: orderName,
          language: 'CN',
          extendFields: payload.points
            ? {
                paymentMethod,
                points: String(Math.round(payload.points)),
              }
            : undefined,
        };
        const compatiblePayload: Record<string, unknown> = {
          pid: config.pid,
          type: paymentMethod,
          out_trade_no: outTradeNo,
          notify_url: config.notifyUrl,
          return_url: config.returnUrl,
          name: orderName,
          money: amount.toFixed(2),
          clientip: '127.0.0.1',
          device: 'pc',
        };
        let raw: unknown;
        try {
          const officialRaw = await fetchEpayJson(
            config.gatewayUrl,
            '/capi/openapi/gateway/sendTransaction',
            officialPayload,
            merchantKey,
          );
          if (isRecord(officialRaw) && getNumber(officialRaw.code) !== 1) {
            const message = typeof officialRaw.message === 'string'
              ? officialRaw.message
              : typeof officialRaw.msg === 'string'
                ? officialRaw.msg
                : `Epay error ${getNumber(officialRaw.code) ?? 'unknown'}`;
            throw new Error(message);
          }
          raw = officialRaw;
        } catch (officialError) {
          console.warn('[canvasland] EPAY official payment failed, trying compatible mapi:', officialError);
          raw = await fetchEpayCompatibleJson(config.gatewayUrl, 'mapi.php', compatiblePayload, merchantKey);
        }
        const data = unwrapEpayData(raw);
        const { qrcode, payUrl } = resolveEpayQrOrPayUrl(data);
        if (!qrcode) throw new Error('Epay response did not include a QR code or pay URL');
        const resolvedOutTradeNo = typeof data.merchantOrderNo === 'string'
          ? data.merchantOrderNo
          : typeof data.out_trade_no === 'string'
            ? data.out_trade_no
            : outTradeNo;
        await savePendingWalletOrder({
          id: resolvedOutTradeNo,
          outTradeNo: resolvedOutTradeNo,
          provider: 'epay',
          paymentKind: 'alipay',
          amount,
          points: Math.round(payload.points || amount * 100),
        });
        return {
          success: true,
          configured: true,
          paymentMethod,
          qrcode,
          qrcodeDataUrl: renderQrPngDataUrl(qrcode),
          payUrl,
          outTradeNo: resolvedOutTradeNo,
          tradeNo: typeof data.epayOrderNo === 'string'
            ? data.epayOrderNo
            : typeof data.trade_no === 'string'
              ? data.trade_no
              : undefined,
          status: toInt(data.status),
          raw: data,
        };
      } catch (error) {
        return {
          success: false,
          configured: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    queryEpayPayment: async (payload: EpayQueryPayload): Promise<EpayQueryResult> => {
      try {
        const { config, merchantKey } = await requireEpayCredentials();
        if (!payload.outTradeNo?.trim() && !payload.tradeNo?.trim()) throw new Error('Order number is required');
        let raw: unknown;
        try {
          raw = await fetchEpayJson(
            config.gatewayUrl,
            '/capi/openapi/payinApi/queryTransaction',
            {
              epayAccount: config.pid,
              version: 'V2.0.0',
              merchantOrderNo: payload.outTradeNo?.trim(),
              epayOrderNo: payload.tradeNo?.trim() || undefined,
            },
            merchantKey,
          );
        } catch (officialError) {
          console.warn('[canvasland] EPAY official query failed, trying compatible api:', officialError);
          raw = await queryEpayCompatibleOrder(config.gatewayUrl, config.pid, merchantKey, payload);
        }
        const data = unwrapEpayData(raw);
        const status = toInt(data.status);
        const resolvedOutTradeNo = typeof data.merchantOrderNo === 'string'
          ? data.merchantOrderNo
          : typeof data.out_trade_no === 'string'
            ? data.out_trade_no
            : payload.outTradeNo;
        if (isEpayPaidStatus(status)) {
          await markWalletOrderPaid(resolvedOutTradeNo);
        }
        return {
          success: true,
          tradeNo: typeof data.epayOrderNo === 'string'
            ? data.epayOrderNo
            : typeof data.trade_no === 'string'
              ? data.trade_no
              : payload.tradeNo,
          outTradeNo: resolvedOutTradeNo,
          status,
          raw: data,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    creemRates: async (): Promise<CreemRatesResult> => {
      try {
        const rates = await fetchCreemRates();
        return {
          success: true,
          rates,
          checkedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          success: false,
          rates: DEFAULT_CREEM_RATES,
          checkedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    createCreemCheckout: async (payload: CreemCreateCheckoutPayload): Promise<CreemCheckoutResult> => {
      try {
        const amount = Number(payload.amount);
        const currency = normalizeCreemCurrency(payload.currency);
        if (!Number.isFinite(amount) || amount < 1) {
          throw new Error('Creem payment amount must be at least 1.00');
        }
        const raw = await fetchCreemCheckout({ amount, currency });
        const data = unwrapData(raw);
        if (!isRecord(data)) throw new Error('Invalid Creem checkout response');
        const checkoutUrl = typeof data.checkoutUrl === 'string'
          ? data.checkoutUrl
          : typeof data.checkout_url === 'string'
            ? data.checkout_url
            : '';
        if (!checkoutUrl) throw new Error('Creem response did not include checkout URL');
        const outTradeNo = typeof data.outTradeNo === 'string'
          ? data.outTradeNo
          : typeof data.request_id === 'string'
            ? data.request_id
            : generateOutTradeNo();
        const resolvedAmount = getNumber(data.amount) ?? amount;
        const resolvedCurrency = normalizeCreemCurrency(data.currency);
        const cnyRate = getNumber(data.cnyRate) ?? DEFAULT_CREEM_RATES[resolvedCurrency];
        const cnyAmount = getNumber(data.cnyAmount) ?? resolvedAmount * cnyRate;
        const points = Math.max(0, Math.round(getNumber(data.points) ?? cnyAmount * 100));
        await savePendingWalletOrder({
          id: outTradeNo,
          outTradeNo,
          provider: 'creem',
          paymentKind: 'creem',
          amount: resolvedAmount,
          currency: resolvedCurrency,
          cnyRate,
          cnyAmount,
          points,
        });
        return {
          success: true,
          configured: true,
          checkoutUrl,
          checkoutId: typeof data.checkoutId === 'string'
            ? data.checkoutId
            : typeof data.id === 'string'
              ? data.id
              : undefined,
          outTradeNo,
          amount: resolvedAmount,
          currency: resolvedCurrency,
          cnyRate,
          cnyAmount,
          points,
          status: typeof data.status === 'string' ? data.status : undefined,
          raw: data,
        };
      } catch (error) {
        return {
          success: false,
          configured: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
