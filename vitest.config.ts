import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws when imported outside a Next server context; stub
      // it so modules that import it (e.g. src/lib/markdown.ts) are testable.
      'server-only': resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
