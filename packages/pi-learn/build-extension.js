/**
 * Build script for pi-learn extension bundle
 * Produces an ESM bundle (.mjs) that pi can load
 */

import { build } from 'esbuild';

await build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: './dist/index.mjs',
  external: [
    'sql.js',
    '@mariozechner/pi-coding-agent',
    '@mariozechner/pi-tui',
    '@sinclair/typebox',
    '@0xkobold/pi-ollama',
    'path',
    'fs',
    'os',
    'node:crypto',
    'node:path',
    'node:fs',
    'node:os'
  ],
  banner: {
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`
  }
});

console.log('Built index.mjs');
