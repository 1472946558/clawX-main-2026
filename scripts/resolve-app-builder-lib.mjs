import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

const require = createRequire(import.meta.url);

export function resolveAppBuilderLibRoot() {
  try {
    return dirname(require.resolve('app-builder-lib/package.json'));
  } catch {
    const electronBuilderPackage = require.resolve('electron-builder/package.json');
    const marker = `${sep}node_modules${sep}.pnpm${sep}`;
    const markerIndex = electronBuilderPackage.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error('Cannot locate pnpm virtual store for app-builder-lib');
    }

    const pnpmRoot = electronBuilderPackage.slice(0, markerIndex + marker.length - 1);
    const entry = readdirSync(pnpmRoot).find((name) => name.startsWith('app-builder-lib@'));
    if (!entry) {
      throw new Error(`Cannot find app-builder-lib in ${pnpmRoot}`);
    }

    const candidate = join(pnpmRoot, entry, 'node_modules', 'app-builder-lib');
    if (!existsSync(join(candidate, 'package.json'))) {
      throw new Error(`Invalid app-builder-lib package at ${candidate}`);
    }
    return candidate;
  }
}
