import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  BadgeCheck,
  Camera,
  Clapperboard,
  Grid3X3,
  ImagePlus,
  Layers3,
  Palette,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AiAppCategory = 'all' | 'ecommerce' | 'media' | 'tools' | 'finance' | 'goddess';
type AiAppIcon = 'image' | 'style' | 'fashion' | 'video' | 'retouch' | 'poster';

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
    id: 'product-main-detail-generator',
    titleKey: 'apps.productMainDetail.title',
    descriptionKey: 'apps.productMainDetail.description',
    category: 'ecommerce',
    icon: 'image',
    coverImage: 'main-detail',
    tags: ['productPhoto', 'detailImage'],
    inputTypes: ['productImage', 'brief'],
    outputTypes: ['mainImage', 'detailImage'],
    enabled: true,
    sortOrder: 10,
  },
  {
    id: 'product-style-replica',
    titleKey: 'apps.styleReplica.title',
    descriptionKey: 'apps.styleReplica.description',
    category: 'ecommerce',
    icon: 'style',
    coverImage: 'style-replica',
    tags: ['styleClone', 'referenceImage'],
    inputTypes: ['referenceImage', 'productImage'],
    outputTypes: ['styledImage'],
    enabled: true,
    sortOrder: 20,
  },
  {
    id: 'fashion-lookbook-generator',
    titleKey: 'apps.fashionLookbook.title',
    descriptionKey: 'apps.fashionLookbook.description',
    category: 'ecommerce',
    icon: 'fashion',
    coverImage: 'fashion-lookbook',
    tags: ['fashion', 'modelSet'],
    inputTypes: ['garmentImage', 'modelPrompt'],
    outputTypes: ['imageSet'],
    enabled: true,
    sortOrder: 30,
  },
  {
    id: 'image-video-generator',
    titleKey: 'apps.imageVideo.title',
    descriptionKey: 'apps.imageVideo.description',
    category: 'ecommerce',
    icon: 'video',
    coverImage: 'image-video',
    tags: ['imageGeneration', 'videoGeneration'],
    inputTypes: ['productImage', 'script'],
    outputTypes: ['image', 'video'],
    enabled: true,
    sortOrder: 40,
  },
  {
    id: 'smart-product-retouch',
    titleKey: 'apps.smartRetouch.title',
    descriptionKey: 'apps.smartRetouch.description',
    category: 'ecommerce',
    icon: 'retouch',
    coverImage: 'smart-retouch',
    tags: ['retouch', 'oneClick'],
    inputTypes: ['productImage'],
    outputTypes: ['retouchedImage'],
    enabled: true,
    sortOrder: 50,
  },
  {
    id: 'product-detail-poster',
    titleKey: 'apps.detailPoster.title',
    descriptionKey: 'apps.detailPoster.description',
    category: 'ecommerce',
    icon: 'poster',
    coverImage: 'detail-poster',
    tags: ['poster', 'copywriting'],
    inputTypes: ['productImage', 'sellingPoints'],
    outputTypes: ['poster'],
    enabled: true,
    sortOrder: 60,
  },
];

const APP_ICONS: Record<AiAppIcon, ComponentType<{ className?: string }>> = {
  image: Camera,
  style: Palette,
  fashion: Layers3,
  video: Clapperboard,
  retouch: WandSparkles,
  poster: Grid3X3,
};

function tokenLabels(t: TFunction<'skills'>, tokens: string[], namespace: 'tags' | 'inputTypes' | 'outputTypes') {
  return tokens.map((token) => t(`aiApps.${namespace}.${token}`, { defaultValue: token }));
}

function AiAppCover({ app, selected }: { app: AiApplication; selected: boolean }) {
  const Icon = APP_ICONS[app.icon];
  return (
    <div
      data-cover={app.coverImage}
      className={cn(
        'relative h-36 overflow-hidden rounded-t-lg border-b border-black/5 dark:border-white/10',
        'bg-[linear-gradient(135deg,rgba(15,23,42,0.08),rgba(59,130,246,0.16),rgba(20,184,166,0.14))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(59,130,246,0.18),rgba(20,184,166,0.12))]',
        selected && 'ring-2 ring-primary/50',
      )}
    >
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(rgba(255,255,255,0.36)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.34)_1px,transparent_1px)] [background-size:22px_22px] dark:opacity-25" />
      <div className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-lg border border-white/60 bg-white/65 text-slate-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div className="absolute bottom-5 left-5 right-5 grid h-16 grid-cols-[1fr_0.72fr] gap-3">
        <div className="rounded-lg border border-white/65 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
          <div className="h-7 border-b border-black/5 dark:border-white/10" />
          <div className="space-y-1.5 p-2">
            <div className="h-1.5 w-4/5 rounded-full bg-slate-700/20 dark:bg-white/25" />
            <div className="h-1.5 w-3/5 rounded-full bg-slate-700/15 dark:bg-white/20" />
          </div>
        </div>
        <div className="rounded-lg border border-white/65 bg-white/55 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
          <div className="h-full rounded-md bg-slate-900/10 dark:bg-white/15" />
        </div>
      </div>
    </div>
  );
}

export function SkillMarketplace() {
  const { t } = useTranslation('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AiAppCategory>('ecommerce');
  const [selectedAppId, setSelectedAppId] = useState('product-main-detail-generator');

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

  return (
    <div data-testid="skills-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6 bg-background dark:bg-background">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-8 py-10 md:px-10 md:py-12">
        <div className="mb-6 flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 data-testid="ai-apps-title" className="mb-3 text-5xl font-serif font-normal tracking-tight text-foreground md:text-6xl">
              {t('aiApps.title')}
            </h1>
            <p className="max-w-2xl text-subtitle font-medium leading-relaxed text-foreground/70">{t('aiApps.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-black/5 bg-surface-modal px-3 py-2 text-meta text-muted-foreground shadow-sm dark:border-white/10">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{t('aiApps.phaseBadge')}</span>
          </div>
        </div>

        <div className="mb-5 shrink-0 space-y-4 border-b border-black/10 pb-5 dark:border-white/10">
          <div className="relative flex h-12 items-center rounded-xl border border-black/5 bg-surface-input px-4 transition-colors focus-within:border-black/10 dark:border-white/10 dark:focus-within:border-white/20">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              data-testid="ai-apps-search"
              placeholder={t('aiApps.search')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="ml-3 h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/45"
            />
            {searchQuery && (
              <button type="button" aria-label={t('aiApps.clearSearch')} onClick={() => setSearchQuery('')} className="ml-2 shrink-0 text-foreground/50 hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div data-testid="ai-apps-category-tabs" className="flex flex-wrap items-center gap-2">
            {AI_APP_CATEGORIES.map((category) => {
              const Icon = category.icon;
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
                    'h-9 rounded-full border px-3 text-meta font-medium shadow-none',
                    active
                      ? 'border-black/10 bg-black/5 text-foreground dark:border-white/10 dark:bg-white/10'
                      : 'border-transparent bg-transparent text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
                  )}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {t(`aiApps.categories.${category.key}`)}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-10 -mr-2">
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Grid3X3 className="mb-4 h-10 w-10 opacity-50" />
              <p>{searchQuery ? t('aiApps.empty.search') : t('aiApps.empty.category')}</p>
            </div>
          ) : (
            <div data-testid="ai-apps-grid" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredApps.map((app) => {
                const selected = selectedAppId === app.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    data-testid={`ai-app-card-${app.id}`}
                    onClick={() => setSelectedAppId(app.id)}
                    className={cn(
                      'group flex min-h-[332px] flex-col overflow-hidden rounded-lg border bg-surface-modal text-left shadow-sm transition-all',
                      'hover:-translate-y-0.5 hover:border-black/15 hover:shadow-md dark:hover:border-white/20',
                      selected ? 'border-primary/35 shadow-md' : 'border-black/5 dark:border-white/10',
                    )}
                  >
                    <AiAppCover app={app} selected={selected} />
                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <Badge className="h-6 rounded-full border-0 bg-black/5 px-2.5 text-2xs font-medium text-foreground/70 shadow-none hover:bg-black/5 dark:bg-white/10">
                          {t(`aiApps.categories.${app.category}`)}
                        </Badge>
                        <div className="grid h-7 w-7 shrink-0 grid-cols-2 gap-0.5 rounded-md border border-black/5 bg-surface-input p-1 dark:border-white/10">
                          <span className="rounded-[2px] bg-primary/65" />
                          <span className="rounded-[2px] bg-emerald-500/65" />
                          <span className="rounded-[2px] bg-amber-500/65" />
                          <span className="rounded-[2px] bg-foreground/25" />
                        </div>
                      </div>

                      <h2 className="mb-2 text-base font-semibold leading-snug text-foreground">{t(`aiApps.${app.titleKey}`)}</h2>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{t(`aiApps.${app.descriptionKey}`)}</p>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {tokenLabels(t, app.tags, 'tags').map((tag) => (
                          <span key={tag} className="rounded-full bg-black/[0.04] px-2 py-1 text-2xs font-medium text-foreground/60 dark:bg-white/[0.07]">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                        <span className="text-tiny font-medium text-muted-foreground">
                          {t('aiApps.ioSummary', {
                            input: tokenLabels(t, app.inputTypes, 'inputTypes').join(' / '),
                            output: tokenLabels(t, app.outputTypes, 'outputTypes').join(' / '),
                          })}
                        </span>
                        <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-1 text-2xs font-semibold text-green-700 dark:text-green-400">
                          {app.enabled ? t('aiApps.status.ready') : t('aiApps.status.placeholder')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SkillMarketplace;
