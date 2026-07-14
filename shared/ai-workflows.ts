export type AiWorkflowOutputType = 'text' | 'image' | 'video';
export type AiWorkflowProviderCapability = 'chat' | 'image' | 'video';

export type AiWorkflowBillingTier = {
  id: string;
  points: number;
  nameKey: string;
  descriptionKey: string;
  benefitKeys: string[];
};

export type AiWorkflowInputField = {
  key: string;
  type: 'text' | 'textarea' | 'select' | 'image[]' | 'ratio';
  required: boolean;
  labelKey: string;
  placeholderKey?: string;
  options?: string[];
};

export type AiWorkflowInputSchema = {
  fields: AiWorkflowInputField[];
};

export type AiWorkflowDefinition = {
  id: string;
  name: string;
  nameKey: string;
  description: string;
  descriptionKey: string;
  category: 'ecommerce';
  icon: 'copy' | 'image' | 'video';
  tags: string[];
  inputTypes: string[];
  outputTypes: string[];
  inputSchema: AiWorkflowInputSchema;
  outputType: AiWorkflowOutputType;
  providerCapability: AiWorkflowProviderCapability;
  promptTemplate: string;
  defaultModel: string;
  supportedRatios: string[];
  acceptsReferenceImages: boolean;
  asyncTask: boolean;
  billingTiers: AiWorkflowBillingTier[];
  defaultBillingTierId: string;
  sortOrder: number;
};

const COMMON_RATIOS = ['1:1', '2:3', '3:4', '4:3', '16:9', '9:16'];

export const AI_WORKFLOWS: AiWorkflowDefinition[] = [
  {
    id: 'ecommerce-copywriting',
    name: 'Ecommerce Copywriting',
    nameKey: 'apps.copywriting.title',
    description: 'Generate product titles, selling points, detail-page copy, and short-video hooks from real product inputs.',
    descriptionKey: 'apps.copywriting.description',
    category: 'ecommerce',
    icon: 'copy',
    tags: ['copywriting', 'sellingPoint'],
    inputTypes: ['productName', 'sellingPoints', 'platform'],
    outputTypes: ['titleCopy', 'sellingPointCopy', 'detailCopy'],
    inputSchema: {
      fields: [
        { key: 'productName', type: 'text', required: true, labelKey: 'workbench.productName', placeholderKey: 'workbench.productNamePlaceholder' },
        { key: 'sellingPoints', type: 'textarea', required: true, labelKey: 'workbench.coreSellingPoints', placeholderKey: 'workbench.sellingPointsPlaceholder' },
        { key: 'platform', type: 'select', required: true, labelKey: 'workbench.targetPlatform', options: ['taobao', 'tmall', 'jd', 'pdd'] },
        { key: 'brandTone', type: 'text', required: false, labelKey: 'workbench.brandTone', placeholderKey: 'workbench.brandTonePlaceholder' },
        { key: 'targetAudience', type: 'text', required: false, labelKey: 'workbench.targetAudience', placeholderKey: 'workbench.targetAudiencePlaceholder' },
        { key: 'useScene', type: 'text', required: false, labelKey: 'workbench.usageScenario', placeholderKey: 'workbench.usageScenarioPlaceholder' },
      ],
    },
    outputType: 'text',
    providerCapability: 'chat',
    promptTemplate: [
      '产品名称：{{productName}}',
      '核心卖点：{{sellingPoints}}',
      '平台规则：{{platformRule}}',
      '品牌语气：{{brandTone}}',
      '目标人群：{{targetAudience}}',
      '使用场景：{{useScene}}',
      '任务：返回严格 JSON，包含 titleOptions、sellingPoints、detailPage、videoScript 和 keywords。',
    ].join('\n'),
    defaultModel: 'default-chat-provider-model',
    supportedRatios: [],
    acceptsReferenceImages: false,
    asyncTask: false,
    billingTiers: [
      { id: 'short', points: 10, nameKey: 'billing.copy.short.name', descriptionKey: 'billing.copy.short.description', benefitKeys: ['billing.benefits.fast'] },
      { id: 'social', points: 15, nameKey: 'billing.copy.social.name', descriptionKey: 'billing.copy.social.description', benefitKeys: ['billing.benefits.multiVersion', 'billing.benefits.fast'] },
      { id: 'long', points: 20, nameKey: 'billing.copy.long.name', descriptionKey: 'billing.copy.long.description', benefitKeys: ['billing.benefits.longForm', 'billing.benefits.commercial'] },
      { id: 'deep', points: 30, nameKey: 'billing.copy.deep.name', descriptionKey: 'billing.copy.deep.description', benefitKeys: ['billing.benefits.deepStrategy', 'billing.benefits.priority'] },
    ],
    defaultBillingTierId: 'social',
    sortOrder: 10,
  },
  {
    id: 'detail-poster-generator',
    name: 'Detail Poster Generator',
    nameKey: 'apps.detailPosterGenerator.title',
    description: 'Generate ecommerce detail images and posters from a product brief, optional reference image, ratio, and image model.',
    descriptionKey: 'apps.detailPosterGenerator.description',
    category: 'ecommerce',
    icon: 'image',
    tags: ['detailImage', 'poster'],
    inputTypes: ['productImage', 'referenceImage', 'brief'],
    outputTypes: ['detailImage', 'poster'],
    inputSchema: {
      fields: [
        { key: 'referenceImages', type: 'image[]', required: false, labelKey: 'workbench.referenceImages' },
        { key: 'prompt', type: 'textarea', required: true, labelKey: 'workbench.productDescription', placeholderKey: 'workbench.productDescriptionPlaceholder' },
        { key: 'ratio', type: 'ratio', required: true, labelKey: 'workbench.aspectRatio' },
        { key: 'model', type: 'select', required: true, labelKey: 'workbench.model', options: ['image-01', 'image-01-live'] },
      ],
    },
    outputType: 'image',
    providerCapability: 'image',
    promptTemplate: [
      '应用：详情图/详情海报生成',
      '商品说明：{{prompt}}',
      '平台规则：{{platformRule}}',
      '画面比例：{{ratio}}',
      '任务：生成商品详情图/详情海报方案，包含版式、主视觉、卖点模块、图片提示词和合规注意事项。',
    ].join('\n'),
    defaultModel: 'image-01',
    supportedRatios: COMMON_RATIOS,
    acceptsReferenceImages: true,
    asyncTask: false,
    billingTiers: [
      { id: 'standard', points: 30, nameKey: 'billing.image.standard.name', descriptionKey: 'billing.image.standard.description', benefitKeys: ['billing.benefits.commercial', 'billing.benefits.noWatermark'] },
      { id: 'pro', points: 60, nameKey: 'billing.image.pro.name', descriptionKey: 'billing.image.pro.description', benefitKeys: ['billing.benefits.proQuality', 'billing.benefits.priority', 'billing.benefits.noWatermark'] },
    ],
    defaultBillingTierId: 'standard',
    sortOrder: 20,
  },
  {
    id: 'product-short-video',
    name: 'Product Short Video',
    nameKey: 'apps.shortVideo.title',
    description: 'Create an asynchronous product short-video task with provider task id, status refresh, and final video URL.',
    descriptionKey: 'apps.shortVideo.description',
    category: 'ecommerce',
    icon: 'video',
    tags: ['videoGeneration', 'scenarioVideo'],
    inputTypes: ['productImage', 'script', 'scenario'],
    outputTypes: ['videoScript', 'storyboard', 'video'],
    inputSchema: {
      fields: [
        { key: 'productText', type: 'textarea', required: true, labelKey: 'workbench.productText', placeholderKey: 'workbench.productTextPlaceholder' },
        { key: 'sellingPoints', type: 'textarea', required: true, labelKey: 'workbench.coreSellingPoints', placeholderKey: 'workbench.sellingPointsPlaceholder' },
        { key: 'platform', type: 'select', required: true, labelKey: 'workbench.targetPlatform', options: ['taobao', 'tmall', 'jd', 'pdd', 'douyin', 'xiaohongshu'] },
        { key: 'ratio', type: 'ratio', required: true, labelKey: 'workbench.aspectRatio' },
        { key: 'videoModel', type: 'select', required: true, labelKey: 'workbench.model' },
      ],
    },
    outputType: 'video',
    providerCapability: 'video',
    promptTemplate: [
      '商品文本：{{productText}}',
      '核心卖点：{{sellingPoints}}',
      '平台规则：{{platformRule}}',
      '画面比例：{{ratio}}',
      '任务：生成可直接用于电商投放的 720P 商品短视频，突出真实商品卖点，并遵守目标平台合规规则。',
    ].join('\n'),
    defaultModel: 'seedance-2.0-720p',
    supportedRatios: ['16:9', '9:16'],
    acceptsReferenceImages: true,
    asyncTask: true,
    billingTiers: [
      { id: 'basic', points: 300, nameKey: 'billing.video.basic.name', descriptionKey: 'billing.video.basic.description', benefitKeys: ['billing.benefits.shortVideo', 'billing.benefits.commercial'] },
      { id: 'pro', points: 500, nameKey: 'billing.video.pro.name', descriptionKey: 'billing.video.pro.description', benefitKeys: ['billing.benefits.hd', 'billing.benefits.priority', 'billing.benefits.noWatermark'] },
      { id: 'master', points: 600, nameKey: 'billing.video.master.name', descriptionKey: 'billing.video.master.description', benefitKeys: ['billing.benefits.masterQuality', 'billing.benefits.fastest', 'billing.benefits.noWatermark'] },
    ],
    defaultBillingTierId: 'basic',
    sortOrder: 30,
  },
];

export function listAiWorkflowDefinitions(): AiWorkflowDefinition[] {
  return [...AI_WORKFLOWS].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getAiWorkflowDefinition(id: string): AiWorkflowDefinition | undefined {
  return AI_WORKFLOWS.find((workflow) => workflow.id === id);
}
