import type { ChatRuntimeEvent } from '@shared/chat-runtime-events';
import { getDefaultCanvaslandModelPlan, resolveCanvaslandModelPlanFromModelRef } from '@shared/model-plans';
import { HOST_EVENT_CHANNELS } from '@shared/host-events/contract';
import type { BrowserWindow } from 'electron';
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

function safeDirectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

class CanvaslandApiError extends Error {
  errorCode?: string;
  requiredPoints?: number;
  availablePoints?: number;

  constructor(message: string, details: { errorCode?: string; requiredPoints?: number; availablePoints?: number } = {}) {
    super(message);
    this.name = 'CanvaslandApiError';
    this.errorCode = details.errorCode;
    this.requiredPoints = details.requiredPoints;
    this.availablePoints = details.availablePoints;
  }
}

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCanvaslandError(status: number, bodyText: string): CanvaslandApiError {
  let parsed: unknown = null;
  if (bodyText.trim()) {
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      parsed = null;
    }
  }
  const source = isRecord(parsed) ? parsed : {};
  const nested = isRecord(source.error) ? source.error : {};
  const errorCode = typeof source.errorCode === 'string'
    ? source.errorCode
    : typeof nested.errorCode === 'string'
      ? nested.errorCode
      : undefined;
  const requiredPoints = numberField(source, 'requiredPoints') ?? numberField(nested, 'requiredPoints');
  const availablePoints = numberField(source, 'availablePoints') ?? numberField(nested, 'availablePoints');
  const message = typeof source.message === 'string'
    ? source.message
    : typeof nested.message === 'string'
      ? nested.message
      : bodyText.trim() || `HTTP ${status}`;
  if (errorCode === 'POINTS_INSUFFICIENT') {
    const required = requiredPoints ?? 1;
    const available = availablePoints ?? 0;
    return new CanvaslandApiError(`积分不足，本次需要 ${required} 积分，当前可用 ${available} 积分。`, {
      errorCode,
      requiredPoints: required,
      availablePoints: available,
    });
  }
  return new CanvaslandApiError(message, { errorCode, requiredPoints, availablePoints });
}

function emitRuntimeEvent(mainWindow: BrowserWindow | undefined, event: ChatRuntimeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(HOST_EVENT_CHANNELS.chat.runtimeEvent, event);
}

function parseSsePayloads(buffer: string): { payloads: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const payloads = parts.flatMap((part) => {
    const dataLines = part
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    return dataLines.length > 0 ? [dataLines.join('\n')] : [];
  });
  return { payloads, rest };
}

function extractStreamDelta(parsed: unknown): string {
  if (!isRecord(parsed)) return '';
  const choices = parsed.choices;
  if (!Array.isArray(choices)) return '';
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const delta = choice.delta;
    if (isRecord(delta) && typeof delta.content === 'string') return delta.content;
    const message = choice.message;
    if (isRecord(message) && typeof message.content === 'string') return message.content;
    if (typeof choice.text === 'string') return choice.text;
  }
  return '';
}

async function readDirectChatStream(options: {
  response: Response;
  runId: string;
  sessionKey: string;
  mainWindow?: BrowserWindow;
}): Promise<string> {
  const reader = options.response.body?.getReader();
  if (!reader) throw new Error('Direct chat stream is unavailable');
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let seq = 1;

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSsePayloads(buffer);
      buffer = parsed.rest;
      for (const payload of parsed.payloads) {
        if (payload === '[DONE]') continue;
        let chunk: unknown;
        try {
          chunk = JSON.parse(payload) as unknown;
        } catch {
          continue;
        }
        const delta = extractStreamDelta(chunk);
        if (!delta) continue;
        fullText += delta;
        emitRuntimeEvent(options.mainWindow, {
          type: 'assistant.delta',
          runId: options.runId,
          sessionKey: options.sessionKey,
          seq: seq++,
          ts: Date.now(),
          delta,
        });
      }
    }
    if (done) break;
  }

  return fullText.trim();
}

export function createChatApi({ gatewayManager, mainWindow }: { gatewayManager: GatewayManager; mainWindow?: BrowserWindow }): CompleteHostServiceRegistry['chat'] {
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
      const runId = `direct-${randomUUID()}`;
      emitRuntimeEvent(mainWindow, {
        type: 'run.started',
        runId,
        sessionKey,
        startedAt: Date.now(),
        ts: Date.now(),
      });

      void (async () => {
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
              stream: true,
              stream_options: { include_usage: true },
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
          if (!response.ok) {
            const text = await response.text();
            throw parseCanvaslandError(response.status, text);
          }
          const content = await readDirectChatStream({ response, runId, sessionKey, mainWindow });
          if (!content) {
            throw new Error('Direct chat returned an empty assistant response');
          }
          emitRuntimeEvent(mainWindow, {
            type: 'run.ended',
            runId,
            sessionKey,
            status: 'completed',
            endedAt: Date.now(),
            ts: Date.now(),
            stopReason: 'canvasland-direct',
          });
        } catch (error) {
          logger.error(`[chat:sendDirect] Error: ${safeDirectErrorMessage(error)}`);
          const canvaslandError = error instanceof CanvaslandApiError ? error : null;
          emitRuntimeEvent(mainWindow, {
            type: 'run.ended',
            runId,
            sessionKey,
            status: 'error',
            error: safeDirectErrorMessage(error),
            errorCode: canvaslandError?.errorCode,
            requiredPoints: canvaslandError?.requiredPoints,
            availablePoints: canvaslandError?.availablePoints,
            endedAt: Date.now(),
            ts: Date.now(),
            stopReason: 'canvasland-direct',
          });
        } finally {
          clearTimeout(timeout);
        }
      })();

      return { success: true, result: { runId } };
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
