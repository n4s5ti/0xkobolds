import { build } from 'esbuild';

await build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: './dist/index.cjs',
  external: [
    'sql.js',
    '@mariozechner/pi-coding-agent',
    '@mariozechner/pi-tui', 
    '@sinclair/typebox',
    '@0xkobold/pi-ollama',
    'path',
    'fs',
    'os',
    'node:crypto'
  ],
  banner: {
    js: 'const crypto = require("node:crypto");'
  }
});

console.log('Built index.cjs');
