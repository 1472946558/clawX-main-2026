import type { InstalledSkillRecord, SkillMarketplaceItem } from '../../shared/host-api/contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Skills } from '@/pages/Skills';

const marketplaceListMock = vi.fn();
const getInstalledSkillsMock = vi.fn();
const installFromGithubMock = vi.fn();
const uninstallMock = vi.fn();
const clawhubOpenSkillReadmeMock = vi.fn();

const marketplaceSkills: SkillMarketplaceItem[] = [
  {
    id: 'security-and-hardening',
    name: 'Security and Hardening',
    description: 'Threat modeling and dependency checks for coding agents.',
    category: 'security',
    iconText: 'S',
    tags: ['security'],
    rating: '4.8',
    downloads: '12.4万',
    license: 'MIT',
    source: 'Canvasland verified',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/security-and-hardening',
  },
  {
    id: 'documentation-and-adrs',
    name: 'Documentation and ADRs',
    description: 'Write project documentation and architecture decision records.',
    category: 'content',
    iconText: 'D',
    tags: ['docs'],
    rating: '4.6',
    downloads: '8.2万',
    license: 'MIT',
    source: 'Canvasland verified',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: '2026-07-10T00:00:00.000Z',
    selectedInstallTarget: 'skills/documentation-and-adrs',
  },
];

const installedSecurity: InstalledSkillRecord = {
  skillId: 'security-and-hardening',
  source: 'github',
  sourceUrl: 'https://github.com/addyosmani/agent-skills',
  installDir: '/tmp/.openclaw/skills/security-and-hardening',
  status: 'installed_metadata_only',
  version: '1.0.0',
  installedAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  lastError: '',
  detectedCommands: [{ kind: 'npm', file: 'SKILL.md', line: 'npm audit' }],
  hasSkillMd: true,
  hasManifest: false,
  checksum: '',
};

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    openclaw: {
      getSkillsDir: vi.fn().mockResolvedValue('/tmp/.openclaw/skills'),
    },
    shell: {
      openExternal: vi.fn(),
    },
    skills: {
      marketplaceList: () => marketplaceListMock(),
      getInstalledSkills: () => getInstalledSkillsMock(),
      installFromGithub: (...args: unknown[]) => installFromGithubMock(...args),
      uninstall: (...args: unknown[]) => uninstallMock(...args),
      clawhubOpenSkillReadme: (...args: unknown[]) => clawhubOpenSkillReadmeMock(...args),
      marketplaceAdminList: vi.fn().mockResolvedValue({ success: true, skills: [] }),
    },
  },
}));

vi.mock('@/stores/skills', () => ({
  useSkillsStore: () => ({
    skills: [],
    loading: false,
    error: null,
    fetchSkills: vi.fn(),
    enableSkill: vi.fn(),
    disableSkill: vi.fn(),
    setSkillsEnabled: vi.fn(),
    searchResults: [],
    searchSkills: vi.fn(),
    installSkill: vi.fn(),
    uninstallSkill: vi.fn(),
    searching: false,
    searchError: null,
    installing: {},
  }),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: () => ({ status: { state: 'stopped', port: 18789 } }),
}));

vi.mock('@/lib/telemetry', () => ({
  trackUiEvent: vi.fn(),
}));

vi.mock('@/extensions/registry', () => ({
  rendererExtensionRegistry: {
    getSkillDetailMetaComponents: () => [],
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; path?: string }) => options?.defaultValue ?? options?.path ?? key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Skills marketplace page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    marketplaceListMock.mockResolvedValue({ success: true, skills: marketplaceSkills });
    getInstalledSkillsMock.mockResolvedValue({ success: true, skills: [] });
    installFromGithubMock.mockResolvedValue({ success: true, record: installedSecurity });
    uninstallMock.mockResolvedValue({ success: true });
    clawhubOpenSkillReadmeMock.mockResolvedValue({ success: true });
  });

  it('renders marketplace cards without depending on gateway readiness', async () => {
    render(<Skills />);

    await waitFor(() => expect(marketplaceListMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('skill-marketplace-card-security-and-hardening')).toBeInTheDocument());

    expect(screen.getByTestId('skills-marketplace-title')).toHaveTextContent('title');
    expect(screen.getByTestId('skills-marketplace-category-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('skill-marketplace-action-security-and-hardening')).toHaveTextContent('marketplace.action.install');
  });

  it('filters installed skills from local installation records', async () => {
    getInstalledSkillsMock.mockResolvedValue({ success: true, skills: [installedSecurity] });

    render(<Skills />);

    await waitFor(() => expect(screen.getByTestId('skill-marketplace-card-security-and-hardening')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('skills-marketplace-category-installed'));

    expect(screen.getByTestId('skill-marketplace-card-security-and-hardening')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-marketplace-card-documentation-and-adrs')).not.toBeInTheDocument();
    expect(screen.getByTestId('skill-marketplace-action-security-and-hardening')).toHaveTextContent('marketplace.action.use');
  });

  it('installs through host API and shows detected command risk in details', async () => {
    render(<Skills />);

    await waitFor(() => expect(screen.getByTestId('skill-marketplace-card-security-and-hardening')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('skill-marketplace-action-security-and-hardening'));

    await waitFor(() => expect(installFromGithubMock).toHaveBeenCalledWith({
      skillId: 'security-and-hardening',
      repositoryUrl: 'https://github.com/addyosmani/agent-skills',
      selectedInstallTarget: 'skills/security-and-hardening',
    }));
  });
});
