export type CanvaslandModelPlanId =
  | 'gpt-5.4'
  | 'gpt-5.5'
  | 'qwen3.6-plus'
  | 'qwen3.7-max';

export interface CanvaslandModelPlan {
  id: CanvaslandModelPlanId;
  label: string;
  runtimeModel: string;
  upstreamEnvVar: string;
  pointsPer1kInputTokens: number;
  pointsPer1kOutputTokens: number;
}

export const CANVASLAND_RUNTIME_PROVIDER_KEY = 'canvasland-newapi';

export const CANVASLAND_MODEL_PLANS: CanvaslandModelPlan[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    runtimeModel: 'gpt-5.4',
    upstreamEnvVar: 'CANVASLAND_MODEL_GPT54_API_KEY',
    pointsPer1kInputTokens: 1,
    pointsPer1kOutputTokens: 4,
  },
  {
    id: 'gpt-5.5',
    label: 'GPT 5.5',
    runtimeModel: 'gpt-5.5',
    upstreamEnvVar: 'CANVASLAND_MODEL_GPT55_API_KEY',
    pointsPer1kInputTokens: 1,
    pointsPer1kOutputTokens: 5,
  },
  {
    id: 'qwen3.6-plus',
    label: 'Qwen 3.6 Plus',
    runtimeModel: 'qwen3.6-plus',
    upstreamEnvVar: 'CANVASLAND_MODEL_QWEN36PLUS_API_KEY',
    pointsPer1kInputTokens: 2,
    pointsPer1kOutputTokens: 8,
  },
  {
    id: 'qwen3.7-max',
    label: 'Qwen 3.7 Max',
    runtimeModel: 'qwen3.7-max',
    upstreamEnvVar: 'CANVASLAND_MODEL_QWEN37MAX_API_KEY',
    pointsPer1kInputTokens: 2,
    pointsPer1kOutputTokens: 10,
  },
];

export const DEFAULT_CANVASLAND_MODEL_PLAN_ID: CanvaslandModelPlanId = 'gpt-5.4';

export function getCanvaslandModelPlan(id: string | null | undefined): CanvaslandModelPlan | undefined {
  return CANVASLAND_MODEL_PLANS.find((plan) => plan.id === id);
}

export function getDefaultCanvaslandModelPlan(): CanvaslandModelPlan {
  return getCanvaslandModelPlan(DEFAULT_CANVASLAND_MODEL_PLAN_ID) ?? CANVASLAND_MODEL_PLANS[0];
}

export function buildCanvaslandModelRef(planId: string | null | undefined): string {
  const plan = getCanvaslandModelPlan(planId) ?? getDefaultCanvaslandModelPlan();
  return `${CANVASLAND_RUNTIME_PROVIDER_KEY}/${plan.runtimeModel}`;
}

export function resolveCanvaslandModelPlanFromModelRef(modelRef: string | null | undefined): CanvaslandModelPlan | undefined {
  const value = modelRef?.trim();
  if (!value?.startsWith(`${CANVASLAND_RUNTIME_PROVIDER_KEY}/`)) return undefined;
  const runtimeModel = value.slice(CANVASLAND_RUNTIME_PROVIDER_KEY.length + 1);
  return CANVASLAND_MODEL_PLANS.find((plan) => plan.runtimeModel === runtimeModel);
}
