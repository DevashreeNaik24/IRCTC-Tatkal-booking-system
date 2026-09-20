import fs from 'fs';
import path from 'path';

/**
 * Load a Lua script from the scripts directory.
 *
 * The module can execute from several locations depending on how it's run:
 * - tsx dev:   `src/services/...`   → `../scripts` exists
 * - compiled:  `dist/services/...`  → `../scripts` exists (copied by postbuild)
 * - vitest:    `tests/unit/...`     → fall back to `process.cwd()`-relative paths
 */
export function loadLuaScript(name: string): string {
  const candidates = [
    path.join(__dirname, '../scripts', name),
    path.join(process.cwd(), 'src/scripts', name),
    path.join(process.cwd(), 'server/src/scripts', name),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error(`Lua script not found: ${name} (tried ${candidates.join(', ')})`);
}