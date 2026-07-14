import type { RawMessage } from '@shared/chat/types';
import { getDefaultCanvaslandModelPlan, resolveCanvaslandModelPlanFromModelRef } from '@shared/model-plans';
import { randomUUID } from 'node:crypto';
import type { GatewayManager } from '../gateway/manager';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { logger } from '../utils/logger';
import { proxyAwareFetch } from '../utils/proxy-fetch';
import { isRecord } from './payload-utils';

const CANVASLAND_CHAT_COMPLETIONS_URL = 'https://apitoken.unihuax.com/v1/chat/completions';

const VISION_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/bmp',
  'image/webp',
]);

type ChatSendWithMediaPayload = {
  sessionKey?: unknown;
  message?: unknown;
  deliver?: unknown;
  idempotencyKey?: unknown;
  media?: unknown;
};

type MediaPayload = {
  filePath?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
};

type ChatDirectPayload = {
  sessionKey?: unknown;
  message?: unknown;
  idempotencyKey?: unknown;
  modelRef?: unknown;
  context?: unknown;
};

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function normalizeMedia(media: unknown): Array<{ filePath: string; mimeType: string; fileName: string }> {
  if (!Array.isArray(media)) return [];
  return media.flatMap((entry): Array<{ filePath: string; mimeType: string; fileName: string }> => {
    if (!isRecord(entry)) return [];
    const item = entry as MediaPayload;
    if (typeof item.filePath !== 'string' || !item.filePath) return [];
    return [{
      filePath: item.filePath,
      mimeType: typeof item.mimeType === 'string' && item.mimeType ? item.mimeType : 'application/octet-stream',
      fileName: typeof item.fileName === 'string' && item.fileName ? item.fileName : item.filePath.split(/[\\/]/).pop() || 'file',
    }];
  });
}

function normalizeDirectContext(context: unknown): ChatCompletionMessage[] {
  if (!Array.isArray(context)) return [];
  return context.flatMap((entry): ChatCompletionMessage[] => {
    if (!isRecord(entry)) return [];
    const role = entry.role;
    const content = entry.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return [];
    const trimmed = content.trim();
    if (!trimmed) return [];
    return [{ role, content: trimmed }];
  }).slice(-12);
}

function extractAssistantText(parsed: unknown): string {
  if (!isRecord(parsed)) return '';
  const choices = parsed.choices;
  if (!Array.isArray(choices)) return '';
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const message = choice.message;
    if (isRecord(message) && typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
    if (typeof choice.text === 'string' && choice.text.trim()) {
      return choice.text.trim();
    }
  }
  return '';
}

function extractPointsUsed(parsed: unknown): number | undefined {
  if (!isRecord(parsed)) return undefined;
  const usage = parsed.canvasland_usage;
  if (!isRecord(usage)) return undefined;
  const value = usage.pointsUsed ?? usage.points_used;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeDirectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

export function createChatApi({ gatewayManager }: { gatewayManager: GatewayManager }): CompleteHostServiceRegistry['chat'] {
  return {
    sendDirect: async (payload) => {
      const body = isRecord(payload) ? payload as ChatDirectPayload : {};
      const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
      if (!sessionKey || !message || !idempotencyKey) {
        return { success: false, error: 'Invalid direct chat payload' };
      }

      const plan = typeof body.modelRef === 'string'
        ? resolveCanvaslandModelPlanFromModelRef(body.modelRef) ?? getDefaultCanvaslandModelPlan()
        : getDefaultCanvaslandModelPlan();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      try {
        const response = await proxyAwareFetch(CANVASLAND_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-request-id': idempotencyKey,
          },
          body: JSON.stringify({
            model: plan.runtimeModel,
            stream: false,
            messages: [
              {
                role: 'system',
                content: 'You are canvasland, a concise and helpful desktop AI assistant. Reply directly to the user.',
              },
              ...normalizeDirectContext(body.context),
              { role: 'user', content: message },
            ],
          }),
          signal: controller.signal,
        });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) as unknown : null;
        if (!response.ok) {
          const apiMessage = isRecord(parsed) && typeof parsed.message === 'string'
            ? parsed.message
            : `HTTP ${response.status}`;
          throw new Error(apiMessage);
        }
        const content = extractAssistantText(parsed);
        if (!content) {
          throw new Error('Direct chat returned an empty assistant response');
        }
        const id = isRecord(parsed) && typeof parsed.id === 'string' ? parsed.id : randomUUID();
        const assistantMessage: RawMessage = {
          role: 'assistant',
          content,
          timestamp: Date.now() / 1000,
          id,
        };
        return {
          success: true,
          message: assistantMessage,
          pointsUsed: extractPointsUsed(parsed),
        };
      } catch (error) {
        logger.error(`[chat:sendDirect] Error: ${safeDirectErrorMessage(error)}`);
        return { success: false, error: safeDirectErrorMessage(error) };
      } finally {
        clearTimeout(timeout);
      }
    },

    sendWithMedia: async (payload) => {
      const body = isRecord(payload) ? payload as ChatSendWithMediaPayload : {};
      const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : '';
      const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
      if (!sessionKey || !idempotencyKey) {
        return { success: false, error: 'Invalid chat send payload' };
      }

      try {
        let message = typeof body.message === 'string' ? body.message : '';
        const imageAttachments: Array<Record<string, unknown>> = [];
        const fileReferences: string[] = [];
        const media = normalizeMedia(body.media);

        if (media.length > 0) {
          const fsP = await import('node:fs/promises');
          for (const item of media) {
            const exists = await fsP.access(item.filePath).then(() => true, () => false);
            logger.info(
              `[chat:sendWithMedia] Processing file: ${item.fileName} (${item.mimeType}), path: ${item.filePath}, exists: ${exists}, isVision: ${VISION_MIME_TYPES.has(item.mimeType)}`,
            );

            fileReferences.push(
              `[media attached: ${item.filePath} (${item.mimeType}) | ${item.filePath}]`,
            );

            if (VISION_MIME_TYPES.has(item.mimeType)) {
              const fileBuffer = await fsP.readFile(item.filePath);
              const base64Data = fileBuffer.toString('base64');
              logger.info(`[chat:sendWithMedia] Read ${fileBuffer.length} bytes, base64 length: ${base64Data.length}`);
              imageAttachments.push({
                content: base64Data,
                mimeType: item.mimeType,
                fileName: item.fileName,
              });
            }
          }
        }

        if (fileReferences.length > 0) {
          const refs = fileReferences.join('\n');
          message = message ? `${message}\n\n${refs}` : refs;
        }

        const rpcParams: Record<string, unknown> = {
          sessionKey,
          message,
          deliver: body.deliver ?? false,
          idempotencyKey,
        };
        if (imageAttachments.length > 0) {
          rpcParams.attachments = imageAttachments;
        }

        logger.info(
          `[chat:sendWithMedia] Sending: message="${message.substring(0, 100)}", attachments=${imageAttachments.length}, fileRefs=${fileReferences.length}`,
        );
        const result = await gatewayManager.rpc('chat.send', rpcParams, 120000);
        logger.info(`[chat:sendWithMedia] RPC result: ${JSON.stringify(result)}`);
        const response = isRecord(result) && typeof result.runId === 'string'
          ? { runId: result.runId }
          : undefined;
        return { success: true, ...(response ? { result: response } : {}) };
      } catch (error) {
        logger.error(`[chat:sendWithMedia] Error: ${String(error)}`);
        return { success: false, error: String(error) };
      }
    },
  };
}
