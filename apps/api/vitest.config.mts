import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NEXTAUTH_SECRET: 'test-secret',
      DATABASE_URL: 'postgres://mock:mock@localhost:5432/mock',
    },
  },
});
