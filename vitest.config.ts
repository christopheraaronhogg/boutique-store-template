import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));
  return {
    resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2026-11-01',
          compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
          d1Databases: ['DB'],
          r2Buckets: ['PHOTOS'],
          kvNamespaces: ['OAUTH_KV'],
          bindings: { TEST_MIGRATIONS: migrations, PUBLIC_URL: 'https://shop.example', STORE_KEY: 'test-store-key-0123456789abcdef0123456789', OWNER_PASSWORD: 'test-owner-password', PAYMENT_DRIVER: 'test', IMAGE_RESIZING: 'off' },
        },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['test/setup.ts'] },
  };
});
