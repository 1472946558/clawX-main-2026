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
  CanvaslandTopUpInfo,
  CanvaslandTopUpMethod,
  CanvaslandTokenUsage,
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
const DEFAULT_ROOT_URL = 'https://feiniu.space';
const DEFAULT_BLUEOCEAN_API_BASE_URL = 'https://api.hk.blueoceanpay.com';
const DEFAULT_QUOTA_PER_UNIT = 500000;
const BLUEOCEAN_QR_PAYMENT_METHODS = new Set<BlueOceanPayPaymentMethod>([
  'wechat.qrcode',
  'alipay.qrcode',
]);

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
  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    totalGranted: getNumber(data.total_granted),
    totalUsed: getNumber(data.total_used),
    totalAvailable: getNumber(data.total_available),
    unlimitedQuota: getBoolean(data.unlimited_quota),
    expiresAt: getNumber(data.expires_at),
  };
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

function formatQuota(
  quota: number | undefined,
  status: ReturnType<typeof parseStatus>,
): string | undefined {
  if (typeof quota !== 'number') return undefined;
  if (status.quotaDisplayType === 'TOKENS') {
    return `${Math.round(quota).toLocaleString()} quota`;
  }
  const usd = quota / status.quotaPerUnit;
  if (status.quotaDisplayType === 'CNY') {
    return `¥${(usd * 7).toFixed(2)}`;
  }
  if (status.quotaDisplayType === 'CUSTOM') {
    const symbol = status.customCurrencySymbol || '$';
    const rate = status.customCurrencyExchangeRate || 1;
    return `${symbol}${(usd * rate).toFixed(2)}`;
  }
  return `$${usd.toFixed(2)}`;
}

function normalizeBlueOceanBaseUrl(url: string | undefined): string {
  const trimmed = url?.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_BLUEOCEAN_API_BASE_URL;
}

function normalizeOptionalUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed || undefined;
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

async function getBlueOceanConfig(): Promise<BlueOceanPayConfig> {
  const store = await getcanvaslandProviderStore();
  const value = store.get(BLUEOCEAN_CONFIG_KEY) as BlueOceanPayConfig | undefined;
  if (!value || typeof value !== 'object') {
    return { apiBaseUrl: DEFAULT_BLUEOCEAN_API_BASE_URL };
  }
  return {
    appid: typeof value.appid === 'string' ? value.appid : undefined,
    apiBaseUrl: normalizeBlueOceanBaseUrl(value.apiBaseUrl),
    notifyUrl: typeof value.notifyUrl === 'string' ? value.notifyUrl : undefined,
  };
}

async function setBlueOceanConfig(config: BlueOceanPayConfig): Promise<void> {
  const store = await getcanvaslandProviderStore();
  store.set(BLUEOCEAN_CONFIG_KEY, {
    appid: config.appid?.trim() || '',
    apiBaseUrl: normalizeBlueOceanBaseUrl(config.apiBaseUrl),
    notifyUrl: normalizeOptionalUrl(config.notifyUrl) || '',
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

export function createCanvaslandApi(): CompleteHostServiceRegistry['canvasland'] {
  return {
    balance: async (): Promise<CanvaslandBalanceResult> => {
      const providerService = getProviderService();
      const account = await providerService.getAccount(CANVASLAND_ACCOUNT_ID);
      const key = await providerService.getAccountApiKey(CANVASLAND_ACCOUNT_ID);
      const endpoint = normalizeRootUrl(account?.baseUrl || DEFAULT_ROOT_URL);
      const topUpUrl = `${endpoint}/console/topup`;

      if (!account || !key) {
        return {
          success: true,
          configured: false,
          endpoint,
          topUpUrl,
          error: 'canvasland connection is not configured',
        };
      }

      const statusPromise = fetchJson(buildApiUrl(endpoint, '/api/status')).catch(() => ({}));
      const tokenUsagePromise = fetchJson(buildApiUrl(endpoint, '/api/token/usage'), {
        headers: { Authorization: `Bearer ${key}` },
      });
      const topupPromise = fetchJson(buildApiUrl(endpoint, '/api/user/topup/info'), {
        headers: { Authorization: `Bearer ${key}` },
      }).catch(() => null);

      try {
        const [statusRaw, tokenUsageRaw, topupRaw] = await Promise.all([
          statusPromise,
          tokenUsagePromise,
          topupPromise,
        ]);
        const status = parseStatus(statusRaw);
        const token = parseTokenUsage(tokenUsageRaw);
        const topup = topupRaw ? parseTopUpInfo(topupRaw) : undefined;
        return {
          success: true,
          configured: true,
          endpoint,
          topUpUrl: topup?.topupLink || topUpUrl,
          token,
          quotaPerUnit: status.quotaPerUnit,
          quotaDisplayType: status.quotaDisplayType,
          displayBalance: token?.unlimitedQuota ? undefined : formatQuota(token?.totalAvailable, status),
          displayUsed: formatQuota(token?.totalUsed, status),
          topup,
          checkedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          success: false,
          configured: true,
          endpoint,
          topUpUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    blueOceanConfig: async (): Promise<BlueOceanPayConfigResult> => {
      const config = await getBlueOceanConfig();
      const merchantKey = await getBlueOceanMerchantKey();
      return {
        success: true,
        configured: Boolean(config.appid && merchantKey),
        hasMerchantKey: Boolean(merchantKey),
        config,
      };
    },
    saveBlueOceanConfig: async (payload: BlueOceanPayConfigPayload): Promise<{ success: true }> => {
      const appid = payload.appid?.trim();
      if (!appid) throw new Error('BlueOceanPay appid is required');
      const apiBaseUrl = normalizeBlueOceanBaseUrl(payload.apiBaseUrl);
      const notifyUrl = normalizeOptionalUrl(payload.notifyUrl);
      if (!/^https?:\/\//i.test(apiBaseUrl)) throw new Error('BlueOceanPay API base URL must use http or https');
      if (notifyUrl && !/^https?:\/\//i.test(notifyUrl)) throw new Error('BlueOceanPay notify URL must use http or https');

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
        return {
          success: true,
          configured: true,
          paymentMethod,
          qrcode,
          qrcodeDataUrl: renderQrPngDataUrl(qrcode),
          outTradeNo: typeof data.out_trade_no === 'string' ? data.out_trade_no : outTradeNo,
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
          configured: (await getBlueOceanConfig()).appid ? Boolean(await getBlueOceanMerchantKey()) : false,
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
        return {
          success: true,
          tradeState: typeof data.trade_state === 'string' ? data.trade_state : undefined,
          outTradeNo: typeof data.out_trade_no === 'string' ? data.out_trade_no : outTradeNo,
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
  };
}
