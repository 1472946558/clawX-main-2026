import { describe, expect, it } from 'vitest';
import { extractText } from '@/pages/Chat/message-utils';
import { matchesOptimisticUserMessage } from '@/stores/chat/helpers';

const gatewayImageEcho = [
  'Sender (untrusted metadata):',
  '```json',
  '{',
  '  "label": "ClawX (gateway-client)",',
  '  "id": "gateway-client",',
  '  "name": "ClawX",',
  '  "username": "ClawX"',
  '}',
  '```',
  '',
  '[media attached: media://inbound/image---abc.png (image/png)]',
  '[Image]',
  'User text:',
  'Process the attached file(s).',
  '[media attached: /Users/test/.openclaw/media/outbound/out.png (image/png) | /Users/test/.openclaw/media/outbound/out.png]',
  'Description:',
  'An astronaut in a white space suit floats in space, reaching a gloved hand toward the viewer.',
].join('\n');

describe('user message display cleanup', () => {
  it('hides the inbound-image vision envelope for attachment-only uploads', () => {
    expect(extractText({ role: 'user', content: gatewayImageEcho })).toBe('');
  });

  it('keeps the user caption while stripping auto-generated description', () => {
    const content = gatewayImageEcho
      .replace('Process the attached file(s).', '改成西装加领带');

    expect(extractText({ role: 'user', content })).toBe('改成西装加领带');
  });

  it('matches optimistic attachment-only bubbles against the gateway vision echo', () => {
    const optimistic = {
      role: 'user' as const,
      content: '(file attached)',
      timestamp: 1_700_000_000,
      _attachedFiles: [{
        fileName: 'out.png',
        mimeType: 'image/png',
        fileSize: 123,
        preview: null,
        filePath: '/Users/test/.openclaw/media/outbound/out.png',
      }],
    };
    const candidate = {
      role: 'user' as const,
      content: gatewayImageEcho,
      timestamp: 1_700_000_000,
    };

    expect(matchesOptimisticUserMessage(candidate, optimistic, 1_700_000_000_000)).toBe(true);
  });
});
