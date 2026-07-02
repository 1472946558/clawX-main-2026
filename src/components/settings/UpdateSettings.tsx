/**
 * Update Settings Component
 * Displays update status and allows manual update checking/installation
 */
import { useEffect, useCallback, useState } from 'react';
import { Download, RefreshCw, Loader2, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useUpdateStore } from '@/stores/update';
import { useSettingsStore } from '@/stores/settings';
import { toUserMessage } from '@/lib/error-message';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function UpdateSettings() {
  const { t } = useTranslation('settings');
  const {
    status,
    currentVersion,
    updateInfo,
    progress,
    error,
    isInitialized,
    autoInstallCountdown,
    init,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelAutoInstall,
    clearError,
  } = useUpdateStore();
  const updateFeedUrl = useSettingsStore((state) => state.updateFeedUrl);
  const setUpdateFeedUrl = useSettingsStore((state) => state.setUpdateFeedUrl);
  const [feedUrlDraft, setFeedUrlDraft] = useState(updateFeedUrl);
  const [savingFeedUrl, setSavingFeedUrl] = useState(false);

  // Initialize on mount
  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setFeedUrlDraft(updateFeedUrl);
  }, [updateFeedUrl]);

  const handleCheckForUpdates = useCallback(async () => {
    clearError();
    await checkForUpdates();
  }, [checkForUpdates, clearError]);

  const handleSaveFeedUrl = useCallback(async () => {
    const nextUrl = feedUrlDraft.trim();
    if (nextUrl) {
      try {
        const parsed = new URL(nextUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error(t('updates.feedUrlInvalid'));
        }
      } catch {
        toast.error(t('updates.feedUrlInvalid'));
        return;
      }
    }

    setSavingFeedUrl(true);
    try {
      setUpdateFeedUrl(nextUrl);
      toast.success(t('updates.feedUrlSaved'));
    } catch (error) {
      toast.error(`${t('updates.feedUrlSaveFailed')}: ${toUserMessage(error)}`);
    } finally {
      setSavingFeedUrl(false);
    }
  }, [feedUrlDraft, setUpdateFeedUrl, t]);

  const handleClearFeedUrl = useCallback(() => {
    setFeedUrlDraft('');
    setUpdateFeedUrl('');
    toast.success(t('updates.feedUrlCleared'));
  }, [setUpdateFeedUrl, t]);

  const renderStatusIcon = () => {
    switch (status) {
      case 'checking':
      case 'downloading':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'available':
        return <Download className="h-4 w-4 text-primary" />;
      case 'downloaded':
        return <Rocket className="h-4 w-4 text-primary" />;
      case 'error':
        return <RefreshCw className="h-4 w-4 text-destructive" />;
      default:
        return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderStatusText = () => {
    if (status === 'downloaded' && autoInstallCountdown != null && autoInstallCountdown >= 0) {
      return t('updates.status.autoInstalling', { seconds: autoInstallCountdown });
    }
    switch (status) {
      case 'checking':
        return t('updates.status.checking');
      case 'downloading':
        return t('updates.status.downloading');
      case 'available':
        return t('updates.status.available', { version: updateInfo?.version });
      case 'downloaded':
        return t('updates.status.downloaded', { version: updateInfo?.version });
      case 'error':
        return error || t('updates.status.failed');
      case 'not-available':
        return t('updates.status.latest');
      default:
        return t('updates.status.check');
    }
  };

  const renderAction = () => {
    switch (status) {
      case 'checking':
        return (
          <Button disabled variant="outline" size="sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('updates.action.checking')}
          </Button>
        );
      case 'downloading':
        return (
          <Button disabled variant="outline" size="sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('updates.action.downloading')}
          </Button>
        );
      case 'available':
        return (
          <Button onClick={downloadUpdate} size="sm">
            <Download className="h-4 w-4 mr-2" />
            {t('updates.action.download')}
          </Button>
        );
      case 'downloaded':
        if (autoInstallCountdown != null && autoInstallCountdown >= 0) {
          return (
            <Button onClick={cancelAutoInstall} size="sm" variant="outline">
              <XCircle className="h-4 w-4 mr-2" />
              {t('updates.action.cancelAutoInstall')}
            </Button>
          );
        }
        return (
          <Button onClick={installUpdate} size="sm" variant="default">
            <Rocket className="h-4 w-4 mr-2" />
            {t('updates.action.install')}
          </Button>
        );
      case 'error':
        return (
          <Button onClick={handleCheckForUpdates} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('updates.action.retry')}
          </Button>
        );
      default:
        return (
          <Button onClick={handleCheckForUpdates} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('updates.action.check')}
          </Button>
        );
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Version */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('updates.currentVersion')}</p>
          <p className="text-2xl font-bold">v{currentVersion}</p>
        </div>
        {renderStatusIcon()}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between py-3 border-t border-b">
        <p className="text-sm text-muted-foreground">{renderStatusText()}</p>
        {renderAction()}
      </div>

      <div className="space-y-2">
        <Label htmlFor="update-feed-url">{t('updates.feedUrl')}</Label>
        <div className="flex gap-2">
          <Input
            id="update-feed-url"
            data-testid="update-feed-url"
            value={feedUrlDraft}
            onChange={(event) => setFeedUrlDraft(event.target.value)}
            placeholder="https://github.com/1472946558/clawX-main-2026/releases/latest/download"
            className="font-mono text-xs"
          />
          <Button data-testid="update-feed-url-save" onClick={handleSaveFeedUrl} disabled={savingFeedUrl} variant="outline" size="sm">
            {t('updates.feedUrlSave')}
          </Button>
          <Button data-testid="update-feed-url-clear" onClick={handleClearFeedUrl} variant="outline" size="sm">
            {t('updates.feedUrlClear')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('updates.feedUrlHelp')}</p>
      </div>

      {/* Download Progress */}
      {status === 'downloading' && progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
            </span>
            <span>{formatBytes(progress.bytesPerSecond)}/s</span>
          </div>
          <Progress value={progress.percent} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {Math.round(progress.percent)}% complete
          </p>
        </div>
      )}

      {/* Update Info */}
      {updateInfo && (status === 'available' || status === 'downloaded') && (
        <div className="rounded-lg bg-surface-input p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">Version {updateInfo.version}</p>
            {updateInfo.releaseDate && (
              <p className="text-sm text-muted-foreground">
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </p>
            )}
          </div>
          {updateInfo.releaseNotes && (
            <div className="text-sm text-muted-foreground prose prose-sm max-w-none">
              <p className="font-medium text-foreground mb-1">{t('updates.whatsNew')}</p>
              <p className="whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Error Details */}
      {status === 'error' && error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 text-red-600 dark:text-red-400 text-sm">
          <p className="font-medium mb-1">{t('updates.errorDetails')}</p>
          <p>{error}</p>
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-muted-foreground">
        {t('updates.help')}
      </p>
    </div>
  );
}

export default UpdateSettings;
