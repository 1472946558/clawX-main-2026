import { describe, expect, it } from 'vitest';
import {
  classifyUpdateError,
  sanitizeUpdateErrorMessage,
  summarizeUpdateError,
} from '@shared/update-errors';

describe('update error helpers', () => {
  it('classifies a missing latest.yml update feed error', () => {
    const error = new Error(
      'Cannot find channel "latest.yml" update info: HttpError: 404\nHeaders: {"set-cookie":["secret"]}\n    at ElectronHttpExecutor.handleResponse',
    );

    expect(classifyUpdateError(error)).toBe('missingLatestManifest');
  });

  it('replaces raw updater headers and stack traces with a safe message', () => {
    const error = new Error(
      'Cannot find channel "latest.yml" update info: HttpError: 404\nHeaders: {"set-cookie":["secret"]}\n    at ElectronHttpExecutor.handleResponse',
    );

    const message = sanitizeUpdateErrorMessage(error);

    expect(message).toContain('latest.yml');
    expect(message).toContain('GitHub Release');
    expect(message).not.toContain('set-cookie');
    expect(message).not.toContain('ElectronHttpExecutor');
  });

  it('keeps unknown update errors short and strips stack frames', () => {
    const message = sanitizeUpdateErrorMessage(
      'Error: boom\n    at AppUpdater.checkForUpdates (/tmp/app/electron/main/updater.ts:1:1)',
    );

    expect(message).toBe('boom');
  });

  it('returns both the kind and sanitized message', () => {
    expect(summarizeUpdateError('Update check timed out')).toEqual({
      kind: 'timeout',
      message: 'The update check timed out. Check the network connection or proxy settings, then try again.',
    });
  });
});
