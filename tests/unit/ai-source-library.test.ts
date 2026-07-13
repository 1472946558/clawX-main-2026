import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type AiSourceLibrary = {
  sources: Array<{
    id: string;
    license: string;
    commercialUseAllowed: boolean;
    integrationDecision: string;
  }>;
};

describe('Canvasland AI Source Library', () => {
  it('records commercial-use decisions for AI app and skill references', () => {
    const library = JSON.parse(readFileSync(join(process.cwd(), 'resources/ai/source-library.json'), 'utf8')) as AiSourceLibrary;
    const byId = new Map(library.sources.map((source) => [source.id, source]));

    expect(byId.get('open-picsetai')).toMatchObject({
      license: 'MIT',
      commercialUseAllowed: true,
      integrationDecision: 'reference_only',
    });
    expect(byId.get('ai-ecommerce-agent-skills')).toMatchObject({
      license: 'CC-BY-NC-4.0',
      commercialUseAllowed: false,
      integrationDecision: 'blocked_for_commercial',
    });
  });
});
