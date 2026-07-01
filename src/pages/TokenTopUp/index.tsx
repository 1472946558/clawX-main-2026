import { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { hostApi } from '@/lib/host-api';
import { toUserMessage } from '@/lib/error-message';

const CANVASLAND_ACCOUNT_ID = 'canvasland-newapi';
const DEFAULT_MODEL_ID = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://feiniu.space';

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

function getTopUpUrl(url: string): string {
  return `${normalizeRootUrl(url)}/console/topup`;
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
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savedRootUrl, setSavedRootUrl] = useState(DEFAULT_BASE_URL);

  const parsedConnection = useMemo(() => {
    if (!connectionJson.trim()) return null;
    try {
      return parseConnectionJson(connectionJson);
    } catch {
      return null;
    }
  }, [connectionJson]);

  const effectiveRootUrl = parsedConnection?.url ? normalizeRootUrl(parsedConnection.url) : savedRootUrl;

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
        model: modelId.trim() || DEFAULT_MODEL_ID,
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
      toast.success(t('tokenTopUp.cleared'));
    } catch (error) {
      toast.error(`${t('tokenTopUp.errors.clearFailed')}: ${toUserMessage(error)}`);
    } finally {
      setClearing(false);
    }
  };

  const handleOpenTopUp = () => {
    void window.electron.openExternal(getTopUpUrl(effectiveRootUrl));
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
          <Button onClick={handleOpenTopUp} className="rounded-full h-10 px-5">
            <ExternalLink className="h-4 w-4 mr-2" />
            {t('tokenTopUp.openConsole')}
          </Button>
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
              <div className="space-y-2">
                <Label htmlFor="newapi-model">{t('tokenTopUp.modelId')}</Label>
                <Input
                  id="newapi-model"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  placeholder={DEFAULT_MODEL_ID}
                  className="h-10 rounded-xl bg-surface-input font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">{t('tokenTopUp.modelHelp')}</p>
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
              <div className="rounded-xl bg-surface-input p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{t('tokenTopUp.currentEndpoint')}</p>
                <p className="mt-2 break-all font-mono text-sm text-foreground">{effectiveRootUrl}</p>
              </div>
              <div className="rounded-xl border border-dashed border-black/10 dark:border-white/10 p-4 text-sm text-muted-foreground">
                {t('tokenTopUp.balanceNote')}
              </div>
              <Button data-testid="token-topup-open" onClick={handleOpenTopUp} variant="outline" className="w-full rounded-xl h-11 justify-center">
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('tokenTopUp.openTopUp')}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
