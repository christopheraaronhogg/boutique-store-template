import type { Settings } from '$lib/settings';
import type { Bag } from '$lib/server/bag';
import type { StoreEnv } from '$lib/server/mcp/env';

declare global {
  interface Uint8ArrayConstructor {
    fromBase64(text: string, options?: { alphabet?: 'base64' | 'base64url'; lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial' }): Uint8Array<ArrayBuffer>;
  }
  namespace App {
    interface Platform {
      env: StoreEnv;
    }
    interface Locals {
      settings: Settings;
      bag: Bag;
      db: D1Database;
      owner: boolean;
    }
  }
}

export {};
