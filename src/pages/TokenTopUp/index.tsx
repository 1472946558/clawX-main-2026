import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, KeyRound, Loader2, QrCode, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  BlueOceanPayConfigResult,
  BlueOceanPayPaymentResult,
  CanvaslandBalanceResult,
  EpayConfigResult,
  EpayPaymentResult,
} from '@shared/host-api/contract';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { hostApi } from '@/lib/host-api';
import { toUserMessage } from '@/lib/error-message';

const CANVASLAND_ACCOUNT_ID = 'canvasland-newapi';
const DEFAULT_MODEL_ID = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://feiniu.space';
const DEFAULT_BLUEOCEAN_API_BASE_URL = 'https://api.hk.blueoceanpay.com';
const DEFAULT_EPAY_GATEWAY_URL = 'https://mzf.mapay.cc/xpay/epay';
const DEFAULT_EPAY_PID = '11222';
const POINTS_PER_CNY = 100;
const TEST_MIN_RECHARGE_AMOUNT = 0.01;
const DEFAULT_RECHARGE_TIERS = [
  { amount: 5, points: 5 * POINTS_PER_CNY },
  { amount: 10, points: 10 * POINTS_PER_CNY },
  { amount: 20, points: 20 * POINTS_PER_CNY },
  { amount: 50, points: 50 * POINTS_PER_CNY },
  { amount: 100, points: 100 * POINTS_PER_CNY },
  { amount: 200, points: 200 * POINTS_PER_CNY },
  { amount: 500, points: 500 * POINTS_PER_CNY },
];

type NewApiConnection = {
  _type?: string;
  key?: string;
  url?: string;
};
type PaymentProvider = 'blueocean' | 'epay';
type PaymentKind = 'wechat' | 'alipay';
type RechargeTier = {
  amount: number;
  points: number;
};
type QrPaymentState = {
  success: boolean;
  provider: PaymentProvider;
  paymentKind: PaymentKind;
  qrcodeDataUrl?: string;
  outTradeNo?: string;
  tradeNo?: string;
  sn?: string;
  status?: number;
  tradeState?: string;
  error?: string;
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

function pointsForAmount(amount: number): number {
  return Math.round(amount * POINTS_PER_CNY);
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
  const [epayConfig, setEpayConfig] = useState<EpayConfigResult | null>(null);
  const [showEpayForm, setShowEpayForm] = useState(false);
  const [epayGatewayUrl, setEpayGatewayUrl] = useState(DEFAULT_EPAY_GATEWAY_URL);
  const [epayPid, setEpayPid] = useState(DEFAULT_EPAY_PID);
  const [epayMerchantKey, setEpayMerchantKey] = useState('');
  const [epayNotifyUrl, setEpayNotifyUrl] = useState('');
  const [epayReturnUrl, setEpayReturnUrl] = useState('');
  const [epaySiteName, setEpaySiteName] = useState('canvasland');
  const [savingEpay, setSavingEpay] = useState(false);
  const [clearingEpay, setClearingEpay] = useState(false);
  const [creatingPaymentKey, setCreatingPaymentKey] = useState<string | null>(null);
  const [selectedPaymentKind, setSelectedPaymentKind] = useState<PaymentKind>('wechat');
  const [selectedRechargeKey, setSelectedRechargeKey] = useState('fixed-5');
  const [qrPayment, setQrPayment] = useState<QrPaymentState | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [queryingPayment, setQueryingPayment] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

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
    return DEFAULT_RECHARGE_TIERS;
  }, []);
  const customTier = useMemo<RechargeTier | null>(() => {
    const amount = Number(customAmount);
    if (!customAmount.trim() || !Number.isFinite(amount) || amount <= 0) return null;
    return {
      amount,
      points: pointsForAmount(amount),
    };
  }, [customAmount]);
  const selectedRechargeTier = useMemo<RechargeTier | null>(() => {
    if (selectedRechargeKey === 'custom') return customTier;
    const amount = Number(selectedRechargeKey.replace('fixed-', ''));
    return rechargeTiers.find((tier) => tier.amount === amount) || rechargeTiers[0] || null;
  }, [customTier, rechargeTiers, selectedRechargeKey]);
  const selectedPaymentConfigured = selectedPaymentKind === 'wechat'
    ? Boolean(blueOceanConfig?.configured)
    : Boolean(epayConfig?.configured);
  const walletBalance = balance?.wallet ?? {
    totalGranted: 0,
    totalUsed: 0,
    totalAvailable: 0,
  };
  const walletRecords = balance?.walletRecords ?? [];

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

  const loadEpayConfig = useCallback(async () => {
    try {
      const config = await hostApi.canvasland.epayConfig();
      setEpayConfig(config);
      setEpayGatewayUrl(config.config?.gatewayUrl || DEFAULT_EPAY_GATEWAY_URL);
      setEpayPid(config.config?.pid || DEFAULT_EPAY_PID);
      setEpayNotifyUrl(config.config?.notifyUrl || '');
      setEpayReturnUrl(config.config?.returnUrl || '');
      setEpaySiteName(config.config?.siteName || 'canvasland');
      setEpayMerchantKey('');
      setShowEpayForm(!config.configured);
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.epayLoadFailed')}: ${toUserMessage(error)}`);
    }
  }, [t]);

  useEffect(() => {
    void loadBlueOceanConfig();
    void loadEpayConfig();
  }, [loadBlueOceanConfig, loadEpayConfig]);

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

  const handleSaveEpayConfig = async () => {
    const gatewayUrl = epayGatewayUrl.trim();
    const pid = epayPid.trim();
    const merchantKey = epayMerchantKey.trim();
    const notifyUrl = epayNotifyUrl.trim();
    const returnUrl = epayReturnUrl.trim();
    if (!gatewayUrl) {
      toast.error(t('tokenTopUp.errors.epayMissingGatewayUrl'));
      return;
    }
    if (!pid) {
      toast.error(t('tokenTopUp.errors.epayMissingPid'));
      return;
    }
    if (!epayConfig?.hasMerchantKey && !merchantKey) {
      toast.error(t('tokenTopUp.errors.epayMissingMerchantKey'));
      return;
    }
    if (!notifyUrl) {
      toast.error(t('tokenTopUp.errors.epayMissingNotifyUrl'));
      return;
    }
    if (!returnUrl) {
      toast.error(t('tokenTopUp.errors.epayMissingReturnUrl'));
      return;
    }

    setSavingEpay(true);
    try {
      await hostApi.canvasland.saveEpayConfig({
        gatewayUrl,
        pid,
        notifyUrl,
        returnUrl,
        siteName: epaySiteName.trim() || 'canvasland',
        merchantKey: merchantKey || undefined,
      });
      await loadEpayConfig();
      setShowEpayForm(false);
      toast.success(t('tokenTopUp.epaySaved'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.epaySaveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSavingEpay(false);
    }
  };

  const handleClearEpayConfig = async () => {
    setClearingEpay(true);
    try {
      await hostApi.canvasland.clearEpayConfig();
      setQrPayment(null);
      await loadEpayConfig();
      setShowEpayForm(true);
      toast.success(t('tokenTopUp.epayCleared'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.epayClearFailed')}: ${toUserMessage(error)}`);
    } finally {
      setClearingEpay(false);
    }
  };

  const handleCreateQrPayment = async (tier: RechargeTier, paymentKey: string) => {
    if (!Number.isFinite(tier.amount) || tier.amount < TEST_MIN_RECHARGE_AMOUNT || tier.points < 1) {
      toast.error(t('tokenTopUp.errors.customAmountInvalid'));
      return;
    }
    setCreatingPaymentKey(paymentKey);
    try {
      let payment: QrPaymentState;
      if (selectedPaymentKind === 'wechat') {
        const result: BlueOceanPayPaymentResult = await hostApi.canvasland.createBlueOceanWechatPayment({
          amount: tier.amount,
          points: tier.points,
          body: `canvasland ${tier.points.toLocaleString()} ${t('tokenTopUp.points')}`,
          paymentMethod: 'wechat.qrcode',
        });
        payment = {
          success: result.success,
          provider: 'blueocean',
          paymentKind: 'wechat',
          qrcodeDataUrl: result.qrcodeDataUrl,
          outTradeNo: result.outTradeNo,
          sn: result.sn,
          tradeState: result.tradeState,
          error: result.error,
        };
      } else {
        const result: EpayPaymentResult = await hostApi.canvasland.createEpayPayment({
          amount: tier.amount,
          points: tier.points,
          name: `canvasland ${tier.points.toLocaleString()} ${t('tokenTopUp.points')}`,
          paymentMethod: 'alipay',
        });
        payment = {
          success: result.success,
          provider: 'epay',
          paymentKind: 'alipay',
          qrcodeDataUrl: result.qrcodeDataUrl,
          outTradeNo: result.outTradeNo,
          tradeNo: result.tradeNo,
          status: result.status,
          error: result.error,
        };
      }
      setQrPayment(payment);
      if (payment.success) {
        setShowQrDialog(true);
        toast.success(t('tokenTopUp.paymentQrCreated'));
      } else {
        toast.error(`${t('tokenTopUp.errors.paymentFailed')}: ${payment.error || t('tokenTopUp.notAvailable')}`);
      }
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.paymentFailed')}: ${toUserMessage(error)}`);
    } finally {
      setCreatingPaymentKey(null);
    }
  };

  const handleCreateSelectedQrPayment = async () => {
    if (!selectedRechargeTier) {
      toast.error(t('tokenTopUp.errors.customAmountInvalid'));
      return;
    }
    await handleCreateQrPayment(selectedRechargeTier, selectedRechargeKey);
  };

  const handleQueryQrPayment = async () => {
    if (!qrPayment?.tradeNo && !qrPayment?.sn && !qrPayment?.outTradeNo) return;
    setQueryingPayment(true);
    try {
      if (qrPayment.provider === 'blueocean') {
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
          } : current);
          await refreshBalance();
          toast.success(t('tokenTopUp.paymentStatusUpdated'));
        } else {
          toast.error(`${t('tokenTopUp.errors.queryFailed')}: ${result.error || t('tokenTopUp.notAvailable')}`);
        }
      } else {
        const result = await hostApi.canvasland.queryEpayPayment({
          tradeNo: qrPayment.tradeNo,
          outTradeNo: qrPayment.outTradeNo,
        });
        if (result.success) {
          setQrPayment((current) => current ? {
            ...current,
            status: result.status ?? current.status,
            tradeNo: result.tradeNo || current.tradeNo,
            outTradeNo: result.outTradeNo || current.outTradeNo,
          } : current);
          await refreshBalance();
          toast.success(t('tokenTopUp.paymentStatusUpdated'));
        } else {
          toast.error(`${t('tokenTopUp.errors.queryFailed')}: ${result.error || t('tokenTopUp.notAvailable')}`);
        }
      }
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.queryFailed')}: ${toUserMessage(error)}`);
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

        <div className="overflow-y-auto pb-10 space-y-6">
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
              <div className="grid gap-3 md:grid-cols-3">
                <div data-testid="token-topup-recharge-balance" className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.rechargeBalance')}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {walletBalance.totalGranted.toLocaleString()} {t('tokenTopUp.points')}
                  </p>
                </div>
                <div data-testid="token-topup-balance" className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.availableBalance')}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {balance?.token?.unlimitedQuota
                      ? t('tokenTopUp.unlimited')
                      : `${walletBalance.totalAvailable.toLocaleString()} ${t('tokenTopUp.points')}`}
                  </p>
                </div>
                <div data-testid="token-topup-used-balance" className="rounded-xl bg-surface-input p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.usedBalance')}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {walletBalance.totalUsed.toLocaleString()} {t('tokenTopUp.points')}
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
                  <p>{t('tokenTopUp.tokenName')}: <span className="font-mono text-foreground">{balance?.token?.name || 'canvasland New API'}</span></p>
                  <p>{t('tokenTopUp.totalGranted')}: <span className="font-mono text-foreground">{(balance?.token?.totalGranted ?? walletBalance.totalGranted).toLocaleString()} {t('tokenTopUp.points')}</span></p>
                  <p>{t('tokenTopUp.checkedAt')}: <span className="font-mono text-foreground">{balance?.checkedAt ? new Date(balance.checkedAt).toLocaleString() : '-'}</span></p>
                </div>
              </div>
              <div className="rounded-xl bg-surface-input p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.currentEndpoint')}</p>
                <p className="mt-2 break-all font-mono text-sm text-foreground">{effectiveRootUrl}</p>
              </div>
              <div data-testid="token-topup-recharge-tiers" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.amountOptions')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('tokenTopUp.pointsRate')}</p>
                  </div>
                  <Badge variant="secondary">{t('tokenTopUp.selectedAmount')}: ¥{selectedRechargeTier?.amount ?? '-'}</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {rechargeTiers.map((tier) => {
                    const key = `fixed-${tier.amount}`;
                    const selected = selectedRechargeKey === key;
                    return (
                      <button
                        key={tier.amount}
                        type="button"
                        data-testid={`token-topup-tier-${tier.amount}`}
                        onClick={() => setSelectedRechargeKey(key)}
                        className={`rounded-lg border px-3 py-3 text-left transition ${
                          selected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-black/5 bg-surface-input hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10'
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">¥{tier.amount}</p>
                        <p data-testid={`token-topup-tier-points-${tier.amount}`} className="text-xs text-muted-foreground">
                          {tier.points.toLocaleString()} {t('tokenTopUp.points')}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <div className={`mt-3 rounded-lg border px-3 py-3 ${
                  selectedRechargeKey === 'custom'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-black/5 bg-surface-input dark:border-white/10'
                }`}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="grid gap-2">
                      <Label htmlFor="token-topup-custom-amount">{t('tokenTopUp.customAmount')}</Label>
                      <Input
                        id="token-topup-custom-amount"
                        data-testid="token-topup-custom-amount"
                        type="number"
                        min={TEST_MIN_RECHARGE_AMOUNT}
                        step="0.01"
                        value={customAmount}
                        onFocus={() => setSelectedRechargeKey('custom')}
                        onChange={(event) => {
                          setCustomAmount(event.target.value);
                          setSelectedRechargeKey('custom');
                        }}
                        placeholder={t('tokenTopUp.customAmountPlaceholder')}
                        className="rounded-xl bg-background"
                      />
                      <p data-testid="token-topup-custom-points-preview" className="text-xs text-muted-foreground">
                        {t('tokenTopUp.customPointsPreview', {
                          points: customTier?.points.toLocaleString() || '0',
                        })}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setSelectedRechargeKey('custom')} className="rounded-lg">
                      {t('tokenTopUp.useCustomAmount')}
                    </Button>
                  </div>
                </div>
                <div data-testid="token-topup-payment-method" className="mt-4 rounded-lg border border-black/5 bg-surface-input p-4 dark:border-white/10">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.paymentMethod')}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={selectedPaymentKind === 'wechat' ? 'default' : 'outline'}
                      onClick={() => setSelectedPaymentKind('wechat')}
                      className="rounded-lg"
                    >
                      {t('tokenTopUp.wechatPay')}
                    </Button>
                    <Button
                      type="button"
                      variant={selectedPaymentKind === 'alipay' ? 'default' : 'outline'}
                      onClick={() => setSelectedPaymentKind('alipay')}
                      className="rounded-lg"
                    >
                      {t('tokenTopUp.alipayPay')}
                    </Button>
                  </div>
                  <Button
                    data-testid="token-topup-create-selected-payment-qr"
                    onClick={handleCreateSelectedQrPayment}
                    disabled={
                      creatingPaymentKey !== null
                      || !selectedRechargeTier
                      || selectedRechargeTier.amount < TEST_MIN_RECHARGE_AMOUNT
                      || !selectedPaymentConfigured
                    }
                    className="mt-4 w-full rounded-lg"
                  >
                    {creatingPaymentKey ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4 mr-2" />
                    )}
                    {t('tokenTopUp.createPaymentQr')}
                  </Button>
                </div>
              </div>
              {selectedPaymentKind === 'wechat' ? (
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
                          className="rounded-xl bg-surface-input font-mono text-xs"
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
              ) : (
                <div data-testid="token-topup-epay-config" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.epayTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('tokenTopUp.epayDesc')}</p>
                  </div>
                  <Badge variant={epayConfig?.configured ? 'success' : 'warning'}>
                    {epayConfig?.configured ? t('tokenTopUp.configured') : t('tokenTopUp.notConfigured')}
                  </Badge>
                </div>
                {!showEpayForm && epayConfig?.configured ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => setShowEpayForm(true)} variant="outline" size="sm" className="rounded-full">
                      <Settings2 className="h-4 w-4 mr-2" />
                      {t('tokenTopUp.changeEpay')}
                    </Button>
                    <Button onClick={handleClearEpayConfig} disabled={clearingEpay} variant="outline" size="sm" className="rounded-full">
                      {clearingEpay ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      {t('tokenTopUp.clearEpay')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="epay-gateway-url">{t('tokenTopUp.epayGatewayUrl')}</Label>
                      <Input
                        id="epay-gateway-url"
                        value={epayGatewayUrl}
                        onChange={(event) => setEpayGatewayUrl(event.target.value)}
                        placeholder="https://pay.example.com"
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="epay-pid">{t('tokenTopUp.epayPid')}</Label>
                      <Input
                        id="epay-pid"
                        value={epayPid}
                        onChange={(event) => setEpayPid(event.target.value)}
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="epay-merchant-key">{t('tokenTopUp.epayMerchantKey')}</Label>
                      <Input
                        id="epay-merchant-key"
                        type="password"
                        value={epayMerchantKey}
                        onChange={(event) => setEpayMerchantKey(event.target.value)}
                        placeholder={epayConfig?.hasMerchantKey ? t('tokenTopUp.epayMerchantKeyPlaceholderSaved') : ''}
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="epay-notify-url">{t('tokenTopUp.epayNotifyUrl')}</Label>
                      <Input
                        id="epay-notify-url"
                        value={epayNotifyUrl}
                        onChange={(event) => setEpayNotifyUrl(event.target.value)}
                        placeholder="https://example.com/payments/epay/notify"
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">{t('tokenTopUp.epayNotifyHelp')}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="epay-return-url">{t('tokenTopUp.epayReturnUrl')}</Label>
                      <Input
                        id="epay-return-url"
                        value={epayReturnUrl}
                        onChange={(event) => setEpayReturnUrl(event.target.value)}
                        placeholder="https://example.com/payments/success"
                        className="rounded-xl bg-surface-input font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="epay-site-name">{t('tokenTopUp.epaySiteName')}</Label>
                      <Input
                        id="epay-site-name"
                        value={epaySiteName}
                        onChange={(event) => setEpaySiteName(event.target.value)}
                        className="rounded-xl bg-surface-input"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSaveEpayConfig} disabled={savingEpay} size="sm" className="rounded-full">
                        {savingEpay ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        {t('tokenTopUp.saveEpay')}
                      </Button>
                      <Button onClick={handleClearEpayConfig} disabled={clearingEpay} variant="outline" size="sm" className="rounded-full">
                        {clearingEpay ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        {t('tokenTopUp.clearEpay')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              )}
              <Dialog open={showQrDialog && Boolean(qrPayment?.qrcodeDataUrl)} onOpenChange={setShowQrDialog}>
                <DialogContent data-testid="token-topup-payment-qr" className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border-0 bg-surface-modal p-0 shadow-2xl">
                  {qrPayment?.qrcodeDataUrl && (
                    <div className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <DialogTitle className="text-2xl font-serif font-normal tracking-tight">
                            {qrPayment.paymentKind === 'alipay'
                              ? t('tokenTopUp.alipayQrTitle')
                              : t('tokenTopUp.wechatQrTitle')}
                          </DialogTitle>
                          <DialogDescription className="mt-1 text-sm text-muted-foreground">
                            {t('tokenTopUp.scanToPay')}
                          </DialogDescription>
                        </div>
                        <Button onClick={handleQueryQrPayment} disabled={queryingPayment} variant="outline" size="sm" className="rounded-full">
                          {queryingPayment ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                          {t('tokenTopUp.queryPayment')}
                        </Button>
                      </div>
                      <div className="mt-5 flex flex-col sm:flex-row gap-4">
                        <div className="rounded-xl bg-white p-3 shadow-sm">
                          <img src={qrPayment.qrcodeDataUrl} alt={t('tokenTopUp.paymentQrTitle')} className="h-48 w-48" />
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl bg-surface-input p-4 text-sm">
                          <p className="text-muted-foreground">{t('tokenTopUp.paymentOrder')}</p>
                          <p className="mt-1 break-all font-mono text-foreground">{qrPayment.outTradeNo || qrPayment.tradeNo || '-'}</p>
                          <p className="mt-4 text-muted-foreground">{t('tokenTopUp.paymentStatus')}</p>
                          <p className="mt-1 font-mono text-foreground">
                            {qrPayment.provider === 'blueocean'
                              ? qrPayment.tradeState || '-'
                              : typeof qrPayment.status === 'number'
                              ? qrPayment.status === 7 ? t('tokenTopUp.paymentPaid') : t('tokenTopUp.paymentUnpaid')
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <div data-testid="token-topup-usage-records" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.usageRecords')}</p>
                {walletRecords.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-surface-input px-3 py-5 text-center text-sm text-muted-foreground">
                    {t('tokenTopUp.usageRecordsEmpty')}
                  </div>
                ) : (
                  <div className="mt-3 divide-y divide-black/5 overflow-hidden rounded-lg bg-surface-input dark:divide-white/10">
                    {walletRecords.slice(0, 8).map((record) => (
                      <div key={record.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{record.paymentKind === 'wechat' ? t('tokenTopUp.wechatPay') : t('tokenTopUp.alipayPay')}</span>
                            <Badge variant={record.status === 'paid' ? 'success' : 'warning'}>
                              {record.status === 'paid' ? t('tokenTopUp.paymentPaid') : t('tokenTopUp.paymentPending')}
                            </Badge>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{record.outTradeNo}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="font-medium text-foreground">+{record.points.toLocaleString()} {t('tokenTopUp.points')}</p>
                          <p className="text-xs text-muted-foreground">¥{record.amount.toFixed(2)} · {new Date(record.paidAt || record.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
