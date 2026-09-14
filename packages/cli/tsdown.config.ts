import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { main: 'src/main.ts', bin: 'src/bin.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  platform: 'node',
});
