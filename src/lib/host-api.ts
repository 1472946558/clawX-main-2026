import type {
  AgentCreatePayload,
  AgentProfileUpdatePayload,
  AgentUpdatePayload,
  AiAppCreateJobPayload,
  AiAppJobPayload,
  AiAppListResultsPayload,
  AiAppWorkflowListResult,
  BlueOceanPayConfigPayload,
  BlueOceanPayCreatePaymentPayload,
  BlueOceanPayQueryPayload,
  ChannelAccountsPayload,
  ChannelSaveConfigPayload,
  ChannelTargetsPayload,
  ChatSendWithMediaPayload,
  ClawHubSearchPayload,
  CreemCreateCheckoutPayload,
  CronSessionHistoryPayload,
  DialogMessagePayload,
  DialogOpenPayload,
  EpayConfigPayload,
  EpayCreatePaymentPayload,
  EpayQueryPayload,
  FilePreviewTreeOptions,
  FileReadBinaryOptions,
  ImageGenerationSettingsPayload,
  MediaThumbnailEntry,
  OpenClawDoctorMode,
  OpenClawDoctorResult,
  ProviderAccount,
  ProviderConfig,
  ProviderModelListPayload,
  ProviderOAuthRequestPayload,
  ProviderUpdateWithKeyPayload,
  ProviderValidationPayload,
  SaveImagePayload,
  SettingsKey,
  SettingsSnapshot,
  SettingsValue,
  ShellOpenExternalPayload,
  ShellPathPayload,
  SkillMarketplaceAdminListPayload,
  SkillMarketplaceInstallPayload,
  SkillInstallFromGithubPayload,
  SkillInstallFromLocalPayload,
  SkillInstalledListResult,
  SkillInstallResult,
  SkillInstallStatusResult,
  SkillInstallStatusPayload,
  SkillMarketplaceImportCatalogPayload,
  SkillMarketplaceImportCommitPayload,
  SkillMarketplaceImportPreviewPayload,
  SkillMarketplaceReviewPayload,
  SkillScanDirPayload,
  SkillScanResult,
  SkillMarketplaceUpdatePayload,
  SkillUninstallPayload,
  SkillQuickAccessPayload,
  SkillUpdateConfigPayload,
  SkillUpdatePayload,
  StagePathsPayload,
  UpdateChannel,
  UpdateSetFeedUrlPayload,
} from '@shared/host-api/contract';
import type { CronJobCreateInput, CronJobUpdateInput } from '@shared/types/cron';
import { invokeHost } from './host-api-client';

export type {
  ChannelAccountsResult,
  ChannelCredentialValidationResult,
  ChannelFormValuesResult,
  ChannelGroupItem,
  ChannelSaveConfigResult,
  ChannelTargetOption,
  ChannelTargetsResult,
  ChatSendWithMediaResult,
  ClawHubInstalledSkill,
  ClawHubListResult,
  ClawHubSearchResult,
  CronSessionHistoryResult,
  DeliveryChannelAccount,
  DeliveryChannelGroup,
  DeliveryTargetsResult,
  GatewayHealthSummary,
  AiAppJob,
  ImageGenerationProvidersResult,
  ImageGenerationSettingsResult,
  LocalSkillsResult,
  LogContentResult,
  LogDirResult,
  OpenClawCliCommandResult,
  OpenClawDoctorResult,
  OpenClawStatusResult,
  ProviderAccountKeyInfo,
  ProviderDefaultAccountResult,
  ProviderModelListErrorCode,
  ProviderModelListResult,
  ProviderValidationResult,
  SessionHistoryResult,
  SessionLabelSummary,
  SessionSummariesResult,
  SettingsResetResult,
  SettingsSnapshot,
  SkillConfigsResult,
  SkillMarketplaceAdminListResult,
  SkillMarketplaceInstallResult,
  SkillInstallResult,
  SkillInstalledListResult,
  SkillInstallStatusResult,
  SkillScanResult,
  SkillMarketplaceExportResult,
  SkillMarketplaceImportCatalogResult,
  SkillMarketplaceImportCommitResult,
  SkillMarketplaceImportPreviewResult,
  SkillMarketplaceListResult,
  SkillMarketplaceMutationResult,
  AiAppJobResult,
  AiAppListResultsResult,
  SkillsStatusResult,
  StagedFileResult,
  StagePathsPayload,
  UsageHistoryEntry,
} from '@shared/host-api/contract';

export const hostApi = {
  app: {
    openClawDoctor: async (mode: OpenClawDoctorMode): Promise<OpenClawDoctorResult> => ({
      ...(await invokeHost('app', 'openClawDoctor', { mode })),
      mode,
    }),
  },
  openclaw: {
    status: () => invokeHost('openclaw', 'status'),
    getSkillsDir: () => invokeHost('openclaw', 'getSkillsDir'),
    getCliCommand: () => invokeHost('openclaw', 'getCliCommand'),
  },
  shell: {
    openExternal: (url: string) => invokeHost('shell', 'openExternal', { url } satisfies ShellOpenExternalPayload),
    showItemInFolder: (path: string) => invokeHost('shell', 'showItemInFolder', { path } satisfies ShellPathPayload),
    openPath: (path: string) => invokeHost('shell', 'openPath', { path } satisfies ShellPathPayload),
  },
  dialog: {
    open: (input: DialogOpenPayload) => invokeHost('dialog', 'open', input),
    message: (input: DialogMessagePayload) => invokeHost('dialog', 'message', input),
  },
  window: {
    syncTrafficLightPosition: (sidebarCollapsed: boolean) => (
      invokeHost('window', 'syncTrafficLightPosition', { sidebarCollapsed })
    ),
    minimize: () => invokeHost('window', 'minimize'),
    maximize: () => invokeHost('window', 'maximize'),
    close: () => invokeHost('window', 'close'),
    isMaximized: () => invokeHost('window', 'isMaximized'),
  },
  updates: {
    status: () => invokeHost('updates', 'status'),
    version: () => invokeHost('updates', 'version'),
    feedUrl: () => invokeHost('updates', 'feedUrl'),
    check: () => invokeHost('updates', 'check'),
    download: () => invokeHost('updates', 'download'),
    install: () => invokeHost('updates', 'install'),
    setChannel: (channel: UpdateChannel) => invokeHost('updates', 'setChannel', { channel }),
    setAutoDownload: (enable: boolean) => invokeHost('updates', 'setAutoDownload', { enable }),
    setFeedUrl: (url: string) => invokeHost('updates', 'setFeedUrl', { url } satisfies UpdateSetFeedUrlPayload),
    cancelAutoInstall: () => invokeHost('updates', 'cancelAutoInstall'),
  },
  uv: {
    installAll: () => invokeHost('uv', 'installAll'),
  },
  settings: {
    getAll: () => invokeHost('settings', 'getAll'),
    get: (key: SettingsKey) => invokeHost('settings', 'get', { key }),
    set: (key: SettingsKey, value: SettingsValue) => invokeHost('settings', 'set', { key, value }),
    setMany: (patch: Partial<SettingsSnapshot>) => (
      invokeHost('settings', 'setMany', { patch })
    ),
    reset: () => invokeHost('settings', 'reset'),
  },
  gateway: {
    status: () => invokeHost('gateway', 'status'),
    start: () => invokeHost('gateway', 'start'),
    stop: () => invokeHost('gateway', 'stop'),
    restart: () => invokeHost('gateway', 'restart'),
    health: (probe = false) => invokeHost('gateway', 'health', { probe }),
    controlUi: (view?: 'dreams') => invokeHost('gateway', 'controlUi', { view }),
    rpc: <T = unknown>(method: string, params?: unknown, timeoutMs?: number) => (
      invokeHost('gateway', 'rpc', { method, params, timeoutMs }) as Promise<T>
    ),
  },
  logs: {
    recent: (tailLines = 100) => invokeHost('logs', 'recent', { tailLines }),
    dir: () => invokeHost('logs', 'dir'),
    listFiles: () => invokeHost('logs', 'listFiles'),
    readFile: (path: string, tailLines?: number) => (
      invokeHost('logs', 'readFile', { path, tailLines })
    ),
  },
  channels: {
    accounts: (options?: ChannelAccountsPayload) => (
      invokeHost('channels', 'accounts', options)
    ),
    targets: (input: ChannelTargetsPayload) => (
      invokeHost('channels', 'targets', input)
    ),
    configured: () => invokeHost('channels', 'configured'),
    formValues: (channelType: string, accountId?: string) => (
      invokeHost('channels', 'formValues', { channelType, accountId })
    ),
    saveConfig: (input: ChannelSaveConfigPayload) => invokeHost('channels', 'saveConfig', input),
    deleteConfig: (channelType: string, accountId?: string) => (
      invokeHost('channels', 'deleteConfig', { channelType, accountId })
    ),
    validateCredentials: (channelType: string, config: Record<string, unknown>) => (
      invokeHost('channels', 'validateCredentials', { channelType, config })
    ),
    saveBinding: (input: { channelType: string; accountId: string; agentId: string }) => (
      invokeHost('channels', 'bindingSave', input)
    ),
    deleteBinding: (input: { channelType: string; accountId?: string }) => (
      invokeHost('channels', 'bindingDelete', input)
    ),
    startLogin: (channelType: string, input?: { accountId?: string }) => (
      invokeHost('channels', 'startLogin', { channelType, ...input })
    ),
    cancelLogin: (channelType: string, input?: { accountId?: string }) => (
      invokeHost('channels', 'cancelLogin', { channelType, ...input })
    ),
  },
  agents: {
    list: () => invokeHost('agents', 'list'),
    create: (input: AgentCreatePayload) => invokeHost('agents', 'create', input),
    update: (id: string, input: Omit<AgentUpdatePayload, 'id'>) => (
      invokeHost('agents', 'update', {
        id,
        ...input,
      })
    ),
    updateProfile: (id: string, input: Omit<AgentProfileUpdatePayload, 'id'>) => (
      invokeHost('agents', 'updateProfile', {
        id,
        ...input,
      })
    ),
    updateModel: (id: string, modelRef: string | null, modelPlanId?: string | null) => (
      invokeHost('agents', 'updateModel', { id, modelRef, modelPlanId })
    ),
    delete: (id: string) => invokeHost('agents', 'delete', { id }),
    assignChannel: (id: string, channelType: string) => (
      invokeHost('agents', 'assignChannel', { id, channelType })
    ),
    removeChannel: (id: string, channelType: string) => (
      invokeHost('agents', 'removeChannel', { id, channelType })
    ),
  },
  diagnostics: {
    gatewaySnapshot: () => invokeHost('diagnostics', 'gatewaySnapshot'),
  },
  providers: {
    list: () => invokeHost('providers', 'list'),
    get: (providerId: string) => invokeHost('providers', 'get', { providerId }),
    getDefault: () => invokeHost('providers', 'getDefault'),
    hasApiKey: (providerId: string) => (
      invokeHost('providers', 'hasApiKey', { providerId })
    ),
    getApiKey: (providerId: string) => (
      invokeHost('providers', 'getApiKey', { providerId })
    ),
    validateKey: (input: ProviderValidationPayload) => invokeHost('providers', 'validateKey', input),
    fetchModels: (input: ProviderModelListPayload) => invokeHost('providers', 'fetchModels', input),
    save: (input: { config: ProviderConfig; apiKey?: string }) => invokeHost('providers', 'save', input),
    delete: (providerId: string) => invokeHost('providers', 'delete', { providerId }),
    setApiKey: (providerId: string, apiKey: string) => (
      invokeHost('providers', 'setApiKey', { providerId, apiKey })
    ),
    updateWithKey: (input: ProviderUpdateWithKeyPayload) => invokeHost('providers', 'updateWithKey', input),
    deleteApiKey: (providerId: string) => (
      invokeHost('providers', 'deleteApiKey', { providerId })
    ),
    setDefault: (providerId: string) => (
      invokeHost('providers', 'setDefault', { providerId })
    ),
    accounts: () => invokeHost('providers', 'accounts'),
    vendors: () => invokeHost('providers', 'vendors'),
    accountKeyInfo: () => invokeHost('providers', 'accountKeyInfo'),
    getDefaultAccount: () => invokeHost('providers', 'getDefaultAccount'),
    getAccount: (accountId: string) => (
      invokeHost('providers', 'getAccount', { accountId })
    ),
    getAccountApiKey: (accountId: string) => (
      invokeHost('providers', 'getAccountApiKey', { accountId })
    ),
    hasAccountApiKey: (accountId: string) => (
      invokeHost('providers', 'hasAccountApiKey', { accountId })
    ),
    createAccount: (input: { account: ProviderAccount; apiKey?: string }) => (
      invokeHost('providers', 'createAccount', input)
    ),
    updateAccount: (accountId: string, updates: Partial<ProviderAccount>, apiKey?: string) => (
      invokeHost('providers', 'updateAccount', { accountId, updates, apiKey })
    ),
    deleteAccount: (accountId: string) => (
      invokeHost('providers', 'deleteAccount', { accountId })
    ),
    deleteAccountApiKey: (accountId: string) => (
      invokeHost('providers', 'deleteAccountApiKey', { accountId })
    ),
    setDefaultAccount: (accountId: string) => (
      invokeHost('providers', 'setDefaultAccount', { accountId })
    ),
    requestOAuth: (input: ProviderOAuthRequestPayload) => invokeHost('providers', 'requestOAuth', input),
    cancelOAuth: () => invokeHost('providers', 'cancelOAuth'),
    submitOAuth: (input: { code: string }) => invokeHost('providers', 'submitOAuth', input),
  },
  canvasland: {
    balance: () => invokeHost('canvasland', 'balance'),
    blueOceanConfig: () => invokeHost('canvasland', 'blueOceanConfig'),
    saveBlueOceanConfig: (input: BlueOceanPayConfigPayload) => (
      invokeHost('canvasland', 'saveBlueOceanConfig', input)
    ),
    clearBlueOceanConfig: () => invokeHost('canvasland', 'clearBlueOceanConfig'),
    createBlueOceanWechatPayment: (input: BlueOceanPayCreatePaymentPayload) => (
      invokeHost('canvasland', 'createBlueOceanWechatPayment', input)
    ),
    queryBlueOceanPayment: (input: BlueOceanPayQueryPayload) => (
      invokeHost('canvasland', 'queryBlueOceanPayment', input)
    ),
    epayConfig: () => invokeHost('canvasland', 'epayConfig'),
    saveEpayConfig: (input: EpayConfigPayload) => (
      invokeHost('canvasland', 'saveEpayConfig', input)
    ),
    clearEpayConfig: () => invokeHost('canvasland', 'clearEpayConfig'),
    createEpayPayment: (input: EpayCreatePaymentPayload) => (
      invokeHost('canvasland', 'createEpayPayment', input)
    ),
    queryEpayPayment: (input: EpayQueryPayload) => (
      invokeHost('canvasland', 'queryEpayPayment', input)
    ),
    creemRates: () => invokeHost('canvasland', 'creemRates'),
    createCreemCheckout: (input: CreemCreateCheckoutPayload) => (
      invokeHost('canvasland', 'createCreemCheckout', input)
    ),
  },
  files: {
    stagePaths: (input: StagePathsPayload) => invokeHost('files', 'stagePaths', input),
    stageBuffer: (input: { base64: string; fileName: string; mimeType?: string }) => (
      invokeHost('files', 'stageBuffer', input)
    ),
    readText: (path: string) => invokeHost('files', 'readText', { path }),
    readBinary: (path: string, opts?: FileReadBinaryOptions) => (
      invokeHost('files', 'readBinary', { path, opts })
    ),
    writeText: (path: string, content: string) => (
      invokeHost('files', 'writeText', { path, content })
    ),
    stat: (path: string) => invokeHost('files', 'stat', { path }),
    listDir: (path: string) => invokeHost('files', 'listDir', { path }),
    listTree: (path: string, opts?: FilePreviewTreeOptions) => (
      invokeHost('files', 'listTree', { path, opts })
    ),
  },
  media: {
    thumbnails: (input: { paths: MediaThumbnailEntry[] }) => invokeHost('media', 'thumbnails', input),
    saveImage: (input: SaveImagePayload) => invokeHost('media', 'saveImage', input),
    imageGenerationSettings: () => invokeHost('media', 'imageGenerationSettings'),
    saveImageGenerationSettings: (input: ImageGenerationSettingsPayload) => (
      invokeHost('media', 'saveImageGenerationSettings', input)
    ),
    imageGenerationProviders: () => invokeHost('media', 'imageGenerationProviders'),
    testImageGeneration: (input: { agentId?: string; prompt?: string; model?: string }) => (
      invokeHost('media', 'testImageGeneration', input)
    ),
  },
  sessions: {
    delete: (id: string) => invokeHost('sessions', 'delete', { id }),
    rename: (id: string, title: string) => (
      invokeHost('sessions', 'rename', { id, title })
    ),
    summaries: (input?: { sessionKeys?: string[]; limit?: number }) => invokeHost('sessions', 'summaries', input),
    history: (input: { sessionKey?: string; agentId?: string; sessionId?: string; limit?: number }) => (
      invokeHost('sessions', 'history', input)
    ),
  },
  chat: {
    sendWithMedia: (input: ChatSendWithMediaPayload) => invokeHost('chat', 'sendWithMedia', input),
  },
  cron: {
    list: () => invokeHost('cron', 'list'),
    create: (input: CronJobCreateInput) => invokeHost('cron', 'create', input),
    update: (id: string, input: CronJobUpdateInput) => invokeHost('cron', 'update', { id, input }),
    delete: (id: string) => invokeHost('cron', 'delete', { id }),
    toggle: (id: string, enabled: boolean) => invokeHost('cron', 'toggle', { id, enabled }),
    trigger: (id: string) => invokeHost('cron', 'trigger', { id }),
    sessionHistory: (input: CronSessionHistoryPayload) => invokeHost('cron', 'sessionHistory', input),
    deliveryTargets: () => invokeHost('cron', 'deliveryTargets'),
  },
  skills: {
    local: () => invokeHost('skills', 'local'),
    configs: () => invokeHost('skills', 'configs'),
    allConfigs: () => invokeHost('skills', 'allConfigs'),
    getConfig: (skillKey: string) => invokeHost('skills', 'getConfig', { skillKey }),
    updateConfig: (input: SkillUpdateConfigPayload) => invokeHost('skills', 'updateConfig', input),
    updateConfigs: (updates: SkillUpdateConfigPayload[]) => invokeHost('skills', 'updateConfigs', { updates }),
    status: () => invokeHost('skills', 'status'),
    update: (input: SkillUpdatePayload) => invokeHost('skills', 'update', input),
    quickAccess: (input: SkillQuickAccessPayload) => invokeHost('skills', 'quickAccess', input),
    marketplaceList: () => invokeHost('skills', 'marketplaceList'),
    marketplaceAdminList: (input?: SkillMarketplaceAdminListPayload) => (
      invokeHost('skills', 'marketplaceAdminList', input)
    ),
    marketplaceImportPreview: (input: SkillMarketplaceImportPreviewPayload) => (
      invokeHost('skills', 'marketplaceImportPreview', input)
    ),
    marketplaceImportCommit: (input: SkillMarketplaceImportCommitPayload) => (
      invokeHost('skills', 'marketplaceImportCommit', input)
    ),
    marketplaceExportCatalog: () => invokeHost('skills', 'marketplaceExportCatalog'),
    marketplaceImportCatalog: (input: SkillMarketplaceImportCatalogPayload) => (
      invokeHost('skills', 'marketplaceImportCatalog', input)
    ),
    marketplaceReview: (input: SkillMarketplaceReviewPayload) => (
      invokeHost('skills', 'marketplaceReview', input)
    ),
    marketplaceUpdate: (input: SkillMarketplaceUpdatePayload) => (
      invokeHost('skills', 'marketplaceUpdate', input)
    ),
    marketplaceInstall: (input: SkillMarketplaceInstallPayload) => (
      invokeHost('skills', 'marketplaceInstall', input)
    ),
    installFromGithub: (input: SkillInstallFromGithubPayload): Promise<SkillInstallResult> => (
      invokeHost('skills', 'installFromGithub', input)
    ),
    installFromLocal: (input: SkillInstallFromLocalPayload): Promise<SkillInstallResult> => (
      invokeHost('skills', 'installFromLocal', input)
    ),
    getInstalledSkills: (): Promise<SkillInstalledListResult> => invokeHost('skills', 'getInstalledSkills'),
    getInstallStatus: (input: SkillInstallStatusPayload): Promise<SkillInstallStatusResult> => (
      invokeHost('skills', 'getInstallStatus', input)
    ),
    uninstall: (input: SkillUninstallPayload) => invokeHost('skills', 'uninstall', input),
    scanSkillDir: (input: SkillScanDirPayload): Promise<SkillScanResult> => invokeHost('skills', 'scanSkillDir', input),
    clawhubCapability: () => invokeHost('skills', 'clawhubCapability'),
    clawhubList: () => invokeHost('skills', 'clawhubList'),
    clawhubSearch: (input: ClawHubSearchPayload) => invokeHost('skills', 'clawhubSearch', input),
    clawhubInstall: (input: { slug: string; version?: string }) => invokeHost('skills', 'clawhubInstall', input),
    clawhubUninstall: (input: { slug: string }) => invokeHost('skills', 'clawhubUninstall', input),
    clawhubOpenSkillReadme: (input: { skillKey?: string; slug?: string; baseDir?: string }) => (
      invokeHost('skills', 'clawhubOpenSkillReadme', input)
    ),
    clawhubOpenSkillPath: (input: { skillKey?: string; slug?: string; baseDir?: string }) => (
      invokeHost('skills', 'clawhubOpenSkillPath', input)
    ),
  },
  aiApps: {
    listWorkflows: () => invokeHost('aiApps', 'listWorkflows') as Promise<AiAppWorkflowListResult>,
    createJob: (input: AiAppCreateJobPayload) => invokeHost('aiApps', 'createJob', input),
    getJob: (id: string) => invokeHost('aiApps', 'getJob', { id } satisfies AiAppJobPayload),
    refreshJob: (id: string) => invokeHost('aiApps', 'refreshJob', { id } satisfies AiAppJobPayload),
    videoCapabilities: () => invokeHost('aiApps', 'videoCapabilities'),
    listResults: (input?: AiAppListResultsPayload) => invokeHost('aiApps', 'listResults', input),
  },
  usage: {
    recentTokenHistory: (limit?: number) => (
      invokeHost('usage', 'recentTokenHistory', { limit })
    ),
  },
};

export type HostApi = typeof hostApi;
