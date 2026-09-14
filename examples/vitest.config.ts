import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'examples',
    include: ['**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
