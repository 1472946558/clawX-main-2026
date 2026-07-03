import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, KeyRound, Loader2, QrCode, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  BlueOceanPayConfigResult,
  BlueOceanPayPaymentMethod,
  BlueOceanPayPaymentResult,
  CanvaslandBalanceResult,
} from '@shared/host-api/contract';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { hostApi } from '@/lib/host-api';
import { toUserMessage } from '@/lib/error-message';

const CANVASLAND_ACCOUNT_ID = 'canvasland-newapi';
const DEFAULT_MODEL_ID = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://feiniu.space';
const DEFAULT_BLUEOCEAN_API_BASE_URL = 'https://api.hk.blueoceanpay.com';
const DEFAULT_QUOTA_PER_UNIT = 500000;
const DEFAULT_RECHARGE_TIERS = [10, 20, 50, 100, 200, 500];

type NewApiConnection = {
  _type?: string;
  key?: string;
  url?: string;
};

function normalizeRootUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function normalizeModelBaseUrl(url: string): string {
  const root = normalizeRootUrl(url);
  return root.endsWith('/v1') ? root : `${root}/v1`;
}

function parseConnectionJson(value: string): NewApiConnection {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid');
  }
  return parsed as NewApiConnection;
}

export function TokenTopUp() {
  const { t } = useTranslation('common');
  const [connectionJson, setConnectionJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [savedRootUrl, setSavedRootUrl] = useState(DEFAULT_BASE_URL);
  const [balance, setBalance] = useState<CanvaslandBalanceResult | null>(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [blueOceanConfig, setBlueOceanConfig] = useState<BlueOceanPayConfigResult | null>(null);
  const [showBlueOceanForm, setShowBlueOceanForm] = useState(false);
  const [blueOceanAppid, setBlueOceanAppid] = useState('');
  const [blueOceanApiBaseUrl, setBlueOceanApiBaseUrl] = useState(DEFAULT_BLUEOCEAN_API_BASE_URL);
  const [blueOceanMerchantKey, setBlueOceanMerchantKey] = useState('');
  const [blueOceanNotifyUrl, setBlueOceanNotifyUrl] = useState('');
  const [savingBlueOcean, setSavingBlueOcean] = useState(false);
  const [clearingBlueOcean, setClearingBlueOcean] = useState(false);
  const [creatingPaymentAmount, setCreatingPaymentAmount] = useState<number | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<BlueOceanPayPaymentMethod>('wechat.qrcode');
  const [qrPayment, setQrPayment] = useState<BlueOceanPayPaymentResult | null>(null);
  const [queryingPayment, setQueryingPayment] = useState(false);

  const parsedConnection = useMemo(() => {
    if (!connectionJson.trim()) return null;
    try {
      return parseConnectionJson(connectionJson);
    } catch {
      return null;
    }
  }, [connectionJson]);

  const effectiveRootUrl = parsedConnection?.url ? normalizeRootUrl(parsedConnection.url) : savedRootUrl;
  const rechargeTiers = useMemo(() => {
    const quotaPerUnit = balance?.quotaPerUnit || DEFAULT_QUOTA_PER_UNIT;
    return DEFAULT_RECHARGE_TIERS.map((amount) => ({
      amount,
      points: Math.round(amount * quotaPerUnit),
    }));
  }, [balance?.quotaPerUnit]);

  const refreshBalance = useCallback(async () => {
    setRefreshingBalance(true);
    try {
      const nextBalance = await hostApi.canvasland.balance();
      setBalance(nextBalance);
      if (nextBalance.endpoint) setSavedRootUrl(nextBalance.endpoint);
      if (!nextBalance.success && nextBalance.error) {
        toast.error(`${t('tokenTopUp.errors.balanceFailed')}: ${nextBalance.error}`);
      }
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.balanceFailed')}: ${toUserMessage(error)}`);
    } finally {
      setRefreshingBalance(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const loadBlueOceanConfig = useCallback(async () => {
    try {
      const config = await hostApi.canvasland.blueOceanConfig();
      setBlueOceanConfig(config);
      setBlueOceanAppid(config.config?.appid || '');
      setBlueOceanApiBaseUrl(config.config?.apiBaseUrl || DEFAULT_BLUEOCEAN_API_BASE_URL);
      setBlueOceanNotifyUrl(config.config?.notifyUrl || '');
      setBlueOceanMerchantKey('');
      setShowBlueOceanForm(!config.configured);
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.blueOceanLoadFailed')}: ${toUserMessage(error)}`);
    }
  }, [t]);

  useEffect(() => {
    void loadBlueOceanConfig();
  }, [loadBlueOceanConfig]);

  const handleSaveConnection = async () => {
    let connection: NewApiConnection;
    try {
      connection = parseConnectionJson(connectionJson);
    } catch {
      toast.error(t('tokenTopUp.errors.invalidJson'));
      return;
    }

    if (connection._type !== 'newapi_channel_conn') {
      toast.error(t('tokenTopUp.errors.invalidType'));
      return;
    }

    const key = typeof connection.key === 'string' ? connection.key.trim() : '';
    const rootUrl = typeof connection.url === 'string' ? normalizeRootUrl(connection.url) : '';
    if (!key) {
      toast.error(t('tokenTopUp.errors.missingKey'));
      return;
    }
    if (!rootUrl) {
      toast.error(t('tokenTopUp.errors.missingUrl'));
      return;
    }
    if (rootUrl !== DEFAULT_BASE_URL) {
      toast.error(t('tokenTopUp.errors.unsupportedEndpoint'));
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = await hostApi.providers.getAccount(CANVASLAND_ACCOUNT_ID);
      const account = {
        id: CANVASLAND_ACCOUNT_ID,
        vendorId: 'custom' as const,
        label: 'canvasland',
        authMode: 'api_key' as const,
        baseUrl: normalizeModelBaseUrl(rootUrl),
        apiProtocol: 'openai-completions' as const,
        model: DEFAULT_MODEL_ID,
        enabled: true,
        isDefault: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (existing) {
        await hostApi.providers.updateAccount(CANVASLAND_ACCOUNT_ID, account, key);
      } else {
        await hostApi.providers.createAccount({ account, apiKey: key });
      }
      await hostApi.providers.setDefaultAccount(CANVASLAND_ACCOUNT_ID);
      setSavedRootUrl(rootUrl);
      setConnectionJson('');
      setShowConnectionForm(false);
      await refreshBalance();
      toast.success(t('tokenTopUp.saved'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.saveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearConnection = async () => {
    setClearing(true);
    try {
      await hostApi.providers.deleteAccountApiKey(CANVASLAND_ACCOUNT_ID);
      setBalance((current) => current ? { ...current, configured: false } : current);
      setShowConnectionForm(true);
      toast.success(t('tokenTopUp.cleared'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.clearFailed')}: ${toUserMessage(error)}`);
    } finally {
      setClearing(false);
    }
  };

  const handleSaveBlueOceanConfig = async () => {
    const appid = blueOceanAppid.trim();
    const apiBaseUrl = blueOceanApiBaseUrl.trim();
    const merchantKey = blueOceanMerchantKey.trim();
    if (!appid) {
      toast.error(t('tokenTopUp.errors.blueOceanMissingAppid'));
      return;
    }
    if (!apiBaseUrl) {
      toast.error(t('tokenTopUp.errors.blueOceanMissingApiBaseUrl'));
      return;
    }
    if (!blueOceanConfig?.hasMerchantKey && !merchantKey) {
      toast.error(t('tokenTopUp.errors.blueOceanMissingMerchantKey'));
      return;
    }

    setSavingBlueOcean(true);
    try {
      await hostApi.canvasland.saveBlueOceanConfig({
        appid,
        apiBaseUrl,
        notifyUrl: blueOceanNotifyUrl.trim() || undefined,
        merchantKey: merchantKey || undefined,
      });
      await loadBlueOceanConfig();
      setShowBlueOceanForm(false);
      toast.success(t('tokenTopUp.blueOceanSaved'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.blueOceanSaveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSavingBlueOcean(false);
    }
  };

  const handleClearBlueOceanConfig = async () => {
    setClearingBlueOcean(true);
    try {
      await hostApi.canvasland.clearBlueOceanConfig();
      setQrPayment(null);
      await loadBlueOceanConfig();
      setShowBlueOceanForm(true);
      toast.success(t('tokenTopUp.blueOceanCleared'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.blueOceanClearFailed')}: ${toUserMessage(error)}`);
    } finally {
      setClearingBlueOcean(false);
    }
  };

  const handleCreateQrPayment = async (tier: { amount: number; points: number }) => {
    setCreatingPaymentAmount(tier.amount);
    try {
      const payment = await hostApi.canvasland.createBlueOceanWechatPayment({
        amount: tier.amount,
        points: tier.points,
        body: `canvasland wallet top-up ${tier.amount}`,
        paymentMethod: selectedPaymentMethod,
      });
      setQrPayment(payment);
      if (payment.success) {
        toast.success(t('tokenTopUp.paymentQrCreated'));
      } else {
        toast.error(`${t('tokenTopUp.errors.blueOceanPaymentFailed')}: ${payment.error || t('tokenTopUp.notAvailable')}`);
      }
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.blueOceanPaymentFailed')}: ${toUserMessage(error)}`);
    } finally {
      setCreatingPaymentAmount(null);
    }
  };

  const handleQueryQrPayment = async () => {
    if (!qrPayment?.sn && !qrPayment?.outTradeNo) return;
    setQueryingPayment(true);
    try {
      const result = await hostApi.canvasland.queryBlueOceanPayment({
        sn: qrPayment.sn,
        outTradeNo: qrPayment.outTradeNo,
      });
      if (result.success) {
        setQrPayment((current) => current ? {
          ...current,
          tradeState: result.tradeState || current.tradeState,
          sn: result.sn || current.sn,
          outTradeNo: result.outTradeNo || current.outTradeNo,
          raw: result.raw || current.raw,
        } : current);
        toast.success(t('tokenTopUp.paymentStatusUpdated'));
      } else {
        toast.error(`${t('tokenTopUp.errors.blueOceanQueryFailed')}: ${result.error || t('tokenTopUp.notAvailable')}`);
      }
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.blueOceanQueryFailed')}: ${toUserMessage(error)}`);
    } finally {
      setQueryingPayment(false);
    }
  };

  return (
    <div data-testid="token-topup-page" className="flex flex-col -m-6 dark:bg-background h-[calc(100vh-2.5rem)] overflow-hidden">
      <div className="w-full max-w-5xl mx-auto flex flex-col h-full p-10 pt-16">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-10 shrink-0 gap-4">
          <div>
            <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-3 font-normal tracking-tight">
              {t('tokenTopUp.title')}
            </h1>
            <p className="text-subtitle text-foreground/70 font-medium">
              {t('tokenTopUp.subtitle')}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] overflow-y-auto pb-10">
          <section className="rounded-2xl border border-black/5 dark:border-white/10 bg-surface-modal p-6">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-serif font-normal tracking-tight">{t('tokenTopUp.connectionTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('tokenTopUp.connectionDesc')}</p>
              </div>
            </div>

            {balance?.configured && !showConnectionForm ? (
              <div className="space-y-5">
                <div data-testid="token-topup-connection-locked" className="rounded-xl bg-surface-input p-4">
                  <p className="text-sm font-semibold text-foreground">{t('tokenTopUp.connectionLocked')}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t('tokenTopUp.connectedDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="token-topup-change-connection" onClick={() => setShowConnectionForm(true)} variant="outline" className="rounded-full px-5">
                    <KeyRound className="h-4 w-4 mr-2" />
                    {t('tokenTopUp.changeConnection')}
                  </Button>
                  <Button data-testid="token-topup-clear" onClick={handleClearConnection} disabled={clearing} variant="outline" className="rounded-full px-5">
                    {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    {t('tokenTopUp.clearConnection')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="newapi-connection">{t('tokenTopUp.connectionJson')}</Label>
                  <Textarea
                    id="newapi-connection"
                    data-testid="token-topup-connection-json"
                    value={connectionJson}
                    onChange={(event) => setConnectionJson(event.target.value)}
                    placeholder={t('tokenTopUp.connectionPlaceholder')}
                    className="min-h-36 rounded-xl bg-surface-input font-mono text-xs"
                  />
                </div>
                <div className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.officialEndpoint')}</p>
                  <p className="mt-2 break-all font-mono text-sm text-foreground">{DEFAULT_BASE_URL}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{t('tokenTopUp.endpointHelp')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="token-topup-save" onClick={handleSaveConnection} disabled={saving || !connectionJson.trim()} className="rounded-full px-5">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    {t('tokenTopUp.saveConnection')}
                  </Button>
                  <Button data-testid="token-topup-clear" onClick={handleClearConnection} disabled={clearing} variant="outline" className="rounded-full px-5">
                    {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    {t('tokenTopUp.clearConnection')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/5 dark:border-white/10 bg-surface-modal p-6">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-700 dark:text-green-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-serif font-normal tracking-tight">{t('tokenTopUp.walletTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('tokenTopUp.walletDesc')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div data-testid="token-topup-balance" className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.availableBalance')}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {balance?.token?.unlimitedQuota
                      ? t('tokenTopUp.unlimited')
                      : balance?.displayBalance || t('tokenTopUp.notAvailable')}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.usedBalance')}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {balance?.displayUsed || t('tokenTopUp.notAvailable')}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-surface-input p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.tokenStatus')}</p>
                  <Badge variant={balance?.configured ? 'success' : 'warning'}>
                    {balance?.configured ? t('tokenTopUp.configured') : t('tokenTopUp.notConfigured')}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <p>{t('tokenTopUp.tokenName')}: <span className="font-mono text-foreground">{balance?.token?.name || '-'}</span></p>
                  <p>{t('tokenTopUp.totalGranted')}: <span className="font-mono text-foreground">{balance?.token?.totalGranted ?? '-'}</span></p>
                  <p>{t('tokenTopUp.checkedAt')}: <span className="font-mono text-foreground">{balance?.checkedAt ? new Date(balance.checkedAt).toLocaleString() : '-'}</span></p>
                </div>
              </div>
              <div className="rounded-xl bg-surface-input p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.currentEndpoint')}</p>
                <p className="mt-2 break-all font-mono text-sm text-foreground">{effectiveRootUrl}</p>
              </div>
              <div data-testid="token-topup-payment-method" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.paymentMethod')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={selectedPaymentMethod === 'wechat.qrcode' ? 'default' : 'outline'}
                    onClick={() => setSelectedPaymentMethod('wechat.qrcode')}
                    className="rounded-lg"
                  >
                    {t('tokenTopUp.wechatPay')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPaymentMethod === 'alipay.qrcode' ? 'default' : 'outline'}
                    onClick={() => setSelectedPaymentMethod('alipay.qrcode')}
                    className="rounded-lg"
                  >
                    {t('tokenTopUp.alipayPay')}
                  </Button>
                </div>
              </div>
              <div data-testid="token-topup-recharge-tiers" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.amountOptions')}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {rechargeTiers.map((tier) => (
                    <div key={tier.amount} className="rounded-lg bg-surface-input px-3 py-3">
                      <p className="text-sm font-semibold text-foreground">${tier.amount}</p>
                      <p className="text-xs text-muted-foreground">
                        {tier.points.toLocaleString()} {t('tokenTopUp.points')}
                      </p>
                      <Button
                        data-testid={`token-topup-payment-qr-${tier.amount}`}
                        onClick={() => handleCreateQrPayment(tier)}
                        disabled={!blueOceanConfig?.configured || creatingPaymentAmount !== null}
                        size="sm"
                        className="mt-3 w-full rounded-lg"
                      >
                        {creatingPaymentAmount === tier.amount ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <QrCode className="h-4 w-4 mr-2" />
                        )}
                        {t('tokenTopUp.createPaymentQr')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div data-testid="token-topup-blueocean-config" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.blueOceanTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('tokenTopUp.blueOceanDesc')}</p>
                  </div>
                  <Badge variant={blueOceanConfig?.configured ? 'success' : 'warning'}>
                    {blueOceanConfig?.configured ? t('tokenTopUp.configured') : t('tokenTopUp.notConfigured')}
                  </Badge>
                </div>
                {!showBlueOceanForm && blueOceanConfig?.configured ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => setShowBlueOceanForm(true)} variant="outline" size="sm" className="rounded-full">
                      <Settings2 className="h-4 w-4 mr-2" />
                      {t('tokenTopUp.changeBlueOcean')}
                    </Button>
                    <Button onClick={handleClearBlueOceanConfig} disabled={clearingBlueOcean} variant="outline" size="sm" className="rounded-full">
                      {clearingBlueOcean ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      {t('tokenTopUp.clearBlueOcean')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="blueocean-appid">{t('tokenTopUp.blueOceanAppid')}</Label>
                      <Input
                        id="blueocean-appid"
                        value={blueOceanAppid}
                        onChange={(event) => setBlueOceanAppid(event.target.value)}
                        className="rounded-xl bg-surface-input"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="blueocean-api-base-url">{t('tokenTopUp.blueOceanApiBaseUrl')}</Label>
                      <Input
                        id="blueocean-api-base-url"
                        value={blueOceanApiBaseUrl}
                        onChange={(event) => setBlueOceanApiBaseUrl(event.target.value)}
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="blueocean-merchant-key">{t('tokenTopUp.blueOceanMerchantKey')}</Label>
                      <Input
                        id="blueocean-merchant-key"
                        type="password"
                        value={blueOceanMerchantKey}
                        onChange={(event) => setBlueOceanMerchantKey(event.target.value)}
                        placeholder={blueOceanConfig?.hasMerchantKey ? t('tokenTopUp.blueOceanMerchantKeyPlaceholderSaved') : ''}
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="blueocean-notify-url">{t('tokenTopUp.blueOceanNotifyUrl')}</Label>
                      <Input
                        id="blueocean-notify-url"
                        value={blueOceanNotifyUrl}
                        onChange={(event) => setBlueOceanNotifyUrl(event.target.value)}
                        placeholder="https://example.com/payments/blueocean/notify"
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">{t('tokenTopUp.blueOceanNotifyHelp')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSaveBlueOceanConfig} disabled={savingBlueOcean} size="sm" className="rounded-full">
                        {savingBlueOcean ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        {t('tokenTopUp.saveBlueOcean')}
                      </Button>
                      <Button onClick={handleClearBlueOceanConfig} disabled={clearingBlueOcean} variant="outline" size="sm" className="rounded-full">
                        {clearingBlueOcean ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        {t('tokenTopUp.clearBlueOcean')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {qrPayment?.qrcodeDataUrl && (
                <div data-testid="token-topup-payment-qr" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {qrPayment.paymentMethod === 'alipay.qrcode'
                          ? t('tokenTopUp.alipayQrTitle')
                          : t('tokenTopUp.wechatQrTitle')}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{t('tokenTopUp.scanToPay')}</p>
                    </div>
                    <Button onClick={handleQueryQrPayment} disabled={queryingPayment} variant="outline" size="sm" className="rounded-full">
                      {queryingPayment ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      {t('tokenTopUp.queryPayment')}
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-col sm:flex-row gap-4">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <img src={qrPayment.qrcodeDataUrl} alt={t('tokenTopUp.paymentQrTitle')} className="h-44 w-44" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl bg-surface-input p-4 text-sm">
                      <p className="text-muted-foreground">{t('tokenTopUp.paymentOrder')}</p>
                      <p className="mt-1 break-all font-mono text-foreground">{qrPayment.outTradeNo || qrPayment.sn || '-'}</p>
                      <p className="mt-4 text-muted-foreground">{t('tokenTopUp.paymentStatus')}</p>
                      <p className="mt-1 font-mono text-foreground">{qrPayment.tradeState || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
              <div data-testid="token-topup-usage-records" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.usageRecords')}</p>
                <div className="mt-3 rounded-lg bg-surface-input px-3 py-5 text-center text-sm text-muted-foreground">
                  {t('tokenTopUp.usageRecordsPending')}
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-black/10 dark:border-white/10 p-4 text-sm text-muted-foreground">
                {t('tokenTopUp.balanceNote')}
              </div>
              {balance?.error && (
                <div className="rounded-xl bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-600 dark:text-red-400">
                  {balance.error}
                </div>
              )}
              <Button data-testid="token-topup-refresh-balance" onClick={refreshBalance} disabled={refreshingBalance} variant="outline" className="w-full rounded-xl h-11 justify-center">
                {refreshingBalance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {t('tokenTopUp.refreshBalance')}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
