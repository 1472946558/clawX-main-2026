import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Clapperboard,
  Download,
  Eye,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import ImageViewer from '@/components/file-preview/ImageViewer';
import { hostApi, type AiAppJob, type StagedFileResult } from '@/lib/host-api';
import type { AiAppVideoCapabilities } from '@shared/host-api/contract';
import { cn } from '@/lib/utils';
import detailPosterCover from '@/assets/ai-apps/detail-poster.webp';
import imageVideoCover from '@/assets/ai-apps/image-video.webp';
import productMainDetailCover from '@/assets/ai-apps/product-main-detail.webp';

type AiAppCategory = 'all' | 'ecommerce' | 'media' | 'tools' | 'finance' | 'goddess';
type AiAppIcon = 'copy' | 'image' | 'video';

interface AiApplication {
  id: string;
  titleKey: string;
  descriptionKey: string;
  category: Exclude<AiAppCategory, 'all'>;
  icon: AiAppIcon;
  coverImage: string;
  tags: string[];
  inputTypes: string[];
  outputTypes: string[];
  enabled: boolean;
  sortOrder: number;
}

const AI_APP_CATEGORIES: Array<{ key: AiAppCategory; icon: ComponentType<{ className?: string }> }> = [
  { key: 'all', icon: Grid3X3 },
  { key: 'ecommerce', icon: ImagePlus },
  { key: 'media', icon: Clapperboard },
  { key: 'tools', icon: WandSparkles },
  { key: 'finance', icon: BadgeCheck },
  { key: 'goddess', icon: Sparkles },
];

const AI_APPLICATIONS: AiApplication[] = [
  {
    id: 'ecommerce-copywriting',
    titleKey: 'apps.copywriting.title',
    descriptionKey: 'apps.copywriting.description',
    category: 'ecommerce',
    icon: 'copy',
    coverImage: productMainDetailCover,
    tags: ['copywriting', 'sellingPoint'],
    inputTypes: ['productName', 'sellingPoints', 'platform'],
    outputTypes: ['titleCopy', 'sellingPointCopy', 'detailCopy'],
    enabled: true,
    sortOrder: 10,
  },
  {
    id: 'detail-poster-generator',
    titleKey: 'apps.detailPosterGenerator.title',
    descriptionKey: 'apps.detailPosterGenerator.description',
    category: 'ecommerce',
    icon: 'image',
    coverImage: detailPosterCover,
    tags: ['detailImage', 'poster'],
    inputTypes: ['productImage', 'referenceImage', 'brief'],
    outputTypes: ['detailImage', 'poster'],
    enabled: true,
    sortOrder: 20,
  },
  {
    id: 'product-short-video',
    titleKey: 'apps.shortVideo.title',
    descriptionKey: 'apps.shortVideo.description',
    category: 'ecommerce',
    icon: 'video',
    coverImage: imageVideoCover,
    tags: ['videoGeneration', 'scenarioVideo'],
    inputTypes: ['productImage', 'script', 'scenario'],
    outputTypes: ['videoScript', 'storyboard', 'video'],
    enabled: true,
    sortOrder: 30,
  },
];

const APP_ICONS: Record<AiAppIcon, ComponentType<{ className?: string }>> = {
  copy: FileText,
  image: Camera,
  video: Clapperboard,
};

const REFERENCE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const REFERENCE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_TO_IMAGE_MODELS = new Set(['image-01', 'image-01-live']);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tokenLabels(t: TFunction<'skills'>, tokens: string[], namespace: 'tags' | 'inputTypes' | 'outputTypes') {
  return tokens.map((token) => t(`aiApps.${namespace}.${token}`, { defaultValue: token }));
}

function AiAppCover({ app, t }: { app: AiApplication; t: TFunction<'skills'> }) {
  const Icon = APP_ICONS[app.icon];
  return (
    <div className="relative h-[138px] overflow-hidden rounded-t-lg bg-[#f6c27a]">
      <img
        src={app.coverImage}
        alt=""
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5" />
      <div className="absolute left-4 top-3 flex h-7 items-center rounded-full bg-[#3e3b35]/90 px-2.5 text-2xs font-semibold text-white shadow-sm">
        {t(`aiApps.categories.${app.category}`)}
      </div>
      <div className="absolute inset-x-0 top-5 flex justify-center px-16">
        <div className="flex max-w-full items-center justify-center gap-1.5 rounded-md bg-white/80 px-2.5 py-1 shadow-sm backdrop-blur-[2px]">
          <Icon className="h-4 w-4 shrink-0 text-slate-950" />
          <span className="truncate text-center text-[15px] font-black leading-none text-slate-950">
          {t(`aiApps.${app.titleKey}`)}
          </span>
        </div>
      </div>
    </div>
  );
}

function getOutputAssetCount(job: AiAppJob): number {
  const assetCount = job.outputs?.assetCount;
  return typeof assetCount === 'number' ? assetCount : 0;
}

function getDemoOutputText(t: TFunction<'skills'>, asset: NonNullable<AiAppJob['outputs']>['assets'][number], field: 'title' | 'description') {
  const fallback = field === 'title' ? asset.title : asset.description;
  const key = field === 'title' ? asset.titleKey : asset.descriptionKey;
  return key ? t(`aiApps.demoOutputs.${key}.${field}`, { defaultValue: fallback || '' }) : fallback || '';
}

function AiAppResultAssets({ app, job, t }: { app: AiApplication; job: AiAppJob | null; t: TFunction<'skills'> }) {
  const assets = job?.outputs?.assets || [];
  if (assets.length === 0) return null;
  const generatedCopy = app.id === 'ecommerce-copywriting'
    ? assets.find((asset) => typeof asset.metadata?.resultText === 'string')?.metadata?.resultText
    : null;

  const openAsset = (path?: string) => {
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      void hostApi.shell.openExternal(path);
      return;
    }
    void hostApi.shell.openPath(path);
  };

  const revealAsset = (path?: string) => {
    if (!path) return;
    void hostApi.shell.showItemInFolder(path);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-foreground">{t('aiApps.detail.generatedAssets')}</h3>
      {typeof generatedCopy === 'string' && generatedCopy.trim() && (
        <div
          data-testid="ai-app-generated-copy"
          className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-black/5 bg-surface-input p-4 text-sm leading-7 text-slate-800 shadow-sm dark:border-white/10 dark:text-slate-100"
        >
          {generatedCopy.trim()}
        </div>
      )}
      <div data-testid="ai-app-generated-assets" className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => {
          const hasFile = typeof asset.downloadUrl === 'string' && asset.downloadUrl.length > 0;
          const isRemote = hasFile && /^https?:\/\//i.test(asset.downloadUrl || '');
          return (
            <div key={asset.id} className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
              <div className="relative h-40 overflow-hidden bg-[#f6c27a]">
                {hasFile && (asset.type === 'image' || asset.type === 'poster') ? (
                  <ImageViewer
                    filePath={asset.downloadUrl!}
                    fileName={getDemoOutputText(t, asset, 'title')}
                    className="h-full w-full"
                  />
                ) : (
                  <img src={app.coverImage} alt="" className="h-full w-full object-cover opacity-80" draggable={false} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {t(`aiApps.assetTypes.${asset.type}`)}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <p className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-foreground">
                  {getDemoOutputText(t, asset, 'title')}
                </p>
                <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                  {getDemoOutputText(t, asset, 'description')}
                </p>
                {asset.type !== 'text' && (
                  <p className="text-xs text-muted-foreground">
                    {t('aiApps.detail.assetRatio')}: {typeof asset.metadata?.ratio === 'string' ? asset.metadata.ratio : '-'}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!hasFile}
                    title={hasFile ? t('aiApps.detail.openResult') : t('aiApps.detail.inlineResult')}
                    onClick={() => openAsset(asset.downloadUrl)}
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t('aiApps.detail.openResult')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!hasFile || isRemote}
                    title={hasFile && !isRemote ? t('aiApps.detail.revealResult') : t('aiApps.detail.fileUnavailable')}
                    onClick={() => revealAsset(asset.downloadUrl)}
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('aiApps.detail.revealResult')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RequiredMark({ required }: { required?: boolean }) {
  return required ? <span className="mr-1 text-red-500">*</span> : null;
}

function Field({
  label,
  placeholder,
  required,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        <RequiredMark required={required} />
        {label}
      </span>
      <input
        data-testid={testId}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#2f7dff] dark:border-white/10 dark:bg-white/5"
        placeholder={placeholder}
      />
    </label>
  );
}

function TextAreaField({
  label,
  placeholder,
  required,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        <RequiredMark required={required} />
        {label}
      </span>
      <textarea
        data-testid={testId}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="min-h-24 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-slate-400 focus:border-[#2f7dff] dark:border-white/10 dark:bg-white/5"
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectLike({
  label,
  required,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        <RequiredMark required={required} />
        {label}
      </span>
      <select
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-[#2f7dff] dark:border-white/10 dark:bg-white/5"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function UploadBox({
  label,
  helper,
  file,
  error,
  onPick,
  onRemove,
  t,
}: {
  label: string;
  helper: string;
  file: StagedFileResult | null;
  error: string | null;
  onPick: () => void;
  onRemove: () => void;
  t: TFunction<'skills'>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {file ? (
        <div data-testid="ai-app-reference-file" className="flex max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          {file.preview && (
            <img
              data-testid="ai-app-reference-preview"
              src={file.preview}
              alt={file.fileName}
              className="h-20 w-20 shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{file.fileName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="ai-app-reference-remove"
            title={t('aiApps.workbench.removeReference')}
            onClick={onRemove}
            className="h-8 w-8 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="ai-app-reference-upload"
          onClick={onPick}
          className="flex h-28 w-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 hover:border-[#2f7dff] hover:text-[#2f7dff] dark:border-white/10 dark:bg-white/5"
        >
          <Upload className="mb-2 h-6 w-6" />
          <span className="text-xs">{helper}</span>
        </button>
      )}
      <p className="text-xs text-muted-foreground">{t('aiApps.workbench.supportedFormats')}</p>
      {error && <p data-testid="ai-app-reference-error" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        <RequiredMark required />
        {label}
      </p>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange?.(option.value)}
            className={cn(
              'h-9 px-4 text-sm transition-colors',
              value === option.value ? 'bg-[#2f7dff] text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RatioPicker({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: TFunction<'skills'> }) {
  const ratios = ['1:1', '2:3', '3:4', '4:3', '16:9', '9:16'];
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('aiApps.workbench.aspectRatio')}</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-3">
        {ratios.map((ratio) => (
          <button
            key={ratio}
            type="button"
            data-testid={`ai-app-ratio-${ratio.replace(':', '-')}`}
            onClick={() => onChange(ratio)}
            className={cn(
              'flex h-20 flex-col items-center justify-center gap-2 rounded-lg border bg-white text-sm font-semibold transition-colors dark:bg-white/5',
              value === ratio ? 'border-[#2f7dff] text-[#2f7dff] ring-2 ring-[#2f7dff]/10' : 'border-slate-200 text-slate-700 hover:border-[#2f7dff]/60 dark:border-white/10 dark:text-slate-200',
            )}
          >
            <span className={cn('block rounded border-2 border-current', ratio === '9:16' || ratio === '2:3' || ratio === '3:4' ? 'h-8 w-5' : ratio === '16:9' || ratio === '4:3' ? 'h-5 w-8' : 'h-7 w-7')} />
            {ratio}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerationSettings({
  t,
  showVideo = false,
  value,
  onChange,
  videoCapabilities,
}: {
  t: TFunction<'skills'>;
  showVideo?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  videoCapabilities?: AiAppVideoCapabilities | null;
}) {
  const models = showVideo
    ? (videoCapabilities?.models.length ? videoCapabilities.models : ['seedance-2.0-720p'])
    : ['image-01', 'image-01-live'];
  return (
    <div className="space-y-5 border-slate-200 2xl:border-l 2xl:pl-5 dark:border-white/10">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          <RequiredMark required />
          {t('aiApps.workbench.model')}
        </p>
        <div className="space-y-3">
          {models.map((model, index) => (
            <button
              key={model}
              type="button"
              data-testid={showVideo ? `ai-app-video-model-${model}` : undefined}
              onClick={() => onChange?.(model)}
              className={cn(
                'w-full rounded-lg border bg-white px-3 py-3 text-left transition-colors dark:bg-white/5',
                (value || models[0]) === model ? 'border-[#2f7dff] ring-2 ring-[#2f7dff]/10' : 'border-slate-200 hover:border-[#2f7dff]/60 dark:border-white/10',
              )}
            >
              <span className="block text-sm font-bold text-slate-950 dark:text-foreground">{model}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t(`aiApps.workbench.modelDescriptions.${index}`)}</span>
            </button>
          ))}
        </div>
        {showVideo && videoCapabilities && (
          <div
            data-testid="ai-app-video-provider-capability"
            className={cn(
              'rounded-lg border px-3 py-2 text-xs leading-relaxed',
              videoCapabilities.supported
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
            )}
          >
            {videoCapabilities.providerLabel || t('aiApps.workbench.noProvider')}: {videoCapabilities.supported ? t('aiApps.workbench.videoSupported') : videoCapabilities.reason}
          </div>
        )}
      </div>
      <Field label={t('aiApps.workbench.generateCount')} placeholder="1" required />
      <p className="text-right text-sm font-semibold text-[#1548d2]">{t(showVideo ? 'aiApps.workbench.videoPrice' : 'aiApps.workbench.imagePrice')}</p>
    </div>
  );
}

function AiAppWorkbench({
  app,
  onBack,
  t,
}: {
  app: AiApplication;
  onBack: () => void;
  t: TFunction<'skills'>;
}) {
  const [job, setJob] = useState<AiAppJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<AiAppJob[]>([]);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [copyForm, setCopyForm] = useState({
    productName: '',
    sellingPoints: '',
    platform: 'taobao',
    brandTone: '',
    targetAudience: '',
    useScene: '',
  });
  const [imageRatio, setImageRatio] = useState('1:1');
  const [videoMode, setVideoMode] = useState('imageToVideo');
  const [videoForm, setVideoForm] = useState({
    productText: '',
    sellingPoints: '',
    platform: 'taobao',
    model: 'seedance-2.0-720p',
  });
  const [videoCapabilities, setVideoCapabilities] = useState<AiAppVideoCapabilities | null>(null);
  const [isRefreshingJob, setIsRefreshingJob] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState('image-01');
  const [productDescription, setProductDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState<StagedFileResult | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    setJob(null);
    setRecentJobs([]);
    setJobError(null);
    setIsCreatingJob(false);
    setReferenceImage(null);
    setReferenceError(null);
    setProductDescription('');
  }, [app.id]);

  useEffect(() => {
    if (app.id !== 'product-short-video') return;
    let canceled = false;
    void hostApi.aiApps.videoCapabilities().then((result) => {
      if (canceled) return;
      if (result.success && result.capabilities) {
        setVideoCapabilities(result.capabilities);
        if (result.capabilities.models[0]) {
          setVideoForm((current) => ({ ...current, model: result.capabilities?.models[0] || current.model }));
        }
      } else {
        setVideoCapabilities({ supported: false, models: ['seedance-2.0-720p'], reason: result.error || t('aiApps.workbench.capabilityLoadError') });
      }
    }).catch((error) => {
      if (!canceled) setVideoCapabilities({ supported: false, models: ['seedance-2.0-720p'], reason: error instanceof Error ? error.message : String(error) });
    });
    return () => { canceled = true; };
  }, [app.id, t]);

  const handlePickReferenceImage = async () => {
    setReferenceError(null);
    try {
      const picked = await hostApi.dialog.open({
        title: t('aiApps.workbench.referencePickerTitle'),
        filters: [{ name: t('aiApps.workbench.imageFiles'), extensions: REFERENCE_IMAGE_EXTENSIONS }],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths.length) return;
      const staged = await hostApi.files.stagePaths({
        filePaths: [picked.filePaths[0]],
        allowedExtensions: REFERENCE_IMAGE_EXTENSIONS,
      });
      const file = staged[0];
      if (!file || !REFERENCE_IMAGE_MIME_TYPES.has(file.mimeType) || !file.preview) {
        throw new Error(t('aiApps.workbench.invalidReferenceImage'));
      }
      setReferenceImage(file);
    } catch (error) {
      setReferenceImage(null);
      setReferenceError(error instanceof Error ? error.message : t('aiApps.workbench.referenceUploadFailed'));
    }
  };

  useEffect(() => {
    let canceled = false;
    const loadRecentJobs = async () => {
      try {
        const result = await hostApi.aiApps.listResults({ appId: app.id });
        if (!canceled && result.success) {
          setRecentJobs(result.jobs || []);
        }
      } catch {
        if (!canceled) setRecentJobs([]);
      }
    };

    void loadRecentJobs();
    return () => {
      canceled = true;
    };
  }, [app.id]);

  useEffect(() => {
    if (!job || job.appId === 'product-short-video' || job.status === 'completed' || job.status === 'failed') return;

    const timeout = window.setTimeout(async () => {
      try {
        const result = await hostApi.aiApps.getJob(job.id);
        if (result.success && result.job) {
          setJob(result.job);
          const listResult = await hostApi.aiApps.listResults({ appId: job.appId });
          if (listResult.success) {
            setRecentJobs(listResult.jobs || []);
          }
        }
      } catch {
        // Keep the current visible job state if polling fails; the next backend call can recover it.
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [job]);

  const Icon = APP_ICONS[app.icon];
  const inputLabels = tokenLabels(t, app.inputTypes, 'inputTypes');
  const outputLabels = tokenLabels(t, app.outputTypes, 'outputTypes');

  const handleCreateJob = async () => {
    if (app.id === 'ecommerce-copywriting' && (!copyForm.productName.trim() || !copyForm.sellingPoints.trim() || !copyForm.platform)) {
      setJob(null);
      setJobError(t('aiApps.workbench.requiredFieldsError'));
      return;
    }
    if (app.id === 'product-short-video' && (!videoForm.productText.trim() || !videoForm.sellingPoints.trim() || !videoForm.platform || !videoForm.model)) {
      setJob(null);
      setJobError(t('aiApps.workbench.requiredFieldsError'));
      return;
    }
    if (app.id === 'product-short-video' && videoCapabilities && !videoCapabilities.supported) {
      setJob(null);
      setJobError(videoCapabilities.reason || t('aiApps.workbench.videoUnsupported'));
      return;
    }
    if (referenceImage && !IMAGE_TO_IMAGE_MODELS.has(selectedImageModel)) {
      setJob(null);
      setJobError(t('aiApps.workbench.modelUnsupportedReference'));
      return;
    }
    setIsCreatingJob(true);
    setJobError(null);
    try {
      const result = await hostApi.aiApps.createJob({
        appId: app.id,
        mode: 'live',
        inputs: {
          appTitle: t(`aiApps.${app.titleKey}`),
          inputTypes: inputLabels,
          outputTypes: outputLabels,
          ...(app.id === 'ecommerce-copywriting' ? {
            productName: copyForm.productName.trim(),
            sellingPoints: copyForm.sellingPoints.trim(),
            platform: copyForm.platform,
            brandTone: copyForm.brandTone.trim(),
            targetAudience: copyForm.targetAudience.trim(),
            useScene: copyForm.useScene.trim(),
          } : {}),
          ...(app.id === 'product-short-video' ? {
            productText: videoForm.productText.trim(),
            sellingPoints: videoForm.sellingPoints.trim(),
            platform: videoForm.platform,
            videoModel: videoForm.model,
          } : {}),
          ratio: imageRatio,
          videoMode,
          ...(app.id === 'detail-poster-generator' ? {
            prompt: productDescription.trim(),
            model: selectedImageModel,
            referenceImages: referenceImage
              ? [{
                id: referenceImage.id,
                fileName: referenceImage.fileName,
                mimeType: referenceImage.mimeType,
                fileSize: referenceImage.fileSize,
                stagedPath: referenceImage.stagedPath,
              }]
              : [],
          } : {}),
        },
      });
      if (result.success && result.job) {
        setJob(result.job);
        const listResult = await hostApi.aiApps.listResults({ appId: app.id });
        if (listResult.success) {
          setRecentJobs(listResult.jobs || []);
        }
      } else {
        setJobError(result.error || t('aiApps.detail.jobError'));
      }
    } catch (error) {
      setJobError(error instanceof Error ? error.message : t('aiApps.detail.jobError'));
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleRefreshJob = async () => {
    if (!job) return;
    setIsRefreshingJob(true);
    setJobError(null);
    try {
      const result = await hostApi.aiApps.refreshJob(job.id);
      if (result.success && result.job) {
        setJob(result.job);
        const listResult = await hostApi.aiApps.listResults({ appId: job.appId });
        if (listResult.success) setRecentJobs(listResult.jobs || []);
      } else setJobError(result.error || t('aiApps.detail.statusQueryError'));
    } catch (error) {
      setJobError(error instanceof Error ? error.message : t('aiApps.detail.statusQueryError'));
    } finally {
      setIsRefreshingJob(false);
    }
  };

  const renderForm = () => {
    if (app.id === 'ecommerce-copywriting') {
      return (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t('aiApps.workbench.productName')}
            required
            placeholder={t('aiApps.workbench.productNamePlaceholder')}
            value={copyForm.productName}
            onChange={(productName) => setCopyForm((current) => ({ ...current, productName }))}
            testId="ai-app-copy-product-name"
          />
          <TextAreaField
            label={t('aiApps.workbench.coreSellingPoints')}
            required
            placeholder={t('aiApps.workbench.sellingPointsPlaceholder')}
            value={copyForm.sellingPoints}
            onChange={(sellingPoints) => setCopyForm((current) => ({ ...current, sellingPoints }))}
            testId="ai-app-copy-selling-points"
          />
          <SelectLike
            label={t('aiApps.workbench.targetPlatform')}
            required
            value={copyForm.platform}
            options={['taobao', 'tmall', 'jd', 'pdd'].map((value) => ({ value, label: t(`aiApps.platforms.${value}`) }))}
            onChange={(platform) => setCopyForm((current) => ({ ...current, platform }))}
            testId="ai-app-copy-platform"
          />
          <Field
            label={t('aiApps.workbench.brandTone')}
            placeholder={t('aiApps.workbench.brandTonePlaceholder')}
            value={copyForm.brandTone}
            onChange={(brandTone) => setCopyForm((current) => ({ ...current, brandTone }))}
            testId="ai-app-copy-brand-tone"
          />
          <Field
            label={t('aiApps.workbench.targetAudience')}
            placeholder={t('aiApps.workbench.targetAudiencePlaceholder')}
            value={copyForm.targetAudience}
            onChange={(targetAudience) => setCopyForm((current) => ({ ...current, targetAudience }))}
            testId="ai-app-copy-target-audience"
          />
          <Field
            label={t('aiApps.workbench.usageScenario')}
            placeholder={t('aiApps.workbench.usageScenarioPlaceholder')}
            value={copyForm.useScene}
            onChange={(useScene) => setCopyForm((current) => ({ ...current, useScene }))}
            testId="ai-app-copy-use-scene"
          />
        </div>
      );
    }

    if (app.id === 'detail-poster-generator') {
      return (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <UploadBox
              label={t('aiApps.workbench.referenceImages')}
              helper={t('aiApps.workbench.uploadHelper')}
              file={referenceImage}
              error={referenceError}
              onPick={() => void handlePickReferenceImage()}
              onRemove={() => {
                setReferenceImage(null);
                setReferenceError(null);
              }}
              t={t}
            />
            <Segmented
              label={t('aiApps.workbench.imageType')}
              options={[
                { value: 'main', label: t('aiApps.workbench.mainImage') },
                { value: 'detail', label: t('aiApps.workbench.detailImage') },
              ]}
              value="detail"
            />
            <TextAreaField
              label={t('aiApps.workbench.productDescription')}
              required
              placeholder={t('aiApps.workbench.productDescriptionPlaceholder')}
              value={productDescription}
              onChange={setProductDescription}
              testId="ai-app-product-description"
            />
            <RatioPicker value={imageRatio} onChange={setImageRatio} t={t} />
          </div>
          <GenerationSettings t={t} value={selectedImageModel} onChange={setSelectedImageModel} />
        </div>
      );
    }

    return (
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Segmented
            label={t('aiApps.workbench.generationMode')}
            options={[
              { value: 'textToImage', label: t('aiApps.workbench.textToImage') },
              { value: 'imageToImage', label: t('aiApps.workbench.imageToImage') },
              { value: 'textToVideo', label: t('aiApps.workbench.textToVideo') },
              { value: 'imageToVideo', label: t('aiApps.workbench.imageToVideo') },
            ]}
            value={videoMode}
            onChange={setVideoMode}
          />
          <TextAreaField
            label={t('aiApps.workbench.productText')}
            required
            placeholder={t('aiApps.workbench.productTextPlaceholder')}
            value={videoForm.productText}
            onChange={(productText) => setVideoForm((current) => ({ ...current, productText }))}
            testId="ai-app-video-product-text"
          />
          <TextAreaField
            label={t('aiApps.workbench.coreSellingPoints')}
            required
            placeholder={t('aiApps.workbench.sellingPointsPlaceholder')}
            value={videoForm.sellingPoints}
            onChange={(sellingPoints) => setVideoForm((current) => ({ ...current, sellingPoints }))}
            testId="ai-app-video-selling-points"
          />
          <SelectLike
            label={t('aiApps.workbench.targetPlatform')}
            required
            value={videoForm.platform}
            options={['taobao', 'tmall', 'jd', 'pdd', 'douyin', 'xiaohongshu'].map((value) => ({ value, label: t(`aiApps.platforms.${value}`, { defaultValue: value }) }))}
            onChange={(platform) => setVideoForm((current) => ({ ...current, platform }))}
            testId="ai-app-video-platform"
          />
          <RatioPicker value={imageRatio} onChange={setImageRatio} t={t} />
        </div>
        <GenerationSettings
          t={t}
          showVideo
          value={videoForm.model}
          onChange={(model) => setVideoForm((current) => ({ ...current, model }))}
          videoCapabilities={videoCapabilities}
        />
      </div>
    );
  };

  return (
    <div data-testid="ai-app-workbench" className="-m-6 flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden bg-[#eef4ff] dark:bg-background">
      <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-black/5 bg-surface-modal px-6 dark:border-white/10">
        <button
          type="button"
          data-testid="ai-app-workbench-back"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2f7dff]/10 text-[#2f7dff]">
          <Icon className="h-4 w-4" />
        </div>
        <h1 data-testid="ai-app-workbench-title" className="text-lg font-bold tracking-tight text-[#1548d2] dark:text-foreground">
          {t(`aiApps.${app.titleKey}`)}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-[1180px] gap-5 xl:grid-cols-[minmax(0,1fr)_438px]">
          <section className="rounded-xl bg-surface-modal p-5 shadow-sm" data-testid="ai-app-workbench-form">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#2f7dff] px-3 py-1.5 text-xs font-semibold text-white">{t('aiApps.workbench.stepFill')}</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{t('aiApps.workbench.formTitle')}</span>
            </div>
            {renderForm()}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                type="button"
                data-testid="ai-app-create-demo-job"
                disabled={isCreatingJob || (app.id === 'product-short-video' && videoCapabilities !== null && !videoCapabilities.supported)}
                onClick={handleCreateJob}
                className="h-10 min-w-36 bg-[#2f7dff] text-white hover:bg-[#246ee8] disabled:opacity-70"
              >
                {isCreatingJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {isCreatingJob ? t('aiApps.detail.creatingJob') : t('aiApps.workbench.submitGenerate')}
              </Button>
              <span className="text-sm text-muted-foreground">{t('aiApps.workbench.estimatedCost')}</span>
            </div>
          </section>

          <aside className="rounded-xl bg-surface-modal p-5 shadow-sm" data-testid="ai-app-workbench-result">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-black/5 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#2f7dff] px-3 py-1.5 text-xs font-semibold text-white">
                  {app.id === 'ecommerce-copywriting' ? t('aiApps.workbench.session') : t('aiApps.workbench.generatedResult')}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{t('aiApps.workbench.resultTitle')}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setJob(null); setJobError(null); }}>
                {t('aiApps.workbench.clear')}
              </Button>
            </div>

            {!job && !jobError && (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-muted-foreground">
                <MessageSquareText className="mb-4 h-10 w-10 text-[#2f7dff]/50" />
                <p className="text-base font-medium text-slate-700 dark:text-slate-200">{t('aiApps.workbench.waitingTitle')}</p>
                <p className="mt-2 max-w-xs text-sm leading-relaxed">{t('aiApps.workbench.waitingDescription')}</p>
              </div>
            )}

            {(job || jobError) && (
              <div
                data-testid="ai-app-demo-job-result"
                className={cn(
                  'mb-4 rounded-xl border p-4',
                  job && job.status !== 'failed'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200',
                )}
              >
                <p className="text-sm font-semibold">
                  {job?.status === 'failed'
                    ? t('aiApps.detail.jobError')
                    : job
                      ? t('aiApps.detail.jobCreated')
                      : t('aiApps.detail.jobError')}
                </p>
                {job ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <p data-testid="ai-app-demo-job-status">
                      {t('aiApps.detail.jobStatus')}: {t(`aiApps.jobStatuses.${job.status}`)}
                    </p>
                    {app.id === 'product-short-video' && (
                      <>
                        <p data-testid="ai-app-local-job-id" className="break-all">
                          {t('aiApps.detail.localJobId')}: <span className="font-mono">{job.localJobId}</span>
                        </p>
                        <p data-testid="ai-app-provider-task-id" className="break-all">
                          {t('aiApps.detail.providerTaskId')}: <span className="font-mono">{job.providerTaskId || '-'}</span>
                        </p>
                        <p>{t('aiApps.detail.provider')}: {job.providerLabel || job.providerId || '-'}</p>
                      </>
                    )}
                    {job.error && <p data-testid="ai-app-job-error">{job.error}</p>}
                    {job.rawResponseSummary && (
                      <details className="pt-1">
                        <summary className="cursor-pointer font-semibold">{t('aiApps.detail.rawResponse')}</summary>
                        <pre data-testid="ai-app-raw-response" className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 font-mono text-[10px] dark:bg-white/5">{job.rawResponseSummary}</pre>
                      </details>
                    )}
                    <p>{t('aiApps.detail.outputCount', { count: getOutputAssetCount(job) })}</p>
                    {app.id === 'product-short-video' && job.providerTaskId && job.status !== 'completed' && job.status !== 'failed' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="ai-app-refresh-video-status"
                        disabled={isRefreshingJob}
                        onClick={handleRefreshJob}
                        className="mt-2 h-8"
                      >
                        {isRefreshingJob && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {t('aiApps.detail.queryStatus')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs">{jobError}</p>
                )}
              </div>
            )}

            {app.id === 'product-short-video' && job?.resultUrl && (
              <section data-testid="ai-app-video-result" className="mb-4 space-y-2">
                <video controls src={job.resultUrl} className="aspect-video w-full rounded-lg bg-black" />
                <button
                  type="button"
                  onClick={() => void hostApi.shell.openExternal(job.resultUrl || '')}
                  className="block max-w-full break-all text-left text-xs text-[#1548d2] underline underline-offset-2 dark:text-blue-300"
                >
                  {job.resultUrl}
                </button>
              </section>
            )}

            <AiAppResultAssets app={app} job={job} t={t} />

            {recentJobs.length > 0 && (
              <section className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-foreground">{t('aiApps.detail.recentJobs')}</h3>
                <div data-testid="ai-app-recent-jobs" className="space-y-2">
                  {recentJobs.slice(0, 3).map((recentJob) => (
                    <div key={recentJob.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                      <p className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">{recentJob.id}</p>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {t(`aiApps.jobStatuses.${recentJob.status}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export function AiApps() {
  const { t } = useTranslation('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AiAppCategory>('all');
  const [viewMode, setViewMode] = useState<'cover' | 'grid'>('cover');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const filteredApps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return AI_APPLICATIONS
      .filter((app) => categoryFilter === 'all' || app.category === categoryFilter)
      .filter((app) => {
        if (!query) return true;
        const haystack = [
          t(`aiApps.${app.titleKey}`),
          t(`aiApps.${app.descriptionKey}`),
          t(`aiApps.categories.${app.category}`),
          ...tokenLabels(t, app.tags, 'tags'),
          ...tokenLabels(t, app.inputTypes, 'inputTypes'),
          ...tokenLabels(t, app.outputTypes, 'outputTypes'),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categoryFilter, searchQuery, t]);

  const selectedApp = useMemo(() => AI_APPLICATIONS.find((app) => app.id === selectedAppId) ?? null, [selectedAppId]);

  if (selectedApp) {
    return <AiAppWorkbench app={selectedApp} onBack={() => setSelectedAppId(null)} t={t} />;
  }

  return (
    <div data-testid="skills-page" className="-m-6 flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden bg-[#eef4ff] dark:bg-background">
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-black/5 bg-surface-modal px-6 dark:border-white/10">
        <h1 data-testid="ai-apps-title" className="text-lg font-bold tracking-tight text-[#1548d2] dark:text-foreground">
          {t('aiApps.title')}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3">
          <div className="flex min-h-[66px] flex-col gap-3 rounded-xl bg-surface-modal px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div data-testid="ai-apps-category-tabs" className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              {AI_APP_CATEGORIES.map((category) => {
                const active = categoryFilter === category.key;
                return (
                  <Button
                    key={category.key}
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`ai-apps-category-${category.key}`}
                    onClick={() => setCategoryFilter(category.key)}
                    className={cn(
                      'h-10 rounded-lg px-3.5 text-sm font-medium shadow-none',
                      active
                        ? 'bg-[#2f7dff] text-white hover:bg-[#2f7dff] hover:text-white'
                        : 'bg-transparent text-slate-600 hover:bg-black/5 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground',
                    )}
                  >
                    {t(`aiApps.categories.${category.key}`)}
                    {category.key === 'all' && (
                      <span className="ml-2 rounded-full bg-[#ff4b32] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                        {t('aiApps.hot')}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 md:shrink-0">
              <button
                type="button"
                aria-label={t('aiApps.view.cover')}
                onClick={() => setViewMode('cover')}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition-colors',
                  viewMode === 'cover' ? 'border-[#2f7dff] text-[#2f7dff]' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t('aiApps.view.grid')}
                onClick={() => setViewMode('grid')}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition-colors',
                  viewMode === 'grid' ? 'border-[#2f7dff] text-[#2f7dff]' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>

              <div className="relative h-8 w-[186px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="ai-apps-search"
                  placeholder={t('aiApps.search')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-full w-full rounded-md border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-[#2f7dff]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label={t('aiApps.clearSearch')}
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-surface-modal py-20 text-muted-foreground">
              <Grid3X3 className="mb-4 h-10 w-10 opacity-50" />
              <p>{searchQuery ? t('aiApps.empty.search') : t('aiApps.empty.category')}</p>
            </div>
          ) : (
            <div data-testid="ai-apps-grid" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  data-testid={`ai-app-card-${app.id}`}
                  onClick={() => setSelectedAppId(app.id)}
                  className="group overflow-hidden rounded-xl bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-surface-modal"
                >
                  <AiAppCover app={app} t={t} />
                  <div className="px-4 pb-4 pt-5">
                    <h2 className="mb-2 line-clamp-1 text-center text-lg font-bold leading-tight text-slate-950 dark:text-foreground">
                      {t(`aiApps.${app.titleKey}`)}
                    </h2>
                    <p className="line-clamp-2 min-h-[44px] text-sm leading-relaxed text-slate-600 dark:text-muted-foreground">
                      {t(`aiApps.${app.descriptionKey}`)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

export default AiApps;
