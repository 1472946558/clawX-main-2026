import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxyAwareFetchMock = vi.fn();
const storeData = new Map<string, unknown>();

vi.mock('@electron/utils/proxy-fetch', () => ({
  proxyAwareFetch: (...args: unknown[]) => proxyAwareFetchMock(...args),
}));

vi.mock('@electron/services/providers/store-instance', () => ({
  getcanvaslandProviderStore: async () => ({
    get: (key: string) => storeData.get(key),
    set: (key: string, value: unknown) => storeData.set(key, value),
    delete: (key: string) => storeData.delete(key),
  }),
}));

vi.mock('@electron/services/secrets/secret-store', () => ({
  getProviderSecret: async (accountId: string) => (
    accountId === 'canvasland-epay'
      ? { type: 'api_key', apiKey: 'epay-secret' }
      : accountId === 'canvasland-blueoceanpay'
        ? { type: 'api_key', apiKey: 'blueocean-secret' }
        : null
  ),
  setProviderSecret: vi.fn(),
  deleteProviderSecret: vi.fn(),
}));

vi.mock('@electron/utils/qr-png', () => ({
  renderQrPngDataUrl: (value: string) => `data:image/png;base64,${Buffer.from(value).toString('base64')}`,
}));

vi.mock('@electron/services/providers/provider-service', () => ({
  getProviderService: () => ({
    getAccount: vi.fn(),
    getAccountApiKey: vi.fn(),
  }),
}));

function mockJsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function toEpaySignValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined && record[key] !== null && record[key] !== '')
      .sort()
      .map((key) => `${key}=${toEpaySignValue(record[key])}`)
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

describe('canvasland EPAY payments', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storeData.clear();
    storeData.set('epay', {
      gatewayUrl: 'https://mzf.mapay.cc/xpay/epay/',
      pid: 'merchant-1001',
      notifyUrl: 'https://example.com/notify',
      returnUrl: 'https://example.com/return',
      siteName: 'canvasland',
    });
    proxyAwareFetchMock.mockResolvedValue(mockJsonResponse({
      code: 1,
      data: {
        epayUrl: 'https://pay.example.com/checkout/123',
        merchantOrderNo: 'CL20260711000000ABCD',
        epayOrderNo: 'EPAY123',
        status: 0,
      },
    }));
  });

  it('creates Alipay orders through the official EPAY JSON gateway first', async () => {
    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const result = await createCanvaslandApi().createEpayPayment({
      amount: 5,
      points: 500,
      paymentMethod: 'alipay',
      name: 'canvasland 500 points',
    });

    expect(result.success).toBe(true);
    expect(proxyAwareFetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = proxyAwareFetchMock.mock.calls[0];
    expect(url).toBe('https://mzf.mapay.cc/xpay/epay/capi/openapi/gateway/sendTransaction');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toContain('application/json');

    const body = JSON.parse(init.body);
    expect(body.param).toMatchObject({
      epayAccount: 'merchant-1001',
      version: 'V2.0.0',
      amount: '5.00',
      paymentCurrency: 'CNY',
      notifyUrl: 'https://example.com/notify',
      successUrl: 'https://example.com/return',
    });
    expect(body.sign).toBe(signEpayParam(body.param, 'epay-secret'));
  });

  it('falls back to compatible mapi when the official EPAY request fails at transport level', async () => {
    proxyAwareFetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(mockJsonResponse({
        code: 1,
        payurl: 'https://pay.example.com/mapi/123',
        out_trade_no: 'CL20260711000000DCBA',
        trade_no: 'TRADE123',
        status: 0,
      }));

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const result = await createCanvaslandApi().createEpayPayment({
      amount: 10,
      points: 1000,
      paymentMethod: 'alipay',
    });

    expect(result.success).toBe(true);
    expect(proxyAwareFetchMock).toHaveBeenCalledTimes(2);
    expect(proxyAwareFetchMock.mock.calls[1][0]).toBe('https://mzf.mapay.cc/xpay/epay/mapi.php');
  });

  it('falls back to compatible mapi when the official EPAY response returns a business error', async () => {
    proxyAwareFetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        code: 404,
        message: 'Not Found',
        data: {},
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        code: 1,
        payurl: 'https://pay.example.com/mapi/business-fallback',
        out_trade_no: 'CL20260711000000BEEF',
        trade_no: 'TRADE404',
        status: 0,
      }));

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const result = await createCanvaslandApi().createEpayPayment({
      amount: 0.1,
      points: 10,
      paymentMethod: 'alipay',
    });

    expect(result.success).toBe(true);
    expect(proxyAwareFetchMock).toHaveBeenCalledTimes(2);
    expect(proxyAwareFetchMock.mock.calls[1][0]).toBe('https://mzf.mapay.cc/xpay/epay/mapi.php');
  });


  it('uses the deployed EPAY notify URL when older saved config has no callback URL', async () => {
    storeData.set('epay', {
      gatewayUrl: 'https://mzf.mapay.cc/xpay/epay/',
      pid: 'merchant-1001',
      siteName: 'canvasland',
    });

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const result = await createCanvaslandApi().createEpayPayment({
      amount: 5,
      points: 500,
      paymentMethod: 'alipay',
    });

    expect(result.success).toBe(true);
    const body = JSON.parse(proxyAwareFetchMock.mock.calls[0][1].body);
    expect(body.param.notifyUrl).toBe('https://apitoken.unihuax.com/payments/epay/notify');
    expect(body.param.successUrl).toBe('https://feiniu-ai.cn');
    expect(body.param.failUrl).toBe('https://feiniu-ai.cn');
  });

  it('uses the deployed BlueOceanPay notify URL when saved config has no callback URL', async () => {
    storeData.set('blueOceanPay', {
      appid: 'blueocean-appid',
      apiBaseUrl: 'https://api.hk.blueoceanpay.com',
    });
    proxyAwareFetchMock.mockResolvedValueOnce(mockJsonResponse({
      code: 200,
      data: {
        qrcode: 'weixin://wxpay/example',
        out_trade_no: 'CL20260711000000BO',
        trade_state: 'NOTPAY',
      },
    }));

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const result = await createCanvaslandApi().createBlueOceanWechatPayment({
      amount: 5,
      points: 500,
      paymentMethod: 'wechat.qrcode',
    });

    expect(result.success).toBe(true);
    const requestPayload = JSON.parse(proxyAwareFetchMock.mock.calls[0][1].body);
    expect(requestPayload.notify_url).toBe('https://apitoken.unihuax.com/payments/blueocean/notify');
  });

  it('uses the deployed EPAY checkout service when local EPAY merchant config is missing', async () => {
    storeData.delete('epay');
    proxyAwareFetchMock.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      qrcode: 'https://pay.example.com/server-epay',
      outTradeNo: 'CLSERVERPAY',
      paymentMethod: 'alipay',
    }));

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const config = await createCanvaslandApi().epayConfig();
    expect(config.configured).toBe(true);

    const result = await createCanvaslandApi().createEpayPayment({
      amount: 0.1,
      points: 10,
      paymentMethod: 'alipay',
    });

    expect(result.success).toBe(true);
    expect(result.qrcode).toBe('https://pay.example.com/server-epay');
    expect(proxyAwareFetchMock.mock.calls[0][0]).toBe('https://apitoken.unihuax.com/payments/epay/checkout');
  });

  it('uses the deployed BlueOceanPay checkout service when local WeChat merchant config is missing', async () => {
    storeData.delete('blueOceanPay');
    proxyAwareFetchMock.mockResolvedValueOnce(mockJsonResponse({
      success: true,
      qrcode: 'weixin://wxpay/server',
      outTradeNo: 'CLSERVERWX',
      paymentMethod: 'wechat.qrcode',
    }));

    const { createCanvaslandApi } = await import('@electron/services/canvasland-api');

    const config = await createCanvaslandApi().blueOceanConfig();
    expect(config.configured).toBe(true);

    const result = await createCanvaslandApi().createBlueOceanWechatPayment({
      amount: 0.1,
      points: 10,
      paymentMethod: 'wechat.qrcode',
    });

    expect(result.success).toBe(true);
    expect(result.qrcode).toBe('weixin://wxpay/server');
    expect(proxyAwareFetchMock.mock.calls[0][0]).toBe('https://apitoken.unihuax.com/payments/blueocean/checkout');
  });
});
