import type {
  CanvaslandBalanceResult,
  CanvaslandTopUpInfo,
  CanvaslandTopUpMethod,
  CanvaslandTokenUsage,
} from '@shared/host-api/contract';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { proxyAwareFetch } from '../utils/proxy-fetch';
import { getProviderService } from './providers/provider-service';
import { isRecord } from './payload-utils';

const CANVASLAND_ACCOUNT_ID = 'canvasland-newapi';
const DEFAULT_ROOT_URL = 'https://feiniu.space';
const DEFAULT_QUOTA_PER_UNIT = 500000;

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
  };
}
