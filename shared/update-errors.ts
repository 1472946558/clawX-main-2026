export type UpdateErrorKind =
  | 'missingLatestManifest'
  | 'http404'
  | 'timeout'
  | 'devMode'
  | 'network'
  | 'generic';

export type UpdateErrorSummary = {
  kind: UpdateErrorKind;
  message: string;
};

function coerceErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error == null) return '';
  return String(error);
}

export function classifyUpdateError(error: unknown): UpdateErrorKind {
  const message = coerceErrorMessage(error).toLowerCase();

  if (
    message.includes('latest.yml') &&
    (message.includes('cannot find channel') || message.includes('404') || message.includes('not found'))
  ) {
    return 'missingLatestManifest';
  }

  if (message.includes('update check timed out') || message.includes('timeout')) {
    return 'timeout';
  }

  if (message.includes('dev mode') || message.includes('not packaged')) {
    return 'devMode';
  }

  if (message.includes('404')) {
    return 'http404';
  }

  if (
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('certificate') ||
    message.includes('proxy')
  ) {
    return 'network';
  }

  return 'generic';
}

export function sanitizeUpdateErrorMessage(error: unknown): string {
  const message = coerceErrorMessage(error).trim();
  const kind = classifyUpdateError(message);

  if (kind === 'missingLatestManifest') {
    return 'The update feed is missing latest.yml. Upload latest.yml, the Windows installer, and the blockmap file to the latest GitHub Release, then try again.';
  }

  if (kind === 'http404') {
    return 'The update feed returned 404. Check that the release URL exists and is publicly accessible.';
  }

  if (kind === 'timeout') {
    return 'The update check timed out. Check the network connection or proxy settings, then try again.';
  }

  if (kind === 'devMode') {
    return 'Update checks are only available in the packaged app.';
  }

  if (kind === 'network') {
    return 'The update server could not be reached. Check the network connection or proxy settings, then try again.';
  }

  return message
    .replace(/^Error:\s*/i, '')
    .split(/\n\s*Headers:/i)[0]
    .split(/\n\s*at\s+/)[0]
    .replace(/\s+at\s+[A-Za-z0-9_.<>]+ \([^)]+\)[\s\S]*$/u, '')
    .slice(0, 500);
}

export function summarizeUpdateError(error: unknown): UpdateErrorSummary {
  return {
    kind: classifyUpdateError(error),
    message: sanitizeUpdateErrorMessage(error),
  };
}
