import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  BlueOceanPayConfigResult,
  BlueOceanPayPaymentResult,
  CanvaslandBalanceResult,
  CreemCheckoutResult,
  CreemCurrency,
  EpayConfigResult,
  EpayPaymentResult,
} from '@shared/host-api/contract';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { hostApi } from '@/lib/host-api';
import { toUserMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

const POINTS_PER_CNY = 100;
const MIN_PAYMENT_AMOUNT = 0.1;
const MIN_CREEM_AMOUNT = 1;
const DEFAULT_CREEM_RATES: Record<CreemCurrency, number> = {
  USD: 6.8,
  HKD: 0.87,
};
const DEFAULT_RECHARGE_TIERS: RechargeTier[] = [
  { amount: 5, points: 500 },
  { amount: 10, points: 1_000 },
  { amount: 20, points: 2_100 },
  { amount: 50, points: 6_000, featured: true },
  { amount: 100, points: 13_000 },
  { amount: 200, points: 28_000 },
  { amount: 500, points: 75_000 },
];

type PaymentProvider = 'blueocean' | 'epay' | 'creem';
type PaymentKind = 'wechat' | 'alipay' | 'creem';
type RechargeTier = {
  amount: number;
  points: number;
  featured?: boolean;
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
  checkoutUrl?: string;
  checkoutId?: string;
  amount?: number;
  currency?: CreemCurrency;
  cnyRate?: number;
  cnyAmount?: number;
  points?: number;
  error?: string;
};

function pointsForAmount(amount: number): number {
  return DEFAULT_RECHARGE_TIERS.find((tier) => tier.amount === amount)?.points
    ?? Math.round(amount * POINTS_PER_CNY);
}

function currencySymbol(currency: CreemCurrency): string {
  return currency === 'HKD' ? 'HK$' : 'US$';
}

function pointsForCreemAmount(amount: number, currency: CreemCurrency, rates: Record<CreemCurrency, number>): number {
  return pointsForAmount(Number((amount * (rates[currency] || DEFAULT_CREEM_RATES[currency])).toFixed(2)));
}

export function TokenTopUp() {
  const { t } = useTranslation('common');
  const [balance, setBalance] = useState<CanvaslandBalanceResult | null>(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [blueOceanConfig, setBlueOceanConfig] = useState<BlueOceanPayConfigResult | null>(null);
  const [epayConfig, setEpayConfig] = useState<EpayConfigResult | null>(null);
  const [creatingPaymentKey, setCreatingPaymentKey] = useState<string | null>(null);
  const [selectedPaymentKind, setSelectedPaymentKind] = useState<PaymentKind>('wechat');
  const [selectedCreemCurrency, setSelectedCreemCurrency] = useState<CreemCurrency>('USD');
  const [creemRates, setCreemRates] = useState<Record<CreemCurrency, number>>(DEFAULT_CREEM_RATES);
  const [selectedRechargeKey, setSelectedRechargeKey] = useState('fixed-5');
  const [qrPayment, setQrPayment] = useState<QrPaymentState | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [queryingPayment, setQueryingPayment] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const rechargeTiers = useMemo(() => {
    return DEFAULT_RECHARGE_TIERS;
  }, []);
  const selectedMinimumAmount = selectedPaymentKind === 'creem' ? MIN_CREEM_AMOUNT : MIN_PAYMENT_AMOUNT;
  const pointsForSelectedAmount = useCallback((amount: number) => (
    selectedPaymentKind === 'creem'
      ? pointsForCreemAmount(amount, selectedCreemCurrency, creemRates)
      : pointsForAmount(amount)
  ), [creemRates, selectedCreemCurrency, selectedPaymentKind]);
  const customTier = useMemo<RechargeTier | null>(() => {
    const amount = Number(customAmount);
    if (!customAmount.trim() || !Number.isFinite(amount) || amount < selectedMinimumAmount) return null;
    return {
      amount,
      points: pointsForSelectedAmount(amount),
    };
  }, [customAmount, pointsForSelectedAmount, selectedMinimumAmount]);
  const selectedRechargeTier = useMemo<RechargeTier | null>(() => {
    if (selectedRechargeKey === 'custom') return customTier;
    const amount = Number(selectedRechargeKey.replace('fixed-', ''));
    const tier = rechargeTiers.find((item) => item.amount === amount) || rechargeTiers[0] || null;
    return tier ? {
      ...tier,
      points: selectedPaymentKind === 'creem' ? pointsForSelectedAmount(tier.amount) : tier.points,
    } : null;
  }, [customTier, pointsForSelectedAmount, rechargeTiers, selectedRechargeKey]);
  const selectedPaymentConfigured = selectedPaymentKind === 'creem'
    ? true
    : selectedPaymentKind === 'wechat'
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
    } catch {
      setBlueOceanConfig(null);
    }
  }, []);

  const loadEpayConfig = useCallback(async () => {
    try {
      const config = await hostApi.canvasland.epayConfig();
      setEpayConfig(config);
    } catch {
      setEpayConfig(null);
    }
  }, []);

  useEffect(() => {
    void loadBlueOceanConfig();
    void loadEpayConfig();
  }, [loadBlueOceanConfig, loadEpayConfig]);

  useEffect(() => {
    let cancelled = false;
    void hostApi.canvasland.creemRates()
      .then((result) => {
        if (!cancelled && result.rates) setCreemRates(result.rates);
      })
      .catch(() => {
        if (!cancelled) setCreemRates(DEFAULT_CREEM_RATES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateQrPayment = async (tier: RechargeTier, paymentKey: string) => {
    if (!Number.isFinite(tier.amount) || tier.amount < selectedMinimumAmount || tier.points < 1) {
      toast.error(t('tokenTopUp.errors.customAmountInvalid'));
      return;
    }
    setCreatingPaymentKey(paymentKey);
    try {
      let payment: QrPaymentState;
      if (selectedPaymentKind === 'creem') {
        const result: CreemCheckoutResult = await hostApi.canvasland.createCreemCheckout({
          amount: tier.amount,
          currency: selectedCreemCurrency,
        });
        payment = {
          success: result.success,
          provider: 'creem',
          paymentKind: 'creem',
          checkoutUrl: result.checkoutUrl,
          checkoutId: result.checkoutId,
          outTradeNo: result.outTradeNo,
          amount: result.amount,
          currency: result.currency,
          cnyRate: result.cnyRate,
          cnyAmount: result.cnyAmount,
          points: result.points,
          tradeState: result.status,
          error: result.error,
        };
      } else if (selectedPaymentKind === 'wechat') {
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
        toast.success(selectedPaymentKind === 'creem' ? t('tokenTopUp.creemCheckoutCreated') : t('tokenTopUp.paymentQrCreated'));
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
      if (qrPayment.provider === 'creem') {
        await refreshBalance();
        toast.success(t('tokenTopUp.paymentStatusUpdated'));
      } else if (qrPayment.provider === 'blueocean') {
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
              <div data-testid="token-topup-recharge-tiers" className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.amountOptions')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('tokenTopUp.pointsRate')}</p>
                  </div>
                  <Badge variant="secondary">
                    {t('tokenTopUp.selectedAmount')}:{' '}
                    {selectedPaymentKind === 'creem'
                      ? `${currencySymbol(selectedCreemCurrency)}${selectedRechargeTier?.amount ?? '-'}`
                      : `¥${selectedRechargeTier?.amount ?? '-'}`}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {rechargeTiers.map((tier) => {
                    const key = `fixed-${tier.amount}`;
                    const selected = selectedRechargeKey === key;
                    const points = selectedPaymentKind === 'creem' ? pointsForSelectedAmount(tier.amount) : tier.points;
                    const cnyAmount = selectedPaymentKind === 'creem'
                      ? tier.amount * (creemRates[selectedCreemCurrency] || DEFAULT_CREEM_RATES[selectedCreemCurrency])
                      : tier.amount;
                    const bonusPoints = Math.max(0, points - Math.round(cnyAmount * POINTS_PER_CNY));
                    return (
                      <button
                        key={tier.amount}
                        type="button"
                        data-testid={`token-topup-tier-${tier.amount}`}
                        onClick={() => setSelectedRechargeKey(key)}
                        className={`relative min-h-[118px] rounded-lg border px-3 py-3 text-left transition ${
                          selected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-black/5 bg-surface-input hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10'
                        }`}
                      >
                        {tier.featured && selectedPaymentKind !== 'creem' && (
                          <Badge className="absolute right-2 top-2">{t('tokenTopUp.recommended')}</Badge>
                        )}
                        <p className="text-sm font-semibold text-foreground">
                          {t('tokenTopUp.rechargeAmount', {
                            amount: selectedPaymentKind === 'creem'
                              ? `${currencySymbol(selectedCreemCurrency)}${tier.amount}`
                              : `¥${tier.amount}`,
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('tokenTopUp.basePoints', { points: Math.round(cnyAmount * POINTS_PER_CNY).toLocaleString() })}
                        </p>
                        <p className={cn(
                          'mt-1 text-xs font-semibold',
                          bonusPoints > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground',
                        )}>
                          {t('tokenTopUp.packageBonus', { points: bonusPoints.toLocaleString() })}
                        </p>
                        <p data-testid={`token-topup-tier-points-${tier.amount}`} className="mt-1 text-xs font-bold text-foreground">
                          {t('tokenTopUp.totalPoints', { points: points.toLocaleString() })}
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
                        min={selectedMinimumAmount}
                        step="0.01"
                        value={customAmount}
                        onFocus={() => setSelectedRechargeKey('custom')}
                        onChange={(event) => {
                          setCustomAmount(event.target.value);
                          setSelectedRechargeKey('custom');
                        }}
                        placeholder={selectedPaymentKind === 'creem'
                          ? t('tokenTopUp.creemAmountPlaceholder')
                          : t('tokenTopUp.customAmountPlaceholder')}
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
                  <div data-testid="token-topup-payment-actions" className="mx-auto mt-3 w-full sm:max-w-[70%]">
                    <div className="grid grid-cols-3 gap-2">
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
                      <Button
                        type="button"
                        variant={selectedPaymentKind === 'creem' ? 'default' : 'outline'}
                        onClick={() => setSelectedPaymentKind('creem')}
                        className="rounded-lg"
                      >
                        {t('tokenTopUp.creemPay')}
                      </Button>
                    </div>
                    {selectedPaymentKind === 'creem' && (
                      <div data-testid="token-topup-creem-currency" className="mt-3 grid grid-cols-1 gap-2">
                        {(['USD'] as CreemCurrency[]).map((currency) => (
                          <Button
                            key={currency}
                            type="button"
                            variant={selectedCreemCurrency === currency ? 'default' : 'outline'}
                            onClick={() => setSelectedCreemCurrency(currency)}
                            className="rounded-lg"
                          >
                            {currency}
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button
                      data-testid="token-topup-create-selected-payment-qr"
                      onClick={handleCreateSelectedQrPayment}
                      disabled={
                        creatingPaymentKey !== null
                        || !selectedRechargeTier
                        || selectedRechargeTier.amount < selectedMinimumAmount
                        || !selectedPaymentConfigured
                      }
                      className="mt-4 w-full rounded-lg"
                    >
                      {creatingPaymentKey ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4 mr-2" />
                      )}
                      {selectedPaymentKind === 'creem' ? t('tokenTopUp.createCreemCheckout') : t('tokenTopUp.createPaymentQr')}
                    </Button>
                  </div>
                </div>
              </div>
              <Dialog open={showQrDialog && Boolean(qrPayment?.qrcodeDataUrl || qrPayment?.checkoutUrl)} onOpenChange={setShowQrDialog}>
                <DialogContent data-testid="token-topup-payment-qr" className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border-0 bg-surface-modal p-0 shadow-2xl">
                  {qrPayment && (
                    <div className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <DialogTitle className="text-2xl font-serif font-normal tracking-tight">
                            {qrPayment.provider === 'creem'
                              ? t('tokenTopUp.creemCheckoutTitle')
                              : qrPayment.paymentKind === 'alipay'
                              ? t('tokenTopUp.alipayQrTitle')
                              : t('tokenTopUp.wechatQrTitle')}
                          </DialogTitle>
                          <DialogDescription className="mt-1 text-sm text-muted-foreground">
                            {qrPayment.provider === 'creem' ? t('tokenTopUp.creemCheckoutDesc') : t('tokenTopUp.scanToPay')}
                          </DialogDescription>
                        </div>
                        <Button onClick={handleQueryQrPayment} disabled={queryingPayment} variant="outline" size="sm" className="rounded-full">
                          {queryingPayment ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                          {t('tokenTopUp.queryPayment')}
                        </Button>
                      </div>
                      <div className="mt-5 flex flex-col sm:flex-row gap-4">
                        {qrPayment.qrcodeDataUrl ? (
                          <div className="rounded-xl bg-white p-3 shadow-sm">
                            <img src={qrPayment.qrcodeDataUrl} alt={t('tokenTopUp.paymentQrTitle')} className="h-48 w-48" />
                          </div>
                        ) : (
                          <div className="flex min-h-48 w-full items-center justify-center rounded-xl bg-surface-input p-4 sm:w-56">
                            <Button
                              data-testid="token-topup-open-creem-checkout"
                              onClick={() => qrPayment.checkoutUrl && hostApi.shell.openExternal(qrPayment.checkoutUrl)}
                              className="rounded-full"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              {t('tokenTopUp.openCreemCheckout')}
                            </Button>
                          </div>
                        )}
                        <div className="min-w-0 flex-1 rounded-xl bg-surface-input p-4 text-sm">
                          <p className="text-muted-foreground">{t('tokenTopUp.paymentOrder')}</p>
                          <p className="mt-1 break-all font-mono text-foreground">{qrPayment.outTradeNo || qrPayment.tradeNo || qrPayment.checkoutId || '-'}</p>
                          {qrPayment.provider === 'creem' && (
                            <>
                              <p className="mt-4 text-muted-foreground">{t('tokenTopUp.creemAmount')}</p>
                              <p className="mt-1 font-mono text-foreground">
                                {currencySymbol(qrPayment.currency || selectedCreemCurrency)}
                                {(qrPayment.amount ?? selectedRechargeTier?.amount ?? 0).toFixed(2)}
                                {' -> '}
                                {(qrPayment.points ?? 0).toLocaleString()} {t('tokenTopUp.points')}
                              </p>
                            </>
                          )}
                          <p className="mt-4 text-muted-foreground">{t('tokenTopUp.paymentStatus')}</p>
                          <p className="mt-1 font-mono text-foreground">
                            {qrPayment.provider === 'creem'
                              ? qrPayment.tradeState || t('tokenTopUp.paymentPending')
                              : qrPayment.provider === 'blueocean'
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
                            <span className="font-medium text-foreground">
                              {record.kind === 'usage'
                                ? t('tokenTopUp.modelUsage')
                                : record.paymentKind === 'creem'
                                ? t('tokenTopUp.creemPay')
                                : record.paymentKind === 'wechat'
                                ? t('tokenTopUp.wechatPay')
                                : t('tokenTopUp.alipayPay')}
                            </span>
                            <Badge variant={record.kind === 'usage' || record.status === 'paid' ? 'success' : 'warning'}>
                              {record.kind === 'usage'
                                ? t('tokenTopUp.used')
                                : record.status === 'paid'
                                ? t('tokenTopUp.paymentPaid')
                                : t('tokenTopUp.paymentPending')}
                            </Badge>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {record.kind === 'usage'
                              ? [record.model, record.description].filter(Boolean).join(' · ') || record.id
                              : record.outTradeNo || record.id}
                          </p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className={`font-medium ${record.kind === 'usage' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                            {record.kind === 'usage' ? '-' : '+'}{record.points.toLocaleString()} {t('tokenTopUp.points')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {record.kind === 'usage'
                              ? `${record.tokenUsed ? `${record.tokenUsed.toLocaleString()} ${t('tokenTopUp.tokens')}` : t('tokenTopUp.tokenUsage')} · ${new Date(record.createdAt).toLocaleString()}`
                              : `${record.currency === 'USD' ? 'US$' : record.currency === 'HKD' ? 'HK$' : '¥'}${(record.amount ?? 0).toFixed(2)} · ${new Date(record.paidAt || record.createdAt).toLocaleString()}`}
                          </p>
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
