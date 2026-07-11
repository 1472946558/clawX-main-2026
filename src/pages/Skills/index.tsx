import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type {
  SkillMarketplaceItem,
  SkillMarketplaceReviewStatus,
} from '@shared/host-api/contract';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  Flame,
  GitBranch,
  Grid3X3,
  Loader2,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  PackagePlus,
  UploadCloud,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { hostApi } from '@/lib/host-api';
import { cn } from '@/lib/utils';

type SkillCategory =
  | 'all'
  | 'hot'
  | 'safe'
  | 'developer'
  | 'content'
  | 'ai'
  | 'productivity'
  | 'analysis'
  | 'communication'
  | 'installed';

type SkillStatus = 'available' | 'installed' | 'planned';
type AdminReviewFilter = SkillMarketplaceReviewStatus | 'all';

type MarketplaceSkillCard = SkillMarketplaceItem & {
  category: Exclude<SkillCategory, 'all' | 'installed'>;
  installStatus: SkillStatus;
};

type MarketplaceAdminDraft = {
  name: string;
  description: string;
  category: MarketplaceSkillCard['category'];
  tags: string;
  license: string;
  commercialUseAllowed: boolean;
  selectedInstallTarget: string;
};

function getPublicSourceKey(skill: MarketplaceSkillCard): 'verified' | 'clawhub' | 'local' {
  if (skill.importSource === 'clawhub') return 'clawhub';
  if (skill.importSource === 'manual') return 'local';
  return 'verified';
}

const SKILL_CATEGORIES: Array<{ key: SkillCategory; icon: ComponentType<{ className?: string }> }> = [
  { key: 'all', icon: Grid3X3 },
  { key: 'hot', icon: Flame },
  { key: 'safe', icon: ShieldCheck },
  { key: 'developer', icon: Code2 },
  { key: 'content', icon: FileText },
  { key: 'ai', icon: Bot },
  { key: 'productivity', icon: Workflow },
  { key: 'analysis', icon: BarChart3 },
  { key: 'communication', icon: MessageSquare },
  { key: 'installed', icon: PackageCheck },
];

const FALLBACK_MARKETPLACE_SKILLS: MarketplaceSkillCard[] = [
  {
    id: 'spec-driven-development',
    name: 'Spec-Driven Development',
    description: 'Turn product ideas into clear implementation specs before code is written, with goals, scope, commands, tests, and boundaries.',
    category: 'hot',
    iconText: 'S',
    tags: ['planning', 'codingAgent'],
    rating: '4.9',
    downloads: '18.6万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'installed',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/spec-driven-development',
  },
  {
    id: 'security-and-hardening',
    name: 'Security and Hardening',
    description: 'Security-first workflow for user input, authentication, sensitive data, dependency risk, LLM output, and external integrations.',
    category: 'safe',
    iconText: 'S',
    tags: ['rules', 'qualityGate'],
    rating: '4.8',
    downloads: '12.7万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/security-and-hardening',
  },
  {
    id: 'code-review-and-quality',
    name: 'Code Review and Quality',
    description: 'Multi-axis code review for correctness, readability, architecture, security, and performance before changes are merged.',
    category: 'developer',
    iconText: 'C',
    tags: ['review', 'qualityGate'],
    rating: '4.8',
    downloads: '11.3万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/code-review-and-quality',
  },
  {
    id: 'frontend-ui-engineering',
    name: 'Frontend UI Engineering',
    description: 'Frontend implementation workflow for component structure, design systems, state, responsiveness, and accessibility checks.',
    category: 'developer',
    iconText: 'F',
    tags: ['ide', 'bestPractice'],
    rating: '4.7',
    downloads: '9.8万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/frontend-ui-engineering',
  },
  {
    id: 'documentation-and-adrs',
    name: 'Documentation and ADRs',
    description: 'Create useful project documentation and architecture decision records that explain why decisions were made and how systems behave.',
    category: 'content',
    iconText: 'D',
    tags: ['docs', 'writing'],
    rating: '4.6',
    downloads: '8.2万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/documentation-and-adrs',
  },
  {
    id: 'context-engineering',
    name: 'Context Engineering',
    description: 'Feed agents the right project information at the right time through rules files, context packing, and integration guidance.',
    category: 'ai',
    iconText: 'A',
    tags: ['codex', 'claude', 'workflow'],
    rating: '4.7',
    downloads: '10.5万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/context-engineering',
  },
  {
    id: 'planning-and-task-breakdown',
    name: 'Planning and Task Breakdown',
    description: 'Break large goals into small, ordered, verifiable tasks with clear acceptance criteria and dependency sequencing.',
    category: 'productivity',
    iconText: 'P',
    tags: ['planning', 'workflow'],
    rating: '4.7',
    downloads: '9.1万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/planning-and-task-breakdown',
  },
  {
    id: 'observability-and-instrumentation',
    name: 'Observability and Instrumentation',
    description: 'Add logs, metrics, traces, dashboards, and symptom-based alerts so production behavior can be understood and debugged.',
    category: 'analysis',
    iconText: 'O',
    tags: ['analysis', 'qualityGate'],
    rating: '4.5',
    downloads: '6.8万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'planned',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/observability-and-instrumentation',
  },
  {
    id: 'interview-me',
    name: 'Interview Me',
    description: 'A structured one-question-at-a-time collaboration skill for clarifying vague requests before planning or implementation starts.',
    category: 'communication',
    iconText: 'I',
    tags: ['planning', 'workflow'],
    rating: '4.6',
    downloads: '7.4万',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/interview-me',
  },
];

const ICON_COLORS: Record<string, string> = {
  A: 'bg-cyan-100 text-cyan-700',
  C: 'bg-blue-100 text-blue-700',
  D: 'bg-amber-100 text-amber-700',
  I: 'bg-rose-100 text-rose-700',
  O: 'bg-indigo-100 text-indigo-700',
  P: 'bg-teal-100 text-teal-700',
  S: 'bg-emerald-100 text-emerald-700',
  F: 'bg-sky-100 text-sky-700',
  M: 'bg-violet-100 text-violet-700',
};

const STATUS_COLORS: Record<SkillStatus, string> = {
  available: 'border-blue-100 bg-blue-50 text-blue-700',
  installed: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  planned: 'border-slate-200 bg-slate-50 text-slate-600',
};

const MARKETPLACE_ADMIN_CATEGORIES: MarketplaceSkillCard['category'][] = [
  'hot',
  'safe',
  'developer',
  'content',
  'ai',
  'productivity',
  'analysis',
  'communication',
];

const REVIEW_FILTERS: AdminReviewFilter[] = ['all', 'pending', 'approved', 'rejected'];
const SHOW_MARKETPLACE_ADMIN = false;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
  return `${value} B`;
}

function getSkillVersion(skill: MarketplaceSkillCard): string {
  const versionSeed = Math.max(1, skill.id.length % 9);
  return skill.installStatus === 'installed' ? `1.${versionSeed}.0` : `0.${versionSeed}.2`;
}

export function Skills() {
  const { t } = useTranslation('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory>('all');
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkillCard[]>(FALLBACK_MARKETPLACE_SKILLS);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSkills, setAdminSkills] = useState<MarketplaceSkillCard[]>([]);
  const [adminReviewFilter, setAdminReviewFilter] = useState<AdminReviewFilter>('all');
  const [selectedAdminSkillId, setSelectedAdminSkillId] = useState<string>('');
  const [adminDraft, setAdminDraft] = useState<MarketplaceAdminDraft | null>(null);
  const [importSource, setImportSource] = useState<'github' | 'clawhub'>('github');
  const [repositoryUrl, setRepositoryUrl] = useState('https://github.com/VoltAgent/awesome-agent-skills');
  const [clawHubQuery, setClawHubQuery] = useState('agent');
  const [previewSkills, setPreviewSkills] = useState<MarketplaceSkillCard[]>([]);
  const [rejectedPreviewSkills, setRejectedPreviewSkills] = useState<MarketplaceSkillCard[]>([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [marketplaceMessage, setMarketplaceMessage] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [installingSkillId, setInstallingSkillId] = useState<string>('');
  const [selectedMarketplaceSkillId, setSelectedMarketplaceSkillId] = useState<string>('');

  const refreshMarketplaceSkills = useCallback(async () => {
    const result = await hostApi.skills.marketplaceList();
    if (result.success && Array.isArray(result.skills) && result.skills.length > 0) {
      setMarketplaceSkills(result.skills as MarketplaceSkillCard[]);
    }
  }, []);

  const refreshAdminSkills = useCallback(async (reviewStatus: AdminReviewFilter = adminReviewFilter) => {
    const result = await hostApi.skills.marketplaceAdminList({ reviewStatus });
    if (result.success && Array.isArray(result.skills)) {
      const skills = result.skills as MarketplaceSkillCard[];
      setAdminSkills(skills);
      setSelectedAdminSkillId((current) => current || skills[0]?.id || '');
    } else if (result.error) {
      setAdminMessage(result.error);
    }
  }, [adminReviewFilter]);

  useEffect(() => {
    void refreshMarketplaceSkills().catch(() => {
      // Keep the local fallback so the marketplace remains browsable offline.
    });
  }, [refreshMarketplaceSkills]);

  useEffect(() => {
    if (!adminOpen) return;
    void refreshAdminSkills();
  }, [adminOpen, refreshAdminSkills]);

  const installedCount = marketplaceSkills.filter((skill) => skill.installStatus === 'installed').length;

  const selectedAdminSkill = useMemo(
    () => adminSkills.find((skill) => skill.id === selectedAdminSkillId) || null,
    [adminSkills, selectedAdminSkillId],
  );

  const selectedMarketplaceSkill = useMemo(
    () => marketplaceSkills.find((skill) => skill.id === selectedMarketplaceSkillId) || null,
    [marketplaceSkills, selectedMarketplaceSkillId],
  );

  useEffect(() => {
    if (!selectedAdminSkill) {
      setAdminDraft(null);
      return;
    }
    setAdminDraft({
      name: selectedAdminSkill.name,
      description: selectedAdminSkill.description,
      category: selectedAdminSkill.category,
      tags: selectedAdminSkill.tags.join(', '),
      license: selectedAdminSkill.license,
      commercialUseAllowed: selectedAdminSkill.commercialUseAllowed,
      selectedInstallTarget: selectedAdminSkill.selectedInstallTarget || selectedAdminSkill.installTargets?.[0]?.skillPath || '',
    });
  }, [selectedAdminSkill]);

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return marketplaceSkills.filter((skill) => {
      const matchesCategory =
        categoryFilter === 'all'
        || (categoryFilter === 'installed' ? skill.installStatus === 'installed' : skill.category === categoryFilter);
      if (!matchesCategory) return false;
      if (!query) return true;
      const haystack = [
        skill.name,
        skill.description,
        t(`marketplace.categories.${skill.category}`),
        t(`marketplace.publicSource.${getPublicSourceKey(skill)}`),
        ...skill.tags.map((tag) => t(`marketplace.tags.${tag}`, { defaultValue: tag })),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [categoryFilter, marketplaceSkills, searchQuery, t]);

  const handlePreviewImport = async () => {
    setAdminBusy(true);
    setAdminMessage('');
    try {
      const result = await hostApi.skills.marketplaceImportPreview(
        importSource === 'github'
          ? { source: 'github', repositoryUrl }
          : { source: 'clawhub', query: clawHubQuery, limit: 10 },
      );
      if (!result.success) {
        setAdminMessage(result.error || t('marketplace.admin.previewFailed'));
        return;
      }
      setPreviewSkills((result.skills || []) as MarketplaceSkillCard[]);
      setRejectedPreviewSkills((result.rejected || []) as MarketplaceSkillCard[]);
      setAdminMessage(t('marketplace.admin.previewReady', {
        count: result.skills?.length || 0,
        rejected: result.rejected?.length || 0,
      }));
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : t('marketplace.admin.previewFailed'));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleCommitPreview = async () => {
    if (previewSkills.length === 0) return;
    setAdminBusy(true);
    setAdminMessage('');
    try {
      const result = await hostApi.skills.marketplaceImportCommit({ skills: previewSkills });
      if (!result.success) {
        setAdminMessage(result.error || t('marketplace.admin.commitFailed'));
        return;
      }
      setAdminMessage(t('marketplace.admin.commitReady', { count: result.skills?.length || 0 }));
      setPreviewSkills([]);
      await refreshAdminSkills('pending');
      setAdminReviewFilter('pending');
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : t('marketplace.admin.commitFailed'));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleSaveAdminSkill = async () => {
    if (!selectedAdminSkill || !adminDraft) return;
    setAdminBusy(true);
    setAdminMessage('');
    try {
      const result = await hostApi.skills.marketplaceUpdate({
        id: selectedAdminSkill.id,
        patch: {
          name: adminDraft.name,
          description: adminDraft.description,
          category: adminDraft.category,
          tags: adminDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          license: adminDraft.license,
          commercialUseAllowed: adminDraft.commercialUseAllowed,
          selectedInstallTarget: adminDraft.selectedInstallTarget,
        },
      });
      if (!result.success) {
        setAdminMessage(result.error || t('marketplace.admin.saveFailed'));
        return;
      }
      setAdminMessage(t('marketplace.admin.saveReady'));
      await refreshAdminSkills(adminReviewFilter);
      await refreshMarketplaceSkills();
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : t('marketplace.admin.saveFailed'));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleReviewAdminSkill = async (reviewStatus: SkillMarketplaceReviewStatus) => {
    if (!selectedAdminSkill) return;
    setAdminBusy(true);
    setAdminMessage('');
    try {
      const result = await hostApi.skills.marketplaceReview({ id: selectedAdminSkill.id, reviewStatus });
      if (!result.success) {
        setAdminMessage(result.error || t('marketplace.admin.reviewFailed'));
        return;
      }
      setAdminMessage(t(`marketplace.admin.reviewReady.${reviewStatus}`));
      await refreshAdminSkills(adminReviewFilter);
      await refreshMarketplaceSkills();
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : t('marketplace.admin.reviewFailed'));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleMarketplaceAction = async (skill: MarketplaceSkillCard) => {
    setMarketplaceMessage('');
    setInstallingSkillId(skill.id);
    try {
      const result = await hostApi.skills.marketplaceInstall({ id: skill.id });
      if (!result.success) {
        setMarketplaceMessage(result.error || t('marketplace.action.installFailed'));
        return;
      }
      setMarketplaceMessage(result.installPath
        ? t('marketplace.action.installReadyWithPath', { path: result.installPath })
        : t('marketplace.action.installReady'));
      await refreshMarketplaceSkills();
      if (adminOpen) {
        await refreshAdminSkills(adminReviewFilter);
      }
    } catch (error) {
      setMarketplaceMessage(error instanceof Error ? error.message : t('marketplace.action.installFailed'));
    } finally {
      setInstallingSkillId('');
    }
  };

  const handleMarketplaceUse = async (skill: MarketplaceSkillCard) => {
    setMarketplaceMessage('');
    try {
      const result = await hostApi.skills.clawhubOpenSkillReadme({
        skillKey: skill.id,
        slug: skill.id,
        baseDir: skill.installPath,
      });
      setMarketplaceMessage(result.success
        ? t('marketplace.action.useReady')
        : result.error || t('marketplace.action.useFailed'));
    } catch (error) {
      setMarketplaceMessage(error instanceof Error ? error.message : t('marketplace.action.useFailed'));
    }
  };

  const handleDetailAction = (skill: MarketplaceSkillCard) => {
    if (skill.installStatus === 'installed') {
      void handleMarketplaceUse(skill);
      return;
    }
    void handleMarketplaceAction(skill);
  };

  return (
    <div data-testid="skills-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6 bg-[#eef4ff] text-slate-950 dark:bg-background dark:text-foreground">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6 dark:border-white/10 dark:bg-background">
        <h1 data-testid="skills-marketplace-title" className="text-xl font-semibold tracking-tight text-blue-700 dark:text-blue-400">
          {t('title')}
        </h1>
        <div className="flex items-center gap-4">
          {SHOW_MARKETPLACE_ADMIN && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="skills-marketplace-manage"
              onClick={() => setAdminOpen(true)}
              className="h-9 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-foreground"
            >
              <Settings2 className="mr-1.5 h-4 w-4" />
              {t('marketplace.manage')}
            </Button>
          )}
          <button className="h-9 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-foreground">
            {t('marketplace.languagePill')}
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            66
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[936px] flex-1 flex-col px-6 py-6">
        <div className="mb-5 shrink-0">
          <div className="relative flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition-colors focus-within:border-blue-300 dark:border-white/10 dark:bg-white/5">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              data-testid="skills-marketplace-search"
              placeholder={t('search')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="ml-3 h-full flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={t('marketplace.clearSearch')}
                onClick={() => setSearchQuery('')}
                className="ml-2 shrink-0 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div data-testid="skills-marketplace-category-tabs" className="mb-6 flex shrink-0 flex-wrap items-center gap-2.5">
          {SKILL_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const active = categoryFilter === category.key;
            const hot = category.key === 'hot';
            return (
              <Button
                key={category.key}
                type="button"
                variant="ghost"
                size="sm"
                data-testid={`skills-marketplace-category-${category.key}`}
                onClick={() => setCategoryFilter(category.key)}
                className={cn(
                  'h-8 rounded-full border px-4 text-sm font-medium shadow-sm transition-colors',
                  active && hot
                    ? 'border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-50'
                    : active
                      ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-50'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-foreground/80',
                )}
              >
                <Icon className={cn('mr-1.5 h-3.5 w-3.5', hot && 'text-orange-500')} />
                {t(`marketplace.categories.${category.key}`)}
                {category.key === 'installed' ? ` (${installedCount})` : null}
              </Button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-8">
          {marketplaceMessage && (
            <p data-testid="skills-marketplace-message" className="mb-4 rounded-lg border border-blue-100 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
              {marketplaceMessage}
            </p>
          )}
          {filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <PackageCheck className="mb-4 h-10 w-10 opacity-50" />
              <p>{t('marketplace.noResults')}</p>
            </div>
          ) : (
            <div data-testid="skills-marketplace-grid" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => (
                <article
                  key={skill.id}
                  data-testid={`skill-marketplace-card-${skill.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMarketplaceSkillId(skill.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedMarketplaceSkillId(skill.id);
                    }
                  }}
                  className="group flex min-h-[154px] cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-surface-modal"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold', ICON_COLORS[skill.iconText] ?? 'bg-sky-100 text-blue-600')}>
                      {skill.iconText}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-slate-950 dark:text-foreground">
                          {skill.name}
                        </h2>
                        <span
                          data-testid={`skill-marketplace-status-${skill.id}`}
                          className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
                            STATUS_COLORS[skill.installStatus],
                          )}
                        >
                          {t(`marketplace.installStatus.${skill.installStatus}`)}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {skill.tags.slice(0, 1).map((tag) => (
                          <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] leading-5 text-slate-600 dark:bg-white/10 dark:text-foreground/70">
                            {t(`marketplace.tags.${tag}`, { defaultValue: tag })}
                          </span>
                        ))}
                        <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{skill.rating}</span>
                        <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{skill.downloads}</span>
                      </div>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-sm leading-6 text-slate-600 dark:text-muted-foreground">
                    {skill.description}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                    <span className="truncate text-[11px] font-medium text-slate-500">
                      {t(`marketplace.publicSource.${getPublicSourceKey(skill)}`)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {skill.installStatus === 'installed' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`skill-marketplace-action-${skill.id}`}
                          className="h-7 rounded-lg px-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          title={t('marketplace.action.use')}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarketplaceUse(skill);
                          }}
                        >
                          <PackageCheck className="mr-1 h-3.5 w-3.5" />
                          {t('marketplace.action.use')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`skill-marketplace-action-${skill.id}`}
                          disabled={installingSkillId === skill.id}
                          className="h-7 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title={t('marketplace.action.install')}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarketplaceAction(skill);
                          }}
                        >
                          {installingSkillId === skill.id
                            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            : <PackagePlus className="mr-1 h-3.5 w-3.5" />}
                          {t('marketplace.action.install')}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedMarketplaceSkill && (
        <div
          data-testid="skills-marketplace-detail-overlay"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10"
          onClick={() => setSelectedMarketplaceSkillId('')}
        >
          <section
            data-testid="skills-marketplace-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skills-marketplace-detail-title"
            className="flex max-h-[calc(100vh-5rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-md bg-white shadow-2xl dark:bg-surface-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-5 py-4">
              <h2 id="skills-marketplace-detail-title" className="text-lg font-medium text-slate-900 dark:text-foreground">
                {t('marketplace.detail.title')}
              </h2>
              <button
                type="button"
                data-testid="skills-marketplace-detail-close"
                aria-label={t('marketplace.detail.close')}
                onClick={() => setSelectedMarketplaceSkillId('')}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <div className="mb-4 flex items-start gap-3">
                <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-xl font-semibold', ICON_COLORS[selectedMarketplaceSkill.iconText] ?? 'bg-sky-100 text-blue-600')}>
                  {selectedMarketplaceSkill.iconText}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="truncate text-lg font-semibold text-slate-950 dark:text-foreground">
                    {selectedMarketplaceSkill.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{selectedMarketplaceSkill.rating}</span>
                    <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{selectedMarketplaceSkill.downloads}</span>
                    <span>{t(`marketplace.installStatus.${selectedMarketplaceSkill.installStatus}`)}</span>
                  </div>
                </div>
              </div>

              <Badge variant="secondary" className="mb-4 rounded px-2 py-0.5 text-xs font-normal">
                {t(`marketplace.categories.${selectedMarketplaceSkill.category}`)}
              </Badge>

              <dl className="mb-5 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-slate-500">{t('marketplace.detail.category')}</dt>
                <dd className="text-slate-800 dark:text-foreground">{t(`marketplace.categories.${selectedMarketplaceSkill.category}`)}</dd>
                <dt className="text-slate-500">{t('marketplace.detail.version')}</dt>
                <dd className="font-mono text-slate-800 dark:text-foreground">{getSkillVersion(selectedMarketplaceSkill)}</dd>
              </dl>

              <div className="space-y-5 text-sm text-slate-700 dark:text-muted-foreground">
                <section>
                  <h4 className="mb-2 font-semibold text-slate-900 dark:text-foreground">{t('marketplace.detail.intro')}</h4>
                  <p className="leading-7">{selectedMarketplaceSkill.description}</p>
                </section>

                <section>
                  <h4 className="mb-2 font-semibold text-slate-900 dark:text-foreground">{t('marketplace.detail.details')}</h4>
                  <pre className="overflow-x-auto rounded-md bg-slate-900 px-4 py-3 text-xs leading-6 text-white">
                    <code>{[
                      t('marketplace.detail.commands.install', { id: selectedMarketplaceSkill.id }),
                      t('marketplace.detail.commands.use', { id: selectedMarketplaceSkill.id }),
                    ].join('\n')}</code>
                  </pre>
                </section>

                <section>
                  <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-foreground">{t('marketplace.detail.requirements')}</h4>
                  <ul className="list-disc space-y-1 pl-5 leading-6">
                    <li>{t('marketplace.detail.requirementDesktop')}</li>
                    <li>{t('marketplace.detail.requirementRuntime')}</li>
                    <li>{t('marketplace.detail.requirementEnabled')}</li>
                  </ul>
                </section>

                <section>
                  <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-foreground">{t('marketplace.detail.entryPoint')}</h4>
                  <ul className="list-disc space-y-1 pl-5 leading-6">
                    <li>
                      <span className="font-semibold">{t('marketplace.detail.entrySkill')}</span>
                      {' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-white/10 dark:text-foreground">{selectedMarketplaceSkill.id}</code>
                    </li>
                    <li>
                      <span className="font-semibold">{t('marketplace.detail.entryRuntime')}</span>
                      {' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-white/10 dark:text-foreground">OpenClaw</code>
                    </li>
                  </ul>
                </section>

                <section>
                  <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-foreground">{t('marketplace.detail.tags')}</h4>
                  <p className="flex flex-wrap gap-x-2 gap-y-1 leading-6">
                    {selectedMarketplaceSkill.tags.map((tag) => (
                      <span key={tag}>#{t(`marketplace.tags.${tag}`, { defaultValue: tag })}</span>
                    ))}
                  </p>
                </section>

                <p className="pt-1 text-sm">
                  {t('marketplace.detail.homepage')}:
                  {' '}
                  <span className="text-blue-600 dark:text-blue-400">
                    {t(`marketplace.publicSource.${getPublicSourceKey(selectedMarketplaceSkill)}`)}
                  </span>
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 dark:border-white/10 dark:bg-surface-modal">
              <Button
                type="button"
                data-testid="skills-marketplace-detail-action"
                disabled={installingSkillId === selectedMarketplaceSkill.id}
                onClick={() => handleDetailAction(selectedMarketplaceSkill)}
                className="h-10 w-full rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                {installingSkillId === selectedMarketplaceSkill.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedMarketplaceSkill.installStatus === 'installed'
                  ? t('marketplace.action.use')
                  : t('marketplace.action.install')}
              </Button>
            </div>
          </section>
        </div>
      )}

      {SHOW_MARKETPLACE_ADMIN && (
      <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
        <SheetContent
          side="right"
          data-testid="skills-marketplace-admin-sheet"
          className="flex w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
        >
          <SheetHeader className="border-b border-slate-200 px-6 py-5 dark:border-white/10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-blue-600" />
              {t('marketplace.admin.title')}
            </SheetTitle>
            <SheetDescription>
              {t('marketplace.admin.description')}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fbff] px-6 py-5 dark:bg-background">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-modal">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-foreground">
                  {t('marketplace.admin.importTitle')}
                </h2>
                <Select
                  data-testid="skills-marketplace-admin-import-source"
                  value={importSource}
                  onChange={(event) => setImportSource(event.target.value as 'github' | 'clawhub')}
                  className="h-8 w-36"
                >
                  <option value="github">{t('marketplace.admin.sourceGithub')}</option>
                  <option value="clawhub">{t('marketplace.admin.sourceClawHub')}</option>
                </Select>
              </div>

              <div className="flex flex-col gap-3">
                {importSource === 'github' ? (
                  <Input
                    data-testid="skills-marketplace-admin-github-url"
                    value={repositoryUrl}
                    onChange={(event) => setRepositoryUrl(event.target.value)}
                    placeholder={t('marketplace.admin.githubPlaceholder')}
                  />
                ) : (
                  <Input
                    data-testid="skills-marketplace-admin-clawhub-query"
                    value={clawHubQuery}
                    onChange={(event) => setClawHubQuery(event.target.value)}
                    placeholder={t('marketplace.admin.clawHubPlaceholder')}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="skills-marketplace-admin-preview"
                    disabled={adminBusy}
                    onClick={() => void handlePreviewImport()}
                  >
                    {adminBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <GitBranch className="mr-1.5 h-4 w-4" />}
                    {t('marketplace.admin.preview')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="skills-marketplace-admin-commit"
                    disabled={adminBusy || previewSkills.length === 0}
                    onClick={() => void handleCommitPreview()}
                  >
                    <UploadCloud className="mr-1.5 h-4 w-4" />
                    {t('marketplace.admin.commit')}
                  </Button>
                </div>
              </div>

              {(previewSkills.length > 0 || rejectedPreviewSkills.length > 0) && (
                <div data-testid="skills-marketplace-admin-preview-list" className="mt-4 space-y-2">
                  {previewSkills.map((skill) => (
                    <div key={skill.id} className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{skill.name}</span>
                        <Badge variant="outline">{skill.license}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{skill.source}</p>
                    </div>
                  ))}
                  {rejectedPreviewSkills.map((skill) => (
                    <div key={skill.id} className="rounded-md border border-red-100 bg-red-50/70 px-3 py-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{skill.name}</span>
                        <Badge variant="destructive">{skill.license}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-red-600">{t('marketplace.admin.rejectedPreview')}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-modal">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-foreground">
                  {t('marketplace.admin.reviewTitle')}
                </h2>
                <div className="flex items-center gap-2">
                  <Select
                    data-testid="skills-marketplace-admin-review-filter"
                    value={adminReviewFilter}
                    onChange={(event) => {
                      const next = event.target.value as AdminReviewFilter;
                      setAdminReviewFilter(next);
                      void refreshAdminSkills(next);
                    }}
                    className="h-8 w-36"
                  >
                    {REVIEW_FILTERS.map((filter) => (
                      <option key={filter} value={filter}>
                        {t(`marketplace.admin.reviewFilters.${filter}`)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    title={t('marketplace.admin.refresh')}
                    onClick={() => void refreshAdminSkills(adminReviewFilter)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div data-testid="skills-marketplace-admin-list" className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {adminSkills.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                      {t('marketplace.admin.empty')}
                    </p>
                  ) : adminSkills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      data-testid={`skills-marketplace-admin-item-${skill.id}`}
                      onClick={() => setSelectedAdminSkillId(skill.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        selectedAdminSkillId === skill.id
                          ? 'border-blue-200 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span className="block truncate font-medium">{skill.name}</span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{skill.license}</span>
                        <span>{t(`marketplace.admin.reviewStatus.${skill.reviewStatus}`)}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {selectedAdminSkill && adminDraft ? (
                  <div data-testid="skills-marketplace-admin-editor" className="space-y-3">
                    <Input
                      data-testid="skills-marketplace-admin-name"
                      value={adminDraft.name}
                      onChange={(event) => setAdminDraft({ ...adminDraft, name: event.target.value })}
                    />
                    <Textarea
                      data-testid="skills-marketplace-admin-description"
                      value={adminDraft.description}
                      onChange={(event) => setAdminDraft({ ...adminDraft, description: event.target.value })}
                      className="min-h-[92px]"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        data-testid="skills-marketplace-admin-category"
                        value={adminDraft.category}
                        onChange={(event) => setAdminDraft({ ...adminDraft, category: event.target.value as MarketplaceSkillCard['category'] })}
                      >
                        {MARKETPLACE_ADMIN_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {t(`marketplace.categories.${category}`)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        data-testid="skills-marketplace-admin-license"
                        value={adminDraft.license}
                        onChange={(event) => setAdminDraft({ ...adminDraft, license: event.target.value })}
                        placeholder={t('marketplace.admin.licensePlaceholder')}
                      />
                    </div>
                    <Input
                      data-testid="skills-marketplace-admin-tags"
                      value={adminDraft.tags}
                      onChange={(event) => setAdminDraft({ ...adminDraft, tags: event.target.value })}
                      placeholder={t('marketplace.admin.tagsPlaceholder')}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-foreground">
                      <input
                        data-testid="skills-marketplace-admin-commercial"
                        type="checkbox"
                        checked={adminDraft.commercialUseAllowed}
                        onChange={(event) => setAdminDraft({ ...adminDraft, commercialUseAllowed: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {t('marketplace.admin.commercialUse')}
                    </label>
                    {selectedAdminSkill.importSource === 'github' && (
                      <label className="block text-sm text-slate-700 dark:text-foreground">
                        <span className="mb-1 block text-xs font-medium text-slate-500">
                          {t('marketplace.admin.installTarget')}
                        </span>
                        {selectedAdminSkill.installTargets && selectedAdminSkill.installTargets.length > 0 ? (
                          <Select
                            data-testid="skills-marketplace-admin-install-target"
                            value={adminDraft.selectedInstallTarget}
                            onChange={(event) => setAdminDraft({ ...adminDraft, selectedInstallTarget: event.target.value })}
                            className="h-9 w-full"
                          >
                            {selectedAdminSkill.installTargets.map((target) => (
                              <option key={target.skillPath || 'root'} value={target.skillPath}>
                                {target.skillPath || t('marketplace.admin.repositoryRoot')} · {t('marketplace.admin.fileCount', { count: target.fileCount })} · {formatBytes(target.totalBytes)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <p data-testid="skills-marketplace-admin-install-target-empty" className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                            {t('marketplace.admin.installTargetEmpty')}
                          </p>
                        )}
                      </label>
                    )}
                    <div data-testid="skills-marketplace-admin-audit" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5">
                      <div className="mb-1 font-medium text-slate-700 dark:text-foreground">
                        {t('marketplace.admin.auditTitle')}
                      </div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        <span>{t('marketplace.admin.auditSource')}: {selectedAdminSkill.importSource}</span>
                        <span>{t('marketplace.admin.auditStatus')}: {t(`marketplace.installStatus.${selectedAdminSkill.installStatus}`)}</span>
                        <span className="truncate">{t('marketplace.admin.auditInstallPath')}: {selectedAdminSkill.installPath || t('marketplace.admin.auditEmpty')}</span>
                        <span>{t('marketplace.admin.auditInstalledAt')}: {selectedAdminSkill.installedAt || t('marketplace.admin.auditEmpty')}</span>
                      </div>
                      {selectedAdminSkill.installError && (
                        <p className="mt-2 text-red-600">
                          {t('marketplace.admin.auditInstallError')}: {selectedAdminSkill.installError}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        data-testid="skills-marketplace-admin-save"
                        disabled={adminBusy}
                        onClick={() => void handleSaveAdminSkill()}
                      >
                        {t('marketplace.admin.save')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="skills-marketplace-admin-approve"
                        disabled={adminBusy}
                        onClick={() => void handleReviewAdminSkill('approved')}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        {t('marketplace.admin.approve')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="skills-marketplace-admin-reject"
                        disabled={adminBusy}
                        onClick={() => void handleReviewAdminSkill('rejected')}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        {t('marketplace.admin.reject')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 px-3 py-12 text-center text-sm text-slate-500">
                    {t('marketplace.admin.selectEmpty')}
                  </p>
                )}
              </div>
            </section>

            {adminMessage && (
              <p data-testid="skills-marketplace-admin-message" className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-surface-modal">
                {adminMessage}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      )}
    </div>
  );
}

export default Skills;
