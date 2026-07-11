export type EcommercePlatform = 'taobao' | 'tmall' | 'jd' | 'pdd' | 'douyin';

export type EcommercePlatformRule = {
  id: EcommercePlatform;
  titleMaxLength: number;
  titleFormula: string[];
  imageRatios: string[];
  videoRatios: string[];
  videoDurationSeconds: [number, number];
  forbiddenClaims: string[];
  notes: string[];
};

const COMMON_FORBIDDEN_CLAIMS = [
  '最',
  '第一',
  '全网最低',
  '绝对',
  '永久',
  '根治',
  '100%',
];

export const ECOMMERCE_PLATFORM_RULES: Record<EcommercePlatform, EcommercePlatformRule> = {
  taobao: {
    id: 'taobao',
    titleMaxLength: 60,
    titleFormula: ['核心搜索词', '商品品类', '核心卖点', '属性规格', '适用场景'],
    imageRatios: ['1:1', '3:4', '4:3', '9:16'],
    videoRatios: ['9:16', '16:9', '1:1'],
    videoDurationSeconds: [6, 30],
    forbiddenClaims: COMMON_FORBIDDEN_CLAIMS,
    notes: ['标题避免堆砌重复关键词', '主图主体清晰', '详情图按卖点、材质、场景、对比组织'],
  },
  tmall: {
    id: 'tmall',
    titleMaxLength: 60,
    titleFormula: ['品牌', '商品品类', '型号规格', '核心卖点', '适用人群'],
    imageRatios: ['1:1', '3:4', '4:3'],
    videoRatios: ['9:16', '16:9'],
    videoDurationSeconds: [6, 30],
    forbiddenClaims: COMMON_FORBIDDEN_CLAIMS,
    notes: ['品牌和规格表达要准确', '图片风格需统一且少干扰文字', '避免未经证明的功效承诺'],
  },
  jd: {
    id: 'jd',
    titleMaxLength: 60,
    titleFormula: ['品牌', '商品名称', '型号规格', '关键参数', '核心卖点'],
    imageRatios: ['1:1', '4:3', '3:4'],
    videoRatios: ['16:9', '9:16'],
    videoDurationSeconds: [6, 30],
    forbiddenClaims: COMMON_FORBIDDEN_CLAIMS,
    notes: ['标题偏参数化和规范化', '详情图突出参数、细节、对比', '视频适合开箱、功能、使用演示'],
  },
  pdd: {
    id: 'pdd',
    titleMaxLength: 60,
    titleFormula: ['品类词', '强卖点', '人群', '场景', '规格'],
    imageRatios: ['1:1', '3:4', '9:16'],
    videoRatios: ['9:16', '1:1'],
    videoDurationSeconds: [5, 20],
    forbiddenClaims: COMMON_FORBIDDEN_CLAIMS,
    notes: ['主图强调转化但不得虚假宣传', '卖点图要直接', '视频节奏短平快，突出使用场景'],
  },
  douyin: {
    id: 'douyin',
    titleMaxLength: 60,
    titleFormula: ['短视频场景词', '商品品类', '核心卖点', '人群', '行动理由'],
    imageRatios: ['1:1', '3:4', '9:16'],
    videoRatios: ['9:16'],
    videoDurationSeconds: [5, 15],
    forbiddenClaims: COMMON_FORBIDDEN_CLAIMS,
    notes: ['短视频前三秒必须明确场景或痛点', '避免夸张功效和不可验证承诺', '封面文案简短直接'],
  },
};

export function resolveEcommercePlatformRule(platform: unknown): EcommercePlatformRule {
  return typeof platform === 'string' && platform in ECOMMERCE_PLATFORM_RULES
    ? ECOMMERCE_PLATFORM_RULES[platform as EcommercePlatform]
    : ECOMMERCE_PLATFORM_RULES.taobao;
}

export function buildPlatformRulePrompt(rule: EcommercePlatformRule): string {
  return [
    `平台：${rule.id}`,
    `标题长度上限：${rule.titleMaxLength} 字符以内`,
    `标题结构：${rule.titleFormula.join(' + ')}`,
    `建议图片比例：${rule.imageRatios.join('、')}`,
    `建议视频比例：${rule.videoRatios.join('、')}`,
    `建议视频时长：${rule.videoDurationSeconds[0]}-${rule.videoDurationSeconds[1]} 秒`,
    `禁止/高风险表述：${rule.forbiddenClaims.join('、')}`,
    `运营注意事项：${rule.notes.join('；')}`,
  ].join('\n');
}
