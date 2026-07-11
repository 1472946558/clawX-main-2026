import type { RawMessage } from '../chat/types';
import type { AgentsSnapshot } from '../types/agent';
import type { CronJob, CronJobCreateInput, CronJobUpdateInput } from '../types/cron';
import type { GatewayHealth, GatewayStatus } from '../types/gateway';
import type { MarketplaceSkill, QuickAccessSkill, Skill } from '../types/skill';

export type JsonRecord = Record<string, unknown>;
export type HostSuccess = { success: boolean; error?: string };
export type OptionalHostSuccess = { success?: boolean; error?: string };

export type OpenClawDoctorMode = 'diagnose' | 'fix';
export type OpenClawDoctorResult = HostSuccess & {
  mode: OpenClawDoctorMode;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  command: string;
  cwd: string;
  durationMs: number;
  timedOut?: boolean;
};
export type OpenClawDoctorPayload = { mode: OpenClawDoctorMode };

export type OpenClawStatusResult = {
  packageExists: boolean;
  isBuilt: boolean;
  entryPath: string;
  dir: string;
  version?: string;
};
export type OpenClawCliCommandResult = HostSuccess & { command?: string };

export type ShellPathPayload = { path: string };
export type ShellOpenExternalPayload = { url: string };
export type DialogOpenPayload = {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
    | 'showHiddenFiles'
    | 'createDirectory'
    | 'promptToCreate'
    | 'noResolveAliases'
    | 'treatPackageAsDirectory'
    | 'dontAddToRecent'
  >;
  message?: string;
  securityScopedBookmarks?: boolean;
};
export type DialogOpenResult = {
  canceled: boolean;
  filePaths: string[];
  bookmarks?: string[];
};
export type DialogMessagePayload = {
  message: string;
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  detail?: string;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  noLink?: boolean;
  title?: string;
};
export type DialogMessageResult = {
  response: number;
  checkboxChecked?: boolean;
};
export type WindowSyncTrafficLightPayload = { sidebarCollapsed: boolean };
export type UpdateChannel = 'stable' | 'beta' | 'dev';
export type UpdateInfoSnapshot = {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
};
export type UpdateProgressSnapshot = {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
};
export type UpdateStatusSnapshot = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: UpdateInfoSnapshot;
  progress?: UpdateProgressSnapshot;
  error?: string;
};
export type UpdateCheckResult = HostSuccess & { status?: UpdateStatusSnapshot };
export type UpdateSetChannelPayload = { channel: UpdateChannel };
export type UpdateSetAutoDownloadPayload = { enable: boolean };
export type UpdateFeedUrlSnapshot = { url: string };
export type UpdateSetFeedUrlPayload = { url: string };

export type SettingsSnapshot = Partial<{
  theme: 'light' | 'dark' | 'system';
  language: string;
  startMinimized: boolean;
  launchAtStartup: boolean;
  telemetryEnabled: boolean;
  gatewayAutoStart: boolean;
  gatewayPort: number;
  proxyEnabled: boolean;
  proxyServer: string;
  proxyHttpServer: string;
  proxyHttpsServer: string;
  proxyAllServer: string;
  proxyBypassRules: string;
  updateChannel: 'stable' | 'beta' | 'dev';
  autoCheckUpdate: boolean;
  updateFeedUrl: string;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  devModeUnlocked: boolean;
  setupComplete: boolean;
}>;
export type SettingsKey = keyof SettingsSnapshot & string;
export type SettingsValue = SettingsSnapshot[SettingsKey];
export type SettingsGetPayload = { key: SettingsKey };
export type SettingsSetPayload = { key: SettingsKey; value: SettingsValue };
export type SettingsSetManyPayload = { patch: Partial<SettingsSnapshot> };
export type SettingsResetResult = HostSuccess & { settings: SettingsSnapshot };

export type GatewayControlUiPayload = { view?: 'dreams' };
export type GatewayControlUiResult = HostSuccess & {
  url?: string;
  token?: string;
  port?: number;
};
export type GatewayHealthPayload = { probe?: boolean };
export type GatewayRpcPayload = {
  method: string;
  params?: unknown;
  timeoutMs?: number;
};

export type LogContentResult = { content: string };
export type LogDirResult = { dir: string | null };
export type LogFilePathResult = { path: string | null };
export type LogRecentPayload = { tailLines?: number };
export type LogMemoryPayload = { count?: number };
export type LogReadFilePayload = { path: string; tailLines?: number };
export type LogFileEntry = {
  path: string;
  name?: string;
  size?: number;
  mtime?: number;
};
export type LogFilesResult = { files: LogFileEntry[] };

export type GatewayHealthSummary = {
  state: 'healthy' | 'degraded' | 'unresponsive';
  reasons: string[];
  consecutiveHeartbeatMisses: number;
  lastAliveAt?: number;
  lastRpcSuccessAt?: number;
  lastRpcFailureAt?: number;
  lastRpcFailureMethod?: string;
  lastChannelsStatusOkAt?: number;
  lastChannelsStatusFailureAt?: number;
};

export type ChannelRuntimeStatus = 'connected' | 'connecting' | 'degraded' | 'disconnected' | 'error';
export type ChannelAccountItem = {
  accountId: string;
  name: string;
  configured: boolean;
  status: ChannelRuntimeStatus;
  statusReason?: string;
  lastError?: string;
  isDefault: boolean;
  agentId?: string;
};
export type ChannelGroupItem = {
  channelType: string;
  defaultAccountId: string;
  status: ChannelRuntimeStatus;
  statusReason?: string;
  accounts: ChannelAccountItem[];
};
export type ChannelTargetOption = {
  value: string;
  label: string;
  kind: 'user' | 'group' | 'channel';
};
export type ChannelAccountsPayload = {
  mode?: 'config' | 'runtime';
  configOnly?: boolean;
  probe?: boolean;
};
export type ChannelAccountsResult = HostSuccess & {
  channels?: ChannelGroupItem[];
  gatewayHealth?: GatewayHealthSummary;
};
export type ChannelTargetsPayload = {
  channelType: string;
  accountId?: string;
  query?: string;
};
export type ChannelTargetsResult = HostSuccess & {
  channelType?: string;
  accountId?: string;
  targets?: ChannelTargetOption[];
};
export type ChannelTypePayload = { channelType: string };
export type ChannelAccountPayload = ChannelTypePayload & { accountId?: string };
export type ChannelRequiredAccountPayload = ChannelTypePayload & { accountId: string };
export type ChannelBindingSavePayload = ChannelRequiredAccountPayload & { agentId: string };
export type ChannelBindingDeletePayload = ChannelAccountPayload;
export type ChannelSetEnabledPayload = ChannelTypePayload & { enabled: boolean };
export type ChannelFormValuesResult = HostSuccess & {
  values?: Record<string, string>;
};
export type ChannelCredentialValidationPayload = ChannelTypePayload & {
  config: Record<string, unknown>;
};
export type ChannelCredentialValidationResult = HostSuccess & {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  details?: {
    botUsername?: string;
    guildName?: string;
    channelName?: string;
  };
};
export type ChannelSaveConfigPayload = ChannelTypePayload & {
  config: Record<string, unknown>;
  accountId?: string;
};
export type ChannelSaveConfigResult = HostSuccess & {
  noChange?: boolean;
  warning?: string;
};
export type ChannelConfiguredResult = HostSuccess & { channels?: Array<string | JsonRecord> };

export type AgentSnapshotResult = AgentsSnapshot & OptionalHostSuccess;
export type AgentCreatePayload = { name: string; inheritWorkspace?: boolean };
export type AgentUpdatePayload = { id: string; name: string };
export type AgentProfileUpdatePayload = { id: string; name: string; persona: string };
export type AgentUpdateModelPayload = { id: string; modelRef: string | null };
export type AgentIdPayload = { id: string };
export type AgentChannelPayload = { id: string; channelType: string };

export type DiagnosticsGatewaySnapshotResult = JsonRecord;

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'ark'
  | 'moonshot'
  | 'moonshot-global'
  | 'siliconflow'
  | 'deepseek'
  | 'minimax-portal'
  | 'minimax-portal-cn'
  | 'modelstudio'
  | 'ollama'
  | 'custom';
export type ProviderAuthMode = 'api_key' | 'oauth_device' | 'oauth_browser' | 'local';
export type ProviderVendorCategory = 'official' | 'compatible' | 'local' | 'custom';
export type ProviderProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'github-copilot'
  | 'bedrock-converse-stream'
  | 'ollama'
  | 'azure-openai-responses';
export type ProviderConfig = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiProtocol?: ProviderProtocol;
  headers?: Record<string, string>;
  model?: string;
  fallbackModels?: string[];
  fallbackProviderIds?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ProviderWithKeyInfo = ProviderConfig & {
  hasKey: boolean;
  keyMasked: string | null;
};
export type ProviderVendorInfo = {
  id: ProviderType;
  name: string;
  icon: string;
  placeholder: string;
  model?: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  showBaseUrl?: boolean;
  showModelId?: boolean;
  showModelIdInDevModeOnly?: boolean;
  modelIdPlaceholder?: string;
  defaultModelId?: string;
  isOAuth?: boolean;
  supportsApiKey?: boolean;
  apiKeyUrl?: string;
  docsUrl?: string;
  docsUrlZh?: string;
  codePlanPresetBaseUrl?: string;
  codePlanPresetModelId?: string;
  codePlanDocsUrl?: string;
  hidden?: boolean;
  hideOAuthUi?: boolean;
  category: ProviderVendorCategory;
  envVar?: string;
  supportedAuthModes: ProviderAuthMode[];
  defaultAuthMode: ProviderAuthMode;
  supportsMultipleAccounts: boolean;
};
export type ProviderAccount = {
  id: string;
  vendorId: ProviderType;
  label: string;
  authMode: ProviderAuthMode;
  baseUrl?: string;
  apiProtocol?: ProviderProtocol;
  headers?: Record<string, string>;
  model?: string;
  fallbackModels?: string[];
  fallbackAccountIds?: string[];
  enabled: boolean;
  isDefault: boolean;
  metadata?: {
    region?: string;
    email?: string;
    resourceUrl?: string;
    customModels?: string[];
  };
  createdAt: string;
  updatedAt: string;
};
export type ProviderAccountKeyInfo = {
  accountId: string;
  hasKey: boolean;
  keyMasked: string | null;
};
export type ProviderDefaultAccountResult = { accountId: string | null };
export type ProviderValidationOptions = {
  baseUrl?: string;
  apiProtocol?: string;
};
export type ProviderValidationPayload = {
  accountId?: string;
  vendorId?: string;
  providerId?: string;
  apiKey: string;
  options?: ProviderValidationOptions;
};
export type ProviderValidationResult = { valid: boolean; error?: string };
export type ProviderModelListErrorCode =
  | 'invalid_base_url'
  | 'invalid_api_key'
  | 'network_error'
  | 'no_models'
  | 'unsupported_format';
export type ProviderModelListPayload = {
  baseUrl: string;
  apiKey: string;
};
export type ProviderModelListResult = {
  success: boolean;
  models: string[];
  errorCode?: ProviderModelListErrorCode;
};
export type ProviderIdPayload = { providerId: string };
export type ProviderApiKeyPayload = ProviderIdPayload & { apiKey: string };
export type ProviderSavePayload = { config: ProviderConfig; apiKey?: string };
export type ProviderUpdateWithKeyPayload = {
  providerId: string;
  updates: Partial<ProviderConfig>;
  apiKey?: string;
};
export type ProviderAccountIdPayload = { accountId: string };
export type ProviderCreateAccountPayload = { account: ProviderAccount; apiKey?: string };
export type ProviderUpdateAccountPayload = {
  accountId: string;
  updates: Partial<ProviderAccount>;
  apiKey?: string;
};
export type ProviderOAuthRequestPayload = {
  provider: string;
  region?: 'global' | 'cn';
  accountId?: string;
  label?: string;
};
export type ProviderOAuthSubmitPayload = { code: string };

export type CanvaslandTopUpMethod = {
  name?: string;
  type?: string;
  minTopup?: string;
};
export type CanvaslandTopUpInfo = {
  enabled: boolean;
  redemptionEnabled?: boolean;
  amountOptions?: number[];
  payMethods?: CanvaslandTopUpMethod[];
  topupLink?: string;
};
export type CanvaslandTokenUsage = {
  name?: string;
  totalGranted?: number;
  totalUsed?: number;
  totalAvailable?: number;
  unlimitedQuota?: boolean;
  expiresAt?: number;
};
export type CanvaslandWalletRecord = {
  id: string;
  kind?: 'topup' | 'usage';
  outTradeNo?: string;
  provider?: 'blueocean' | 'epay' | 'creem' | 'newapi';
  paymentKind?: 'wechat' | 'alipay' | 'creem' | 'model';
  amount?: number;
  currency?: 'CNY' | 'USD' | 'HKD';
  cnyRate?: number;
  cnyAmount?: number;
  points: number;
  status?: 'pending' | 'paid' | 'used';
  createdAt: string;
  paidAt?: string;
  model?: string;
  tokenUsed?: number;
  description?: string;
};
export type CanvaslandWalletBalance = {
  totalGranted: number;
  totalUsed: number;
  totalAvailable: number;
};
export type CanvaslandBalanceResult = HostSuccess & {
  configured: boolean;
  endpoint?: string;
  topUpUrl?: string;
  token?: CanvaslandTokenUsage;
  wallet?: CanvaslandWalletBalance;
  walletRecords?: CanvaslandWalletRecord[];
  quotaPerUnit?: number;
  quotaDisplayType?: string;
  displayBalance?: string;
  displayUsed?: string;
  topup?: CanvaslandTopUpInfo;
  checkedAt?: string;
};
export type BlueOceanPayConfig = {
  appid?: string;
  apiBaseUrl?: string;
  notifyUrl?: string;
};
export type BlueOceanPayConfigResult = HostSuccess & {
  configured: boolean;
  hasMerchantKey: boolean;
  config?: BlueOceanPayConfig;
};
export type BlueOceanPayConfigPayload = BlueOceanPayConfig & {
  merchantKey?: string;
};
export type BlueOceanPayPaymentMethod = 'wechat.qrcode' | 'alipay.qrcode';
export type BlueOceanPayCreatePaymentPayload = {
  amount: number;
  points?: number;
  body?: string;
  paymentMethod?: BlueOceanPayPaymentMethod;
};
export type BlueOceanPayPaymentResult = HostSuccess & {
  configured?: boolean;
  paymentMethod?: BlueOceanPayPaymentMethod;
  qrcode?: string;
  qrcodeDataUrl?: string;
  outTradeNo?: string;
  sn?: string;
  tradeState?: string;
  totalFee?: number;
  payAmount?: number;
  provider?: string;
  raw?: JsonRecord;
};
export type BlueOceanPayQueryPayload = {
  sn?: string;
  outTradeNo?: string;
};
export type BlueOceanPayQueryResult = HostSuccess & {
  tradeState?: string;
  outTradeNo?: string;
  sn?: string;
  raw?: JsonRecord;
};
export type EpayPaymentMethod = 'alipay';
export type EpayConfig = {
  gatewayUrl?: string;
  pid?: string;
  notifyUrl?: string;
  returnUrl?: string;
  siteName?: string;
};
export type EpayConfigResult = HostSuccess & {
  configured: boolean;
  hasMerchantKey: boolean;
  config?: EpayConfig;
};
export type EpayConfigPayload = EpayConfig & {
  merchantKey?: string;
};
export type EpayCreatePaymentPayload = {
  amount: number;
  points?: number;
  paymentMethod: EpayPaymentMethod;
  name?: string;
};
export type EpayPaymentResult = HostSuccess & {
  configured?: boolean;
  paymentMethod?: EpayPaymentMethod;
  qrcode?: string;
  qrcodeDataUrl?: string;
  payUrl?: string;
  outTradeNo?: string;
  tradeNo?: string;
  status?: number;
  raw?: JsonRecord;
};
export type EpayQueryPayload = {
  tradeNo?: string;
  outTradeNo?: string;
};
export type EpayQueryResult = HostSuccess & {
  tradeNo?: string;
  outTradeNo?: string;
  status?: number;
  raw?: JsonRecord;
};
export type CreemCurrency = 'USD' | 'HKD';
export type CreemRatesResult = HostSuccess & {
  rates?: Record<CreemCurrency, number>;
  checkedAt?: string;
};
export type CreemCreateCheckoutPayload = {
  amount: number;
  currency: CreemCurrency;
};
export type CreemCheckoutResult = HostSuccess & {
  configured?: boolean;
  checkoutUrl?: string;
  checkoutId?: string;
  outTradeNo?: string;
  amount?: number;
  currency?: CreemCurrency;
  cnyRate?: number;
  cnyAmount?: number;
  points?: number;
  status?: string;
  raw?: JsonRecord;
};

export type StagedFileResult = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  stagedPath: string;
  preview: string | null;
  filePath?: string;
};
export type StagePathsPayload = { filePaths: string[]; allowedExtensions?: string[] };
export type StageBufferPayload = { base64: string; fileName: string; mimeType?: string };
export type FilePathPayload = { path: string };
export type FileReadBinaryOptions = { maxBytes?: number };
export type FilePreviewTreeOptions = {
  maxDepth?: number;
  maxNodes?: number;
  includeHidden?: boolean;
};
export type FileReadBinaryPayload = FilePathPayload & { opts?: FileReadBinaryOptions };
export type FileWriteTextPayload = FilePathPayload & { content: string };
export type FileListTreePayload = FilePathPayload & { opts?: FilePreviewTreeOptions };
export type FilePreviewError =
  | 'outsideSandbox'
  | 'readOnlyRoot'
  | 'tooLarge'
  | 'binary'
  | 'notFound'
  | 'notDirectory'
  | 'invalidContent'
  | (string & {});
export type ReadTextFileResult = {
  ok: boolean;
  content?: string;
  mimeType?: string;
  size?: number;
  readOnly?: boolean;
  error?: FilePreviewError;
};
export type ReadBinaryFileResult = {
  ok: boolean;
  data?: Uint8Array;
  mimeType?: string;
  size?: number;
  readOnly?: boolean;
  error?: FilePreviewError;
};
export type WriteTextFileResult = {
  ok: boolean;
  error?: FilePreviewError;
};
export type StatFileResult = {
  ok: boolean;
  size?: number;
  mtime?: number;
  isFile?: boolean;
  isDir?: boolean;
  readOnly?: boolean;
  error?: FilePreviewError;
};
export type FileListDirEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
};
export type FileListDirResult = {
  ok: boolean;
  entries?: FileListDirEntry[];
  error?: FilePreviewError;
};
export type FilePreviewTreeNode = {
  name: string;
  relPath: string;
  absPath: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
  children?: FilePreviewTreeNode[];
};
export type FileListTreeResult = {
  ok: boolean;
  root?: FilePreviewTreeNode;
  truncated?: boolean;
  error?: FilePreviewError;
};

export type MediaThumbnailEntry = {
  filePath?: string;
  gatewayUrl?: string;
  mimeType?: string;
};
export type MediaThumbnailsPayload = { paths: MediaThumbnailEntry[] };
export type MediaThumbnailResult = Record<string, { preview: string | null; fileSize: number }>;
export type SaveImagePayload = {
  base64?: string;
  mimeType?: string;
  filePath?: string;
  defaultFileName?: string;
};
export type ImageGenerationModelConfig = {
  primary: string | null;
  fallbacks: string[];
  timeoutMs: number | null;
};
export type ImageGenerationAgentAuthRow = {
  id: string;
  name: string;
  isDefault: boolean;
  provider: string | null;
  configured: boolean;
};
export type OpenAiImageRelayConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  providerKey?: string;
  apiKeyConfigured: boolean;
};
export type ImageGenerationSettingsSnapshot = {
  config: ImageGenerationModelConfig;
  autoProviderFallback: boolean;
  defaultAgentId: string;
  agents: ImageGenerationAgentAuthRow[];
  openAiRelay: OpenAiImageRelayConfig;
};
export type ImageGenerationProviderRow = {
  id: string;
  label: string;
  defaultModel: string;
  configured: boolean;
  available: boolean;
  selected: boolean;
  models: string[];
};
export type ImageGenerationSettingsPayload = {
  primary?: string | null;
  fallbacks?: string[];
  timeoutMs?: number | null;
  openAiRelayEnabled?: boolean;
  openAiRelayBaseUrl?: string | null;
  openAiRelayModel?: string | null;
  openAiRelayApiKey?: string;
};
export type ImageGenerationSettingsResult = OptionalHostSuccess & ImageGenerationSettingsSnapshot;
export type ImageGenerationProvidersResult = OptionalHostSuccess & {
  providers?: ImageGenerationProviderRow[];
};
export type ImageGenerationTestPayload = {
  agentId?: string;
  prompt?: string;
  model?: string;
};
export type ImageGenerationTestResult = {
  success: boolean;
  agentId: string;
  command: string;
  durationMs: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  result?: unknown;
};

export type SessionHistoryPayload = {
  sessionKey?: string;
  agentId?: string;
  sessionId?: string;
  limit?: number;
};
export type SessionHistoryResult = OptionalHostSuccess & {
  messages?: RawMessage[];
};
export type SessionSummariesPayload = { sessionKeys?: string[]; limit?: number };
export type SessionLabelSummary = {
  sessionKey: string;
  firstUserText: string | null;
  lastTimestamp: number | null;
};
export type SessionSummariesResult = HostSuccess & {
  summaries?: SessionLabelSummary[];
};
export type SessionDeletePayload = { id: string };
export type SessionRenamePayload = { id: string; title: string };

export type ChatMediaItem = { filePath: string; mimeType?: string; fileName?: string };
export type ChatSendWithMediaPayload = {
  sessionKey: string;
  message?: string;
  deliver?: boolean;
  idempotencyKey: string;
  media?: ChatMediaItem[];
};
export type ChatSendWithMediaResult = HostSuccess & {
  result?: { runId?: string };
};

export type CronUpdatePayload = { id: string; input: CronJobUpdateInput };
export type CronIdPayload = { id: string };
export type CronTogglePayload = CronIdPayload & { enabled: boolean };
export type CronSessionHistoryPayload = { sessionKey: string; limit?: number };
export type CronSessionHistoryResult = {
  messages?: RawMessage[];
};

export type SkillsStatusResult = {
  skills?: {
    skillKey: string;
    slug?: string;
    name?: string;
    description?: string;
    disabled?: boolean;
    emoji?: string;
    version?: string;
    author?: string;
    config?: Record<string, unknown>;
    bundled?: boolean;
    always?: boolean;
    source?: string;
    baseDir?: string;
    filePath?: string;
  }[];
};
export type LocalSkillsResult = HostSuccess & { skills?: Skill[] };
export type SkillConfigsResult = Record<string, { enabled?: boolean; apiKey?: string; env?: Record<string, string> }>;
export type SkillKeyPayload = { skillKey: string };
export type SkillUpdateConfigPayload = SkillKeyPayload & {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};
export type SkillUpdateConfigsPayload = { updates: SkillUpdateConfigPayload[] };
export type SkillUpdatePayload = SkillKeyPayload & { enabled?: boolean };
export type SkillQuickAccessPayload = { workspace?: string };
export type SkillMarketplaceCategory =
  | 'hot'
  | 'safe'
  | 'developer'
  | 'content'
  | 'ai'
  | 'productivity'
  | 'analysis'
  | 'communication';
export type SkillMarketplaceStatus = 'available' | 'installed' | 'planned';
export type SkillMarketplaceReviewStatus = 'approved' | 'pending' | 'rejected';
export type SkillMarketplaceImportSource = 'github' | 'clawhub' | 'manual';
export type SkillMarketplaceCommercialLicense = 'MIT' | 'Apache-2.0' | 'BSD-2-Clause' | 'BSD-3-Clause';
export type SkillMarketplaceInstallTarget = {
  skillPath: string;
  fileCount: number;
  totalBytes: number;
};
export type SkillMarketplaceItem = {
  id: string;
  name: string;
  description: string;
  category: SkillMarketplaceCategory;
  iconText: string;
  tags: string[];
  rating: string;
  downloads: string;
  license: string;
  source: string;
  repositoryUrl: string;
  installStatus: SkillMarketplaceStatus;
  reviewStatus: SkillMarketplaceReviewStatus;
  commercialUseAllowed: boolean;
  importSource: SkillMarketplaceImportSource;
  lastSyncedAt: string;
  installTargets?: SkillMarketplaceInstallTarget[];
  selectedInstallTarget?: string;
  installPath?: string;
  installedAt?: string;
  installError?: string;
};
export type SkillMarketplaceListResult = HostSuccess & {
  skills?: SkillMarketplaceItem[];
};
export type SkillMarketplaceAdminListPayload = {
  reviewStatus?: SkillMarketplaceReviewStatus | 'all';
};
export type SkillMarketplaceAdminListResult = HostSuccess & {
  skills?: SkillMarketplaceItem[];
};
export type SkillMarketplaceImportPreviewPayload =
  | {
    source: 'github';
    repositoryUrl: string;
  }
  | {
    source: 'clawhub';
    query?: string;
    limit?: number;
  };
export type SkillMarketplaceImportPreviewResult = HostSuccess & {
  skills?: SkillMarketplaceItem[];
  rejected?: SkillMarketplaceItem[];
  source?: SkillMarketplaceImportSource;
};
export type SkillMarketplaceImportCommitPayload = {
  skills: SkillMarketplaceItem[];
};
export type SkillMarketplaceImportCommitResult = HostSuccess & {
  skills?: SkillMarketplaceItem[];
};
export type SkillMarketplaceCatalog = {
  schemaVersion: 1;
  exportedAt: string;
  skills: SkillMarketplaceItem[];
};
export type SkillMarketplaceExportResult = HostSuccess & {
  catalog?: SkillMarketplaceCatalog;
};
export type SkillMarketplaceImportCatalogPayload = {
  catalog: SkillMarketplaceCatalog;
  mode?: 'merge' | 'replace';
};
export type SkillMarketplaceImportCatalogResult = HostSuccess & {
  skills?: SkillMarketplaceItem[];
};
export type SkillMarketplaceReviewPayload = {
  id: string;
  reviewStatus: SkillMarketplaceReviewStatus;
};
export type SkillMarketplaceUpdatePayload = {
  id: string;
  patch: Partial<Omit<SkillMarketplaceItem, 'id' | 'lastSyncedAt'>>;
};
export type SkillMarketplaceMutationResult = HostSuccess & {
  skill?: SkillMarketplaceItem;
};
export type SkillMarketplaceInstallPayload = {
  id: string;
};
export type SkillMarketplaceInstallResult = HostSuccess & {
  skill?: SkillMarketplaceItem;
  installPath?: string;
};

export type AiAppJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AiAppJobMode = 'live';
export type AiAppOutputType = 'text' | 'image' | 'video' | 'poster';
export type AiAppOutputAsset = {
  id: string;
  type: AiAppOutputType;
  title: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
  thumbnail?: string;
  downloadUrl?: string;
  metadata?: JsonRecord;
};
export type AiAppJobOutputs = {
  assetCount: number;
  assets: AiAppOutputAsset[];
};
export type AiAppJob = {
  id: string;
  localJobId: string;
  appId: string;
  mode: AiAppJobMode;
  status: AiAppJobStatus;
  createdAt: string;
  updatedAt: string;
  inputs: JsonRecord;
  outputs?: AiAppJobOutputs;
  providerId?: string;
  providerLabel?: string;
  providerTaskId?: string;
  rawResponseSummary?: string;
  resultUrl?: string;
  error?: string;
};
export type AiAppCreateJobPayload = {
  appId: string;
  mode?: AiAppJobMode;
  inputs?: JsonRecord;
};
export type AiAppJobPayload = {
  id: string;
};
export type AiAppListResultsPayload = {
  appId?: string;
};
export type AiAppJobResult = HostSuccess & {
  job?: AiAppJob;
};
export type AiAppListResultsResult = HostSuccess & {
  jobs?: AiAppJob[];
};
export type AiAppVideoCapabilities = {
  supported: boolean;
  providerId?: string;
  providerLabel?: string;
  models: string[];
  reason?: string;
};
export type AiAppVideoCapabilitiesResult = HostSuccess & {
  capabilities?: AiAppVideoCapabilities;
};
export type ClawHubInstalledSkill = {
  slug: string;
  version?: string;
  source?: string;
  baseDir?: string;
};
export type ClawHubCapabilityResult = HostSuccess & { capability?: JsonRecord };
export type ClawHubListResult = HostSuccess & {
  results?: ClawHubInstalledSkill[];
};
export type ClawHubSearchPayload = { query?: string };
export type ClawHubSearchResult = HostSuccess & {
  results?: MarketplaceSkill[];
};
export type ClawHubInstallPayload = { slug: string; version?: string };
export type ClawHubUninstallPayload = { slug: string };
export type ClawHubOpenPayload = {
  skillKey?: string;
  slug?: string;
  baseDir?: string;
};

export type UsageHistoryEntry = {
  timestamp: string;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  content?: string;
  usageStatus?: 'available' | 'missing' | 'error';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd?: number;
};
export type UsageHistoryPayload = { limit?: number };

export type DeliveryChannelAccount = {
  accountId: string;
  name: string;
  isDefault: boolean;
};
export type DeliveryChannelGroup = {
  channelType: string;
  defaultAccountId: string;
  accounts: DeliveryChannelAccount[];
};
export type DeliveryTargetsResult = HostSuccess & { targets: DeliveryChannelGroup[] };

export type HostApiContract = {
  app: {
    openClawDoctor: (payload: OpenClawDoctorPayload) => Omit<OpenClawDoctorResult, 'mode'>;
  };
  openclaw: {
    status: () => OpenClawStatusResult;
    getSkillsDir: () => string;
    getCliCommand: () => OpenClawCliCommandResult;
  };
  shell: {
    openExternal: (payload: ShellOpenExternalPayload) => void;
    showItemInFolder: (payload: ShellPathPayload) => void;
    openPath: (payload: ShellPathPayload) => string;
  };
  dialog: {
    open: (payload: DialogOpenPayload) => DialogOpenResult;
    message: (payload: DialogMessagePayload) => DialogMessageResult;
  };
  window: {
    syncTrafficLightPosition: (payload: WindowSyncTrafficLightPayload) => void;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => boolean;
  };
  updates: {
    status: () => UpdateStatusSnapshot;
    version: () => string;
    feedUrl: () => UpdateFeedUrlSnapshot;
    check: () => UpdateCheckResult;
    download: () => HostSuccess;
    install: () => HostSuccess;
    setChannel: (payload: UpdateSetChannelPayload) => HostSuccess;
    setAutoDownload: (payload: UpdateSetAutoDownloadPayload) => HostSuccess;
    setFeedUrl: (payload: UpdateSetFeedUrlPayload) => HostSuccess;
    cancelAutoInstall: () => HostSuccess;
  };
  uv: {
    installAll: () => HostSuccess;
  };
  settings: {
    getAll: () => SettingsSnapshot;
    get: (payload: SettingsGetPayload) => SettingsValue;
    set: (payload: SettingsSetPayload) => HostSuccess;
    setMany: (payload: SettingsSetManyPayload) => HostSuccess;
    reset: () => SettingsResetResult;
  };
  gateway: {
    status: () => GatewayStatus;
    start: () => HostSuccess;
    stop: () => HostSuccess;
    restart: () => HostSuccess;
    health: (payload?: GatewayHealthPayload) => GatewayHealth;
    controlUi: (payload?: GatewayControlUiPayload) => GatewayControlUiResult;
    rpc: (payload: GatewayRpcPayload) => unknown;
  };
  logs: {
    recent: (payload?: LogRecentPayload) => LogContentResult;
    memory: (payload?: LogMemoryPayload) => string[];
    dir: () => LogDirResult;
    filePath: () => LogFilePathResult;
    listFiles: () => LogFilesResult;
    readFile: (payload: LogReadFilePayload) => LogContentResult;
  };
  channels: {
    configured: () => ChannelConfiguredResult;
    accounts: (payload?: ChannelAccountsPayload) => ChannelAccountsResult;
    targets: (payload: ChannelTargetsPayload) => ChannelTargetsResult;
    setDefaultAccount: (payload: ChannelRequiredAccountPayload) => HostSuccess;
    bindingSave: (payload: ChannelBindingSavePayload) => HostSuccess;
    bindingDelete: (payload: ChannelBindingDeletePayload) => HostSuccess;
    validateConfig: (payload: ChannelTypePayload) => HostSuccess;
    validateCredentials: (payload: ChannelCredentialValidationPayload) => ChannelCredentialValidationResult;
    saveConfig: (payload: ChannelSaveConfigPayload) => ChannelSaveConfigResult;
    setEnabled: (payload: ChannelSetEnabledPayload) => HostSuccess;
    formValues: (payload: ChannelAccountPayload) => ChannelFormValuesResult;
    deleteConfig: (payload: ChannelAccountPayload) => HostSuccess;
    startLogin: (payload: ChannelAccountPayload) => HostSuccess;
    cancelLogin: (payload: ChannelAccountPayload) => HostSuccess;
  };
  agents: {
    list: () => AgentSnapshotResult;
    create: (payload: AgentCreatePayload) => AgentSnapshotResult;
    update: (payload: AgentUpdatePayload) => AgentSnapshotResult;
    updateProfile: (payload: AgentProfileUpdatePayload) => AgentSnapshotResult;
    updateModel: (payload: AgentUpdateModelPayload) => AgentSnapshotResult;
    delete: (payload: AgentIdPayload) => AgentSnapshotResult;
    assignChannel: (payload: AgentChannelPayload) => AgentSnapshotResult;
    removeChannel: (payload: AgentChannelPayload) => AgentSnapshotResult;
  };
  diagnostics: {
    gatewaySnapshot: () => DiagnosticsGatewaySnapshotResult;
  };
  providers: {
    list: () => ProviderWithKeyInfo[];
    get: (payload: ProviderIdPayload) => ProviderConfig | null;
    getDefault: () => string | undefined;
    hasApiKey: (payload: ProviderIdPayload) => boolean;
    getApiKey: (payload: ProviderIdPayload) => string | null;
    validateKey: (payload: ProviderValidationPayload) => ProviderValidationResult;
    fetchModels: (payload: ProviderModelListPayload) => ProviderModelListResult;
    save: (payload: ProviderSavePayload) => HostSuccess;
    delete: (payload: ProviderIdPayload) => HostSuccess;
    setApiKey: (payload: ProviderApiKeyPayload) => HostSuccess;
    updateWithKey: (payload: ProviderUpdateWithKeyPayload) => HostSuccess;
    deleteApiKey: (payload: ProviderIdPayload) => HostSuccess;
    setDefault: (payload: ProviderIdPayload) => HostSuccess;
    accounts: () => ProviderAccount[];
    vendors: () => ProviderVendorInfo[];
    accountKeyInfo: () => ProviderAccountKeyInfo[];
    getDefaultAccount: () => ProviderDefaultAccountResult;
    getAccount: (payload: ProviderAccountIdPayload) => ProviderAccount | null;
    getAccountApiKey: (payload: ProviderAccountIdPayload) => string | null;
    hasAccountApiKey: (payload: ProviderAccountIdPayload) => boolean;
    createAccount: (payload: ProviderCreateAccountPayload) => HostSuccess;
    updateAccount: (payload: ProviderUpdateAccountPayload) => HostSuccess;
    deleteAccount: (payload: ProviderAccountIdPayload) => HostSuccess;
    deleteAccountApiKey: (payload: ProviderAccountIdPayload) => HostSuccess;
    setDefaultAccount: (payload: ProviderAccountIdPayload) => HostSuccess;
    requestOAuth: (payload: ProviderOAuthRequestPayload) => HostSuccess;
    cancelOAuth: () => HostSuccess;
    submitOAuth: (payload: ProviderOAuthSubmitPayload) => HostSuccess;
  };
  canvasland: {
    balance: () => CanvaslandBalanceResult;
    blueOceanConfig: () => BlueOceanPayConfigResult;
    saveBlueOceanConfig: (payload: BlueOceanPayConfigPayload) => HostSuccess;
    clearBlueOceanConfig: () => HostSuccess;
    createBlueOceanWechatPayment: (payload: BlueOceanPayCreatePaymentPayload) => BlueOceanPayPaymentResult;
    queryBlueOceanPayment: (payload: BlueOceanPayQueryPayload) => BlueOceanPayQueryResult;
    epayConfig: () => EpayConfigResult;
    saveEpayConfig: (payload: EpayConfigPayload) => HostSuccess;
    clearEpayConfig: () => HostSuccess;
    createEpayPayment: (payload: EpayCreatePaymentPayload) => EpayPaymentResult;
    queryEpayPayment: (payload: EpayQueryPayload) => EpayQueryResult;
    creemRates: () => CreemRatesResult;
    createCreemCheckout: (payload: CreemCreateCheckoutPayload) => CreemCheckoutResult;
  };
  files: {
    stagePaths: (payload: StagePathsPayload) => StagedFileResult[];
    stageBuffer: (payload: StageBufferPayload) => StagedFileResult;
    readText: (payload: FilePathPayload) => ReadTextFileResult;
    readBinary: (payload: FileReadBinaryPayload) => ReadBinaryFileResult;
    writeText: (payload: FileWriteTextPayload) => WriteTextFileResult;
    stat: (payload: FilePathPayload) => StatFileResult;
    listDir: (payload: FilePathPayload) => FileListDirResult;
    listTree: (payload: FileListTreePayload) => FileListTreeResult;
  };
  media: {
    thumbnails: (payload: MediaThumbnailsPayload) => MediaThumbnailResult;
    saveImage: (payload: SaveImagePayload) => JsonRecord;
    imageGenerationSettings: () => ImageGenerationSettingsResult;
    saveImageGenerationSettings: (payload: ImageGenerationSettingsPayload) => ImageGenerationSettingsResult;
    imageGenerationProviders: () => ImageGenerationProvidersResult;
    testImageGeneration: (payload: ImageGenerationTestPayload) => ImageGenerationTestResult;
  };
  sessions: {
    delete: (payload: SessionDeletePayload) => HostSuccess;
    rename: (payload: SessionRenamePayload) => HostSuccess;
    summaries: (payload?: SessionSummariesPayload) => SessionSummariesResult;
    history: (payload: SessionHistoryPayload) => SessionHistoryResult;
  };
  chat: {
    sendWithMedia: (payload: ChatSendWithMediaPayload) => ChatSendWithMediaResult;
  };
  cron: {
    list: () => CronJob[];
    create: (payload: CronJobCreateInput) => CronJob;
    update: (payload: CronUpdatePayload) => CronJob;
    delete: (payload: CronIdPayload) => HostSuccess;
    toggle: (payload: CronTogglePayload) => HostSuccess;
    trigger: (payload: CronIdPayload) => HostSuccess;
    sessionHistory: (payload: CronSessionHistoryPayload) => CronSessionHistoryResult;
    deliveryTargets: () => DeliveryTargetsResult;
  };
  skills: {
    local: () => LocalSkillsResult;
    configs: () => SkillConfigsResult;
    allConfigs: () => SkillConfigsResult;
    getConfig: (payload: SkillKeyPayload) => JsonRecord | undefined;
    updateConfig: (payload: SkillUpdateConfigPayload) => HostSuccess;
    updateConfigs: (payload: SkillUpdateConfigsPayload) => HostSuccess;
    status: () => SkillsStatusResult;
    update: (payload: SkillUpdatePayload) => HostSuccess;
    quickAccess: (payload: SkillQuickAccessPayload) => HostSuccess & { skills?: QuickAccessSkill[] };
    marketplaceList: () => SkillMarketplaceListResult;
    marketplaceAdminList: (payload?: SkillMarketplaceAdminListPayload) => SkillMarketplaceAdminListResult;
    marketplaceImportPreview: (payload: SkillMarketplaceImportPreviewPayload) => SkillMarketplaceImportPreviewResult;
    marketplaceImportCommit: (payload: SkillMarketplaceImportCommitPayload) => SkillMarketplaceImportCommitResult;
    marketplaceExportCatalog: () => SkillMarketplaceExportResult;
    marketplaceImportCatalog: (payload: SkillMarketplaceImportCatalogPayload) => SkillMarketplaceImportCatalogResult;
    marketplaceReview: (payload: SkillMarketplaceReviewPayload) => SkillMarketplaceMutationResult;
    marketplaceUpdate: (payload: SkillMarketplaceUpdatePayload) => SkillMarketplaceMutationResult;
    marketplaceInstall: (payload: SkillMarketplaceInstallPayload) => SkillMarketplaceInstallResult;
    clawhubCapability: () => ClawHubCapabilityResult;
    clawhubList: () => ClawHubListResult;
    clawhubSearch: (payload: ClawHubSearchPayload) => ClawHubSearchResult;
    clawhubInstall: (payload: ClawHubInstallPayload) => HostSuccess;
    clawhubUninstall: (payload: ClawHubUninstallPayload) => HostSuccess;
    clawhubOpenSkillReadme: (payload: ClawHubOpenPayload) => HostSuccess;
    clawhubOpenSkillPath: (payload: ClawHubOpenPayload) => HostSuccess;
  };
  aiApps: {
    createJob: (payload: AiAppCreateJobPayload) => AiAppJobResult;
    getJob: (payload: AiAppJobPayload) => AiAppJobResult;
    refreshJob: (payload: AiAppJobPayload) => AiAppJobResult;
    videoCapabilities: () => AiAppVideoCapabilitiesResult;
    listResults: (payload?: AiAppListResultsPayload) => AiAppListResultsResult;
  };
  usage: {
    recentTokenHistory: (payload?: UsageHistoryPayload) => UsageHistoryEntry[];
  };
};

export type HostApiModule = keyof HostApiContract & string;
export type HostApiAction<M extends HostApiModule> = keyof HostApiContract[M] & string;
export type HostApiFunction<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = HostApiContract[M][A] extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;
export type HostApiPayload<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Parameters<HostApiFunction<M, A>> extends []
  ? undefined
  : Parameters<HostApiFunction<M, A>>[0];
export type HostApiResult<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Awaited<ReturnType<HostApiFunction<M, A>>>;
export type HostApiPayloadArgs<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Parameters<HostApiFunction<M, A>> extends []
  ? []
  : undefined extends HostApiPayload<M, A>
    ? [payload?: HostApiPayload<M, A>]
    : [payload: HostApiPayload<M, A>];
